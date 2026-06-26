# PLANNER_ARCHITECTURE.md — Allwyn Space

> Architektonický princip pro plánovač návštěv, schválený Pavlem 2026-06-26.
> Nejde o změnu byznys logiky ani pravidel — jde o oddělení odpovědnosti mezi
> tři vrstvy, které dnes (a v budoucnu) řeší tři zcela odlišné otázky.
> Tento dokument je referenční rámec pro **budoucí rozvoj** plánovače —
> existující kód se kvůli němu sám od sebe nepřepisuje; každá vrstva se
> dotahuje samostatně, přes `/think` → `/build`, stejně jako ostatní práce
> na produktu.

---

## Proč rozdělení vrstev

Plánovač se dnes i v budoucnu ptá na tři různé otázky, které mají různý
časový horizont, různá vstupní data a různé riziko chyby:

1. **Co se má navštívit tento týden?** (byznysová priorita, kapacita)
2. **Jak to nejefektivněji objet?** (geografie, čas, otevírací doba)
3. **Kdo by to měl dlouhodobě obsluhovat?** (strategické přidělení POS)

Pokud tyto otázky řeší jeden kus kódu najednou, každá nová byznys pravidlo
("přidej bodování za kampaň X") riskuje rozbití routování nebo naopak.
Oddělení vrstev znamená, že nová byznys komponenta = nový sčítaný blok,
ne zásah do algoritmu trasy.

---

## Vrstva 1 — Business Selection Engine

**Otázka:** Které POS si tento týden zaslouží místo v omezené kapacitě
technika?

**Vstupy** (existující nebo plánované zdroje, žádná fake data):
- PTT (plán/harmonogram z Tourplanu)
- CORE/NORMAL klasifikace POS
- aktivní kampaně (`editor_campaigns`)
- GAP pravidla (mezera od poslední návštěvy)
- historie návštěv (`visits_{posId}` / VisitStore)
- neglected bonus (dlouho nenavštíveno)
- Pareto váha (POS s vysokou tržní hodnotou — čeká na `salesValue`,
  viz `PROJECT_CONTEXT.md` 7.1)
- kapacita technika (pracovní doba, viz `docs/CLAUDE.md` pravidlo #4)
- obchodní pravidla Velína

**Výstup:** pouze seznam vybraných POS pro daný týden/technika. Tato
vrstva **nerozhoduje o pořadí ani o geografii** — to je práce Vrstvy 2.

**Dnešní stav:** v kódu zatím neexistuje jako samostatný modul — výběr
POS na týden dělá technik sám (`docs/CLAUDE.md` pravidlo #6: "technik
začíná s prázdným plánem"). `priorityScore`/`salesValue` v `js/posModel.js`
jsou dnes placeholder `null` (čekají na datový zdroj). Až vznikne, bude to
samostatná vrstva nad `posModel.js`, ne zásah do `RouteEngine`.

---

## Vrstva 2 — Route Engine

**Otázka:** Jak navštívit už vybrané POS co nejefektivněji?

**Vstupy:** GPS, otevírací doba, cestovní náklad (km/min), kapacita dne.

**Patří sem:** GPS clustering, denní rozdělení, optimalizace pořadí,
`RouteEngine` (brute-force ≤8 zastávek / 2-opt nad 8), TSP heuristiky,
opening hours check.

**Výstup:** pořadí zastávek + metriky trasy (km, min, porušení otevírací
doby). **Nevybírá nové POS** — pracuje jen s tím, co dostane na vstupu.

**Dnešní stav:** existuje a funguje — `js/routeEngine.js`. Toto je vrstva,
do které zasáhla implementace "Lock navštívené POS" (roadmap F1 #1):
`RouteEngine` dál pracuje jen s libovolnou podmnožinou POS, kterou mu dá
volající kód — princip vrstvy se tím potvrdil, ne porušil.

---

## Vrstva 3 — Region Optimization Advisor

**Otázka:** Má tato POS dlouhodobě správně přiděleného technika?

Nejde o plánování týdne ani trasy — jde o dlouhodobou analytiku nad týdny
provozu (viz `docs/ROUTE_INTELLIGENCE_ROADMAP.md`, FÁZE 2, kde je tato
vrstva detailně rozepsaná — algoritmus, prahy, dashboard, garance "jen
doporučení, nikdy automatika").

**Vstupy:** skutečné výchozí body techniků (medián za N týdnů), dlouhodobé
trasy, vytížení, geografie, úspory km, přetížení regionů.

**Výstup:** doporučení pro Velína (nikdy automatická změna přiřazení).

**Dnešní stav:** koncepčně navržena v `docs/ROUTE_INTELLIGENCE_ROADMAP.md`,
implementace čeká na 6–8 týdnů reálných dat (datová brána popsaná tam).

---

## Modular Business Score (Vrstva 1, budoucí rozšíření)

Až bude Vrstva 1 implementována, skóre výběru POS nebude jedna funkce
počítaná na jednom místě, ale součet nezávislých komponent:

```
BusinessScore =
  PTT +
  CoreBonus +
  CampaignPriority +
  VisitUrgency +
  NeglectedBonus +
  ParetoWeight +
  StrategicBonus +
  RegionWeight
```

Každá komponenta = vlastní funkce s jasnou odpovědností a jasným datovým
zdrojem (žádná komponenta nesmí vracet vymyšlené číslo — platí stejné
pravidlo "žádná fake data" jako pro celý projekt, viz `CLAUDE.md`). Nové
byznys pravidlo = nová komponenta přidaná do součtu, ne přepis celého
plánovače.

### Explainable Planning

Každé vybrané POS musí umět plánovač vysvětlit rozpadem skóre, např.:

```
CORE                +30
TOP Pareto           +18
Nová kampaň          +12
Dlouho nenavštíveno  +10
Region bonus          +5
Vzdálenost            −4
─────────────────────────
Business Score        71
```

Vedoucí i technik musí vždy vidět, **proč** byla konkrétní provozovna
vybrána — plánovač nesmí být black-box. Tento požadavek platí pro
jakoukoliv budoucí implementaci Vrstvy 1, ne jen jako nice-to-have.

---

## Shrnutí — kdy se která vrstva dotýká kódu

| Vrstva | Co řeší | Dnešní implementace | Budoucí rozšíření |
|---|---|---|---|
| 1 — Business Selection | Co navštívit | technik vybírá sám, `posModel.js` placeholdery | Modular Business Score, Explainable Planning |
| 2 — Route Engine | Jak to objet | `js/routeEngine.js`, hotovo a funkční | Google Maps provider, F1/F2 roadmapa |
| 3 — Region Optimization | Kdo by měl dlouhodobě obsluhovat | navrženo v roadmapě | čeká na 6–8 týdnů dat |

Při jakékoliv budoucí změně plánovače se nejdřív urči, do které vrstvy
patří — pokud zasahuje do dvou, je to signál, že návrh je potřeba
rozdělit, ne že vrstvy jsou špatně nakreslené.
