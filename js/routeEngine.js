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

  const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

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

  // getOpeningHours(pos, dayIdx) — dayIdx: 0=Po..4=Pá (shoda s app.js DAYS),
  // 5=So, 6=Ne. Bez dayIdx vrací celý týdenní objekt (pro zobrazení v detailu
  // POS), nebo null pokud master data chybí úplně.
  // S dayIdx vrací jednu ze tří hodnot — žádný fake default:
  //   {from,to} — POS je ten den importem potvrzeno otevřené v tomto okně
  //   null       — POS je ten den importem potvrzeno ZAVŘENÉ
  //   'unknown'  — pro POS chybí master data (nelze nic předpokládat)
  function getOpeningHours(pos, dayIdx){
    const hours = pos.openingHours;
    if (dayIdx === undefined || dayIdx === null) return hours || null;
    if (!hours) return 'unknown';
    const key = DAY_KEYS[dayIdx];
    if (Object.prototype.hasOwnProperty.call(hours, key)) return hours[key];
    return 'unknown';
  }

  function parseHM(hm){
    const m = /^(\d{1,2}):(\d{2})$/.exec(hm || '');
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }
  function formatClock(min){
    const h = Math.floor(min / 60) % 24;
    const m = Math.round(min % 60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }

  // ── ROUTE CALCULATION ───────────────────────────────────────────────────
  // order: array of POS objects in the order they will be visited
  // startPoint: volitelný reálný výchozí bod technika (GPS/domov) — pokud
  // chybí, trasa se počítá tak jako dřív (začíná na order[0] bez "cesty tam").
  //
  // POS s pos.gpsSource !== 'real' (odhad z mock geocoderu, ne reálný import)
  // se do drivingKm/drivingMin NEPOČÍTAJÍ — nejde o reálnou silniční
  // vzdálenost, takže nesmí vstoupit do čísla, které velín/technik vidí jako
  // fakt. Pořád jsou ale součástí `order`/posCount (zobrazí se na mapě), jen
  // jako warning, ne jako tichá chyba ve výpočtu.
  function calculateRoute(order, startPoint){
    if (!order.length) {
      return { order: [], legs: [], posCount: 0, drivingKm: 0, drivingMin: 0, workMin: 0, totalMin: 0, warnings: [] };
    }
    const realOrder = order.filter(p => p.gpsSource === 'real');
    const warnings = order
      .filter(p => p.gpsSource !== 'real')
      .map(p => ({ posId: p.id, reason: 'gps-missing' }));
    const legs = [];
    let drivingKm = 0, drivingMin = 0;
    if (startPoint && realOrder.length) {
      const startLeg = currentProvider.getLeg(startPoint, realOrder[0]);
      legs.push({ from: 'start', to: realOrder[0].id, ...startLeg });
      drivingKm += startLeg.distanceKm;
      drivingMin += startLeg.travelTimeMin;
    }
    for (let i = 1; i < realOrder.length; i++){
      const leg = currentProvider.getLeg(realOrder[i-1], realOrder[i]);
      legs.push({ from: realOrder[i-1].id, to: realOrder[i].id, ...leg });
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
      warnings,
    };
  }

  // ── OPENING HOURS CHECK ─────────────────────────────────────────────────
  // checkOpeningHours(order, calcResult, startTime, dayIdx) -> issue[]
  // calcResult musí pocházet z calculateRoute(order, startPoint) se
  // STEJNÝM startPoint a STEJNÝM order — bez něj legs neodpovídají příjezdům.
  // Pozor: calcResult.legs počítá jen s POS, které mají reálné GPS
  // (gpsSource==='real') — POS bez reálných GPS nemají spočítaný čas
  // příjezdu, takže pro ně nelze otevírací dobu vyhodnotit (samostatný GPS
  // warning to řeší v UI).
  // Asistent, ne kontrola: vrací fakta (kdy POS otvírá/zavírá vs. kdy tam
  // technik dorazí podle SVÉHO pořadí), UI rozhoduje, jak to ukázat.
  function checkOpeningHours(order, calcResult, startTime, dayIdx){
    const startMin = parseHM(startTime);
    if (startMin === null || dayIdx === undefined || dayIdx === null) return [];
    if (!calcResult) return [];
    const realOrder = order.filter(p => p.gpsSource === 'real');
    if (calcResult.legs.length !== realOrder.length) return [];
    const issues = [];
    let clockMin = startMin;
    calcResult.legs.forEach((leg, i) => {
      clockMin += leg.travelTimeMin;
      const pos = realOrder[i];
      const hours = getOpeningHours(pos, dayIdx);
      const arrival = formatClock(clockMin);
      if (hours === 'unknown') {
        issues.push({ posId: pos.id, posName: pos.n, arrival, status: 'hours-unknown' });
      } else if (hours === null) {
        issues.push({ posId: pos.id, posName: pos.n, arrival, status: 'closed-today' });
      } else {
        const openMin = parseHM(hours.from), closeMin = parseHM(hours.to);
        if (clockMin < openMin) {
          issues.push({ posId: pos.id, posName: pos.n, arrival, status: 'too-early', opensAt: hours.from });
        } else if (clockMin > closeMin) {
          issues.push({ posId: pos.id, posName: pos.n, arrival, status: 'too-late', closesAt: hours.to });
        }
      }
      clockMin += getVisitDurationMin(pos);
    });
    return issues;
  }

  // ── OPTIMIZATION: nearest neighbor ──────────────────────────────────────
  // startPos: výchozí bod (např. první POS dne nebo poloha technika). Pokud
  // je startPos zároveň prvkem posList (stará fleet analytika bez reálného
  // GPS startu), zůstává jako první zastávka výsledného pořadí — zachování
  // zpětné kompatibility. Pokud je startPos externí bod (GPS poloha technika,
  // mimo posList), slouží jen jako kotva pro výpočet vzdáleností a do
  // výsledného pořadí se NEVKLÁDÁ (dřívější bug: fantomová "zastávka" na
  // pozici technika navyšovala posCount/workMin v porovnání).
  function nearestNeighborOrder(posList, startPos){
    if (!posList.length) return [];
    const remaining = posList.slice();
    const startIsPos = startPos && remaining.indexOf(startPos) !== -1;
    let current = startPos;
    const order = [];
    if (startIsPos) {
      remaining.splice(remaining.indexOf(startPos), 1);
      order.push(current);
    } else if (!startPos) {
      current = remaining.shift();
      order.push(current);
    }
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

  // ── OPTIMIZATION: cost function ──────────────────────────────────────────
  // Vzdálenost trasy + penalizace za porušení otevírací doby (pokud je znám
  // čas odjezdu a den). Penalizace je velká (1000 km/porušení), takže
  // optimalizace vždy preferuje pořadí bez zavřených POS před pořadím kratším
  // o pár km, ale s POS mimo otevírací dobu.
  const HOURS_VIOLATION_PENALTY_KM = 1000;
  function routeCost(order, startPoint, startTime, dayIdx){
    const calc = calculateRoute(order, startPoint);
    let violations = 0;
    if (startTime != null && dayIdx != null) {
      violations = checkOpeningHours(order, calc, startTime, dayIdx)
        .filter(i => i.status === 'too-early' || i.status === 'too-late' || i.status === 'closed-today').length;
    }
    return calc.drivingKm + violations * HOURS_VIOLATION_PENALTY_KM;
  }

  // ── OPTIMIZATION: exact (brute force) pro malé počty zastávek ───────────
  // Pro denní trasu technika (typicky pár až ~10 POS) je úplné prohledání
  // všech pořadí výpočetně levné a dává MATEMATICKY NEJLEPŠÍ pořadí — žádná
  // heuristika, žádné "asi nejlepší". Nad limit přepneme na 2-opt (níže).
  const EXACT_SEARCH_LIMIT = 8;
  function permute(arr){
    if (arr.length <= 1) return [arr];
    const result = [];
    for (let i = 0; i < arr.length; i++){
      const rest = arr.slice(0, i).concat(arr.slice(i + 1));
      for (const p of permute(rest)) result.push([arr[i], ...p]);
    }
    return result;
  }
  function exactBestOrder(posList, startPoint, startTime, dayIdx){
    let best = posList, bestCost = Infinity;
    for (const perm of permute(posList)){
      const cost = routeCost(perm, startPoint, startTime, dayIdx);
      if (cost < bestCost){ bestCost = cost; best = perm; }
    }
    return best;
  }

  // ── OPTIMIZATION: 2-opt lokální vylepšení pro větší počty zastávek ───────
  // Začne od nearest-neighbor pořadí a opakovaně zkouší obrátit úseky trasy,
  // dokud nalezne zlepšení (kratší/bez porušení otevírací doby). Standardní
  // heuristika pro TSP — odstraňuje typické "zacuknutí" nearest-neighbor.
  function twoOptImprove(initialOrder, startPoint, startTime, dayIdx){
    let order = initialOrder.slice();
    let bestCost = routeCost(order, startPoint, startTime, dayIdx);
    let improved = true;
    while (improved){
      improved = false;
      for (let i = 0; i < order.length - 1; i++){
        for (let j = i + 1; j < order.length; j++){
          const candidate = order.slice();
          const seg = candidate.slice(i, j + 1).reverse();
          candidate.splice(i, seg.length, ...seg);
          const cost = routeCost(candidate, startPoint, startTime, dayIdx);
          if (cost < bestCost - 1e-9){
            bestCost = cost; order = candidate; improved = true;
          }
        }
      }
    }
    return order;
  }

  // bestOrder(): hlavní vstupní bod optimalizace. Vrací pořadí POS (bez
  // startPoint v poli — startPoint je jen výchozí bod pro výpočet vzdáleností).
  function bestOrder(posList, startPoint, startTime, dayIdx){
    if (posList.length <= 1) return posList.slice();
    if (posList.length <= EXACT_SEARCH_LIMIT) {
      return exactBestOrder(posList, startPoint, startTime, dayIdx);
    }
    const seeded = nearestNeighborOrder(posList, startPoint).filter(p => posList.indexOf(p) !== -1);
    return twoOptImprove(seeded, startPoint, startTime, dayIdx);
  }

  // ── COMPARISON: current order vs optimized ───────────────────────────────
  // startPoint: volitelný reálný start technika. startTime/dayIdx: pokud jsou
  // známé, optimalizace zohlední i otevírací dobu (ne jen vzdálenost) —
  // bez nich (např. fleet analytika) se optimalizuje čistě podle vzdálenosti.
  function compareRoutes(posList, startPoint, startTime, dayIdx){
    const current = calculateRoute(posList, startPoint);
    const optimizedOrder = bestOrder(posList, startPoint, startTime, dayIdx);
    const optimized = calculateRoute(optimizedOrder, startPoint);
    const hasTimeContext = startTime != null && dayIdx != null;
    const currentViolations = hasTimeContext
      ? checkOpeningHours(posList, current, startTime, dayIdx).length : null;
    const optimizedViolations = hasTimeContext
      ? checkOpeningHours(optimizedOrder, optimized, startTime, dayIdx).length : null;
    return {
      before: current,
      after: optimized,
      savedKm: Math.max(0, current.drivingKm - optimized.drivingKm),
      savedMin: Math.max(0, current.drivingMin - optimized.drivingMin),
      optimizedOrderIds: optimized.order,
      currentViolations,
      optimizedViolations,
      exact: posList.length <= EXACT_SEARCH_LIMIT,
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
    checkOpeningHours,
    formatClock,
    parseHM,
    DAY_KEYS,
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
