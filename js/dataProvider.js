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

  // Velín může v "Import dat" nahrát novou Tourplan tabulku (PART 2) — uloží se
  // do localStorage a od dalšího startu appky nahradí baked TOURPLAN_RAW.
  // "source" rozlišuje, jestli appka běží na baked exportu, nebo na reálně
  // nahraném souboru (zobrazeno v UI, žádné tiché přepnutí na fake data).
  function loadOverride(){
    try {
      const raw = global.localStorage && global.localStorage.getItem('tourplanImportOverride');
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      if(Array.isArray(parsed.rows) && parsed.rows.length) return parsed;
      return null;
    } catch(e){ return null; }
  }

  function build(opts){
    const ExcelImport = global.ExcelImport || (typeof require !== 'undefined' && require('./excelImport.js'));
    const override = loadOverride();
    const rawRows = override ? override.rows : (global.TOURPLAN_RAW || (typeof require !== 'undefined' && require('./tourplanRaw.js')));
    const source = override ? { type: 'upload', fileName: override.fileName, importedAt: override.importedAt } : { type: 'baked', fileName: 'Tourplan_week_2028.xlsx' };
    const weekKeys = opts.weekKeys;
    const { weeks, summary, warnings } = ExcelImport.buildPosWeeks(rawRows, weekKeys, opts);
    const technicianNames = Array.from(new Set(rawRows.map(r => (r[ExcelImport.COLS.TECHNICIAN] || '').trim()).filter(Boolean)));
    return { weeks, summary, warnings, technicianNames, source };
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

  // getSource() -> { type: 'baked'|'upload', fileName, importedAt? } — pro
  // traceability (PART 7) a "Import dat" stránku (PART 2).
  function getSource(){
    return cache ? cache.source : null;
  }

  // setOverride(rows, fileName) -> uloží reálně nahraná data jako budoucí
  // zdroj appky (vyžaduje reload, protože FULL_POS_DATA/posData v app.js
  // jsou const naplněné jednou při startu).
  // Přes global.lss() (ne přímo localStorage.setItem) — sync.js zachytí
  // tenhle zápis stejně jako kterýkoliv jiný lss() a propíše ho do Supabase,
  // takže nahraný Excel uvidí i technici na svých zařízeních, ne jen Velín.
  function setOverride(rows, fileName){
    if(!global.localStorage) return false;
    const value = { rows, fileName, importedAt: new Date().toISOString() };
    if(typeof global.lss === 'function') global.lss('tourplanImportOverride', value);
    else global.localStorage.setItem('tourplanImportOverride', JSON.stringify(value));
    return true;
  }

  function clearOverride(){
    if(global.localStorage) global.localStorage.removeItem('tourplanImportOverride');
  }

  function reset(){ cache = null; masterCache = null; }

  // ── POS MASTER DATA (GPS + otevírací doba) — samostatný import, samostatný
  // cache. Nezávislé na týdenním Tourplan importu výše. ────────────────────
  let masterCache = null;

  function loadMasterOverride(){
    try {
      const raw = global.localStorage && global.localStorage.getItem('posMasterDataOverride');
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      if(Array.isArray(parsed.rows) && parsed.rows.length) return parsed;
      return null;
    } catch(e){ return null; }
  }

  function buildMaster(){
    const PosMasterData = global.PosMasterData || (typeof require !== 'undefined' && require('./posMasterData.js'));
    const override = loadMasterOverride();
    if (!override) return { map: {}, summary: null, warnings: [], source: null };
    const { map, summary, warnings } = PosMasterData.buildPosMasterMap(override.rows);
    return { map, summary, warnings, source: { type: 'upload', fileName: override.fileName, importedAt: override.importedAt } };
  }

  // getPosMasterMap() -> { [posId]: { lat, lng, openingHours } } — prázdná
  // mapa, pokud Pavel ještě nedodal soubor (žádná smyšlená data).
  function getPosMasterMap(){
    if(!masterCache) masterCache = buildMaster();
    return masterCache.map;
  }

  function getPosMasterSummary(){
    if(!masterCache) masterCache = buildMaster();
    return masterCache.summary;
  }

  function getPosMasterSource(){
    if(!masterCache) masterCache = buildMaster();
    return masterCache.source;
  }

  function setPosMasterOverride(rows, fileName){
    if(!global.localStorage) return false;
    const value = { rows, fileName, importedAt: new Date().toISOString() };
    if(typeof global.lss === 'function') global.lss('posMasterDataOverride', value);
    else global.localStorage.setItem('posMasterDataOverride', JSON.stringify(value));
    return true;
  }

  function clearPosMasterOverride(){
    if(global.localStorage) global.localStorage.removeItem('posMasterDataOverride');
  }

  const DataProvider = {
    getPosWeeks, getTechnicianNames, getSummary, getWarnings, getSource, setOverride, clearOverride, reset,
    getPosMasterMap, getPosMasterSummary, getPosMasterSource, setPosMasterOverride, clearPosMasterOverride,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataProvider;
  } else {
    global.DataProvider = DataProvider;
  }

})(typeof window !== 'undefined' ? window : globalThis);
