// ══════════════════════════════════════════════════════
// CHECKLIST_TEMPLATES — generický popis podmíněných otázek pro checklist
// ══════════════════════════════════════════════════════
// Šablona = pole otázek. Každá otázka:
//   id        — klíč v answers
//   label     — text otázky (česky, zobrazí se technikovi)
//   type      — 'bool' (Ano/Ne tlačítka) | 'text' | 'photo' | 'select'
//   options   — pro 'select'
//   condition — { dependsOn: <id otázky>, equals: <hodnota> } — otázka se
//               zobrazí jen pokud dependsOn má přesně tuto hodnotu.
//               Bez condition = otázka je vždy vidět.
//
// Šablona "rebranding-idt-kam" odpovídá reálné kampani Rebranding IDT-KAM
// (viz visitChecklistRaw.js) — zatím definovaná staticky v kódu. Velín
// konfigurace šablon přes UI je budoucí krok, ne součást tohoto enginu.
const CHECKLIST_TEMPLATES = {
  "rebranding-idt-kam": {
    id: "rebranding-idt-kam",
    name: "Rebranding IDT-KAM",
    questions: [
      { id: "eso_vymenene", label: "Je ESO ALLWYN vyměněno?", type: "bool" },
      { id: "eso_sviti", label: "Svítí?", type: "bool",
        condition: { dependsOn: "eso_vymenene", equals: "Ano" } },
      { id: "eso_sviti_duvod", label: "Důvod proč nesvítí?", type: "text",
        condition: { dependsOn: "eso_sviti", equals: "Ne" } },
      { id: "eso_bez_zavad", label: "ESO ALLWYN nainstalováno bez závad?", type: "bool" },
      { id: "eso_zavada_popis", label: "Závada instalace ESO (popiš)", type: "text",
        condition: { dependsOn: "eso_bez_zavad", equals: "Ne" } },
      { id: "samolepky_vymenene", label: "Jsou vyměněné samolepky ALLWYN?", type: "bool" },
      { id: "samolepky_co_spatne", label: "Co je špatně?", type: "text",
        condition: { dependsOn: "samolepky_vymenene", equals: "Ne" } },
      { id: "ext_nestandard", label: "Exteriér nestandard?", type: "bool" },
      { id: "ext_nestandard_jaky", label: "Exteriér nestandard – jaký?", type: "text",
        condition: { dependsOn: "ext_nestandard", equals: "Ano" } },
      { id: "totem_sazka", label: "Je v pokladní zóně Totem SAZKA?", type: "bool" },
      { id: "totem_sazka_foto", label: "Foto Totem SAZKA", type: "photo",
        condition: { dependsOn: "totem_sazka", equals: "Ano" } },
      { id: "iso_totem", label: "ISO Totem instalován?", type: "bool" },
      { id: "deska_losy", label: "Deska losy instalována?", type: "bool" },
      { id: "cdu_lcd", label: "CDU/LCD instalováno?", type: "bool" },
      { id: "stojanek", label: "Stojánek instalován?", type: "bool" },
      { id: "chci_hodnoceni", label: "Chci POS započítat do hodnocení", type: "bool" }
    ]
  }
};
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CHECKLIST_TEMPLATES;
} else {
  (typeof window !== 'undefined' ? window : globalThis).CHECKLIST_TEMPLATES = CHECKLIST_TEMPLATES;
}
