// ══════════════════════════════════════════════════════
// MOCK GEOCODING PROVIDER
// ══════════════════════════════════════════════════════
// Adresy v REAL_DATA neobsahují GPS souřadnice. Tento modul je dopočítá.
// Je to MOCK geocoder — malý slovník reálných českých měst/obcí (Královéhradecký
// region, kde prototyp operuje) s reálnými souřadnicemi. Neznámá obec dostane
// deterministický (ne náhodný) odhad odvozený z regionálního centroidu, takže
// výpočty jsou opakovatelné a stabilní mezi reloady.
//
// Až bude k dispozici Google Geocoding API / reálná data z Excelu se souřadnicemi,
// stačí nahradit `geocodeAddress()` voláním API — zbytek aplikace (routeEngine,
// UI) volá pouze tuto funkci a nezávisí na tom, odkud souřadnice pocházejí.

const CZ_TOWN_COORDS = {
  'HRADEC KRÁLOVÉ':[50.2092,15.8327],
  'JIČÍN':[50.4357,15.3548],
  'TRUTNOV':[50.5606,15.9119],
  'NÁCHOD':[50.4133,16.1667],
  'RYCHNOV NAD KNĚŽNOU':[50.1626,16.2738],
  'DVŮR KRÁLOVÉ NAD LABEM':[50.4351,15.8060],
  'VRCHLABÍ':[50.6294,15.6131],
  'NOVÁ PAKA':[50.4928,15.5067],
  'BROUMOV':[50.5849,16.3358],
  'POLICE NAD METUJÍ':[50.5414,16.2308],
  'HOŘICE':[50.3656,15.6356],
  'HOŘICE V PODKRKONOŠÍ':[50.3656,15.6356],
  'KOSTELEC NAD ORLICÍ':[50.1339,16.2122],
  'TÝNIŠTĚ NAD ORLICÍ':[50.1647,16.0792],
  'VAMBERK':[50.0867,16.2756],
  'SOLNICE':[50.1219,16.2581],
  'DOBRUŠKA':[50.2856,16.3953],
  'OPOČNO':[50.2628,16.0908],
  'NOVÉ MĚSTO NAD METUJÍ':[50.3447,16.1517],
  'ČESKÁ SKALICE':[50.3833,16.0667],
  'SMIŘICE':[50.1944,15.8783],
  'ČERNOŽICE':[50.2389,15.8267],
  'JAROMĚŘ':[50.3522,15.9181],
  'HRONOV':[50.4781,16.1819],
  'TEPLICE NAD METUJÍ':[50.5928,16.2378],
  'ŽACLÉŘ':[50.6589,15.9244],
  'JANSKÉ LÁZNĚ':[50.6217,15.8061],
  'PEC POD SNĚŽKOU':[50.6886,15.7372],
  'ŠPINDLERŮV MLÝN':[50.7236,15.6064],
  'SVOBODA NAD ÚPOU':[50.6133,15.7886],
  'RTYNĚ V PODKRKONOŠÍ':[50.4658,16.1147],
  'VELKÉ POŘÍČÍ':[50.5036,16.2422],
  'VYSOKOV':[50.4264,16.1372],
  'ÚPICE':[50.5161,16.1389],
  'STÁRKOV':[50.5333,16.2667],
  'MEZIMĚSTÍ':[50.6428,16.3344],
  'BERNARTICE':[50.5694,16.3097],
  'KUKS':[50.4344,15.8975],
  'LÁZNĚ BĚLOHRAD':[50.3789,15.5511],
  'KOPIDLNO':[50.3208,15.2697],
  'SOBOTKA':[50.4253,15.1797],
  'LIBUŇ':[50.5081,15.1842],
  'LIBÁŇ':[50.3083,15.1217],
  'VYSOKÉ VESELÍ':[50.3294,15.2353],
  'ROKYTNICE V ORLICKÝCH HORÁCH':[50.1547,16.4744],
  'DEŠTNÉ V ORLICKÝCH HORÁCH':[50.2722,16.3489],
  'TŘEBECHOVICE POD OREBEM':[50.1633,15.8567],
  'SKUHROV NAD BĚLOU':[50.2306,16.2000],
  'ČERVENÝ KOSTELEC':[50.4736,16.1183],
  'ČESKÉ MEZIŘÍČÍ':[50.2336,16.1611],
  'ČASTOLOVICE':[50.1192,16.2289],
  'HOSTINNÉ':[50.5419,15.7308],
  'HORNÍ MARŠOV':[50.6486,15.8200],
  'MLADÉ BUKY':[50.5739,15.7711],
  'STARÁ PAKA':[50.4894,15.4297],
  'DOLNÍ BRANNÁ':[50.5847,15.6325],
  'RUDNÍK':[50.6017,15.6797],
  'LÍPA NAD ORLICÍ':[50.1733,16.2275],
  'PĚČÍN':[50.1444,16.3833],
  'ZÁMĚL':[50.1356,16.2433],
  'BUDČEVES':[50.3494,15.5511],
  'VODĚRADY':[50.1869,15.9367],
  'CEREKVICE NAD BYSTŘICÍ':[50.4017,15.7497],
  'STARÉ MÍSTO':[50.5394,15.9214],
  'CHVALKOVICE':[50.2861,15.9756],
  'HEJTMÁNKOVICE':[50.5736,16.3122],
  'TŘEBIHOŠŤ':[50.4633,15.6481],
  'LÁNOV':[50.6047,15.6989],
  'MILOVICE U HOŘIC':[50.3608,15.6075],
  'PROVODOV-ŠONOV':[50.4444,16.2492],
};

function normalizeTownKey(raw){
  if(!raw) return '';
  let s = raw.trim().toUpperCase();
  // odstraní část obce za pomlčkou ("TRUTNOV - KRYBLICE" -> "TRUTNOV")
  s = s.split(' - ')[0].split(' -')[0].trim();
  return s;
}

// stabilní hash řetězce -> [0,1), deterministický (žádný Math.random)
function stableUnit(str){
  let h = 0;
  for(let i=0;i<str.length;i++){ h = (h*31 + str.charCodeAt(i)) >>> 0; }
  return (h % 100000) / 100000;
}

const REGION_CENTROID = [50.35, 15.95]; // Královéhradecký region — fallback střed
const REGION_SPREAD_DEG = 0.35; // ~35km poloměr fallback rozptylu

/**
 * Vrátí {lat, lng} pro adresu.
 * Mock implementace: hledá název obce ve slovníku CZ_TOWN_COORDS, jinak
 * deterministicky odhadne pozici kolem regionálního centroidu.
 */
function geocodeAddress(address){
  const parts = (address||'').split(',');
  const last = parts[parts.length-1] || '';
  const key = normalizeTownKey(last);
  if(CZ_TOWN_COORDS[key]){
    const [lat,lng] = CZ_TOWN_COORDS[key];
    return {lat, lng};
  }
  // fallback: deterministický rozptyl okolo centroidu regionu, odvozený z adresy
  const u1 = stableUnit(key+'|lat');
  const u2 = stableUnit(key+'|lng');
  return {
    lat: REGION_CENTROID[0] + (u1*2-1)*REGION_SPREAD_DEG,
    lng: REGION_CENTROID[1] + (u2*2-1)*REGION_SPREAD_DEG,
  };
}

/**
 * Doplní pos.lat/pos.lng pokud chybí. Idempotentní.
 */
function ensurePosCoords(pos){
  if(typeof pos.lat==='number' && typeof pos.lng==='number') return pos;
  const c = geocodeAddress(pos.a);
  pos.lat = c.lat;
  pos.lng = c.lng;
  return pos;
}
