// ══════════════════════════════════════════════════════
// DATA PROVIDER — jediný zdroj pravdy pro POS/technik data napříč appkou
// ══════════════════════════════════════════════════════
// UI (app.js, Dashboard, Live, Technici, POS Network, Mapa, Route Engine) se
// dotazuje JEN na tuto vrstvu — nezajímá ji, jestli data pocházejí z baked
// Excel importu (dnes), z budoucího live "Excel upload" tlačítka, nebo z
// budoucí DB/API. Až ten den přijde, vymění se jen implementace uvnitř
// tohoto modulu — `getPosWeeks()`/`getTechnicianNames()`/`getSummary()`
// signatura zůstává stejná.
//
// Dnešní zdroj: TOURPLAN_RAW (js/tourplanRaw.js, jednorázová konverze
// reálného Tourplan_week_2028.xlsx) + ExcelImport.buildPosWeeks().

(function(global){

  let cache = null;

  function build(opts){
    const ExcelImport = global.ExcelImport || (typeof require !== 'undefined' && require('./excelImport.js'));
    const rawRows = global.TOURPLAN_RAW || (typeof require !== 'undefined' && require('./tourplanRaw.js'));
    const weekKeys = opts.weekKeys;
    const { weeks, summary, warnings } = ExcelImport.buildPosWeeks(rawRows, weekKeys, opts);
    const technicianNames = Array.from(new Set(rawRows.map(r => (r[ExcelImport.COLS.TECHNICIAN] || '').trim()).filter(Boolean)));
    return { weeks, summary, warnings, technicianNames };
  }

  // getPosWeeks(weekKeys, opts) -> { [week]: [posObj...] }
  // opts: { currentWeek, todayIdx } — stejné jako dřív DemoData.generateAllDemoTechnicians.
  function getPosWeeks(weekKeys, opts){
    if(!cache) cache = build(Object.assign({ weekKeys }, opts||{}));
    return cache.weeks;
  }

  // getTechnicianNames() -> string[] — reálná jména z importu (dnes 27, viz Excel).
  function getTechnicianNames(weekKeys, opts){
    if(!cache) cache = build(Object.assign({ weekKeys }, opts||{}));
    return cache.technicianNames;
  }

  // getSummary() -> { technicians, posCount, terminalCount, missing*, duplicateTerminals }
  // pro import summary report (PART 6 požadavek "Show import summary").
  function getSummary(){
    return cache ? cache.summary : null;
  }

  function getWarnings(){
    return cache ? cache.warnings : [];
  }

  function reset(){ cache = null; }

  const DataProvider = { getPosWeeks, getTechnicianNames, getSummary, getWarnings, reset };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataProvider;
  } else {
    global.DataProvider = DataProvider;
  }

})(typeof window !== 'undefined' ? window : globalThis);
