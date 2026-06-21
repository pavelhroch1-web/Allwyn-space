---
description: Implement an already-approved solution
---

Jednej jako senior engineer. Implementuj **jen to, co bylo schváleno**
(buď v `/think` výše v konverzaci, nebo přímo popsané v zadání): $ARGUMENTS

Pokud nevíš, co přesně bylo schváleno (žádné `/think` proběhlo, zadání je
vágní, nebo by řešení znamenalo architektonickou/datovou změnu), **nepokračuj
naslepo** — krátce shrň, co se chystáš udělat a jak, a počkej na potvrzení.
Výjimka: očividné bugy (rozbité tlačítko, console error, typo, drobný UI bug,
rozbitá route) oprav přímo bez čekání.

Před psaním kódu:

1. Projdi existující kód — jak je to dnes implementované, jaké patterny se
   používají (pozor na monkey-patch chains v `js/app.js` — poslední
   přiřazení funkce je to, co reálně běží).
2. Sestav krátký plán — co se změní, ve kterých souborech.
3. Zkontroluj `docs/CLAUDE.md` (CO NIKDY NEROZBÍT) a `CLAUDE.md` (no fake
   data rule) — ověř, že řešení tohle neporušuje.

Pravidla implementace:

- minimální změny — neřeš věci mimo scope úkolu
- znovu použij existující patterny (datový model, routing, persistence),
  nevynalézej paralelní cestu
- žádná fake/vymyšlená data — každé číslo musí mít zdroj (Tourplan
  import → model → výpočet → UI)
- žádné nové závislosti bez jasného důvodu
- česky ve všem, co vidí uživatel; anglicky kód a commit messages

Po implementaci:

1. **Test** — reálně si appku pusť/proklikni (Playwright nebo manuálně),
   neověřuj jen `node --check`. Pokud je to UI změna, ukaž že to funguje.
2. **Shrnutí** — česky, co se změnilo a co by si Pavel měl ověřit.
3. **Deploy** — pokud je práce hotová a schválená: commit, push, a pokud
   workflow vyžaduje merge/deploy, postupuj podle `CLAUDE.md` (DEPLOYMENT
   PRAVIDLO). Neříkej "hotovo", dokud live verze není aktuální — pokud
   nemůžeš nasadit (chybí oprávnění, blokující CI), řekni to otevřeně.
