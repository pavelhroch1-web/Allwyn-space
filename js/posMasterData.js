// ══════════════════════════════════════════════════════
// POS MASTER DATA IMPORT — samostatný import GPS + otevírací doby
// ══════════════════════════════════════════════════════
// Nezávislé na týdenním Tourplan importu (ten dodává přiřazení technik/den).
// Tohle dodává trvalá data o POS samotném: přesné GPS (X/Y) a otevírací doba
// pro každý den v týdnu zvlášť (Po-Ne, sobota/neděle může být zavřeno).
//
// Klíč = POS ID (stejné jako p.id v celé appce — žádný druhý identifikátor).
// Bez DOM závislostí — vstup je pole řádků, výstup je lookup mapa.
// Dokud Pavel nedodá reálný soubor, appka pro POS bez master dat dál používá
// stávající fallbacky (geo.js mock geocoder, RouteEngine flat default hodiny)
// — žádná smyšlená GPS/otevírací doba se nikam neukládá jako reálná.

(function(global){

  const DAY_KEYS = ['mon','tue','wed','thu','fri','sat','sun'];
  const DAY_LABELS = { mon:'Po', tue:'Út', wed:'St', thu:'Čt', fri:'Pá', sat:'So', sun:'Ne' };

  // Sloupce: POS ID, GPS Lat (X), GPS Lng (Y), pak 7 sloupců otevírací doby Po-Ne.
  // NAME/ADDRESS/CITY/REGION jsou nepovinné — pokud chybí, appka dál používá
  // hodnoty z Tourplan importu (ten je dnes jediný zdroj pro tato pole).
  const COLS = {
    POS_ID: 0, LAT: 1, LNG: 2,
    MON: 3, TUE: 4, WED: 5, THU: 6, FRI: 7, SAT: 8, SUN: 9,
    NAME: 10, ADDRESS: 11, CITY: 12, REGION: 13,
  };

  const CLOSED_TOKENS = ['', 'zavřeno', 'zavreno', 'closed', '-', 'x'];

  // parseOpeningCell('08:00-18:00') -> {from:'08:00', to:'18:00'}
  // parseOpeningCell('zavřeno' | '' | undefined) -> null (POS ten den nemá otevřeno)
  function parseOpeningCell(raw){
    const s = (raw == null ? '' : String(raw)).trim().toLowerCase();
    if (CLOSED_TOKENS.includes(s)) return null;
    const m = s.match(/(\d{1,2}):?(\d{2})\s*-\s*(\d{1,2}):?(\d{2})/);
    if (!m) return null;
    const from = `${m[1].padStart(2,'0')}:${m[2]}`;
    const to = `${m[3].padStart(2,'0')}:${m[4]}`;
    return { from, to };
  }

  function parseNumber(raw){
    const n = parseFloat(String(raw == null ? '' : raw).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  function validateColumns(rawRows){
    if (!Array.isArray(rawRows)) throw new Error('POS master data musí být pole řádků');
    if (rawRows.length === 0) return { ok: true, warnings: ['Žádná data k importu'] };
    const sample = rawRows[0];
    if (!Array.isArray(sample) || sample.length < 3) {
      throw new Error('Neočekávaná struktura řádku — chybí POS ID a/nebo GPS sloupce');
    }
    return { ok: true, warnings: [] };
  }

  // buildPosMasterMap(rawRows) -> { map, summary, warnings }
  // map: { [posId]: { lat, lng, openingHours: {mon:{from,to}|null, ...} } }
  // Duplicitní POS ID je blokující chyba (`summary.duplicateIds.length > 0`) —
  // dva řádky se stejným ID by tiše přepsaly jeden druhý, takže import musí
  // zastavit a vyžádat oprava souboru, ne jen upozornit.
  function buildPosMasterMap(rawRows){
    validateColumns(rawRows);
    const map = {};
    const warnings = [];
    const duplicateIds = [];
    let missingCoords = 0, missingHours = 0;

    rawRows.forEach((r) => {
      const posId = (r[COLS.POS_ID] || '').toString().trim();
      if (!posId) return;
      if (map[posId]) duplicateIds.push(posId);

      const lat = parseNumber(r[COLS.LAT]);
      const lng = parseNumber(r[COLS.LNG]);
      if (lat === null || lng === null) missingCoords++;

      const openingHours = {};
      let anyHours = false;
      DAY_KEYS.forEach((key, i) => {
        const cell = parseOpeningCell(r[COLS.MON + i]);
        openingHours[key] = cell;
        if (cell) anyHours = true;
      });
      if (!anyHours) missingHours++;

      const name = (r[COLS.NAME] || '').toString().trim();
      const address = (r[COLS.ADDRESS] || '').toString().trim();
      const city = (r[COLS.CITY] || '').toString().trim();
      const region = (r[COLS.REGION] || '').toString().trim();

      map[posId] = {
        lat: lat !== null ? lat : null,
        lng: lng !== null ? lng : null,
        openingHours,
        name: name || null,
        address: address && city ? `${address}, ${city}` : (address || city || null),
        region: region || null,
      };
    });

    if (duplicateIds.length > 0) warnings.push(`${duplicateIds.length} duplicitních POS ID v master datech — import zablokován, oprav soubor`);
    if (missingCoords > 0) warnings.push(`${missingCoords} POS bez platných GPS souřadnic — zůstane odhad podle adresy`);
    if (missingHours > 0) warnings.push(`${missingHours} POS bez otevírací doby — zůstane neznámá (appka nebude hádat)`);

    const summary = {
      posCount: Object.keys(map).length,
      missingCoords, missingHours,
      duplicates: duplicateIds.length,
      duplicateIds,
    };

    return { map, summary, warnings };
  }

  // mergePosMasterData(pos, record) -> pos s doplněným GPS/openingHours/adresou
  // GPS se přepíše JEN pokud má master data reálnou hodnotu (mock geocoder
  // v geo.js zůstává fallback pro POS, která ve master datech chybí).
  // Name/address/region z master dat doplní Tourplan jen tam, kde v Tourplanu
  // chybí — Tourplan zůstává primárním zdrojem pro tato pole, master data jsou
  // jen doplněk pro POS, co se v daném týdnu v Tourplanu nevyskytují.
  function mergePosMasterData(pos, record){
    if (!record) return pos;
    if (typeof record.lat === 'number' && typeof record.lng === 'number') {
      pos.lat = record.lat;
      pos.lng = record.lng;
    }
    if (record.openingHours) {
      pos.openingHours = record.openingHours;
    }
    if (record.name && !pos.n) pos.n = record.name;
    if (record.address && !pos.a) pos.a = record.address;
    if (record.region && !pos.area) pos.area = record.region;
    return pos;
  }

  const PosMasterData = {
    DAY_KEYS,
    DAY_LABELS,
    COLS,
    parseOpeningCell,
    validateColumns,
    buildPosMasterMap,
    mergePosMasterData,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PosMasterData;
  } else {
    global.PosMasterData = PosMasterData;
  }

})(typeof window !== 'undefined' ? window : globalThis);
