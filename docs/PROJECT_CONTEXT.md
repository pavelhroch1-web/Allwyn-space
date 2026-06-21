# PROJECT_CONTEXT.md — Allwyn Space

> Field operations platforma pro řízení merchandisingových techniků společnosti Allwyn (loterie/sázení, ČR).
> Tento dokument popisuje business účel, uživatele, existující funkce a workflow. Čti ho jako první.

---

## 1. Business účel

**Allwyn Space** je interní aplikace pro řízení týmu terénních merch techniků, kteří objíždějí prodejní místa (POS — point of sale = lotózní terminály) a starají se o jejich vizuální prezentaci, zásobování a servis.

Provozovatel: **Allwyn** (dříve Sazka) — provozovatel loterie a sázek v České republice. Probíhá rebranding ze Sazka na Allwyn, což je jeden z hlavních úkolů techniků v terénu.

### Problém, který řeší
- Manažer (objednatel) nemá přehled co technici v terénu reálně dělají — podezření na "flákání"
- Instalovaný majetek (TV/VCU obrazovky, totemy) **mizel bez evidence** — nikdo netrackoval kde co je
- Plánování tras bylo manuální přes Excel (Tourplan), neefektivní
- Žádná kontrola kvality (fotky, časy návštěv, GPS poloha)
- Zásobování spotřebním materiálem nemělo doklad pro odpis v SAP

### Cílový stav (vize)
Systém, který **z velké části řídí techniky sám** pod dohledem manažera:
- AI generuje denní plány podle kapacity, tras, priorit a kampaní
- Manažer zadá pravidla jednou, systém běží poloautomaticky
- Plná kontrola a transparentnost (GPS, časy, fotky, AI analýza chování)
- Manažer NECHCE dělat "monkey work" ručně — chce nastavit systém

---

## 2. Uživatelé

### 2.1 Technik (merch technik v terénu)
- 27 techniků napříč ČR, rozděleni do regionů (RSA, RSB, RSC, RSD, RSE, RSG — reálné POS AREA kódy z Tourplan exportu)
- Od PART 6 (Tourplan import) má všech 27 techniků reálná POS data; dříve byl referenčním technikem **Lán Tomáš** (region RSE)
- Objíždí ~35 POS týdně (cca 7/den), pracovní doba ~40h/týden
- Na mobilu: otevře appku, naplánuje si den, jezdí po POS, na každém: check-in (GPS) → splní úkoly → osadí merch → předá spotřební materiál (podpis) → vyfotí → check-out
- **Pracovní doba se počítá od PRVNÍHO check-inu na POS** (ne od výjezdu z domu), končí posledním dokončeným POS

### 2.2 Admin / Manažer ("Velín")
- 1 osoba (objednatel projektu, jméno Pavel — manažer týmu)
- Miluje AI, předpokládá že technici podvádějí → chce maximální kontrolu a transparentnost
- Z velína chce: živý přehled techniků na mapě, flagy podezřelého chování, schvalování návštěv, zadávání úkolů, editaci všeho co technici vidí
- NECHCE ruční práci — chce nastavit pravidla a nechat systém běžet

---

## 3. Datový model (domain)

### 3.1 POS (provozovna / prodejní místo)
Každá POS má: `id` (číslo terminálu), název, adresu, region (area), kategorii (kód), GPS souřadnice, typ kanálu.

**Kanály (typ POS)** — 4 samostatné, rovnocenné kategorie:
| Kanál | Popis | Detekce v datech |
|---|---|---|
| **IDT** | Independent Dealer (nezávislé trafiky, malé obchody) — sdílí jednu šablonu | market = IDT |
| **KA** | Key Account partneři (Albert, Tesco, Hruška...) — každý partner má vlastní šablonu | market = KA PARTNERS |
| **PETROL** | Čerpací stanice (ORLEN, Shell, Benzina, EuroOil...) | market = PETROL |
| **CORN** | Speciální prioritní kanál (velké obchodní domy — Černý most, Arkády Pankrác, Chodov...) | kategorie začíná na "9" |

**Důležité:** CORN je samostatný kanál, NE podkategorie KA. Nesměšovat.

### 3.2 Úkoly (tasks) — 4 zdroje, podle priority
1. **servis** (nejvyšší priorita, červená) — servisní tikety, časem z Jiry. Např. "výměna tiskové hlavy"
2. **template** (šablona) — automaticky podle kanálu/partnera
3. **on_top** — manuálně přidané adminem (z velína nebo z terénu přes GPS)
4. **own / vlastní** — technik si přidá sám

Inventory označené "Chybí" → automaticky vytvoří servisní úkol.

### 3.3 Tři ODDĚLENÉ koncepty materiálu (NIKDY nesměšovat!)
| Koncept | Co to je | Podpis? | SAP? |
|---|---|---|---|
| **Merch** | Co se osazuje (plakáty, samolepky, barketa, korunka) | NE | NE |
| **Spotřební materiál** | Co se předává obsluze (kotouče papíru, samolepky na terminál, trojúhelníky, výměna sázenek, šanon na losy, plakáty A4/A3; Corn navíc: sazenka + obálky) | ANO (jméno + podpis prstem) | ANO (pro odpis v SAP) |
| **Inventory** | Dlouhodobý majetek per POS | NE | NE |

**Inventory** má dvě sekce:
- **Vnitřní**: Terminál Allwyn, Totem Allwyn (typ 3prvkový/4prvkový/B), VCU obrazovka, ESO výstrč, Stojan na sázenky, Šanon, Primární/sekundární pult (Corn), Barketa, Stojka
- **Venkovní**: Venkovní světelné označení prodejny, venkovní výstrč, banner

Inventory je **pasivní evidence** — neaktualizuje se při každé návštěvě, jen při instalaci/změně. Technik vybírá položky z **katalogu, který spravuje admin** (ne volný text).

### 3.4 SAP kódy
- Slouží pro odpis spotřebního materiálu ve firemním systému SAP
- Aktuálně **MOCKUP hodnoty** (`SAP-MOCK-001` až `SAP-MOCK-012`), reálné dodá objednatel později
- Corn totem prvky mají reálné SAP kódy z dokumentace: deska na losy velká `SAP 122000`, víko `SAP 122001`, rámeček CDU `SAP 122007`, deska malá `SAP 121999`, deska RS `SAP 121998`, víko 30x40 `SAP 122002`, víko 40x30 `SAP 122003`, rámeček prosvětlený velký `SAP 122006`, malý `SAP 122005`
- **Technik SAP kódy NESMÍ měnit** — jsou read-only, pevně přiřazené

### 3.5 Kampaně (aktuální, červen–červenec 2025, týdny W23–W28)
- **Losy**: Zlatá rybka — POUZE NOVÁ EMISE (ne původní, opakovaná chyba v terénu)
- **Loterie**: EuroJackpot
- **Rebranding**: norma **2 POS/den**, odstranit samolepky "Sazka mobil" (penalizace pokud zůstanou na dokončených POS)
- **ORLEN**: nově v tourplanu — POUZE výměna losů ve folii + doplnění zásobování, NEoznačovat jako rebranding (materiály ve výrobě)
- **Corn**: priorita. Totem VŽDY 2 plakáty (losy + loterie), nikdy bílá plocha. Barketa Rybky + 20 Mega.

Kampaně musí být **editovatelné adminem** (ne hardcoded) — manažer si stěžoval že AI psala nesmysly. Kampaně jsou v "Activity plánu" definované min. kvartál dopředu.

### 3.6 Branding
- Barvy: navy `#1A3C47`, teal `#2ECDC0`, teal-dark `#1FA89D`, teal-light `#E6F9F8`
- Logo: malé "a" v tyrkysovém kruhu + "allwyn" text
- Žlutá `#F0C030` je legacy Sazka barva — v rebrandingu se NEPOUŽÍVÁ jako brand barva (jen u Corn dokumentů jako akcent)

---

## 4. Existující funkce (v HTML prototypu)

### Technik
- **Role select** — úvodní obrazovka, výběr Technik / Velín
- **Ranní briefing** (pop-up) — AI generovaný (Claude API) podle plánu, servisů, kampaní; fallback hlášky pokud API nedostupné
- **Týdenní přehled** W23–W28 s progress, počty POS, hotovo/zbývá/neplánováno
- **Automatická detekce dnešního dne** — appka pozná den/týden, minulé dny zamčené (jen přehled), dnešní označen, budoucí plánovatelné
- **Plánování** — technik začíná s PRÁZDNÝM plánem, sám si přiřazuje POS ke dnům z týdenního seznamu + nesplněné z minulých dní; ukládá se (persistence)
- **Nesplněné se "valí"** — POS z minulých dní co nestihl se nabídnou k přeplánování na dnes
- **Detail POS**: GPS check-in/out s timerem a ověřením vzdálenosti od adresy, info, kampaně, referenční karty per kanál, merch checklist, spotřební materiál s podpisem, úkoly dle priorit, fotodokumentace (před/po/detail), 3 záložky (Poznámky / Inventory / Karta POS)
- **Karta POS** — trvalý záznam o provozovně (zavírá, rekonstrukce, špatné osazení...)
- **Check-in** — GPS poloha, vzdálenost od POS (zelená <300m, oranžová <1km, červená >1km = flag)

### Admin / Velín
- **Live mapa** (Leaflet.js) — 27 techniků na mapě ČR, barevné markery podle stavu
- **Filtr regionů** — RSA/RSB/RSC/RSD/RSE/RSG
- **Flagy** — krátké návštěvy (<10min), GPS anomálie, pozadu, servis, bez podpisu zásobování
- **Časy** — délky návštěv, začátek pracovní doby = první check-in
- **Detail technika** — klik → seznam jeho POS, historie, dokončené, fotky, zásobování, servisy
- **Detail POS (admin)** — klik na POS → kdy naposledy navštívena a kým, kompletní historie návštěv, záznamy z karty, možnost přidat úkol
- **Redakční okno (Úkoly)** — zadání úkolu skupině POS / konkrétnímu technikovi / konkrétní POS, s prioritou a deadline; propíše se technikům jako on_top
- **Schválení návštěv** — schválit/zamítnout dokončené návštěvy, auto-flagy
- **AI analýza** — Claude API vygeneruje management report (rizika, podezřelé aktivity, pozitivní výkon, doporučení); fallback mock report
- **Editor** — admin edituje co technici vidí: texty (briefing, upozornění, zprávy per kanál), KAMPANĚ (přidat/upravit/smazat), INVENTORY KATALOG (seznam vnitřního/venkovního vybavení z čeho technik vybírá)

---

## 5. Hlavní workflow

### 5.1 Technik — denní cyklus
1. Ráno otevře appku → ranní briefing pop-up (AI)
2. Appka pozná dnešní den, ukáže naplánované POS na dnes
3. Pokud nemá nic naplánováno → "Naplánovat POS na týden" → přiřadí si POS ke dnům (+ nesplněné z minula)
4. Jede na POS → **check-in** (GPS zaznamená polohu a čas = začátek prac. doby u prvního)
5. Na POS: splní úkoly (servis první) → osadí merch (odklik) → předá spotřební materiál (jméno + podpis prstem + SAP) → vyfotí → zkontroluje/aktualizuje inventory
6. **Check-out** → zaznamená délku návštěvy, uloží do historie POS
7. Opakuje pro další POS; co nestihne → valí se na další den

### 5.2 Admin — řízení
1. Velín: živá mapa, kdo kde je, kdo je pozadu
2. Flagy: systém upozorní na podezřelé (krátká návštěva, GPS daleko od POS, bez fotek)
3. AI analýza: report o výkonu týmu na kliknutí
4. Redakční okno: zadá úkoly skupinám/jednotlivcům
5. Schválení: projde dokončené návštěvy, schválí/zamítne
6. Editor: upraví kampaně, texty, inventory katalog — vše se ihned propíše technikům

---

## 6. Vstupní data

### Tourplan (Excel) — `Tourplan_week_20-28.xlsx`
- Zdroj POS dat: 6318 řádků, týdny W23–W28, 27 techniků, ~35 POS/technik/týden, 945 POS/týden
- Sloupce: id terminálu, typ terminálu, market (IDT/KA PARTNERS/PETROL/CORN/MARKET/ČESKÁ POŠTA), kategorie (kód partnera, např. 1AHOLD=Albert, 1ORLEN, začíná 9 = Corn), název, ulice, č.p., město, area (region), technik, týden
- Je to **přechodný vstup** — cílově AI generuje plán z Activity plánu + normativů
- Objednatel doplní později: GPS souřadnice (lat/lng), telefon, kontaktní osoba

### Dokumenty od objednatele
- **Corn visibilita** (PDF) — pravidla pro Corn kanál, plánogramy, SAP kódy totemu
- **KAM kniha rebranding** (PDF) — pravidla per KA partner (Albert, Shell, Tesco, ORLEN...), instalace, totemy
- **Email screenshoty** — aktuální kampaně (Zlatá rybka, EuroJackpot, rebranding norma, ORLEN)

---

## 7. Budoucí fáze (zmíněné, NEimplementované)
- **Jira integrace** — servisní tikety jako nejvyšší priorita úkolů
- **SAP kódy z fotky** — AI vision přečte SAP kód vytištěný na materiálu
- **Modul materiálu do auta** — technik zadá na kolik dní jede → systém spočítá co naložit (podle POS per typ + normativy spotřeby + buffer), pak odpisuje
- **AI dynamické plánování** — z Activity plánu (kampaně min. kvartál dopředu) systém generuje denní plány, admin schvaluje
- **Route optimization** — optimalizace tras
- **Normativy návštěv** — průměrný čas per typ POS (IDT ~23min, KA ~38min) → výpočet denní kapacity (~40h/týden)
- **Cíl**: poloautonomní řízení pod dohledem manažera
