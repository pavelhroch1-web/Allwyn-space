# CLAUDE.md — Instrukce pro Claude Code

> Pracuješ na projektu **Allwyn Space** (field operations platforma). Přečti `PROJECT_CONTEXT.md` než cokoliv uděláš.
> Tento soubor obsahuje pravidla vývoje, architekturu a co NIKDY nerozbít.

---

## Kdo je uživatel
Pavel — manažer ~27 merch techniků ve společnosti Allwyn (loterie, ČR). Není to profesionální vývojář, ale rozumí svému businessu velmi dobře. Komunikuj **česky**. Vysvětluj technická rozhodnutí jednoduše. On rozhoduje o produktu, ty o implementaci.

## Současný stav
Existuje funkční **HTML prototyp** (`index.html`, ~375 KB, jeden soubor: HTML + CSS + vanilla JS, data v localStorage, Leaflet.js mapa, volání Claude API pro AI funkce). Prototyp je validovaný a funkční pro demo. Teď ho přetváříme na reálnou aplikaci s backendem a databází (viz `MIGRATION_PLAN.md`).

Aktuální audit kódu (co je reálně implementováno) je v `CODE_AUDIT.md` — než cokoliv refaktoruješ, ověř si tam, jak to ve skutečnosti funguje (řádkové odkazy do `index.html`).

---

## PRAVIDLA VÝVOJE

### Komunikace
- **Česky.** Veškeré UI texty, komunikace s uživatelem, komentáře v doménové logice česky.
- Po větší změně **stručně shrň co se změnilo** a co má uživatel otestovat.
- Neptej se na 5 věcí najednou — max 1–2 otázky, zbytek rozhodni sám a řekni jaké předpoklady jsi udělal.
- Když uživatel popíše business pravidlo, **zapiš ho** (do tohoto souboru nebo PROJECT_CONTEXT.md) — ať se neztratí.

### Kód
- **Mobile-first.** Technici používají appku na telefonu v terénu. Admin spíš na tabletu/desktopu, ale i mobil musí fungovat.
- Drž **doménový jazyk česky** (POS, technik, velín, zásobování, merch, inventory, kampaň) — nepřekládej do angličtiny, mátlo by to uživatele i byznys.
- Preferuj **čitelnost před chytrostí**. Tohle bude udržovat někdo kdo není senior dev.
- Malé, ověřitelné kroky. Po každém kroku ověř že appka stále funguje (build/lint/spuštění).
- Nezaváděj závislost bez důvodu. Každá knihovna = údržba navíc.

### Práce s daty
- **localStorage je dočasný** — migrujeme na backend (viz plán). Ale dokud běží, neměň formát klíčů bez migrace, ať uživatel nepřijde o testovací data.
- Klíče v localStorage (současné, ověřeno v kódu — viz CODE_AUDIT.md): `ci_{posId}` (check-in), `vlog_{date}` (visit log), `daystart_{date}`, `supply_{posId}_{date}`, `merch_{posId}_{date}`, `poscard_{posId}`, `visits_{posId}` (historie), `assign_{posId}` (přiřazení dne), `admin_tasks`, `editor_briefing`, `editor_alert`, `editor_idt`, `editor_ka`, `editor_campaigns`, `inv_catalog`, `gps_flags_{date}`, `approval_{posId}`.

---

## DEPLOYMENT WORKFLOW (závazné, po každém dokončeném úkolu/feature)

1. **Ověř** — žádné console errors, funguje flow Technika, funguje flow Velína.
2. **Commit** se srozumitelnou zprávou.
3. **Push** na GitHub.
4. **Deploy automaticky.** Pokud se pracuje na branchi: vytvoř PR a **automaticky ho mergni**, pokud checky projdou a oprávnění to dovolí.
5. **Ověř GitHub Pages deployment** (live URL).
6. **Reportuj uživateli až po té**, co je live verze aktuální.

Když řekneš "hotovo", znamená to vždy:
✅ implementováno · ✅ otestováno · ✅ commitnuto · ✅ pushnuto · ✅ live URL aktualizováno.

Nenech hotovou práci jen lokálně nebo jen v branchi — pokud tomu nebrání blokující problém (např. neprocházející CI, chybějící oprávnění k mergi).

---

## ARCHITEKTURA (cílová)

```
allwyn-space/
├── frontend/                 # Web app (technik + velín)
│   ├── src/
│   │   ├── views/
│   │   │   ├── technik/       # Technik rozhraní
│   │   │   └── velin/         # Admin/velín rozhraní
│   │   ├── components/        # Sdílené UI komponenty
│   │   ├── lib/
│   │   │   ├── data.js        # Data layer (abstrakce nad backendem)
│   │   │   ├── domain.js      # Doménová logika (kanály, priority, dny)
│   │   │   └── gps.js         # GPS ověření
│   │   └── styles/            # Allwyn design tokens
│   └── ...
├── backend/                  # API + business logika
├── supabase/                 # Schema, migrace, RLS policies
│   └── schema.sql
└── docs/
    ├── PROJECT_CONTEXT.md
    ├── CLAUDE.md
    ├── MIGRATION_PLAN.md
    └── CODE_AUDIT.md
```

Doporučený stack (návrh, ne dogma): frontend buď ponechat vanilla/lehký framework nebo React+Vite; backend **Supabase** (Postgres + Auth + Storage + Realtime) protože pokrývá auth, DB, file storage pro fotky/podpisy a realtime pro živý velín bez vlastního serveru. AI funkce přes Anthropic API (server-side, klíč nikdy ve frontendu).

**Aktuálně (prototyp):** žádná z těchto složek neexistuje, vše je v jediném `index.html`. Vznikne v Fázi 1 migračního plánu.

---

## CO NIKDY NEROZBÍT (kritická business pravidla)

1. **Tři oddělené koncepty materiálu.** Merch (bez podpisu) ≠ Spotřební materiál (podpis + SAP + jméno přijímajícího) ≠ Inventory (dlouhodobý majetek). NIKDY je nesměšuj do jednoho seznamu.

2. **CORN je samostatný kanál** (vedle IDT, KA, PETROL). NE podkategorie KA. Detekce: kategorie začíná "9" (v kódu: `index.html` ~řádek 1174, `rawTyp==='CORN' || p.k.startsWith('9')`).

3. **SAP kódy jsou read-only pro technika.** Technik je vidí, NIKDY needituje. Aktuálně mockup, reálné dodá objednatel. **Pozor:** v prototypu chybí explicitní zámek proti re-editaci SAP kódů po odeslání zásobování — při refaktoru to ošetři.

4. **Pracovní doba = od prvního check-inu na POS.** NE od výjezdu z domu. Konec = poslední dokončený POS. Bydliště techniků nás nezajímá.

5. **Den se detekuje automaticky.** Technik odklikává/check-in POUZE dnešní den. Minulé dny = jen přehled (zamčené). Budoucí = plánovatelné. Žádné "cestování do minulosti" a zpětné dokončování.

6. **Technik začíná s prázdným plánem** a sám si přiřazuje POS ke dnům z týdenního seznamu. Nesplněné z minulých dní se "valí" — nabídnou k přeplánování. Přiřazení musí persistovat.

7. **Inventory se vybírá z admin katalogu**, ne volný text. Admin katalog edituje z velína.

8. **Kampaně edituje admin z velína.** NIKDY hardcoded, NIKDY AI generované do produkce (AI psala nesmysly). AI smí navrhovat, ale admin schvaluje/edituje.

9. **GPS ověření check-inu.** Vzdálenost od adresy POS: <300m OK, <1km varování, >1km flag "podezřelé". Toto je klíčová anti-fraud funkce pro manažera. **Pozor:** v prototypu se do `gps_flags_*` zapisuje jen >1km, pásmo 300m–1km se v UI zobrazí jako varování, ale nezakládá flag pro admina — při migraci zvaž, jestli to chceš sjednotit.

10. **Admin má plnou kontrolu a transparentnost.** Manažer předpokládá že technici podvádějí — každá funkce, která zvyšuje viditelnost (GPS, časy, fotky, AI flagy, schvalování) je hodnotná. Nikdy ji neoslabuj kvůli pohodlí.

   **Standing princip (Pavel, 2026-06-26): "vždycky se snaží nás ochcat... oni vždycky hledají tu nejjednodušší cestu."** Při návrhu JAKÉKOLIV nové funkce nebo zjednodušení flow pro technika si vždy polož otázku: "jak by se tohle dalo obejít/ošvindlovat nejjednodušší cestou, a jak to Velínu nezůstane skryté?" Konkrétní důsledky:
   - Když dáváš technikovi rychlejší/odloženou cestu (např. check-in bez focení hned, merch odškrtnutí bez focení), vždy musí existovat tvrdý gate, který to dožene později (Zbývá vyfotit), NIKDY úplné odstranění požadavku.
   - Velín musí mít vždy možnost dohledat, kde technik "zkrátil cestu" — kdy a co odložil, ne jen výsledný stav.
   - Default nastavení (co vyžaduje foto, GPS přísnost, atd.) volí Velín, ne technik a ne hardcoded "pohodlné" defaulty — ale i defaulty navrhuj s myšlenkou, kde by šlo nejsnáz podvádět.
   - Při jakékoliv budoucí featuře s odkladem/zjednodušením pro technika vždy znovu prober s Pavlem, jak to nejde obejít — neproaktivně to nezeslabuj kvůli UX bez téhle úvahy.

11. **Allwyn branding.** Navy `#1A3C47` + teal `#2ECDC0`. Žlutá je legacy Sazka — nepoužívat jako brand barvu.

12. **AI klíč nikdy ve frontendu.** Anthropic API volání jen server-side po migraci na backend. **Pozor:** v prototypu se volá `https://api.anthropic.com/v1/messages` přímo z frontendu — to je dočasné řešení specifické pro prostředí prototypu a MUSÍ se přesunout na server v Fázi 4.

13. **Čeština ve všem co vidí uživatel.**

---

## Doménové konstanty (reference)

**Regiony (reálné kódy POS AREA z Tourplan exportu):** RSA (Praha+Kladno), RSB (Brno/jižní Morava+jižní Čechy), RSC (Plzeň/západní Čechy+Karlovy Vary), RSD (Ústí nad Labem/severní Čechy), RSE (Pardubice/Hradec Králové+Zlín), RSG (Ostrava/Olomouc/Moravskoslezský kraj)
**Dny:** Po, Út, St, Čt, Pá (víkend = bez práce)
**Priority úkolů:** servis (1, červená) > template (2) > on_top (3) > own (4)
**KA partneři:** Albert, Tesco, Hruška, Fast, GECO, JIP, JP Servis, KM-Prona, Prim, PEAL, Bonveno, Lagardere, Tobacco DC, EUROBIT (pozastaveno), CSPOINT
**PETROL:** ORLEN, Shell, Benzina, EuroOil, OMV, MOL, TankONO, Traficon, Valmont
**Corn lokace:** Černý most, Arkády Pankrác, Chodov, Čestlice (výjimka), Hradec, Plzeň, Smíchov, Hostivař, Letňany, Budějovice Géčko, Ostrava Globus, Olomouc Šantovka, Bořislavka
**Spotřební materiál:** kotouče papíru, samolepky na terminál, trojúhelníky, výměna sázenek, šanon na losy, plakáty A4/A3; Corn navíc: sazenka + obálky
**Inventory vnitřní:** Terminál Allwyn, Totem (3prvkový/4prvkový/B), VCU obrazovka, ESO výstrč, Stojan na sázenky, Šanon, pulty (Corn), Barketa, Stojka
**Inventory venkovní:** Venkovní světelné označení

---

## Když si nejsi jistý
1. Přečti `PROJECT_CONTEXT.md` (business) a `MIGRATION_PLAN.md` (technický postup).
2. Zachovej existující business pravidla z tohoto souboru.
3. Když pravidlo chybí, zeptej se Pavla — ale navrhni řešení, neptej se naprázdno.
4. Raději malý ověřený krok než velký risk.
