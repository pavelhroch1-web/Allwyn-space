// ══════════════════════════════════════════════════════
// TASK ENGINE — datový model a logika "Task pool"
// ══════════════════════════════════════════════════════
// Realizace work management modelu z CLAUDE.md:
//   Tourplan / Service request / Kampaň / Ad hoc POS list / Instalace materiálu
//                     ↓
//                 Task pool   ←── tento modul
//                     ↓
//             Route Intelligence / Plánování technika
//
// Čistá, DOM-free vrstva (žádné UI, žádný přístup na localStorage/Supabase —
// to dělá app.js wrapperem getTaskPool()/saveTaskPool(), stejně jako u
// getMerchTemplates()/saveMerchTemplates()). Task je obal nad PRACÍ, nezávislý
// na tom, jak se vykonává — prostý ad hoc úkol i budoucí úkol napojený na
// Workflow šablonu mají stejný obal (status, přiřazení, evidence, historie).
//
// Žádné fake/vymyšlené hodnoty: status, historie a evidence vznikají výhradně
// akcemi Velína/technika přes funkce tohoto modulu — nikdy se nedopočítávají
// ani neodhadují.

(function(global){

  const STATUSES = ['pending', 'assigned', 'in_progress', 'waiting_next_visit', 'done', 'verified', 'cancelled'];

  // Povolené přechody stavu — chrání proti nelogickým skokům (např. 'pending'
  // přímo na 'verified' bez toho, aby to někdo reálně udělal a doložil).
  const TRANSITIONS = {
    pending: ['assigned', 'cancelled'],
    assigned: ['in_progress', 'pending', 'cancelled'],
    in_progress: ['done', 'waiting_next_visit', 'cancelled'],
    waiting_next_visit: ['in_progress', 'cancelled'],
    done: ['verified', 'in_progress'], // 'in_progress' = Velín vrátí k doplnění
    verified: [],
    cancelled: [],
  };

  const TYPES = ['adhoc', 'work_order', 'campaign', 'service_request', 'external'];
  const PRIORITIES = ['normal', 'high', 'urgent'];

  function genId(){
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return 'task_' + crypto.randomUUID();
    return 'task_' + Date.now() + '_' + Math.floor(Math.random() * 1e6).toString(36);
  }

  function validateTaskInput(input){
    const errors = [];
    if (!input || !input.posId) errors.push('Chybí POS ID');
    if (!input || !input.title) errors.push('Chybí název úkolu');
    if (input && input.type && TYPES.indexOf(input.type) === -1) errors.push('Neznámý typ úkolu: ' + input.type);
    if (input && input.priority && PRIORITIES.indexOf(input.priority) === -1) errors.push('Neznámá priorita: ' + input.priority);
    if (input && input.requiredTechnicians && [1, 2].indexOf(input.requiredTechnicians) === -1) errors.push('requiredTechnicians musí být 1 nebo 2');
    return { ok: errors.length === 0, errors };
  }

  // newTask(input, actor) -> Task | throws při neplatném vstupu (caller musí
  // validovat přes validateTaskInput před voláním, např. v UI formuláři).
  function newTask(input, actor){
    const check = validateTaskInput(input);
    if (!check.ok) throw new Error('Neplatný úkol: ' + check.errors.join(', '));
    const now = new Date().toISOString();
    return {
      id: genId(),
      posId: input.posId,
      title: input.title,
      description: input.description || '',
      type: input.type || 'adhoc',
      source: input.source || { kind: 'manual', refId: null, createdBy: actor || null },
      priority: input.priority || 'normal',
      requiredTechnicians: input.requiredTechnicians || 1,
      estimatedDurationMin: input.estimatedDurationMin || null,
      window: input.window || null,
      status: 'pending',
      assignedTechnicianIds: [],
      workflowTemplateId: input.workflowTemplateId || null,
      workflowInstanceId: null,
      evidence: { photos: [], comment: null, gps: null, completedAt: null, completedBy: null },
      history: [{ ts: now, actor: actor || null, action: 'created', note: null }],
      createdAt: now,
      updatedAt: now,
    };
  }

  function canTransition(task, newStatus){
    if (!task || STATUSES.indexOf(newStatus) === -1) return false;
    if (task.status === newStatus) return false;
    return (TRANSITIONS[task.status] || []).indexOf(newStatus) !== -1;
  }

  // transitionStatus -> nová kopie tasku (immutable update), nikdy mutace
  // vstupu — caller (app.js) je odpovědný za uložení návratové hodnoty.
  function transitionStatus(task, newStatus, actor, note){
    if (!canTransition(task, newStatus)) {
      throw new Error(`Přechod ${task.status} → ${newStatus} není povolen`);
    }
    const now = new Date().toISOString();
    return {
      ...task,
      status: newStatus,
      updatedAt: now,
      history: [...task.history, { ts: now, actor: actor || null, action: 'status_changed', note: `${task.status} → ${newStatus}` + (note ? `: ${note}` : '') }],
    };
  }

  function assignTechnicians(task, technicianIds, actor){
    if (!Array.isArray(technicianIds) || !technicianIds.length) throw new Error('assignTechnicians vyžaduje neprázdné pole technicianIds');
    const now = new Date().toISOString();
    const nextStatus = task.status === 'pending' ? 'assigned' : task.status;
    return {
      ...task,
      assignedTechnicianIds: technicianIds,
      status: nextStatus,
      updatedAt: now,
      history: [...task.history, { ts: now, actor: actor || null, action: 'assigned', note: technicianIds.join(', ') }],
    };
  }

  // addEvidence -> sloučí dílčí evidence (foto se přidává do pole, ostatní
  // pole se přepisují) — voláno opakovaně v průběhu plnění úkolu, ne jen
  // jednou na konci.
  function addEvidence(task, evidencePatch, actor){
    const now = new Date().toISOString();
    const photos = evidencePatch.photo
      ? [...task.evidence.photos, evidencePatch.photo]
      : task.evidence.photos;
    return {
      ...task,
      evidence: {
        ...task.evidence,
        photos,
        comment: evidencePatch.comment !== undefined ? evidencePatch.comment : task.evidence.comment,
        gps: evidencePatch.gps !== undefined ? evidencePatch.gps : task.evidence.gps,
        completedAt: evidencePatch.completedAt !== undefined ? evidencePatch.completedAt : task.evidence.completedAt,
        completedBy: evidencePatch.completedBy !== undefined ? evidencePatch.completedBy : task.evidence.completedBy,
      },
      updatedAt: now,
      history: [...task.history, { ts: now, actor: actor || null, action: 'evidence_added', note: Object.keys(evidencePatch).join(',') }],
    };
  }

  function isOverdue(task, now){
    now = now || new Date();
    if (!task.window || !task.window.to) return false;
    if (['done', 'verified', 'cancelled'].indexOf(task.status) !== -1) return false;
    return new Date(task.window.to).getTime() < now.getTime();
  }

  // filterTasks(tasks, filters) -> filters: { status, priority, technicianId,
  // posId, type } — všechny volitelné, AND kombinace.
  function filterTasks(tasks, filters){
    filters = filters || {};
    return tasks.filter(t => {
      if (filters.status && t.status !== filters.status) return false;
      if (filters.priority && t.priority !== filters.priority) return false;
      if (filters.type && t.type !== filters.type) return false;
      if (filters.posId && t.posId !== filters.posId) return false;
      if (filters.technicianId && t.assignedTechnicianIds.indexOf(filters.technicianId) === -1) return false;
      return true;
    });
  }

  function poolSummary(tasks, now){
    now = now || new Date();
    const summary = { total: tasks.length, byStatus: {}, overdue: 0, urgent: 0 };
    STATUSES.forEach(s => summary.byStatus[s] = 0);
    tasks.forEach(t => {
      summary.byStatus[t.status] = (summary.byStatus[t.status] || 0) + 1;
      if (isOverdue(t, now)) summary.overdue++;
      if (t.priority === 'urgent' && ['done', 'verified', 'cancelled'].indexOf(t.status) === -1) summary.urgent++;
    });
    return summary;
  }

  const TaskEngine = {
    STATUSES, TRANSITIONS, TYPES, PRIORITIES,
    genId,
    validateTaskInput,
    newTask,
    canTransition,
    transitionStatus,
    assignTechnicians,
    addEvidence,
    isOverdue,
    filterTasks,
    poolSummary,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TaskEngine;
  } else {
    global.TaskEngine = TaskEngine;
  }

})(typeof window !== 'undefined' ? window : globalThis);
