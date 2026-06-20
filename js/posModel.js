// ══════════════════════════════════════════════════════
// POS DATA MODEL — jeden sdílený model POS pro celou appku
// ══════════════════════════════════════════════════════
// Bez DOM závislostí. Berie skutečná POS data (posData z app.js) a vrací
// kanonickou reprezentaci se VŠEMI poli požadovanými pro Admin POS
// Management / Velín / Route Engine. Žádné nové vymyšlené hodnoty —
// jen odvozené z reálných polí (taskState, inventory, d, v, lat/lng…)
// nebo z jediného reálného technika v datasetu (Lán Tomáš), přiznané
// jako placeholder dokud nepřijde reálný import více techniků.
//
// Budoucí Excel import: mapování sloupců na kanonická pole — connectorová
// vrstva se nemění, jen se naplní `IMPORT_COLUMN_MAP` reálnými hlavičkami.

(function(global){

  // ── Dokud neexistuje reálný zdroj přiřazení POS→technik pro víc lidí,
  // přiznáváme to: jediný reálný technik v datasetu je Lán Tomáš.
  // NEVYMÝŠLÍME rozdělení území pro ostatních 26 jmen z mock Live dashboardu.
  const SOLE_REAL_TECHNICIAN = 'Lán Tomáš';
  const DEFAULT_REGION = 'RSE'; // konzistentní s defaultem použitým jinde v appce

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
    };
  }

  const PosModel = {
    SOLE_REAL_TECHNICIAN,
    DEFAULT_REGION,
    EXPECTED_CYCLE_DAYS,
    IMPORT_COLUMN_MAP,
    parseCsDate,
    daysSinceDate,
    getPriority,
    getVisitStatus,
    getFrequencyCompliance,
    toPosModel,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PosModel;
  } else {
    global.PosModel = PosModel;
  }

})(typeof window !== 'undefined' ? window : globalThis);
