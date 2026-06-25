// ══════════════════════════════════════════════════════
// SUPABASE SYNC SHIM (pilot test, scope: Lán Tomáš)
// ══════════════════════════════════════════════════════
// Appka je dnes 100% localStorage — Velín a technik na různých zařízeních
// nevidí navzájem žádná data. Tohle je nejmenší krok, který to řeší: zrcadlí
// existující localStorage klíče (ci_, vlog_, supply_, merch_, assign_,
// editor_*, ...) do Supabase, beze změny datového modelu nebo UI.
//
// Bez konfigurace (window.ALLWYN_SUPABASE_URL/ANON_KEY nevyplněné) je appka
// přesně jako dřív — čistě lokální, offline. Sync je čistě přídavná vrstva,
// nikdy nepřepisuje chování bez nastavených klíčů.
//
// TEST DATA OMEZENÍ: synchronizujeme jen technika Lán Tomáš (jediný reálně
// přihlašovatelný technik v prototypu) — viz docs/CLAUDE.md zadání. Než půjde
// do reálného pilota s živými daty víc techniků, RLS politika v
// supabase/schema.sql (otevřená pro anon klíč) musí být nahrazená auth-based
// politikou — viz komentář tamtéž.

const SYNC_CONFIG = {
  url: window.ALLWYN_SUPABASE_URL || '',
  anonKey: window.ALLWYN_SUPABASE_ANON_KEY || '',
};

// Per-technika klíče (prefix match) — viz docs/CLAUDE.md "Klíče v localStorage".
const SYNC_PER_TECH_PREFIXES = ['ci_','vlog_','daystart_','supply_','merch_','poscard_','visits_','assign_','gps_flags_','approval_'];
// Globální klíče editované Velínem — musí být vidět na všech zařízeních.
const SYNC_GLOBAL_KEYS = ['admin_tasks','editor_briefing','editor_alert','editor_idt','editor_ka','editor_campaigns','inv_catalog'];

let _syncClient = null;
let _syncChannel = null;

function syncEnabled(){
  return !!(SYNC_CONFIG.url && SYNC_CONFIG.anonKey && window.supabase);
}

function getSyncClient(){
  if (!syncEnabled()) return null;
  if (!_syncClient) _syncClient = window.supabase.createClient(SYNC_CONFIG.url, SYNC_CONFIG.anonKey);
  return _syncClient;
}

function syncKeyScope(key, technicianHint){
  if (SYNC_GLOBAL_KEYS.includes(key)) return '_global';
  if (SYNC_PER_TECH_PREFIXES.some(p => key.startsWith(p))) {
    return technicianHint || currentViewTechnician || PosModel.SOLE_REAL_TECHNICIAN;
  }
  return null;
}

// Push: debounced per klíč, ať rychlé po sobě jdoucí zápisy (psaní poznámky
// znak po znaku přes autosave apod.) nezasypou Supabase requesty.
const _pushTimers = {};
function schedulePush(technician, key, value){
  const client = getSyncClient();
  if (!client) return;
  const timerKey = technician + '|' + key;
  clearTimeout(_pushTimers[timerKey]);
  _pushTimers[timerKey] = setTimeout(() => {
    client.from('sync_kv').upsert({ technician, key, value, updated_at: new Date().toISOString() })
      .then(({ error }) => { if (error) console.warn('[sync] push failed', key, error.message); });
  }, 800);
}

// Pull: stáhne všechny řádky pro daného technika + globální klíče a
// přepíše localStorage — voláno při loginu/přepnutí technika.
async function pullSyncData(technician){
  const client = getSyncClient();
  if (!client) return;
  const { data, error } = await client.from('sync_kv')
    .select('key,value')
    .in('technician', [technician, '_global']);
  if (error) { console.warn('[sync] pull failed', error.message); return; }
  (data || []).forEach(row => {
    try { localStorage.setItem(row.key, JSON.stringify(row.value)); } catch(e) {}
  });
}

// Realtime: Velín dívající se na technika dostane update bez manuálního
// refreshu — applyRoute() je existující router re-render appky (js/app.js),
// bezpečné znovu-zavolat, protože je to přesně to, co běží i po F5.
function subscribeSyncUpdates(technician){
  const client = getSyncClient();
  if (!client) return;
  if (_syncChannel) client.removeChannel(_syncChannel);
  _syncChannel = client.channel('sync_kv_' + technician)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sync_kv' }, (payload) => {
      const row = payload.new || payload.old;
      if (!row || (row.technician !== technician && row.technician !== '_global')) return;
      try { localStorage.setItem(row.key, JSON.stringify(row.value)); } catch(e) {}
      if (typeof applyRoute === 'function') applyRoute();
    })
    .subscribe();
}

function syncSwitchTechnician(name){
  if (!syncEnabled()) return;
  pullSyncData(name).then(() => { if (typeof applyRoute === 'function') applyRoute(); });
  subscribeSyncUpdates(name);
}

// ── Hooky do existujícího kódu (js/app.js) — sync.js se načítá jako poslední
// <script>, takže lss/setViewTechnician/loginAsVelin už existují. ──────────
(function hookLss(){
  if (typeof window.lss !== 'function') return;
  const originalLss = window.lss;
  window.lss = function(key, value){
    originalLss(key, value);
    const scope = syncKeyScope(key);
    if (scope) schedulePush(scope, key, value);
  };
})();

(function hookSetViewTechnician(){
  if (typeof window.setViewTechnician !== 'function') return;
  const original = window.setViewTechnician;
  window.setViewTechnician = function(name){
    original(name);
    syncSwitchTechnician(name);
  };
})();

(function hookLoginAsVelin(){
  if (typeof window.loginAsVelin !== 'function') return;
  const original = window.loginAsVelin;
  window.loginAsVelin = function(){
    original();
    // Velín dashboard čte localStorage napřímo přes lsg() — bez "zobrazit
    // jako technik" potřebuje data testovacího technika stáhnout sám, jinak
    // by viděl jen to, co se stalo na tomhle zařízení.
    syncSwitchTechnician(PosModel.SOLE_REAL_TECHNICIAN);
  };
})();

// Refresh (F5) jako prostý Velín (ne "zobrazit jako technik") — app.js
// vlastní DOMContentLoaded handler v tomto případě setViewTechnician nevolá
// (řeší jen 'technician' a 'velin'+viewingAs), takže to doplňujeme tady.
window.addEventListener('DOMContentLoaded', () => {
  if (typeof getSession !== 'function') return;
  const s = getSession();
  if (s && s.role === 'velin' && !s.viewingAs) {
    syncSwitchTechnician(PosModel.SOLE_REAL_TECHNICIAN);
  }
});
