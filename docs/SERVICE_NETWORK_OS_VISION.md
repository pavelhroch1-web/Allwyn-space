# SERVICE NETWORK OS VISION — Allwyn Space jako Operating System servisní sítě

> Strategický dokument, ne backlog. Perspektiva: Chief Transformation Officer
> servisní organizace, ne QA/dev review. Cíl: ukázat cestu od "appka pro
> 27 techniků" k "operačnímu systému, který řídí stovky až tisíce techniků
> z jednoho Velína datově, ne intuicí."
>
> Vychází z reálného stavu (viz `PROJECT_CONTEXT.md`, `CLAUDE.md`,
> `ROUTE_INTELLIGENCE_ROADMAP.md`) a z dat, která už appka sbírá nebo může
> bez problémů začít sbírat. Žádná položka tady nepředpokládá technologii,
> kterou bychom neuměli postavit, ani data, která bychom nemohli reálně
> získat z provozu.
>
> Platí jeden princip nade všemi ostatními, už dnes zakotvený v `CLAUDE.md`
> (11a): **Decision Engine nikdy nerozhoduje, jen navrhuje s evidencí a
> confidence. Strategická rozhodnutí dělá člověk.** Celý tento dokument je
> rozšíření téhle myšlenky z jednoho modulu (RouteEngine) na celou
> organizaci.

---

## 0. Shrnutí v jedné větě

Allwyn Space se z "appky na evidenci návštěv" stává **nervovým systémem
servisní sítě** — sbírá realitu z terénu v reálném čase, převádí ji na
rozhodnutelná doporučení, a uzavírá smyčku tím, že se z výsledků každého
rozhodnutí učí. Velín přestává "hledat problémy" a začíná "rozhodovat mezi
už nalezenými problémy, seřazenými podle dopadu."

---

## 1. Jaká rozhodnutí dnes dělají manažeři/dispečeři — a co může převzít systém

Rozděleno podle toho, kdo dnes rozhoduje a co se dá realisticky posunout.

| Rozhodnutí | Dnes dělá | Kdo by měl rozhodovat za 1–3 roky | Proč |
|---|---|---|---|
| Kdo navštíví kterou POS tento týden (Tourplan) | Externí systém/člověk, ručně v Excelu | **Systém navrhuje, člověk publikuje** | Dnes nejslabší článek — appka jen importuje hotové rozhodnutí (viz `PROJECT_CONTEXT.md` 7.1). Frekvence/priorita POS je počitatelná z tržeb a historie, ne intuitivní. |
| V jakém pořadí technik jede POS daný den | Technik sám / papír | **Systém navrhuje, technik potvrzuje** | Už částečně řešeno (`RouteEngine`), zbývá kapacitní penalizace a real-time replan. |
| Kterou POS přidat/odebrat technikovi trvale (rebalance regionu) | Manažer odhadem | **Systém navrhuje (Region Optimization Advisor), manažer schvaluje** | Už navrženo v `ROUTE_INTELLIGENCE_ROADMAP.md`, čeká na 6–8 týdnů dat. |
| Kdo dostane servisní tiket jako první, když je jich víc než kapacita | Manažer podle pocitu/known menu | **Systém řadí podle SLA + dopadu, manažer jen escaluje výjimky** | Data (priorita úkolu, deadline, kapacita technika) už existují, chybí jen agregovaný pohled napříč celou sítí. |
| Jestli technik podvádí / flákal se | Manažer podle "podezření" | **Systém flaguje anomálie s evidencí, manažer rozhoduje o důsledku** | GPS/čas/foto data už existují (`gps_flags`, časy návštěv) — chybí jen agregace do vzorců přes čas, ne jen jednorázový flag. |
| Kdo potřebuje školení/podporu | Manažer si všimne náhodou | **Systém detekuje vzorce (opakované chyby stejného typu), navrhuje koho školit** | Vyžaduje strukturovaná data o chybách (servisní tikety na stejné POS opakovaně, nesplněné checklisty) — sbíratelné už dnes. |
| Jak rozdělit materiál do auta na týden | Technik odhadem / manažer plošně | **Systém spočítá podle skutečné spotřeby a plánu** | Zmíněno jako budoucí fáze v `PROJECT_CONTEXT.md` 7, technicky nenáročné, čeká na normativy spotřeby. |
| Jaké kampaně/normy nasadit kam a kdy | Manažer/marketing, plošně | **Systém navrhuje cílení podle reálné výkonnosti kanálu/POS, člověk rozhoduje o byznys strategii** | Vyžaduje delší historii dat o úspěšnosti kampaní per typ POS — fáze 3+. |
| Kapacitní alokace lidí mezi regiony (kde chybí/přebývá technik) | Manažer ročně/kvartálně, odhadem | **Systém ukáže reálné vytížení a nerovnováhu, člověk rozhoduje o náboru/přesunu** | Data o vytížení (workload index) jsou přirozeným vedlejším produktem capacity modulu. |

**Co NIKDY nepřevezme systém** (a proč je to správně, ne limitace):
- Najímání/propouštění, hodnocení výkonu jednotlivce s důsledkem na mzdu/pozici
- Strategické cílení kampaní (byznys rozhodnutí, ne operační)
- Jakákoliv akce, která trvale měří/posuzuje konkrétního člověka bez možnosti zpětné vazby od něj

Toto je v souladu s pravidlem 11a v `CLAUDE.md` — systém navrhuje, evidence
je transparentní, člověk nese odpovědnost za dopad na lidi.

---

## 2. Jaká data už máme a jaká chybí

### Už sbíráme (nebo sbírat začneme bez nové integrace)
- **Identita a struktura**: POS ID, adresa, kanál (IDT/KA/PETROL/CORN), region, přiřazený technik, terminály
- **Geografie**: GPS souřadnice POS (částečně — viz mezery níže), GPS check-in/checkout technika
- **Čas**: start/konec návštěvy, délka návštěvy, pracovní doba dne, datum/týden
- **Úkoly a jejich splnění**: servis/template/on_top/own, splněno/nesplněno, priorita
- **Materiál**: co bylo osazeno (merch), co bylo předáno (spotřební materiál + podpis + SAP), stav inventáře per POS
- **Foto evidence**: před/po/detail na každé návštěvě
- **Kvalita procesu**: GPS vzdálenost od adresy při check-inu (anti-fraud signál), flagy krátkých návštěv
- **Historie POS**: karta POS (trvalý provozní deník — zavírá, rekonstrukce, problémy)
- **Rozhodovací stopa**: Decision objekty s evidencí a stavem (pending/approved/modified/deferred/rejected) — klíčové, protože tohle JE budoucí trénovací data pro zlepšování doporučení

### Chybí, ale dá se získat bez velké bolesti
| Data | Proč chybí dnes | Jak získat |
|---|---|---|
| Tržby/obrat per POS | Objednatel je nedodal | Měsíční export z Allwyn POS systému (dohodnuto, viz `PROJECT_CONTEXT.md` 7.1, krok A) |
| Reálná GPS všech POS (ne mock/region scatter) | Master data import nekompletní | Doplnění mastr dat objednatelem nebo geocoding API jednorázově |
| Skutečná doba jízdy mezi POS (ne haversine mock) | Žádná distance API integrace | Google/Mapbox Distance Matrix — adaptér už připraven (`routeEngine.js`), jen neaktivovaný |
| Frekvence/normativ návštěv per typ POS (kolikrát/měsíc má být navštívena) | Tourplan to dnes určuje externě, appka nepřebírá logiku | Dohodnout s objednatelem pravidlo (smluvní frekvence × kanál × tržby) |
| Skutečná délka návštěvy podle typu úkolu (ne statická konstanta) | Potřebuje měsíce provozu | Akumuluje se samo, jakmile běží VisitStore (`started_at`/`completed_at`) |
| Výchozí bod technika (odkud reálně vyjíždí) | Manuální zadání, nepoužívá se v analytice | `startLocationHistory` pole už existuje v `app.js`, jen se nečte — triviální |
| Strukturovaná data o "proč se úkol nestihl" | Dnes jen binární splněno/nesplněno | Doplnit důvod při odkladu (uzavřená nabídka, ne volný text — konzistentní s pravidlem 7 v `CLAUDE.md`) |
| Historie cen/spotřeby materiálu | SAP kódy jsou mock | Reálné SAP kódy a normativy spotřeby od objednatele (slíbeno) |
| Počasí | Žádná integrace | Externí weather API, triviální technicky, nízká priorita |

### Chybí a vyžaduje organizační rozhodnutí, ne jen vývoj
- Pravidlo, **podle čeho se určuje frekvence návštěvy** (tržby? kanál? smlouva? kombinace?) — bez tohoto appka nemůže legitimně generovat Tourplan (viz `PROJECT_CONTEXT.md` 7.1)
- Jestli externí Tourplan systém zůstane běžet paralelně, nebo appka postupně převezme jeho roli (organizační, ne technická otázka)
- Definice "kvality návštěvy" mimo merch/foto — co přesně dělá návštěvu dobrou z pohledu byznysu (jen splněné úkoly? i kvalita komunikace s obsluhou POS?)

**Princip platný pro celý dokument** (z `CLAUDE.md`, nekompromisní): žádné
číslo v UI bez dohledatelného zdroje. Tam, kde výše chybí data, se modul v
sekci 3 neaktivuje s fake hodnotou — zobrazí se jako "čeká na data", přesně
jak to dělá `ROUTE_INTELLIGENCE_ROADMAP.md` dnes.

---

## 3. Decision Engine moduly — co by měly postupně vznikat

Rozšíření dnešní Vrstvy 4 (`PLANNER_ARCHITECTURE.md`) z jednoho engine
(route) na rodinu modulů, které sdílí stejnou kostru: **vstup → evidence →
návrh → confidence → člověk rozhoduje → výsledek se měří → engine se učí.**

| Modul | Otázka, na kterou odpovídá | Datová brána (kdy se smí aktivovat) | Fáze |
|---|---|---|---|
| **Route Intelligence** | Jak nejlépe objet POS dnes? | Existuje dnes (haversine), reálná data → F1/F2 | Existuje, rozvíjí se (viz `ROUTE_INTELLIGENCE_ROADMAP.md`) |
| **Capacity Engine** | Má technik/region dost kapacity na to, co po něm chceme? | Pracovní doba + počet úkolů — existuje dnes | F1 |
| **Coverage Intelligence** | Která POS je zanedbávaná vzhledem ke své hodnotě? | Tržby per POS (čeká na data, krok A z `PROJECT_CONTEXT.md`) | F1–F2 |
| **Region Optimization Advisor** | Má technik POS, které jsou geograficky mimo jeho rajon? | 6–8 týdnů GPS historie | F2 (navrženo) |
| **Quality & Fraud Signal** | Je tahle návštěva/technik/POS statisticky podezřelá? | GPS+čas+foto historie, agregovaná přes týdny (ne jednorázový flag) | F2 |
| **Productivity Benchmarking** | Jak si technik stojí vůči srovnatelným kolegům (stejný region/kanál/POS mix)? | Historie návštěv napříč týmem, normalizovaná podle typu POS | F2 |
| **SLA & Priority Engine** | Co je dnes nejdůležitější napříč CELOU sítí, ne jen jedním technikem? | Agregace úkolů+priorit+deadline napříč regiony | F2 |
| **Training & Skill Signal** | Kdo opakovaně dělá stejnou chybu / potřebuje podporu? | Strukturovaná data o typu chyby/nesplnění (chybí dnes, viz sekce 2) | F2–F3 |
| **Merchandising Compliance** | Jsou kampaně/totemy osazené správně napříč sítí, ne jen na jedné POS? | Foto + checklist data, agregovaná | F2 |
| **Risk & Anomaly Detection** | Co se v síti chová jinak než obvykle (chronické zpoždění, neobvyklý GPS vzorec)? | Historie napříč týmem, měsíce dat | F3 |
| **Demand/Sales Prediction** | Kde vznikne příležitost/riziko propadu tržeb dřív, než se to stane? | Tržby + frekvence + sezónnost, roky dat | F3 |
| **Tourplan Generator** | Kdo by měl jet kam a jak často, automaticky? | Sjednocení Coverage + Capacity + Route Intelligence | F3 (popsáno jako krok C v `PROJECT_CONTEXT.md` 7.1) |

Klíčová architektonická poznámka: **tohle nejsou samostatné appky.** Sdílí
jeden Decision objekt model (`pending|approved|modified|deferred|rejected`,
evidence, confidence) a jeden feed ve Velínu. Modul se liší jen tím, JAKÁ
data čte a JAKÝ návrh generuje — ne tím, jak se s návrhem nakládá.

---

## 4. Velín za 6 měsíců / 1 rok / 3 roky

### Za 6 měsíců — "Operační pravda v reálném čase"
- Živá mapa + capacity přehled fungují spolehlivě na reálných datech pro
  pilotní skupinu techniků (dnešní 0.1 stabilizováno, bez bugů jako
  re-scan/hardcoded týden)
- Decision feed obsahuje první 2–3 moduly (Route, Capacity, první verze
  Quality signálu) — Velín dostává seřazený seznam "na co se dívat dnes",
  ne nutnost sám hledat
- Manažer tráví čas **rozhodováním**, ne **pátráním** — to je měřitelný
  posun (čas od "otevřel appku" do "udělal rozhodnutí")

### Za 1 rok — "Decision Engine s historií"
- Coverage Intelligence a Region Optimization Advisor aktivní (data
  z 6–8+ měsíců provozu existují)
- Tourplan shadow mode běží — appka generuje návrh vedle reálného importu,
  Velín porovnává přesnost
- Productivity Benchmarking ukazuje srovnání techniků v rámci stejného
  typu práce — ne žebříček, ale kontext pro rozhodování o podpoře/školení
- Uzavřená zpětná vazba (sekce 8) má první reálná data — vidíme, která
  doporučení se potvrdila, která ne

### Za 3 roky — "Operating System servisní sítě"
- Appka řídí stovky techniků napříč regiony stejným jádrem (multi-tenant
  per region/firma)
- Tourplan Generator nahradil externí systém (nebo běží paralelně s vyšší
  přesností) — krok C z `PROJECT_CONTEXT.md` 7.1
- Risk/Anomaly a Demand Prediction moduly aktivní s dostatkem historie
- Velín přestal být "dashboard pro jednoho manažera" a je **řídicí centrum
  pro víceúrovňové řízení** (regionální manažer vidí svůj region, vrchní
  manažer vidí celou síť, stejná data, jiná agregace)
- Systém umí simulovat "co kdyby" scénáře (přidání technika, změna
  frekvence, nová kampaň) dřív, než se rozhodnutí reálně udělá

---

## 5. Co bude systém detekovat a doporučovat bez zásahu člověka

**Princip:** detekce a výpočet návrhu běží automaticky a kontinuálně.
Realizace návrhu (cokoliv, co ovlivní data/lidi/byznys) vždy čeká na
schválení — to je přesně hranice z pravidla 11a v `CLAUDE.md`.

Bez zásahu člověka systém **bude**:
- Počítat capacity/coverage/kvalitu v reálném čase na pozadí
- Generovat a řadit Decision feed podle dopadu a urgentnosti
- Upozorňovat na anomálie (GPS, čas, vzorce) hned, jak vzniknou
- Učit se z výsledků předchozích rozhodnutí (aktualizovat confidence skóre)
- Archivovat a historizovat — nic se neztratí, vše je dohledatelné

Bez zásahu člověka systém **nikdy nebude**:
- Měnit přiřazení POS↔technik
- Publikovat plán technikům
- Posuzovat "vinu" technika a vyvozovat důsledek
- Měnit kampaně, priority vah, byznys pravidla
- Mazat/upravovat historii pro vyhlazení čísel

---

## 6. KPI, která budou skutečně řídit síť

Ne KPI "protože to vypadá dobře v reportu" — KPI, podle kterých se dá reálně
rozhodovat a srovnávat napříč regiony/lidmi/časem.

| KPI | Co měří | Zdroj dat (musí existovat) |
|---|---|---|
| **Coverage ratio** | % POS navštívených podle smluvní/optimální frekvence | Tržby/frekvence pravidlo + skutečné návštěvy |
| **Capacity utilization** | Skutečně odpracovaný čas / dostupná kapacita | Check-in/checkout časy |
| **Route efficiency** | Skutečné km a čas vs. optimální (RouteEngine baseline) | GPS + RouteEngine výpočet |
| **SLA compliance** | % servisních úkolů splněných v deadline | Úkoly s deadline + completed_at |
| **Quality score** | % návštěv bez anomálie (foto kompletní, doba v normě, GPS OK) | Foto + checklist + GPS data |
| **Merchandising compliance** | % POS s kampaní osazenou podle plánogramu | Foto + checklist per kampaň |
| **Fraud/anomaly rate** | Podíl návštěv s opakovaným podezřelým vzorcem (ne jednorázový flag) | Agregace GPS/čas přes týdny |
| **Decision acceptance rate** | % návrhů Decision Engine, které Velín schválí beze změny | Decision objekty (approved/modified/rejected) — **toto je metrika důvěry v systém samotný** |
| **Region balance index** | Rozptyl vytížení/efektivity mezi techniky ve stejném regionu | Capacity + Route data napříč týmem |

**Klíčová metaKPI**: *Decision acceptance rate* je důležitější, než se zdá —
měří, jestli Decision Engine reálně pomáhá, nebo jen generuje šum, který
Velín ignoruje. Pokud `rejected` roste, modul potřebuje přeladit práh nebo
mu chybí kontext, ne "Velín to nechápe".

---

## 7. Co musí vždy rozhodovat člověk vs. co může být automatizované

Tabulka navazuje na sekci 1, ale obecněji — jako trvalé architektonické pravidlo:

**Vždy člověk:**
- Cokoliv s dopadem na konkrétního člověka (hodnocení, důsledek, školení, mzda)
- Cokoliv, co měří poprvé bez dostatečné historie dat (raději "nedostatek dat" — viz `CLAUDE.md` no-fake-data pravidlo)
- Strategická alokace (kde najmout, kam expandovat, jaké kampaně cílit)
- Jakákoliv změna, která se nedá vrátit jedním klikem (přesun POS, zrušení regionu)

**Může být automatizované (po schválení pravidla, ne po každé instanci):**
- Pořadí návštěv v rámci dne (RouteEngine, dnes)
- Řazení Decision feedu podle priority
- Routinní alerty (zpoždění, GPS odchylka) — notifikace, ne akce
- Noční přepočet/kalibrace modelů na nová data
- Generování reportů a souhrnů

Hranice mezi nimi se posunuje **postupně a měřitelně**: modul smí
automatizovat víc instancí stejného typu rozhodnutí až poté, co `Decision
acceptance rate` pro ten typ dlouhodobě prokáže vysokou shodu s lidským
rozhodnutím. To je mechanismus, ne jen slib.

---

## 8. Uzavřená zpětná vazba — jak se systém reálně zlepšuje

```
Systém doporučí (Decision objekt: návrh + evidence + confidence)
        ↓
Člověk rozhodne (approved / modified / deferred / rejected)
        ↓
Realizace (přes existující admin/editor flow — nikdy automaticky)
        ↓
Systém měří výsledek (skutečný dopad: ušetřené km, zlepšená coverage,
        splněný SLA, výsledek se sám projeví v datech příští týden/měsíc)
        ↓
Engine porovná predikci vs. realitu → upraví confidence/práh pro
        příští podobný návrh
        ↓
(zpět na začátek, s lepším modelem)
```

Klíčové detaily, které tuhle smyčku odlišují od "dashboard s grafy":
- **`modified` je nejcennější signál**, ne jen ano/ne — říká, že směr byl
  správný, ale práh/rozsah špatně odhadnutý (už zakotveno v `CLAUDE.md` 11a)
- Měření výsledku musí být **automatické a objektivní** (km, čas, splněno/
  nesplněno), ne subjektivní zpětné hodnocení člověkem — jinak smyčka měří
  jen to, co si manažer pamatuje, ne realitu
- Smyčka se nesmí uzavírat za týdny — pro Route/Capacity je to dny, pro
  Region/Coverage týdny, pro Risk/Demand měsíce. Každý modul má svůj
  vlastní cyklus, podle toho, jak rychle se realita měnitelná projeví

---

## 9. Obrazovky/pohledy centrálního Velína pro řízení celé republiky

Dnešní Velín (živá mapa, detail technika, schválení, editor) je základ pro
**jednoho manažera nad jedním týmem.** Pro řízení celé republiky přibývá
vrstva agregace a hierarchie, ne nová appka:

| Pohled | Pro koho | Co ukazuje |
|---|---|---|
| **Network Overview** (nový) | Vrchní manažer | Mapa ČR s agregací po regionech (ne 27 jednotlivých bodů) — coverage/capacity/quality skóre per region, barevně |
| **Decision Feed** (rozšíření dnešních flagů) | Všichni manažeři | Jednotný seřazený seznam návrhů ze všech modulů, filtrovatelný podle regionu/technika/typu | 
| **Region Drilldown** | Regionální manažer | Dnešní "detail technika" pohled, ale agregovaný za celý region — dnešní Velín pohled, jen o úroveň výš |
| **Technik Detail** | Existuje dnes | Beze změny v principu, jen napojený na víc modulů (historie, training signál) |
| **Simulation / What-if** | Vrchní manažer | "Co kdyby přidáme technika do RSE" / "co kdyby zrušíme tuhle POS" — nad `analyzeFleet`, bez zápisu do reálných dat |
| **Decision Trust Dashboard** (nový) | Vrchní manažer, product owner appky | Acceptance rate per modul — kde systému věříme, kde ne, kde potřebuje přeladit |
| **Compliance/Audit View** | Vrchní manažer, compliance | Karta SAP odpisů, fraud signálů, historie schválení — pro případnou kontrolu/audit |

Architektonicky: **stejná datová vrstva, jiná agregace podle role** — žádný
nový datový model, jen víceúrovňové filtrování/groupby nad existující
strukturou POS→technik→region.

---

## 10. "Operating System pro řízení servisní firmy" — pokud bychom stavěli od nuly

Tři vrstvy, žádná víc:

```
VRSTVA 1 — REALITY LAYER (sbírej pravdu z terénu)
   GPS, čas, foto, úkoly splněné/nesplněné, materiál, tržby
   → Nikdy odhad. Vždy dohledatelný zdroj.

VRSTVA 2 — INTELLIGENCE LAYER (Decision Engine moduly)
   Route, Capacity, Coverage, Quality, SLA, Region, Risk, Demand...
   → Každý modul: vstup → evidence → návrh → confidence.
   → Žádný modul se neaktivuje bez datové brány (dost historie).

VRSTVA 3 — DECISION LAYER (lidé rozhodují, systém pamatuje)
   Velín na všech úrovních (technik → region → síť)
   → Člověk rozhoduje, systém realizuje přes existující flow,
     měří výsledek, učí se.
```

To je přesně struktura, kterou Allwyn Space už dnes částečně má
(`PLANNER_ARCHITECTURE.md` Vrstva 1–4, `ROUTE_INTELLIGENCE_ROADMAP.md`
Fáze 1–3) — jen pro jeden modul (route). Tenhle dokument říká: **stejnou
kostru replikovat na zbytek operace**, ne stavět vedle ní něco nového.

Rozdíl mezi "appkou pro evidenci" a "Operating System servisní firmy" není
v technologii. Je v tom, že OS **pamatuje každé rozhodnutí, měří jeho
výsledek, a je transparentně auditovatelný** — od prvního dne, ne jako
dodatečná funkce. Tohle Allwyn Space už dělá (Decision objekt s evidencí
a stavem). Zbytek je rozsah, ne vynález.

---

## Co z tohohle nedělat hned

Tento dokument je **směr na roky**, ne příkaz k buildu. Stejné pravidlo,
jaké platí pro `ROUTE_INTELLIGENCE_ROADMAP.md`: každý modul jde do `/build`
samostatně, po jednotlivém schválení, až existuje datová brána pro něj.
Nejbližší realistický krok zůstává to, co je rozpracované: stabilizace
pilotu (0.1) a první kroky Route Intelligence Fáze 1.
