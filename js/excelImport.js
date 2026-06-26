// ══════════════════════════════════════════════════════
// EXCEL IMPORT — parser/transformátor reálného Tourplan exportu
// ══════════════════════════════════════════════════════
// Čistá, DOM-free vrstva (žádné UI, žádné globální posData). Vstupem je pole
// řádků ve tvaru TOURPLAN_RAW (js/tourplanRaw.js) — tentýž tvar by vracel i
// budoucí "Excel upload" (po parsování SheetJS knihovnou na klientu), takže
// tato logika je znovupoužitelná pro live upload bez úprav.
//
// Business pravidlo: jedno POS může mít víc terminálů (technik navštěvuje
// POS, ne terminál). V aktuálním exportu je vztah 1:1, ale groupování probíhá
// po pos_id obecně, takže se kód nezmění, až bude POS mít víc terminálů.
//
// Determinismus: žádný Math.random — den/navštívenost POS bez přiřazeného
// týdne se odvozuje výhradně z stableUnit() (geo.js).

(function(global){

  const stableUnit = global.stableUnit || (typeof require !== 'undefined' && require('./geo.js').stableUnit);

  const COLS = {
    TERMINAL_ID: 0, POS_ID: 1, TERMINAL_TYPE: 2, MARKET: 3, KATEGORIE: 4,
    KATEGORIZACE: 5, NAME: 6, STREET: 7, HOUSE_NUMBER: 8, CITY: 9,
    AREA: 10, TECHNICIAN: 11, WEEK: 12,
  };

  // Reálné MARKET hodnoty z exportu -> kanál používaný v TASK_TMPL/REFS/INV_DEFAULT.
  const MARKET_TO_CHANNEL = {
    'IDT': 'IDT',
    'KA PARTNERS': 'KA',
    'PETROL': 'PETROL',
    'CORN': 'CORN',
    'ČESKÁ POŠTA': 'IDT', // ojedinělý edge-case (1 řádek), bez vlastního kanálu v UI
  };

  function validateColumns(rawRows){
    if(!Array.isArray(rawRows)) throw new Error('TOURPLAN_RAW musí být pole řádků');
    if(rawRows.length===0) return { ok:true, warnings:['Žádná data k importu'] };
    const sample = rawRows[0];
    if(!Array.isArray(sample) || sample.length < 13){
      throw new Error('Neočekávaná struktura řádku — chybí některý z 13 sloupců Tourplan exportu');
    }
    return { ok:true, warnings:[] };
  }

  function buildAddress(street, houseNumber, city){
    const streetPart = [street, houseNumber].filter(Boolean).join(' ').trim();
    return [streetPart, city].filter(Boolean).join(', ');
  }

  // Den v týdnu pro nenavštívené POS (technik si den naplánuje sám v UI —
  // toto je jen deterministický placeholder, augmentRawPos jej stejně
  // promaže na null, pokud v=false).
  function deterministicDayIdx(id){
    return Math.floor(stableUnit(id+'|day')*5);
  }

  // Tourplan obsahuje jen PLÁN (kdo/kam/kdy), ne historii návštěv — import
  // proto nikdy nesmí vymýšlet, že POS byla už navštívena. To by byl fake
  // výkon technika (zakázáno, CLAUDE.md). Reálný stav `v` přichází výhradně
  // z reálné návštěvy technika (markVisited), uložené ve VisitStore/localStorage.
  function computeVisited(){
    return false;
  }

  /**
   * buildPosWeeks(rawRows, weekKeys, opts) -> { weeks, summary, warnings }
   *
   * weeks: { [weekKey]: [posObj...] } — tvar shodný s REAL_DATA.weeks[w][i]
   *   (id, n, a, m, k, partner, typ, area, v, d, lat?, lng?, assignedTechnician,
   *   terminals[]), připravený na stejnou augmentaci (augmentRawPos v app.js).
   */
  function buildPosWeeks(rawRows, weekKeys, opts){
    opts = opts || {};
    const currentWeek = opts.currentWeek || weekKeys[Math.floor(weekKeys.length/2)];
    const todayIdx = opts.todayIdx;
    validateColumns(rawRows);

    const weeks = {};
    weekKeys.forEach(w => weeks[w] = []);

    const warnings = [];
    const seenPos = new Map(); // pos_id -> row count (pro detekci duplicit terminal_id)
    const seenTerminals = new Set();
    let missingTechnician = 0, missingAddress = 0, missingWeek = 0, duplicateTerminals = 0;
    const technicianSet = new Set();
    const posIds = new Set();

    rawRows.forEach((r, idx) => {
      const terminalId = r[COLS.TERMINAL_ID];
      const posId = r[COLS.POS_ID];
      const terminalType = r[COLS.TERMINAL_TYPE];
      const market = r[COLS.MARKET];
      const kategorie = r[COLS.KATEGORIE];
      const name = r[COLS.NAME];
      const street = r[COLS.STREET];
      const houseNumber = r[COLS.HOUSE_NUMBER];
      const city = r[COLS.CITY];
      const area = r[COLS.AREA];
      const technician = (r[COLS.TECHNICIAN] || '').trim();
      let week = (r[COLS.WEEK] || '').toString().trim();

      if(seenTerminals.has(terminalId)){ duplicateTerminals++; }
      seenTerminals.add(terminalId);
      posIds.add(posId);

      if(!technician) missingTechnician++; else technicianSet.add(technician);
      const address = buildAddress(street, houseNumber, city);
      if(!street && !city) missingAddress++;

      if(!week || weekKeys.indexOf(week) === -1){
        missingWeek++;
        // Bez přiřazeného týdne v exportu — rozlož deterministicky napříč
        // všemi týdny dle pos_id, aby žádný jeden týden nebyl uměle nadsazen.
        week = weekKeys[Math.floor(stableUnit(posId+'|week') * weekKeys.length)];
      }

      const channel = MARKET_TO_CHANNEL[market] || 'IDT';
      const dayIdx = deterministicDayIdx(posId);
      const visited = computeVisited(posId, week, currentWeek, dayIdx, todayIdx);

      const terminal = { id: terminalId, type: terminalType || 'VELKY TERMINAL', status: 'active', posId };

      let existing = seenPos.get(posId);
      if(existing && existing.week === week){
        // Stejné POS, druhý terminál ve stejném týdnu — připojí terminál
        // (obecná podpora 1 POS : N terminálů, byť v aktuálním exportu 1:1).
        existing.pos.terminals.push(terminal);
        return;
      }

      const posObj = {
        id: posId,
        n: name || '',
        a: address,
        m: market || '',
        k: kategorie || '',
        partner: kategorie || '',
        typ: channel,
        area: area || '',
        v: visited,
        d: dayIdx,
        assignedTechnician: technician || null,
        terminals: [terminal],
      };
      weeks[week].push(posObj);
      seenPos.set(posId, { week, pos: posObj });
    });

    if(missingTechnician>0) warnings.push(`${missingTechnician} POS bez přiřazeného technika`);
    if(missingAddress>0) warnings.push(`${missingAddress} POS bez adresy (ulice i město chybí)`);
    if(missingWeek>0) warnings.push(`${missingWeek} POS bez přiřazeného týdne — rozloženo rovnoměrně do 6 týdnů`);
    if(duplicateTerminals>0) warnings.push(`${duplicateTerminals} duplicitních ID terminálu v exportu`);

    const summary = {
      technicians: technicianSet.size,
      posCount: posIds.size,
      terminalCount: rawRows.length,
      missingTechnician, missingAddress, missingWeek, duplicateTerminals,
    };

    return { weeks, summary, warnings };
  }

  const ExcelImport = {
    COLS,
    MARKET_TO_CHANNEL,
    validateColumns,
    buildAddress,
    computeVisited,
    buildPosWeeks,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExcelImport;
  } else {
    global.ExcelImport = ExcelImport;
  }

})(typeof window !== 'undefined' ? window : globalThis);
