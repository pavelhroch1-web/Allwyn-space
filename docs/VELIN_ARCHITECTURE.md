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
