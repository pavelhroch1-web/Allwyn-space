# VELÍN_PRODUCT_ROADMAP.md — Velín jako jeden konzistentní produkt

> Vznik 2026-06-27 na žádost Pavla: kompletní analýza celého Velínu (ne jen
> datová architektura, viz `VELIN_ARCHITECTURE.md`) z pohledu manažera,
> dispečera, tvůrce kampaní, sledování techniků a mobilního uživatele.
> Cíl: najít nedokončené části, duplicity, nelogický workflow, zbytečné
> obrazovky/karty, špatnou informační architekturu, místa kde se ztrácí
> uživatel, a navrhnout cílový stav + etapy k odsouhlasení.

---

## 1. Jak se na to dívám

`VELIN_ARCHITECTURE.md` z téhož dne už zachytil datovou stránku (fotky,
úkoly, POS detail, import) — tenhle dokument na to navazuje a dívá se na
**celý produkt jako uživatelský zážitek**: kolik obrazovek, jak se mezi nimi
chodí, kde se duplikuje práce, kde chybí kontext, jak to vypadá na mobilu.

Zdroj nálezů: přečtený `index.html` + `js/app.js` (přes 6500 řádků), ověřeno
živým proklikáním (Playwright) tam, kde to bylo rychle možné.

---

## 2. Nálezy — Velín (7 admin obrazovek)

| Obrazovka | Co dělá | Duplikuje se s | Problém |
|---|---|---|---|
| **Velín Home** (dashboard) | KPI, leaderboard, regiony, attention feed, fleet analytics, Action Feed | Flagy (attention feed = subset alertů), Fotky (žádná) | "Odpolední pohled" toggle existuje, ale nemá vlastní obsah — vypadá jako hotová featura, není |
| **POS Síť** | Filtrovatelný list všech POS + detail drawer | Stejný POS detail jako v Live pohledu | K nahlášení problému na POS (např. poškozený materiál) je potřeba: POS Síť → řádek → scroll na materiály → klik. Z Flagů na stejný problém vede jiná cesta |
| **Import dat** | Tourplan + POS Master Excel import | — | OK, funguje, duplicita ID při importu hlásí chybu bez konkrétních ID |
| **Flagy** | Agregovaný feed (servisy, GPS, zpoždění, podpisy, výkon) | Dashboard attention feed (stejná data, jiný výběr) | Z alertu nejde přímo akce — jen čtení, řešení se dělá jinde |
| **Fotky** | Grid fotek z dnešních návštěv | Stejná data jako "Fotodokumentace" v POS detailu | Žádný filtr (POS/technik/datum/kampaň) — přesně to, co chtěl Pavel jako první příklad nekonzistence |
| **Intelligence** | 2 AI tlačítka (briefing, report) s fallbackem | — | Bez vizuální odlišnosti loading stavu — snadné dvakrát kliknout |
| **Schválení** | Schvalovací karty navštívených POS | Flagy (stejné red-flag důvody: krátká návštěva, chybí fotky) | Žádné bulk schválení — kartu po kartě |

**Shrnutí:** Velín má **4 nezávislá místa, kde se technikovi zadává/řeší
práce** (Editor→Kampaně, Redakce→Checklist instrukce, Redakce→Sledované
úkoly, POS Síť→detail), bez jasného mentálního modelu, kdy použít co.

---

## 3. Nálezy — Editor (administrace kampaní a konfigurace)

7 podsekcí: Texty, Kampaně, Inventory katalog, Úkoly na místě, Checklist
šablony, Merch položky, Reference.

**Hlavní problém — vytvoření kampaně je dvou-záložkový proces:**
1. Checklist šablony → vytvoř šablonu s otázkami
2. Kampaně → vytvoř kampaň → teprve tady ji k šabloně připojíš

Nový uživatel nemá důvod tušit, že musí začít v jiné záložce, než kde
kampaň vlastně vytváří.

**Druhý problém — kampaň nekontroluje nic kromě volitelného checklistu.**
Task templates (Úkoly na místě) a Merch položky jsou **kanálové globály**,
ne součást kampaně — nelze řím "pro kampaň X jiné úkoly/jiné fotky". Když
technik vidí kampaň na POS, neexistuje jedno místo, které by mu řeklo
"tohle přesně pro tuhle kampaň udělej" — je to rozprostřené přes Úkoly /
Merch / Inventory záložky bez vazby na kampaň.

**Třetí problém — "Checklist šablony" slouží dvěma různým konceptům**
beze zmínky v UI:
- Checklist navázaný na kampaň (dočasný, vázaný na datum kampaně)
- Checklist instrukce v Redakci (trvalý, zamyká dokončení návštěvy)

Stejná datová struktura, dva odlišné životní cykly — editor to nerozlišuje.

**Čtvrtý problém — žádný wizard.** Vytvoření kampaně = vyplnění syrového
formuláře (dates jako freetext, items jako multiline textarea bez vazby na
katalog), žádný náhled "takhle to uvidí technik", žádná kontrola překryvu
s jinou aktivní kampaní.

---

## 4. Nálezy — technik (mobil)

- **Typická návštěva = ~10 doteků minimum** (check-in, 3+ merch položky
  s fotkami, podpis, dokončení) — funkční, ale dá se zkrátit.
- **Dva paralelní seznamy úkolů na jedné obrazovce** ("Úkoly na místě" vs
  "Sledované úkoly od Velínu") — bez vizuálního rozlišení proč jsou dva,
  jen vertikálně nastavené pod sebe. Tohle je přesně ten případ, kdy bych
  to podle původního plánu sloučil do task_pool — ale ukázalo se, že
  "Úkoly na místě" (admin_tasks) **zamykají dokončení návštěvy** a
  "Sledované úkoly" ne, takže sloučení dat by změnilo chování — proto
  zůstává jen UI-level odlišení (viz `VELIN_ARCHITECTURE.md` 1.2 a
  rozhodnutí Pavla z téhle session).
- **Mobil:** viewport + touch targets v pořádku (≥44px), bottom-sheet
  modaly jsou mobile-friendly. Riziko: tag/chip řádky bez explicitního
  zalomení mohou přetékat na úzkých telefonech (<320px) — drobnost.
- **Tón:** technikovi adresovaný text je většinou neutrální ("Potvrď
  příjezd", "Označit jako navštíveno"), ale rámování je dohledové —
  "Sledované úkoly od Velínu" (sledované = trackované/monitorované),
  "GPS ověření", fotky se poznámkou že "GPS poloha" a "vidí ji i Velín".
  Žádná z těch vět je technicky špatně, ale souhrnně to zní jako dohled,
  ne jako asistent — to je přesně rozpor s principem v `docs/CLAUDE.md`
  ("Technician experience = asistent, ne dohled").
- **Jeden stub:** "Nastavení" tlačítko v admin menu, oznčené "brzy" —
  drobnost, ne blokující.

---

## 5. Cílový stav

Princip beze změny oproti `VELIN_ARCHITECTURE.md` — **stejná entita = jedna
datová cesta a jeden sdílený view** — ale doplněný o produktovou vrstvu:

### 5.1 Jedno místo pro "zadat práci technikovi"
Dnes 4 nezávislé vstupní body (Kampaně / Checklist instrukce / Sledované
úkoly / POS Síť ad-hoc). Cíl: **jeden "Work Composer"** s jasnou volbou na
začátku — "Jednorázový úkol" / "Trvalá instrukce (zamyká návštěvu)" /
"Marketingová kampaň (s checklistem a materiály)" — a dál se větví podle
volby, ne 4 oddělené obrazovky bez společného vstupu.

### 5.2 Kampaň jako skutečně propojený balíček
Kampaň by měla v jednom formuláři/wizardu umět nastavit checklist (pokud
potřeba), požadované merch položky a inventory pro danou kampaň — ne každé
zvlášť v jiné záložce s nutností uhodnout pořadí.

### 5.3 Sjednocený Media model + MediaGallery
Přímo z `VELIN_ARCHITECTURE.md` P2 — Fotky obrazovka + "Fotodokumentace" v
POS detailu sjednotit na jeden filtrovatelný galerie-komponent.

### 5.4 Akce z alertu, ne jen čtení
Flagy/Schválení by měly nabízet přímou akci (vyřešit/schválit/zamítnout) z
místa, kde se problém objeví, ne nutit přechod na jinou obrazovku a hledání
stejného řádku znovu.

### 5.5 Technician tone pass
Přejmenovat/přerámovat dohledové formulace ("Sledované úkoly od Velínu" →
něco jako "Úkoly od Velínu", GPS/foto copy přerámovat jako dokumentaci
návštěvy, ne sledování) — čistě kopírovací změna, žádná datová.

---

## 6. Navrhované etapy

Řazeno podle poměru hodnota/risk, ne podle čísel v `VELIN_ARCHITECTURE.md`
(ty zůstávají platné, tohle je nadstavba s produktovým pohledem).

### Etapa A — Bezpečné, bezeschválení (dělám rovnou, žádný dopad na chování)
- Dokončit afternoon-view stub (buď naplnit obsahem, nebo tlačítko schovat,
  dokud nebude obsah — dnes vypadá jako rozbitá featura)
- Tone pass na technikově textu (přerámovat dohledový jazyk)
- AI Intelligence tlačítka: disable + loading state proti dvojkliku
- Import duplicate-ID chyba: vypsat konkrétní kolidující ID, ne jen "oprav soubor"

### Etapa B — Media/fotky sjednocení (P2 z VELIN_ARCHITECTURE, teď i UI)
- Jeden `MediaGallery` s filtry POS/technik/datum/kampaň/úkol
- Nahradit Fotky obrazovku + "Fotodokumentace" v POS detailu týmž komponentem

### Etapa C — Akční Flagy/Schválení
- Přidat přímou akci z řádku alertu (ne jen "Schválení" obrazovka zvlášť)
- Bulk schválení ve Schválení (vybrat víc karet najednou)

### Etapa D — Kampaň jako wizard (vyžaduje business rozhodnutí, viz níže)
- Spojit Kampaně + Checklist šablony do jednoho flow
- Rozhodnout, jestli kampaň smí nastavovat task/merch požadavky per-kampaň,
  nebo to zůstává kanálový globál (byznysová otázka, ne technická)

### Etapa E — Work Composer (sjednocený vstup zadávání práce)
- Největší změna, navazuje na rozhodnutí o admin_tasks/task_pool
  z `VELIN_ARCHITECTURE.md` — dělat až po B/C, protože dotýká se všech
  4 vstupních bodů najednou

---

## 7. Co potřebuje tvoje rozhodnutí, co ne

**Mohu dělat rovnou bez čekání** (etapa A, B, C — žádná byznysová varianta,
jen oprava nekonzistence/UX):
- Etapa A v plném rozsahu
- Etapa B, C — technické sjednocení, chování se nemění, jen se přestane
  duplikovat

**Potřebuju tvoje rozhodnutí:**
- Etapa D — má kampaň smět přepsat task/merch požadavky jen pro sebe, nebo
  to zůstává kanálový globál? (ovlivňuje, co technik vidí na POS)
- Etapa E — pořadí/rozsah Work Composeru — chci to probrat až budou B/C
  hotové, ať mám reálnou zkušenost s tím, co se osvědčilo

---

## 8. Návrh dalšího postupu

Pokud souhlasíš s tímhle rozdělením, začnu rovnou etapou A (bez dopadu na
chování, žádná byznysová otázka) a budu pokračovat do B/C automaticky bez
čekání na "BUILD" u každého kroku — nahlásím jen co bylo hotovo, proč, co
je další, a jestli něco potřebuje tvoje rozhodnutí. U D se zastavím a
zeptám se na otázku výše, než cokoliv napíšu.
