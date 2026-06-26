// ══════════════════════════════════════════════════════
// DECISION ENGINE — Vrstva 4 (viz docs/PLANNER_ARCHITECTURE.md).
// MVP: jediný typ 'capacity_overload'. Čistá funkce bez DOM/Supabase
// závislosti — vstup jsou reálné počty POS z Tourplan importu (app.js je
// poskládá z FULL_POS_DATA), výstup jsou Decision kandidáti k perzistenci
// a schválení Velínem. Nikdy automatický zápis dat (CO NIKDY NEROZBÍT #11a).
// ══════════════════════════════════════════════════════

const DecisionEngine = (function(){
  // Stejný princip jako existující region-capacity doporučení v app.js
  // (renderAdminDashboard — odchylka × 1.2 od průměru) — žádný nový
  // vymyšlený práh, jen rozšíření zavedeného vzoru na technika.
  const OVERLOAD_RATIO = 1.2;
  const MIN_DELTA_POS = 5; // ignorovat šum na malých číslech

  // weeklyCounts: { technicianName: { weekKey: posCount, ... }, ... } —
  // reálné počty POS z Tourplan importu, žádné odhady.
  // targetWeek: týden, který se posuzuje na přetížení; baseline = průměr
  // počtu POS téhož technika v ostatních dostupných týdnech.
  function generateCapacityDecisions(weeklyCounts, targetWeek){
    const decisions = [];
    Object.keys(weeklyCounts || {}).forEach(name => {
      const counts = weeklyCounts[name] || {};
      const targetCount = counts[targetWeek];
      if (targetCount == null) return;
      const baselineWeeks = Object.keys(counts).filter(w => w !== targetWeek && counts[w] != null);
      if (!baselineWeeks.length) return;
      const baselineAvg = baselineWeeks.reduce((s, w) => s + counts[w], 0) / baselineWeeks.length;
      if (!baselineAvg) return;
      const delta = targetCount - baselineAvg;
      if (targetCount <= baselineAvg * OVERLOAD_RATIO || delta < MIN_DELTA_POS) return;
      decisions.push({
        type: 'capacity_overload',
        technicianId: name,
        week: targetWeek,
        evidence: {
          posCount: targetCount,
          historicalAvg: Math.round(baselineAvg * 10) / 10,
          baselineWeeks,
          deltaVsAvg: Math.round(delta),
        },
        recommendation: `${name} má v týdnu ${targetWeek} ${targetCount} POS — o ${Math.round(delta)} víc než svůj průměr ${Math.round(baselineAvg)} POS (týdny ${baselineWeeks.join(', ')}). Zvážit přesun části POS na technika s volnou kapacitou.`,
        estimatedBenefit: `Vyrovnání zátěže o ~${Math.round(delta)} POS`,
        confidence: baselineWeeks.length >= 3 ? 'střední' : 'nízká',
      });
    });
    return decisions;
  }

  return { generateCapacityDecisions, OVERLOAD_RATIO, MIN_DELTA_POS };
})();
