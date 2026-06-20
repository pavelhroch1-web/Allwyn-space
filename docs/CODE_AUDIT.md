# CODE_AUDIT.md — Allwyn Space

> Audit skutečné implementace v `index.html` (3 749 řádků, ~375 KB) vůči záměru popsanému v `PROJECT_CONTEXT.md` a `CLAUDE.md`. Cílem je mít přesnou referenci s řádkovými odkazy před refaktorem (Fáze 1 `MIGRATION_PLAN.md`).

---

## 1. Struktura souboru

| Sekce | Řádky | Obsah |
|---|---|---|
| `<head>` + externí knihovny | 1–8 | Leaflet.js 1.9.4 (CDN) |
| `<style>` | 9–495 | CSS proměnné (barvy), layout technik/admin, komponenty |
| `<body>` HTML | 496–945 | Technik screen (`#technik-screen`) + Admin/Velín screen (`#admin-screen`) |
| `<script>` | 947–3749 | Konstanty, state, veškerá logika |

Žádné externí JS moduly, žádný build nástroj. Vše vanilla JS, ES6+ syntaxe (arrow funkce, template literals, `const/let`).

---

## 2. localStorage — skutečné klíče (ověřeno)

Wrapper funkce `lsg(k,d)` / `lss(k,v)` (`index.html:1193-1194`) obalují `localStorage.getItem/setItem` s JSON parse/stringify. Veškerý přístup jde přes ně (1 přímé `localStorage.removeItem` na `index.html:3494`).

| Klíč | Tvar dat | Účel |
|---|---|---|
| `ci_{posId}` | `{inTs, inTime, out?, outTime?, outTs?, dur?, gpsLat?, gpsLng?, gpsDist?, gpsFlag?}` | Check-in dnešní návštěvy na POS |
| `vlog_{date}` | `[{posId, posName, inTime, outTime, dur?, flag?}]` | Denní log návštěv |
| `daystart_{date}` | `{ts, time, posId, posName}` | Začátek pracovní doby (první check-in) |
| `supply_{posId}_{date}` | `{items, receiver, sigData, confirmed, at, sapCodes?}` | Spotřební materiál (podpis + SAP) |
| `merch_{posId}_{date}` | `[{n, done}]` | Merch checklist (bez podpisu) |
| `poscard_{posId}` | `[...]` | Karta POS (poznámky) |
| `visits_{posId}` | `[{date, time, dur, week, day, technik, gpsOk}]` (max 20) | Historie návštěv per POS |
| `assign_{posId}` | `dayIdx \| null` | Přiřazení POS ke dni týdne |
| `admin_tasks` | `[{id, text, priority, target, groups?, region?, posId?, technikName?, deadline?, note?, status?, createdAt}]` | On-top úkoly z velína |
| `editor_briefing` | string | Ranní briefing text (admin) |
| `editor_alert` | string | Globální upozornění |
| `editor_idt` | string | Zpráva specifická pro IDT |
| `editor_ka` | string | Zpráva specifická pro KA/PETROL/CORN |
| `editor_campaigns` | `[...]` | Kampaně (editovatelné) |
| `inv_catalog` | `{vnitrni: [...], venkovni: [...]}` | Katalog inventáře |
| `gps_flags_{date}` | `[{posId, posName, time, dist, lat, lng}]` | GPS anomálie (>1km) za den |
| `approval_{posId}` | `'ok' \| 'rej' \| null` | Schválení návštěvy adminem |

**Shoda s CLAUDE.md:** 1:1, žádné chybějící ani navíc klíče. Drobný rozdíl: CLAUDE.md zmiňuje obecně `editor_{briefing|alert|idt|ka}` — ve skutečnosti jsou to 4 samostatné klíče, ne jeden parametrizovaný.

---

## 3. Datový model

- POS data jsou **hardcoded** v JS konstantě `REAL_DATA` (začíná ~`index.html:948`), obsahuje:
  - `weeks` — objekt podle týdne (`'24'`, `'25'`, `'26'`...), každý obsahuje array POS objektů
  - `techs` — 27 technických profilů s lat/lng pro mapu
- POS objekt: `{id, n (název), a (adresa), typ, k (kategorie), partner, lat, lng, v (visited), d (den), photos, notes, taskState, refs, inventory}`
- Runtime state `posData` (`index.html:1167`, `const posData={}`) — pracovní kopie `REAL_DATA.weeks` rozšířená o doplněná pole.

---

## 4. Detekce kanálu (IDT/KA/PETROL/CORN)

`index.html:1172-1175`:
```js
const rawTyp = p.typ || 'IDT';
const isCornPos = rawTyp === 'CORN' || (p.k && p.k.startsWith('9')) || p.typ === 'CORN';
const typ = isCornPos ? 'CORN' : rawTyp;
```
CORN je vyhodnocen jako **samostatný kanál**, ne podkategorie KA — v souladu s pravidlem #2 v CLAUDE.md. Šablony úkolů a merch položek jsou definovány zvlášť pro IDT/PETROL/KA/CORN (konstanty kolem `index.html:963-1111`).

---

## 5. Detekce dne a týdne

`index.html:3084-3114`:
- `getTodayDayIdx()` — vrací 0–4 (Po–Pá) nebo `null` o víkendu.
- `getCurrentWeekNum()` — ISO týden.
- `isToday/isFuture/isPast(dayIdx)` — odvozeno z `getTodayDayIdx()`.

Minulé dny zamčené (jen přehled), dnešní aktivní, budoucí plánovatelné — odpovídá pravidlu #5.

---

## 6. GPS ověření check-inu

`index.html:2757-2844`:
- `getDistanceKm(lat1,lon1,lat2,lon2)` — haversine vzorec.
- `verifyGPS(posLat, posLng, callback)` — `navigator.geolocation.getCurrentPosition`, spočítá vzdálenost, vrací badge: zelená `<300m`, oranžová `300m–1km`, červená `>1km`.
- **Flag do `gps_flags_{date}` se zapisuje jen při `dist > 1km`** (`index.html:2810,2820-2823`) — pásmo 300m–1km se v UI ukáže jako varování, ale nezaloží admin flag. Drobný nesoulad oproti duchu pravidla #9, zvážit při refaktoru.

---

## 7. Priority úkolů

Žádné explicitní číselné pole `priority` — pořadí vykreslení (`renderTasks`, `index.html:1655+`) určuje vizuální/funkční prioritu: `servis` (červená) → `template` → `on_top` → `own`. Odpovídá CLAUDE.md.

---

## 8. Tři koncepty materiálu — potvrzeno oddělené

| Koncept | Storage klíč | Podpis | SAP | Kód |
|---|---|---|---|---|
| Merch | `merch_{posId}_{date}` | ne | ne | `index.html:1734-1757` |
| Spotřební materiál | `supply_{posId}_{date}` | ano (canvas, `index.html:1629-1648`) | ano | `index.html:1595-1654` |
| Inventory | neperzistentní (in-memory `p.inventory`) | ne | ne | `index.html:1758-1893` |

**Pozor:** Inventory se v prototypu NEukládá do localStorage (na rozdíl od ostatních dvou) — ztrácí se po refreshi. Při migraci na DB (Fáze 3) to přirozeně zmizí, ale je dobré to vědět při testování prototypu.

---

## 9. AI integrace (Claude API)

`index.html:2849-2981`:
- `generateAIBriefing()` (2849) a `generateAIReport()` (2904) volají `fetch('https://api.anthropic.com/v1/messages', {model:'claude-sonnet-4-6', ...})` **přímo z frontendu**.
- Žádný API klíč v kódu — prototyp spoléhá na to, že prostředí (např. proxy) injektuje autorizaci, nebo volání selže a spustí se fallback.
- Fallback: hardcoded briefing hlášky (2891-2897) a `generateMockReport()` (2963-2981) generovaný z reálných dat.
- **Bezpečnostní dluh:** porušuje pravidlo #12 (klíč nikdy ve frontendu) — ale je to záměrně dočasné řešení prototypu, MIGRATION_PLAN Fáze 4 to řeší přesunem na server.

---

## 10. Admin/Velín funkce — potvrzeno přítomné

- **Mapa** (Leaflet, `initAdminMap`, `index.html:1953-1976`) — 27 markerů, barvy podle stavu, klikací filtr regionů.
- **Flagy** — GPS anomálie, krátké návštěvy (<10min), vykreslení `index.html:2277-2389`.
- **Schválení návštěv** — `renderSchvaleni`/`approveVisit` (`index.html:2644-2756`), stav `ceka/ok/zamitnuto`.
- **Editor** — texty, kampaně, inventory katalog (`index.html:3018-3709`), vše přes `editor_*`/`inv_catalog` klíče, okamžitě se promítá technikům (čtou stejný localStorage).
- **AI report** — `generateAIReport`/`renderAIReport` (2904-3016).

Vše odpovídá PROJECT_CONTEXT.md sekci 4.

---

## 11. Zjištěné nesoulady a rizika (k řešení v dalších fázích, NE měnit teď)

1. **SAP kódy nemají explicitní zámek** proti re-editaci po odeslání zásobování — funkčně to dnes nevadí (UI to nenabízí), ale chybí to jako tvrdé pravidlo v datovém modelu. Ošetřit při návrhu DB schématu (Fáze 3) a v `lib/data.js` (Fáze 1).
2. **GPS flag práh** — admin flag se zakládá jen `>1km`, i když UI ukazuje varování už od 300m. Rozhodnutí, jestli sjednotit, je na Pavlovi.
3. **Inventory není perzistentní** v localStorage (jen runtime). Mizí po refreshi stránky — netýká se to Fáze 3 (DB to vyřeší), ale ovlivňuje testování prototypu.
4. **AI klíč/endpoint volaný přímo z frontendu** — očekávaný dočasný stav prototypu, nutně řešit v Fázi 4.
5. **Žádná validace vstupů** (text úkolů, jméno přijímajícího u zásobování) — XSS riziko při zobrazení adminovi/technikům. Řešit při psaní `lib/data.js` a/nebo na backendu (sanitizace).
6. **Vysoká duplicita kódu** v `renderXyz` funkcích a editorech IDT/KA (téměř identický markup) — kandidát na sjednocení při tahání do komponent (Fáze 1.5).
7. **Žádný build/minifikační nástroj** — očekávané u prototypu, řeší se zavedením Vite (pokud zvoleno React) nebo zachováním vanilla + ručním rozdělením souborů.

Žádné z nalezených rizik neporušuje žádné z 13 pravidel v CLAUDE.md fatálně — jde o detaily k doladění při migraci, ne o blokující bugy.

---

## 12. Kvalita kódu — shrnutí

- Pojmenování: funkce/proměnné anglicky (`posData`, `renderList`), UI texty a doménové termíny česky — konzistentní se záměrem (doménový jazyk česky, kód anglicky je v pořádku, CLAUDE.md cílí na doménová slova, ne na celý kód).
- Zkratky proměnných: `cWeek`, `cDay`, `cIdx`, `p` (POS), `t` (technik) — čitelné v kontextu, ale bez komentářů by mátly nového vývojáře.
- Sekce kódu jsou viditelně oddělené komentářovými nadpisy.
- Žádné TODO/FIXME komentáře v kódu.
- Jediná externí závislost: Leaflet.js (CDN, bez verze pinned lokálně, ale URL obsahuje `@1.9.4`).
