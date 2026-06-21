// ══════════════════════════════════════════════════════
// DEMO DATA GENERATOR — deterministické POS pro demo techniky
// ══════════════════════════════════════════════════════
// Lán Tomáš je jediný REÁLNÝ technik (REAL_DATA.weeks). Zbylých 26 jmen
// z REAL_DATA.techs jsou demo technici — historicky měli jen vymyšlené
// statické statistiky (total/done/lat/lng/activity). Tento modul jim
// místo toho vygeneruje REÁLNÁ POS data (stejný tvar jako REAL_DATA.weeks),
// která pak proudí přes stejný pipeline (PosModel/TechnicianModel/RouteEngine)
// jako reálná data — žádné číslo se znovu nevymýšlí na úrovni technika.
//
// Determinismus: žádný Math.random — vše odvozeno z stableUnit() (geo.js),
// takže demo data jsou stabilní mezi reloady.

(function(global){

  const CHANNELS = ['IDT', 'KA', 'PETROL', 'CORN'];
  const POS_NAME_POOL = [
    'Trafika', 'Sázková kancelář', 'Večerka', 'Smíšené zboží', 'Novinový stánek',
    'Potraviny', 'Tabák', 'Kiosek', 'Benzínová stanice', 'Restaurace U Allwyn',
  ];
  const TERRITORY_SPREAD_DEG = 0.18; // ~18km poloměr od centroidu technika

  // Hrubá regionalizace dle souřadnic (RSE/RSZ/RSJ/RSM/PHA dle CLAUDE.md).
  function regionForCoord(lat, lng) {
    if (lat >= 49.85 && lat <= 50.25 && lng >= 14.0 && lng <= 14.8) return 'PHA';
    if (lng < 14.0) return 'RSZ';
    if (lat < 49.65 && lng >= 15.5) return 'RSJ';
    if (lng >= 16.5) return 'RSM';
    return 'RSE';
  }

  function slug(name) {
    return (name || '').toLowerCase().replace(/[^a-z0-9]+/gi, '-');
  }
  function pick(arr, unit) {
    return arr[Math.floor(unit * arr.length) % arr.length];
  }

  // Kolik POS celkem (přes všechny týdny) bude mít tento technik — 28-40,
  // deterministicky odvozeno ze jména (stejný řád velikosti jako reálný
  // technik: 211 POS / 6 týdnů ≈ 35/týden).
  function totalPosForTech(name) {
    return 28 + Math.floor(stableUnit(name + '|count') * 13);
  }

  // visited flag pro jednu demo POS — stejná logika jako reálná aktivita:
  // minulé týdny ~90% hotovo, aktuální týden dle dne (minulé dny ~88%,
  // dnešní den ~45% — realistické "rozjeté ráno", budoucí dny nikdy.
  function computeVisited(id, week, currentWeek, dayIdx, todayIdx) {
    if (Number(week) < Number(currentWeek)) {
      return stableUnit(id + '|hist') > 0.10;
    }
    if (Number(week) > Number(currentWeek)) {
      return false;
    }
    const effectiveToday = todayIdx === null || todayIdx === undefined ? 4 : todayIdx;
    if (dayIdx < effectiveToday) return stableUnit(id + '|past') > 0.12;
    if (dayIdx === effectiveToday) return stableUnit(id + '|today') > 0.55;
    return false;
  }

  // generateDemoWeeks(techMeta, weekKeys, opts) -> { week: [rawPos...] }
  // techMeta: {name, lat, lng} (z REAL_DATA.techs). Tvar výstupních objektů
  // je shodný s REAL_DATA.weeks[w][i], tedy jde stejnou augmentační cestou
  // (TASK_TMPL/REFS/INV_DEFAULT) jako reálná POS v app.js.
  function generateDemoWeeks(techMeta, weekKeys, opts) {
    opts = opts || {};
    const currentWeek = opts.currentWeek || weekKeys[Math.floor(weekKeys.length / 2)];
    const todayIdx = opts.todayIdx;
    const total = totalPosForTech(techMeta.name);
    const perWeek = Math.max(1, Math.round(total / weekKeys.length));
    const out = {};
    let counter = 0;
    weekKeys.forEach(week => {
      const list = [];
      for (let i = 0; i < perWeek; i++) {
        const id = `DEMO-${slug(techMeta.name)}-${counter++}`;
        const dayIdx = i % 5;
        const u1 = stableUnit(id + '|lat');
        const u2 = stableUnit(id + '|lng');
        const lat = techMeta.lat + (u1 * 2 - 1) * TERRITORY_SPREAD_DEG;
        const lng = techMeta.lng + (u2 * 2 - 1) * TERRITORY_SPREAD_DEG;
        const typ = pick(CHANNELS, stableUnit(id + '|ch'));
        const posName = `${pick(POS_NAME_POOL, stableUnit(id + '|name'))} ${counter}`;
        list.push({
          id,
          n: posName,
          a: `Demo ${counter}, ${regionForCoord(lat, lng)}`,
          m: typ,
          k: typ === 'CORN' ? '9DEMO' : '1DEMO',
          partner: typ,
          typ,
          area: regionForCoord(lat, lng),
          v: computeVisited(id, week, currentWeek, dayIdx, todayIdx),
          d: dayIdx,
          lat,
          lng,
          tasks: [],
          refs: [],
          inventory: [],
        });
      }
      out[week] = list;
    });
    return out;
  }

  // generateAllDemoTechnicians(techsMeta, weekKeys, opts) -> { week: [rawPos...] }
  // merged across all demo technicians, ready to be appended to posData[week].
  function generateAllDemoTechnicians(techsMeta, weekKeys, opts) {
    const merged = {};
    weekKeys.forEach(w => merged[w] = []);
    techsMeta.forEach(t => {
      const weeks = generateDemoWeeks(t, weekKeys, opts);
      weekKeys.forEach(w => merged[w].push(...weeks[w].map(p => ({ ...p, assignedTechnician: t.name }))));
    });
    return merged;
  }

  const DemoData = {
    regionForCoord,
    totalPosForTech,
    computeVisited,
    generateDemoWeeks,
    generateAllDemoTechnicians,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DemoData;
  } else {
    global.DemoData = DemoData;
  }

})(typeof window !== 'undefined' ? window : globalThis);
