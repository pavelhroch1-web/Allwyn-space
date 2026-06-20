// ══════════════════════════════════════════════════════
// ROUTE INTELLIGENCE ENGINE
// ══════════════════════════════════════════════════════
// Skutečný výpočetní modul pro plánování trasy technika. Bez DOM závislostí —
// vstup jsou POS objekty (s lat/lng), výstup jsou čísla. UI vrstva (app.js)
// pouze čte výsledky a vykresluje je.
//
// Architektura počítá s výměnou poskytovatele vzdálenosti:
//   - DistanceProvider.HAVERSINE — dnešní mock (vzdušná čára × koeficient silnic)
//   - DistanceProvider.GOOGLE_MAPS — připravený adaptér pro Google Maps
//     Directions/Distance Matrix API (reálný provoz, zatáčky, dopravní situace)
// Přepnutí: RouteEngine.setDistanceProvider(RouteEngine.providers.googleMaps).
// Zbytek enginu (optimalizace, workload, analytika) volá pouze
// `currentProvider.getLeg(a, b)` a nezajímá ho, odkud čísla pocházejí.

(function(global){

  // ── KONSTANTY (nahraditelné konfigurací) ──────────────────────────────
  const ROAD_COEFFICIENT = 1.3;   // vzdušná čára -> reálná silniční vzdálenost (zatáčky, obchvaty)
  const AVERAGE_SPEED_KMH = 45;   // smíšený provoz okres/krajské silnice ČR

  const VISIT_DURATION_MIN = {
    standardCheck: 15,   // běžná kontrola, doplnění sázenek/losů
    installation: 45,    // instalace nového terminálu/totemu
    service: 30,         // servisní zásah (oprava, závada)
    priorityIssue: 40,   // urgentní/flagovaný problém
  };

  const DEFAULT_OPENING_HOURS = { from: '08:00', to: '18:00' };

  // ── HAVERSINE ──────────────────────────────────────────────────────────
  function haversineKm(a, b){
    const R = 6371;
    const dLat = (b.lat - a.lat) * Math.PI/180;
    const dLng = (b.lng - a.lng) * Math.PI/180;
    const s = Math.sin(dLat/2)**2 +
      Math.cos(a.lat*Math.PI/180) * Math.cos(b.lat*Math.PI/180) * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
  }

  // ── DISTANCE PROVIDERS ──────────────────────────────────────────────────
  // Společné rozhraní: getLeg(a, b) -> { distanceKm, travelTimeMin }
  const providers = {
    haversine: {
      name: 'haversine-mock',
      getLeg(a, b){
        const straightKm = haversineKm(a, b);
        const distanceKm = straightKm * ROAD_COEFFICIENT;
        const travelTimeMin = (distanceKm / AVERAGE_SPEED_KMH) * 60;
        return { distanceKm, travelTimeMin };
      }
    },
    // Připravený adaptér — implementace doplní reálné volání Google Maps
    // Distance Matrix API (živé dopravní podmínky). Rozhraní je identické
    // s `haversine`, takže výměna nevyžaduje zásah do UI ani do optimalizace.
    googleMaps: {
      name: 'google-maps',
      getLeg(/* a, b */){
        throw new Error(
          'Google Maps distance provider not yet implemented. ' +
          'Set RouteEngine.setDistanceProvider(RouteEngine.providers.haversine) ' +
          'or implement a real Distance Matrix API call here.'
        );
      }
    }
  };

  let currentProvider = providers.haversine;
  function setDistanceProvider(provider){ currentProvider = provider; }
  function getDistanceProvider(){ return currentProvider; }

  // ── WORKLOAD (doba na POS) ─────────────────────────────────────────────
  function classifyVisit(pos){
    const tasks = pos.taskState || [];
    if (tasks.some(t => t.src === 'servis' && !t.done)) return 'service';
    if (tasks.some(t => !t.done && t.note && /urgentní|urgent/i.test(t.note))) return 'priorityIssue';
    if (pos.visitType === 'installation') return 'installation';
    return 'standardCheck';
  }

  function getVisitDurationMin(pos){
    if (typeof pos.estimatedVisitDuration === 'number') return pos.estimatedVisitDuration;
    return VISIT_DURATION_MIN[classifyVisit(pos)];
  }

  function getOpeningHours(pos){
    return pos.openingHours || DEFAULT_OPENING_HOURS;
  }

  // ── ROUTE CALCULATION ───────────────────────────────────────────────────
  // order: array of POS objects in the order they will be visited
  function calculateRoute(order){
    if (!order.length) {
      return { order: [], legs: [], posCount: 0, drivingKm: 0, drivingMin: 0, workMin: 0, totalMin: 0 };
    }
    const legs = [];
    let drivingKm = 0, drivingMin = 0;
    for (let i = 1; i < order.length; i++){
      const leg = currentProvider.getLeg(order[i-1], order[i]);
      legs.push({ from: order[i-1].id, to: order[i].id, ...leg });
      drivingKm += leg.distanceKm;
      drivingMin += leg.travelTimeMin;
    }
    const workMin = order.reduce((sum, p) => sum + getVisitDurationMin(p), 0);
    return {
      order: order.map(p => p.id),
      legs,
      posCount: order.length,
      drivingKm,
      drivingMin,
      workMin,
      totalMin: drivingMin + workMin,
    };
  }

  // ── OPTIMIZATION: nearest neighbor ──────────────────────────────────────
  // startPos: výchozí bod (např. první POS dne nebo poloha technika). Pokud
  // chybí, použije se první POS ze vstupního pořadí jako start.
  function nearestNeighborOrder(posList, startPos){
    if (!posList.length) return [];
    const remaining = posList.slice();
    let current = startPos || remaining.shift();
    if (startPos) {
      const idx = remaining.indexOf(startPos);
      if (idx !== -1) remaining.splice(idx, 1);
    }
    const order = [current];
    while (remaining.length){
      let bestIdx = 0, bestKm = Infinity;
      for (let i = 0; i < remaining.length; i++){
        const km = currentProvider.getLeg(current, remaining[i]).distanceKm;
        if (km < bestKm){ bestKm = km; bestIdx = i; }
      }
      current = remaining.splice(bestIdx, 1)[0];
      order.push(current);
    }
    return order;
  }

  // ── COMPARISON: current order vs optimized ───────────────────────────────
  function compareRoutes(posList){
    const current = calculateRoute(posList);
    const optimizedOrder = nearestNeighborOrder(posList, posList[0]);
    const optimized = calculateRoute(optimizedOrder);
    return {
      before: current,
      after: optimized,
      savedKm: Math.max(0, current.drivingKm - optimized.drivingKm),
      savedMin: Math.max(0, current.drivingMin - optimized.drivingMin),
      optimizedOrderIds: optimized.order,
    };
  }

  // ── FLEET / VELÍN ANALYTICS ───────────────────────────────────────────────
  // routesByTechnician: { technicianId: POS[] } — denní/týdenní plán každého technika.
  // Používá identický engine jako technik — žádná samostatná "fake" čísla.
  function analyzeFleet(routesByTechnician){
    const perTechnician = {};
    let totalWastedKm = 0, totalWastedMin = 0, totalDrivingKm = 0;

    for (const [techId, posList] of Object.entries(routesByTechnician)){
      if (!posList || !posList.length) continue;
      const cmp = compareRoutes(posList);
      perTechnician[techId] = cmp;
      totalWastedKm += cmp.savedKm;
      totalWastedMin += cmp.savedMin;
      totalDrivingKm += cmp.before.drivingKm;
    }

    const efficiencyScore = totalDrivingKm > 0
      ? Math.round((1 - totalWastedKm / totalDrivingKm) * 100)
      : 100;

    return {
      perTechnician,
      wastedKm: totalWastedKm,
      wastedHours: totalWastedMin / 60,
      efficiencyScore,
      optimizationPotentialPct: totalDrivingKm > 0
        ? Math.round((totalWastedKm / totalDrivingKm) * 100)
        : 0,
    };
  }

  // ── FORMATTING HELPERS ────────────────────────────────────────────────
  function formatHM(min){
    const h = Math.floor(min/60);
    const m = Math.round(min%60);
    return h>0 ? `${h}h ${String(m).padStart(2,'0')}m` : `${m}m`;
  }
  function formatKm(km){ return `${km.toFixed(1)} km`; }

  const RouteEngine = {
    providers,
    setDistanceProvider,
    getDistanceProvider,
    haversineKm,
    getVisitDurationMin,
    classifyVisit,
    getOpeningHours,
    calculateRoute,
    nearestNeighborOrder,
    compareRoutes,
    analyzeFleet,
    formatHM,
    formatKm,
    VISIT_DURATION_MIN,
    ROAD_COEFFICIENT,
    AVERAGE_SPEED_KMH,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RouteEngine;
  } else {
    global.RouteEngine = RouteEngine;
  }

})(typeof window !== 'undefined' ? window : globalThis);
