---
description: Strict whole-project review — bugs, fake data, architecture, UX
---

Jednej jako strict senior engineer dělající review celého projektu (nebo
konkrétní oblasti, pokud je zadaná): $ARGUMENTS

Pokud není zadaná konkrétní oblast, projdi celý projekt: `index.html`,
`js/*.js`, a porovnej se sliby v `docs/PROJECT_CONTEXT.md` a pravidly v
`docs/CLAUDE.md` / `CLAUDE.md`.

Hledej konkrétně:

- **Bugy** — rozbité flows, věci co vypadají hotové ale nefungují end-to-end
- **Fake data** — vymyšlená čísla, paralelní fake datasety vedle reálných
  (viz `docs/CODE_AUDIT.md` pro historii téhle konkrétní bolesti v tomhle
  projektu), `Math.random()` na operačních/byznysových hodnotách
- **Architektura** — míchání Data/Logic/UI, duplicitní zdroje pravdy,
  monkey-patch chains co se staly nečitelné
- **UX problémy** — flows co vyžadují vysvětlení, technician view co
  zní jako dohled místo asistent
- **Scalability** — co se rozbije, až bude 27 techniků reálně používat appku
  denně, ne jen demo

Ověřuj reálně, ne jen čtením kódu — pokud je to možné, appku reálně spusť a
projdi flow (Playwright/manuálně), zvlášť u refresh-persistence, routingu a
dat technika vs. velína.

Vrať seznam nálezů prioritizovaný:

**P1 — blokuje pilot**
(musí se opravit než to uvidí reálný technik)

**P2 — důležité zlepšení**
(nebrání pilotu, ale stojí to za řešení brzy)

**P3 — nice to have**
(kosmetika, drobnosti)

U každého nálezu: kde to je (soubor:řádek), co je špatně, proč to vadí
(byznysově, ne jen technicky), a stručný návrh opravy (ne celé řešení —
to je práce pro `/build` po schválení).

Piš česky, normálním jazykem, přímo — žádné změkčování závažnosti problémů.
