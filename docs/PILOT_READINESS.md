# PILOT_READINESS.md — Allwyn Space v0.1

> Audit pro přípravu pilotu a prezentaci AI transformation týmu jako MVP architektura.
> Datum: 2026-06-25. Žádné nové featury, žádné nové obrazovky — viz zadání.

---

## 1. Shrnutí

Kód je **mnohem méně monolitický, než jak to vypadá z `index.html`**. Existuje
14 JS souborů (8019 řádků), z toho 9 je už dnes čistá, DOM-free, "no fake
data" logická/datová vrstva:

| Soubor | Role | Fake data? |
|---|---|---|
| `posModel.js` | Kanonický model POS (augmentace, mapování importu) | Ne |
| `technicianModel.js` | Jediný zdroj pravdy pro Velín (agregace technik ↔ POS) | Ne |
| `routeEngine.js` | Route Intelligence (vzdálenost, optimalizace, SLA, otevírací doba) | Ne — mock distance provider je **explicitně označený** mock |
| `dataProvider.js` | Jediný vstupní bod pro POS/technik data (import vs. override) | Ne |
| `excelImport.js` | Parser reálného Tourplan exportu | Ne |
| `posMasterData.js` | Parser GPS + otevírací doba (samostatný import) | Ne |
| `checklistEngine.js` | Podmíněný checklist (Ano/Ne větvení) | N/A (čistá logika) |
| `geo.js` | Geocoding | **Mock, ale označený a deterministický** (viz §3) |
| `sync.js` | Supabase cross-device sync shim | N/A, ale **scope omezen na 1 technika** (viz §4) |

Zbytek (`app.js`, 4578 řádků) je orchestrace + UI rendering + zbytek business
logiky, která se ještě nepřesunula do výše uvedených modulů.

**Žádná fake KPI/produktivita/výkon technika jsem nenašel.** `Math.random()` se
v `app.js` používá jen na 2 místech a obě jsou kosmetická, ne byznysová (viz
§3.3).

---

## 2. Audit flow podle zadání

### 2.1 Technician mobile
Check-in (GPS) → checklist (servis/template/on_top/own úkoly) → merch →
zásobování (podpis) → foto → check-out. Datový tok: `TOURPLAN_RAW` →
`ExcelImport.buildPosWeeks()` → `DataProvider` → `posModel.augmentRawPos()` →
`posData[week]` (filtrováno na přihlášeného technika) → UI.

Funguje end-to-end, ověřeno Playwrightem v rámci tohoto i předchozích sezení
(GPS flag logging, supply lock po podpisu, checklist větvení).

### 2.2 POS detail
Karta POS čte stejný `posData` objekt — žádný druhý zdroj pravdy. Inventory,
merch, spotřební materiál jsou tři oddělené sekce (dle `docs/CLAUDE.md` #1) —
ověřeno, nesměšují se.

### 2.3 Route execution
`RouteEngine.calculateRoute()`/`bestOrder()`/`proposeDayPlan()` — žádné
vymyšlené KPI. Vzdálenost = haversine × silniční koeficient (mock, ale
deklarovaný jako mock, s připraveným adaptérem na Google Maps Distance
Matrix API — `RouteEngine.providers.googleMaps` dnes vyhodí `throw new
Error('not yet implemented')`, ne tichý fallback na fake čísla).

### 2.4 Manager Velín
`TechnicianModel.deriveTechnicians()` je jediný zdroj pravdy pro
Dashboard/Live/Technici/Mapu — žádné duplicitní počítání. GPS anomálie teď
(po opravě z minulého sezení) zahrnují i 300m–1km pásmo, ne jen >1km.

**Zjištěná mezera (oprava v tomto sezení):** `getLiveState()` měl natvrdo
`technik: 'Lán Tomáš'` jako popisek bez ohledu na to, kdo je reálně
přihlášený — oprava: `technik`/`initials` se teď odvozují z
`currentViewTechnician`. Drobná oprava, beze změny chování pro Lán Tomáš.

---

## 3. Co je mock — explicitně, s důvodem

### 3.1 Geocoding (`geo.js`)
Adresy v Tourplan exportu nemají GPS. `geocodeAddress()` hledá název obce ve
slovníku ~150 reálných českých měst (reálné souřadnice). Neznámá obec
dostane **deterministický** (ne náhodný) odhad kolem reálného regionálního
centroidu (POS AREA kód) — opakovatelné, ne fake KPI. `pos.gpsTownMatched`
flag rozlišuje "trefil se do slovníku" vs. "odhad" — UI to může zobrazit.

**Nahraditelné:** Google Geocoding API, jedna funkce (`geocodeAddress`).

### 3.2 Distance provider (`routeEngine.js`)
Haversine × 1.3 (silniční koeficient) — reálná aproximace, ne fake číslo.
Adaptér na Google Maps Distance Matrix API je připravený
(`RouteEngine.providers.googleMaps`), ale **neimplementovaný** (vyhodí
chybu, pokud se zapne bez implementace — bezpečné, ne tichý fail).

### 3.3 Kosmetické `Math.random()` (NE byznysová data)
- `app.js:2696` — výběr jedné ze 3 statických "Operativní tip" hlášek, když
  AI API nejede. Označené jako "Operativní tip", NE jako AI insight — uživatel
  neuvěří, že je to AI generované.
- `app.js:4563` — ambientní dekorativní síť bodů na pozadí landing page (čistě
  vizuální, žádná data).

Ani jedno neovlivňuje KPI, produktivitu ani byznysová čísla.

### 3.4 POS Master Data (GPS přesné + otevírací doba)
`POS_MASTER_MAP` je **prázdná**, dokud Pavel nedodá soubor — appka pak padá
zpět na mock geocoder (§3.1) a `RouteEngine` vrací `'unknown'` pro otevírací
dobu (ne fake hodiny). Import existuje a je hotový (`posMasterData.js`),
čeká jen na reálná data.

---

## 4. Pilot mode — 5 techniků: NALEZENÝ BLOCKER

Datová vrstva (`DataProvider`/`FULL_POS_DATA`) **už dnes obsahuje všech 27
reálných techniků** z Tourplan importu — Velín už může "Zobrazit jako
technik" pro kteréhokoliv z nich (`viewAsTechnician()`, generické, funguje).

**Problém je v přihlašovací obrazovce a v "live" trackování:**

1. **Login** — jen jedna karta `loginAsTechnician()` bez parametru,
   defaultuje na `SOLE_REAL_TECHNICIAN = 'Lán Tomáš'`. Rozšíření na 5 techniků
   = malá úprava (výběr jména v rámci stejné karty, ne nová obrazovka).

2. **"LIVE" badge ve Velín → Live** (`app.js` `renderAdminLive`/
   `showTechDetail`) — natvrdo porovnává `t.name === SOLE_REAL_TECHNICIAN`.
   Tohle je skutečný architektonický bod, ne kosmetika: appka běží na **jednom
   sdíleném `posData` globálu** přepisovaném při každém přihlášení/"view as".
   Když se přihlásí 5 různých techniků (na 5 různých zařízeních), Velín dnes
   nemá způsob, jak poznat "kdo z nich je TEĎ live" — protože "live" stav je
   odvozen z identity (jedno natvrdo zapsané jméno), ne z dat (kdo má dnes
   reálný check-in).

3. **Supabase sync** (`sync.js`) je explicitně scoped jen na
   `SOLE_REAL_TECHNICIAN` — `docs/CLAUDE.md`/komentáře v `schema.sql` to
   sami označují jako pilotní omezení s otevřenou RLS politikou (anon klíč),
   která **musí** být před reálným pilotem nahrazena auth-based politikou.

**Doporučení (čeká na tvé schválení, je to přesně ten typ rozhodnutí, co má
být schválené před BUILD):**
- Vybrat 5 reálných techniků s podobnou reálnou zátěží (ne nejvyšší/nejnižší
  outlier) — navrhuji: **Lán Tomáš (40 POS/týden 25), Hrubý Jiří (39),
  Herman Petr (38), Štolba Jan (37), Dvořák Petr (37)** — čísla z reálného
  importu, ne vymyšlená.
- Generalizovat "LIVE" badge z identity na data (technik je "live", pokud má
  dnešní check-in v `vlog_{date}`/`ci_*`), ne na natvrdo zapsané jméno.
- Rozšířit `sync.js`/RLS scope na těchto 5 (vyžaduje auth-based politiku, ne
  jen rozšíření whitelist jmen se stávající otevřenou anon politikou).

Tohle je víc než "drobný UI bug" — sahá do auth/sync architektury. Navrhuju
probrat přístup (`/think`) než půjdu do kódu.

---

## 5. Frontend / Data / Backend-API — separace dnes

```
DATA (import, deterministické, žádné fake)
  tourplanRaw.js, posMasterData.js
        ↓
LOGIKA (DOM-free, testovatelné samostatně)
  excelImport.js → dataProvider.js → posModel.js → technicianModel.js
  geo.js, routeEngine.js, checklistEngine.js
        ↓
UI (DOM, rendering, event handling)
  app.js (4578 řádků) + index.html (CSS/markup)
        ↓
SYNC (přídavná vrstva, no-op bez konfigurace)
  sync.js → Supabase (sync_kv tabulka, 1:1 zrcadlení localStorage klíčů)
```

**Co tohle reálně znamená pro "backend-API preparation":**
- Logická vrstva (`routeEngine`/`technicianModel`/`posModel`/`excelImport`)
  je už dnes DOM-free a UMD-exportovaná (`module.exports` i `window.X`) —
  je **přímo přenositelná** na server beze změny, jen se vstup/výstup obalí
  do HTTP handlerů. To je nejvíc nedocenitelná část stávající práce.
- `dataProvider.js` je navržený přesně jako budoucí abstrakce nad API —
  signatura `getPosWeeks()`/`getTechnicianNames()`/`getSummary()` se nemění,
  až `TOURPLAN_RAW`/`localStorage` nahradí reálné API volání.
- `app.js` je single point zbytku — UI rendering smíchaný s drobnou business
  logikou (přibližně 27 % logiky je tu, zbytek je rendering/event handling).
  Žádný urgentní důvod ho rozebírat před pilotem — je to údržbová záležitost
  pro Fázi 1 migrace (`MIGRATION_PLAN.md`), ne pilot blocker.
- `supabase/schema.sql` (35 řádků) je **draft sync shim**, ne cílové schéma —
  cílový normalizovaný model je v `MIGRATION_PLAN.md`.

---

## 6. Co potřebuje enterprise integraci (mimo scope tohoto auditu, ale pro
prezentaci důležité)

| Co | Stav dnes | Co chybí |
|---|---|---|
| AI API klíč (Anthropic) | Volá se přímo z frontendu | Server-side proxy — **otevřený P1 security item z minulého review, čeká na rozhodnutí o hostingu** |
| Distance/route API | Haversine mock | Google Maps Distance Matrix API |
| Geocoding | ~150 měst slovník + deterministický odhad | Google Geocoding API nebo přesný POS Master GPS import |
| Auth | Pilot bez hesla, Session tvar připravený na Entra ID | Microsoft Entra ID / Azure AD SSO |
| Servisní tikety | Jen z inventory "Chybí" → auto-task | Jira import |
| Cross-device sync | Supabase shim, 1 technik, otevřená RLS | Auth-based RLS, rozšíření na všechny techniky |
| POS Master (GPS/hodiny) | Prázdné, čeká na soubor | Pavel dodá Excel |

---

## 7. Otevřené body, na které čekám na rozhodnutí

1. **5 techniků pro pilot** — souhlasíš s navrženou pětkou (§4) a s
   generalizací "LIVE" badge z identity na data?
2. **AI klíč na server** — který hosting (Vercel/Cloudflare Workers/Netlify)?
   Bez rozhodnutí nemůžu tohle dokončit.
3. Cokoliv z §5/§6 dál — `app.js` refactor na samostatné moduly je teprve
   "nice to have" pro tuhle fázi, ne blocker.
