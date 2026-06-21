// ══════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════
let cWeek='25', cDay=0, cIdx=null, pendingSlot=null, assigningId=null;
let cView='list'; // 'list' | 'planning' | 'overdue' — perzistováno přes refresh (PART 6)
let adminMap=null, adminMarkers=[], adminTechnicians=[];
let activeRegion='all';
let ciTimer=null;
let sigCanvas=null, sigCtx=null, sigDrawing=false, sigMark=false;
let supplyItems=[];

// Build POS data with tasks, refs, inventory. Všech 27 technici jsou nyní
// reální (DataProvider → ExcelImport → TOURPLAN_RAW, reálný export
// Tourplan_week_2028.xlsx) — žádná syntetická generace území.
function augmentRawPos(p, assignedTechnician){
  // Start with EMPTY plan — technician assigns all days themselves (persisted)
  if(!p.v) p.d = null;
  // Corn = KA PARTNERS with kategorie starting with 9, or explicit CORN
  const rawTyp = p.typ||'IDT';
  const isCornPos = rawTyp==='CORN' || (p.k&&p.k.startsWith('9')) || p.typ==='CORN';
  const typ = isCornPos ? 'CORN' : rawTyp;
  // Master data (GPS + otevírací doba, samostatný import) má přednost před
  // mock geokódováním podle adresy — ale jen pro POS, která v něm reálně jsou.
  PosMasterData.mergePosMasterData(p, POS_MASTER_MAP[p.id]);
  const hasRealGps = typeof p.lat === 'number' && typeof p.lng === 'number';
  const withCoords = ensurePosCoords(p);
  // gpsSource rozlišuje reálné GPS z master importu od mock odhadu podle
  // adresy — RouteEngine pak odhadnuté POS vyřadí z reálných km/min výpočtů
  // (žádné fake číslo do trasy/optimalizace), jen je pořád zobrazí na mapě.
  withCoords.gpsSource = hasRealGps
    ? 'real'
    : (typeof withCoords.lat === 'number' ? 'estimated' : 'unknown');
  return {
    ...withCoords,
    typ,
    assignedTechnician,
    area: withCoords.area || PosModel.DEFAULT_REGION,
    region: withCoords.area || PosModel.DEFAULT_REGION,
    photos:[],notes:'',
    taskState:[...((TASK_TMPL[typ]||TASK_TMPL[rawTyp]||TASK_TMPL.IDT)).map(t=>({text:t,src:'template',done:p.v}))],
    refs:(REFS[typ]||REFS[rawTyp]||REFS.IDT),
    inventory:JSON.parse(JSON.stringify(INV_DEFAULT[typ]||INV_DEFAULT[rawTyp]||INV_DEFAULT.IDT)),
  };
}

// POS master data (GPS + otevírací doba po dnech) — samostatný import,
// nezávislý na týdenním Tourplan importu. Prázdná mapa, dokud Pavel nedodá
// soubor (žádná smyšlená data za jeho nepřítomnosti).
const POS_MASTER_MAP = DataProvider.getPosMasterMap();

const POS_WEEK_KEYS = ['23','24','25','26','27','28'];
const importedWeeks = DataProvider.getPosWeeks(POS_WEEK_KEYS, {
  currentWeek: '25',
  todayIdx: getTodayDayIdx(),
});
// FULL_POS_DATA = POS všech 27 techniků (Velín: dashboard/POS síť/mapa/route
// intelligence napříč firmou). posData = POS POUZE přihlášeného technika
// (Lán Tomáš) — jediné reálné přiřazení z Excel sloupce TECHNICIAN, žádné
// "vidí celou firmu jako svou trasu" (root cause nereálných čísel workloadu).
const FULL_POS_DATA={};
const posData={};
for(const w of POS_WEEK_KEYS){
  FULL_POS_DATA[w] = (importedWeeks[w]||[]).map(p => augmentRawPos(p, p.assignedTechnician));
  posData[w] = FULL_POS_DATA[w].filter(p => p.assignedTechnician === PosModel.SOLE_REAL_TECHNICIAN);
}
// Servisní úkoly (src:'servis') vznikají jen z reálného zdroje — Jira import
// (budoucí fáze, viz docs/PROJECT_CONTEXT.md §7) nebo inventory "Chybí" →
// auto-task. Žádné natvrdo vepsané demo tikety bez reálného zdroje.

// Reálná jména techniků odvozená z Excel importu (FULL_POS_DATA), ne z
// odpojeného demo souboru data.js — žádné paralelní fake datasety.
const TECHNICIAN_NAMES = Array.from(new Set((FULL_POS_DATA['25']||[]).map(p=>p.assignedTechnician))).sort();

// Import summary log (PART 6 — "Show import summary" requirement).
(function logImportSummary(){
  const summary = DataProvider.getSummary();
  const warnings = DataProvider.getWarnings();
  if(!summary) return;
  console.log(`[Tourplan import] Importováno: ${summary.technicians} techniků, ${summary.posCount} POS, ${summary.terminalCount} terminálů.`);
  if(warnings.length) console.log('[Tourplan import] Upozornění:', warnings.join(' | '));
})();

// ══════════════════════════════════════════════════════
// TECHNICIANS — jediný zdroj pravdy pro Velín (RULE 1)
// ══════════════════════════════════════════════════════
// "Aktuální" operační týden Velínu — stejný týden, který Dashboard/Live/Map
// odjakživa čte (posData['25']). Statistiky technika se VŽDY počítají z POS
// tohoto týdne přes TechnicianModel — nic se neukládá na technika samotného.
const CURRENT_OPS_WEEK = '25';
function deriveAllTechnicians(){
  return TechnicianModel.deriveTechnicians(FULL_POS_DATA[CURRENT_OPS_WEEK] || [], { todayIdx: getTodayDayIdx() });
}
function techDisplayLatLng(t){
  if (t.currentPos && typeof t.currentPos.lat === 'number') return { lat: t.currentPos.lat, lng: t.currentPos.lng };
  if (t.pos && t.pos.length) {
    return {
      lat: t.pos.reduce((s,p)=>s+p.lat,0)/t.pos.length,
      lng: t.pos.reduce((s,p)=>s+p.lng,0)/t.pos.length,
    };
  }
  return { lat: 49.8, lng: 15.5 };
}

// ══════════════════════════════════════════════════════
// STORAGE
// ══════════════════════════════════════════════════════
function lsg(k,d=null){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch{return d;}}
function lss(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{}}
function today(){return new Date().toISOString().split('T')[0];}

// Perzistuje vybraný týden + aktivní pohled technika (list/planning/overdue),
// aby F5 zůstal na stejné obrazovce/týdnu (PART 6 — refresh nesmí vracet na landing).
function saveTechUIState(){ lss('techUiState',{week:cWeek,view:cView}); }

// ══════════════════════════════════════════════════════
// SESSION / IDENTITY — pilot auth (žádné heslo, žádný backend).
// Tvar připravený na pozdější Microsoft Entra ID / Azure AD SSO:
// User{id,name,email,role,permissions,region}, uložené jako Session
// v localStorage (stejný vzor jako techUiState/ci_/supply_…).
// ══════════════════════════════════════════════════════
const VELIN_USER = { id:'pavel-hroch', name:'Pavel Hroch', email:null, role:'velin', permissions:['velin'], region:'CZ' };
let currentViewTechnician = null;

function buildTechnicianUser(name){
  const t = deriveAllTechnicians().find(x=>x.name===name);
  return { id:'tech-'+name.replace(/\s+/g,'-').toLowerCase(), name, email:null, role:'technician', permissions:['technician'], region:(t&&t.region)||PosModel.DEFAULT_REGION };
}
function getSession(){ return lsg('session',null); }
function setSession(s){ lss('session',s); renderUserMenus(); }
function clearSession(){ localStorage.removeItem('session'); }

// Zobecňuje technician filtr (dřív natvrdo SOLE_REAL_TECHNICIAN na řádku
// posData[w]=... ) — Velín může nahlížet pohled libovolného z 27 reálných
// techniků z Tourplan importu (FULL_POS_DATA), ne jen jednoho.
function setViewTechnician(name){
  currentViewTechnician = name;
  for (const w of POS_WEEK_KEYS) posData[w] = FULL_POS_DATA[w].filter(p => p.assignedTechnician === name);
  cWeek = '25'; cDay = 0; cIdx = null;
}

function loginAsVelin(){
  setSession({ role:'velin', user:VELIN_USER, viewingAs:null });
  enterRole('admin');
  setTimeout(showVelinBriefing,500);
}
function loginAsTechnician(name){
  name = name || PosModel.SOLE_REAL_TECHNICIAN;
  setViewTechnician(name);
  setSession({ role:'technician', user:buildTechnicianUser(name), viewingAs:null });
  enterRole('technik');
}
function logout(){
  clearSession();
  currentViewTechnician = null;
  closeAllUserMenus();
  goHome();
}
// Velín náhled technika — "Zobrazit jako technik".
function viewAsTechnician(name){
  const s = getSession();
  if (!s || s.role !== 'velin') return;
  setViewTechnician(name);
  s.viewingAs = name;
  setSession(s);
  closeViewAsModal();
  enterRole('technik',{skipBriefing:true});
}
function backToVelin(){
  const s = getSession();
  if (s){ s.viewingAs = null; setSession(s); }
  currentViewTechnician = null;
  enterRole('admin');
}
function updateViewAsBanner(){
  const s = getSession();
  const banner = document.getElementById('viewas-banner');
  if (!banner) return;
  if (s && s.role==='velin' && s.viewingAs){
    document.getElementById('viewas-name').textContent = s.viewingAs;
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}
function openViewAsModal(){
  const list = document.getElementById('viewas-list');
  if (list) list.innerHTML = TECHNICIAN_NAMES.map(n=>`<button class="viewas-item" onclick="viewAsTechnician('${n.replace(/'/g,"\\'")}')">${n}</button>`).join('');
  document.getElementById('viewas-modal').classList.add('open');
  closeAllUserMenus();
}
function closeViewAsModal(){ document.getElementById('viewas-modal').classList.remove('open'); }

function toggleUserMenu(which){
  const dd = document.getElementById('user-dd-'+which);
  if (!dd) return;
  const open = dd.classList.contains('open');
  closeAllUserMenus();
  if (!open) dd.classList.add('open');
}
function closeAllUserMenus(){
  document.querySelectorAll('.user-dd.open').forEach(x=>x.classList.remove('open'));
}
function toggleProfileDetail(which){
  const el = document.getElementById('user-dd-'+which+'-detail');
  if (!el) return;
  if (el.style.display==='none'){
    const s = getSession();
    const u = s ? s.user : null;
    el.innerHTML = u ? `<div>E-mail: ${u.email||'— (z Tourplan importu chybí)'}</div><div>Region: ${u.region||'—'}</div>` : '';
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}
document.addEventListener('click', (e)=>{
  if (!e.target.closest('.user-chip')) closeAllUserMenus();
});

function renderUserMenus(){
  const s = getSession();
  updateViewAsBanner();
  if (!s) return;
  if (s.role==='velin'){
    const nameEl = document.getElementById('user-dd-velin-name');
    if (nameEl) nameEl.textContent = s.user.name;
  }
  const techName = (s.role==='technician') ? s.user.name : s.viewingAs;
  if (techName){
    const initials = (deriveAllTechnicians().find(t=>t.name===techName)||{}).initials || techName.slice(0,2).toUpperCase();
    const avEl = document.getElementById('tech-av');
    const ddNameEl = document.getElementById('user-dd-tech-name');
    if (avEl) avEl.textContent = initials;
    if (ddNameEl) ddNameEl.textContent = techName;
  }
}

// Velín "Operations Briefing" — analogie technician showBriefing(), ale ze
// stejných reálných zdrojů jako landing stránka a dashboard (deriveAllTechnicians,
// RouteEngine.analyzeFleet) — žádné nové vymyšlené číslo.
function showVelinBriefing(){
  const techs = deriveAllTechnicians();
  const totalPos = techs.reduce((s,t)=>s+t.total,0);
  const activeToday = techs.filter(t=>t.activityCode==='on-pos'||t.activityCode==='done').length;
  const overdue = techs.filter(t=>t.overdue).length;
  const routes = buildAllDailyRoutes();
  const fleet = Object.keys(routes).length ? RouteEngine.analyzeFleet(routes) : null;
  const now = new Date();
  document.getElementById('vb-date').textContent = now.toLocaleDateString('cs-CZ',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  document.getElementById('vb-pos').textContent = totalPos;
  document.getElementById('vb-active').textContent = activeToday;
  document.getElementById('vb-overdue').textContent = overdue;
  document.getElementById('vb-msg').textContent = fleet
    ? `Route Intelligence: optimalizace trasy by mohla ušetřit ${fleet.wastedHours.toFixed(0)} h jízdy a ${RouteEngine.formatKm(fleet.wastedKm)} tento týden.`
    : 'Route Intelligence: pro tento týden nemám dostatek dat na odhad úspor.';
  document.getElementById('velin-briefing').classList.add('open');
}
function closeVelinBriefing(){ document.getElementById('velin-briefing').classList.remove('open'); }
function showVelinRecommendations(){
  closeVelinBriefing();
  const btn = document.querySelector(`[onclick="showAdmPage('dashboard',this)"]`);
  if (btn) showAdmPage('dashboard',btn);
}

// ══════════════════════════════════════════════════════
// ROLE
// ══════════════════════════════════════════════════════
function enterRole(role,opts){
  opts=opts||{};
  document.getElementById('role-screen').style.display='none';
  document.getElementById('switch-btn').style.display='block';
  if(role==='technik'){
    document.getElementById('technik-screen').classList.add('active');
    document.getElementById('admin-screen').style.display='none';
    updateHdrLabel();renderChips();renderDayTabs();renderList();
    if(!opts.skipBriefing) setTimeout(showBriefing,500);
  } else {
    document.getElementById('technik-screen').classList.remove('active');
    document.getElementById('admin-screen').style.display='block';
    renderAdminDashboard();renderAdminLive();renderAdminAlerts();renderAdminCasy();renderAdminFoto();
    setTimeout(initAdminMap,300);
  }
  pushRoute();
}
function goHome(){
  document.getElementById('role-screen').style.display='flex';
  document.getElementById('switch-btn').style.display='none';
  document.getElementById('technik-screen').classList.remove('active');
  document.getElementById('admin-screen').style.display='none';
  pushRoute();
}
function showAdmPage(p,btn){
  document.querySelectorAll('.adm-page').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.adm-btn').forEach(x=>x.classList.remove('active'));
  document.getElementById('adm-'+p).classList.add('active');
  btn.classList.add('active');
  if(p==='dashboard'){ renderAdminDashboard(); renderAdminLive(); renderAdminCasy(); if(!adminMap) setTimeout(initAdminMap,100); }
  if(p==='posnet') renderAdminPosNet();
  pushRoute();
}

// ══════════════════════════════════════════════════════
// ROUTER — hash-based navigace (žádný server, GitHub Pages friendly).
// Refresh zůstává na stejné obrazovce, Back/Forward přepíná mezi obrazovkami.
// ══════════════════════════════════════════════════════
let routeSuspend=false;
function computeRouteHash(){
  if(document.getElementById('admin-screen').style.display==='block'){
    const activePage=document.querySelector('.adm-page.active');
    const page=activePage?activePage.id.replace('adm-',''):'dashboard';
    return '#/admin/'+page;
  }
  if(document.getElementById('technik-screen').classList.contains('active')){
    if(document.getElementById('t-detail').style.display==='block'&&cIdx!=null&&posData[cWeek]&&posData[cWeek][cIdx]){
      return '#/tech/pos/'+cWeek+'/'+posData[cWeek][cIdx].id;
    }
    return '#/tech';
  }
  return '#/';
}
function pushRoute(){
  if(routeSuspend) return;
  const h=computeRouteHash();
  if(location.hash!==h) location.hash=h;
}
function applyRoute(){
  const hash=location.hash||'#/';
  const parts=hash.replace(/^#\/?/,'').split('/').filter(Boolean);
  routeSuspend=true;
  try{
    if(parts[0]==='admin'){
      enterRole('admin');
      const page=parts[1]||'dashboard';
      const btn=document.querySelector(`[onclick="showAdmPage('${page}',this)"]`);
      if(btn) showAdmPage(page,btn);
    } else if(parts[0]==='tech'){
      if(parts[1]==='pos'&&parts[2]&&parts[3]){
        enterRole('technik',{skipBriefing:true});
        const w=parts[2],id=parts[3];
        if(posData[w]){
          cWeek=w;cDay=0;updateHdrLabel();renderChips();renderDayTabs();
          const ri=posData[w].findIndex(p=>p.id===id);
          if(ri>=0) openDetail(ri);
        }
      } else {
        // Obnov uložený týden + pohled (list/planning/overdue) — refresh musí
        // zůstat na stejné obrazovce technika, ne resetovat na výchozí týden.
        // enterRole() interně volá autoSetCurrentDay(), které přepíše cWeek na
        // aktuální týden — proto musíme uložený týden vynutit AŽ PO enterRole().
        const saved=lsg('techUiState',null);
        enterRole('technik',{skipBriefing:true});
        if(saved&&posData[saved.week]){ cWeek=saved.week; updateHdrLabel(); renderChips(); renderDayTabs(); }
        document.getElementById('t-detail').style.display='none';
        document.getElementById('t-list').style.display='block';
        if(saved&&saved.view==='planning') showPlanningView();
        else if(saved&&saved.view==='overdue') showOverdue();
        else renderList(); // 'route' view se po refreshu vrací na denní plán (mapa se inicializuje znovu při otevření)
      }
    } else {
      goHome();
    }
  } finally {
    routeSuspend=false;
  }
}
window.addEventListener('hashchange',applyRoute);
window.addEventListener('DOMContentLoaded',()=>{
  const s = getSession();
  if (s && s.role==='technician') setViewTechnician(s.user.name);
  if (s && s.role==='velin' && s.viewingAs) setViewTechnician(s.viewingAs);
  if (location.hash && location.hash!=='#/') {
    applyRoute();
  } else if (s && s.role==='velin') {
    enterRole(s.viewingAs ? 'technik' : 'admin', {skipBriefing:true});
  } else if (s && s.role==='technician') {
    enterRole('technik', {skipBriefing:true});
  }
  renderUserMenus();
});

// ══════════════════════════════════════════════════════
// BRIEFING
// ══════════════════════════════════════════════════════
function showBriefing(){
  const pos=posData['25']||[];
  const todayPos=pos.filter(p=>p.d===0);
  const svc=pos.filter(p=>p.taskState.some(t=>t.src==='servis'&&!t.done));
  const now=new Date();
  document.getElementById('bf-date').textContent=now.toLocaleDateString('cs-CZ',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const msgs=[
    'Losy: POUZE nová emise Zlaté rybky — ne původní! Stále se objevují chyby.',
    'Rebranding: norma 2 POS/den. Kontroluj samolepky Sazka mobil — musí být odstraněny.',
    'ORLEN: nově v tourplanu — pouze výměna losů + zásobování, NE rebranding.',
    'Corn: priorita tohoto týdne — vždy 2 plakáty na totem, nikdy bílá plocha.',
    'Zásobování: vždy vyžádej podpis a vyplň SAP kódy.',
  ];
  document.getElementById('bf-msg').textContent=msgs[Math.floor(Math.random()*msgs.length)];
  document.getElementById('bf-total').textContent=pos.length;
  document.getElementById('bf-today').textContent=todayPos.length;
  document.getElementById('bf-svc').textContent=svc.length;
  document.getElementById('bf-items').innerHTML=[
    {c:'urg',i:ic('ic-wrench'),t:`${svc.length} servisních tiketů — začni jimi, jsou nejvyšší priorita`},
    {c:'nrm',i:ic('ic-target'),t:'Deadline EuroJackpot plakáty: 20. 6. — dnes! Nezapomeň osadit'},
    {c:'nrm',i:ic('ic-camera'),t:'Foť terminál PŘED a PO osazení — admin kontroluje'},
    {c:'inf',i:ic('ic-edit'),t:'U zásobování vždy vyžádej podpis přijímajícího'},
  ].map(x=>`<div class="bf-item ${x.c}"><div class="bf-ico">${x.i}</div><div class="bf-txt">${x.t}</div></div>`).join('');
  document.getElementById('briefing').classList.add('open');
}
function closeBriefing(){document.getElementById('briefing').classList.remove('open');}

// ══════════════════════════════════════════════════════
// WEEK CHIPS
// ══════════════════════════════════════════════════════
function updateHdrLabel(){
  const m=WEEKS_META[cWeek];
  document.getElementById('hdr-week-label').textContent=`${m.l} · ${m.d} 2025 · Lán Tomáš`;
}
function renderChips(){
  document.getElementById('week-chips').innerHTML=Object.entries(WEEKS_META).map(([w,m])=>{
    const pos=posData[w]||[];
    const done=pos.filter(p=>p.v).length;
    return `<div class="wchip ${w===cWeek?'active':''} ${parseInt(w)<25?'past':''}" onclick="selWeek('${w}')">
      <div class="wc-num">${m.l}</div>
      <div class="wc-dates">${m.d}</div>
      <div class="wc-prog">${pos.length?done+'/'+pos.length:'—'} POS</div>
    </div>`;
  }).join('');
  updateSummary();
}
function selWeek(w){cWeek=w;cDay=0;updateHdrLabel();renderChips();renderDayTabs();renderList();}
function updateSummary(){
  const pos=posData[cWeek]||[];
  const done=pos.filter(p=>p.v).length;
  const unpl=pos.filter(p=>p.d===null&&!p.v).length;
  document.getElementById('ws-t').textContent=pos.length||'—';
  document.getElementById('ws-d').textContent=pos.length?done:'—';
  document.getElementById('ws-r').textContent=pos.length?(pos.length-done):'—';
  document.getElementById('ws-u').textContent=pos.length?unpl:'—';
  document.getElementById('wpfill').style.width=pos.length?(done/pos.length*100)+'%':'0%';
}

// ══════════════════════════════════════════════════════
// DAY TABS
// ══════════════════════════════════════════════════════
function renderDayTabs(){
  const pos=posData[cWeek]||[];
  const m=WEEKS_META[cWeek];
  const todayIdx=getTodayDayIdx();
  const isCurrentWeek=cWeek===getCurrentWeekNum();
  document.getElementById('day-tabs').innerHTML=DAYS.map((d,i)=>{
    const dp=pos.filter(p=>p.d===i);
    const ad=dp.length>0&&dp.every(p=>p.v);
    // Lock past days in current week
    const isPastDay=isCurrentWeek&&todayIdx!==null&&i<todayIdx;
    const isTodayDay=isCurrentWeek&&i===todayIdx;
    const opacity=isPastDay?'opacity:.5;':'';
    return `<div class="dtab ${i===cDay?'active':''} ${ad?'ad':dp.length?'hp':''}" style="${opacity}" onclick="selDay(${i})">
      <div class="dt-name">${d}${isTodayDay?' •':''}</div><div class="dt-date">${m.dd[i]}${isPastDay?' <svg class="ic ic-sm"><use href="#ic-lock"/></svg>':''}</div><div class="dt-dot"></div>
    </div>`;
  }).join('');
}
function selDay(d){
  cDay=d;
  renderDayTabs();renderList();
}

// ══════════════════════════════════════════════════════
// POS LIST
// ══════════════════════════════════════════════════════
function renderList(){
  const wrap=document.getElementById('pos-list-wrap');
  wrap.innerHTML='';
  const all=posData[cWeek]||[];
  if(!all.length){wrap.innerHTML='<div class="empty"><div class="empty-i"><svg class="ic ic-xl"><use href="#ic-notes"/></svg></div><div class="empty-t">Žádné POS tento týden</div></div>';return;}
  const unpl=all.filter(p=>p.d===null&&!p.v);
  if(unpl.length){
    const b=document.createElement('div');b.className='upbanner';b.onclick=showUnplanned;
    b.innerHTML=`<div class="upb-ico"><svg class="ic ic-lg"><use href="#ic-pin"/></svg></div><div><div class="upb-t">${unpl.length} POS bez přiřazeného dne</div><div class="upb-s">Klikni pro naplánování</div></div><div style="color:var(--orange);font-size:18px;margin-left:auto">›</div>`;
    wrap.appendChild(b);
  }
  const dp=all.filter(p=>p.d===cDay);
  if(!dp.length){
    const e=document.createElement('div');e.className='empty';
    e.innerHTML=`<div class="empty-i"><svg class="ic ic-xl"><use href="#ic-calendar"/></svg></div><div class="empty-t">Nic naplánováno</div><div class="empty-s">Přiřaď POS z neplánovaných výše.</div>`;
    wrap.appendChild(e);return;
  }
  const lbl=document.createElement('div');lbl.className='sec-lbl';
  lbl.textContent=`${DAYS[cDay]} ${WEEKS_META[cWeek].dd[cDay]} — ${dp.length} POS`;
  wrap.appendChild(lbl);
  dp.forEach(p=>{wrap.appendChild(makePosCard(p,all.indexOf(p),false));});
}
function showUnplanned(){
  const wrap=document.getElementById('pos-list-wrap');wrap.innerHTML='';
  const all=posData[cWeek]||[];
  const unpl=all.filter(p=>p.d===null&&!p.v);
  const back=document.createElement('div');back.style.cssText='padding:10px 12px 4px';
  back.innerHTML=`<button onclick="renderList()" style="background:none;border:none;color:var(--td);font-size:13px;font-weight:700;cursor:pointer">← Zpět</button>`;
  wrap.appendChild(back);
  const lbl=document.createElement('div');lbl.className='sec-lbl';lbl.textContent=`Neplánované POS (${unpl.length})`;
  wrap.appendChild(lbl);
  unpl.forEach(p=>{wrap.appendChild(makePosCard(p,all.indexOf(p),true));});
}
function typTag(p){
  if(p.typ==='CORN')return`<span class="tag t-corn">Corn</span>`;
  if(p.typ==='PETROL')return`<span class="tag t-petrol">${p.partner||'PETROL'}</span>`;
  if(p.typ==='KA')return`<span class="tag t-ka">★ ${p.partner||'KA'}</span>`;
  return`<span class="tag t-idt">IDT</span>`;
}
function priChip(p){
  if(p.taskState.some(t=>t.src==='servis'&&!t.done))return`<span class="tag t-svc"><svg class="ic ic-sm"><use href="#ic-wrench"/></svg> Servis</span>`;
  const inv=p.inventory||{vnitrni:[],venkovni:[]};
  const invItems=[...(inv.vnitrni||[]),...(inv.venkovni||[])];
  if(invItems.some(i=>i.s==='miss'))return`<span class="tag" style="background:var(--ol);color:var(--orange)"><svg class="ic ic-sm"><use href="#ic-box"/></svg> Chybí</span>`;
  return'';
}
function makePosCard(p,ri,showAssign){
  const done=p.taskState.filter(t=>t.done).length;
  const hasSvc=p.taskState.some(t=>t.src==='servis'&&!t.done);
  const dotCls=p.v?'pd-done':hasSvc?'pd-svc':'pd-pend';
  let tags=p.v?`<span class="tag t-done">✓ Hotovo</span>`:`<span class="tag t-task">${done}/${p.taskState.length}</span>`;
  tags+=priChip(p)+typTag(p);
  const card=document.createElement('div');card.className='pos-card';
  const right=showAssign?`<button class="asgn-btn" onclick="event.stopPropagation();openAssign('${p.id}')">+ Den</button>`:`<div class="parr">›</div>`;
  card.innerHTML=`${p.v?'<div class="vs"></div>':''}<div class="pci"><div class="pdot ${dotCls}"></div><div class="pinfo"><div class="pname">${p.n} <span style="font-weight:600;color:var(--muted);font-size:11px">#${p.id}</span></div><div class="paddr">${p.a}</div><div class="pmeta">${tags}</div></div>${right}</div>`;
  card.onclick=()=>openDetail(ri);
  return card;
}

// ══════════════════════════════════════════════════════
// ASSIGN
// ══════════════════════════════════════════════════════
function openAssign(id){
  assigningId=id;
  const all=posData[cWeek]||[];const p=all.find(x=>x.id===id);
  document.getElementById('assign-title').textContent=p.n;
  document.getElementById('assign-sub').textContent=p.a;
  const m=WEEKS_META[cWeek];
  document.getElementById('assign-opts').innerHTML=DAYS.map((d,i)=>{
    const cnt=all.filter(x=>x.d===i).length;const sel=p.d===i;
    return`<div class="dopt ${sel?'sel':''}" onclick="assignDay(${i})">
      <div class="dopt-l"><div class="dopt-ico">${DAY_ICONS[i]}</div><div><div class="dopt-n">${d} ${m.dd[i]}</div><div class="dopt-c">${cnt} POS přiřazeno</div></div></div>
      ${sel?'<span style="color:var(--td);font-weight:800">✓</span>':''}
    </div>`;
  }).join('');
  document.getElementById('assign-modal').classList.add('open');
}
function assignDay(d){
  const all=posData[cWeek]||[];const p=all.find(x=>x.id===assigningId);
  if(p){ p.d=d; setAssignment(p.id, d); }
  closeModal();updateSummary();renderChips();renderDayTabs();
  // Stay in planning view if we were there
  if(document.querySelector('#pos-list-wrap .sec-lbl')?.textContent?.includes('Nepřiřazené')||
     document.querySelector('#pos-list-wrap')?.innerHTML?.includes('Naplánovat POS')){
    showPlanningView();
  } else {
    renderList();
  }
}
function closeModal(){document.getElementById('assign-modal').classList.remove('open');assigningId=null;}

// ══════════════════════════════════════════════════════
// DETAIL
// ══════════════════════════════════════════════════════
function openDetail(ri){
  cIdx=ri;
  const p=posData[cWeek][ri];
  const m=WEEKS_META[cWeek];
  document.getElementById('d-name').textContent=p.n;
  document.getElementById('d-id').textContent=p.id;
  document.getElementById('d-fullname').textContent=p.n;
  document.getElementById('d-addr').textContent=p.a;
  // chips
  const chips=[];
  chips.push(`<span class="chip ch-area"><svg class="ic ic-sm"><use href="#ic-pin"/></svg> ${p.area||'—'}</span>`);
  if(p.d!==null&&p.d!==undefined) chips.push(`<span class="chip ch-day"><svg class="ic ic-sm"><use href="#ic-calendar"/></svg> ${DAYS[p.d]} ${m.dd[p.d]}</span>`);
  if(p.taskState.some(t=>t.src==='servis'&&!t.done)) chips.push(`<span class="chip ch-pri1"><svg class="ic ic-sm"><use href="#ic-wrench"/></svg> Servis</span>`);
  if((p.terminals||[]).length) chips.push(`<span class="chip ch-typ"><svg class="ic ic-sm"><use href="#ic-monitor"/></svg> ${p.terminals.length>1?`${p.terminals.length} terminály`:`Terminál ${p.terminals[0].id}`}</span>`);
  document.getElementById('d-chips').innerHTML=chips.join('');
  // otevírací doba — fakt o tom, co je teď, žádný odhad
  const dHoursEl=document.getElementById('d-hours');
  const statusInfo=getOpeningStatusInfo(p);
  dHoursEl.className='det-hours show '+statusInfo.cls;
  dHoursEl.innerHTML=`<svg class="ic ic-sm"><use href="#ic-clock"/></svg> ${statusInfo.text}`;
  // info
  document.getElementById('info-area').textContent=(p.area||'—')+' · '+p.k;
  document.getElementById('info-typ').textContent=p.typ==='CORN'?'Corn — zvláštní kanál':p.typ==='KA'?`Klíčový partner · ${p.partner}`:p.typ==='PETROL'?`Petrol · ${p.partner}`:'IDT — Independent Dealer';
  // notes
  document.getElementById('notes-ta').value=p.notes||'';
  // reset tabs
  showDetTab('inv',document.querySelector('.det-tab'));
  // render sections
  renderCheckin();
  renderCampaigns();
  renderRefs();
  renderMerch(p);
  renderSupply(p);
  renderTasks();
  renderPhotos();
  renderCompleteBtn();
  document.getElementById('t-list').style.display='none';
  document.getElementById('t-detail').style.display='block';
  window.scrollTo(0,0);
  pushRoute();
}

// ══════════════════════════════════════════════════════
// CHECK-IN
// ══════════════════════════════════════════════════════
function renderCheckin(){
  const p=posData[cWeek][cIdx];
  const ci=lsg('ci_'+p.id);
  const bar=document.getElementById('ci-bar');
  const btn=document.getElementById('ci-btn');
  const t=document.getElementById('ci-t');
  const s=document.getElementById('ci-s');
  if(ci&&ci.out){
    bar.className='ci-bar done-ci';
    t.textContent='✓ Návštěva zaznamenaná';
    s.textContent=`${ci.inTime} – ${ci.outTime} · ${ci.dur} minut na místě`;
    btn.textContent='Hotovo';btn.className='ci-btn done';btn.onclick=null;
  } else if(ci&&!ci.out){
    bar.className='ci-bar active';
    t.textContent='● Na místě od '+ci.inTime;
    btn.textContent='Check-out';btn.className='ci-btn out';btn.onclick=doCheckout;
    startCiTimer(ci.inTs,s);
  } else {
    bar.className='ci-bar';
    t.textContent='Check-in na POS';s.textContent='Potvrď příjezd na provozovnu';
    btn.textContent='Check-in';btn.className='ci-btn';btn.onclick=doCheckin;
  }
}
function doCheckin(){
  const p=posData[cWeek][cIdx];
  const now=new Date();
  const timeStr=now.toLocaleTimeString('cs-CZ',{hour:'2-digit',minute:'2-digit'});
  lss('ci_'+p.id,{inTs:now.getTime(),inTime:timeStr,out:false});
  if(!lsg('daystart_'+today())) lss('daystart_'+today(),{ts:now.getTime(),time:timeStr,posId:p.id,posName:p.n});
  renderCheckin();
}
function doCheckout(){
  const p=posData[cWeek][cIdx];
  const ci=lsg('ci_'+p.id);if(!ci)return;
  const now=new Date();
  const timeStr=now.toLocaleTimeString('cs-CZ',{hour:'2-digit',minute:'2-digit'});
  const dur=Math.round((now.getTime()-ci.inTs)/60000);
  lss('ci_'+p.id,{...ci,out:true,outTime:timeStr,outTs:now.getTime(),dur});
  const log=lsg('vlog_'+today(),[]);
  log.push({posId:p.id,posName:p.n,typ:p.typ,inTime:ci.inTime,outTime:timeStr,dur,flag:dur<10?'short':dur>60?'long':'ok'});
  lss('vlog_'+today(),log);
  if(ciTimer){clearInterval(ciTimer);ciTimer=null;}
  renderCheckin();
}
function startCiTimer(inTs,el){
  if(ciTimer)clearInterval(ciTimer);
  ciTimer=setInterval(()=>{
    const e=Math.floor((Date.now()-inTs)/1000);
    const m=Math.floor(e/60),s=e%60;
    if(el)el.textContent=`Na místě: ${m}:${s.toString().padStart(2,'0')}`;
  },1000);
}

// ══════════════════════════════════════════════════════
// CAMPAIGNS
// ══════════════════════════════════════════════════════
function renderCampaigns(){
  const wrap=document.getElementById('camp-wrap');
  const p=posData[cWeek]?.[cIdx];
  const isCorn=p&&(p.typ==='CORN'||p.kat==='9'||p.k==='9');
  const isOrlen=p&&(p.partner==='Orlen'||p.partner==='ORLEN'||(p.k&&p.k.includes('ORLEN')));
  const html=[
    ...CAMPAIGNS.losy.map(c=>campCard(c,'losy','Losy')),
    ...CAMPAIGNS.loterie.map(c=>campCard(c,'lot','Loterie')),
    ...(isOrlen?[{name:'ORLEN — speciální instrukce',dates:'W23–W28',deadline:'2025-07-11',items:['Pouze výměna losů ve folii','Případné doplnění zásobování','Neoznačovat jako rebranding — materiály ve výrobě'],note:'Kompletní rebranding Orlen bude následovat'}].map(c=>campCard(c,'reb','ORLEN')):[]),
    ...CAMPAIGNS.rebranding.map(c=>campCard(c,'reb','Rebranding')),
  ].join('');
  wrap.innerHTML=html;
  if(isCorn){
    wrap.insertAdjacentHTML('afterbegin',`<div style="background:linear-gradient(135deg,#1A3C47,#2d5a6b);border-radius:12px;padding:14px 16px;margin-bottom:8px;border:1px solid rgba(46,205,192,.3)">
      <div style="font-size:10px;font-weight:800;color:#f0c030;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Corn — prioritní kanál</div>
      <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:8px">Visibilita na Cornech — červenec</div>
      <div style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:rgba(255,255,255,.8)">
        <div>• Primární pult: nová emise losů dle plánogramu</div>
        <div>• Totem: vždy 2 plakáty (losy + loterie), nikdy bílá plocha</div>
        <div>• Barketa: Rybky + 20 mega sáz.</div>
        <div>• Sazenka + obálky: předat obsluze</div>
      </div>
    </div>`);
  }
}
function campCard(c,cls,lbl){
  if(cls==='reb') cls='rebranding';
  const now=new Date();
  const dl=new Date(c.deadline);
  const days=Math.ceil((dl-now)/86400000);
  const dlColor=days<=0?'color:#ff6b6b':days<=3?'color:var(--orange)':'color:rgba(255,255,255,.5)';
  const dlTxt=days<=0?'Dnes!':days===1?'Zítra':days+' dní';
  return`<div class="camp-card camp-${cls}"><div class="camp-inner">
    <div class="camp-type">${lbl}</div>
    <div class="camp-name">${c.name}</div>
    <div class="camp-dates"><svg class="ic ic-sm"><use href="#ic-calendar"/></svg> ${c.dates}</div>
    <div class="camp-items">${c.items.map(i=>`<div class="camp-item"><div class="camp-dot"></div>${i}</div>`).join('')}</div>
    <div class="camp-dl" style="${dlColor}"><svg class="ic ic-sm"><use href="#ic-clock"/></svg> Deadline: ${c.deadline.split('-').reverse().join('. ')} · ${dlTxt}</div>
  </div></div>`;
}

// ══════════════════════════════════════════════════════
// REFS
// ══════════════════════════════════════════════════════
function renderRefs(){
  const p=posData[cWeek][cIdx];
  const refs=p.refs||[];

  // Channel color per type
  const chColor={
    'CORN':'linear-gradient(135deg,#1A3C47,#E65100)',
    'PETROL':'linear-gradient(135deg,#1A3C47,#7B341E)',
    'KA':'linear-gradient(135deg,#1A3C47,#1FA89D)',
    'IDT':'linear-gradient(135deg,#1A3C47,#234F5E)',
  };
  const bg=chColor[p.typ]||chColor.IDT;

  // Channel header badge
  const channelBadge=`<div style="margin:0 12px 8px;padding:10px 14px;background:var(--navy);border-radius:10px;display:flex;align-items:center;gap:10px">
    <div style="color:var(--teal)"><svg class="ic ic-lg"><use href="#${p.typ==='CORN'?'ic-flag':p.typ==='PETROL'?'ic-fuel':p.typ==='KA'?'ic-store':'ic-image'}"/></svg></div>
    <div>
      <div style="font-size:12px;font-weight:800;color:var(--teal);text-transform:uppercase;letter-spacing:.8px">
        ${p.typ==='CORN'?'Corn — zvláštní kanál':p.typ==='PETROL'?`Petrol · ${p.partner||''}`:p.typ==='KA'?`KA Partner · ${p.partner||''}`:p.market||'IDT'}
      </div>
      <div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:2px">
        ${p.typ==='CORN'?'Plánogram dle konkrétní lokace — viz složka aktuálních plánogramů':
          p.typ==='KA'?'Umístění schváleno centrálou — nesmí se měnit bez souhlasu KAM':
          p.typ==='PETROL'?'Pozice na prodejním pultu, preferovaná deska na losy 38,5×24,5':
          'Standardní IDT instalace — samolepka + plakát + stojánek'}
      </div>
    </div>
  </div>`;

  const cards=refs.map(r=>`
    <div style="flex-shrink:0;width:210px;border-radius:12px;overflow:hidden;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.08)">
      <div style="width:100%;height:120px;background:${bg};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">
        <div style="font-size:36px">${r.i}</div>
      </div>
      <div style="padding:8px 12px 4px;font-size:12px;font-weight:800;color:var(--navy)">${r.l}</div>
      <div style="padding:0 12px 10px;font-size:11px;color:var(--muted);line-height:1.5">${r.d}</div>
    </div>`).join('');

  document.getElementById('refs-wrap').innerHTML = channelBadge +
    (refs.length ? `<div style="display:flex;gap:10px;overflow-x:auto;padding:0 12px 6px;-webkit-overflow-scrolling:touch">${cards}</div>` : '');
}

// ══════════════════════════════════════════════════════
// SUPPLY + SIGNATURE
// ══════════════════════════════════════════════════════
function renderSupply(p){
  const sec=document.getElementById('supply-section');
  sec.style.display='block';
  const isCorn=p.typ==='CORN'||p.kat==='9'||p.k==='9';
  const defaults=isCorn?SUPPLY_CORN:SUPPLY_DEFAULT;
  const saved=lsg('supply_'+p.id+'_'+today());
  supplyItems=saved?saved.items:defaults.map(x=>({...x}));
  const hdrBadge=document.getElementById('supply-badge-lbl');
  if(hdrBadge) hdrBadge.textContent=isCorn?'Corn — vyžaduje podpis':'Vyžaduje podpis';
  renderSupplyItems();
  document.getElementById('supply-recv-input').value=saved?saved.receiver:'';
  document.getElementById('sig-done').style.display=saved&&saved.confirmed?'block':'none';
  document.querySelector('.sig-conf').style.display=saved&&saved.confirmed?'none':'block';
  initSig();
}
function renderSupplyItems(){
  document.getElementById('supply-items').innerHTML=supplyItems.map((x,i)=>`
    <div class="supply-item" style="flex-direction:column;align-items:stretch;gap:0;padding:0">
      <div style="display:flex;align-items:center;gap:12px;padding:10px 14px">
        <div class="supply-item-n" style="flex:1">${x.n}${x.unit?' <span style="font-size:10px;color:var(--muted)">('+x.unit+')</span>':''}</div>
        <div class="supply-qty">
          <button class="sq-btn" onclick="adjQty(${i},-1)">−</button>
          <div class="sq-val">${x.qty}</div>
          <button class="sq-btn" onclick="adjQty(${i},1)">+</button>
        </div>
      </div>
      ${x.qty>0?`<div style="display:flex;align-items:center;gap:8px;padding:0 14px 10px;border-top:1px solid var(--bg)">
        <span style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;flex-shrink:0">SAP:</span>
        <span style="flex:1;font-size:12px;font-weight:700;color:var(--navy);font-family:monospace">${x.sap||'—'}</span>
        <span style="font-size:9px;color:var(--muted);display:inline-flex;align-items:center;gap:3px"><svg class="ic ic-sm"><use href="#ic-lock"/></svg> pevný kód</span>
      </div>`:''}
    </div>`).join('');
}
function adjQty(i,d){supplyItems[i].qty=Math.max(0,supplyItems[i].qty+d);renderSupplyItems();}
function initSig(){
  const c=document.getElementById('sig-canvas');if(!c)return;
  sigCanvas=c;sigCtx=c.getContext('2d');
  c.width=c.offsetWidth||360;c.height=120;
  sigCtx.strokeStyle='#1A3C47';sigCtx.lineWidth=2.5;sigCtx.lineCap='round';sigCtx.lineJoin='round';
  sigDrawing=false;sigMark=false;
  const gp=e=>{const r=c.getBoundingClientRect();const src=e.touches?e.touches[0]:e;return{x:(src.clientX-r.left)*(c.width/r.width),y:(src.clientY-r.top)*(c.height/r.height)};};
  c.onmousedown=c.ontouchstart=e=>{e.preventDefault();sigDrawing=true;sigMark=true;document.getElementById('sig-hint').style.opacity='0';const p=gp(e);sigCtx.beginPath();sigCtx.moveTo(p.x,p.y);};
  c.onmousemove=c.ontouchmove=e=>{e.preventDefault();if(!sigDrawing)return;const p=gp(e);sigCtx.lineTo(p.x,p.y);sigCtx.stroke();};
  c.onmouseup=c.ontouchend=c.onmouseleave=()=>{sigDrawing=false;};
}
function clearSig(){if(!sigCtx)return;sigCtx.clearRect(0,0,sigCanvas.width,sigCanvas.height);sigMark=false;document.getElementById('sig-hint').style.opacity='1';}
function confirmSupply(){
  const p=posData[cWeek][cIdx];
  const recv=document.getElementById('supply-recv-input').value.trim();
  if(!recv){alert('Vyplň jméno přijímajícího.');return;}
  if(!sigMark){alert('Přijímající musí podepsat.');return;}
  const sapCodes=supplyItems.filter(x=>x.sap&&x.sap.trim()).map(x=>x.n+': '+x.sap).join(', ');
  lss('supply_'+p.id+'_'+today(),{items:supplyItems,receiver:recv,sigData:sigCanvas.toDataURL(),confirmed:true,at:new Date().toLocaleTimeString('cs-CZ',{hour:'2-digit',minute:'2-digit'}),sapCodes});
  document.getElementById('sig-done').style.display='block';
  document.querySelector('.sig-conf').style.display='none';
}

// ══════════════════════════════════════════════════════
// TASKS
// ══════════════════════════════════════════════════════
function renderTasks(){
  const p=posData[cWeek][cIdx];
  const list=document.getElementById('tasks-list');list.innerHTML='';
  const groups=[
    {src:'servis',lbl:'<svg class="ic ic-sm"><use href="#ic-wrench"/></svg> Servis — nejvyšší priorita',cls:'gl-svc'},
    {src:'template',lbl:`Šablona · ${p.typ==='KA'?p.partner:p.typ==='PETROL'?p.partner:'IDT'}`,cls:'gl-tpl'},
    {src:'on_top',lbl:'On top',cls:'gl-ot'},
    {src:'own',lbl:'Vlastní',cls:'gl-own'},
  ];
  groups.forEach(({src,lbl,cls})=>{
    const tasks=p.taskState.filter(t=>t.src===src);if(!tasks.length)return;
    const hdr=document.createElement('div');hdr.className='tg-hdr';
    hdr.innerHTML=`<span class="tg-lbl ${cls}">${lbl}</span><span class="tg-cnt">${tasks.length}</span>`;list.appendChild(hdr);
    tasks.forEach(task=>{
      const ti=p.taskState.indexOf(task);
      const item=document.createElement('div');item.className='titem';
      item.innerHTML=`<div class="trow" onclick="toggleTask(${ti})"><div class="tchk ${task.done?'on':''}"></div><div class="ttxt ${task.done?'done':''}">${task.text}</div></div>${task.note?`<div class="tnote">${task.note}</div>`:''}`;
      list.appendChild(item);
    });
  });
}
function toggleTask(ti){
  const p=posData[cWeek][cIdx];if(p.v)return;
  p.taskState[ti].done=!p.taskState[ti].done;
  renderTasks();renderCompleteBtn();
}

// ══════════════════════════════════════════════════════
// PHOTOS
// ══════════════════════════════════════════════════════
function renderPhotos(){
  const p=posData[cWeek][cIdx];
  const grid=document.getElementById('photos-grid');grid.innerHTML='';
  const lbls=['Před','Po','Detail'];
  const slots=Math.max(3,p.photos.length+1);
  for(let i=0;i<slots;i++){
    const slot=document.createElement('div');
    if(p.photos[i]){
      slot.className='pslot filled';
      slot.innerHTML=`<img src="${p.photos[i]}" alt="foto"/><button class="p-rm" onclick="rmPhoto(event,${i})">✕</button>`;
    } else {
      slot.className='pslot';
      slot.innerHTML=`<div class="p-ico"><svg class="ic ic-lg"><use href="#ic-camera"/></svg></div><div class="p-lbl">${lbls[i]||'Foto '+(i+1)}</div>`;
      slot.onclick=()=>{pendingSlot=i;document.getElementById('photo-input').click();};
    }
    grid.appendChild(slot);
  }
}
function handlePhoto(e){
  const file=e.target.files[0];if(!file)return;
  const r=new FileReader();
  r.onload=ev=>{
    const p=posData[cWeek][cIdx];
    if(pendingSlot!==null&&pendingSlot<p.photos.length)p.photos[pendingSlot]=ev.target.result;
    else p.photos.push(ev.target.result);
    pendingSlot=null;renderPhotos();e.target.value='';
  };r.readAsDataURL(file);
}
function rmPhoto(e,i){e.stopPropagation();posData[cWeek][cIdx].photos.splice(i,1);renderPhotos();}

// ══════════════════════════════════════════════════════
// DETAIL TABS
// ══════════════════════════════════════════════════════
function showDetTab(tab,btn){
  document.querySelectorAll('.det-tc').forEach(t=>t.style.display='none');
  document.querySelectorAll('.det-tab').forEach(b=>b.classList.remove('active'));
  document.getElementById('dtc-'+tab).style.display='block';
  if(btn)btn.classList.add('active');
  if(tab==='inv')renderInventory();
  if(tab==='karta')renderPosCard();
}

// ══════════════════════════════════════════════════════
// INVENTORY
// ══════════════════════════════════════════════════════

// ── MERCH ─────────────────────────────────────────────────────────────────
let merchItems = [];

function renderMerch(p) {
  const defaults = (MERCH_ITEMS[p.typ] || MERCH_ITEMS.IDT).map(x => ({...x}));
  const saved = lsg('merch_' + p.id + '_' + today());
  merchItems = saved || defaults;
  const el = document.getElementById('merch-items');
  if (!el) return;
  el.innerHTML = merchItems.map((x, i) => `
    <div class="inv-item">
      <div class="inv-info">
        <div class="inv-n" style="${x.done?'text-decoration:line-through;color:var(--muted)':''}">${x.n}</div>
      </div>
      <div class="inv-btns">
        <button class="ibtn ibtn-ok ${x.done?'on':''}" onclick="setMerch(${i},true)">✓</button>
        <button class="ibtn ibtn-miss ${x.done===false?'on':''}" onclick="setMerch(${i},false)">✕</button>
      </div>
    </div>`).join('') || '<div style="padding:16px;text-align:center;font-size:12px;color:var(--muted)">Žádné merch položky</div>';
}

function setMerch(i, done) {
  const p = posData[cWeek][cIdx];
  if (!merchItems[i]) return;
  merchItems[i].done = merchItems[i].done === done ? null : done;
  lss('merch_' + p.id + '_' + today(), merchItems);
  renderMerch(p);
}

// ── INVENTORY TABS ─────────────────────────────────────────────────────────
function showInvTab(tab, btn) {
  document.getElementById('inv-vnitrni').style.display = tab === 'vnitrni' ? 'block' : 'none';
  document.getElementById('inv-venkovni').style.display = tab === 'venkovni' ? 'block' : 'none';
  document.querySelectorAll('#dtc-inv button[onclick^="showInvTab"]').forEach(b => {
    b.style.background = 'transparent'; b.style.color = 'var(--muted)';
  });
  if (btn) { btn.style.background = 'var(--navy)'; btn.style.color = 'var(--teal)'; }
}


// ══════════════════════════════════════════════════════════════════════════
// INVENTORY CATALOG — admin-editable list of allowed items
// ══════════════════════════════════════════════════════════════════════════
const ic = (name) => `<svg class="ic"><use href="#${name}"/></svg>`;
const INV_CATALOG_DEFAULT = {
  vnitrni: [
    {i:ic('ic-monitor'), n:'Terminál Allwyn'},
    {i:ic('ic-building'), n:'Totem Allwyn 3prvkový'},
    {i:ic('ic-building'), n:'Totem Allwyn 4prvkový'},
    {i:ic('ic-building'), n:'Totem Allwyn B'},
    {i:ic('ic-monitor'), n:'VCU obrazovka'},
    {i:ic('ic-bulb'), n:'ESO výstrč'},
    {i:ic('ic-building'), n:'Stojan na sázenky (velký)'},
    {i:ic('ic-box'), n:'Šanon na losy'},
    {i:ic('ic-store'), n:'Primární pult (losy)'},
    {i:ic('ic-store'), n:'Sekundární pult (losy)'},
    {i:ic('ic-card'), n:'Barketa Rybky'},
    {i:ic('ic-flag'), n:'Stojka'},
  ],
  venkovni: [
    {i:ic('ic-building'), n:'Venkovní světelné označení'},
    {i:ic('ic-flag'), n:'Venkovní výstrč'},
    {i:ic('ic-flag'), n:'Venkovní vlajka / banner'},
  ],
};

function getInvCatalog() {
  return lsg('inv_catalog', INV_CATALOG_DEFAULT);
}
function saveInvCatalog(cat) {
  lss('inv_catalog', cat);
}

// Replace addInvItem with catalog picker
function addInvItem(section) {
  section = section || 'vnitrni';
  const catalog = getInvCatalog();
  const items = catalog[section] || [];
  showInvPicker(section, items);
}

function showInvPicker(section, items) {
  let modal = document.getElementById('inv-picker');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'inv-picker';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:850;display:flex;align-items:flex-end;justify-content:center;max-width:430px;margin:0 auto';
    document.body.appendChild(modal);
    modal.onclick = e => { if (e.target === modal) modal.style.display = 'none'; };
  }
  modal.innerHTML = `<div style="background:#fff;border-radius:20px 20px 0 0;width:100%;max-height:70vh;overflow-y:auto;padding:20px 16px 32px">
    <div style="width:40px;height:4px;background:var(--border);border-radius:2px;margin:0 auto 16px"></div>
    <div style="font-size:16px;font-weight:800;margin-bottom:4px">Přidat ${section==='venkovni'?'venkovní':'vnitřní'} vybavení</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:16px">Vyber z katalogu (spravuje admin)</div>
    ${items.map((item,i)=>`
      <div onclick="pickInvItem('${section}',${i})" style="display:flex;align-items:center;gap:12px;padding:13px 14px;border-radius:10px;cursor:pointer;margin-bottom:4px;transition:background .15s" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='transparent'">
        <div style="font-size:20px">${item.i}</div>
        <div style="font-size:14px;font-weight:600;flex:1">${item.n}</div>
        <div style="color:var(--teal);font-size:18px;font-weight:700">+</div>
      </div>`).join('')}
    <button onclick="document.getElementById('inv-picker').style.display='none'" style="width:100%;padding:13px;border:1px solid var(--border);border-radius:10px;background:transparent;font-size:14px;cursor:pointer;color:var(--muted);margin-top:8px">Zrušit</button>
  </div>`;
  modal.style.display = 'flex';
}

function pickInvItem(section, catalogIdx) {
  const catalog = getInvCatalog();
  const item = catalog[section][catalogIdx];
  if (!item) return;
  const p = posData[cWeek][cIdx];
  if (!p.inventory[section]) p.inventory[section] = [];
  p.inventory[section].push({id:'c'+Date.now(), i:item.i, n:item.n, typ:'', s:'ok'});
  document.getElementById('inv-picker').style.display = 'none';
  renderInventory();
}

function materialStatusCz(s){
  return { ok: '✓ Přítomno', miss: '✕ Chybí', damaged: '⚠ Poškozeno', needs_replacement: '⟳ Nutná výměna' }[s] || s;
}
function renderInventory(){
  const p=posData[cWeek][cIdx];
  const inv=p.inventory||{vnitrni:[],venkovni:[]};

  function renderInvList(items, elId, section) {
    const el=document.getElementById(elId);
    if(!el) return;
    if(!items||!items.length){
      el.innerHTML='<div style="padding:16px;text-align:center;color:var(--muted);font-size:12px">Žádné položky. Přidej níže při instalaci.</div>';
      return;
    }
    el.innerHTML=items.map((item,i)=>`
      <div class="inv-item">
        <div class="inv-ico">${item.i}</div>
        <div class="inv-info">
          <div class="inv-n">${item.n}</div>
          <div class="inv-s" style="display:flex;gap:6px;align-items:center;margin-top:3px">
            ${item.typ?`<span style="font-size:10px;background:var(--tl);color:var(--tm);padding:1px 6px;border-radius:10px;font-weight:700">${item.typ}</span>`:''}
            <span style="font-size:10px;color:var(--muted)">${item.s?('Stav: '+materialStatusCz(item.s)):'nezkontrolováno'}</span>
          </div>
        </div>
        <div class="inv-btns">
          <button class="ibtn ibtn-ok ${item.s==='ok'?'on':''}" onclick="setInv('${section}',${i},'ok')">✓</button>
          <button class="ibtn ibtn-miss ${item.s==='miss'?'on':''}" onclick="setInv('${section}',${i},'miss')">✕</button>
        </div>
      </div>`).join('');
  }

  renderInvList(inv.vnitrni, 'inv-card', 'vnitrni');
  renderInvList(inv.venkovni, 'inv-card-venkovni', 'venkovni');
}
function setInv(section,i,s){
  const p=posData[cWeek][cIdx];
  const inv=p.inventory||{vnitrni:[],venkovni:[]};
  const items=inv[section]||[];
  if(!items[i]) return;
  items[i].s = items[i].s===s ? null : s;
  if(s==='miss'){
    const txt=`Chybí ${section==='venkovni'?'venkovní':'vnitřní'} inventory: ${items[i].n}`;
    if(!p.taskState.find(t=>t.text===txt)){
      p.taskState.unshift({text:txt,src:'servis',done:false,note:'Automaticky z inventory — prověřit a nahlásit'});
      renderTasks();renderCompleteBtn();
    }
  }
  renderInventory();
}


// ══════════════════════════════════════════════════════
// POS CARD
// ══════════════════════════════════════════════════════
function renderPosCard(){
  const p=posData[cWeek][cIdx];
  const notes=lsg('poscard_'+p.id,[]);
  const el=document.getElementById('pos-card-log');
  el.innerHTML=!notes.length
    ?'<div class="pos-rec-empty">Zatím žádné záznamy. Přidej první níže.</div>'
    :notes.slice().reverse().map(n=>`<div class="pos-rec"><div class="pos-rec-time">${n.time} · ${n.author}</div><div class="pos-rec-txt">${n.text}</div></div>`).join('');
}
function addPosCardNote(){
  const p=posData[cWeek][cIdx];
  const val=document.getElementById('pos-card-ta').value.trim();if(!val)return;
  const notes=lsg('poscard_'+p.id,[]);
  notes.push({text:val,time:new Date().toLocaleDateString('cs-CZ',{day:'numeric',month:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'}),author:'Lán Tomáš'});
  lss('poscard_'+p.id,notes);
  document.getElementById('pos-card-ta').value='';
  renderPosCard();
}

// ══════════════════════════════════════════════════════
// NOTES / MAP / COMPLETE
// ══════════════════════════════════════════════════════
function saveNote(){posData[cWeek][cIdx].notes=document.getElementById('notes-ta').value;}
function openMap(){const p=posData[cWeek][cIdx];window.open(`https://maps.google.com/?q=${encodeURIComponent(p.a)}`,'_blank');}
function renderCompleteBtn(){
  const p=posData[cWeek][cIdx];
  const btn=document.getElementById('complete-btn');
  const badge=document.getElementById('vis-badge-slot2');
  const allDone=p.taskState.length>0&&p.taskState.every(t=>t.done);
  if(p.v){
    badge.innerHTML='<div class="vis-badge">✓ Návštěva dokončena</div>';
    btn.textContent='Znovu otevřít';btn.className='btn-complete visited';
  } else {
    badge.innerHTML='';
    if(allDone){btn.textContent='Označit jako navštíveno ✓';btn.className='btn-complete active';}
    else{const r=p.taskState.filter(t=>!t.done).length;btn.textContent=`Zbývá ${r} ${r===1?'úkol':r<5?'úkoly':'úkolů'}`;btn.className='btn-complete disabled';}
  }
}
function markVisited(){
  const p=posData[cWeek][cIdx];
  if(p.v||!p.taskState.every(t=>t.done))return;
  p.v=true;renderCompleteBtn();updateSummary();renderChips();renderDayTabs();
}
function goBack(){
  document.getElementById('t-detail').style.display='none';
  document.getElementById('t-list').style.display='block';
  hideAddForm();renderList();window.scrollTo(0,0);
  if(ciTimer){clearInterval(ciTimer);ciTimer=null;}
  pushRoute();
}
function showAddForm(){document.getElementById('add-btn').style.display='none';document.getElementById('add-form').style.display='block';document.getElementById('new-task-input').focus();}
function hideAddForm(){document.getElementById('add-btn').style.display='block';document.getElementById('add-form').style.display='none';document.getElementById('new-task-input').value='';}
function addTask(){
  const val=document.getElementById('new-task-input').value.trim();if(!val)return;
  posData[cWeek][cIdx].taskState.push({text:val,src:'own',done:false});
  hideAddForm();renderTasks();renderCompleteBtn();
}

// ══════════════════════════════════════════════════════
// ADMIN — MAP
// ══════════════════════════════════════════════════════
// Marker = technikova SOUČASNÁ POS z dnešní trasy (currentPos z TechnicianModel),
// ne vymyšlená souřadnice. Bez dnešního plánu padá zpět na centroid jeho POS.
function initAdminMap(){
  if(adminMap)return;
  try{
    adminMap=L.map('admin-map',{zoomControl:true,attributionControl:false}).setView([49.8,15.5],7);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:18}).addTo(adminMap);
    adminTechnicians=deriveAllTechnicians();
    adminTechnicians.forEach((t)=>{
      const pos=techDisplayLatLng(t);
      const color=t.overdue?'#CC2200':t.pct>=80?'#1A8C4E':'#2ECDC0';
      const icon=L.divIcon({className:'',html:`<div style="width:30px;height:30px;background:${color};border-radius:50%;border:2.5px solid rgba(255,255,255,.9);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:${t.overdue?'#fff':t.pct>=80?'#fff':'#1A3C47'};box-shadow:0 2px 8px rgba(0,0,0,.4)">${t.initials}</div>`,iconSize:[30,30],iconAnchor:[15,15]});
      const marker=L.marker([pos.lat,pos.lng],{icon}).addTo(adminMap);
      marker.bindPopup(`<b>${t.name}</b><br>${t.done}/${t.total} POS · ${t.pct}%<br><em style="color:${t.overdue?'red':'green'}">${t.activityLabel}</em>`);
      adminMarkers.push(marker);
    });
  } catch(e){console.warn('Map init failed',e);}
}

// ══════════════════════════════════════════════════════
// ADMIN — REGION FILTER
// ══════════════════════════════════════════════════════
function filterRegion(region,btn){
  activeRegion=region;
  document.querySelectorAll('.rfb').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderAdminLive();
  adminMarkers.forEach((m,i)=>{
    const t=adminTechnicians[i];
    const show=region==='all'||t.region===region;
    if(adminMap){show?m.addTo(adminMap):adminMap.removeLayer(m);}
  });
}

// ══════════════════════════════════════════════════════
// ADMIN — LIVE LIST
// ══════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════
// LIVE STATE ENGINE — propojení technik ↔ admin
// ══════════════════════════════════════════════════════

// Centrální stav — co technik udělal, admin vidí live
function getLiveState() {
  return {
    technik: 'Lán Tomáš',
    initials: 'LT',
    week: '25',
    dayStart: lsg('daystart_' + today()),
    visitLog: lsg('vlog_' + today(), []),
    checkins: (() => {
      const all = posData['25'] || [];
      return all.map(p => ({ posId: p.id, posName: p.n, typ: p.typ, partner: p.partner, ci: lsg('ci_' + p.id) })).filter(x => x.ci);
    })(),
    completedPos: (posData['25'] || []).filter(p => p.v),
    totalPos: (posData['25'] || []).length,
    photos: (() => {
      const all = posData['25'] || [];
      const photos = [];
      all.forEach(p => { p.photos.forEach((ph, i) => photos.push({ posName: p.n, posId: p.id, url: ph, slot: ['Před','Po','Detail'][i] || ('Foto '+(i+1)) })); });
      return photos;
    })(),
    supplies: (() => {
      const all = posData['25'] || [];
      return all.map(p => {
        const s = lsg('supply_' + p.id + '_' + today());
        return s && s.confirmed ? { posName: p.n, receiver: s.receiver, at: s.at, items: s.items } : null;
      }).filter(Boolean);
    })(),
    posCardNotes: (() => {
      const all = posData['25'] || [];
      const notes = [];
      all.forEach(p => { const n = lsg('poscard_' + p.id, []); if (n.length) notes.push({ posName: p.n, notes: n }); });
      return notes;
    })(),
    servisOpen: (posData['25'] || []).filter(p => p.taskState.some(t => t.src === 'servis' && !t.done)),
    shortVisits: lsg('vlog_' + today(), []).filter(v => v.flag === 'short'),
  };
}

function getActiveTechPos() {
  // Which POS is technik currently on?
  const all = posData['25'] || [];
  return all.find(p => { const ci = lsg('ci_' + p.id); return ci && !ci.out; });
}

// Auto-refresh admin every 5s when visible
let adminRefreshTimer = null;
function startAdminRefresh() {
  if (adminRefreshTimer) return;
  adminRefreshTimer = setInterval(() => {
    if (document.getElementById('admin-screen').style.display !== 'none') {
      const activePage = document.querySelector('.adm-page.active');
      if (!activePage) return;
      if (activePage.id === 'adm-dashboard') renderAdminDashboard();
      if (activePage.id === 'adm-live') renderAdminLive();
      if (activePage.id === 'adm-casy') renderAdminCasy();
      if (activePage.id === 'adm-alerts') renderAdminAlerts();
      if (activePage.id === 'adm-foto') renderAdminFoto();
    }
  }, 5000);
}

// ══════════════════════════════════════════════════════
// ADMIN — EXECUTIVE DASHBOARD (computed from existing data, no backend)
// ══════════════════════════════════════════════════════
function renderAdminDashboard() {
  const live = getLiveState();
  const pos = FULL_POS_DATA['25'] || [];
  const gpsFlags = lsg('gps_flags_' + today(), []);
  const shortVisits = lsg('vlog_' + today(), []).filter(v => v.flag === 'short');

  adminTechnicians = deriveAllTechnicians();
  const totalPOS = adminTechnicians.reduce((s, t) => s + t.total, 0);
  const donePOS = adminTechnicians.reduce((s, t) => s + t.done, 0);
  const completionPct = totalPOS ? Math.round(donePOS / totalPOS * 100) : 0;
  const behind = adminTechnicians.filter(t => t.overdue);
  const activeCount = adminTechnicians.filter(t => t.done > 0 && t.done < t.total).length;
  const flagsToday = gpsFlags.length + shortVisits.length;

  const kpiEl = document.getElementById('dash-kpis');
  if (kpiEl) kpiEl.innerHTML = `
    <div class="kpi-card"><div class="kpi-icon"><svg class="ic ic-lg"><use href="#ic-check-circle"/></svg></div><div class="kpi-val">${completionPct}%</div><div class="kpi-lbl">Plnění týmu — tento týden</div></div>
    <div class="kpi-card"><div class="kpi-icon"><svg class="ic ic-lg"><use href="#ic-team"/></svg></div><div class="kpi-val">${activeCount}</div><div class="kpi-lbl">Aktivní v terénu — dnes</div></div>
    <div class="kpi-card warn"><div class="kpi-icon"><svg class="ic ic-lg"><use href="#ic-warning"/></svg></div><div class="kpi-val">${behind.length}</div><div class="kpi-lbl">Technici pozadu — tento týden</div></div>
    <div class="kpi-card danger"><div class="kpi-icon"><svg class="ic ic-lg"><use href="#ic-flag"/></svg></div><div class="kpi-val">${flagsToday}</div><div class="kpi-lbl">Flagy — dnes</div></div>
    <div class="kpi-card"><div class="kpi-icon"><svg class="ic ic-lg"><use href="#ic-wrench"/></svg></div><div class="kpi-val">${live.servisOpen.length}</div><div class="kpi-lbl">Servisy otevřené — dnes</div></div>
    <div class="kpi-card"><div class="kpi-icon"><svg class="ic ic-lg"><use href="#ic-pin"/></svg></div><div class="kpi-val">${donePOS}/${totalPOS}</div><div class="kpi-lbl">POS navštíveno — tento týden (W25)</div></div>
  `;

  // Channel breakdown (IDT / KA / PETROL / CORN jsou oddělené kanály)
  const channels = ['IDT', 'KA', 'PETROL', 'CORN'];
  const chStats = channels.map(ch => {
    const list = pos.filter(p => p.typ === ch);
    const done = list.filter(p => p.v).length;
    return { ch, list, done, pct: list.length ? Math.round(done / list.length * 100) : 0 };
  });
  const chEl = document.getElementById('dash-channels');
  if (chEl) chEl.innerHTML = chStats.map(c => `
    <div class="ch-row">
      <div class="ch-name">${c.ch}</div>
      <div class="ch-bar-bg"><div class="ch-bar-fg" style="width:${c.pct}%"></div></div>
      <div class="ch-pct">${c.done}/${c.list.length}</div>
    </div>`).join('');

  // Leaderboard — top 3 / bottom 3 podle % plnění (tento týden)
  const ranked = adminTechnicians.filter(t => t.total).slice().sort((a, b) => (b.done / b.total) - (a.done / a.total));
  const top3 = ranked.slice(0, 3);
  const bottom3 = ranked.slice(-3).reverse();
  const lbRow = (t, rank) => {
    return `<div class="tr" onclick="showTechDetail('${t.name}')">
      <div class="tav rank">${rank}</div>
      <div class="tinf"><div class="tn">${t.name}</div><div class="ts">${t.done}/${t.total} POS</div></div>
      <div class="tr-right"><div class="mpp" style="font-weight:800;color:${t.pct >= 70 ? 'var(--green)' : t.pct < 30 ? 'var(--red)' : 'var(--muted)'}">${t.pct}%</div></div>
    </div>`;
  };
  const lbEl = document.getElementById('dash-leaderboard');
  if (lbEl) lbEl.innerHTML = `
    <div class="lb-col"><div class="lb-hdr"><svg class="ic ic-sm"><use href="#ic-trophy"/></svg> Nejlepší výkon — tento týden</div>${top3.map((t, i) => lbRow(t, i + 1)).join('')}</div>
    <div class="lb-col"><div class="lb-hdr"><svg class="ic ic-sm"><use href="#ic-arrow-down"/></svg> Vyžaduje pozornost — tento týden</div>${bottom3.map((t, i) => lbRow(t, i + 1)).join('')}</div>
  `;

  // AI insighty — syntetizované z reálných dat (bez nutnosti volat AI API)
  const avgPosPerTech = adminTechnicians.length ? Math.round(totalPOS / adminTechnicians.length) : 0;
  const bestChannel = chStats.filter(c => c.list.length).sort((a, b) => b.pct - a.pct)[0];
  const insights = [
    { icon: 'ic-route', title: 'Route efektivita', text: `Průměrně ${avgPosPerTech} POS na technika za týden, ${activeCount} týmů aktivně v terénu právě teď.` },
    { icon: 'ic-trophy', title: 'Nejlepší kanál', text: bestChannel ? `${bestChannel.ch} má nejvyšší plnění (${bestChannel.pct}%) ze všech kanálů tento týden.` : 'Data se počítají…' },
    { icon: 'ic-shield', title: 'Anti-fraud kontrola', text: flagsToday ? `${gpsFlags.length} GPS anomálií a ${shortVisits.length} podezřele krátkých návštěv dnes — doporučena kontrola.` : 'Žádné GPS anomálie ani podezřele krátké návštěvy dnes.' },
    { icon: 'ic-target', title: 'Predikce dokončení', text: `Při aktuálním tempu tým dokončí týden na ${completionPct}% — ${completionPct >= 70 ? 'na dobré cestě splnit normu.' : 'hrozí nesplnění normy, zvážit prioritizaci.'}` },
  ];
  const insEl = document.getElementById('dash-insights');
  if (insEl) insEl.innerHTML = insights.map(i => `
    <div class="insight-card"><div class="insight-icon"><svg class="ic"><use href="#${i.icon}"/></svg></div><div class="insight-body"><div class="insight-title">${i.title}</div><div class="insight-text">${i.text}</div></div></div>`).join('');

  // Attention feed — servisy, GPS flagy, krátké návštěvy, technici pozadu
  const attnItems = [];
  live.servisOpen.forEach(p => attnItems.push({ icon: 'ic-wrench', sev: 'red', text: `Servis čeká: <strong>${p.n}</strong>` }));
  gpsFlags.forEach(f => attnItems.push({ icon: 'ic-pin', sev: 'red', text: `GPS anomálie: <strong>${f.posName}</strong> · ${f.dist != null ? f.dist.toFixed(1) + 'km' : ''} od POS` }));
  shortVisits.forEach(v => attnItems.push({ icon: 'ic-clock', sev: 'orange', text: `Krátká návštěva: <strong>${v.posName}</strong> · ${v.dur} min` }));
  behind.forEach(t => attnItems.push({ icon: 'ic-warning', sev: 'orange', text: `<strong>${t.name}</strong> je pozadu — ${t.done}/${t.total} POS` }));

  const attnEl = document.getElementById('dash-attention');
  if (attnEl) {
    attnEl.innerHTML = attnItems.length
      ? attnItems.map(a => `<div class="attn-item attn-${a.sev}"><span class="attn-icon"><svg class="ic"><use href="#${a.icon}"/></svg></span><span>${a.text}</span></div>`).join('')
      : '<div class="empty"><div class="empty-i"><svg class="ic ic-xl"><use href="#ic-check-circle"/></svg></div><div class="empty-t">Žádné problémy</div><div class="empty-s">Vše běží podle plánu.</div></div>';
  }

  renderFleetRouteAnalytics();
}

// ══════════════════════════════════════════════════════
// ROUTE INTELLIGENCE — Velín analytika nad RouteEngine
// ══════════════════════════════════════════════════════
// Sestaví reálné denní trasy ze všech naplánovaných dní/týdnů — žádná
// vymyšlená čísla, jen agregace přes existující přiřazení POS->den.
// Trasy pro fleet route analytics — scoped jen na aktuální operativní týden
// (CURRENT_OPS_WEEK), aby čísla odpovídala labelu "tento týden" v dashboardu.
// Sumarizace přes všech 6 demo týdnů by KPI nadhodnotila (FIX SCOPE CONFUSION).
// Klíčováno per (technik, den) — jedna trasa = jeden technik v jeden den,
// nikdy POS více techniků sloučené do jedné fiktivní trasy.
function buildAllDailyRoutes() {
  const routes = {};
  const list = FULL_POS_DATA[CURRENT_OPS_WEEK] || [];
  const byTechDay = {};
  list.forEach(p => {
    if (p.d === null || p.d === undefined) return;
    const tech = p.assignedTechnician || 'Nepřiřazeno';
    const key = `${tech}|${p.d}`;
    (byTechDay[key] = byTechDay[key] || []).push(p);
  });
  Object.entries(byTechDay).forEach(([key, dayPos]) => {
    const [tech, day] = key.split('|');
    // Pokud technik svůj den ručně přeřadil, Velín musí porovnávat JEHO
    // reálné pořadí (ne pořadí z importu) — jinak je baseline fiktivní.
    const ordered = applyStoredRouteOrder(dayPos, CURRENT_OPS_WEEK, day);
    if (ordered.length > 1) routes[`${tech}_${CURRENT_OPS_WEEK}_${DAYS[day] || day}`] = ordered;
  });
  return routes;
}

function renderFleetRouteAnalytics() {
  const el = document.getElementById('dash-route-kpis');
  if (!el) return;
  const routes = buildAllDailyRoutes();
  const routeCount = Object.keys(routes).length;
  const heroBlock = document.getElementById('dash-hero-block');
  if (!routeCount) {
    el.innerHTML = '<div class="empty"><div class="empty-t">Žádné naplánované trasy k analýze</div></div>';
    if (heroBlock) heroBlock.style.display = 'none';
    return;
  }
  const fleet = RouteEngine.analyzeFleet(routes);
  el.innerHTML = `
    <div class="kpi-card"><div class="kpi-icon"><svg class="ic ic-lg"><use href="#ic-route"/></svg></div><div class="kpi-val">${routeCount}</div><div class="kpi-lbl">Analyzovaných tras</div></div>
    <div class="kpi-card warn"><div class="kpi-icon"><svg class="ic ic-lg"><use href="#ic-flag"/></svg></div><div class="kpi-val">${RouteEngine.formatKm(fleet.wastedKm)}</div><div class="kpi-lbl">Zbytečné km (suboptimální pořadí)</div></div>
    <div class="kpi-card warn"><div class="kpi-icon"><svg class="ic ic-lg"><use href="#ic-clock"/></svg></div><div class="kpi-val">${fleet.wastedHours.toFixed(1)} h</div><div class="kpi-lbl">Ztracené hodiny jízdy</div></div>
    <div class="kpi-card"><div class="kpi-icon"><svg class="ic ic-lg"><use href="#ic-target"/></svg></div><div class="kpi-val">${fleet.efficiencyScore}%</div><div class="kpi-lbl">Efficiency score</div></div>
    <div class="kpi-card"><div class="kpi-icon"><svg class="ic ic-lg"><use href="#ic-intel"/></svg></div><div class="kpi-val">${fleet.optimizationPotentialPct}%</div><div class="kpi-lbl">Potenciál optimalizace</div></div>
  `;
  renderPerTechnicianSavings(fleet);

  // Executive Hero KPIs — stejná kalkulace jako výše, jen prominentně nahoře
  // pro manažera: kolik kapacity je dnes "schované" v lepším plánování tras.
  const heroEl = document.getElementById('dash-hero-kpis');
  if (heroEl && heroBlock) {
    const avgVisitMin = 20; // konzervativní odhad doby na POS pro převod ušetřených hodin na kapacitu
    const extraPosCapacity = Math.floor((fleet.wastedHours * 60) / avgVisitMin);
    heroEl.innerHTML = `
      <div class="kpi-card warn"><div class="kpi-icon"><svg class="ic ic-lg"><use href="#ic-route"/></svg></div><div class="kpi-val">${RouteEngine.formatKm(fleet.wastedKm)}</div><div class="kpi-lbl">Potenciál optimalizace tras</div></div>
      <div class="kpi-card warn"><div class="kpi-icon"><svg class="ic ic-lg"><use href="#ic-clock"/></svg></div><div class="kpi-val">${fleet.wastedHours.toFixed(1)} h</div><div class="kpi-lbl">Hodiny k získání zpět</div></div>
      <div class="kpi-card"><div class="kpi-icon"><svg class="ic ic-lg"><use href="#ic-pin"/></svg></div><div class="kpi-val">+${extraPosCapacity}</div><div class="kpi-lbl">Dodatečná kapacita POS/týden</div></div>
    `;
    heroBlock.style.display = '';
  }
}

// ── Per-technik framing nad stejnou kalkulací (žádná samostatná čísla) ─────
// "Technik XY by dnes mohl ušetřit: 34 km / 42 minut." Pomáhá, nekontroluje.
function renderPerTechnicianSavings(fleet) {
  let el = document.getElementById('dash-tech-savings');
  if (!el) {
    const block = document.createElement('div');
    block.className = 'dash-block';
    block.innerHTML = `<div class="dash-block-t"><svg class="ic"><use href="#ic-target"/></svg> Úspora podle technika — pomáháme, nekontrolujeme</div><div class="cw" id="dash-tech-savings"></div>`;
    const anchor = document.getElementById('dash-route-kpis')?.closest('.dash-block');
    if (anchor) anchor.after(block);
    el = document.getElementById('dash-tech-savings');
  }
  if (!el) return;
  const routes = buildAllDailyRoutes();
  const entries = Object.entries(fleet.perTechnician || {})
    .filter(([, cmp]) => cmp.savedKm > 0.5)
    .sort((a, b) => b[1].savedKm - a[1].savedKm);
  if (!entries.length) {
    el.innerHTML = '<div class="empty"><div class="empty-t">Všechny trasy jsou už optimální</div></div>';
    return;
  }
  el.innerHTML = entries.map(([routeKey, cmp]) => {
    const dayPos = routes[routeKey] || [];
    const techName = dayPos[0]?.assignedTechnician || 'Neznámý technik';
    const parts = routeKey.split('_');
    const dayLbl = parts[parts.length - 1];
    const week = parts[parts.length - 2];
    return `<div class="tr" style="cursor:default">
      <div class="tn">${techName}</div>
      <div style="flex:1;font-size:12px;color:var(--muted)">W${week} · ${dayLbl} · ${cmp.before.posCount} POS</div>
      <div style="font-size:13px;font-weight:700;color:var(--teal)">Mohl by ušetřit ${RouteEngine.formatKm(cmp.savedKm)} · ${RouteEngine.formatHM(cmp.savedMin)}</div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════
// ADMIN — POS MANAGEMENT (POS Síť) — kompletní reálná POS síť
// ══════════════════════════════════════════════════════
let posNetFilters = { tech: 'all', region: 'all', channel: 'all', status: 'all' };
let posNetSearch = '';
function setPosNetSearch(val) {
  posNetSearch = (val || '').trim().toLowerCase();
  renderAdminPosNet();
}

function getAllPosFlat() {
  const out = [];
  for (const [week, list] of Object.entries(FULL_POS_DATA)) {
    list.forEach(p => out.push({ p, week }));
  }
  // De-dup by POS id — keep first occurrence (POS je v reálných datech jen v 1 týdnu)
  const seen = new Set();
  return out.filter(({ p }) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
}

function buildPosNetRows() {
  return getAllPosFlat().map(({ p, week }) => {
    const history = getVisitHistory(p.id);
    const isOverdue = getOverduePOS(week, FULL_POS_DATA).some(op => op.id === p.id);
    return { p, week, model: PosModel.toPosModel(p, { history, isOverdue }) };
  });
}

function renderAdminPosNet() {
  const rows = buildPosNetRows();
  const techs = [...new Set(rows.map(r => r.model.assignedTechnician))];
  const regions = [...new Set(rows.map(r => r.model.region))];
  const channels = [...new Set(rows.map(r => r.model.channel))];

  const techRow = document.getElementById('posnet-tech-row');
  if (techRow) techRow.innerHTML = ['all', ...techs].map(t =>
    `<button class="rfb ${posNetFilters.tech===t?'active':''}" onclick="setPosNetFilter('tech','${t}')">${t==='all'?'Všichni':t}</button>`).join('');
  const regionRow = document.getElementById('posnet-region-row');
  if (regionRow) regionRow.innerHTML = ['all', ...regions].map(r =>
    `<button class="rfb ${posNetFilters.region===r?'active':''}" onclick="setPosNetFilter('region','${r}')">${r==='all'?'Vše':r}</button>`).join('');
  const channelRow = document.getElementById('posnet-channel-row');
  if (channelRow) channelRow.innerHTML = ['all', ...channels].map(c =>
    `<button class="rfb ${posNetFilters.channel===c?'active':''}" onclick="setPosNetFilter('channel','${c}')">${c==='all'?'Vše':c}</button>`).join('');
  const statusRow = document.getElementById('posnet-status-row');
  const statusOpts = [
    ['all', 'Vše'], ['overdue', 'Po termínu'], ['notvisited30', `Nenavštíveno 30+ dní`],
    ['priority', 'Priorita (servis/urgentní)'], ['planned', 'Naplánováno'], ['unplanned', 'Bez plánu'], ['visited', 'Hotovo'],
  ];
  if (statusRow) statusRow.innerHTML = statusOpts.map(([code, lbl]) =>
    `<button class="rfb ${posNetFilters.status===code?'active':''}" onclick="setPosNetFilter('status','${code}')">${lbl}</button>`).join('');

  const filtered = rows.filter(({ p, model }) => {
    if (posNetSearch) {
      const terminalIds = (p.terminals || []).map(t => String(t.id).toLowerCase());
      const hay = [String(model.posId), model.posName, model.address, ...terminalIds].join(' ').toLowerCase();
      if (!hay.includes(posNetSearch)) return false;
    }
    if (posNetFilters.tech !== 'all' && model.assignedTechnician !== posNetFilters.tech) return false;
    if (posNetFilters.region !== 'all' && model.region !== posNetFilters.region) return false;
    if (posNetFilters.channel !== 'all' && model.channel !== posNetFilters.channel) return false;
    if (posNetFilters.status === 'overdue' && model.visitStatus !== 'overdue') return false;
    if (posNetFilters.status === 'notvisited30' && !(model.daysSinceLastVisit === null || model.daysSinceLastVisit > 30)) return false;
    if (posNetFilters.status === 'priority' && !(model.priority === 'service' || model.priority === 'priorityIssue')) return false;
    if (posNetFilters.status === 'planned' && model.visitStatus !== 'planned') return false;
    if (posNetFilters.status === 'unplanned' && model.visitStatus !== 'unplanned') return false;
    if (posNetFilters.status === 'visited' && model.visitStatus !== 'visited') return false;
    return true;
  });

  document.getElementById('posnet-count').textContent = `${filtered.length} / ${rows.length} POS`;

  const statusBadge = {
    visited: '<span class="tag t-done">✓ Hotovo</span>',
    overdue: '<span class="tag" style="background:var(--rl);color:var(--red)">Po termínu</span>',
    planned: '<span class="tag t-task">Naplánováno</span>',
    unplanned: '<span class="tag" style="background:var(--bg);color:var(--muted)">Bez plánu</span>',
  };

  const list = document.getElementById('adm-posnet-list');
  if (!list) return;
  if (!filtered.length) {
    list.innerHTML = '<div class="empty"><div class="empty-t">Žádné POS pro tento filtr</div></div>';
    return;
  }
  list.innerHTML = filtered.map(({ p, model }) => `
    <div class="tr" style="cursor:pointer" onclick="showAdminPOSDetail('${p.id}')">
      <div class="tn">${model.posName} <span style="font-weight:600;color:var(--muted);font-size:11px">#${model.posId}</span></div>
      <div style="flex:1;min-width:0;font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${model.address}</div>
      <div style="font-size:11px;font-weight:700;color:var(--td);flex-shrink:0">${model.channel}</div>
      <div style="font-size:11px;color:var(--muted);flex-shrink:0">${model.region}</div>
      <div style="font-size:11px;color:var(--muted);flex-shrink:0">${model.assignedTechnician}</div>
      <div style="font-size:11px;color:var(--muted);flex-shrink:0">${model.lastVisitDate ? model.daysSinceLastVisit + 'd zpět' : 'Nikdy'}</div>
      <div style="flex-shrink:0">${statusBadge[model.visitStatus] || ''}</div>
    </div>`).join('');
}

function setPosNetFilter(key, val) {
  posNetFilters[key] = val;
  renderAdminPosNet();
}

// ══════════════════════════════════════════════════════
// ADMIN — LIVE LIST (live data)
// ══════════════════════════════════════════════════════
function renderAdminLive() {
  const activePos = getActiveTechPos();
  adminTechnicians = deriveAllTechnicians();
  const live = getLiveState();

  const done = adminTechnicians.reduce((s, t) => s + t.done, 0);
  const behind = adminTechnicians.filter(t => t.overdue).length;
  const active = adminTechnicians.filter(t => t.done > 0 && t.done < t.total).length;
  document.getElementById('adm-active').textContent = active;
  document.getElementById('adm-done-n').textContent = done;
  document.getElementById('adm-behind').textContent = behind;
  document.getElementById('adm-svc-open').textContent = live.servisOpen.length;

  const filtered = activeRegion === 'all' ? adminTechnicians : adminTechnicians.filter(t => t.region === activeRegion);

  document.getElementById('adm-live-list').innerHTML = filtered.map(t => {
    const isLT = t.name === PosModel.SOLE_REAL_TECHNICIAN;
    const currentPosLabel = isLT && activePos ? ` · <span style="color:var(--teal);font-weight:700">● ${activePos.n.substring(0, 20)}…</span>`
      : t.currentPos ? ` · <span style="color:var(--teal);font-weight:700">● ${t.currentPos.n.substring(0, 20)}…</span>` : '';
    const badge = t.done === t.total ? '<span class="badge b-done">✓ Hotovo</span>'
      : t.overdue ? '<span class="badge b-beh">⚠ Pozadu</span>'
      : t.done > 0 ? '<span class="badge b-act">● Aktivní</span>'
      : '<span class="badge b-wait">○ Nezačal</span>';
    return `<div class="tr" onclick="showTechDetail('${t.name}')">
      <div class="tav ${t.overdue ? 'ov' : ''}" style="${isLT ? 'background:var(--teal);color:var(--navy)' : ''}">${t.initials}</div>
      <div class="tinf">
        <div class="tn">${t.name}${isLT ? ' <span style="font-size:9px;background:var(--teal);color:var(--navy);padding:1px 5px;border-radius:10px;font-weight:800">LIVE</span>' : ''}</div>
        <div class="ts">${t.activityLabel}${currentPosLabel}</div>
      </div>
      <div class="tr-right">
        <div class="mp"><div class="mpbg"><div class="mpf ${t.done === t.total ? 'gn' : t.overdue ? 'rd' : ''}" style="width:${t.pct}%"></div></div><div class="mpp">${t.pct}%</div></div>
        ${badge}
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════
// ADMIN — TECH DETAIL DRAWER
// ══════════════════════════════════════════════════════
function showTechDetail(name) {
  adminTechnicians = deriveAllTechnicians();
  const t = adminTechnicians.find(x => x.name === name);
  if (!t) return;
  const isLT = name === PosModel.SOLE_REAL_TECHNICIAN;
  const live = isLT ? getLiveState() : null;
  const pct = t.pct;

  // Build drawer content
  let html = `<div style="padding:20px 18px 32px">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
      <div class="tav" style="width:44px;height:44px;font-size:14px;background:${isLT?'var(--teal)':'var(--navy)'};color:${isLT?'var(--navy)':'var(--teal)'}">${t.initials}</div>
      <div>
        <div style="font-size:18px;font-weight:800">${t.name}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:2px">${t.activityLabel} · ${t.total} POS tento týden · ${pct}% splněno</div>
      </div>
    </div>`;

  // Traceability (PART 7) — odkud pochází přiřazení tohoto technika, žádné
  // "černá skříňka" čísla. Zdroj = DataProvider (baked export nebo reálně
  // nahraný soubor), týden = CURRENT_OPS_WEEK, počet POS = reálný součet z FULL_POS_DATA.
  const traceSrc = DataProvider.getSource();
  const traceSrcLabel = traceSrc ? (traceSrc.type === 'upload' ? `Nahraný soubor „${traceSrc.fileName}“` : `Tourplan export „${traceSrc.fileName}“`) : 'neznámý zdroj';
  html += `<div style="background:var(--bg);border:1px dashed var(--bd);border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:11.5px;color:var(--muted);line-height:1.6">
    <strong style="color:var(--ink)">Traceability:</strong> ${t.name} → Zdroj: ${traceSrcLabel} → Přiřazeno POS: ${t.total} → Týden: W${CURRENT_OPS_WEEK}
  </div>`;

  // Progress bar
  html += `<div style="background:var(--bg);border-radius:10px;padding:14px;margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:var(--muted);margin-bottom:8px">
      <span>W25 Progress</span><span style="color:${pct>70?'var(--green)':pct>40?'var(--orange)':'var(--red)'}">${t.done}/${t.total} POS</span>
    </div>
    <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:${pct>70?'var(--green)':'var(--teal)'};border-radius:4px;transition:width .5s"></div>
    </div>
  </div>`;

  if (isLT && live) {
    // Day timeline
    if (live.dayStart || live.visitLog.length) {
      html += `<div style="font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Dnešní průběh</div>
      <div style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.05);margin-bottom:14px">`;
      if (live.dayStart) html += `<div class="vrow start"><div class="vtime">▶ ${live.dayStart.time}</div><div class="vname" style="font-weight:700;color:var(--tm)">Začátek pracovní doby</div><div class="vdur"></div><div class="vflag"><span class="pdot dot-green"></span></div></div>`;
      live.visitLog.forEach(v => {
        html += `<div class="vrow ${v.flag==='short'?'short':''}"><div class="vtime">${v.inTime}</div><div class="vname">${v.posName.substring(0,28)}</div><div class="vdur">${v.dur}m</div><div class="vflag">${v.flag==='short'?'<svg class="ic ic-sm" style="color:var(--red)"><use href="#ic-flag"/></svg>':'✓'}</div></div>`;
      });
      const active = getActiveTechPos();
      if (active) html += `<div class="vrow" style="background:var(--tl)"><div class="vtime" style="color:var(--tm)">● Nyní</div><div class="vname" style="color:var(--tm);font-weight:700">${active.n.substring(0,28)}</div><div class="vdur" style="color:var(--tm)">live</div><div class="vflag"><svg class="ic ic-sm" style="color:var(--teal)"><use href="#ic-pin"/></svg></div></div>`;
      html += `</div>`;
    }

    // Supplies confirmed
    if (live.supplies.length) {
      html += `<div style="font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Potvrzené zásobování</div>
      <div style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.05);margin-bottom:14px">`;
      live.supplies.forEach(s => {
        const total = s.items.reduce((n, i) => n + i.qty, 0);
        html += `<div style="padding:10px 14px;border-bottom:1px solid var(--bg)">
          <div style="font-size:13px;font-weight:700">${s.posName}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">✓ Podepsáno: ${s.receiver} · ${s.at} · ${total} ks celkem</div>
        </div>`;
      });
      html += `</div>`;
    }

    // Completed POS
    if (live.completedPos.length) {
      html += `<div style="font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Dokončené POS (${live.completedPos.length})</div>
      <div style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.05);margin-bottom:14px">`;
      live.completedPos.forEach(p => {
        html += `<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--bg)">
          <span style="color:var(--green);font-weight:700">✓</span>
          <span style="font-size:13px;flex:1">${p.n}</span>
          <span style="font-size:11px;color:var(--muted)">${p.a.split(',')[1]||''}</span>
        </div>`;
      });
      html += `</div>`;
    }

    // Photos
    if (live.photos.length) {
      html += `<div style="font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Fotodokumentace (${live.photos.length})</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">`;
      live.photos.forEach(ph => {
        html += `<div style="aspect-ratio:1;border-radius:8px;overflow:hidden;position:relative">
          <img src="${ph.url}" style="width:100%;height:100%;object-fit:cover"/>
          <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.6);color:#fff;font-size:9px;font-weight:700;padding:3px 5px">${ph.slot}</div>
        </div>`;
      });
      html += `</div>`;
    }

    // Servis open
    if (live.servisOpen.length) {
      html += `<div style="font-size:11px;font-weight:800;color:var(--red);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Otevřené servisy (${live.servisOpen.length})</div>
      <div style="background:var(--rl);border-radius:10px;overflow:hidden;margin-bottom:14px">`;
      live.servisOpen.forEach(p => {
        const st = p.taskState.find(t => t.src === 'servis' && !t.done);
        html += `<div style="padding:10px 14px;border-bottom:1px solid rgba(204,34,0,.15)">
          <div style="font-size:13px;font-weight:700;color:var(--red)">${p.n}</div>
          <div style="font-size:11px;color:var(--red);opacity:.8;margin-top:2px">${st.text}</div>
        </div>`;
      });
      html += `</div>`;
    }

    // POS card notes
    if (live.posCardNotes.length) {
      html += `<div style="font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Záznamy z karet POS</div>
      <div style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.05);margin-bottom:14px">`;
      live.posCardNotes.forEach(pn => {
        pn.notes.forEach(n => {
          html += `<div style="padding:10px 14px;border-bottom:1px solid var(--bg)">
            <div style="font-size:10px;font-weight:700;color:var(--muted)">${pn.posName} · ${n.time}</div>
            <div style="font-size:13px;margin-top:3px">${n.text}</div>
          </div>`;
        });
      });
      html += `</div>`;
    }
  } else {
    // Demo technik — žádný localStorage live-log, jen jeho přiřazená POS
    // (tento týden), surfacovaná přes existující PosModel — žádná nová logika.
    const week25Pos = t.pos.filter(p => p.d !== null && p.d !== undefined);
    if (week25Pos.length) {
      html += `<div style="font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">POS tento týden (${week25Pos.length})</div>
      <div style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.05);margin-bottom:14px">`;
      week25Pos.slice().sort((a,b)=>(a.d-b.d)).forEach(p => {
        const m = PosModel.toPosModel(p, { isOverdue: !p.v && p.d < getTodayDayIdx() });
        html += `<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--bg)">
          <span style="color:${p.v?'var(--green)':'var(--muted)'};font-weight:700">${p.v?'✓':'○'}</span>
          <span style="font-size:13px;flex:1">${m.posName}</span>
          <span style="font-size:11px;color:var(--muted)">${DAYS[p.d]||''} · ${m.priorityLabel}</span>
        </div>`;
      });
      html += `</div>`;
    }
  }

  html += `<button onclick="closeTechDrawer()" style="width:100%;padding:13px;border:1px solid var(--border);border-radius:10px;background:transparent;font-size:14px;cursor:pointer;color:var(--muted)">Zavřít</button></div>`;

  // Show drawer
  let drawer = document.getElementById('tech-drawer');
  if (!drawer) {
    drawer = document.createElement('div');
    drawer.id = 'tech-drawer';
    drawer.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:600;display:flex;align-items:flex-end;justify-content:center';
    drawer.innerHTML = `<div id="tech-drawer-sheet" style="background:#fff;border-radius:20px 20px 0 0;width:100%;max-width:430px;max-height:85vh;overflow-y:auto"><div style="width:40px;height:4px;background:var(--border);border-radius:2px;margin:16px auto 0"></div></div>`;
    document.body.appendChild(drawer);
    drawer.onclick = e => { if (e.target === drawer) closeTechDrawer(); };
  }
  document.getElementById('tech-drawer-sheet').innerHTML = `<div style="width:40px;height:4px;background:var(--border);border-radius:2px;margin:16px auto 0"></div>` + html;
  drawer.style.display = 'flex';
}

function closeTechDrawer() {
  const d = document.getElementById('tech-drawer');
  if (d) d.style.display = 'none';
}

// ══════════════════════════════════════════════════════
// ADMIN — ALERTS (live)
// ══════════════════════════════════════════════════════
function renderAdminAlerts() {
  const live = getLiveState();
  const alerts = [];

  // Live alerts from technik actions
  live.servisOpen.forEach(p => {
    const st = p.taskState.find(t => t.src === 'servis' && !t.done);
    alerts.push({ t: 'red', i: 'ic-wrench', title: `Servis — ${p.n}`, sub: st.text + (st.note ? ' · ' + st.note : ''), tm: 'Live' });
  });
  live.shortVisits.forEach(v => {
    alerts.push({ t: 'orange', i: 'ic-clock', title: `Krátká návštěva — ${v.posName}`, sub: `Lán Tomáš · ${v.inTime}–${v.outTime} · ${v.dur} min · zkontroluj`, tm: 'Dnes' });
  });
  if (live.supplies.length === 0 && live.visitLog.length > 2) {
    alerts.push({ t: 'orange', i: 'ic-box', title: 'Zásobování bez podpisu', sub: 'Lán Tomáš · Žádné zásobování nebylo potvrzeno podpisem', tm: 'Dnes' });
  }

  // Týmové alerty — odvozeno z reálných POS přiřazení (FULL_POS_DATA), žádná
  // vymyšlená čísla. Pozadu = isOverdue (technicianModel), výborný výkon = pct.
  const teamTechs = deriveAllTechnicians();
  teamTechs.filter(t => t.overdue).slice(0, 4).forEach(t => {
    alerts.push({ t: 'orange', i: 'ic-warning', title: `${t.name} — ${t.done}/${t.total} POS`, sub: `Progress ${t.pct}% · W${CURRENT_OPS_WEEK} · Výrazně pozadu`, tm: `W${CURRENT_OPS_WEEK}` });
  });
  teamTechs.filter(t => !t.overdue && t.total > 0 && t.pct >= 90).slice(0, 2).forEach(t => {
    alerts.push({ t: 'green', i: 'ic-check-circle', title: `${t.name} — ${t.done}/${t.total} POS`, sub: `Progress ${t.pct}% · W${CURRENT_OPS_WEEK} · Výborný výkon`, tm: `W${CURRENT_OPS_WEEK}` });
  });

  // Supplied confirmed — positive alert
  live.supplies.forEach(s => {
    alerts.push({ t: 'green', i: 'ic-edit', title: `Zásobování potvrzeno — ${s.posName}`, sub: `Podepsal: ${s.receiver} · ${s.at} · Lán Tomáš`, tm: 'Dnes' });
  });

  document.getElementById('adm-alerts-list').innerHTML = alerts.map(a => `
    <div class="alert-row ${a.t}">
      <div class="ar-ico"><svg class="ic"><use href="#${a.i}"/></svg></div>
      <div class="ar-inf"><div class="ar-t">${a.title}</div><div class="ar-s">${a.sub}</div></div>
      <div class="ar-tm">${a.tm}</div>
    </div>`).join('');
}

// ══════════════════════════════════════════════════════
// ADMIN — ČASY (live)
// ══════════════════════════════════════════════════════
function renderAdminCasy() {
  const live = getLiveState();
  // Reálný check-in log technika (Lán Tomáš) — žádný demo/mock fallback.
  // Pokud dnes ještě nemá check-iny, zobrazí se prázdný stav, ne vymyšlená data.
  const log = live.visitLog.slice(0, 12);
  const shorts = log.filter(v => v.flag === 'short').length;
  const avgDur = log.length ? Math.round(log.reduce((s, v) => s + v.dur, 0) / log.length) : 0;
  const avgByChannel = (ch) => {
    const list = log.filter(v => v.typ === ch);
    return list.length ? Math.round(list.reduce((s, v) => s + v.dur, 0) / list.length) + 'm' : '—';
  };

  // Update stats — reálný přepočet z dnešního visit logu, žádné natvrdo
  // zapsané hodnoty (žádný "Lán Tomáš nemá dnes IDT" = vymyšlené číslo).
  document.getElementById('adm-shorts').textContent = shorts;
  const idtEl = document.getElementById('adm-avg-idt'); if (idtEl) idtEl.textContent = avgByChannel('IDT');
  const kaEl = document.getElementById('adm-avg-ka'); if (kaEl) kaEl.textContent = avgByChannel('KA');
  const visitEl = document.getElementById('adm-avg-visit'); if (visitEl) visitEl.textContent = log.length ? avgDur + 'm' : '—';

  const el = document.getElementById('adm-casy-list'); if (!el) return;
  const ds = live.dayStart;
  const active = getActiveTechPos();

  if (!ds && !log.length) {
    el.innerHTML = '<div class="empty"><div class="empty-t">Zatím žádné check-iny dnes</div></div>';
    return;
  }

  let html = ds ? `<div class="vrow start"><div class="vtime">▶ ${ds.time}</div><div class="vname" style="font-weight:700;color:var(--tm)">Začátek pracovní doby · první check-in</div><div class="vdur"></div><div class="vflag"><span class="pdot dot-green"></span></div></div>` : '';

  log.forEach(v => {
    const flagIcon = v.flag === 'short' ? '<svg class="ic ic-sm" style="color:var(--red)"><use href="#ic-flag"/></svg>' : v.flag === 'long' ? '<svg class="ic ic-sm" style="color:var(--orange)"><use href="#ic-warning"/></svg>' : '✓';
    html += `<div class="vrow ${v.flag === 'short' ? 'short' : v.flag === 'long' ? 'long' : ''}">
      <div class="vtime">${v.inTime}</div>
      <div class="vname">${(v.posName || '').substring(0, 30)} <span style="font-size:10px;color:var(--muted)">${v.typ || ''}</span></div>
      <div class="vdur">${v.dur}m</div>
      <div class="vflag">${flagIcon}</div>
    </div>`;
  });

  if (active) {
    const ci = lsg('ci_' + active.id);
    const elapsed = ci ? Math.floor((Date.now() - ci.inTs) / 60000) : '?';
    html += `<div class="vrow" style="background:var(--tl)"><div class="vtime" style="color:var(--tm)">● Nyní</div><div class="vname" style="color:var(--tm);font-weight:700">${active.n.substring(0, 28)} <span style="font-size:10px">CHECK-IN</span></div><div class="vdur" style="color:var(--tm)">${elapsed}m+</div><div class="vflag"><svg class="ic ic-sm" style="color:var(--teal)"><use href="#ic-pin"/></svg></div></div>`;
  }

  el.innerHTML = html;
}

// ══════════════════════════════════════════════════════
// ADMIN — FOTO (live)
// ══════════════════════════════════════════════════════
function renderAdminFoto() {
  const live = getLiveState();
  const grid = document.getElementById('foto-grid'); if (!grid) return;
  const infoBox = grid.nextElementSibling;

  if (live.photos.length) {
    grid.innerHTML = live.photos.map(ph => `
      <div style="aspect-ratio:1;border-radius:8px;overflow:hidden;position:relative;background:#222">
        <img src="${ph.url}" style="width:100%;height:100%;object-fit:cover"/>
        <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.7);color:#fff;font-size:9px;font-weight:700;padding:3px 5px;line-height:1.3">${ph.posName.substring(0,18)}<br>${ph.slot}</div>
      </div>`).join('');
    if (infoBox) infoBox.style.display = 'none';
  } else {
    grid.innerHTML = '';
    if (infoBox) infoBox.style.display = 'block';
  }
}

// ══════════════════════════════════════════════════════
// PATCH enterRole — start admin refresh
// ══════════════════════════════════════════════════════
const _origEnterRole = enterRole;
enterRole = function(role, opts) {
  _origEnterRole(role, opts);
  if (role === 'admin') startAdminRefresh();
};

// ══════════════════════════════════════════════════════
// PATCH markVisited — notify admin live
// ══════════════════════════════════════════════════════
const _origMarkVisited = markVisited;
markVisited = function() {
  _origMarkVisited();
  // Auto-checkout if checked in
  const p = posData[cWeek][cIdx];
  if (p && p.v) {
    const ci = lsg('ci_' + p.id);
    if (ci && !ci.out) doCheckout();
  }
};



// ══════════════════════════════════════════════════════
// ADMIN TASK STORAGE
// ══════════════════════════════════════════════════════
function getAdminTasks() { return lsg('admin_tasks', []); }
function saveAdminTask(task) {
  const tasks = getAdminTasks();
  tasks.unshift({ ...task, id: 'AT_' + Date.now(), createdAt: new Date().toLocaleString('cs-CZ'), status: 'active' });
  lss('admin_tasks', tasks);
  // Inject into posData for technik to see
  injectAdminTasksIntoPosData();
}
function injectAdminTasksIntoPosData() {
  const tasks = getAdminTasks().filter(t => t.status === 'active');
  tasks.forEach(task => {
    // Find matching POS
    Object.values(posData).forEach(weekList => {
      weekList.forEach(p => {
        const match = taskMatchesPos(task, p);
        if (!match) return;
        // Don't duplicate
        const exists = p.taskState.find(t => t.adminTaskId === task.id);
        if (exists) return;
        p.taskState.push({
          text: task.text,
          src: 'on_top',
          done: false,
          adminTaskId: task.id,
          note: task.deadline ? `Deadline: ${task.deadline}` : undefined,
          priority: task.priority,
        });
      });
    });
  });
}
function taskMatchesPos(task, p) {
  if (task.target === 'group') {
    if (task.groups.includes('all')) return true;
    if (task.groups.includes('IDT') && p.typ === 'IDT') return true;
    if (task.groups.includes('PETROL') && p.typ === 'PETROL') return true;
    if (task.groups.includes('KA') && p.typ === 'KA') return true;
    if (p.partner && task.groups.includes(p.partner)) return true;
    return false;
  }
  if (task.target === 'technik') return task.technikName === 'Lán Tomáš'; // demo: LT only
  if (task.target === 'pos') return p.id === task.posId;
  return false;
}

// ══════════════════════════════════════════════════════
// EDITORIAL MODAL
// ══════════════════════════════════════════════════════
let editModalMode = 'group';
let editGroupSel = [];
let editPriority = 'normal';

function openEditModal(mode) {
  editModalMode = mode;
  editGroupSel = [];
  editPriority = 'normal';
  const titles = { group: 'Úkol pro skupinu POS', technik: 'Úkol pro technika', pos: 'Úkol pro konkrétní POS' };
  document.getElementById('edit-modal-title').textContent = titles[mode];
  renderEditModalBody(mode);
  document.getElementById('edit-modal').classList.add('open');
}
function closeEditModal() { document.getElementById('edit-modal').classList.remove('open'); }

function renderEditModalBody(mode) {
  let html = '';

  if (mode === 'group') {
    html += `<label class="ef-label">Skupina POS</label>
    <div class="ef-chips" id="ef-groups">
      <div class="ef-chip on" onclick="toggleGroup('all',this)">Všechny POS</div>
      <div class="ef-chip" onclick="toggleGroup('IDT',this)">IDT</div>
      <div class="ef-chip" onclick="toggleGroup('PETROL',this)">PETROL</div>
      <div class="ef-chip" onclick="toggleGroup('KA',this)">★ KA Partneři</div>
      <div class="ef-chip" onclick="toggleGroup('CORN',this)">Corn</div>
      <div class="ef-chip" onclick="toggleGroup('Albert',this)">Albert</div>
      <div class="ef-chip" onclick="toggleGroup('Tesco',this)">Tesco</div>
      <div class="ef-chip" onclick="toggleGroup('Shell',this)">Shell</div>
      <div class="ef-chip" onclick="toggleGroup('Benzina',this)">Benzina</div>
    </div>`;
    editGroupSel = ['all'];

    html += `<label class="ef-label">Region (volitelné)</label>
    <div class="ef-chips">
      <div class="ef-chip on" onclick="toggleRegionFilter('all',this)">Celá ČR</div>
      <div class="ef-chip" onclick="toggleRegionFilter('RSA',this)">RSA</div>
      <div class="ef-chip" onclick="toggleRegionFilter('RSB',this)">RSB</div>
      <div class="ef-chip" onclick="toggleRegionFilter('RSC',this)">RSC</div>
      <div class="ef-chip" onclick="toggleRegionFilter('RSD',this)">RSD</div>
      <div class="ef-chip" onclick="toggleRegionFilter('RSE',this)">RSE</div>
      <div class="ef-chip" onclick="toggleRegionFilter('RSG',this)">RSG</div>
    </div>`;
  }

  if (mode === 'technik') {
    html += `<label class="ef-label">Technik</label>
    <select class="ef-select" id="ef-technik">
      ${TECHNICIAN_NAMES.map(n => `<option value="${n}">${n}</option>`).join('')}
    </select>`;
  }

  if (mode === 'pos') {
    const allPos = FULL_POS_DATA['25'] || [];
    html += `<label class="ef-label">Vyhledat POS</label>
    <input class="ef-input" id="ef-pos-search" type="text" placeholder="Název nebo ID provozovny…" oninput="filterPosList(this.value)" />
    <div id="ef-pos-list" style="margin-top:8px;max-height:150px;overflow-y:auto;border:1.5px solid var(--border);border-radius:8px">
      ${allPos.slice(0,8).map(p => `<div class="task-feed-item" style="cursor:pointer" onclick="selectPos('${p.id}','${p.n.replace(/'/g,"\\'")}',this)">
        <div class="tfi-body"><div class="tfi-title">${p.n}</div><div class="tfi-sub">${p.a}</div></div>
        <div style="font-size:10px;color:var(--muted)">${p.typ}</div>
      </div>`).join('')}
    </div>
    <div id="ef-pos-selected" style="display:none;margin-top:6px;padding:8px 12px;background:var(--tl);border-radius:8px;font-size:13px;font-weight:700;color:var(--tm)"></div>`;
  }

  html += `<label class="ef-label">Úkol</label>
  <textarea class="ef-textarea" id="ef-task-text" placeholder="Co mají technici udělat…"></textarea>

  <label class="ef-label">Priorita</label>
  <div class="ef-chips" id="ef-priority">
    <div class="ef-chip" onclick="setPriority('servis',this)" style="background:var(--rl);color:var(--red);border-color:var(--red)"><span class="pdot dot-red" style="display:inline-block;margin-right:3px"></span>Servis / Urgentní</div>
    <div class="ef-chip on orange" onclick="setPriority('high',this)"><span class="pdot dot-orange" style="display:inline-block;margin-right:3px"></span>Vysoká</div>
    <div class="ef-chip" onclick="setPriority('normal',this)"><span class="pdot dot-yellow" style="display:inline-block;margin-right:3px"></span>Standardní</div>
  </div>

  <div class="ef-row" style="margin-top:14px">
    <div>
      <label class="ef-label" style="margin-top:0">Deadline</label>
      <input class="ef-input" id="ef-deadline" type="date" />
    </div>
    <div>
      <label class="ef-label" style="margin-top:0">Počet POS</label>
      <div style="padding:10px 12px;background:var(--bg);border-radius:8px;font-size:14px;font-weight:700;color:var(--navy)" id="ef-pos-count">—</div>
    </div>
  </div>

  <label class="ef-label">Poznámka pro technika</label>
  <textarea class="ef-textarea" id="ef-note" placeholder="Volitelná poznámka…" style="min-height:50px"></textarea>`;

  document.getElementById('edit-modal-body').innerHTML = html;

  // Set default deadline to next Monday
  const nextMon = new Date();
  nextMon.setDate(nextMon.getDate() + (8 - nextMon.getDay()) % 7 || 7);
  const dl = document.getElementById('ef-deadline');
  if (dl) dl.value = nextMon.toISOString().split('T')[0];

  updatePosCount();
}

let editRegionFilter = 'all';
let editPosSel = null;

function toggleGroup(g, btn) {
  if (g === 'all') {
    editGroupSel = ['all'];
    document.querySelectorAll('#ef-groups .ef-chip').forEach(c => c.classList.remove('on'));
    btn.classList.add('on');
  } else {
    editGroupSel = editGroupSel.filter(x => x !== 'all');
    document.querySelector('#ef-groups .ef-chip:first-child').classList.remove('on');
    if (editGroupSel.includes(g)) {
      editGroupSel = editGroupSel.filter(x => x !== g);
      btn.classList.remove('on');
    } else {
      editGroupSel.push(g);
      btn.classList.add('on');
    }
    if (!editGroupSel.length) { editGroupSel = ['all']; document.querySelector('#ef-groups .ef-chip:first-child').classList.add('on'); }
  }
  updatePosCount();
}
function toggleRegionFilter(r, btn) {
  editRegionFilter = r;
  document.querySelectorAll('.ef-chips .ef-chip').forEach(c => { if (c.textContent.includes('ČR') || ['RSA','RSB','RSC','RSD','RSE','RSG'].includes(c.textContent)) c.classList.remove('on'); });
  btn.classList.add('on');
  updatePosCount();
}
function setPriority(p, btn) {
  editPriority = p;
  document.querySelectorAll('#ef-priority .ef-chip').forEach(c => c.classList.remove('on'));
  btn.classList.add('on');
}
function updatePosCount() {
  const el = document.getElementById('ef-pos-count'); if (!el) return;
  if (editModalMode === 'pos') { el.textContent = '1 POS'; return; }
  if (editModalMode === 'technik') {
    const techName = document.getElementById('ef-technik')?.value;
    const count = (FULL_POS_DATA[CURRENT_OPS_WEEK] || []).filter(p => p.assignedTechnician === techName).length;
    el.textContent = `${count} POS`;
    return;
  }
  const all = Object.values(posData).flat();
  const count = all.filter(p => {
    const regionOk = editRegionFilter === 'all' || p.area === editRegionFilter;
    const groupOk = editGroupSel.includes('all') || editGroupSel.includes(p.typ) || editGroupSel.includes(p.partner);
    return regionOk && groupOk;
  }).length;
  el.textContent = count + ' POS';
}
function filterPosList(q) {
  const all = FULL_POS_DATA['25'] || [];
  // POS ID je hlavní identifikátor — shody podle ID se zobrazí dřív než shody podle názvu.
  let filtered;
  if (q) {
    const ql = q.toLowerCase();
    const idMatches = all.filter(p => p.id.includes(q));
    const nameMatches = all.filter(p => !p.id.includes(q) && p.n.toLowerCase().includes(ql));
    filtered = idMatches.concat(nameMatches).slice(0, 8);
  } else {
    filtered = all.slice(0, 8);
  }
  document.getElementById('ef-pos-list').innerHTML = filtered.map(p => `<div class="task-feed-item" style="cursor:pointer" onclick="selectPos('${p.id}','${p.n.replace(/'/g,"\\'")}',this)">
    <div class="tfi-body"><div class="tfi-title">${p.n}</div><div class="tfi-sub">${p.a}</div></div>
  </div>`).join('');
}
function selectPos(id, name, el) {
  editPosSel = id;
  document.querySelectorAll('#ef-pos-list .task-feed-item').forEach(x => x.style.background = '');
  el.style.background = 'var(--tl)';
  const sel = document.getElementById('ef-pos-selected');
  sel.textContent = '✓ Vybrána: ' + name;
  sel.style.display = 'block';
}
function saveEditTask() {
  const text = document.getElementById('ef-task-text').value.trim();
  if (!text) { alert('Zadej text úkolu.'); return; }
  const deadline = document.getElementById('ef-deadline').value;
  const note = document.getElementById('ef-note').value.trim();
  const task = {
    text, deadline, note, priority: editPriority, target: editModalMode,
    groups: editModalMode === 'group' ? editGroupSel : [],
    region: editRegionFilter,
    technikName: editModalMode === 'technik' ? document.getElementById('ef-technik')?.value : null,
    posId: editModalMode === 'pos' ? editPosSel : null,
  };
  if (editModalMode === 'pos' && !editPosSel) { alert('Vyber konkrétní POS.'); return; }
  saveAdminTask(task);
  closeEditModal();
  renderTaskFeed();
  // Show confirm
  const btn = document.querySelector('.ef-btn-save');
  if (btn) { btn.textContent = '✓ Uloženo!'; setTimeout(() => { btn.textContent = 'Uložit a rozeslat'; }, 2000); }
}

// ══════════════════════════════════════════════════════
// TASK FEED
// ══════════════════════════════════════════════════════
function renderTaskFeed() {
  const tasks = getAdminTasks();
  const el = document.getElementById('task-feed'); if (!el) return;
  if (!tasks.length) {
    el.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">Žádné aktivní úkoly.<br>Klikni "+ Nový úkol" pro zadání.</div>';
    return;
  }
  el.innerHTML = tasks.map(t => {
    const priDot = t.priority === 'servis' ? 'dot-red' : t.priority === 'high' ? 'dot-orange' : 'dot-yellow';
    const targetLabel = t.target === 'group' ? `Skupina: ${t.groups.join(', ')}${t.region !== 'all' ? ' · ' + t.region : ''}` : t.target === 'technik' ? `Technik: ${t.technikName}` : `POS: ${t.posId}`;
    const dlLabel = t.deadline ? `· Deadline: ${t.deadline}` : '';
    return `<div class="task-feed-item">
      <div class="tfi-icon"><span class="pdot ${priDot}"></span></div>
      <div class="tfi-body">
        <div class="tfi-title">${t.text}</div>
        <div class="tfi-sub">${targetLabel} ${dlLabel}</div>
        <div class="tfi-meta">
          <span style="font-size:10px;color:var(--muted)">${t.createdAt}</span>
          <span class="approval-badge appr-ok">✓ Aktivní</span>
        </div>
      </div>
      <button onclick="deleteAdminTask('${t.id}')" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:4px;flex-shrink:0">✕</button>
    </div>`;
  }).join('');
}
function deleteAdminTask(id) {
  const tasks = getAdminTasks().map(t => t.id === id ? { ...t, status: 'deleted' } : t);
  lss('admin_tasks', tasks);
  // Remove from posData
  Object.values(posData).forEach(weekList => {
    weekList.forEach(p => { p.taskState = p.taskState.filter(t => t.adminTaskId !== id); });
  });
  renderTaskFeed();
}

// ══════════════════════════════════════════════════════
// SCHVÁLENÍ NÁVŠTĚV
// ══════════════════════════════════════════════════════
function renderSchvaleni() {
  const live = getLiveState();
  const el = document.getElementById('schvaleni-list'); if (!el) return;

  // Build approval items from completed POS
  const items = [];

  // Real completed POS
  live.completedPos.forEach(p => {
    const ci = lsg('ci_' + p.id);
    const supply = lsg('supply_' + p.id + '_' + today());
    const photos = p.photos.length;
    const shortVisit = live.visitLog.find(v => v.posId === p.id && v.flag === 'short');
    const approval = lsg('approval_' + p.id);
    items.push({ p, ci, supply, photos, shortVisit, approval, isReal: true });
  });

  const waiting = items.filter(x => !x.approval).length;
  const countEl = document.getElementById('schvaleni-count');
  if (countEl) countEl.textContent = waiting + ' čeká';

  let html = '';

  // Real items
  items.forEach(({ p, ci, supply, photos, shortVisit, approval }) => {
    const apprBadge = approval === 'ok' ? '<span class="approval-badge appr-ok">✓ Schváleno</span>' : approval === 'rej' ? '<span class="approval-badge appr-rej">✕ Zamítnuto</span>' : '<span class="approval-badge appr-wait"><svg class="ic ic-sm"><use href="#ic-clock"/></svg> Čeká</span>';
    const flags = [];
    if (shortVisit) flags.push('<svg class="ic ic-sm"><use href="#ic-warning"/></svg> Krátká návštěva');
    if (!photos) flags.push('<svg class="ic ic-sm"><use href="#ic-camera"/></svg> Bez fotek');
    if (!supply && (p.typ === 'KA' || p.typ === 'PETROL')) flags.push('<svg class="ic ic-sm"><use href="#ic-box"/></svg> Bez zásobování');
    html += `<div style="padding:14px;border-bottom:1px solid var(--bg)">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px">
        <div>
          <div style="font-size:13px;font-weight:700">${p.n}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">${ci ? ci.inTime + '–' + ci.outTime + ' · ' + ci.dur + ' min' : 'Bez check-inu'} · ${photos} fotek · ${p.typ}</div>
          ${flags.length ? `<div style="margin-top:5px">${flags.map(f => `<span style="font-size:10px;font-weight:700;background:var(--ol);color:var(--orange);padding:2px 6px;border-radius:10px;margin-right:4px">${f}</span>`).join('')}</div>` : ''}
        </div>
        ${apprBadge}
      </div>
      ${!approval ? `<div style="display:flex;gap:8px">
        <button onclick="approveVisit('${p.id}','ok')" style="flex:1;padding:9px;background:var(--gl);color:var(--green);border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">✓ Schválit</button>
        <button onclick="approveVisit('${p.id}','rej')" style="flex:1;padding:9px;background:var(--rl);color:var(--red);border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">✕ Zamítnout</button>
      </div>` : ''}
    </div>`;
  });

  el.innerHTML = html || '<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">Žádné návštěvy ke schválení.</div>';
}

function approveVisit(posId, decision) {
  lss('approval_' + posId, decision);
  renderSchvaleni();
}

// ══════════════════════════════════════════════════════
// PATCH showAdmPage — render new pages
// ══════════════════════════════════════════════════════
const __origShowAdmPage2 = showAdmPage;
showAdmPage = function(p, btn) {
  __origShowAdmPage2(p, btn);
  if (p === 'redakce') { renderTaskFeed(); injectAdminTasksIntoPosData(); }
  if (p === 'schvaleni') renderSchvaleni();
};

// ══════════════════════════════════════════════════════
// INIT — inject saved tasks on load
// ══════════════════════════════════════════════════════
injectAdminTasksIntoPosData();


// ══════════════════════════════════════════════════════════════════════════
// GPS VERIFICATION
// ══════════════════════════════════════════════════════════════════════════
function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2-lat1)*Math.PI/180;
  const dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)*Math.sin(dLat/2) +
    Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*
    Math.sin(dLon/2)*Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function verifyGPS(posLat, posLng, callback) {
  const el = document.getElementById('gps-status');
  if (!navigator.geolocation) {
    if (el) el.innerHTML = '<span class="gps-badge gps-warn"><svg class="ic ic-sm"><use href="#ic-warning"/></svg> GPS nedostupná</span>';
    callback(null, null, null);
    return;
  }
  if (el) el.innerHTML = '<span class="gps-badge gps-loading"><svg class="ic ic-sm"><use href="#ic-signal"/></svg> Zjišťuji polohu…</span>';
  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const dist = posLat && posLng ? getDistanceKm(lat, lng, posLat, posLng) : null;
      if (el) {
        if (dist === null) {
          el.innerHTML = `<span class="gps-badge gps-ok">✓ GPS OK · ${lat.toFixed(4)}, ${lng.toFixed(4)}</span>`;
        } else if (dist < 0.3) {
          el.innerHTML = `<span class="gps-badge gps-ok">✓ Na místě · ${Math.round(dist*1000)}m od POS</span>`;
        } else if (dist < 1) {
          el.innerHTML = `<span class="gps-badge gps-warn"><svg class="ic ic-sm"><use href="#ic-warning"/></svg> ${Math.round(dist*1000)}m od POS</span>`;
        } else {
          el.innerHTML = `<span class="gps-badge gps-err"><svg class="ic ic-sm"><use href="#ic-flag"/></svg> ${dist.toFixed(1)}km od POS — podezřelé!</span>`;
        }
      }
      callback(lat, lng, dist);
    },
    err => {
      if (el) el.innerHTML = '<span class="gps-badge gps-warn"><svg class="ic ic-sm"><use href="#ic-warning"/></svg> GPS zamítnuta</span>';
      callback(null, null, null);
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

// ── Patch doCheckin with GPS ──────────────────────────────────────────────
const _origDoCheckin = doCheckin;
doCheckin = function() {
  const p = posData[cWeek][cIdx];
  const posLat = p.lat || null;
  const posLng = p.lng || null;
  verifyGPS(posLat, posLng, (lat, lng, dist) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('cs-CZ',{hour:'2-digit',minute:'2-digit'});
    const gpsFlag = dist !== null && dist > 1;
    lss('ci_' + p.id, {
      inTs: now.getTime(), inTime: timeStr, out: false,
      gpsLat: lat, gpsLng: lng, gpsDist: dist,
      gpsFlag: gpsFlag
    });
    if (!lsg('daystart_' + today())) {
      lss('daystart_' + today(), {ts: now.getTime(), time: timeStr, posId: p.id, posName: p.n});
    }
    // Log GPS flag for admin
    if (gpsFlag) {
      const flags = lsg('gps_flags_' + today(), []);
      flags.push({posId: p.id, posName: p.n, time: timeStr, dist: dist, lat, lng});
      lss('gps_flags_' + today(), flags);
    }
    renderCheckin();
  });
};

// ── Show GPS in check-in ──────────────────────────────────────────────────
const _origRenderCheckin = renderCheckin;
renderCheckin = function() {
  _origRenderCheckin();
  const p = posData[cWeek][cIdx];
  const ci = lsg('ci_' + p.id);
  if (ci && ci.gpsDist !== undefined && ci.gpsDist !== null) {
    const el = document.getElementById('gps-status');
    if (el) {
      const dist = ci.gpsDist;
      const cls = dist < 0.3 ? 'gps-ok' : dist < 1 ? 'gps-warn' : 'gps-err';
      const icon = dist < 0.3 ? '✓' : dist < 1 ? '<svg class="ic ic-sm"><use href="#ic-warning"/></svg>' : '<svg class="ic ic-sm"><use href="#ic-flag"/></svg>';
      el.innerHTML = `<span class="gps-badge ${cls}">${icon} ${dist < 1 ? Math.round(dist*1000)+'m' : dist.toFixed(1)+'km'} od POS · ${ci.inTime}</span>`;
    }
  }
};

// ══════════════════════════════════════════════════════════════════════════
// AI BRIEFING (Claude API)
// ══════════════════════════════════════════════════════════════════════════
async function generateAIBriefing() {
  const pos = posData['25'] || [];
  const done = pos.filter(p => p.v).length;
  const svc = pos.filter(p => p.taskState.some(t => t.src==='servis'&&!t.done));
  const adminMsg = lsg('editor_briefing') || '';
  const customAlert = lsg('editor_alert') || '';

  const prompt = `Jsi asistent pro field techniky v loteriové společnosti Allwyn. 
Napiš krátký ranní briefing pro technika Lán Tomáš.

Fakta o jeho týdnu:
- Týden W25, ${pos.length} POS celkem
- Splněno: ${done}/${pos.length} POS
- Otevřené servisní tikety: ${svc.length} (${svc.map(p=>p.n).join(', ') || 'žádné'})
- Aktuální kampaň: Zlatá rybka (NOVÁ emise), EuroJackpot
- Rebranding norma: 2 POS/den, kontrola samolepek Sazka mobil
${adminMsg ? '- Zpráva od manažera: ' + adminMsg : ''}
${customAlert ? '- Upozornění: ' + customAlert : ''}

Napiš přátelský, motivující briefing v češtině. Max 3 věty. Zmiň co je nejdůležitější dnes. Buď konkrétní.`;

  const el = document.getElementById('bf-msg');
  const typing = document.getElementById('bf-typing');
  if (typing) typing.textContent = '';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{role:'user', content: prompt}]
      })
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || 'Dobrý den! Dnes máš před sebou další den v terénu. Zaměř se na kvalitu, foť vše co osazuješ.';
    if (el) {
      el.innerHTML = `${text}<span class="ai-badge">AI Insight</span>`;
    }
  } catch(e) {
    // Fallback if API not available
    const fallbacks = [
      `Tomáši, dnes máš ${pos.length - done} POS zbývajících a ${svc.length} servisní tikety — začni servisy. Nezapomeň fotit před i po osazení a vyžádat podpis při zásobování.`,
      `Dobrý den! Zlatá rybka jen NOVÁ emise — zkontroluj co máš v autě. Rebranding norma 2 POS/den, pečlivě odstraňuj samolepky Sazka mobil.`,
      `Dnes priorita: ${svc.length > 0 ? svc[0].n + ' — servis nejdřív!' : 'splnit normu 2 rebrandingy.'} Fotodokumentace je povinná, admin kontroluje každou návštěvu.`,
    ];
    const txt = fallbacks[Math.floor(Math.random()*fallbacks.length)];
    if (el) el.innerHTML = `${txt}<span class="ai-badge">AI Insight</span>`;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// AI MANAGER BRIEFING — krátké executive summary pro manažera (Claude API)
// ══════════════════════════════════════════════════════════════════════════
async function generateManagerBriefing() {
  const btn = document.getElementById('mgr-briefing-btn');
  const wrap = document.getElementById('mgr-briefing-wrap');
  if (!btn || !wrap) return;

  btn.disabled = true;
  btn.innerHTML = '<svg class="ic"><use href="#ic-clock"/></svg> Generuji briefing…';
  wrap.innerHTML = '<div class="ai-loading">Sestavuji executive summary…<div class="ai-loading-bar"></div></div>';

  const live = getLiveState ? getLiveState() : {};
  const techs = deriveAllTechnicians();
  const totalPOS = techs.reduce((s, t) => s + t.total, 0);
  const donePOS = techs.reduce((s, t) => s + t.done, 0);
  const pct = totalPOS ? Math.round(donePOS / totalPOS * 100) : 0;
  const behind = techs.filter(t => t.overdue);
  const gpsFlags = lsg('gps_flags_' + today(), []);

  const prompt = `Jsi AI executive asistent pro manažera field operations v Allwyn (loterie, ČR), který řídí 27 merch techniků.
Napiš krátký denní briefing pro manažera (executive summary) v češtině, max 4 věty, profesionální tón pro vedení.

Data:
- Plnění týmu dnes: ${donePOS}/${totalPOS} POS (${pct}%)
- Technici pozadu: ${behind.length} (${behind.map(t => t.name).join(', ') || 'žádní'})
- Otevřené servisy: ${live.servisOpen?.length || 0}
- GPS anomálie dnes: ${gpsFlags.length}

Shrň nejdůležitější fakt, jedno riziko a jedno konkrétní doporučení.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 500, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    wrap.innerHTML = renderBriefingCard(text);
  } catch (e) {
    const fallback = `Tým dnes plní ${pct}% týdenní normy (${donePOS}/${totalPOS} POS). ${behind.length ? `${behind.length} technik(ů) je výrazně pozadu (${behind.map(t => t.name).join(', ')}) — doporučuji telefonickou kontrolu ještě dnes.` : 'Žádný technik výrazně nezaostává.'} ${gpsFlags.length ? `Zaznamenáno ${gpsFlags.length} GPS anomálií — prověřit u dotčených POS.` : 'GPS kontrola bez anomálií.'} Doporučení: prioritizovat otevřené servisy (${live.servisOpen?.length || 0}) před koncem dne.`;
    wrap.innerHTML = renderBriefingCard(fallback);
  }

  btn.disabled = false;
  btn.innerHTML = '<svg class="ic"><use href="#ic-calendar"/></svg> Refresh briefing';
}

function renderBriefingCard(text) {
  return `<div class="ai-report-card">
    <div class="ai-report-hdr" style="background:var(--teal)">
      <div class="ai-report-hdr-icon"><svg class="ic ic-lg" style="color:var(--navy)"><use href="#ic-calendar"/></svg></div>
      <div class="ai-report-hdr-t" style="color:var(--navy)">Daily Executive Briefing</div>
      <div class="ai-report-hdr-badge" style="background:var(--navy);color:var(--teal)">AI Insight</div>
    </div>
    <div class="ai-report-body">${text}</div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════════════════
// AI ADMIN REPORT (Claude API)
// ══════════════════════════════════════════════════════════════════════════
async function generateAIReport() {
  const btn = document.getElementById('ai-gen-btn');
  const wrap = document.getElementById('ai-report-wrap');
  if (!btn || !wrap) return;

  btn.disabled = true;
  btn.innerHTML = '<svg class="ic"><use href="#ic-clock"/></svg> Analyzuji data…';
  wrap.innerHTML = '<div class="ai-loading">Analyzuji výkon 27 techniků…<div class="ai-loading-bar"></div></div>';

  const live = getLiveState ? getLiveState() : {};
  const gpsFlags = lsg('gps_flags_' + today(), []);
  const shortVisits = lsg('vlog_' + today(), []).filter(v => v.flag === 'short');

  const techData = deriveAllTechnicians().map(t => {
    return `${t.name}: ${t.done}/${t.total} POS (${t.pct}%) — ${t.activityLabel}`;
  }).join('\n');

  const prompt = `Jsi AI analytik pro field operations manažera v Allwyn (loterie).
Analyzuj výkon 27 merch techniků za tento týden (W25) a identifikuj problémy.

Data techniků:
${techData}

GPS flagy dnes (check-in daleko od POS): ${gpsFlags.length > 0 ? gpsFlags.map(f=>`${f.posName} - ${f.dist?.toFixed(1)}km`).join(', ') : 'žádné'}
Krátké návštěvy dnes (<10 min): ${shortVisits.length > 0 ? shortVisits.map(v=>v.posName).join(', ') : 'žádné'}
Dokončeno dnes: ${live.completedPos?.length || 0} POS
Otevřené servisy: ${live.servisOpen?.length || 0}

Napiš stručný management report v češtině se sekcemi (jako čisté textové nadpisy, BEZ emoji):
1. Rizika a podezřelé aktivity (kdo je výrazně pozadu, GPS anomálie)
2. Pozitivní výkon (kdo exceluje)
3. Doporučení pro manažera

Buď konkrétní, zmiňuj jména. Max 300 slov.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{role:'user', content: prompt}]
      })
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    renderAIReport(text, gpsFlags, shortVisits);
  } catch(e) {
    // Fallback mock report
    const mockReport = generateMockReport(gpsFlags, shortVisits);
    renderAIReport(mockReport, gpsFlags, shortVisits);
  }

  btn.disabled = false;
  btn.innerHTML = '<svg class="ic"><use href="#ic-intel"/></svg> Refresh analysis';
}

function generateMockReport(gpsFlags, shortVisits) {
  const techs = deriveAllTechnicians();
  const behind = techs.filter(t => t.total && t.done/t.total < 0.2);
  const great = techs.filter(t => t.total && t.done/t.total > 0.8);
  return `Rizika a podezřelé aktivity

${behind.map(t => `• **${t.name}**: pouze ${t.done}/${t.total} POS (${Math.round(t.done/t.total*100)}%) — výrazně pod normou, doporučena kontrola`).join('\n')}
${gpsFlags.length ? gpsFlags.map(f => `• GPS anomálie: check-in **${f.posName}** — ${f.dist?.toFixed(1)}km od adresy POS v ${f.time}`).join('\n') : ''}
${shortVisits.length ? shortVisits.map(v => `• Krátká návštěva: **${v.posName}** — pouze ${v.dur} minut`).join('\n') : '• Žádné GPS anomálie ani podezřelé krátké návštěvy dnes'}

Pozitivní výkon

${great.map(t => `• **${t.name}**: ${t.done}/${t.total} POS — výborný výkon`).join('\n') || '• Data se načítají…'}

Doporučení

• Kontaktovat techniky s plněním pod 20% a ověřit důvod zpoždění
• Nastavit minimální dobu návštěvy 15 minut pro IDT a 25 minut pro KA
• GPS ověření aktivní — případné anomálie budou automaticky flagovány`;
}

function renderAIReport(text, gpsFlags, shortVisits) {
  const wrap = document.getElementById('ai-report-wrap');
  if (!wrap) return;

  // Format markdown-like text to HTML
  const formatted = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^(Rizika a podezřelé aktivity)$/gm, '<h4>$1</h4>')
    .replace(/^(Pozitivní výkon)$/gm, '<h4>$1</h4>')
    .replace(/^(Doporučení)$/gm, '<h4>$1</h4>')
    .replace(/^• (.+)$/gm, '<div class="ai-flag-item ai-flag-orange"><span>•</span><span>$1</span></div>')
    .replace(/\n\n/g, '<br>');

  wrap.innerHTML = `
    <div class="ai-report-card">
      <div class="ai-report-hdr">
        <div class="ai-report-hdr-icon"><svg class="ic ic-lg" style="color:#fff"><use href="#ic-intel"/></svg></div>
        <div class="ai-report-hdr-t">Team Performance Analysis — W25</div>
        <div class="ai-report-hdr-badge">AI Insight</div>
      </div>
      <div class="ai-report-body">${formatted}</div>
    </div>
    ${gpsFlags.length ? `<div class="ai-report-card">
      <div class="ai-report-hdr" style="background:var(--red)">
        <div class="ai-report-hdr-icon"><svg class="ic ic-lg" style="color:#fff"><use href="#ic-warning"/></svg></div>
        <div class="ai-report-hdr-t">GPS Anomálie dnes</div>
        <div class="ai-report-hdr-badge" style="background:rgba(255,255,255,.2);color:#fff">${gpsFlags.length} flagů</div>
      </div>
      <div class="ai-report-body">
        ${gpsFlags.map(f => `<div class="ai-flag-item ai-flag-red"><span><svg class="ic ic-sm"><use href="#ic-pin"/></svg></span><span><strong>${f.posName}</strong> · ${f.time} · ${f.dist?.toFixed(2)}km od adresy POS</span></div>`).join('')}
      </div>
    </div>` : ''}
  `;
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN EDITOR
// ══════════════════════════════════════════════════════════════════════════
function initEditor() {
  const fields = ['briefing', 'alert', 'idt', 'ka'];
  fields.forEach(k => {
    const el = document.getElementById('ed-' + k);
    if (el) el.value = lsg('editor_' + k) || '';
  });
}

function saveEditorText(key) {
  const el = document.getElementById('ed-' + key);
  if (!el) return;
  lss('editor_' + key, el.value);
  const btn = el.nextElementSibling;
  if (btn) { btn.textContent = '✓ Uloženo!'; setTimeout(() => btn.textContent = 'Uložit ✓', 2000); }
}

// Show admin alert banner in POS detail
function renderAdminAlertBanner(p) {
  const el = document.getElementById('admin-alert-banner');
  if (!el) return;
  const globalAlert = lsg('editor_alert') || '';
  const typAlert = p.typ === 'IDT' ? lsg('editor_idt') : lsg('editor_ka');
  const msgs = [globalAlert, typAlert].filter(Boolean);
  if (!msgs.length) { el.innerHTML = ''; return; }
  el.innerHTML = msgs.map(m => `
    <div style="margin:8px 12px 0;padding:10px 14px;background:var(--ol);border-left:3px solid var(--orange);border-radius:0 8px 8px 0;font-size:12px;font-weight:600;color:var(--orange);line-height:1.4;display:flex;align-items:flex-start;gap:7px">
      <svg class="ic ic-sm" style="margin-top:1px"><use href="#ic-bell"/></svg><span>${m}</span>
    </div>`).join('');
}

// ── Patch showAdmPage for editor + AI ─────────────────────────────────────
const __origShowAdmPage3 = showAdmPage;
showAdmPage = function(p, btn) {
  __origShowAdmPage3(p, btn);
  if (p === 'editor') initEditor();
  if (p === 'ai') {
    if (!document.getElementById('mgr-briefing-wrap').innerHTML.trim()) {
      document.getElementById('mgr-briefing-wrap').innerHTML = '<div class="empty"><div class="empty-i"><svg class="ic ic-xl"><use href="#ic-calendar"/></svg></div><div class="empty-t">Daily Executive Briefing</div><div class="empty-s">Klikni výše a AI sestaví executive summary z dnešních dat.</div></div>';
    }
    if (!document.getElementById('ai-report-wrap').innerHTML.trim()) {
      document.getElementById('ai-report-wrap').innerHTML = '<div class="empty"><div class="empty-i"><svg class="ic ic-xl"><use href="#ic-intel"/></svg></div><div class="empty-t">Team Performance Analysis</div><div class="empty-s">Klikni na tlačítko pro spuštění AI analýzy celého týmu.</div></div>';
    }
  }
};

// ── Patch openDetail with admin alert banner ───────────────────────────────
const ___origOpenDetail = openDetail;
openDetail = function(ri) {
  ___origOpenDetail(ri);
  const p = posData[cWeek][ri];
  renderAdminAlertBanner(p);
};

// ── Patch showBriefing to use AI ──────────────────────────────────────────
const _origShowBriefing = showBriefing;
showBriefing = function() {
  _origShowBriefing();
  // Override static message with AI
  const el = document.getElementById('bf-msg');
  const typing = document.getElementById('bf-typing');
  if (el && typing) {
    el.innerHTML = '<span>Generuji personalizovaný briefing…</span><span class="ai-badge">AI Insight</span>';
    setTimeout(() => generateAIBriefing(), 800);
  }
};


// ══════════════════════════════════════════════════════════════════════════
// DATE & WEEK HELPERS — auto-detect today
// ══════════════════════════════════════════════════════════════════════════
function getTodayDayIdx() {
  // 0=Po, 1=Út, 2=St, 3=Čt, 4=Pá, null=weekend
  const d = new Date().getDay(); // 0=Sun, 1=Mon...6=Sat
  if (d === 0 || d === 6) return null; // weekend
  return d - 1; // Mon=0, Tue=1...Fri=4
}

// Celotýdenní index (Po=0..Ne=6) — na rozdíl od getTodayDayIdx() nevrací
// null o víkendu. Potřeba pro "je POS otevřeno právě teď", kde víkend je
// platný den (RouteEngine.DAY_KEYS i master data otevírací doby ho znají).
function getFullWeekDayIdx() {
  return (new Date().getDay() + 6) % 7; // Po=0...Ne=6
}

// getOpeningStatusInfo(p) -> { text, cls } pro zobrazení "otevřeno/zavřeno
// právě teď" v detailu POS. Žádný fake default — bez master dat hlásí
// neznámý stav, neodhaduje 08:00-18:00.
function getOpeningStatusInfo(p){
  const dayIdx = getFullWeekDayIdx();
  const hours = RouteEngine.getOpeningHours(p, dayIdx);
  if (hours === 'unknown') {
    return { text: 'Otevírací dobu neznáme', cls: 'dh-unknown' };
  }
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (hours === null) {
    // dnes zavřeno celý den — najdi nejbližší další otevřený den
    for (let i = 1; i <= 7; i++) {
      const nextIdx = (dayIdx + i) % 7;
      const nextHours = RouteEngine.getOpeningHours(p, nextIdx);
      if (nextHours && nextHours !== 'unknown') {
        const dayName = i === 1 ? 'zítra' : ['Po','Út','St','Čt','Pá','So','Ne'][nextIdx];
        return { text: `Zavřeno — otevírá ${dayName} ${nextHours.from}`, cls: 'dh-closed' };
      }
    }
    return { text: 'Zavřeno', cls: 'dh-closed' };
  }
  const openMin = Number(hours.from.slice(0,2))*60 + Number(hours.from.slice(3,5));
  const closeMin = Number(hours.to.slice(0,2))*60 + Number(hours.to.slice(3,5));
  if (nowMin >= openMin && nowMin <= closeMin) {
    return { text: `Otevřeno do ${hours.to}`, cls: 'dh-open' };
  }
  if (nowMin < openMin) {
    return { text: `Zavřeno — otevírá dnes ${hours.from}`, cls: 'dh-closed' };
  }
  for (let i = 1; i <= 7; i++) {
    const nextIdx = (dayIdx + i) % 7;
    const nextHours = RouteEngine.getOpeningHours(p, nextIdx);
    if (nextHours && nextHours !== 'unknown') {
      const dayName = i === 1 ? 'zítra' : ['Po','Út','St','Čt','Pá','So','Ne'][nextIdx];
      return { text: `Zavřeno — otevírá ${dayName} ${nextHours.from}`, cls: 'dh-closed' };
    }
  }
  return { text: 'Zavřeno', cls: 'dh-closed' };
}

function getCurrentWeekNum() {
  const d = new Date();
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return String(Math.ceil((((date - yearStart) / 86400000) + 1) / 7));
}

function isToday(dayIdx) {
  return getTodayDayIdx() === dayIdx;
}

function isFuture(dayIdx) {
  const tod = getTodayDayIdx();
  if (tod === null) return dayIdx >= 0;
  return dayIdx > tod;
}

function isPast(dayIdx) {
  const tod = getTodayDayIdx();
  if (tod === null) return false;
  return dayIdx < tod;
}

// ── OVERDUE: POS from past days not completed → carry forward ─────────────
// dataset: volitelný zdroj (default posData = jen přihlášený technik).
// Velín kontexty (POS Network, Admin POS Detail) musí předat FULL_POS_DATA,
// jinak by overdue stav viděli jen u POS technika Lán Tomáš.
function getOverduePOS(weekKey, dataset) {
  const all = (dataset || posData)[weekKey] || [];
  const tod = getTodayDayIdx();
  if (tod === null) return [];
  return all.filter(p => !p.v && p.d !== null && p.d !== undefined && p.d < tod);
}

// ══════════════════════════════════════════════════════════════════════════
// VISIT HISTORY — per POS across all weeks
// ══════════════════════════════════════════════════════════════════════════
function recordVisit(posId, posName, weekKey, dayIdx) {
  const key = 'visits_' + posId;
  const history = lsg(key, []);
  const ci = lsg('ci_' + posId);
  history.unshift({
    date: new Date().toLocaleDateString('cs-CZ'),
    time: ci ? ci.inTime + '–' + (ci.outTime||'?') : new Date().toLocaleTimeString('cs-CZ',{hour:'2-digit',minute:'2-digit'}),
    dur: ci ? ci.dur : null,
    week: weekKey,
    day: dayIdx,
    technik: 'Lán Tomáš',
    gpsOk: ci ? (ci.gpsDist === null || ci.gpsDist < 1) : null,
  });
  lss(key, history.slice(0, 20)); // keep last 20
}

function getVisitHistory(posId) {
  return lsg('visits_' + posId, []);
}

// ══════════════════════════════════════════════════════════════════════════
// ROUTE INTELLIGENCE — denní trasa technika (RouteEngine)
// ══════════════════════════════════════════════════════════════════════════
function routeOrderKey(week, day){ return `route_order_${week}_${day}`; }
function getStoredRouteOrder(week, day){ return lsg(routeOrderKey(week, day)); }
function setStoredRouteOrder(week, day, ids){ lss(routeOrderKey(week, day), ids); }
function resetRouteOrder(week, day){
  localStorage.removeItem(routeOrderKey(week, day));
  if (cView === 'route') showRouteView(week, day); else renderList();
}

function applyStoredRouteOrder(dayPos, week, day){
  const ids = getStoredRouteOrder(week, day);
  if (!ids || !ids.length) return dayPos;
  const byId = {}; dayPos.forEach(p => byId[p.id] = p);
  const ordered = ids.map(id => byId[id]).filter(Boolean);
  dayPos.forEach(p => { if (!ids.includes(p.id)) ordered.push(p); });
  return ordered;
}

function buildRouteSummaryCard(dayPos, week, day){
  if (dayPos.length < 2) return null;
  const startLoc = getStartLocation();
  const cmp = RouteEngine.compareRoutes(dayPos, startLoc, getStartTime(), day);
  const hasStoredOrder = !!getStoredRouteOrder(week, day);
  const fewerViolations = cmp.optimizedViolations != null && cmp.optimizedViolations < cmp.currentViolations;
  const showOptimize = cmp.savedKm > 0.5 || fewerViolations;
  const el = document.createElement('div');
  el.style.cssText = 'margin:8px 12px;padding:14px;background:var(--surface,#fff);border:1.5px solid var(--border);border-radius:12px';
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;color:var(--navy);font-weight:700;font-size:13px">
      <svg class="ic ic-sm" style="color:var(--teal)"><use href="#ic-route"/></svg> Trasa dne · ${dayPos.length} POS
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
      <div><div style="font-size:11px;color:var(--muted)">Jízda</div><div style="font-size:15px;font-weight:700">${RouteEngine.formatKm(cmp.before.drivingKm)}</div><div style="font-size:11px;color:var(--muted)">${RouteEngine.formatHM(cmp.before.drivingMin)}</div></div>
      <div><div style="font-size:11px;color:var(--muted)">Práce na POS</div><div style="font-size:15px;font-weight:700">${RouteEngine.formatHM(cmp.before.workMin)}</div></div>
      <div><div style="font-size:11px;color:var(--muted)">Celkem</div><div style="font-size:15px;font-weight:700">${RouteEngine.formatHM(cmp.before.totalMin)}</div></div>
    </div>
    ${showOptimize ? `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
      <div style="font-size:12px;color:var(--teal);font-weight:700;display:flex;align-items:center;gap:5px">
        <svg class="ic ic-sm"><use href="#ic-target"/></svg> ${cmp.savedKm > 0.5 ? `Příležitost: ušetříš až ${RouteEngine.formatKm(cmp.savedKm)} · ${RouteEngine.formatHM(cmp.savedMin)}` : 'Příležitost: lepší pořadí vyhne zavřeným POS'}
      </div>
      <button onclick="showRouteView('${week}',${day})" style="background:var(--teal);color:var(--navy);border:none;border-radius:8px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer;flex-shrink:0">Zobrazit trasu</button>
    </div>` : `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
      <div style="font-size:12px;color:var(--muted)">${hasStoredOrder ? 'Pořadí upraveno technikem.' : 'Trasa je v aktuálním pořadí.'}</div>
      <button onclick="showRouteView('${week}',${day})" style="background:none;color:var(--teal);border:1.5px solid var(--teal);border-radius:8px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer;flex-shrink:0">Upravit trasu</button>
    </div>`}
  `;
  return el;
}

// ══════════════════════════════════════════════════════════════════════════
// ROUTE INTELLIGENCE — výchozí pozice technika (ráno: GPS nebo uložená výchozí)
// ══════════════════════════════════════════════════════════════════════════
function startLocationKey(){
  const s = getSession();
  return 'start_location_' + ((s && s.user && s.user.id) || 'default');
}
function getStartLocation(){ return lsg(startLocationKey()); }
function setStartLocation(lat, lng, source){
  const loc = { lat, lng, source, date: today(), ts: Date.now() };
  lss(startLocationKey(), loc);
  return loc;
}
function isStartLocationFresh(){
  const loc = getStartLocation();
  return !!(loc && loc.date === today());
}

// Čas odjezdu — potřebný pro spočítání reálného příjezdu na zastávky a
// porovnání s otevírací dobou POS. Technik si ho může upravit, default 08:00.
function startTimeKey(){
  const s = getSession();
  return 'start_time_' + ((s && s.user && s.user.id) || 'default');
}
function getStartTime(){ return lsg(startTimeKey()) || '08:00'; }
function setStartTime(hm){ lss(startTimeKey(), hm); }
function captureStartLocation(cb){
  const el = document.getElementById('route-start-status');
  if (!navigator.geolocation){
    if (el) el.innerHTML = '<span class="gps-badge gps-warn"><svg class="ic ic-sm"><use href="#ic-warning"/></svg> GPS nedostupná</span>';
    if (cb) cb(null);
    return;
  }
  if (el) el.innerHTML = '<span class="gps-badge gps-loading"><svg class="ic ic-sm"><use href="#ic-signal"/></svg> Zjišťuji polohu…</span>';
  navigator.geolocation.getCurrentPosition(
    pos => { const loc = setStartLocation(pos.coords.latitude, pos.coords.longitude, 'gps'); if (cb) cb(loc); },
    () => { if (el) el.innerHTML = '<span class="gps-badge gps-warn"><svg class="ic ic-sm"><use href="#ic-warning"/></svg> Poloha zamítnuta</span>'; if (cb) cb(null); },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

// ── Sledování, jestli technik doporučenou trasu použil, nebo si nechal svoje
// pořadí — pro pozdější analýzu, NIKDY ne pro hodnocení/postih jednotlivce. ──
function recordRouteDecision(week, day, decision){
  lss(`route_decision_${week}_${day}`, { decision, ts: Date.now() });
}

// ── Manuální přeřazení pořadí (nahoru/dolů) ─────────────────────────────────
function moveRouteStop(week, day, posId, dir){
  const all = posData[week] || [];
  const dayPos = applyStoredRouteOrder(all.filter(p => p.d === day), week, day);
  const idx = dayPos.findIndex(p => p.id === posId);
  const swapIdx = idx + dir;
  if (idx < 0 || swapIdx < 0 || swapIdx >= dayPos.length) return;
  [dayPos[idx], dayPos[swapIdx]] = [dayPos[swapIdx], dayPos[idx]];
  setStoredRouteOrder(week, day, dayPos.map(p => p.id));
  showRouteView(week, day);
}

function useRecommendedRoute(week, day){
  const all = posData[week] || [];
  const dayPos = applyStoredRouteOrder(all.filter(p => p.d === day), week, day);
  const cmp = RouteEngine.compareRoutes(dayPos, getStartLocation(), getStartTime(), day);
  setStoredRouteOrder(week, day, cmp.optimizedOrderIds);
  recordRouteDecision(week, day, 'accepted');
  showRouteView(week, day);
}
function keepMyRoute(week, day){
  recordRouteDecision(week, day, 'kept');
  showRouteView(week, day);
}

// ── Mapa trasy (Leaflet) — vizuální pomůcka: výchozí bod + zastávky v pořadí + spojnice ──
let techRouteMap = null;
function renderRouteMap(dayPos, startLoc){
  const mapEl = document.getElementById('route-map');
  if (!mapEl) return;
  if (techRouteMap) { techRouteMap.remove(); techRouteMap = null; }
  const stops = dayPos.filter(p => p.lat && p.lng);
  if (!stops.length) {
    mapEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:12px">Mapa nedostupná — POS nemají GPS souřadnice.</div>';
    return;
  }
  try {
    techRouteMap = L.map('route-map', { zoomControl: true, attributionControl: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 18 }).addTo(techRouteMap);
    const coords = [];
    if (startLoc) {
      coords.push([startLoc.lat, startLoc.lng]);
      const startIcon = L.divIcon({ className: '', html: '<div style="width:26px;height:26px;background:var(--navy);border-radius:50%;border:2.5px solid #fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#fff;box-shadow:0 2px 6px rgba(0,0,0,.4)">START</div>', iconSize: [26, 26], iconAnchor: [13, 13] });
      L.marker([startLoc.lat, startLoc.lng], { icon: startIcon }).addTo(techRouteMap).bindPopup('Tvůj výchozí bod');
    }
    stops.forEach((p, i) => {
      coords.push([p.lat, p.lng]);
      const icon = L.divIcon({ className: '', html: `<div style="width:26px;height:26px;background:var(--teal);border-radius:50%;border:2.5px solid #fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:var(--navy);box-shadow:0 2px 6px rgba(0,0,0,.4)">${i + 1}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
      L.marker([p.lat, p.lng], { icon }).addTo(techRouteMap).bindPopup(`<b>${i + 1}. ${p.n}</b><br>#${p.id}`);
    });
    if (coords.length > 1) {
      L.polyline(coords, { color: '#2ECDC0', weight: 3, opacity: 0.85, dashArray: '6,6' }).addTo(techRouteMap);
    }
    techRouteMap.fitBounds(L.latLngBounds(coords), { padding: [28, 28] });
  } catch (e) { console.warn('Route map init failed', e); }
}

// ── Dedikovaná obrazovka trasy: výchozí bod + ruční pořadí + mapa + porovnání ──
function showRouteView(week, day){
  cView = 'route'; saveTechUIState();
  const wrap = document.getElementById('pos-list-wrap');
  wrap.innerHTML = '';
  const all = posData[week] || [];
  const dayPos = applyStoredRouteOrder(all.filter(p => p.d === day), week, day);
  const startLoc = getStartLocation();
  const meta = WEEKS_META[week];

  const back = document.createElement('div');
  back.style.cssText = 'padding:10px 12px 4px';
  back.innerHTML = `<button onclick="renderList()" style="background:none;border:none;color:var(--td);font-size:13px;font-weight:700;cursor:pointer">← Zpět na denní plán</button>`;
  wrap.appendChild(back);

  const hdr = document.createElement('div');
  hdr.style.cssText = 'padding:4px 16px 8px';
  hdr.innerHTML = `<div style="font-size:16px;font-weight:800;color:var(--navy)">Trasa · ${DAYS[day]} ${meta.dd[day]}</div>
    <div style="font-size:12px;color:var(--muted);margin-top:2px">Pořadí si určuješ ty. Doporučení je jen návrh.</div>`;
  wrap.appendChild(hdr);

  // Výchozí bod + čas odjezdu
  const startTime = getStartTime();
  const startCard = document.createElement('div');
  startCard.style.cssText = 'margin:0 12px 10px;padding:12px;background:var(--surface,#fff);border:1.5px solid var(--border);border-radius:12px';
  startCard.innerHTML = `
    <div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:6px">Odkud a kdy dnes vyjíždíš?</div>
    <div id="route-start-status" style="margin-bottom:8px">${startLoc
      ? `<span class="gps-badge gps-ok">✓ ${isStartLocationFresh() ? 'Dnešní pozice' : 'Uložená pozice'} · ${startLoc.lat.toFixed(3)}, ${startLoc.lng.toFixed(3)}</span>`
      : '<span class="gps-badge gps-warn"><svg class="ic ic-sm"><use href="#ic-warning"/></svg> Pozice nezjištěna</span>'}</div>
    <button onclick="captureStartLocation(()=>showRouteView('${week}',${day}))" style="width:100%;padding:9px;background:var(--navy);color:var(--teal);border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;margin-bottom:8px">Zjistit moji pozici</button>
    <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:4px">Čas odjezdu</label>
    <input type="time" value="${startTime}" onchange="setStartTime(this.value);showRouteView('${week}',${day})" style="width:100%;padding:7px;border:1.5px solid var(--border);border-radius:8px;font-size:13px">
  `;
  wrap.appendChild(startCard);

  if (dayPos.length < 1) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.innerHTML = `<div class="empty-t">Žádné POS na tento den</div>`;
    wrap.appendChild(e);
    return;
  }

  // Mapa
  const mapWrap = document.createElement('div');
  mapWrap.style.cssText = 'margin:0 12px 10px;border-radius:12px;overflow:hidden;border:1.5px solid var(--border)';
  mapWrap.innerHTML = `<div id="route-map" style="height:240px"></div>`;
  wrap.appendChild(mapWrap);
  setTimeout(() => renderRouteMap(dayPos, startLoc), 50);

  // Otevírací doba — jen fakta o příjezdu vs. otevírací době, žádné tiché
  // přeřazení. Vyžaduje výchozí pozici (jinak nelze spočítat reálný příjezd).
  if (startLoc) {
    const baseCalc = RouteEngine.calculateRoute(dayPos, startLoc);

    if (baseCalc.warnings.length) {
      const gpsCard = document.createElement('div');
      gpsCard.style.cssText = 'margin:0 12px 10px;padding:14px;background:#fff7e6;border:1.5px solid #f5c542;border-radius:12px';
      gpsCard.innerHTML = `
        <div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:6px"><svg class="ic ic-sm" style="color:#b8860b"><use href="#ic-warning"/></svg> Bez reálných GPS</div>
        <div style="font-size:12px;color:var(--td)">${baseCalc.warnings.length} ${baseCalc.warnings.length===1?'POS nemá':'POS nemá'} reálné GPS z master dat (jen odhad podle adresy) — vyřazeno z výpočtu vzdálenosti a optimalizace. Na mapě se pořád zobrazí, jen jako odhad.</div>
      `;
      wrap.appendChild(gpsCard);
    }

    const ohIssues = RouteEngine.checkOpeningHours(dayPos, baseCalc, startTime, day);
    if (ohIssues.length) {
      const ohCard = document.createElement('div');
      ohCard.style.cssText = 'margin:0 12px 10px;padding:14px;background:#fff7e6;border:1.5px solid #f5c542;border-radius:12px';
      ohCard.innerHTML = `
        <div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:8px"><svg class="ic ic-sm" style="color:#b8860b"><use href="#ic-warning"/></svg> Otevírací doba</div>
        ${ohIssues.map(iss => iss.status === 'too-early'
          ? `<div style="font-size:12px;color:var(--td);margin-bottom:6px">#${iss.posId} ${iss.posName}: příjezd ${iss.arrival}, ale otvírá až v ${iss.opensAt}. Lepší navštívit později.</div>`
          : iss.status === 'too-late'
          ? `<div style="font-size:12px;color:var(--td);margin-bottom:6px">#${iss.posId} ${iss.posName}: příjezd ${iss.arrival}, ale zavírá v ${iss.closesAt}. Lepší navštívit dřív.</div>`
          : iss.status === 'hours-unknown'
          ? `<div style="font-size:12px;color:var(--td);margin-bottom:6px">#${iss.posId} ${iss.posName}: příjezd ${iss.arrival} — otevírací dobu neznáme (chybí master data), nelze ověřit.</div>`
          : `<div style="font-size:12px;color:var(--td);margin-bottom:6px">#${iss.posId} ${iss.posName}: dnes zavřeno — příjezd ${iss.arrival} nedává smysl.</div>`
        ).join('')}
        <div style="font-size:11px;color:var(--muted);margin-top:4px">Pořadí si určuješ ty — tohle je jen upozornění, ne automatická změna.</div>
      `;
      wrap.appendChild(ohCard);
    }
  }

  // Porovnání + volba (jen pokud je co porovnávat a je víc než 1 zastávka)
  if (dayPos.length > 1) {
    const cmp = RouteEngine.compareRoutes(dayPos, startLoc, startTime, day);
    const fewerViolations = cmp.optimizedViolations != null && cmp.optimizedViolations < cmp.currentViolations;
    const showOpportunity = cmp.savedKm > 0.5 || fewerViolations;
    const checklist = `
      <div style="font-size:11px;font-weight:700;color:var(--navy);letter-spacing:.03em;margin-bottom:8px">ROUTE INTELLIGENCE</div>
      <div style="font-size:12px;color:var(--td);margin-bottom:2px">✓ Zkontrolováno ${dayPos.length} POS${cmp.exact ? ' (porovnána všechna pořadí)' : ' (optimalizace 2-opt)'}</div>
      <div style="font-size:12px;color:var(--td);margin-bottom:2px">✓ Zkontrolována vzdálenost trasy</div>
      <div style="font-size:12px;color:var(--td);margin-bottom:10px">${cmp.currentViolations != null ? '✓ Zkontrolována otevírací doba' : '○ Otevírací dobu nelze ověřit — chybí pozice/čas odjezdu'}</div>
    `;
    const cmpCard = document.createElement('div');
    cmpCard.style.cssText = 'margin:0 12px 10px;padding:14px;background:var(--surface,#fff);border:1.5px solid var(--border);border-radius:12px';
    cmpCard.innerHTML = showOpportunity ? `
      ${checklist}
      <div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:8px"><svg class="ic ic-sm" style="color:var(--teal)"><use href="#ic-target"/></svg> Výsledek: nalezeno zlepšení</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div><div style="font-size:11px;color:var(--muted)">Tvoje pořadí</div><div style="font-size:14px;font-weight:700">${RouteEngine.formatKm(cmp.before.drivingKm)} · ${RouteEngine.formatHM(cmp.before.drivingMin)}</div>${cmp.currentViolations ? `<div style="font-size:11px;color:#b8860b;font-weight:700">${cmp.currentViolations} POS mimo otevírací dobu</div>` : ''}</div>
        <div><div style="font-size:11px;color:var(--muted)">Doporučené pořadí</div><div style="font-size:14px;font-weight:700;color:var(--teal)">${RouteEngine.formatKm(cmp.after.drivingKm)} · ${RouteEngine.formatHM(cmp.after.drivingMin)}</div>${cmp.optimizedViolations != null ? `<div style="font-size:11px;color:var(--teal);font-weight:700">${cmp.optimizedViolations} POS mimo otevírací dobu</div>` : ''}</div>
      </div>
      ${cmp.savedKm > 0.5 ? `<div style="font-size:12px;color:var(--teal);font-weight:700;margin-bottom:10px">Ušetříš ${RouteEngine.formatKm(cmp.savedKm)} · ${RouteEngine.formatHM(cmp.savedMin)}</div>` : ''}
      <div style="display:flex;gap:8px">
        <button onclick="useRecommendedRoute('${week}',${day})" style="flex:1;padding:10px;background:var(--teal);color:var(--navy);border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">Použít doporučenou trasu</button>
        <button onclick="keepMyRoute('${week}',${day})" style="flex:1;padding:10px;background:none;color:var(--td);border:1.5px solid var(--border);border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">Nechat moje pořadí</button>
      </div>
    ` : `
      ${checklist}
      <div style="font-size:12px;font-weight:700;color:var(--navy)">Výsledek: nejlepší varianta nalezena</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">Tvoje pořadí je už nejlepší možné${cmp.exact ? ' — zkontroloval jsem všechna možná pořadí těchto ' + dayPos.length + ' POS' : ''}.</div>
    `;
    wrap.appendChild(cmpCard);
  }

  if (getStoredRouteOrder(week, day)) {
    const resetRow = document.createElement('div');
    resetRow.style.cssText = 'margin:0 12px 6px;font-size:12px;color:var(--muted)';
    resetRow.innerHTML = `<a href="#" onclick="event.preventDefault();resetRouteOrder('${week}',${day})" style="color:var(--teal);font-weight:700">Vrátit původní pořadí</a>`;
    wrap.appendChild(resetRow);
  }

  // Seznam zastávek s ručním přeřazením
  const lbl = document.createElement('div');
  lbl.className = 'sec-lbl';
  lbl.textContent = `Pořadí zastávek (${dayPos.length})`;
  wrap.appendChild(lbl);

  dayPos.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'pos-card';
    row.style.cursor = 'default';
    row.innerHTML = `
      <div class="pci">
        <div style="width:26px;height:26px;border-radius:50%;background:var(--tl);color:var(--navy);font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i + 1}</div>
        <div class="pinfo">
          <div class="pname">${p.n} <span style="font-weight:600;color:var(--muted);font-size:11px">#${p.id}</span></div>
          <div class="paddr">${p.a}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;flex-shrink:0">
          <button onclick="moveRouteStop('${week}',${day},'${p.id}',-1)" ${i === 0 ? 'disabled' : ''} style="width:30px;height:26px;border:1px solid var(--border);background:#fff;border-radius:6px;cursor:${i === 0 ? 'default' : 'pointer'};opacity:${i === 0 ? .35 : 1};font-size:13px;font-weight:700">↑</button>
          <button onclick="moveRouteStop('${week}',${day},'${p.id}',1)" ${i === dayPos.length - 1 ? 'disabled' : ''} style="width:30px;height:26px;border:1px solid var(--border);background:#fff;border-radius:6px;cursor:${i === dayPos.length - 1 ? 'default' : 'pointer'};opacity:${i === dayPos.length - 1 ? .35 : 1};font-size:13px;font-weight:700">↓</button>
        </div>
      </div>`;
    wrap.appendChild(row);
  });
}

// ── Ranní souhrn dne — co technika čeká + tichá nabídka lepší trasy ─────────
// Žádné hodnocení, žádné "promarněné km" — jen podpůrný asistent.
function buildMorningBriefCard(todayPos, week, day){
  const s = getSession();
  const firstName = ((s && s.user && s.user.name) || '').trim().split(/\s+/).pop() || '';
  const startLoc = getStartLocation();
  const cmp = todayPos.length > 1 ? RouteEngine.compareRoutes(todayPos, startLoc, getStartTime(), day) : null;
  const workMin = todayPos.reduce((sum, p) => sum + RouteEngine.getVisitDurationMin(p), 0);
  const drivingMin = cmp ? cmp.before.drivingMin : 0;
  const totalMin = workMin + drivingMin;
  const fewerViolations = cmp && cmp.optimizedViolations != null && cmp.optimizedViolations < cmp.currentViolations;
  const hasSuggestion = cmp && (cmp.savedKm > 0.5 || fewerViolations);

  const el = document.createElement('div');
  el.style.cssText = 'margin:10px 12px 6px;padding:14px;background:var(--navy);border-radius:14px;color:#fff';
  el.innerHTML = `
    <div style="font-size:15px;font-weight:800">Dobré ráno${firstName ? ', ' + firstName : ''}</div>
    <div style="font-size:12px;color:rgba(255,255,255,.75);margin-top:6px">
      Dnes: <strong style="color:#fff">${todayPos.length} POS</strong> naplánováno · Odhad <strong style="color:#fff">${RouteEngine.formatHM(totalMin)}</strong>
    </div>
    ${hasSuggestion ? `
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.15);display:flex;align-items:center;justify-content:space-between;gap:10px">
      <div style="font-size:12px;color:var(--teal);font-weight:700">${cmp.savedKm > 0.5 ? `Našel jsem lepší trasu: −${RouteEngine.formatKm(cmp.savedKm)} · −${RouteEngine.formatHM(cmp.savedMin)}` : 'Našel jsem lepší pořadí — vyhne se zavřeným POS'}</div>
      <button onclick="showRouteView('${week}',${day})" style="background:var(--teal);color:var(--navy);border:none;border-radius:8px;padding:6px 10px;font-size:11px;font-weight:700;cursor:pointer;flex-shrink:0">Zobrazit</button>
    </div>` : `
    <div style="margin-top:8px;font-size:12px;color:var(--teal);font-weight:700">Trasa připravena</div>`}
  `;
  return el;
}

// ══════════════════════════════════════════════════════════════════════════
// PATCH renderList — show today's POS locked, future plannable, overdue flagged
// ══════════════════════════════════════════════════════════════════════════
const _origRenderList = renderList;
renderList = function() {
  cView = 'list'; saveTechUIState();
  const wrap = document.getElementById('pos-list-wrap');
  wrap.innerHTML = '';
  const all = posData[cWeek] || [];
  if (!all.length) {
    wrap.innerHTML = '<div class="empty"><div class="empty-i"><svg class="ic ic-xl"><use href="#ic-notes"/></svg></div><div class="empty-t">Žádné POS tento týden</div></div>';
    return;
  }

  const todayIdx = getTodayDayIdx();
  const isCurrentWeek = cWeek === getCurrentWeekNum();

  // Overdue POS (past days, not done) — show at top of today
  const overdue = isCurrentWeek ? getOverduePOS(cWeek) : [];

  // Unplanned for this week
  const unpl = all.filter(p => (p.d === null || p.d === undefined) && !p.v);

  // Today's POS (v uloženém pořadí trasy, pokud bylo optimalizováno)
  const todayPos = applyStoredRouteOrder(all.filter(p => p.d === cDay), cWeek, cDay);

  // Header: what day is selected
  const meta = WEEKS_META[cWeek];
  const dayDate = meta ? meta.dd[cDay] : '';
  const isTodaySelected = isCurrentWeek && cDay === todayIdx;

  // Ranní souhrn — jen na dnešním pohledu, jen pokud je co naplánováno
  if (isTodaySelected && todayPos.length > 0) {
    wrap.appendChild(buildMorningBriefCard(todayPos, cWeek, cDay));
  }

  // Overdue banner (only on today's view in current week)
  if (isTodaySelected && overdue.length > 0) {
    const banner = document.createElement('div');
    banner.style.cssText = 'margin:8px 12px 0;padding:10px 14px;background:var(--rl);border:1.5px solid var(--red);border-radius:10px;cursor:pointer';
    banner.onclick = () => showOverdue();
    banner.innerHTML = `<div style="font-size:13px;font-weight:700;color:var(--red)"><svg class="ic ic-sm"><use href="#ic-clock"/></svg> ${overdue.length} nesplněných POS z minulých dní</div>
      <div style="font-size:11px;color:var(--red);opacity:.8;margin-top:2px">Klikni pro zobrazení — přidej je na dnes nebo zpracuj</div>`;
    wrap.appendChild(banner);
  }

  // Unplanned banner
  if (unpl.length > 0) {
    const b = document.createElement('div');
    b.className = 'upbanner';
    b.onclick = showUnplanned;
    b.innerHTML = `<div class="upb-ico"><svg class="ic ic-lg"><use href="#ic-pin"/></svg></div><div><div class="upb-t">${unpl.length} POS bez přiřazeného dne</div><div class="upb-s">Klikni pro naplánování</div></div><div style="color:var(--orange);font-size:18px;margin-left:auto">›</div>`;
    wrap.appendChild(b);
  }

  // Plan button
  const planBtn = document.createElement('div');
  planBtn.style.cssText = 'padding:8px 12px 0';
  planBtn.innerHTML = `<button onclick="showPlanningView()" style="width:100%;padding:11px;background:var(--navy);color:var(--teal);border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px"><svg class="ic"><use href="#ic-notes"/></svg> Naplánovat POS na týden</button>`;
  wrap.appendChild(planBtn);

  // Day label
  const lbl = document.createElement('div');
  lbl.className = 'sec-lbl';
  lbl.style.display = 'flex';
  lbl.style.alignItems = 'center';
  lbl.style.justifyContent = 'space-between';
  lbl.style.paddingRight = '18px';
  const dayLabel = isTodaySelected ? `${DAYS[cDay]} ${dayDate} — DNES` : `${DAYS[cDay]} ${dayDate}`;
  lbl.innerHTML = `<span>${dayLabel} · ${todayPos.length} POS</span>`;
  wrap.appendChild(lbl);

  const routeCard = buildRouteSummaryCard(todayPos, cWeek, cDay);
  if (routeCard) wrap.appendChild(routeCard);

  if (!todayPos.length) {
    const e = document.createElement('div');
    e.className = 'empty';

    // Can they add POS from unplanned?
    const canPlan = isCurrentWeek && (isTodaySelected || isFuture(cDay));
    e.innerHTML = `<div class="empty-i"><svg class="ic ic-xl"><use href="#ic-calendar"/></svg></div>
      <div class="empty-t">Nic naplánováno</div>
      <div class="empty-s">${canPlan ? 'Přiřaď POS z neplánovaných výše.' : 'Minulý den — pouze pro přehled.'}</div>`;
    wrap.appendChild(e);
    return;
  }

  todayPos.forEach(p => {
    const ri = all.indexOf(p);
    // Lock past days - can view but not check-in/complete
    const locked = isCurrentWeek && isPast(cDay) && !p.v;
    wrap.appendChild(makePosCard(p, ri, false, locked));
  });
};

// ── Show overdue POS ───────────────────────────────────────────────────────
function showOverdue() {
  cView = 'overdue'; saveTechUIState();
  const wrap = document.getElementById('pos-list-wrap');
  wrap.innerHTML = '';
  const all = posData[cWeek] || [];
  const overdue = getOverduePOS(cWeek);

  const back = document.createElement('div');
  back.style.cssText = 'padding:10px 12px 4px';
  back.innerHTML = `<button onclick="renderList()" style="background:none;border:none;color:var(--td);font-size:13px;font-weight:700;cursor:pointer">← Zpět</button>`;
  wrap.appendChild(back);

  const lbl = document.createElement('div');
  lbl.className = 'sec-lbl';
  lbl.style.color = 'var(--red)';
  lbl.textContent = `Nesplněné z minulých dní (${overdue.length})`;
  wrap.appendChild(lbl);

  overdue.forEach(p => {
    const ri = all.indexOf(p);
    const card = makePosCard(p, ri, true); // show assign btn
    wrap.appendChild(card);
  });
}

// ── Update makePosCard to support locked state ────────────────────────────
const _origMakePosCard = makePosCard;
makePosCard = function(p, ri, showAssign, locked) {
  const card = _origMakePosCard(p, ri, showAssign);
  if (locked) {
    // Add "nesplněno" overlay badge
    const inner = card.querySelector('.pci');
    if (inner) {
      const badge = document.createElement('span');
      badge.style.cssText = 'font-size:10px;font-weight:700;background:var(--ol);color:var(--orange);padding:2px 6px;border-radius:10px;flex-shrink:0';
      badge.textContent = 'Nesplněno';
      inner.appendChild(badge);
    }
  }
  return card;
};

// ── Patch markVisited to record visit history ─────────────────────────────
const _origMarkVisited2 = markVisited;
markVisited = function() {
  const p = posData[cWeek][cIdx];
  if (!p || p.v || !p.taskState.every(t => t.done)) return;
  recordVisit(p.id, p.n, cWeek, cDay);
  _origMarkVisited2();
};

// ── Auto-set today's week and day on init ────────────────────────────────
function autoSetCurrentDay() {
  const weekNum = getCurrentWeekNum();
  // Use W25 as demo if current week not in data
  if (posData[weekNum] && posData[weekNum].length > 0) {
    cWeek = weekNum;
  }
  const todayIdx = getTodayDayIdx();
  cDay = todayIdx !== null ? todayIdx : 0;
}

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — POS DETAIL DRAWER
// ══════════════════════════════════════════════════════════════════════════
function showAdminPOSDetail(posId) {
  // Find POS across all weeks
  let foundPos = null;
  let foundWeek = null;
  for (const [w, list] of Object.entries(FULL_POS_DATA)) {
    const p = list.find(x => x.id === posId);
    if (p) { foundPos = p; foundWeek = w; break; }
  }
  if (!foundPos) return;

  const p = foundPos;
  const history = getVisitHistory(posId);
  const ci = lsg('ci_' + posId);
  const supply = lsg('supply_' + posId + '_' + today());
  const posNotes = lsg('poscard_' + posId, []);
  const lastVisit = history[0];

  let html = `<div style="padding:20px 18px 32px">
    <div style="background:var(--navy);border-radius:12px;padding:14px 16px;margin-bottom:16px;color:white">
      <div style="font-size:10px;font-weight:700;color:var(--teal);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px">${p.id} · ${p.typ}</div>
      <div style="font-size:18px;font-weight:800">${p.n}</div>
      <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:4px">${p.a}</div>
      ${p.partner ? `<div style="margin-top:8px"><span style="font-size:11px;font-weight:700;background:rgba(46,205,192,.2);color:var(--teal);padding:3px 9px;border-radius:20px">★ ${p.partner}</span></div>` : ''}
      <div style="margin-top:8px;font-size:12px;font-weight:700">${(() => { const s = getOpeningStatusInfo(p); const color = s.cls==='dh-open'?'var(--teal)':s.cls==='dh-closed'?'#ffb84d':'rgba(255,255,255,.45)'; return `<span style="color:${color}">${s.text}</span>`; })()}</div>
    </div>

    <!-- Terminály -->
    ${(p.terminals||[]).length ? `<div style="background:white;border-radius:10px;padding:13px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)">
      <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Terminály (${p.terminals.length})</div>
      ${p.terminals.map(t => `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid var(--bg)">
        <svg class="ic ic-sm" style="color:var(--muted)"><use href="#ic-monitor"/></svg>
        <div style="flex:1;font-size:13px;font-weight:700">${t.id}</div>
        <div style="font-size:11px;color:var(--muted)">${t.type||'—'}</div>
        <span style="font-size:10px;font-weight:700;color:${t.status==='active'?'var(--green)':'var(--muted)'}">${t.status==='active'?'Aktivní':t.status||'—'}</span>
      </div>`).join('')}
    </div>` : ''}

    <!-- Last visit summary -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <div style="background:white;border-radius:10px;padding:13px;box-shadow:0 1px 3px rgba(0,0,0,.06)">
        <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Poslední návštěva</div>
        <div style="font-size:15px;font-weight:800;margin-top:4px;color:var(--navy)">${lastVisit ? lastVisit.date : '—'}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">${lastVisit ? lastVisit.technik : 'Nikdy'}</div>
      </div>
      <div style="background:white;border-radius:10px;padding:13px;box-shadow:0 1px 3px rgba(0,0,0,.06)">
        <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Celkem návštěv</div>
        <div style="font-size:15px;font-weight:800;margin-top:4px;color:var(--navy)">${history.length}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">W${foundWeek} · ${p.v?'✓ Hotovo':'Čeká'}</div>
      </div>
    </div>`;

  // Frekvence návštěv — odvozeno z reálných dat, ne vymyšlené
  const isOverdueNow = getOverduePOS(foundWeek, FULL_POS_DATA).some(op => op.id === p.id);
  const posModel = PosModel.toPosModel(p, { history, isOverdue: isOverdueNow });
  if (posModel.daysSinceLastVisit !== null) {
    const freqColors = { 'on-track': 'var(--green)', 'due-soon': 'var(--orange)', overdue: 'var(--red)' };
    const freqBg = { 'on-track': 'var(--gl)', 'due-soon': 'var(--ol)', overdue: 'var(--rl)' };
    let msg = `Tato POS nebyla navštívena ${posModel.daysSinceLastVisit} dní.`;
    if (posModel.frequencyCompliance === 'overdue') msg += ' Měla by být prioritizována co nejdříve.';
    else if (posModel.frequencyCompliance === 'due-soon') msg += ' Měla by být prioritizována příští týden.';
    html += `<div style="background:${freqBg[posModel.frequencyCompliance]||'var(--bg)'};border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:12px;color:${freqColors[posModel.frequencyCompliance]||'var(--muted)'};font-weight:600">${msg}</div>`;
  } else {
    html += `<div style="background:var(--rl);border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:12px;color:var(--red);font-weight:600">Tato POS ještě nebyla nikdy navštívena.</div>`;
  }

  // Visit history
  if (history.length) {
    html += `<div style="font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Historie návštěv</div>
    <div style="background:white;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);margin-bottom:14px">
    ${history.map(h => `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--bg)">
      <div style="font-size:13px;font-weight:700;min-width:70px">${h.date}</div>
      <div style="flex:1;font-size:12px;color:var(--muted)">${h.technik} · W${h.week} · ${h.time||''}${h.dur?' · '+h.dur+'min':''}</div>
      <div style="font-size:14px">${h.gpsOk===false?'<svg class="ic ic-sm" style="color:var(--red)"><use href="#ic-flag"/></svg>':h.gpsOk===true?'✓':''}</div>
    </div>`).join('')}
    </div>`;
  }

  // POS card notes
  if (posNotes.length) {
    html += `<div style="font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Záznamy z karty POS</div>
    <div style="background:white;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);margin-bottom:14px">
    ${posNotes.slice().reverse().map(n=>`<div style="padding:10px 14px;border-bottom:1px solid var(--bg)">
      <div style="font-size:10px;font-weight:700;color:var(--muted)">${n.time} · ${n.author}</div>
      <div style="font-size:13px;margin-top:3px">${n.text}</div>
    </div>`).join('')}
    </div>`;
  }

  // Supply confirmed
  if (supply && supply.confirmed) {
    html += `<div style="background:var(--gl);border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:12px;color:var(--green);display:flex;align-items:center;gap:6px">
      <svg class="ic ic-sm"><use href="#ic-edit"/></svg> Zásobování potvrzeno · ${supply.at} · Přijal: ${supply.receiver}
    </div>`;
  }

  // Materiál (dlouhodobý majetek — Inventory) — struktura: SAP kód, množství,
  // datum instalace, stav. Bez SAP integrace, jen příprava na ni.
  const materials = posModel.materials;
  if (materials.length) {
    const matStatusColor = { ok: 'var(--green)', miss: 'var(--orange)', damaged: 'var(--red)', needs_replacement: 'var(--red)' };
    html += `<div style="font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Materiál (dlouhodobý majetek)</div>
    <div style="background:white;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);margin-bottom:14px">
    ${materials.map(m => `<div style="padding:10px 14px;border-bottom:1px solid var(--bg)">
      <div style="display:flex;align-items:center;gap:8px">
        <div style="flex:1;font-size:13px;font-weight:700">${m.name}</div>
        <span style="font-size:10px;font-weight:700;color:${matStatusColor[m.status]||'var(--muted)'}">${m.status?materialStatusCz(m.status):'Nezkontrolováno'}</span>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">${m.location} · ${m.sapCode||'bez SAP kódu'} · ks: ${m.quantity}${m.installationDate?' · instalováno: '+m.installationDate:''}</div>
      <div style="display:flex;gap:6px;margin-top:6px">
        <button onclick="setAdminMaterialStatus('${posId}','${foundWeek}','${m.location==='vnitřní'?'vnitrni':'venkovni'}','${m.id}','damaged')" style="font-size:10px;font-weight:700;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:${m.status==='damaged'?'var(--rl)':'transparent'};color:var(--red);cursor:pointer">⚠ Poškozeno</button>
        <button onclick="setAdminMaterialStatus('${posId}','${foundWeek}','${m.location==='vnitřní'?'vnitrni':'venkovni'}','${m.id}','needs_replacement')" style="font-size:10px;font-weight:700;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:${m.status==='needs_replacement'?'var(--rl)':'transparent'};color:var(--red);cursor:pointer">⟳ Nutná výměna</button>
      </div>
    </div>`).join('')}
    </div>`;
  }

  // Admin edit section
  html += `<div style="font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Admin — přidat úkol</div>
  <div style="background:white;border-radius:10px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,.06);margin-bottom:14px">
    <input type="text" id="admin-pos-task-input" placeholder="Zadej on-top úkol pro tuto POS…"
      style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:10px 12px;font-size:14px;font-family:inherit;outline:none;margin-bottom:8px"/>
    <button onclick="addAdminPosTask('${posId}','${foundWeek}')"
      style="width:100%;padding:11px;background:var(--navy);color:var(--teal);border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">
      Přidat úkol technikovi ✓
    </button>
  </div>

  <button onclick="closeAdminPOSDrawer()" style="width:100%;padding:13px;border:1.5px solid var(--border);border-radius:10px;background:transparent;font-size:14px;cursor:pointer;color:var(--muted)">Zavřít</button>
  </div>`;

  let drawer = document.getElementById('admin-pos-drawer');
  if (!drawer) {
    drawer = document.createElement('div');
    drawer.id = 'admin-pos-drawer';
    drawer.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:700;display:flex;align-items:flex-end;justify-content:center';
    drawer.innerHTML = `<div id="admin-pos-sheet" style="background:#fff;border-radius:20px 20px 0 0;width:100%;max-width:430px;max-height:88vh;overflow-y:auto"><div style="width:40px;height:4px;background:var(--border);border-radius:2px;margin:16px auto 0"></div></div>`;
    document.body.appendChild(drawer);
    drawer.onclick = e => { if (e.target === drawer) closeAdminPOSDrawer(); };
  }
  document.getElementById('admin-pos-sheet').innerHTML = `<div style="width:40px;height:4px;background:var(--border);border-radius:2px;margin:16px auto 0"></div>` + html;
  drawer.style.display = 'flex';
}

function closeAdminPOSDrawer() {
  const d = document.getElementById('admin-pos-drawer');
  if (d) d.style.display = 'none';
}

function addAdminPosTask(posId, weekKey) {
  const val = document.getElementById('admin-pos-task-input')?.value.trim();
  if (!val) return;
  const p = (FULL_POS_DATA[weekKey]||[]).find(x=>x.id===posId);
  if (!p) return;
  p.taskState.push({text:val, src:'on_top', done:false, note:'Přidáno adminem'});
  const btn = document.querySelector('#admin-pos-sheet button[onclick^="addAdmin"]');
  if (btn) { btn.textContent='✓ Přidáno!'; setTimeout(()=>btn.textContent='Přidat úkol technikovi ✓',2000); }
  document.getElementById('admin-pos-task-input').value = '';
}

function setAdminMaterialStatus(posId, weekKey, section, itemId, status) {
  const p = (FULL_POS_DATA[weekKey]||[]).find(x=>x.id===posId);
  if (!p || !p.inventory) return;
  const item = (p.inventory[section]||[]).find(x=>x.id===itemId);
  if (!item) return;
  item.s = item.s === status ? null : status;
  showAdminPOSDetail(posId);
}

// ── Make admin live list rows clickable ────────────────────────────────────
function showTechPOSList(techName) {
  // POS přiřazené KONKRÉTNÍMU technikovi (filtr přes Excel TECHNICIAN), ne celá firma.
  const all = (FULL_POS_DATA['25'] || []).filter(p => p.assignedTechnician === techName);
  let html = `<div style="padding:20px 18px 32px">
    <div style="font-size:18px;font-weight:800;margin-bottom:4px">${techName}</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:16px">W25 · ${all.length} POS přiřazeno</div>`;

  html += `<div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)">
    ${all.map(p => {
      const hist = getVisitHistory(p.id);
      const last = hist[0];
      const pct = Math.round(p.taskState.filter(t=>t.done).length/Math.max(p.taskState.length,1)*100);
      return `<div style="display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid var(--bg);cursor:pointer"
        onclick="showAdminPOSDetail('${p.id}')">
        <div style="width:8px;height:8px;border-radius:50%;background:${p.v?'var(--green)':'var(--border)'};flex-shrink:0"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.n}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:1px">${last?'Naposledy: '+last.date:'Dosud nenavštíveno'} · ${pct}%</div>
        </div>
        <div style="font-size:18px;color:var(--border)">›</div>
      </div>`;
    }).join('')}
  </div>`;

  html += `<button onclick="closeTechDrawer()" style="width:100%;padding:13px;border:1.5px solid var(--border);border-radius:10px;background:transparent;font-size:14px;cursor:pointer;color:var(--muted);margin-top:14px">Zavřít</button></div>`;

  let drawer = document.getElementById('tech-drawer');
  if (!drawer) {
    drawer = document.createElement('div');
    drawer.id = 'tech-drawer';
    drawer.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:600;display:flex;align-items:flex-end;justify-content:center';
    drawer.innerHTML = `<div id="tech-drawer-sheet" style="background:#fff;border-radius:20px 20px 0 0;width:100%;max-width:430px;max-height:85vh;overflow-y:auto"><div style="width:40px;height:4px;background:var(--border);border-radius:2px;margin:16px auto 0"></div></div>`;
    document.body.appendChild(drawer);
    drawer.onclick = e => { if (e.target === drawer) closeTechDrawer(); };
  }
  document.getElementById('tech-drawer-sheet').innerHTML = `<div style="width:40px;height:4px;background:var(--border);border-radius:2px;margin:16px auto 0"></div>` + html;
  drawer.style.display = 'flex';
}

// ── Patch admin live list to open POS list on click ────────────────────────
const _origRenderAdminLive2 = renderAdminLive;
renderAdminLive = function() {
  _origRenderAdminLive2();
  // Re-wire click handlers to show POS list
  document.querySelectorAll('#adm-live-list .tr').forEach(row => {
    const name = row.querySelector('.tn')?.textContent?.replace(' LIVE','').trim();
    if (name) row.onclick = () => showTechPOSList(name);
  });
};

// ── Auto init day/week on role enter ──────────────────────────────────────
const _origEnterRole2 = enterRole;
enterRole = function(role, opts) {
  autoSetCurrentDay();
  applyAssignments();
  _origEnterRole2(role, opts);
};


// ══════════════════════════════════════════════════════════════════════════
// DAY ASSIGNMENT PERSISTENCE
// ══════════════════════════════════════════════════════════════════════════
function getAssignment(posId) {
  const a = lsg('assign_' + posId);
  return a !== null ? a : undefined;
}
function setAssignment(posId, dayIdx) {
  if (dayIdx === null || dayIdx === undefined) {
    localStorage.removeItem('assign_' + posId);
  } else {
    lss('assign_' + posId, dayIdx);
  }
}

// Apply saved assignments to posData (overrides Excel pre-assignment)
function applyAssignments() {
  Object.values(posData).forEach(list => {
    list.forEach(p => {
      const saved = getAssignment(p.id);
      if (saved !== undefined) {
        p.d = saved;
      }
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════
// REBUILT: PLANNING VIEW — technik picks from week list + overdue
// ══════════════════════════════════════════════════════════════════════════
// Multi-select state pro hromadné přiřazení dne (PART 5) — drží se mimo
// showPlanningView, aby přežilo re-render při zaškrtávání checkboxů.
let planSelection = new Set();

function togglePlanSelect(id) {
  if (planSelection.has(id)) planSelection.delete(id); else planSelection.add(id);
  showPlanningView();
}

function bulkAssignSelected(day) {
  if (!planSelection.size) return;
  const all = posData[cWeek] || [];
  planSelection.forEach(id => {
    const p = all.find(x => x.id === id);
    if (p) { p.d = day; setAssignment(p.id, day); }
  });
  planSelection.clear();
  updateSummary(); renderChips(); renderDayTabs();
  showPlanningView();
}

function showPlanningView() {
  cView = 'planning'; saveTechUIState();
  const wrap = document.getElementById('pos-list-wrap');
  wrap.innerHTML = '';
  const all = posData[cWeek] || [];
  const todayIdx = getTodayDayIdx();
  const isCurrentWeek = cWeek === getCurrentWeekNum();

  // Back button
  const back = document.createElement('div');
  back.style.cssText = 'padding:10px 12px 4px';
  back.innerHTML = `<button onclick="planSelection.clear();renderList()" style="background:none;border:none;color:var(--td);font-size:13px;font-weight:700;cursor:pointer">← Zpět na denní plán</button>`;
  wrap.appendChild(back);

  // Header
  const hdr = document.createElement('div');
  hdr.style.cssText = 'padding:8px 16px 4px';
  hdr.innerHTML = `<div style="font-size:16px;font-weight:800;color:var(--navy)">Naplánovat POS</div>
    <div style="font-size:12px;color:var(--muted);margin-top:2px">Zaškrtni POS, vyber den a přiřaď je všechny najednou</div>`;
  wrap.appendChild(hdr);

  // Bulk action bar — viditelná jen pokud je něco vybráno
  if (planSelection.size > 0) {
    const bar = document.createElement('div');
    bar.style.cssText = 'position:sticky;top:0;z-index:10;margin:8px 12px;padding:10px 12px;background:var(--navy);border-radius:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap';
    bar.innerHTML = `<span style="color:#fff;font-size:12px;font-weight:700;margin-right:4px">${planSelection.size} vybráno</span>
      ${DAYS.map((d, i) => `<button onclick="bulkAssignSelected(${i})" style="font-size:11px;font-weight:700;color:var(--navy);background:var(--teal);border:none;border-radius:7px;padding:6px 10px;cursor:pointer">${d}</button>`).join('')}
      <button onclick="planSelection.clear();showPlanningView()" style="margin-left:auto;font-size:11px;color:#fff;background:none;border:1px solid rgba(255,255,255,.3);border-radius:7px;padding:6px 10px;cursor:pointer">Zrušit výběr</button>`;
    wrap.appendChild(bar);
  }

  // Overdue section (current week only)
  const overdue = isCurrentWeek ? getOverduePOS(cWeek) : [];
  if (overdue.length) {
    const lbl = document.createElement('div');
    lbl.className = 'sec-lbl';
    lbl.style.color = 'var(--red)';
    lbl.textContent = `Nesplněné z minulých dní (${overdue.length})`;
    wrap.appendChild(lbl);
    overdue.forEach(p => wrap.appendChild(makePlanCard(p, all.indexOf(p), true)));
  }

  // Unplanned section
  const unpl = all.filter(p => (p.d === null || p.d === undefined) && !p.v);
  const lbl2 = document.createElement('div');
  lbl2.className = 'sec-lbl';
  lbl2.style.display = 'flex';
  lbl2.style.justifyContent = 'space-between';
  lbl2.style.paddingRight = '18px';
  lbl2.innerHTML = `<span>Nepřiřazené POS (${unpl.length})</span>${unpl.length ? `<a href="#" onclick="event.preventDefault();selectAllUnplanned()" style="color:var(--teal);font-weight:700;font-size:11px">Vybrat vše</a>` : ''}`;
  wrap.appendChild(lbl2);

  if (!unpl.length) {
    const e = document.createElement('div');
    e.style.cssText = 'padding:20px;text-align:center;color:var(--muted);font-size:13px';
    e.innerHTML = '<svg class="ic ic-sm" style="color:var(--green);vertical-align:-2px;margin-right:3px"><use href="#ic-check-circle"/></svg>Všechny POS jsou přiřazené ke dnům.';
    wrap.appendChild(e);
  } else {
    unpl.forEach(p => wrap.appendChild(makePlanCard(p, all.indexOf(p), true)));
  }

  // Already planned section (grouped by day)
  const planned = all.filter(p => p.d !== null && p.d !== undefined && !p.v);
  if (planned.length) {
    const lbl3 = document.createElement('div');
    lbl3.className = 'sec-lbl';
    lbl3.textContent = `Naplánované (${planned.length})`;
    wrap.appendChild(lbl3);
    DAYS.forEach((dname, di) => {
      const dayPos = planned.filter(p => p.d === di);
      if (!dayPos.length) return;
      const dlbl = document.createElement('div');
      dlbl.style.cssText = 'padding:6px 16px 2px;font-size:11px;font-weight:700;color:var(--td)';
      dlbl.textContent = `${dname} ${WEEKS_META[cWeek].dd[di]}${di===todayIdx&&isCurrentWeek?' · DNES':''} (${dayPos.length})`;
      wrap.appendChild(dlbl);
      dayPos.forEach(p => wrap.appendChild(makePlanCard(p, all.indexOf(p), true)));
    });
  }
}

function selectAllUnplanned() {
  const all = posData[cWeek] || [];
  all.filter(p => (p.d === null || p.d === undefined) && !p.v).forEach(p => planSelection.add(p.id));
  showPlanningView();
}

function makePlanCard(p, ri, selectable) {
  const card = document.createElement('div');
  card.className = 'pos-card';
  card.style.cursor = 'default';
  const dayBadge = (p.d !== null && p.d !== undefined)
    ? `<span style="font-size:11px;font-weight:700;color:var(--td);background:var(--tl);padding:3px 9px;border-radius:20px">${DAYS[p.d]} ${WEEKS_META[cWeek].dd[p.d]}</span>`
    : `<span style="font-size:11px;font-weight:700;color:var(--muted);background:var(--bg);padding:3px 9px;border-radius:20px">Nepřiřazeno</span>`;
  const checked = planSelection.has(p.id);
  const checkbox = selectable
    ? `<input type="checkbox" ${checked?'checked':''} onclick="event.stopPropagation();togglePlanSelect('${p.id}')" style="width:20px;height:20px;flex-shrink:0;accent-color:var(--teal);cursor:pointer"/>`
    : '';
  card.innerHTML = `
    <div class="pci">
      ${checkbox}
      <div class="pinfo">
        <div class="pname">${p.n} <span style="font-weight:600;color:var(--muted);font-size:11px">#${p.id}</span></div>
        <div class="paddr">${p.a}</div>
        <div class="pmeta">${typTag(p)}</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;padding:0 14px 12px">
      ${dayBadge}
      <button onclick="openAssign('${p.id}')" style="margin-left:auto;font-size:12px;font-weight:700;color:var(--navy);background:var(--teal);border:none;border-radius:8px;padding:6px 14px;cursor:pointer">
        ${(p.d!==null&&p.d!==undefined)?'Změnit den':'+ Přiřadit den'}
      </button>
    </div>`;
  return card;
}


// ══════════════════════════════════════════════════════════════════════════
// EDITOR SECTIONS (texty / kampaně / inventory katalog)
// ══════════════════════════════════════════════════════════════════════════
function showEditorSection(sec, btn) {
  ['texty','kampane','inventory'].forEach(s => {
    const el = document.getElementById('ed-sec-' + s);
    if (el) el.style.display = s === sec ? 'block' : 'none';
  });
  document.querySelectorAll('.ed-subnav').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (sec === 'kampane') renderEditorCampaigns();
  if (sec === 'inventory') renderEditorCatalog();
}

// ── EDITABLE CAMPAIGNS ─────────────────────────────────────────────────────
function getEditorCampaigns() {
  const saved = lsg('editor_campaigns');
  if (saved) return saved;
  // Seed from CAMPAIGNS default
  return [
    {type:'Losy', name:'Zlatá rybka — nová emise', dates:'W23–W28', deadline:'2025-07-11', items:'POUZE nová emise Zlaté rybky — ne původní!\nPlakát A4 nad displej\nStojánek 20 Mega'},
    {type:'Loterie', name:'EuroJackpot', dates:'W23–W28', deadline:'2025-07-11', items:'Plakát A4 EuroJackpot nad displej\nNa Corn totem: 2 plakáty (losy + loterie)'},
    {type:'Rebranding', name:'Rebranding — 2 POS/den', dates:'Probíhá', deadline:'2025-07-11', items:'Norma 2 rebrandované POS/den\nOdstranit samolepky Sazka mobil\nORLEN: jen výměna losů, NE rebranding'},
  ];
}
function saveEditorCampaigns(camps) { lss('editor_campaigns', camps); }

function renderEditorCampaigns() {
  const camps = getEditorCampaigns();
  const el = document.getElementById('ed-campaigns-list');
  if (!el) return;
  el.innerHTML = camps.map((c,i) => `
    <div class="editor-card" style="margin-bottom:10px">
      <div class="editor-item">
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <input value="${c.type||''}" placeholder="Typ" oninput="updateCampaign(${i},'type',this.value)" style="width:90px;border:1.5px solid var(--border);border-radius:8px;padding:8px;font-size:12px;font-weight:700;outline:none"/>
          <input value="${c.name||''}" placeholder="Název kampaně" oninput="updateCampaign(${i},'name',this.value)" style="flex:1;border:1.5px solid var(--border);border-radius:8px;padding:8px;font-size:13px;outline:none"/>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <input value="${c.dates||''}" placeholder="Termín" oninput="updateCampaign(${i},'dates',this.value)" style="flex:1;border:1.5px solid var(--border);border-radius:8px;padding:8px;font-size:12px;outline:none"/>
          <input type="date" value="${c.deadline||''}" oninput="updateCampaign(${i},'deadline',this.value)" style="border:1.5px solid var(--border);border-radius:8px;padding:8px;font-size:12px;outline:none"/>
        </div>
        <textarea placeholder="Co osadit (každý řádek = položka)" oninput="updateCampaign(${i},'items',this.value)" style="width:100%;border:1.5px solid var(--border);border-radius:8px;padding:8px;font-size:12px;font-family:inherit;resize:none;min-height:60px;outline:none;line-height:1.5">${c.items||''}</textarea>
        <button onclick="deleteCampaign(${i})" style="margin-top:8px;padding:6px 12px;background:var(--rl);color:var(--red);border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">Smazat kampaň</button>
      </div>
    </div>`).join('');
}
function updateCampaign(i, field, val) {
  const camps = getEditorCampaigns();
  camps[i][field] = val;
  saveEditorCampaigns(camps);
}
function addCampaign() {
  const camps = getEditorCampaigns();
  camps.push({type:'Losy', name:'Nová kampaň', dates:'', deadline:'', items:''});
  saveEditorCampaigns(camps);
  renderEditorCampaigns();
}
function deleteCampaign(i) {
  const camps = getEditorCampaigns();
  camps.splice(i,1);
  saveEditorCampaigns(camps);
  renderEditorCampaigns();
}

// ── EDITABLE INVENTORY CATALOG ─────────────────────────────────────────────
function renderEditorCatalog() {
  const cat = getInvCatalog();
  ['vnitrni','venkovni'].forEach(section => {
    const el = document.getElementById('ed-cat-' + section);
    if (!el) return;
    const items = cat[section] || [];
    el.innerHTML = items.map((item,i) => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--bg)">
        <div style="width:36px;height:36px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border:1.5px solid var(--border);border-radius:8px;color:var(--teal)">${item.i}</div>
        <input value="${item.n}" oninput="updateCatalogItem('${section}',${i},'n',this.value)" style="flex:1;border:1.5px solid var(--border);border-radius:8px;padding:8px;font-size:13px;outline:none"/>
        <button onclick="deleteCatalogItem('${section}',${i})" style="background:none;border:none;color:var(--red);font-size:16px;cursor:pointer;padding:4px">✕</button>
      </div>`).join('') || '<div style="padding:16px;text-align:center;color:var(--muted);font-size:12px">Žádné položky</div>';
  });
}
function updateCatalogItem(section, i, field, val) {
  const cat = getInvCatalog();
  cat[section][i][field] = val;
  saveInvCatalog(cat);
}
function addCatalogItem(section) {
  const cat = getInvCatalog();
  if (!cat[section]) cat[section] = [];
  cat[section].push({i: section==='venkovni'?ic('ic-building'):ic('ic-box'), n:'Nová položka'});
  saveInvCatalog(cat);
  renderEditorCatalog();
}
function deleteCatalogItem(section, i) {
  const cat = getInvCatalog();
  cat[section].splice(i,1);
  saveInvCatalog(cat);
  renderEditorCatalog();
}

// ── Patch renderCampaigns to use editor campaigns ──────────────────────────
const _origRenderCampaigns = renderCampaigns;
renderCampaigns = function() {
  const editorCamps = lsg('editor_campaigns');
  if (!editorCamps || !editorCamps.length) {
    _origRenderCampaigns();
    return;
  }
  const wrap = document.getElementById('camp-wrap');
  if (!wrap) return;
  const typeColors = {'Losy':'camp-losy','Loterie':'camp-lot','Rebranding':'camp-rebranding'};
  const typeLabels = {'Losy':'Losy','Loterie':'Loterie','Rebranding':'Rebranding','ORLEN':'ORLEN','Corn':'Corn'};
  wrap.innerHTML = editorCamps.map(c => {
    const cls = typeColors[c.type] || 'camp-losy';
    const lbl = typeLabels[c.type] || c.type;
    const items = (c.items||'').split('\n').filter(Boolean);
    let daysLeft = '';
    if (c.deadline) {
      const dl = new Date(c.deadline);
      const days = Math.ceil((dl - new Date())/86400000);
      daysLeft = days<=0?'Dnes!':days===1?'Zítra':days+' dní';
    }
    return `<div class="camp-card ${cls}"><div class="camp-inner">
      <div class="camp-type">${lbl}</div>
      <div class="camp-name">${c.name}</div>
      ${c.dates?`<div class="camp-dates"><svg class="ic ic-sm"><use href="#ic-calendar"/></svg> ${c.dates}</div>`:''}
      <div class="camp-items">${items.map(it=>`<div class="camp-item"><div class="camp-dot"></div>${it}</div>`).join('')}</div>
      ${c.deadline?`<div class="camp-dl"><svg class="ic ic-sm"><use href="#ic-clock"/></svg> Deadline: ${c.deadline.split('-').reverse().join('. ')} · ${daysLeft}</div>`:''}
    </div></div>`;
  }).join('');
};

// ── Patch showAdmPage for editor sections ──────────────────────────────────
const _____origShowAdmPage = showAdmPage;
showAdmPage = function(p, btn) {
  _____origShowAdmPage(p, btn);
  if (p === 'editor') {
    initEditor();
    showEditorSection('texty', document.querySelector('.ed-subnav'));
  }
  if (p === 'import') { renderImportSourceLabel(); renderPosMasterSourceLabel(); }
};

// ══════════════════════════════════════════════════════
// DATA IMPORT — Velín nahrání reálného Tourplan exportu (PART 2)
// ══════════════════════════════════════════════════════
// Statický web (GitHub Pages, žádný backend) — nahraný soubor se parsuje
// čistě v prohlížeči (SheetJS) tou samou ExcelImport.buildPosWeeks() logikou,
// která dnes zpracovává baked TOURPLAN_RAW. Po potvrzení se uloží do
// localStorage a appka se reloadne, aby DataProvider načetl nová data jako
// jediný zdroj pravdy (žádný paralelní fake dataset vedle reálného importu).
let pendingImportRows = null, pendingImportFileName = null;

function renderImportSourceLabel(){
  const el = document.getElementById('import-source-label');
  if(!el) return;
  const src = DataProvider.getSource();
  if(!src){ el.textContent = '—'; return; }
  el.textContent = src.type === 'upload'
    ? `Aktivní zdroj: nahraný soubor „${src.fileName}“ (${new Date(src.importedAt).toLocaleString('cs-CZ')})`
    : `Aktivní zdroj: baked export „${src.fileName}“`;
}

function parseSheetRows(workbook){
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
  // Odstraň prázdné řádky a hlavičkový řádek (pokud TERMINAL_ID/POS_ID
  // nejsou čistě číselné, jde o popisek sloupce, ne reálný řádek dat).
  const nonEmpty = rows.filter(r => r.some(c => String(c).trim() !== ''));
  if(nonEmpty.length && nonEmpty[0].length >= 2){
    const first = nonEmpty[0];
    if(!/^\d+$/.test(String(first[0]).trim()) || !/^\d+$/.test(String(first[1]).trim())){
      nonEmpty.shift();
    }
  }
  return nonEmpty;
}

function handleImportFile(e){
  const file = e.target.files[0];
  if(!file) return;
  const statusEl = document.getElementById('import-status');
  statusEl.textContent = 'Načítám a parsuji soubor…';
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const workbook = XLSX.read(ev.target.result, { type: 'array' });
      const rows = parseSheetRows(workbook);
      ExcelImport.validateColumns(rows);
      const { summary, warnings } = ExcelImport.buildPosWeeks(rows, POS_WEEK_KEYS, { currentWeek: CURRENT_OPS_WEEK, todayIdx: getTodayDayIdx() });
      pendingImportRows = rows;
      pendingImportFileName = file.name;
      renderImportPreview(summary, warnings);
      statusEl.textContent = `Soubor „${file.name}“ načten — ${rows.length} řádků.`;
    } catch(err){
      statusEl.textContent = `Chyba při zpracování souboru: ${err.message}`;
      document.getElementById('import-preview-block').style.display = 'none';
      pendingImportRows = null;
    }
  };
  reader.readAsArrayBuffer(file);
}

function renderImportPreview(summary, warnings){
  const block = document.getElementById('import-preview-block');
  block.style.display = 'block';
  const kpis = document.getElementById('import-preview-kpis');
  kpis.innerHTML = `
    <div class="kpi"><div class="kpi-v">${summary.technicians}</div><div class="kpi-l">techniků</div></div>
    <div class="kpi"><div class="kpi-v">${summary.posCount}</div><div class="kpi-l">POS</div></div>
    <div class="kpi"><div class="kpi-v">${summary.terminalCount}</div><div class="kpi-l">terminálů</div></div>
  `;
  const checks = [
    { ok: summary.posCount > 0, label: 'POS ID detekována' },
    { ok: summary.terminalCount > 0, label: 'Terminal ID detekována' },
    { ok: summary.technicians > 0, label: 'Technici namapováni' },
    { ok: summary.missingAddress < summary.terminalCount, label: 'Adresy/oblasti detekovány' },
  ];
  document.getElementById('import-checklist').innerHTML = checks.map(c =>
    `<div style="display:flex;align-items:center;gap:8px;font-size:13px;padding:4px 0;color:${c.ok ? 'var(--ok,#16a34a)' : 'var(--danger,#dc2626)'}">${c.ok ? '✓' : '✗'} ${c.label}</div>`
  ).join('');
  const warnEl = document.getElementById('import-warnings');
  warnEl.innerHTML = warnings.length
    ? `<div style="font-size:13px;color:var(--muted)"><strong>Upozornění:</strong><br>${warnings.map(w => `• ${w}`).join('<br>')}</div>`
    : '';
}

function confirmImport(){
  if(!pendingImportRows) return;
  DataProvider.setOverride(pendingImportRows, pendingImportFileName);
  location.reload();
}

function cancelImportPreview(){
  pendingImportRows = null;
  pendingImportFileName = null;
  document.getElementById('import-preview-block').style.display = 'none';
  document.getElementById('import-file-input').value = '';
  document.getElementById('import-status').textContent = '';
}

// ══════════════════════════════════════════════════════
// POS MASTER DATA IMPORT — GPS + otevírací doba, samostatné od Tourplan výše
// ══════════════════════════════════════════════════════
let pendingPosMasterRows = null, pendingPosMasterFileName = null;

function renderPosMasterSourceLabel(){
  const el = document.getElementById('pos-master-source-label');
  if(!el) return;
  const src = DataProvider.getPosMasterSource();
  el.textContent = src
    ? `Aktivní zdroj: nahraný soubor „${src.fileName}“ (${new Date(src.importedAt).toLocaleString('cs-CZ')})`
    : 'Žádná master data nenahrána — appka pro tyto POS nemá reálné GPS ani otevírací dobu (zobrazí se jako odhad/neznámé, nepočítá se do trasy).';
}

function handlePosMasterImportFile(e){
  const file = e.target.files[0];
  if(!file) return;
  const statusEl = document.getElementById('pos-master-status');
  statusEl.textContent = 'Načítám a parsuji soubor…';
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const workbook = XLSX.read(ev.target.result, { type: 'array' });
      const rows = parseSheetRows(workbook);
      PosMasterData.validateColumns(rows);
      const { summary, warnings } = PosMasterData.buildPosMasterMap(rows);
      pendingPosMasterRows = rows;
      pendingPosMasterFileName = file.name;
      renderPosMasterPreview(summary, warnings);
      statusEl.textContent = `Soubor „${file.name}“ načten — ${rows.length} řádků.`;
    } catch(err){
      statusEl.textContent = `Chyba při zpracování souboru: ${err.message}`;
      document.getElementById('pos-master-preview-block').style.display = 'none';
      pendingPosMasterRows = null;
    }
  };
  reader.readAsArrayBuffer(file);
}

function renderPosMasterPreview(summary, warnings){
  const block = document.getElementById('pos-master-preview-block');
  block.style.display = 'block';
  document.getElementById('pos-master-preview-kpis').innerHTML = `
    <div class="kpi"><div class="kpi-v">${summary.posCount}</div><div class="kpi-l">POS s master daty</div></div>
    <div class="kpi"><div class="kpi-v">${summary.posCount - summary.missingCoords}</div><div class="kpi-l">s reálným GPS</div></div>
    <div class="kpi"><div class="kpi-v">${summary.posCount - summary.missingHours}</div><div class="kpi-l">s otevírací dobou</div></div>
  `;
  const hasDuplicates = summary.duplicates > 0;
  const warnEl = document.getElementById('pos-master-warnings');
  const otherWarnings = warnings.filter(w => !w.includes('duplicitních'));
  warnEl.innerHTML = (hasDuplicates
    ? `<div style="font-size:13px;color:#cc2200;font-weight:700;margin-bottom:8px">⚠ Import zablokován — ${summary.duplicates} duplicitních POS ID (${summary.duplicateIds.slice(0,10).join(', ')}${summary.duplicateIds.length>10?'…':''}). Oprav soubor a nahraj znovu.</div>`
    : '') +
    (otherWarnings.length
      ? `<div style="font-size:13px;color:var(--muted)"><strong>Upozornění:</strong><br>${otherWarnings.map(w => `• ${w}`).join('<br>')}</div>`
      : '');
  const confirmBtn = document.getElementById('pos-master-confirm-btn');
  if (confirmBtn) {
    confirmBtn.disabled = hasDuplicates;
    confirmBtn.style.opacity = hasDuplicates ? '0.5' : '1';
    confirmBtn.style.cursor = hasDuplicates ? 'not-allowed' : 'pointer';
  }
}

function confirmPosMasterImport(){
  if(!pendingPosMasterRows) return;
  const { summary } = PosMasterData.buildPosMasterMap(pendingPosMasterRows);
  if (summary.duplicates > 0) return; // blokující chyba — tlačítko by mělo být disabled, ale ověř i tady
  DataProvider.setPosMasterOverride(pendingPosMasterRows, pendingPosMasterFileName);
  location.reload();
}

function cancelPosMasterImportPreview(){
  pendingPosMasterRows = null;
  pendingPosMasterFileName = null;
  document.getElementById('pos-master-preview-block').style.display = 'none';
  document.getElementById('pos-master-file-input').value = '';
  document.getElementById('pos-master-status').textContent = '';
}

// ── Landing screen: live stats + ambient background + mini control-center map ──
(function initLandingScreen() {
  const landingTechs = deriveAllTechnicians();
  const techCount = landingTechs.length;
  const totalPOS = landingTechs.reduce((s, t) => s + (t.total || 0), 0);
  const techEl = document.getElementById('rs-stat-tech-v');
  const posEl = document.getElementById('rs-stat-pos-v');
  const badgeEl = document.getElementById('rs-badge');
  if (techEl) techEl.textContent = techCount;
  if (posEl) posEl.textContent = totalPOS;
  if (badgeEl) badgeEl.textContent = `Tourplan W${CURRENT_OPS_WEEK} · ${techCount} techniků · ${totalPOS} POS`;

  // Coverage + route time saved — reálně odvozeno (žádné statické "98%"/"37h").
  const totalDone = landingTechs.reduce((s, t) => s + (t.done || 0), 0);
  const covEl = document.getElementById('rs-stat-cov-v');
  if (covEl) covEl.textContent = totalPOS ? `${Math.round(totalDone / totalPOS * 100)}%` : '—';
  const savedEl = document.getElementById('rs-stat-saved-v');
  const routes = buildAllDailyRoutes();
  const fleet = Object.keys(routes).length ? RouteEngine.analyzeFleet(routes) : null;
  if (savedEl) savedEl.textContent = fleet ? `${fleet.wastedHours.toFixed(0)}h` : '—';

  const savedIntelEl = document.getElementById('rs-intel-saved');
  if (savedIntelEl) savedIntelEl.textContent = fleet ? `Route optimization could save ${fleet.wastedHours.toFixed(0)}h this week` : 'No route data this week';
  const overdueCount = landingTechs.filter(t => t.overdue).length;
  const attentionEl = document.getElementById('rs-intel-attention');
  if (attentionEl) attentionEl.textContent = `${overdueCount} technician${overdueCount === 1 ? '' : 's'} behind schedule`;
  const covPct = totalPOS ? Math.round(totalDone / totalPOS * 100) : 0;
  const covIntelEl = document.getElementById('rs-intel-cov');
  const covDotEl = document.getElementById('rs-intel-cov-dot');
  if (covIntelEl) covIntelEl.textContent = `Coverage this week: ${covPct}% (${covPct >= 70 ? 'on track' : 'behind'})`;
  if (covDotEl) covDotEl.className = `rs-intel-dot ${covPct >= 70 ? 'rs-id-g' : 'rs-id-o'}`;

  function buildNetwork(dotsG, linesG, pts, alertIdx) {
    if (!dotsG || !linesG) return;
    pts.forEach((p, i) => {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', p.x.toFixed(1));
      c.setAttribute('cy', p.y.toFixed(1));
      c.setAttribute('r', alertIdx && alertIdx.has(i) ? 2.6 : 2.2);
      if (alertIdx && alertIdx.has(i)) c.setAttribute('class', 'alert');
      dotsG.appendChild(c);
    });
    pts.forEach((p, i) => {
      let nearest = null, nd = Infinity;
      pts.forEach((q, j) => {
        if (i === j) return;
        const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
        if (d < nd) { nd = d; nearest = q; }
      });
      if (nearest && nd < 280 * 280) {
        const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        l.setAttribute('x1', p.x.toFixed(1));
        l.setAttribute('y1', p.y.toFixed(1));
        l.setAttribute('x2', nearest.x.toFixed(1));
        l.setAttribute('y2', nearest.y.toFixed(1));
        linesG.appendChild(l);
      }
    });
  }

  // ambient full-screen background network
  const bgPts = [];
  for (let i = 0; i < 26; i++) {
    bgPts.push({ x: (Math.random() * 12 + 0.5) * (1200 / 12), y: (Math.random() * 8 + 0.5) * (800 / 8) });
  }
  buildNetwork(document.getElementById('rs-net-dots'), document.getElementById('rs-net-lines'), bgPts, null);

  // mini control-center map, derived from real technician GPS spread
  const ccPts = landingTechs.map(t => {
    const pos = techDisplayLatLng(t);
    return {
      x: ((pos.lng - 12.0) / (18.9 - 12.0)) * 220,
      y: (1 - (pos.lat - 48.5) / (51.1 - 48.5)) * 110,
    };
  });
  const ccAlert = new Set(landingTechs.map((t, i) => t.overdue ? i : -1).filter(i => i >= 0));
  buildNetwork(document.getElementById('rs-cc-dots'), document.getElementById('rs-cc-lines'), ccPts, ccAlert);
})();

