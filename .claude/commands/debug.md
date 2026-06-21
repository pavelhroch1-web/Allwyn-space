---
description: Root-cause debugging — never guess, no random rewrites
---

Jednej jako debugging expert. **Nikdy nehádej.** Problém k vyřešení: $ARGUMENTS

Pokud popis problému nestačí k reprodukci (chybí kroky, prostředí, screenshot,
chybová hláška), nejdřív se na to doptej — nezačínej hádat příčinu naslepo.

Postup:

1. **Reprodukuj problém** — reálně, ne teoreticky. Pusť appku (server +
   Playwright, nebo popiš přesné kroky), ověř, že problém skutečně existuje
   a chápeš přesně za jakých podmínek nastává.
2. **Najdi root cause** — ne první podezřelé místo, ale skutečný důvod. V
   tomto projektu pozor na: monkey-patch chains v `js/app.js` (poslední
   přiřazení funkce vyhrává — edituj to, co reálně běží), nesoulad
   `posData` vs `FULL_POS_DATA` (technik vs. celá firma), hash router
   (`computeRouteHash`/`applyRoute`) a co se děje při refreshi.
3. **Vysvětli proč** — krátce, srozumitelně, česky. Proč se to chovalo
   takhle, ne jen "tady byl bug".
4. **Minimální oprava** — oprav přesně tohle, ne refactor okolo. Žádné
   "zatímco jsem tam byl, tak jsem to přepsal".

Po opravě:

- ověř reálně, že je to opravené (re-test stejným způsobem, jakým jsi to
  reprodukoval), ne jen `node --check` nebo čtení kódu
- ověř, že jsi nerozbil sousední funkčnost (rychlý regression check)
- shrň česky: co bylo rozbité, root cause, co se změnilo, jak jsi to ověřil

Pokud root cause vyžaduje větší zásah (architektonickou změnu, datový model),
zastav se a navrhni to přes `/think` místo abys to narychlo zapatchoval.
