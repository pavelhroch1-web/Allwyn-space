// ══════════════════════════════════════════════════════
// DECISION ENGINE — Vrstva 4 (viz docs/PLANNER_ARCHITECTURE.md).
// MVP: jediný typ 'capacity_overload'. Čistá funkce bez DOM/Supabase
// závislosti — vstup jsou reálné počty POS z Tourplan importu (app.js je
// poskládá z FULL_POS_DATA), výstup jsou Decision kandidáti k perzistenci
// a schválení Velínem. Nikdy automatický zápis dat (CO NIKDY NEROZBÍT #11a).
// ══════════════════════════════════════════════════════

const DecisionEngine = (function(global){
  const RouteEngine = (global && global.RouteEngine) || (typeof require !== 'undefined' && require('./routeEngine.js'));

  // Stejný princip jako existující region-capacity doporučení v app.js
  // (renderAdminDashboard — odchylka × 1.2 od průměru) — žádný nový
  // vymyšlený práh, jen rozšíření zavedeného vzoru na technika.
  const OVERLOAD_RATIO = 1.2;
  const MIN_DELTA_POS = 5; // ignorovat šum na malých číslech

  function centroid(posArr){
    const usable = posArr.filter(RouteEngine.hasUsableGps);
    if (!usable.length) return null;
    const lat = usable.reduce((s, p) => s + p.lat, 0) / usable.length;
    const lng = usable.reduce((s, p) => s + p.lng, 0) / usable.length;
    return { lat, lng };
  }

  // Hledá mezi ostatními techniky toho s nejnižším počtem POS v targetWeek —
  // reálná volná kapacita z Tourplan importu, ne odhad.
  function findTargetTechnician(weeklyPosByTech, excludeName, targetWeek){
    let best = null, bestCount = Infinity;
    Object.keys(weeklyPosByTech).forEach(name => {
      if (name === excludeName) return;
      const arr = (weeklyPosByTech[name] || {})[targetWeek];
      if (!arr) return;
      if (arr.length < bestCount){ bestCount = arr.length; best = name; }
    });
    return best;
  }

  // weeklyPosByTech: { technicianName: { weekKey: POS[] } } — reálná POS
  // pole z FULL_POS_DATA (s lat/lng/gpsSource), žádné odhady.
  // targetWeek: týden, který se posuzuje na přetížení; baseline = průměr
  // počtu POS téhož technika v ostatních dostupných týdnech.
  function generateCapacityDecisions(weeklyPosByTech, targetWeek){
    const decisions = [];
    Object.keys(weeklyPosByTech || {}).forEach(name => {
      const weeks = weeklyPosByTech[name] || {};
      const targetArr = weeks[targetWeek];
      if (targetArr == null) return;
      const targetCount = targetArr.length;
      const baselineWeeks = Object.keys(weeks).filter(w => w !== targetWeek && weeks[w] != null);
      if (!baselineWeeks.length) return;
      const baselineAvg = baselineWeeks.reduce((s, w) => s + weeks[w].length, 0) / baselineWeeks.length;
      if (!baselineAvg) return;
      const delta = targetCount - baselineAvg;
      if (targetCount <= baselineAvg * OVERLOAD_RATIO || delta < MIN_DELTA_POS) return;

      const moveCount = Math.round(delta);
      const targetTechnician = findTargetTechnician(weeklyPosByTech, name, targetWeek);
      let suggestedPos = [];
      if (targetTechnician){
        const targetCentroid = centroid(weeklyPosByTech[targetTechnician][targetWeek] || []);
        const usableOverloaded = targetArr.filter(RouteEngine.hasUsableGps);
        if (targetCentroid && usableOverloaded.length){
          suggestedPos = usableOverloaded
            .map(p => ({
              id: p.id, name: p.n, address: p.a, lat: p.lat, lng: p.lng,
              distanceKm: Math.round(RouteEngine.getDistanceProvider().getLeg(targetCentroid, p).distanceKm * 10) / 10,
            }))
            .sort((a, b) => a.distanceKm - b.distanceKm)
            .slice(0, moveCount);
        }
      }
      const weeklyTrend = baselineWeeks.concat([targetWeek])
        .sort()
        .map(w => ({ week: w, count: weeks[w].length }));

      decisions.push({
        type: 'capacity_overload',
        technicianId: name,
        week: targetWeek,
        evidence: {
          posCount: targetCount,
          historicalAvg: Math.round(baselineAvg * 10) / 10,
          baselineWeeks,
          deltaVsAvg: Math.round(delta),
          weeklyTrend,
          targetTechnician,
          suggestedPos,
        },
        recommendation: `${name} má v týdnu ${targetWeek} ${targetCount} POS — o ${Math.round(delta)} víc než svůj průměr ${Math.round(baselineAvg)} POS (týdny ${baselineWeeks.join(', ')}).` + (targetTechnician ? ` Zvážit přesun ${suggestedPos.length} POS na ${targetTechnician} (nejvolnější kapacita).` : ' Zvážit přesun části POS na technika s volnou kapacitou.'),
        estimatedBenefit: `Vyrovnání zátěže o ~${Math.round(delta)} POS`,
        confidence: baselineWeeks.length >= 3 ? 'střední' : 'nízká',
      });
    });
    return decisions;
  }

  return { generateCapacityDecisions, OVERLOAD_RATIO, MIN_DELTA_POS };
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : globalThis));
