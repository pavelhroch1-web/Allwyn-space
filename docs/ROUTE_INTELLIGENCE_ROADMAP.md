# ROUTE_INTELLIGENCE_ROADMAP.md — Allwyn Space

> Dlouhodobá evoluce `js/routeEngine.js` od dnešního stavu (trasa pro jednoho
> technika, haversine mock, manuální výchozí bod) až k AI asistentovi
> technika a Velína. Schváleno Pavlem 2026-06-26 jako směr, NE jako
> okamžitý implementační příkaz — každý bod jde do `/build` samostatně,
> po jednotlivém schválení, stejně jako dosavadní práce na VisitStore.
>
> Princip platný pro celý dokument: **žádná predikce/doporučení se
> neukazuje, dokud pro ni neexistuje reálný datový zdroj** (žádné fake
> KPI, žádný vymyšlený risk score — viz `CLAUDE.md` pravidlo o datech).

---

## Dnešní stav (audit 2026-06-26)

- Pořadí návštěv uvnitř dne: import z Tourplanu, nebo uložené/optimalizované
  pořadí (`route_order_{week}_{day}` v localStorage).
- Den návštěvy je fixní z Tourplanu — RouteEngine ho nepřeřazuje.
- Vzdálenost: `haversineKm × ROAD_COEFFICIENT (1.3) / AVERAGE_SPEED_KMH (45)`
  — vědomý mock, adaptér pro Google Maps Distance Matrix připraven
  (`RouteEngine.providers.googleMaps`), ale neimplementován.
- Optimalizace: exact brute-force do 8 zastávek, nad to 2-opt heuristika.
  Cost function = km + tvrdá penalizace za otevírací dobu + malá SLA
  penalizace za pozici urgentní POS. Žádné fake skóre, jen reálná čísla.
- GPS: tři oddělená použití — manuální výchozí bod dne
  (`captureStartLocation`), check-in/checkout proximity (`verifyGPS`,
  pravidlo #9 v `docs/CLAUDE.md`), GPS tag ve fotce (audit, ne routing).
- Velín fleet analytika (`RouteEngine.analyzeFleet`) dnes počítá jen
  "zbytečné km" *uvnitř* existujícího přiřazení POS→technik, nehodnotí
  přeřazení mezi techniky.

---

## FÁZE 1 — SMART ROUTE
*Co lze postavit už během pilotu, nad daty, která dnes existují nebo
vzniknou check-inem/checkoutem.*

| Funkce | Datový zdroj | Obtížnost | Byznys přínos | Konkurenční výhoda | AI/analytika |
|---|---|---|---|---|---|
| Lock navštívené POS + replan zbytku dne | `p.v`/check-in stav | Nízká | Vysoký | Nízká | Analytika |
| Automatický/domácí výchozí bod | tichý `getCurrentPosition()` + uložená `technician_home` | Nízká | Vysoký | Nízká | Analytika |
| Kapacita dne jako penalizace v cost function | `getVisitDurationMin` + pracovní doba technika | Nízká | Střední | Nízká | Analytika |
| Doporučení vynechat nízkoprioritní POS při přetížení | SLA weight + kapacita dne | Střední | Vysoký | Střední | Analytika |
| Predikce délky návštěvy podle historie | reálné `started_at`/`completed_at` z `visits` (potřebuje doběhnutý krok 3 VisitStore migrace) | Střední | Vysoký | Střední | Analytika (průměr/medián) |
| Upozornění Velínu na zpoždění v reálném čase | check-in časy vs. plán | Střední | Vysoký | Střední | Analytika (delta) |

**Datová brána fáze 1 → fáze 2:** predikce délky návštěvy potřebuje
několik týdnů reálného provozu, jinak je to jen dnešní statická
konstanta (`VISIT_DURATION_MIN`) v jiném kabátě.

---

## FÁZE 2 — ROUTE INTELLIGENCE
*Největší úspora času vedoucím i technikům, nad daty z více týdnů
provozu napříč všemi techniky.*

| Funkce | Datový zdroj | Obtížnost | Byznys přínos | Konkurenční výhoda | AI/analytika |
|---|---|---|---|---|---|
| Predikce zpoždění během dne | dnešní check-iny vs. plán, kumulativní delta | Střední | Vysoký | Střední | Analytika (extrapolace trendu) |
| Pravděpodobnost, že se návštěva nestihne | historie nestihnutí za podobných podmínek | Střední | Vysoký | Vysoká | Analytika nejdřív, AI později s dostatkem dat |
| Plánování podle historické dopravy (nahrazuje statický koeficient/rychlost) | rozdíl haversine odhadu vs. reálný čas mezi check-iny, agregovaný per region/čas dne | Vysoká | Vysoký | Vysoká | Analytika (regresní korekce) |
| Doporučení přesunu POS mezi techniky | geometrie + workload (rozšíření `analyzeFleet`) | Střední | Vysoký | Vysoká | Analytika |
| **Region Optimization Advisor** (detail níže) | výchozí bod (medián), POS souřadnice, km/měsíc, frekvence návštěv | Střední | Vysoký | Vysoká | Analytika (vysvětlitelná, bez AI) |
| Automatické přesuny mezi dny | otevírací doba + kapacita + flexibilní okno návštěvy (nutná rozšíření datového modelu) | Vysoká | Vysoký | Střední | Analytika |
| Simulace "co kdyby" | nad `analyzeFleet`, exponované jako scenario nástroj | Střední | Vysoký | Vysoká | Analytika |
| Sezónnost | min. 1 sezóna/rok dat | Nízká technicky, blokováno daty | Střední | Střední | Analytika |

### Region Optimization Advisor — detailní návrh

**Zařazení:** Fáze 2, rozšíření "Doporučení přesunu POS mezi techniky" na
periodickou standalone analytickou funkci. Vyžaduje min. 6–8 týdnů
souvislých dat o výchozím bodu a trasách per technik — bez toho se report
neukazuje (raději "zatím nedostatek dat" než nejistý závěr).

**Princip:** systém NIKDY sám nepřeřazuje POS. Výstup je vždy jen
doporučení pro Velína, který rozhoduje a provádí změnu existujícím
administrativním flow.

**Data:**
- skutečný výchozí bod technika = medián/nejčastější pozice z
  `startLocationHistory` za posledních N týdnů (pole už existuje v
  `app.js`, dnes se jen nečte)
- souřadnice přidělených POS (master data, existuje)
- skutečně ujeté km/čas mezi zastávkami — odvozeno z reálných
  check-in/checkout časů a pozic (vyžaduje doběhnutý krok 3 VisitStore)
- frekvence návštěv per POS (`visits`/`sync_events` po migraci)
- kapacita/vytížení technika (workday budget vs. skutečný `totalMin`)

**Algoritmus (vysvětlitelný, bez ML):**
1. Pro každé POS spočítat medián vzdálenosti POS↔vlastní technik a
   POS↔nejbližší jiný technik v regionu (omezeno na rozumný poloměr).
2. Rozdíl pod konfigurovatelným prahem (km nebo %) → POS v normě, dál se
   nehodnotí.
3. Rozdíl nad prahem × frekvence návštěv/měsíc = reálná ztráta km/měsíc.
4. Agregace per technik: počet POS nad práh, úspora km/h měsíčně, skóre
   shody = `1 - (km nad práh / celkové km technika)`.
5. Výstupní text generován **šablonou** s konkrétními čísly, nikdy
   volným textem z AI — 100% reprodukovatelné a auditovatelné.

**Metriky:** vzdálenost POS-technik (medián za N týdnů), km/měsíc na POS,
potenciální úspora km/h, skóre shody přidělení (%), vytížení technika,
frekvence návštěv POS.

**Ochrana proti šumu:**
- medián, ne průměr ani poslední hodnota
- klouzavé okno min. 6–8 týdnů
- minimální počet pozorování, jinak "nedostatek dat" místo čísla
- hysterezní práh — POS musí být nad prahem opakovaně (např. 4 týdny po
  sobě), ne jednorázově
- práh citlivosti konfigurovatelný Velínem, ne pevný v kódu
- POS s nestabilní/ad-hoc frekvencí návštěv se nehodnotí stejně jako
  pravidelné

**Dashboard (rozšíření existujícího Fleet view, ne nová obrazovka):**
souhrnná karta celkového potenciálu (jen pokud nenulový), seznam techniků
podle skóre shody, rozbalovací detail POS per technik (vzdálenosti,
navrhovaný technik, úspora, frekvence), tlačítko "Zobrazit na mapě",
trend (chronický problém vs. nový jev). Žádné tlačítko "Přesunout" v UI.

**Garance "jen doporučení, nikdy automatika":**
- analytika má read-only přístup k `technicians`/`pos_locations`, žádnou
  write cestu na přiřazení
- žádné akční tlačítko v UI, jen informační report/export
- reálné přeřazení POS jde výhradně přes existující admin/editor flow,
  zalogované do `sync_events` jako ruční akce Velína
- textový rámec doporučení vždy "doporučujeme zvážit", nikdy "systém
  navrhuje provést"

### Hlavní filozofie Region Optimization Advisor

Primárním cílem tohoto systému **není** optimalizovat pořadí zastávek
uvnitř dne — to už dnes velmi dobře řeší `RouteEngine` (brute-force +
2-opt nad reálnými vzdálenostmi a otevírací dobou, viz výše).

Skutečnou dlouhodobou hodnotou Region Optimization Advisor je
optimalizovat **přidělení POS jednotlivým technikům** podle toho, odkud
skutečně pracují a jak se dlouhodobě pohybují — tedy úroveň nad jednou
trasou, nad jedním dnem.

Systém **nikdy automaticky nepřesouvá POS mezi techniky.** Pouze
analyzuje historická data a doporučuje vedoucímu možné změny, vždy
s vysvětlením jejich přínosu.

Každé doporučení musí být plně vysvětlitelné — pro každý návrh systém
ukáže:
- které POS jsou doporučeny k přesunu,
- kterému technikovi,
- proč právě jemu (skutečná vzdálenost od jeho výchozího bodu),
- kolik km by se ušetřilo měsíčně,
- kolik hodin jízdy by se ušetřilo,
- jaký bude dopad na vytížení obou techniků (kapacita/workload obou
  stran, ne jen toho, co POS získává),
- jaká je jistota doporučení (kolik týdnů dat za ním stojí, jak silný je
  rozdíl nad prahem).

Tím se systém posouvá z optimalizace jednotlivých tras na **strategickou
optimalizaci celé servisní sítě**. Většina plánovacích systémů na trhu
optimalizuje pouze trasu uvnitř dne — Allwyn Space navíc pomáhá
optimalizovat samotné rozdělení zákazníků mezi techniky. To je dlouhodobá
konkurenční výhoda produktu, ne automat, ale nástroj, který dělá z Velína
lepšího stratéga.

---

## FÁZE 3 — AUTONOMOUS FIELD OPERATIONS
*Z Allwyn Space platforma, kterou konkurence nemá — věci, co potřebují
rok+ reálných dat, ne sci-fi.*

| Funkce | Datový zdroj | Obtížnost | Byznys přínos | Konkurenční výhoda | AI/analytika |
|---|---|---|---|---|---|
| AI odhad skutečného konce pracovní doby (tempo technika) | roky check-in/checkout dat, predikce dopravy a délky návštěv | Vysoká | Vysoký | Vysoká | AI (regresní model nad tabulkovými daty) |
| Počasí v plánování | externí weather API + korelace s historickými odchylkami | Střední | Střední | Střední | Analytika + externí data |
| Plně autonomní týdenní plán s výjimkovým schvalováním | vše výše musí být důvěryhodné | Vysoká | Kritický | Vysoká | AI (orchestruje předchozí modely) |
| Detekce anomálií (chronické zpoždění, GPS vzorce, nevyvážené regiony) | `gps_flags`, workload index, historie napříč týmem | Střední | Vysoký | Vysoká | AI (anomaly detection), základ jako pravidla dřív |
| Prioritizace kampaní podle skutečné prodejní hodnoty POS | `sales value`/`priority score` (čekají na data) | Závisí na datech | Kritický | Vysoká | Analytika, jakmile existuje sales feed |

---

## Doporučené pořadí implementace

1. Lock visited / replan rest *(F1)*
2. Automatický/domácí výchozí bod *(F1)*
3. Kapacita dne jako penalizace *(F1)*
4. Doporučení vynechat nízkoprioritní POS při přetížení *(F1)*
5. Upozornění Velínu na zpoždění v reálném čase *(F1)*
6. Predikce délky návštěvy podle historie *(F1 → datová brána pro F2)*
7. Doporučení přesunu POS mezi techniky / Region Optimization Advisor *(F2)*
8. Simulace "co kdyby" *(F2)*
9. Predikce zpoždění během dne *(F2)*
10. Pravděpodobnost nestihnutí návštěvy *(F2)*
11. Plánování podle historické dopravy *(F2)*
12. Automatické přesuny mezi dny *(F2)*
13. Sezónnost (aktivuje se sama s daty, žádný nový vývoj nečekat dřív)
14. AI odhad konce pracovní doby *(F3)*
15. Detekce anomálií *(F3)*
16. Počasí *(F3)*
17. Plně autonomní týdenní plán *(F3)*

**Klíčové riziko:** kroky 6, 9–14 a celá Fáze 3 jsou datově podmíněné —
bez reálné historie z provozu desítek techniků přes měsíce by predikce
byla přesně to fake číslo, které `CLAUDE.md` zakazuje.
