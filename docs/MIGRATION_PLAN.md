# MIGRATION_PLAN.md — Allwyn Space

> Plán přechodu: **HTML prototyp → modulární frontend → backend → databáze → AI**.
> Každá fáze je samostatně funkční a testovatelná. Nepřeskakuj fáze. Po každé fázi musí appka fungovat.

---

## Výchozí bod
Jeden soubor `index.html` (~375 KB, 3 749 řádků): HTML + inline CSS + vanilla JS. Data v localStorage. Leaflet.js mapa. Claude API volání přímo z frontendu (klíč řešen prostředím prototypu). Funkční pro demo, ne pro produkci. Podrobný audit kódu: `CODE_AUDIT.md`.

## Cílový stav
Modulární webová aplikace, Supabase backend (Postgres + Auth + Storage + Realtime), AI server-side, nasaditelná, multi-user, data persistují napříč zařízeními.

---

## FÁZE 0 — Příprava (½ dne)
**Cíl:** projekt v gitu, dokumentace, žádná změna funkčnosti.

1. `git init`, založ repo. První commit = stávající `index.html` beze změny. ✅ Hotovo (repo existuje, `index.html` commitnutý).
2. Vytvoř strukturu složek (viz CLAUDE.md architektura), zatím prázdné. — Ještě neuděláno.
3. Zkopíruj `PROJECT_CONTEXT.md`, `CLAUDE.md`, `MIGRATION_PLAN.md` do `docs/`. ✅ Hotovo (+ `CODE_AUDIT.md` navíc).
4. Zprovozni lokální dev server (i kdyby jen `python -m http.server`) a ověř že prototyp běží.

**Hotovo když:** prototyp běží lokálně z repa, dokumentace na místě, čistý git stav.

---

## FÁZE 1 — Modulární frontend (2–3 dny)
**Cíl:** rozbít monolit na moduly. ŽÁDNÁ změna chování ani vzhledu. Pořád localStorage.

> Tohle je nejrizikovější fáze — refaktor bez změny funkčnosti. Postupuj po malých krocích, po každém ověř že appka funguje identicky.

1. **Vytáhni CSS** do `styles/` (design tokeny zvlášť: barvy, spacing). Zachovej přesně stávající vzhled.
2. **Vytáhni data layer** do `lib/data.js` — všechny `localStorage` operace za jedno API (`getCheckin`, `saveVisit`, `getAssignment`...). Zbytek kódu volá jen tohle API, ne localStorage přímo. **Tohle je klíč pro Fázi 3** (pak stačí přepsat data.js na backend). V prototypu je to dnes zúžené na dva univerzální helpery `lsg(k,d)`/`lss(k,v)` (`index.html:1193-1194`) — při refaktoru je nahraď doménově pojmenovanými funkcemi.
3. **Vytáhni doménovou logiku** do `lib/domain.js`: detekce kanálu (IDT/KA/PETROL/CORN — dnes `index.html:1172-1175`), priority úkolů (dnes implicitní pořadí v `renderTasks`, `index.html:1655+`), detekce dne (`getTodayDayIdx`, `getCurrentWeekNum`, isPast/isFuture — dnes `index.html:3084-3114`), overdue POS (`getOverduePOS`, `index.html:3117+`), normativy.
4. **Vytáhni GPS** do `lib/gps.js` (haversine vzdálenost `getDistanceKm`, ověření check-inu `verifyGPS` — dnes `index.html:2757-2844`).
5. **Rozděl views**: `views/technik/` a `views/velin/`. Sdílené UI do `components/`.
6. Rozhodni o frameworku: buď **ponechat vanilla** (méně rizika, rychlejší) nebo **React + Vite** (lepší pro budoucí růst). Pokud React, migruj view po view, ne najednou.

**Hotovo když:** appka vypadá a funguje identicky jako prototyp, ale kód je v modulech. Data layer je jediná vrstva sahající na localStorage.

**NEROZBÍT:** všechna pravidla z CLAUDE.md. Zvlášť: tři typy materiálu, Corn jako kanál, read-only SAP, auto-detekce dne, prázdný plán + persistence, GPS flagy.

---

## FÁZE 2 — Backend skeleton + Auth (2 dny)
**Cíl:** Supabase projekt, přihlášení, role.

1. Založ Supabase projekt. Ulož `SUPABASE_URL` a `anon key` do `.env` (nikdy do gitu).
2. **Auth**: technici se přihlašují (email/heslo nebo magic link). Admin = role `admin`, technik = role `technik`.
3. Tabulka `profiles` (id, jméno, role, region, technik_kod). Lán Tomáš a spol.
4. Role select obrazovku nahraď reálným přihlášením + odvození role z profilu. (Dnešní `enterRole()` v `index.html:1200` je čistě demo toggle bez ověření — nahradit.)
5. **RLS (Row Level Security)** od začátku: technik vidí jen svoje POS/data, admin vidí vše. Nikdy nespoléhej na frontend pro oprávnění.

**Hotovo když:** uživatel se přihlásí, vidí správné rozhraní podle role, RLS chrání data.

---

## FÁZE 3 — Databáze + migrace dat (3–4 dny)
**Cíl:** localStorage → Postgres. Data persistují napříč zařízeními.

### Schema (návrh — uprav dle potřeby)
```sql
-- Provozovny
pos (
  id text primary key,              -- číslo terminálu
  nazev text, adresa text,
  region text,                      -- RSA/RSB/RSC/RSD/RSE/RSG
  kategorie text,                   -- kód (1AHOLD, 9..., ...)
  kanal text,                       -- IDT | KA | PETROL | CORN
  partner text,                     -- Albert, Shell, ... (nullable)
  lat double precision, lng double precision,
  telefon text, kontakt text
)

-- Týdenní přiřazení POS technikům (z Tourplanu)
tourplan (
  id uuid pk, pos_id text ref pos, technik_id uuid ref profiles,
  tyden text,                       -- "23".."28"
  den int                           -- 0..4 nebo null (technik si přiřadí)
)

-- Návštěvy (check-in/out, GPS, časy)
navstevy (
  id uuid pk, pos_id text, technik_id uuid,
  tyden text, den int,
  check_in timestamptz, check_out timestamptz,
  trvani_min int,
  gps_lat double precision, gps_lng double precision,
  gps_vzdalenost_m int, gps_flag bool,
  stav text,                        -- rozpracovano | hotovo
  schvaleno text                    -- ceka | ok | zamitnuto
)

-- Úkoly
ukoly (
  id uuid pk, pos_id text, navsteva_id uuid,
  text text, zdroj text,            -- servis | template | on_top | own
  splneno bool, deadline date, poznamka text,
  zadal uuid                        -- kdo přidal (admin pro on_top)
)

-- Spotřební materiál (s podpisem pro SAP)
zasobovani (
  id uuid pk, navsteva_id uuid, pos_id text,
  polozky jsonb,                    -- [{nazev, mnozstvi, jednotka, sap}]
  prijal_jmeno text,
  podpis_url text,                  -- Supabase Storage
  potvrzeno_at timestamptz,
  sap_export text
)

-- Merch (osazení, bez podpisu)
merch (
  id uuid pk, navsteva_id uuid, pos_id text,
  polozky jsonb                     -- [{nazev, osazeno}]
)

-- Inventory (dlouhodobý majetek per POS)
inventory (
  id uuid pk, pos_id text,
  sekce text,                       -- vnitrni | venkovni
  nazev text, typ text,             -- z katalogu
  stav text,                        -- ok | chybi | null
  aktualizovano_at timestamptz, aktualizoval uuid
)

-- Katalog inventáře (admin spravuje)
inventory_katalog (
  id uuid pk, sekce text, ikona text, nazev text, aktivni bool
)

-- Karta POS (trvalé záznamy)
pos_karta (
  id uuid pk, pos_id text, text text, autor text, vytvoreno_at timestamptz
)

-- Fotodokumentace
fotky (
  id uuid pk, navsteva_id uuid, pos_id text,
  url text, typ text                -- pred | po | detail
)

-- Kampaně (admin edituje)
kampane (
  id uuid pk, typ text, nazev text, termin text,
  deadline date, polozky text, aktivni bool
)

-- Admin texty (editor)
admin_texty (
  klic text pk,                     -- briefing | alert | idt | ka
  hodnota text, aktualizovano_at timestamptz
)
```

> Poznámka k mapování: aktuální prototyp ukládá inventory jen v paměti (`p.inventory`, neperzistentní v localStorage), zatímco `editor_idt`/`editor_ka` jsou dnes dva oddělené localStorage klíče (ne jen jeden `editor_alert`) — promítni to do `admin_texty.klic` (`briefing | alert | idt | ka`), schéma už to počítá.

### Postup
1. Vytvoř schema + RLS policies.
2. **Import POS dat** z Tourplanu (Excel `Tourplan_week_20-28.xlsx`) do `pos` + `tourplan`. Napiš import skript. (Dnes jsou POS data hardcoded v JS konstantě `REAL_DATA` v `index.html` — nahradit importem.)
3. **Přepiš `lib/data.js`** — místo localStorage volej Supabase. Protože vše prošlo přes data layer (Fáze 1), zbytek appky se nemění.
4. **Fotky a podpisy** → Supabase Storage (ne base64 v DB). (Dnes jsou fotky/podpis canvas data uloženy přímo v paměti/localStorage jako base64 — riziko přetečení úložiště, viz CODE_AUDIT.md.)
5. **Realtime** pro velín — živá mapa a stav techniků přes Supabase Realtime subscriptions.
6. Migrace případných testovacích dat z localStorage (volitelné).

**Hotovo když:** appka funguje stejně, ale data jsou v Postgresu, sdílí se napříč zařízeními, fotky/podpisy v Storage.

**Pozor:** zachovej formát úkolových zdrojů, kanálů a tří typů materiálu přesně. RLS musí být těsná — manažer chce kontrolu, ale technik nesmí vidět/měnit cizí data ani SAP kódy.

---

## FÁZE 4 — AI (2–3 dny)
**Cíl:** AI funkce server-side, bezpečně, s reálnými daty.

1. **Přesun AI volání na server** (Supabase Edge Function nebo backend endpoint). Anthropic klíč jako secret, NIKDY ve frontendu. (Dnes `fetch('https://api.anthropic.com/v1/messages', ...)` přímo z frontendového JS — `index.html:2875` a `2941` — toto je nejnaléhavější bezpečnostní dluh prototypu.)
2. **Ranní briefing** — server vygeneruje z reálných dat technika (plán, servisy, kampaně, admin zprávy). Zachovej fallback hlášky (dnes `index.html:2891-2897`).
3. **AI analýza výkonu (velín)** — report z reálných dat (GPS flagy, krátké návštěvy, completion, historie). Zachovej fallback mock report (dnes `generateMockReport`, `index.html:2963-2981`).
4. **Guardrails**: AI nikdy nepíše přímo do kampaní/produkce. AI smí navrhovat, admin schvaluje (pravidlo #8 v CLAUDE.md).

**Hotovo když:** AI běží server-side, klíč je bezpečný, funkce dávají smysl nad reálnými daty.

---

## FÁZE 5+ — Budoucí (backlog, neplánovat teď)
- **Jira integrace** — servisní tikety → úkoly se zdrojem `servis` (nejvyšší priorita)
- **SAP kódy z fotky** — AI vision přečte vytištěný SAP kód
- **Modul materiálu do auta** — výpočet co naložit na X dní (POS per typ × normativy + buffer), pak odpis
- **AI dynamické plánování** — z Activity plánu generuje denní plány, admin schvaluje (NE autonomně)
- **Route optimization** — optimalizace pořadí návštěv
- **Normativy návštěv** — čas per typ POS → denní kapacita (~40h/týden)
- **Reálné SAP kódy** — výměna mockupů (`SAP-MOCK-*`) za skutečné až je objednatel dodá

---

## Průřezová pravidla (platí ve všech fázích)
- Po každé fázi: **funkční, otestovaná, commitnutá** appka.
- **Nikdy nerozbít** business pravidla z CLAUDE.md (13 bodů).
- **Čeština** v UI a doméně.
- **Mobile-first** (technici v terénu na telefonu).
- Žlutá = legacy Sazka, nepoužívat jako brand barvu.
- Secrets do `.env`, nikdy do gitu.
- Když chybí business rozhodnutí → zeptej se Pavla, ale navrhni řešení.

## Doporučené pořadí pokud je málo času
Pro rychlé reálné testování (priorita objednatele): **Fáze 0 → 2 → 3** (auth + DB) dřív než dokonalý refaktor. Modularizace (Fáze 1) se dá dělat průběžně. AI (Fáze 4) až když základ persistuje. Cíl objednatele je *"nechat to někoho otestovat v základní míře"* — tomu pomůže nejvíc persistence dat (Fáze 3) a přihlášení (Fáze 2).

---

## FÁZE 3 — stav implementace (relační perzistence návštěvy)

Implementováno (`supabase/schema.sql`, `js/visitStore.js`): tabulky
`technicians`, `pos_locations`, `visits`, `visit_tasks`, `materials`,
`sync_events`. Technik zapisuje do nich přes write-through vzor — každá
akce zapíše stejně jako dřív do localStorage (okamžitý render, appka
zůstává funkční i offline/bez konfigurace) a navíc fire-and-forget pošle
totéž do Supabase. Při loginu/refreshi/přepnutí technika ve Velínu se
stav dokončení návštěvy a checklistu stáhne ze Supabase a sloučí do živých
dat (`hydrateVisitStoreFor` v `js/visitStore.js`), takže se promítne i na
jiném zařízení.

**Zapisuje se (write):** check-in/checkout (`sync_events` log), stav
checklistu (`visit_tasks`), dokončení návštěvy (`visits.status`/
`completed_at`), podpis při zásobování (`visits.signature_data`),
poznámky z POS karty (`visits.notes`), metadata fotek — slot, velikost,
čas (`visits.photos_meta`, NE samotná fotka), množství spotřebního
materiálu a merch (`materials`, merch mapováno na 1/0, protože tahle
tabulka nemá boolean stav — zaokrouhlení, ne reálná kvantita).

**Hydratuje se zpátky (read, ovlivní co technik/Velín vidí po refreshi
na jiném zařízení):** jen dokončení návštěvy (`p.v`) a stav checklistu.
To je přesně to, co potřebuje akceptační test "technik dokončí POS →
refresh → Velín vidí změnu".

**Známé mezery (vědomě, ne zapomenuté):**
- **Merch/zásobování/fotky se po refreshi na jiném zařízení NEhydratují
  zpátky do UI** — zapisují se do Supabase (auditovatelné přímým dotazem),
  ale `merchItems`/`supplyItems`/`p.photos` se dnes čtou jen z lokálního
  localStorage. Technik na jiném zařízení tak fyzicky neuvidí fotky ani
  stav zásobování, dokud se nedoplní symetrické čtení.
- **Kampaně ("campaign check") nemají v UI žádné technické tlačítko** —
  kampaně jsou dnes čistě read-only přehled editovaný adminem
  (`renderCampaigns`/`campCard`). Bez UI změny (zadání explicitně říká
  "STOP all UI redesign") není co perzistovat — technik nemá akci k
  zaznamenání.
- **Dlouhodobý inventory** (`setInv`, stavy ok/miss/damaged/needs_replacement)
  se vědomě NEMAPUJE do `materials.quantity` — bylo by to fabrikování
  číselné kvantity z kategoriálního stavu (porušení "žádná fake data").
  Zůstává jen v localStorage, dokud nedostane vlastní schéma.
- **Visits jsou "aktuální stav", ne historie** — jedna řádka
  `visits`/technik+POS se přepisuje (stejně jako `materials`), ne nová
  řádka na každou návštěvu. Historie jednotlivých akcí (checkin, checkout,
  potvrzení zásobování, poznámka, dokončení) je v `sync_events`.
- **RLS politika zůstává otevřená pro anon klíč** (`pilot test — anon full
  access`, viz `supabase/schema.sql`) — vědomé pilotní riziko pro 5 lidí na
  kontrolovaných zařízeních. **Musí se uzavřít při Fázi 3** (auth-based RLS):
  technik vidí jen svoje data, Velín vidí vše. Otevřená RLS je blokující
  bezpečnostní dluh před nasazením mimo pilotní skupinu.

- **Supabase credentials správa (2026-07-01):** Klíče jsou ODSTRANĚNY
  z `index.html` a z repo kódu. Spravují se jako GitHub Secrets
  (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) a injektují se při deployi přes
  `.github/workflows/deploy.yml`. Bez nastavených Secrets běží appka
  v offline/localStorage módu (graceful degradation). Lokální vývoj:
  vytvořit `config.local.js` (gitignored).
  **⚠ POZOR:** Staré credentials jsou stále v git historii — při přechodu
  z pilotu na produkci rotovat klíče v Supabase Project Settings → API Keys
  (publishable key: `+ New publishable key`, starý smazat). Secret key
  (service role) nebyl ve frontendu nikdy — ten rotovat není nutné.
- **Testováno offline/bez síťového přístupu k Supabase** — Playwright ověřil,
  že appka běží beze změny chování a bez console errorů, když síť na
  Supabase není dostupná (`VisitStore.enabled() === false`). Skutečný
  cross-device test (dvě zařízení, reálné Supabase spojení) nebyl v tomto
  prostředí možný — doporučeno ověřit manuálně na dvou reálných
  zařízeních/prohlížečích před nasazením na pilot.
