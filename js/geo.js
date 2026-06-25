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

  // ── Nationwide doplnění (z reálného Tourplan importu, kryje ~68 % řádků) ──
  'AŠ':[50.2256,12.1947],
  'BENEŠOV':[49.7842,14.6873],
  'BENÁTKY NAD JIZEROU':[50.2961,14.8253],
  'BEROUN':[49.9636,14.0719],
  'BLANSKO':[49.3622,16.6453],
  'BOHUMÍN':[49.9050,18.3531],
  'BOSKOVICE':[49.4875,16.6586],
  'BRANDÝS NAD LABEM':[50.1864,14.6622],
  'BRANDÝS NAD LABEM-STARÁ BOLESLAV':[50.1864,14.6622],
  'BRNO':[49.1951,16.6068],
  'BRNO-MĚSTO':[49.1951,16.6068],
  'BRNO-VENKOV':[49.2,16.6],
  'BRUNTÁL':[49.9908,17.4644],
  'BŘECLAV':[48.7589,16.8825],
  'BUČOVICE':[49.1483,16.9314],
  'BYSTŘICE NAD PERNŠTEJNEM':[49.5050,16.2553],
  'BYSTŘICE POD HOSTÝNEM':[49.3700,17.6722],
  'CHEB':[50.0786,12.3713],
  'CHOCEŇ':[50.0006,16.2050],
  'CHODOV':[50.2486,12.7522],
  'CHOMUTOV':[50.4606,13.4178],
  'CHOTĚBOŘ':[49.7183,15.6694],
  'CHRUDIM':[49.9514,15.7956],
  'ČASTOLOVICE':[50.1192,16.2289],
  'ČÁSLAV':[49.9133,15.3856],
  'ČELÁKOVICE':[50.1614,14.7497],
  'ČESKÁ LÍPA':[50.6850,14.5378],
  'ČESKÁ TŘEBOVÁ':[49.9036,16.4475],
  'ČESKÉ BUDĚJOVICE':[48.9745,14.4744],
  'ČESKÝ BROD':[50.0833,14.8633],
  'ČESKÝ KRUMLOV':[48.8127,14.3175],
  'ČESKÝ TĚŠÍN':[49.7475,18.6258],
  'ČESTLICE':[50.0136,14.5689],
  'DĚČÍN':[50.7811,14.2150],
  'DOBRÁ':[49.7150,18.4453],
  'DOBROVICE':[50.3669,14.9181],
  'DOBŘÍŠ':[49.7806,14.1722],
  'DOMAŽLICE':[49.4406,12.9253],
  'DUCHCOV':[50.6033,13.7392],
  'FRENŠTÁT POD RADHOŠTĚM':[49.5494,18.2156],
  'FRÝDEK-MÍSTEK':[49.6884,18.3505],
  'FRÝDLANT NAD OSTRAVICÍ':[49.5775,18.3658],
  'HAVLÍČKŮV BROD':[49.6086,15.5806],
  'HAVÍŘOV':[49.7793,18.4368],
  'HLINSKO':[49.7669,15.9036],
  'HLUČÍN':[49.8975,18.1944],
  'HODONÍN':[48.8499,17.1339],
  'HOLEŠOV':[49.3306,17.5783],
  'HOLICE':[50.0708,15.9789],
  'HORNÍ MARŠOV':[50.6486,15.8200],
  'HOŘOVICE':[49.8331,13.8989],
  'HRADEC NAD MORAVICÍ':[49.8956,17.8861],
  'HRANICE':[49.5450,17.7361],
  'HUMPOLEC':[49.5414,15.3592],
  'IVANČICE':[49.1011,16.3781],
  'JABLONEC NAD NISOU':[50.7243,15.1710],
  'JABLONNÉ NAD ORLICÍ':[50.0817,16.5928],
  'JABLUNKOV':[49.5717,18.7656],
  'JESENÍK':[50.2306,17.2042],
  'JEMNICE':[49.0269,15.5828],
  'JEVÍČKO':[49.6294,16.7286],
  'JIHLAVA':[49.3961,15.5912],
  'JILEMNICE':[50.6092,15.5022],
  'JINDŘICHŮV HRADEC':[49.1444,15.0019],
  'JÍLOVÉ U PRAHY':[49.8956,14.4972],
  'KADAŇ':[50.3878,13.2700],
  'KAPLICE':[48.7350,14.5006],
  'KARLOVY VARY':[50.2304,12.8716],
  'KARVINÁ':[49.8546,18.5419],
  'KLADNO':[50.1429,14.1023],
  'KLATOVY':[49.3958,13.2947],
  'KOJETÍN':[49.3550,17.2917],
  'KOLÍN':[50.0282,15.2003],
  'KOPŘIVNICE':[49.5994,18.1444],
  'KOSMONOSY':[50.4297,14.9319],
  'KRALUPY NAD VLTAVOU':[50.2403,14.3122],
  'KRASLICE':[50.3206,12.5083],
  'KRAVAŘE':[49.9311,18.0078],
  'KRNOV':[50.0928,17.7060],
  'KROMĚŘÍŽ':[49.2986,17.3933],
  'KRÁLŮV DVŮR':[49.9486,14.0436],
  'KUTNÁ HORA':[49.9486,15.2683],
  'KUŘIM':[49.2972,16.5364],
  'KYJOV':[49.0125,17.1142],
  'KYNŠPERK NAD OHŘÍ':[50.1186,12.5414],
  'LANŠKROUN':[49.9156,16.6122],
  'LIBEREC':[50.7663,15.0543],
  'LIPNÍK NAD BEČVOU':[49.5314,17.5772],
  'LITOMĚŘICE':[50.5339,14.1280],
  'LITOMYŠL':[49.8736,16.3133],
  'LITOVEL':[49.7011,17.0775],
  'LITVÍNOV':[50.6011,13.6181],
  'LOUNY':[50.3556,13.7989],
  'LOVOSICE':[50.5161,14.0511],
  'LYSÁ NAD LABEM':[50.2017,14.8369],
  'MARIÁNSKÉ LÁZNĚ':[49.9650,12.7011],
  'MĚLNÍK':[50.3506,14.4720],
  'MILEVSKO':[49.4514,14.3611],
  'MILOVICE':[50.2667,14.8856],
  'MIKULOV':[48.8067,16.6378],
  'MLADÁ BOLESLAV':[50.4111,14.9028],
  'MNICHOVO HRADIŠTĚ':[50.5275,14.9711],
  'MNÍŠEK POD BRDY':[49.8814,14.2611],
  'MODŘICE':[49.1217,16.6125],
  'MOHELNICE':[49.7783,16.9167],
  'MORAVSKÁ TŘEBOVÁ':[49.7567,16.6628],
  'MORAVSKÉ BUDĚJOVICE':[49.0608,15.7972],
  'MOST':[50.5031,13.6362],
  'NAPAJEDLA':[49.1781,17.5239],
  'NERATOVICE':[50.2625,14.5314],
  'NEJDEK':[50.3258,12.7297],
  'NOVÝ BOR':[50.7656,14.5469],
  'NOVÝ BYDŽOV':[50.2417,15.4925],
  'NOVÝ JIČÍN':[49.5944,18.0089],
  'NYMBURK':[50.1864,15.0414],
  'NÝRSKO':[49.2944,13.1622],
  'OLOMOUC':[49.5938,17.2509],
  'ODOLENA VODA':[50.2436,14.3989],
  'ODRY':[49.6675,17.8403],
  'OPAVA':[49.9387,17.9026],
  'ORLOVÁ':[49.8444,18.4283],
  'OSTRAVA':[49.8209,18.2625],
  'OSTRAVA-MĚSTO':[49.8209,18.2625],
  'OSTROV':[50.3025,12.9389],
  'OTROKOVICE':[49.2117,17.5331],
  'PARDUBICE':[50.0343,15.7812],
  'PELHŘIMOV':[49.4317,15.2236],
  'PÍSEK':[49.3088,14.1475],
  'PLANÁ':[49.8694,12.7406],
  'PLZEŇ':[49.7384,13.3736],
  'PLZEŇ-JIH':[49.6,13.45],
  'PLZEŇ-MĚSTO':[49.7384,13.3736],
  'PODBOŘANY':[50.2278,13.4147],
  'PODĚBRADY':[50.1419,15.1186],
  'POHOŘELICE':[48.9892,16.5247],
  'POLIČKA':[49.7117,16.2606],
  'PRACHATICE':[49.0114,13.9967],
  'PRAHA':[50.0755,14.4378],
  'PRAHA-VÝCHOD':[50.1,14.6],
  'PRAHA-ZÁPAD':[50.0,14.3],
  'PROSTĚJOV':[49.4722,17.1119],
  'PŘEROV':[49.4552,17.4509],
  'PŘEŠTICE':[49.5814,13.3406],
  'PŘÍBRAM':[49.6890,14.0100],
  'RAKOVNÍK':[50.1064,13.7339],
  'ROKYCANY':[49.7436,13.5953],
  'ROSICE':[49.1969,16.3667],
  'ROUDNICE NAD LABEM':[50.4256,14.2569],
  'ROŽNOV POD RADHOŠTĚM':[49.4592,18.1378],
  'RUMBURK':[50.9542,14.5550],
  'RÝMAŘOV':[49.9183,17.2722],
  'ŘÍČANY':[50.0014,14.6553],
  'SEDLČANY':[49.6606,14.4256],
  'SEMILY':[50.6028,15.3322],
  'SKUTEČ':[49.8439,15.9911],
  'SLANÝ':[50.2306,14.0856],
  'SLAVIČÍN':[49.0911,17.8717],
  'SLAVKOV U BRNA':[49.1564,16.8714],
  'SOBĚSLAV':[49.2606,14.7186],
  'SOKOLOV':[50.1819,12.6406],
  'STARÉ MĚSTO':[49.0719,17.4467],
  'STOD':[49.6356,13.1389],
  'STRAKONICE':[49.2622,13.9011],
  'STŘÍBRO':[49.7503,13.0019],
  'STUDÉNKA':[49.7350,18.1228],
  'SUŠICE':[49.2294,13.5219],
  'SVITAVY':[49.7561,16.4694],
  'ŠTERNBERK':[49.7361,17.3000],
  'ŠTĚTÍ':[50.4456,14.3725],
  'ŠUMPERK':[49.9650,16.9706],
  'TACHOV':[49.7944,12.6322],
  'TÁBOR':[49.4144,14.6578],
  'TEPLICE':[50.6404,13.8245],
  'TIŠNOV':[49.3450,16.4253],
  'TŘEBÍČ':[49.2152,15.8819],
  'TŘEBOŇ':[49.0064,14.7714],
  'TŘINEC':[49.6783,18.6711],
  'TURNOV':[50.5867,15.1561],
  'TÝN NAD VLTAVOU':[49.2222,14.4117],
  'UHERSKÉ HRADIŠTĚ':[49.0697,17.4603],
  'UHERSKÝ BROD':[49.0264,17.6486],
  'UNHOŠŤ':[50.0894,14.1217],
  'UNIČOV':[49.7686,17.1167],
  'ÚSTÍ NAD LABEM':[50.6607,14.0327],
  'ÚSTÍ NAD ORLICÍ':[49.9744,16.3936],
  'VALAŠSKÉ KLOBOUKY':[49.1431,17.9897],
  'VALAŠSKÉ MEZIŘÍČÍ':[49.4694,17.9697],
  'VARNSDORF':[50.9114,14.6175],
  'VELKÉ MEZIŘÍČÍ':[49.3556,16.0125],
  'VESELÍ NAD LUŽNICÍ':[49.1825,14.4458],
  'VESELÍ NAD MORAVOU':[48.9550,17.3781],
  'VIMPERK':[49.0486,13.7783],
  'VÍTKOV':[49.7775,17.7536],
  'VLAŠIM':[49.7142,14.9011],
  'VRBNO POD PRADĚDEM':[49.9967,17.3489],
  'VSETÍN':[49.3389,17.9956],
  'VYSOKÉ MÝTO':[49.9522,16.1611],
  'VYŠKOV':[49.2778,16.9989],
  'ZÁBŘEH':[49.8869,16.8775],
  'ZLÍN':[49.2261,17.6707],
  'ZNOJMO':[48.8555,16.0488],
  'ŽATEC':[50.3267,13.5481],
  'ŽĎÁR NAD SÁZAVOU':[49.5611,15.9381],
};

// Centroidy reálných středisek (POS AREA kódy z Tourplan importu) — fallback
// pro neznámé obce v daném regionu, aby se NIKDY nerozptylovaly celostátně.
const REGION_AREA_CENTROID = {
  RSA: [50.05, 14.45], // Praha + Kladno
  RSB: [49.10, 16.85], // Brno / jižní Morava + jižní Čechy
  RSC: [49.65, 13.20], // Plzeň / západní Čechy + Karlovy Vary
  RSD: [50.55, 13.95], // Ústí nad Labem / severní Čechy
  RSE: [50.10, 16.05], // Pardubice / Hradec Králové + Zlín
  RSG: [49.75, 17.95], // Ostrava / Olomouc / Moravskoslezský kraj
};

function normalizeTownKey(raw){
  if(!raw) return '';
  let s = raw.trim().toUpperCase();
  // odstraní část obce za pomlčkou ("TRUTNOV - KRYBLICE" -> "TRUTNOV")
  s = s.split(' - ')[0].split(' -')[0].trim();
  // odstraní číslo městské části ("PRAHA 3" -> "PRAHA")
  s = s.replace(/\s+\d+$/, '');
  return s;
}

// stabilní hash řetězce -> [0,1), deterministický (žádný Math.random)
function stableUnit(str){
  let h = 0;
  for(let i=0;i<str.length;i++){ h = (h*31 + str.charCodeAt(i)) >>> 0; }
  return (h % 100000) / 100000;
}

const REGION_CENTROID = [50.35, 15.95]; // Královéhradecký region — výchozí fallback střed
const REGION_SPREAD_DEG = 0.35; // ~35km poloměr fallback rozptylu

/**
 * Vrátí {lat, lng} pro adresu.
 * Mock implementace: hledá název obce ve slovníku CZ_TOWN_COORDS, jinak
 * deterministicky odhadne pozici kolem centroidu SKUTEČNÉHO regionu (POS AREA
 * kód, je-li znám) — NIKDY kolem celostátního středu, aby neznámá obec v
 * RSG (Ostravsko) nespadla rozptylem do Čech a naopak.
 */
function geocodeAddress(address, areaCode){
  const parts = (address||'').split(',');
  const last = parts[parts.length-1] || '';
  const key = normalizeTownKey(last);
  if(CZ_TOWN_COORDS[key]){
    const [lat,lng] = CZ_TOWN_COORDS[key];
    return {lat, lng, matched: true};
  }
  const centroid = (areaCode && REGION_AREA_CENTROID[areaCode]) || REGION_CENTROID;
  // fallback: deterministický rozptyl okolo centroidu regionu, odvozený z adresy
  const u1 = stableUnit(key+'|lat');
  const u2 = stableUnit(key+'|lng');
  return {
    lat: centroid[0] + (u1*2-1)*REGION_SPREAD_DEG,
    lng: centroid[1] + (u2*2-1)*REGION_SPREAD_DEG,
    matched: false,
  };
}

/**
 * Doplní pos.lat/pos.lng pokud chybí. Idempotentní.
 * pos.gpsTownMatched: true = souřadnice obce ze slovníku (reálná data odvozená
 * z reálné adresy), false = regionální fallback odhad (skutečný odhad bez
 * vazby na konkrétní obec).
 */
function ensurePosCoords(pos){
  if(typeof pos.lat==='number' && typeof pos.lng==='number') return pos;
  const c = geocodeAddress(pos.a, pos.area);
  pos.lat = c.lat;
  pos.lng = c.lng;
  pos.gpsTownMatched = c.matched;
  return pos;
}

// Tento soubor je v prohlížeči obyčejný <script> (globální scope), ale
// excelImport.js jej v Node (testy/CLI konverze) potřebuje jako modul.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { stableUnit, geocodeAddress, ensurePosCoords, normalizeTownKey, CZ_TOWN_COORDS, REGION_AREA_CENTROID };
}
