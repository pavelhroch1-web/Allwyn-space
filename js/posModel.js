// ══════════════════════════════════════════════════════
// POS DATA MODEL — jeden sdílený model POS pro celou appku
// ══════════════════════════════════════════════════════
// Bez DOM závislostí. Berie skutečná POS data (posData z app.js, od importu
// reálného Tourplan exportu sestavená přes DataProvider/ExcelImport) a vrací
// kanonickou reprezentaci se VŠEMI poli požadovanými pro Admin POS
// Management / Velín / Route Engine. Žádné nové vymyšlené hodnoty —
// jen odvozené z reálných polí (taskState, inventory, d, v, lat/lng,
// assignedTechnician…).
//
// Budoucí Excel import: mapování sloupců na kanonická pole — connectorová
// vrstva se nemění, jen se naplní `IMPORT_COLUMN_MAP` reálnými hlavičkami.

(function(global){

  // Defenzivní fallback pro vzácný případ POS bez přiřazeného technika
  // v importu (viz ExcelImport warnings) — ne smyšlené rozdělení území.
  const SOLE_REAL_TECHNICIAN = 'Lán Tomáš';
  const DEFAULT_REGION = 'RSE'; // konzistentní s defaultem použitým jinde v appce

  // Pilot mode — 5 reálných techniků se srovnatelnou týdenní zátěží
  // (Tourplan W25: 40/39/38/37/37 POS), žádní outlieři. Zdroj čísel:
  // FULL_POS_DATA filtrované po assignedTechnician, viz docs/PILOT_READINESS.md §4.
  const PILOT_TECHNICIANS = ['Lán Tomáš', 'Hrubý Jiří', 'Herman Petr', 'Štolba Jan', 'Dvořák Petr'];

  // Budoucí Excel import — sloupec v Excelu -> kanonické pole modelu.
  // Vyplní se až bude k dispozici reálný export ze SAP/Excelu.
  const IMPORT_COLUMN_MAP = {
    'POS ID': 'posId',
    'Název POS': 'posName',
    'Adresa': 'address',
    'GPS Lat': 'lat',
    'GPS Lng': 'lng',
    'Středisko': 'region',
    'Kanál': 'channel',
    'Technik': 'assignedTechnician',
    'Priorita': 'priority',
    'Doba návštěvy (min)': 'estimatedVisitDuration',
    'Otevírací doba': 'openingHours',
  };

  function parseCsDate(str){
    // formát 'DD.MM.YYYY' (toLocaleDateString('cs-CZ'))
    if (!str) return null;
    const m = str.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
    if (!m) return null;
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  }

  function daysSinceDate(date){
    if (!date) return null;
    const ms = Date.now() - date.getTime();
    return Math.max(0, Math.floor(ms / 86400000));
  }

  // Priorita odvozená ze stejné klasifikace, kterou používá RouteEngine —
  // žádná druhá, nekonzistentní definice priority.
  const PRIORITY_LABELS = {
    service: 'Servis',
    priorityIssue: 'Urgentní',
    installation: 'Instalace',
    standardCheck: 'Standard',
  };
  function getPriority(p){
    const cls = global.RouteEngine ? global.RouteEngine.classifyVisit(p) : 'standardCheck';
    return { code: cls, label: PRIORITY_LABELS[cls] || cls };
  }

  // ── MATERIAL TRACKING (dlouhodobý majetek — Inventory, NE Merch/Spotřební
  // materiál, viz doménové pravidlo #1 v CLAUDE.md) ───────────────────────
  // Struktura only — žádná reálná SAP integrace, jen pole připravená pro ni.
  const MATERIAL_STATUS_LABELS = {
    ok: 'OK',
    miss: 'Missing',
    damaged: 'Damaged',
    needs_replacement: 'Needs replacement',
  };
  function getMaterialStatusLabel(s){
    return MATERIAL_STATUS_LABELS[s] || 'Unchecked';
  }
  // getMaterials(p) -> sjednocený seznam materiálů (vnitřní + venkovní)
  // s kanonickými poli name/sapCode/quantity/installationDate/status.
  function getMaterials(p){
    const inv = p.inventory || { vnitrni: [], venkovni: [] };
    const flatten = (items, location) => (items || []).map(item => ({
      id: item.id,
      name: item.n,
      location,
      sapCode: item.sap || null,
      quantity: typeof item.qty === 'number' ? item.qty : 1,
      installationDate: item.installDate || null,
      status: item.s || null,
      statusLabel: getMaterialStatusLabel(item.s),
    }));
    return [...flatten(inv.vnitrni, 'vnitřní'), ...flatten(inv.venkovni, 'venkovní')];
  }

  // visitStatus: odvozeno z reálných polí p.v (hotovo) a p.d (přiřazený den)
  // + getOverduePOS logiky (den < dnešní den a nehotovo).
  function getVisitStatus(p, isOverdue){
    if (p.v) return 'visited';
    if (isOverdue) return 'overdue';
    if (p.d !== null && p.d !== undefined) return 'planned';
    return 'unplanned';
  }

  // Frekvence: cyklus technika je ~6 týdnů (211 POS / ~35 týdně) =~ 30
  // pracovních dní mezi návštěvami stejného POS. Použito jen jako referenční
  // okno pro "compliance", ne jako vymyšlené tvrdé pravidlo.
  const EXPECTED_CYCLE_DAYS = 30;
  function getFrequencyCompliance(daysSinceLastVisit){
    if (daysSinceLastVisit === null) return { code: 'never', label: 'Nikdy navštíveno' };
    if (daysSinceLastVisit <= EXPECTED_CYCLE_DAYS) return { code: 'on-track', label: 'V normě' };
    if (daysSinceLastVisit <= EXPECTED_CYCLE_DAYS * 1.6) return { code: 'due-soon', label: 'Blíží se termín' };
    return { code: 'overdue', label: 'Po termínu' };
  }

  // toPosModel(p, opts) -> kanonický model jedné POS.
  // opts.history: výstup getVisitHistory(p.id) (volitelné — pokud chybí,
  // daysSinceLastVisit/lastVisit zůstanou null, nic se nevymýšlí).
  // opts.isOverdue: výstup z getOverduePOS pro daný týden (volitelné).
  function toPosModel(p, opts){
    opts = opts || {};
    const history = opts.history || [];
    const lastVisit = history[0] || null;
    const lastVisitDate = lastVisit ? parseCsDate(lastVisit.date) : null;
    const daysSinceLastVisit = lastVisitDate ? daysSinceDate(lastVisitDate) : null;
    const priority = getPriority(p);
    const estimatedVisitDuration = global.RouteEngine ? global.RouteEngine.getVisitDurationMin(p) : null;
    const openingHours = global.RouteEngine ? global.RouteEngine.getOpeningHours(p) : null;

    return {
      posId: p.id,
      posName: p.n,
      address: p.a,
      lat: p.lat,
      lng: p.lng,
      region: p.region || p.area || DEFAULT_REGION,
      channel: p.typ,
      assignedTechnician: p.assignedTechnician || SOLE_REAL_TECHNICIAN,
      priority: priority.code,
      priorityLabel: priority.label,
      estimatedVisitDuration,
      openingHours,
      visitStatus: getVisitStatus(p, !!opts.isOverdue),
      lastVisitDate: lastVisit ? lastVisit.date : null,
      lastVisitTechnician: lastVisit ? lastVisit.technik : null,
      daysSinceLastVisit,
      nextPlannedVisit: (p.d !== null && p.d !== undefined && !p.v) ? p.d : null,
      frequencyCompliance: getFrequencyCompliance(daysSinceLastVisit).code,
      frequencyComplianceLabel: getFrequencyCompliance(daysSinceLastVisit).label,
      materials: getMaterials(p),
      terminals: p.terminals || [],
      // Tržby/priorita podle tržeb — schéma připravené, dokud Pavel nedodá
      // reálná data zůstává null (žádný odhad, viz docs/PROJECT_CONTEXT.md §7.1).
      salesValue: null,
      priorityScore: null,
    };
  }

  const PosModel = {
    SOLE_REAL_TECHNICIAN,
    PILOT_TECHNICIANS,
    DEFAULT_REGION,
    EXPECTED_CYCLE_DAYS,
    IMPORT_COLUMN_MAP,
    MATERIAL_STATUS_LABELS,
    parseCsDate,
    daysSinceDate,
    getPriority,
    getVisitStatus,
    getFrequencyCompliance,
    getMaterialStatusLabel,
    getMaterials,
    toPosModel,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PosModel;
  } else {
    global.PosModel = PosModel;
  }

})(typeof window !== 'undefined' ? window : globalThis);
