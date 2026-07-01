# VELÍN_ARCHITECTURE.md — Cílová architektura Velínu

> Vznik 2026-06-27 na základě požadavku Pavla: Velín rostl postupně podle aktuální
> potřeby, dnes má duplicity a nekonzistence. Tento dokument je živá koncepce —
> analýza + cílový stav + priority. Aktualizuje se průběžně, neimplementuje se
> najednou. Detailní audit datových struktur je v `CODE_AUDIT.md` (zastaralý,
> nahradit při příští větší revizi), byznys pravidla v `CLAUDE.md`.

---

## 1. Zjištěný stav (audit 2026-06-27)

Velín má dnes 9 hlavních sekcí (`#adm-dashboard`, `#adm-posnet`, `#adm-import`,
`#adm-alerts`, `#adm-foto`, `#adm-redakce`, `#adm-ai`, `#adm-editor` se 7
pod-sekcemi, `#adm-schvaleni`), 10 modalů/drawerů a 57 `render*` funkcí v
`js/app.js` (6 453 řádků). Vznikalo to přírůstkově — funkčně to drží, ale
najeté patterny se neopakovaně sjednotily.

### 1.1 Fotky — 6 oddělených implementací
| # | Co | Storage | Filtrovatelné? |
|---|---|---|---|
| 1 | Visit photos (příchod/odchod/pokladna/plánogram) | localStorage `visitstate_*` + Supabase `visit-photos` bucket + `photos_meta` | Ne (jen v rámci POS+týdne) |
| 2 | Merch photo (per položka osazení) | `merch_{posId}_{date}` (base64 inline) | Ne |
| 3 | Task evidence photos (servisní/tracked úkol) | `task_pool` → `evidence.photos[]` | Ne |
| 4 | Checklist „photo" otázka | jen `pending` stav, fotka se NEukládá | — |
| 5 | Admin Foto dashboard | agregace #1 přes týden | Ne |
| 6 | Admin Live dashboard photos | stejný zdroj jako #5 | Ne |

**Žádné z toho neumí to, co chce Pavel: filtrovat podle POS, řetězce, návštěvy,
kampaně, úkolu, technika nebo data napříč celým systémem.** Datové tvary jsou
různé (slot+metadata / item-name / evidence-array), ale všechny mají
url+timestamp+posId jako společný základ.

### 1.2 Úkoly — dva paralelní systémy bez synchronizace
- `admin_tasks` (legacy) — broadcast „on-place" úkol pro skupinu/region/POS,
  injektuje se do `posData[posId].taskState`. Technik ho vidí v `renderTasks()`.
- `task_pool` (TaskEngine, novější) — sledovaný úkol s plnou historií, evidencí
  (foto/GPS/komentář), stavovým automatem. Technik ho vidí v `renderTrackedTasks()`.

Technik dnes vidí **oba seznamy pod sebou**, Velín edituje **oba zvlášť**
(Redakce má dvě nezávislé sekce). Žádný úkol nepřejde z jednoho systému do
druhého.

### 1.3 POS detail — dvě nezávislé implementace nad stejnými daty
- Technik: `openDetail()` — fullscreen modal (check-in, merch, úkoly, fotky).
- Velín: `showAdminPOSDetail()` — slide-up drawer (terminály, historie, kampaně).

Sdílí data (kampaně, inventory), ale ne render kód — změna struktury POS dat
= dvě místa k úpravě.

### 1.4 Import flow — 3× identický vzor, jiný validátor
Tourplan (`handleImportFile`), POS Master GPS (`handlePosMasterImportFile`),
Task Pool Excel (`handleTaskImportFile`) — všechny: status text → KPI preview →
warnings/errors → confirm/cancel. ~400 řádků duplicitního markupu, validační
logika správně oddělená do modulů (`excelImport.js`, `posMasterData.js`,
`taskImport.js`) — tohle je dobrý precedent, jen UI vrstva se nesjednotila.

### 1.5 Menší duplicity
- Decision detail modal má dva oddělené „body" generátory (`taskDecisionDetailBodyHtml`
  vs `decisionDetailBodyHtml`) za jedním modalem.
- KPI karty (`.kpi`/`.kpi-v`/`.kpi-l`) — stejný markup na 5+ místech.
- Filter chips (region/technik/kanál/stav) — stejný pattern na 4 místech,
  konzistentní CSS, ale žádná sdílená komponenta.

### 1.6 Datová vrstva — cache vs. zdroj pravdy
Check-in stav žije ve třech místech najednou: localStorage (`ci_{posId}`),
in-memory `posData[posId]`, a Supabase přes `visitStore.js` (částečná
hydratace zpět, viz `MIGRATION_PLAN.md` Fáze 3). Funguje to, ale je to
fragilní základ pro budoucí multi-device scénář.

---

## 2. Cílová architektura (kam směřujeme)

Princip: **stejná entita = jedna datová cesta a jeden sdílený view, role
(technik/Velín) řeší jen co se z něj zobrazí, ne jak se to renderuje.**

```
Entity vrstva (jeden zdroj pravdy):
  POS · Technician · Task (jediný — broadcast i tracked) · Visit · Media (foto) · Decision

Sdílené UI komponenty (psát jednou, používat všude):
  EntityDetailView(entity, mode: 'tech'|'velin')
  ImportWizard(config)            ← Tourplan/POS Master/Task Pool přes 1 komponentu
  KpiCard / KpiGrid
  FilterChips / SearchInput
  MediaGallery(filters: {posId, technicianId, date, visitId, taskId, campaignId})
```

### 2.1 Task — sjednocení na jeden model
`task_pool` (TaskEngine) zůstává jediný zdroj. `admin_tasks` (broadcast)
se nezahodí jako koncept — bulk přiřazení úkolu skupině/regionu je reálná
potřeba — ale technicky se realizuje jako **bulk-create v `task_pool`**
(N tasků se společným `source.kind:'broadcast'` a `templateId`), ne jako
samostatný datový model. Výsledek: technik vidí JEDEN seznam úkolů, Velín
edituje JEDNO místo, evidence/historie funguje i pro broadcast úkoly.

### 2.2 Media (foto) — jednotný model
Nový průřezový `Media` koncept: `{id, url, takenAt, posId, technicianId,
visitId?, taskId?, campaignId?, slot|context, sourceKind}`. Existující 3
producenti (visit, merch, task evidence) zapisují do stejného tvaru navíc
ke svému stávajícímu uložení (postupná migrace, ne velký bang). Z toho
postavit jeden `MediaGallery` filtrovatelný podle POS/řetězce/technika/
data/úkolu/kampaně — přesně co Pavel chtěl jako příklad.

### 2.3 POS detail — sdílený view
Jeden `PosDetailView(posId, mode)` — sekce se podmiňují podle role
(technik = akční, Velín = historie/rozhodnutí), markup a data-binding jeden.

### 2.4 Import — jeden wizard
`ImportWizard({headers, parseRow, validate, onConfirm})` — 3 stávající
importy ho jen nakonfigurují. Validátory (`excelImport.js`/`posMasterData.js`/
`taskImport.js`) se nemění, jen UI vrstva.

---

## 3. Priority (moje doporučení, postupná realizace při běžném vývoji)

**P1 — řeší skutečnou nekonzistenci, dělat brzy**
1. Sloučit `admin_tasks` → `task_pool` (bulk-create). Eliminuje dva
   nezávislé seznamy úkolů, které dnes technik vidí pod sebou bez logiky.
2. Vyjasnit cache-vs-pravda u check-in stavu, než se prohloubí Fáze 3
   (Supabase) migrace — jinak se dluh jen nabaluje.

**P2 — vysoká hodnota pro Pavla, dělat při příští práci na fotkách/POS/importu**
3. Jednotný `Media` model + `MediaGallery` s filtry (přímo zadání z dnešní
   zprávy).
4. Sdílený `PosDetailView` (tech + Velín).
5. `ImportWizard` — až bude potřeba 4. import, použít rovnou tohle, zpětně
   přepsat stávající 3.

**P3 — kosmetika/refaktor, dělat příležitostně mezi jiným**
6. Sjednotit `KpiCard`/`FilterChips` komponenty.
7. Sjednotit dva generátory Decision detail modalu.

---

## 4. Pracovní princip pro další vývoj (Pavel, 2026-06-27)

> Business cíl a směr určuje Pavel. Technickou cestu vlastní Claude.

- Jasný bug/tech dluh/nekonzistence bez dopadu na chování produktu → **oprav
  rovnou, bez čekání**.
- Víc řešení nebo nutné business rozhodnutí → **navrhni varianty + doporučení
  a zeptej se**.
- Před každou novou featurou nejdřív zvážit, jestli nezapadá do existující
  části systému (viz sekce 2) místo nové obrazovky/komponenty.
- Tahle koncepce se realizuje postupně, ne jako jednorázový redesign —
  priority v sekci 3 se plní souběžně s běžnou prací na produktu.

Zapsáno i v `docs/CLAUDE.md` jako trvalé pravidlo spolupráce.

---

## 5. Entity-centric platform blueprint (přidáno 2026-07-01)

> Tato sekce je **závazný architektonický flow** — Pavel schválil 2026-07-01.
> Claude ji sleduje a nepotřebuje k ní otázky. Pokud je potřeba odchýlit se,
> Pavel musí explicitně schválit odchylku.

---

### 5.1 Základní princip: POS jako primární entita

**POS je střed světa.** Všechno ostatní — úkol, kampaň, materiál, návštěva,
fotka, technik — je vztah nebo pohled na POS. Žádný nový standalone modul.

Inspirace: SAP, Salesforce, Dynamics. Ne "feature list", ale jednotná entita
s pohledem podle role.

```
POS (primární entita)
├── Úkoly          ← vztah POS → Task Pool
├── Kampaně        ← vztah POS → Campaign
├── Materiály      ← vztah POS → POS_Material (instance katalogu)
├── Návštěvy       ← vztah POS → Visit
├── Fotky          ← vztah POS → Media
├── Master Data    ← vztah POS → Master Data Catalog (template)
└── Technik        ← vztah POS → přiřazení z Tourplan
```

**Pravidlo**: Nová feature = nový tab nebo pohled na POS kartě, NIKDY nová
sekce/modul navíc.

---

### 5.2 Kompletní datový model

```
┌─────────────────────────────────────────────────────────────────┐
│  ENTITY VRSTVA (jeden zdroj pravdy pro každou entitu)           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  POS                   Task (task_pool)                          │
│  ├── id (POS ID)       ├── id                                    │
│  ├── name              ├── posId  ← FK na POS                   │
│  ├── address           ├── title                                 │
│  ├── channel           ├── status (pending→assigned→in_progress  │
│  ├── region            │          →done→verified | cancelled)    │
│  ├── assignedTech      ├── source.kind (broadcast/campaign/      │
│  └── gps               │              workflow/trigger/manual)   │
│                        ├── priority                              │
│  MaterialCatalog       ├── evidence {photos,gps,comment}        │
│  (centrální template)  └── window {from,to}                     │
│  ├── itemId                                                      │
│  ├── name              POS_Material (instance katalogu)          │
│  ├── category          ├── posId  ← FK na POS                   │
│  ├── spec              ├── itemId ← FK na MaterialCatalog        │
│  └── channel           ├── state (proposed/confirmed/rejected)  │
│                        ├── confirmedBy (technik)                 │
│  WorkflowTemplate      ├── confirmedAt                          │
│  ├── id                ├── techNote (rozměry, stav, umístění)   │
│  ├── name              └── photoEvidence                        │
│  ├── trigger           (technik potvrzuje/opravuje v terénu;    │
│  ├── steps[]            Velín agreguje přes celou síť POS)      │
│  └── targetFilter                                                │
│                        Visit                                     │
│  Campaign              ├── id                                    │
│  ├── id                ├── posId  ← FK na POS                   │
│  ├── name              ├── techId ← FK na technik               │
│  ├── targetPOS[]       ├── week                                  │
│  ├── materials[]       ├── checkedIn / checkedOut               │
│  └── deadline          ├── taskState[]                          │
│                        ├── photos                               │
│                        └── notes                                │
│                                                                  │
│  Media (jednotný model)                                         │
│  ├── id                                                         │
│  ├── url                                                        │
│  ├── takenAt                                                    │
│  ├── posId  ← FK na POS                                        │
│  ├── techId                                                     │
│  ├── visitId?                                                   │
│  ├── taskId?                                                    │
│  ├── campaignId?                                                │
│  ├── slot|context (arrival/departure/planogram/merch/servis)   │
│  └── sourceKind                                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 5.3 Čtyři oblasti Velínu (cílová IA)

Dnes je 9 sekcí, cíl jsou 4 oblasti. Migrace postupně, ne přes noc.

```
┌─────────────────────────────────────────────────────────────────┐
│  VELÍN — 4 OBLASTI                                              │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│  LIVE        │  SÍŤ POS     │  OPERACE     │  SPRÁVA            │
│              │              │              │                    │
│ Co se děje   │ Pohled na    │ Úkoly,       │ Import, editor,    │
│ právě teď?   │ celou síť    │ kampaně,     │ workflow builder,  │
│              │ POS          │ schválení,   │ nastavení          │
│ Technici     │              │ trigger      │                    │
│ na mapě      │ Filtry:      │ engine       │ Tourplan, POS      │
│ Check-in     │ region,      │              │ Master, task       │
│ stav         │ kanál,       │ Action Feed  │ import             │
│ Flagy/rizika │ stav,        │ = fronta     │                    │
│ Urgentní     │ kampaň,      │ rozhodnutí   │                    │
│ alerts       │ technik      │              │                    │
│              │              │ "Co schválit │                    │
│              │ POS karta    │ dnes?"       │                    │
│              │ (6 tabů)     │              │                    │
└──────────────┴──────────────┴──────────────┴────────────────────┘
```

---

### 5.4 POS Detail karta — 6 tabů

Jeden `PosDetailView(posId, mode: 'tech'|'velin')`. Tabs jsou stejné pro oba,
obsah se podmiňuje podle role.

```
┌────────────────────────────────────────────────────────────────┐
│  POS #123456 — Tesco Letňany B                                 │
│  Naposledy navštíveno: 14 dní zpět  [prominent badge]         │
├──────────┬─────────┬──────────┬────────────┬──────┬───────────┤
│ PŘEHLED  │ ÚKOLY   │ HISTORIE │ MATERIÁLY  │FOTKY │MASTER DATA│
├──────────┴─────────┴──────────┴────────────┴──────┴───────────┤
│                                                                │
│  PŘEHLED (default):                                           │
│  ├── Stav: servisní/normální/v kampani                        │
│  ├── Přiřazený technik + od kdy                               │
│  ├── Poslední návštěva: datum, kdo, délka                     │
│  ├── Otevřené úkoly (count + kritické)                        │
│  ├── Aktivní kampaně                                          │
│  └── GPS ověření stav                                         │
│                                                                │
│  ÚKOLY:                                                       │
│  ├── Task pool pro toto POS (stav, priorita, deadline)        │
│  └── Přidat úkol (Velín), označit hotovo (technik)           │
│                                                                │
│  HISTORIE:                                                     │
│  ├── Chronologický log návštěv                                │
│  ├── Co se dělalo, jak dlouho, kdo                            │
│  └── Timeline tasků od zadání po dokončení                    │
│                                                                │
│  MATERIÁLY:                                                   │
│  ├── POS_Material instance (stav každého kusu)               │
│  ├── Technikovo potvrzení / oprava / naměřené hodnoty        │
│  └── Velín: vidí stav, může navrhnout změnu katalogu          │
│                                                                │
│  FOTKY:                                                       │
│  ├── MediaGallery filtrovaná na toto POS                      │
│  └── Filtry: datum, typ, návštěva, úkol                      │
│                                                                │
│  MASTER DATA:                                                  │
│  ├── Co říká centrální katalog (šablona)                      │
│  ├── Co je skutečně na místě (technikovo potvrzení)          │
│  └── Rozdíly = návrhy na aktualizaci katalogu                │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

### 5.5 Master Data flow

```
Master Data Catalog (centrální template — edituje Velín/admin)
        │
        │  bulk-generate při importu/kampani
        ▼
POS_Material (instance pro každé POS × každý item)
  state: 'proposed'     ← systém navrhl, technik ještě nepotvrdil
        │
        │  technik jde na POS, otevře kartu Materiály
        ▼
  state: 'confirmed'    ← technik potvrdil/opravil/doměřil in-field
  techNote: "police 3cm kratší, umístěna vlevo"
  photoEvidence: [...]
        │
        │  Velín v sekci Síť POS, filtr "Materiály → stav"
        ▼
Agregovaný pohled přes celou síť:
  "53 POS má navrzenou změnu aranžmá X — schválit vše / po jednom"
        │
        │  schválení
        ▼
Katalog aktualizován pro nové POS nebo nové kampaně
```

**Klíčové pravidlo (Pavel, 2026-07-01):** Katalog je centrální, ale technik
může ručně potvrdit, opravit nebo doměřit per-POS. Velín pak vidí a filtruje
přes všechny materiály sítě.

**"Jak dlouho jsme tam nebyli"** musí být prominentní v POS kartě — jeden
z klíčových operačních ukazatelů.

---

### 5.6 Trigger engine (human-controlled)

```
Změna v Master Data Catalogu
  nebo nová kampaň
  nebo detekce anomálie (GPS, délka návštěvy, opakovaný problém)
        │
        ▼
Systém identifikuje dotčená POS
  (filtr: kanál, region, kategorie materiálu, stav POS_Material)
        │
        ▼
PROPOSED task pool
  "Systém navrhuje 47 úkolů pro 47 POS — aktualizovat display X"
        │
        ▼  ← HUMAN GATE (Velín musí schválit)
Velín: Operace → Action Feed
  "47 navržených úkolů — schválit vše / odmítnout / přejmenovat / změnit prioritu"
        │
        ▼  po schválení
Bulk-create v task_pool (source.kind: 'trigger')
  N tasků se source.triggerId a source.templateId
        │
        ▼
Assign technikům (z Tourplan přiřazení)
        │
        ▼
Technik: vidí úkol v POS kartě, provede, vyfotí evidence
        │
        ▼
POS_Material state aktualizován: 'proposed' → 'confirmed'
```

**Klíčové pravidlo (Pavel, 2026-07-01):** Trigger engine NIKDY nepřiřazuje
úkoly automaticky bez lidského schválení. Velín musí vždy vidět návrh a
rozhodnout.

---

### 5.7 Bidirectionální korekční flow

```
                    VELÍN                    TECHNIK
                      │                        │
        Vytvoří/nastaví katalog           Vidí v terénu
        Navrhuje materiál pro POS         realitu
                      │                        │
                      └──────────┬─────────────┘
                                 │
                          POS_Material state
                          (proposed → confirmed/rejected + note)
                                 │
                      ┌──────────┴─────────────┐
                      │                        │
               Velín vidí                Technik vidí
               agregovaně:               svůj POS:
               "18 POS odmítlo          "Toto není
               display B"               dostupné — opravil jsem"
                      │                        │
               Navrhne úpravu           Pokračuje s
               katalogu                 dalšími úkoly
```

---

### 5.8 Excel / Tourplan jako vstupní kanál, ne modul

```
Tourplan Excel
  │
  ▼
Import Wizard (runImportFileFlow pattern)
  → validace
  → preview
  → potvrzení
  │
  ▼
Naplní entity:
  ├── posData (POS seznam pro daný týden)
  ├── Technician přiřazení (kdo má jaké POS)
  └── Task_pool (pokud import obsahuje servisní úkoly)
```

Excel = input channel. Nesmí mít vlastní modul nebo obrazovku navíc. Vše
co jde do systému přes Excel, žije v entitách POS / Task / Technician.

---

### 5.9 Workflow Builder jako editor, ne destination

WorkflowTemplate = konfigurační objekt, editovatelný v sekci Správa.
Spouštění workflow = Trigger engine (sekce 5.6).
Výsledek workflow = task_pool záznamy.

Žádný samostatný "Workflow" modul pro technika — technik vidí jen výsledné
úkoly v POS kartě, stejně jako jakýkoliv jiný zdroj.

---

### 5.10 Hlavní pravidla pro budoucí vývoj

Tato pravidla nahrazují ad-hoc rozhodování. Claude je sleduje bez ptaní.

| # | Pravidlo |
|---|---|
| 1 | Nová feature = tab nebo pohled na POS kartě, NIKDY nová obrazovka/modul |
| 2 | Jeden datový model (task_pool, POS_Material, Media) — žádné paralelní systémy |
| 3 | Trigger engine: vždy human-approved, nikdy auto-assign |
| 4 | Master Data: katalog centrální, instance per-POS, technik potvrzuje v terénu |
| 5 | "Jak dlouho jsme tam nebyli" = prominentní v každé POS kartě |
| 6 | Excel/Tourplan = vstupní kanál, entity žijí v POS/Task/Technician |
| 7 | Žádná fake data — každé číslo musí mít zdroj (viz CLAUDE.md) |
| 8 | Workflow Builder = editor, výsledek jsou task_pool záznamy |
| 9 | Velín má 4 oblasti (Live / Síť POS / Operace / Správa), ne víc |
| 10 | Bezpečnost: žádné credentials v kódu, vždy GitHub Secrets + CI inject |
