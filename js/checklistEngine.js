// ══════════════════════════════════════════════════════
// CHECKLIST ENGINE — podmíněný checklist (Ano/Ne větvení → navazující
// otázka/foto). Generická schopnost, znovupoužitelná pro libovolnou
// budoucí kampaň definovanou v checklistTemplates.js.
// ══════════════════════════════════════════════════════
// DOM-free jádro (visibleQuestions) je testovatelné samostatně. Render
// funkce (renderChecklist) je tenká vrstva nad tím pro UI v POS detailu.

function visibleQuestions(template, answers) {
  answers = answers || {};
  return template.questions.filter(q => {
    if (!q.condition) return true;
    return answers[q.condition.dependsOn] === q.condition.equals;
  });
}

function checklistProgress(template, answers) {
  const visible = visibleQuestions(template, answers);
  const answered = visible.filter(q => answers[q.id] !== undefined && answers[q.id] !== '').length;
  return { answered, total: visible.length };
}

function renderChecklistHtml(template, answers) {
  answers = answers || {};
  const visible = visibleQuestions(template, answers);
  return visible.map(q => {
    if (q.type === 'bool') {
      const val = answers[q.id];
      return `<div class="ck-q">
        <div class="ck-q-lbl">${q.label}</div>
        <div class="ck-yn">
          <button class="ck-yn-btn ${val==='Ano'?'yes on':'yes'}" onclick="setChecklistAnswer('${q.id}','Ano')">Ano</button>
          <button class="ck-yn-btn ${val==='Ne'?'no on':'no'}" onclick="setChecklistAnswer('${q.id}','Ne')">Ne</button>
        </div>
      </div>`;
    }
    if (q.type === 'text') {
      const val = answers[q.id] || '';
      return `<div class="ck-q ck-q-sub">
        <div class="ck-q-lbl">${q.label}</div>
        <input class="ck-text-input" type="text" value="${val.replace(/"/g,'&quot;')}" oninput="setChecklistAnswer('${q.id}',this.value)" placeholder="Doplň..."/>
      </div>`;
    }
    if (q.type === 'photo') {
      const has = !!answers[q.id];
      return `<div class="ck-q ck-q-sub">
        <div class="ck-q-lbl">${q.label}</div>
        <button class="ck-photo-btn ${has?'on':''}" onclick="setChecklistAnswer('${q.id}', ${has?'undefined':"'pending'"})">
          <svg class="ic ic-sm"><use href="#ic-camera"/></svg> ${has?'Foto přiloženo':'Přidat foto'}
        </button>
      </div>`;
    }
    if (q.type === 'select') {
      const val = answers[q.id] || '';
      const opts = (q.options||[]).map(o=>`<option value="${o}" ${o===val?'selected':''}>${o}</option>`).join('');
      return `<div class="ck-q ck-q-sub">
        <div class="ck-q-lbl">${q.label}</div>
        <select class="ck-select" onchange="setChecklistAnswer('${q.id}',this.value)"><option value="">—</option>${opts}</select>
      </div>`;
    }
    return '';
  }).join('');
}

const ChecklistEngine = { visibleQuestions, checklistProgress, renderChecklistHtml };
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChecklistEngine;
} else {
  (typeof window !== 'undefined' ? window : globalThis).ChecklistEngine = ChecklistEngine;
}
