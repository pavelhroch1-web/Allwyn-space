// ══════════════════════════════════════════════════════
// TASK IMPORT — Excel ingestion pro externí úkoly (Vrstva nad TaskEngine)
// ══════════════════════════════════════════════════════
// Čistá, DOM-free vrstva — stejný princip jako js/excelImport.js a
// js/posMasterData.js: parsování a validace probíhá tady, app.js dělá jen
// FileReader/SheetJS čtení a uložení výsledku do task_pool přes createAdhocTask.
//
// Tohle je dnes jediný reálný "external ingestion" kanál (žádné API
// napojení existuje) — proto Task.source.kind = 'excel_import' a
// Task.source.refId nese referenci z externího systému (např. číslo
// tiketu), aby šlo pozdější napojení přes API rozšířit beze změny
// datového modelu (source je už dnes obecné { kind, refId, createdBy }).

(function(global){

  const TaskEngine = (global && global.TaskEngine) || (typeof require !== 'undefined' && require('./taskEngine.js'));

  const TEMPLATE_HEADERS = [
    'POS_ID', 'TITLE', 'DESCRIPTION', 'TYPE', 'PRIORITY', 'DEADLINE',
    'REQUIRED_TECHNICIANS', 'ESTIMATED_DURATION_HOURS', 'ASSIGNED_TECHNICIAN', 'EXTERNAL_REF',
  ];

  const TEMPLATE_EXAMPLE_ROW = [
    '123456', 'Oprava reklamního stojanu', 'Stojan je naklonění, hrozí pád', 'service_request', 'high',
    '2026-07-15', '1', '2', '', 'TICKET-2026-001',
  ];

  const COLS = {
    POS_ID: 0, TITLE: 1, DESCRIPTION: 2, TYPE: 3, PRIORITY: 4, DEADLINE: 5,
    REQUIRED_TECHNICIANS: 6, ESTIMATED_DURATION_HOURS: 7, ASSIGNED_TECHNICIAN: 8, EXTERNAL_REF: 9,
  };

  function validateColumns(rawRows){
    if (!Array.isArray(rawRows)) throw new Error('Soubor musí obsahovat řádky tabulky');
    if (rawRows.length === 0) return { ok: true, warnings: ['Žádná data k importu'] };
    const sample = rawRows[0];
    if (!Array.isArray(sample) || sample.length < 2) {
      throw new Error('Neočekávaná struktura řádku — chybí povinné sloupce POS_ID/TITLE');
    }
    return { ok: true, warnings: [] };
  }

  // buildTasksFromRows(rawRows, opts) -> { tasksInput, summary, warnings, errors }
  // opts: { validPosIds: Set<string>, validTechnicianNames: Set<string>, existingExternalRefs: Set<string> }
  // tasksInput: [{ posId, title, description, type, priority, requiredTechnicians,
  //   estimatedDurationMin, window, assignedTechnician, externalRef }]
  function buildTasksFromRows(rawRows, opts){
    opts = opts || {};
    const validPosIds = opts.validPosIds || new Set();
    const validTechnicianNames = opts.validTechnicianNames || new Set();
    const existingExternalRefs = opts.existingExternalRefs || new Set();
    validateColumns(rawRows);

    const tasksInput = [];
    const warnings = [];
    const errors = [];
    const seenRefsInFile = new Set();
    let skippedMissingPos = 0, skippedMissingTitle = 0, skippedDuplicateRef = 0;
    let unknownType = 0, unknownPriority = 0, invalidReqTech = 0, unknownTechnician = 0, missingPosWarn = 0;

    rawRows.forEach((r, idx) => {
      const rowNum = idx + 2; // +1 pro header, +1 pro 1-based
      const posId = String(r[COLS.POS_ID] || '').trim();
      const title = String(r[COLS.TITLE] || '').trim();
      const description = String(r[COLS.DESCRIPTION] || '').trim();
      let type = String(r[COLS.TYPE] || '').trim();
      let priority = String(r[COLS.PRIORITY] || '').trim();
      const deadline = String(r[COLS.DEADLINE] || '').trim();
      let reqTechRaw = String(r[COLS.REQUIRED_TECHNICIANS] || '').trim();
      const durationHRaw = String(r[COLS.ESTIMATED_DURATION_HOURS] || '').trim();
      const assignedTechnician = String(r[COLS.ASSIGNED_TECHNICIAN] || '').trim();
      const externalRef = String(r[COLS.EXTERNAL_REF] || '').trim();

      if (!posId) { skippedMissingPos++; errors.push(`Řádek ${rowNum}: chybí POS_ID — vynecháno`); return; }
      if (!title) { skippedMissingTitle++; errors.push(`Řádek ${rowNum}: chybí TITLE — vynecháno`); return; }

      if (externalRef) {
        if (existingExternalRefs.has(externalRef) || seenRefsInFile.has(externalRef)) {
          skippedDuplicateRef++;
          warnings.push(`Řádek ${rowNum}: EXTERNAL_REF "${externalRef}" už byl importován dříve — vynecháno (ochrana proti duplicitnímu nahrání stejného souboru)`);
          return;
        }
        seenRefsInFile.add(externalRef);
      }

      if (validPosIds.size && !validPosIds.has(posId)) {
        missingPosWarn++;
        warnings.push(`Řádek ${rowNum}: POS ${posId} nebyl nalezen v aktuálních Tourplan datech — úkol se vytvoří, ale ověř POS ID`);
      }

      if (type && TaskEngine.TYPES.indexOf(type) === -1) {
        unknownType++;
        warnings.push(`Řádek ${rowNum}: neznámý TYPE "${type}" — použito "external"`);
        type = 'external';
      }
      if (!type) type = 'external';

      if (priority && TaskEngine.PRIORITIES.indexOf(priority) === -1) {
        unknownPriority++;
        warnings.push(`Řádek ${rowNum}: neznámá PRIORITY "${priority}" — použito "normal"`);
        priority = 'normal';
      }
      if (!priority) priority = 'normal';

      let requiredTechnicians = 1;
      if (reqTechRaw) {
        const n = parseInt(reqTechRaw, 10);
        if (n === 1 || n === 2) requiredTechnicians = n;
        else { invalidReqTech++; warnings.push(`Řádek ${rowNum}: REQUIRED_TECHNICIANS "${reqTechRaw}" musí být 1 nebo 2 — použito 1`); }
      }

      let estimatedDurationMin = null;
      if (durationHRaw) {
        const h = parseFloat(durationHRaw);
        if (!isNaN(h) && h > 0) estimatedDurationMin = Math.round(h * 60);
      }

      let resolvedTechnician = null;
      if (assignedTechnician) {
        if (validTechnicianNames.size && !validTechnicianNames.has(assignedTechnician)) {
          unknownTechnician++;
          warnings.push(`Řádek ${rowNum}: technik "${assignedTechnician}" nebyl nalezen — úkol zůstane nepřiřazený`);
        } else {
          resolvedTechnician = assignedTechnician;
        }
      }

      let window = null;
      if (deadline) {
        const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline + 'T23:59:59' : deadline);
        if (!isNaN(d.getTime())) window = { to: d.toISOString() };
        else warnings.push(`Řádek ${rowNum}: DEADLINE "${deadline}" nelze rozpoznat jako datum — bez termínu`);
      }

      tasksInput.push({
        posId, title, description, type, priority, requiredTechnicians,
        estimatedDurationMin, window, assignedTechnician: resolvedTechnician,
        externalRef: externalRef || null,
      });
    });

    const summary = {
      totalRows: rawRows.length,
      imported: tasksInput.length,
      skippedMissingPos, skippedMissingTitle, skippedDuplicateRef,
      unknownType, unknownPriority, invalidReqTech, unknownTechnician, missingPosWarn,
    };

    return { tasksInput, summary, warnings, errors };
  }

  const TaskImport = {
    TEMPLATE_HEADERS, TEMPLATE_EXAMPLE_ROW, COLS,
    validateColumns,
    buildTasksFromRows,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TaskImport;
  } else {
    global.TaskImport = TaskImport;
  }

})(typeof window !== 'undefined' ? window : globalThis);
