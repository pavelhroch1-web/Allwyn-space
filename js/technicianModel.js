// ══════════════════════════════════════════════════════
// TECHNICIAN MODEL — odvozené statistiky technika, NIKDY uložené
// ══════════════════════════════════════════════════════
// Vstup: plochý seznam POS (PosModel raw objekty s assignedTechnician/d/v/lat/lng).
// Výstup: agregace per technik. Žádné pole jako "completedVisits" se nikdy
// neukládá na technika — vždy se počítá z POS listu v okamžiku volání.

(function(global){

  function initialsFromName(name){
    // Konvence datasetu: "Příjmení Jméno" -> initials = Jméno[0] + Příjmení[0]
    const parts = (name||'').trim().split(/\s+/);
    if (parts.length < 2) return (parts[0]||'').slice(0,2).toUpperCase();
    const [surname, given] = parts;
    return (given[0]+surname[0]).toUpperCase();
  }

  // Nejčastější region v seznamu POS technika (technik může mít POS i mimo
  // domovský region, ale pro zobrazení/filtr potřebujeme jeden "domovský").
  function dominantRegion(list){
    const counts = {};
    list.forEach(p => { const r = p.region || p.area || 'RSE'; counts[r] = (counts[r]||0)+1; });
    return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'RSE';
  }

  // Technik je "pozadu", pokud má z tohoto týdne POS na den < dnes, nesplněné.
  function isOverdue(list, todayIdx){
    if (todayIdx === null || todayIdx === undefined) return false;
    return list.some(p => p.d !== null && p.d !== undefined && p.d < todayIdx && !p.v);
  }

  // Aktivita technika dnes — odvozená z dnešní trasy (žádné vymyšlené stavy).
  function computeActivity(list, todayIdx){
    if (todayIdx === null || todayIdx === undefined) {
      return { code: 'weekend', label: 'Mimo směnu (víkend)', currentPos: null };
    }
    const todays = list.filter(p => p.d === todayIdx);
    if (!todays.length) {
      return { code: 'off-route', label: 'Bez plánu na dnes', currentPos: null };
    }
    const remaining = todays.filter(p => !p.v).sort((a,b) => (a.id||'').localeCompare(b.id||''));
    if (!remaining.length) {
      return { code: 'done', label: 'Dokončil den', currentPos: null };
    }
    return { code: 'on-pos', label: 'Na POS', currentPos: remaining[0] };
  }

  // computeOne(name, list, opts) -> jeden technik se VŠEMI poli odvozenými
  // z `list` (POS přiřazené tomuto technikovi přes všechny týdny/dny).
  // opts.todayIdx: getTodayDayIdx() výsledek (0-4 nebo null o víkendu).
  function computeOne(name, list, opts){
    opts = opts || {};
    const todayIdx = opts.todayIdx;
    const total = list.length;
    const done = list.filter(p => p.v).length;
    const pct = total ? Math.round(done/total*100) : 0;
    const activity = computeActivity(list, todayIdx);
    const overdue = isOverdue(list, todayIdx);
    return {
      name,
      initials: initialsFromName(name),
      region: dominantRegion(list),
      total,
      done,
      pct,
      overdue,
      activityCode: activity.code,
      activityLabel: activity.label,
      currentPos: activity.currentPos,
      pos: list,
    };
  }

  // deriveTechnicians(allPos, opts) -> [] jeden řádek za technika, seskupeno
  // podle p.assignedTechnician. Jediný zdroj pravdy pro Velín (Live/Technici/Map/Dashboard).
  function deriveTechnicians(allPos, opts){
    const byTech = {};
    (allPos||[]).forEach(p => {
      const name = p.assignedTechnician || 'Nepřiřazeno';
      (byTech[name] = byTech[name] || []).push(p);
    });
    return Object.entries(byTech).map(([name, list]) => computeOne(name, list, opts));
  }

  const TechnicianModel = {
    initialsFromName,
    dominantRegion,
    isOverdue,
    computeActivity,
    computeOne,
    deriveTechnicians,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TechnicianModel;
  } else {
    global.TechnicianModel = TechnicianModel;
  }

})(typeof window !== 'undefined' ? window : globalThis);
