// ══════════════════════════════════════════════════════
// VISIT STORE — relační perzistence návštěvy (technicians/pos_locations/
// visits/visit_tasks/materials/sync_events, viz supabase/schema.sql).
// ══════════════════════════════════════════════════════
// Nahrazuje sync_kv shim pro vše spojené s konkrétní návštěvou POS (stav,
// checklist, materiál, podpis, poznámka, metadata fotek) — sync_kv (js/sync.js)
// zůstává jen pro globální admin config a check-in/out/GPS/approval.
//
// Stejný princip jako sync.js: bez window.ALLWYN_SUPABASE_URL/ANON_KEY je
// appka přesně jako dřív, čistě lokální. Zápisy jsou fire-and-forget (UI se
// nikdy neblokuje na síti) — localStorage zůstává okamžitý render cache,
// Supabase je zdroj pravdy při refreshi / na jiném zařízení.
//
// Zjednodušení oproti plné historii: jedna "visits" řádka = aktuální stav
// technika u daného POS (latest-state, ne log každé návštěvy) — stejný
// princip jako "materials" tabulka (bez visit_id, taky jen aktuální stav).
// Historie jednotlivých návštěv/akcí je v sync_events.

const VisitStore = (function(){
  const CONFIG = {
    url: window.ALLWYN_SUPABASE_URL || '',
    anonKey: window.ALLWYN_SUPABASE_ANON_KEY || '',
  };

  let client = null;
  function enabled(){ return !!(CONFIG.url && CONFIG.anonKey && window.supabase); }
  function getClient(){
    if (!enabled()) return null;
    if (!client) client = window.supabase.createClient(CONFIG.url, CONFIG.anonKey);
    return client;
  }

  // technician_id / pos_id = reálné stringy (jméno z Tourplan, POS Master ID)
  // — žádné vymyšlené UUID, viz supabase/schema.sql.
  const _knownTechnicians = new Set();
  const _knownPos = new Set();
  function ensureTechnician(id, region){
    const c = getClient(); if (!c || !id || _knownTechnicians.has(id)) return Promise.resolve();
    _knownTechnicians.add(id);
    return c.from('technicians').upsert({ id, name: id, region: region || null })
      .then(({ error }) => { if (error) console.warn('[visitStore] ensureTechnician failed', id, error.message); });
  }
  function ensurePosLocation(id, name, address, region){
    const c = getClient(); if (!c || !id || _knownPos.has(id)) return Promise.resolve();
    _knownPos.add(id);
    return c.from('pos_locations').upsert({ id, name: name || null, address: address || null, region: region || null })
      .then(({ error }) => { if (error) console.warn('[visitStore] ensurePosLocation failed', id, error.message); });
  }

  // visit id cache — jedna "aktuální" visits řádka per technik+POS.
  const _visitIdCache = {};
  async function ensureVisit(technicianId, posId, posName, posAddress, region){
    const c = getClient(); if (!c) return null;
    const cacheKey = technicianId + '|' + posId;
    if (_visitIdCache[cacheKey]) return _visitIdCache[cacheKey];
    await Promise.all([
      ensureTechnician(technicianId, region),
      ensurePosLocation(posId, posName, posAddress, region),
    ]);
    const { data: existing, error: selErr } = await c.from('visits')
      .select('id').eq('technician_id', technicianId).eq('pos_id', posId)
      .order('started_at', { ascending: false }).limit(1);
    if (selErr) { console.warn('[visitStore] ensureVisit select failed', selErr.message); return null; }
    if (existing && existing.length) {
      _visitIdCache[cacheKey] = existing[0].id;
      return existing[0].id;
    }
    const { data: created, error: insErr } = await c.from('visits')
      .insert({ technician_id: technicianId, pos_id: posId, status: 'in_progress', started_at: new Date().toISOString() })
      .select('id').single();
    if (insErr) { console.warn('[visitStore] ensureVisit insert failed', insErr.message); return null; }
    _visitIdCache[cacheKey] = created.id;
    return created.id;
  }

  function setVisitField(technicianId, posId, posName, posAddress, region, fields){
    const c = getClient(); if (!c) return;
    ensureVisit(technicianId, posId, posName, posAddress, region).then(visitId => {
      if (!visitId) return;
      c.from('visits').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', visitId)
        .then(({ error }) => { if (error) console.warn('[visitStore] setVisitField failed', error.message); });
    });
  }

  function setTaskDone(technicianId, posId, posName, posAddress, region, taskName, done){
    const c = getClient(); if (!c) return;
    ensureVisit(technicianId, posId, posName, posAddress, region).then(visitId => {
      if (!visitId) return;
      c.from('visit_tasks').upsert({
        visit_id: visitId, task_name: taskName, status: done ? 'done' : 'pending', updated_at: new Date().toISOString(),
      }, { onConflict: 'visit_id,task_name' })
        .then(({ error }) => { if (error) console.warn('[visitStore] setTaskDone failed', error.message); });
    });
  }

  function setMaterial(posId, posName, posAddress, region, item, quantity){
    const c = getClient(); if (!c) return;
    ensurePosLocation(posId, posName, posAddress, region).then(() => {
      c.from('materials').upsert({
        pos_id: posId, item, quantity, updated_at: new Date().toISOString(),
      }, { onConflict: 'pos_id,item' })
        .then(({ error }) => { if (error) console.warn('[visitStore] setMaterial failed', error.message); });
    });
  }

  function logEvent(user, action){
    const c = getClient(); if (!c) return;
    c.from('sync_events').insert({ user, action, timestamp: new Date().toISOString() })
      .then(({ error }) => { if (error) console.warn('[visitStore] logEvent failed', error.message); });
  }

  // ── Hydratace: stáhne aktuální stav (návštěva dokončena / checklist) pro
  // dané techniky a vrátí mapu posId -> {completed, taskDone:{taskName:bool}}.
  // Použito při refreshi / přepnutí technika / Velín dashboardu, aby se
  // FULL_POS_DATA shodovalo se stavem na jiných zařízeních.
  async function pullVisitState(technicianIds){
    const c = getClient(); if (!c || !technicianIds.length) return {};
    const { data: visits, error: vErr } = await c.from('visits')
      .select('id,technician_id,pos_id,status').in('technician_id', technicianIds);
    if (vErr) { console.warn('[visitStore] pullVisitState visits failed', vErr.message); return {}; }
    if (!visits || !visits.length) return {};
    const visitIds = visits.map(v => v.id);
    const { data: tasks, error: tErr } = await c.from('visit_tasks')
      .select('visit_id,task_name,status').in('visit_id', visitIds);
    if (tErr) console.warn('[visitStore] pullVisitState tasks failed', tErr.message);
    const tasksByVisit = {};
    (tasks || []).forEach(t => {
      (tasksByVisit[t.visit_id] = tasksByVisit[t.visit_id] || {})[t.task_name] = t.status === 'done';
    });
    const result = {};
    visits.forEach(v => {
      result[v.pos_id] = { completed: v.status === 'completed', taskDone: tasksByVisit[v.id] || {} };
    });
    return result;
  }

  // Sloučí stažený stav do živých p objektů (FULL_POS_DATA[week] záznamy) —
  // stejná merge logika jako applyVisitState() v app.js, jen ze Supabase
  // namísto localStorage. Vrací true, pokud se něco reálně změnilo.
  function mergeIntoPos(pList, remoteState){
    let changed = false;
    pList.forEach(p => {
      const r = remoteState[p.id]; if (!r) return;
      if (r.completed && !p.v) { p.v = true; changed = true; }
      Object.keys(r.taskDone).forEach(taskName => {
        const match = p.taskState.find(t => t.text === taskName);
        if (match && match.done !== r.taskDone[taskName]) { match.done = r.taskDone[taskName]; changed = true; }
      });
    });
    return changed;
  }

  let _channel = null;
  function subscribe(technicianIds, onChange){
    const c = getClient(); if (!c) return;
    if (_channel) c.removeChannel(_channel);
    _channel = c.channel('visit_store_' + technicianIds.join('_'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visit_tasks' }, () => onChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'materials' }, () => onChange())
      .subscribe();
  }

  return { enabled, ensureVisit, setVisitField, setTaskDone, setMaterial, logEvent, pullVisitState, mergeIntoPos, subscribe };
})();

// ── Hydratace při loginu/refreshi — zrcadlí vzor js/sync.js (pull + realtime
// + applyRoute()), jen pro nové relační tabulky. ──────────────────────────
function hydrateVisitStoreFor(technicianNames){
  if (!VisitStore.enabled() || !technicianNames.length) return;
  VisitStore.pullVisitState(technicianNames).then(remoteState => {
    let changed = false;
    Object.keys(FULL_POS_DATA).forEach(w => {
      const pList = FULL_POS_DATA[w].filter(p => technicianNames.includes(p.assignedTechnician));
      if (VisitStore.mergeIntoPos(pList, remoteState)) changed = true;
    });
    if (changed && typeof applyRoute === 'function') applyRoute();
  });
  VisitStore.subscribe(technicianNames, () => {
    VisitStore.pullVisitState(technicianNames).then(remoteState => {
      let changed = false;
      Object.keys(FULL_POS_DATA).forEach(w => {
        const pList = FULL_POS_DATA[w].filter(p => technicianNames.includes(p.assignedTechnician));
        if (VisitStore.mergeIntoPos(pList, remoteState)) changed = true;
      });
      if (changed && typeof applyRoute === 'function') applyRoute();
    });
  });
}

(function hookSetViewTechnicianForVisitStore(){
  if (typeof window.setViewTechnician !== 'function') return;
  const original = window.setViewTechnician;
  window.setViewTechnician = function(name){
    original(name);
    hydrateVisitStoreFor([name]);
  };
})();

(function hookLoginAsVelinForVisitStore(){
  if (typeof window.loginAsVelin !== 'function') return;
  const original = window.loginAsVelin;
  window.loginAsVelin = function(){
    original();
    hydrateVisitStoreFor(PosModel.PILOT_TECHNICIANS);
  };
})();

window.addEventListener('DOMContentLoaded', () => {
  if (typeof getSession !== 'function') return;
  const s = getSession();
  if (s && s.role === 'velin' && !s.viewingAs) {
    hydrateVisitStoreFor(PosModel.PILOT_TECHNICIANS);
  } else if (s && s.role === 'technician' && s.name) {
    hydrateVisitStoreFor([s.name]);
  }
});
