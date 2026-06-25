// ══════════════════════════════════════════════════════
// VISIT_CHECKLIST_RAW — jednorázová konverze reálných dat z kampaně
// "Rebranding IDT-KAM" (export visitdata_57/58/59.xlsx, červen 2026)
// ══════════════════════════════════════════════════════
// POUZE PRO TESTOVÁNÍ podmíněného checklist enginu (checklistEngine.js).
// Toto NEJSOU provozní data appky — POS ID v tomto souboru obvykle
// neodpovídají POS v aktuálním Tourplan/POS Master datasetu. Slouží jen
// jako reálný vzorek odpovědí pro ověření, že engine umí správně skrývat/
// zobrazovat navazující otázky (větvení Ano/Ne) na reálných hodnotách.
//
// Skutečné fotky z originálního exportu (externí, neautentizovaný cloud
// bucket) byly z bezpečnostních důvodů vynechány — pouze textové odpovědi.
//
// Každý záznam: { posId, storeName, chain, region, executor, date, answers }
// `answers` používá zkrácené klíče mapované na reálné otázky kampaně —
// viz checklistTemplates.js pro plné znění otázek a podmínky větvení.
const VISIT_CHECKLIST_RAW = [
 {
  "posId": "13721503",
  "storeName": "13721503 - Potraviny Mandák s.r.o., Pačejov-nádraží, 221, PAČEJOV - PAČEJOV-NÁDRAŽÍ",
  "chain": "4OSTATNI",
  "region": "RSC Plzeň",
  "executor": "Vladimír Horejš",
  "date": "2026-06-18",
  "answers": {"rebranding":"IDT-C","eso_vymenene":"Ano","eso_sviti":"Ne","eso_sviti_duvod":"Dle domluvy ","samolepky_vymenene":"Ne","ext_nestandard":"Ne","totem_sazka":"Ne","iso_totem":"Ne","deska_losy":"Ano","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "14743301",
  "storeName": "14743301 - RATIO Rumburk s.r.o., 2. polské armády, 1365/5, RUMBURK - RUMBURK 1",
  "chain": "4OSTATNI",
  "region": "RSD Ústí nad Labem",
  "executor": "Milan Šticha",
  "date": "2026-06-18",
  "answers": {"rebranding":"IDT-C","eso_vymenene":"Ano","eso_sviti":"Ne","eso_sviti_duvod":"Neví","eso_bez_zavad":"Ano","samolepky_vymenene":"Ano","ext_nestandard":"Ne","totem_sazka":"Ano","iso_totem":"Ano","deska_losy":"Ano","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "17746842",
  "storeName": "17746842 - H R U Š K A , spol. s r.o., Sosnová, 409, TŘINEC - DOLNÍ LÍŠTNÁ",
  "chain": "1HRUSKA",
  "region": "RSG Ostrava",
  "executor": "Michal Herman",
  "date": "2026-06-17",
  "answers": {"rebranding":"KAM","eso_vymenene":"Ano","eso_sviti":"Ne","eso_sviti_duvod":"Neni zapojeno","eso_bez_zavad":"Ano","samolepky_vymenene":"Ano","ext_nestandard":"Ne","totem_sazka":"Ne","iso_totem":"Ne","deska_losy":"Ano","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "11913629",
  "storeName": "11913629 - MOL Česká republika, s.r.o., Ringhofferova, 381, VELKÉ POPOVICE",
  "chain": "1MOL",
  "region": "RSA Praha - Střední Čechy",
  "executor": "Jan Myslivec",
  "date": "2026-06-17",
  "answers": {"rebranding":"KAM","eso_vymenene":"Ano","eso_sviti":"Ne","eso_sviti_duvod":"Je tam jen kabel ve stěně ,nejde dát krabička s elektrikou je tam reklamní plachta","samolepky_vymenene":"Ne","ext_nestandard":"Ne","totem_sazka":"Ne","iso_totem":"Ne","deska_losy":"Ne","cdu_lcd":"Ano","stojanek":"Ne","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "15733601",
  "storeName": "15733601 - Đuc Anh Lé - Potraviny u Kevina, Železničního pluku, 2005, PARDUBICE - ZELENÉ PŘEDMĚSTÍ",
  "chain": "4OSTATNI",
  "region": "RSE Hradec Králové",
  "executor": "Jaroslav Jareš",
  "date": "2026-06-15",
  "answers": {"rebranding":"IDT-B ","eso_vymenene":"Ano","eso_sviti":"Ne","eso_sviti_duvod":"Neni přivedena elektroinstalace","samolepky_vymenene":"Ano","ext_nestandard":"Ne","totem_sazka":"Ne","iso_totem":"Ano","deska_losy":"Ano","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "15647501",
  "storeName": "15647501 - Jiří Kutálek, Náhon, 300/51, HRADEC KRÁLOVÉ - MALŠOVICE",
  "chain": "4OSTATNI",
  "region": "RSE Hradec Králové",
  "executor": "Jaroslav Jareš",
  "date": "2026-06-15",
  "answers": {"rebranding":"IDT-B ","eso_vymenene":"Ano","eso_sviti":"Ne","eso_sviti_duvod":"Neni přípojka elektř.","samolepky_vymenene":"Ano","ext_nestandard":"Ne","totem_sazka":"Ano","iso_totem":"Ano","deska_losy":"Ano","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "15938101",
  "storeName": "15938101 - M tank s.r.o., 3. května, 852, SEMILY",
  "chain": "4OSTATNI",
  "region": "RSD Ústí nad Labem",
  "executor": "Jan Luňáček",
  "date": "2026-06-15",
  "answers": {"rebranding":"IDT-B ","eso_vymenene":"Ano","eso_sviti":"Ano","eso_bez_zavad":"Ne","samolepky_vymenene":"Ano","ext_nestandard":"Ne","totem_sazka":"Ne","iso_totem":"Ne","deska_losy":"Ano","cdu_lcd":"Ano","stojanek":"Ne","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "11882001",
  "storeName": "11882001 - Ladislav Hájek - KLÍNOVÉ ŘEMENY, Plzeňská, 282/62, PRAHA 5 - SMÍCHOV",
  "chain": "4OSTATNI",
  "region": "RSA Praha - Střední Čechy",
  "executor": "Petr Dosoudil",
  "date": "2026-06-16",
  "answers": {"rebranding":"IDT-C","eso_vymenene":"Ne","eso_bez_zavad":"Ne","samolepky_vymenene":"Ano","ext_nestandard":"Ne","totem_sazka":"Ne","iso_totem":"Ne","deska_losy":"Ano","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "15638704",
  "storeName": "15638704 - Tomáš Klouček, Kavánova, 177, JILEMNICE",
  "chain": "4OSTATNI",
  "region": "RSD Ústí nad Labem",
  "executor": "Jan Luňáček",
  "date": "2026-06-16",
  "answers": {"rebranding":"IDT-B ","eso_vymenene":"Ne","eso_bez_zavad":"Ne","samolepky_vymenene":"Ano","ext_nestandard":"Ne","totem_sazka":"Ano","iso_totem":"Ano","deska_losy":"Ano","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "14830003",
  "storeName": "14830003 - PLANEO Elektro, Obchodní zóna, 266, CHOMUTOV",
  "chain": "1FAST",
  "region": "RSD Ústí nad Labem",
  "executor": "Jaroslav Neubert",
  "date": "2026-06-18",
  "answers": {"rebranding":"KAM","eso_vymenene":"Ne","eso_bez_zavad":"Ne","samolepky_vymenene":"Ano","ext_nestandard":"Ne","totem_sazka":"Ano","iso_totem":"Ano","deska_losy":"Ano","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "11913636",
  "storeName": "11913636 - MOL Česká republika, s.r.o., Příhonská (ČS PAP OIL), 49, DOLNÍ BOUSOV",
  "chain": "1MOL",
  "region": "RSA Praha - Střední Čechy",
  "executor": "Pavel Vlk",
  "date": "2026-06-17",
  "answers": {"rebranding":"IDT-C,\nKAM","eso_vymenene":"Ano","eso_sviti":"Ano","eso_bez_zavad":"Ano","samolepky_vymenene":"Ne","ext_nestandard":"Ano","ext_nestandard_jaky":"Mol","totem_sazka":"Ne","iso_totem":"Ne","deska_losy":"Ano","cdu_lcd":"Ne","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "11882904",
  "storeName": "11882904 - GMO s.r.o. - Směnárna Kralupy Tesco, Veltruská, 815, KRALUPY NAD VLTAVOU -  LOBEČEK",
  "chain": "4OSTATNI",
  "region": "RSA Praha - Střední Čechy",
  "executor": "Pavel Vlk",
  "date": "2026-06-16",
  "answers": {"rebranding":"IDT-A","eso_vymenene":"Ne","eso_bez_zavad":"Ne","eso_zavada_popis":"Není","samolepky_vymenene":"Ne","ext_nestandard":"Ano","ext_nestandard_jaky":"Gmo","totem_sazka":"Ano","iso_totem":"Ano","deska_losy":"Ano","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "14611801",
  "storeName": "14611801 - Milan C H Á B E K, J. z Poděbrad, 530, DĚČÍN",
  "chain": "4OSTATNI",
  "region": "RSD Ústí nad Labem",
  "executor": "Milan Šticha",
  "date": "2026-06-18",
  "answers": {"rebranding":"IDT-C","eso_vymenene":"Ano","eso_sviti":"Ano","eso_bez_zavad":"Ano","samolepky_vymenene":"Ne","ext_nestandard":"Ano","ext_nestandard_jaky":"Samolepka cela vyloha","totem_sazka":"Ano","iso_totem":"Ano","deska_losy":"Ne","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "17762801",
  "storeName": "17762801 - Van Thai Do, Bravantice, 249, BRAVANTICE",
  "chain": "4OSTATNI",
  "region": "RSG Ostrava",
  "executor": "Michal Brindžák",
  "date": "2026-06-15",
  "answers": {"rebranding":"IDT-C","eso_vymenene":"Ano","eso_sviti":"Ano","eso_bez_zavad":"Ano","samolepky_vymenene":"Ano","ext_nestandard":"Ne","totem_sazka":"Ano","iso_totem":"Ano","deska_losy":"Ano","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "11882901",
  "storeName": "11882901 - GMO s.r.o. - Směnárna Brandýs Tesco, Zápy, 275, ZÁPY",
  "chain": "4OSTATNI",
  "region": "RSA Praha - Střední Čechy",
  "executor": "Jan Myslivec",
  "date": "2026-06-16",
  "answers": {"rebranding":"IDT-C","eso_vymenene":"Ne","samolepky_vymenene":"Ano","ext_nestandard":"Ne","totem_sazka":"Ano","iso_totem":"Ano","deska_losy":"Ano","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "16754401",
  "storeName": "16754401 - Tůma garden s.r.o., Tuřanské náměstí, 89/37, BRNO - TUŘANY",
  "chain": "4OSTATNI",
  "region": "RSB České Budějovice",
  "executor": "Robert Hanuš",
  "date": "2026-06-18",
  "answers": {"rebranding":"IDT-C","eso_vymenene":"Ano","eso_sviti":"Ano","samolepky_vymenene":"Ano","ext_nestandard":"Ne","totem_sazka":"Ano","iso_totem":"Ano","deska_losy":"Ano","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "16761301",
  "storeName": "16761301 - Jitka Hynštová, Ježkovice, 82, JEŽKOVICE",
  "chain": "4OSTATNI",
  "region": "RSE Hradec Králové",
  "executor": "Daniel Šír",
  "date": "2026-06-16",
  "answers": {"rebranding":"IDT-C","eso_vymenene":"Ne","samolepky_vymenene":"Ano","ext_nestandard":"Ne","totem_sazka":"Ano","iso_totem":"Ano","deska_losy":"Ano","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "16842701",
  "storeName": "16842701 - Městys Deblín, Deblín, 43, DEBLÍN",
  "chain": "2POSTAF",
  "region": "RSB České Budějovice",
  "executor": "Robert Hanuš",
  "date": "2026-06-17",
  "answers": {"rebranding":"IDT-C","eso_vymenene":"Ne","samolepky_vymenene":"Ano","ext_nestandard":"Ne","totem_sazka":"Ano","iso_totem":"Ano","deska_losy":"Ano","cdu_lcd":"Ano","stojanek":"Ne","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "16852901",
  "storeName": "16852901 - Penzion Petra Němcová, Rudice, 150, RUDICE",
  "chain": "4OSTATNI",
  "region": "RSE Hradec Králové",
  "executor": "Jakub Modlitba",
  "date": "2026-06-18",
  "answers": {"rebranding":"IDT-C","eso_vymenene":"Ne","samolepky_vymenene":"Ano","ext_nestandard":"Ne","totem_sazka":"Ano","iso_totem":"Ano","deska_losy":"Ano","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "17770001",
  "storeName": "17770001 - Văn Tuan Lé, Ostravská, 134/10, HLUČÍN",
  "chain": "4OSTATNI",
  "region": "RSG Ostrava",
  "executor": "Ivo Gelnar",
  "date": "2026-06-15",
  "answers": {"rebranding":"IDT-C","eso_vymenene":"Ne","samolepky_vymenene":"Ano","ext_nestandard":"Ne","totem_sazka":"Ano","iso_totem":"Ano","deska_losy":"Ano","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "15734101",
  "storeName": "15734101 - Anh Tuan Nguyen, Dašická, 213, PARDUBICE - BÍLÉ PŘEDMĚSTÍ",
  "chain": "4OSTATNI",
  "region": "RSE Hradec Králové",
  "executor": "Jaroslav Jareš",
  "date": "2026-06-17",
  "answers": {"rebranding":"IDT-C","eso_vymenene":"Ano","eso_sviti":"Ano","samolepky_vymenene":"Ano","ext_nestandard":"Ne","totem_sazka":"Ano","iso_totem":"Ano","deska_losy":"Ano","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "12713204",
  "storeName": "12713204 - FLOSMAN s.r.o., Jiřičkova, 663, VČELNÁ",
  "chain": "2FLOP",
  "region": "RSB České Budějovice",
  "executor": "Jan Štolba ",
  "date": "2026-06-15",
  "answers": {"rebranding":"KAM","eso_vymenene":"Ne","samolepky_vymenene":"Ano","ext_nestandard":"Ne","totem_sazka":"Ne","iso_totem":"Ne","deska_losy":"Ne","cdu_lcd":"Ano","stojanek":"Ne","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "13731801",
  "storeName": "13731801 - HOANG NAM COMPANY s.r.o., Klatovská třída, 1946/143, PLZEŇ - JIŽNÍ PŘEDMĚSTÍ",
  "chain": "4OSTATNI",
  "region": "RSC Plzeň",
  "executor": "Vladimír Horejš",
  "date": "2026-06-16",
  "answers": {"rebranding":"IDT-C","eso_vymenene":"Ano","eso_sviti":"Ano","samolepky_vymenene":"Ano","ext_nestandard":"Ne","totem_sazka":"Ne","iso_totem":"Ne","deska_losy":"Ne","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "11884301",
  "storeName": "11884301 - KAEFKO s.r.o. - KF POINT, Bryksova, 729/69, PRAHA 9 - ČERNÝ MOST",
  "chain": "4OSTATNI",
  "region": "RSA Praha - Střední Čechy",
  "executor": "Jiří Hrubý",
  "date": "2026-06-17",
  "answers": {"rebranding":"IDT-C","eso_vymenene":"Ne","samolepky_vymenene":"Ne","ext_nestandard":"Ne","totem_sazka":"Ne","iso_totem":"Ano","deska_losy":"Ano","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "11884801",
  "storeName": "11884801 - Martin David - Rybářské potřeby Dejvil, Prokopova, 619, RAKOVNÍK - RAKOVNÍK II",
  "chain": "4OSTATNI",
  "region": "RSA Praha - Střední Čechy",
  "executor": "Jiří Hrubý",
  "date": "2026-06-18",
  "answers": {"rebranding":"IDT-C","eso_vymenene":"Ne","samolepky_vymenene":"Ano","ext_nestandard":"Ne","totem_sazka":"Ne","iso_totem":"Ne","deska_losy":"Ano","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "17724201",
  "storeName": "17724201 - Dagmar Juříčková, Palackého, 781, VALAŠSKÉ MEZIŘÍČÍ",
  "chain": "4OSTATNI",
  "region": "RSG Ostrava",
  "executor": "Petr Herman",
  "date": "2026-06-15",
  "answers": {"rebranding":"IDT-B ","eso_vymenene":"Ne","samolepky_vymenene":"Ano","ext_nestandard":"Ne","totem_sazka":"Ne","iso_totem":"Ne","deska_losy":"Ano","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "13711514",
  "storeName": "13711514 - COOP TIP Západočeské konzumní družstvo Sušice, Lerchova, 926, SUŠICE - SUŠICE II",
  "chain": "2COOP",
  "region": "RSC Plzeň",
  "executor": "Vladimír Horejš",
  "date": "2026-06-18",
  "answers": {"rebranding":"IDT-C","eso_vymenene":"Ne","samolepky_vymenene":"Ne","ext_nestandard":"Ne","totem_sazka":"Ne","iso_totem":"Ne","deska_losy":"Ne","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "17847001",
  "storeName": "17847001 - Obec Dolní Lhota, Poštovní, 250, DOLNÍ LHOTA",
  "chain": "2POSTAF",
  "region": "RSG Ostrava",
  "executor": "Michal Brindžák",
  "date": "2026-06-15",
  "answers": {"rebranding":"IDT-B ","eso_vymenene":"Ne","samolepky_vymenene":"Ne","ext_nestandard":"Ne","totem_sazka":"Ne","iso_totem":"Ne","deska_losy":"Ano","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "15835901",
  "storeName": "15835901 - Lukáš Neugebauer, Jiráskova, 157, CHRAST",
  "chain": "4OSTATNI",
  "region": "RSE Hradec Králové",
  "executor": "Jaroslav Jareš",
  "date": "2026-06-18",
  "answers": {"rebranding":"IDT-C","eso_vymenene":"Ne","samolepky_vymenene":"Ano","ext_nestandard":"Ne","totem_sazka":"Ne","iso_totem":"Ne","deska_losy":"Ano","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "16208095",
  "storeName": "16208095 - Česká pošta / Bystřice pod Hostýnem 7, Hlinsko pod Hostýnem, 106, BYSTŘICE POD HOSTÝNEM",
  "chain": "1POSTA",
  "region": "RSE Hradec Králové",
  "executor": "Jakub Modlitba",
  "date": "2026-06-16",
  "answers": {"rebranding":"KAM","eso_vymenene":"Ne","samolepky_vymenene":"Ne","ext_nestandard":"Ne","totem_sazka":"Ne","iso_totem":"Ne","deska_losy":"Ne","cdu_lcd":"Ano","stojanek":"Ne","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "17848502",
  "storeName": "17848502 - Charita Hrabyně, Hrabyně, 1, HRABYNĚ",
  "chain": "2POSTAF",
  "region": "RSG Ostrava",
  "executor": "Michal Brindžák",
  "date": "2026-06-18",
  "answers": {"rebranding":"IDT-C","eso_vymenene":"Ne","samolepky_vymenene":"Ano","ext_nestandard":"Ne","totem_sazka":"Ne","iso_totem":"Ne","deska_losy":"Ano","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "13822001",
  "storeName": "13822001 - Markéta Rybínová, Budovcova, 833, KLATOVY - KLATOVY III",
  "chain": "4OSTATNI",
  "region": "RSC Plzeň",
  "executor": "Vladimír Horejš",
  "date": "2026-06-16",
  "answers": {"rebranding":"IDT-C","eso_vymenene":"Ano","eso_sviti":"Ano","samolepky_vymenene":"Ano","ext_nestandard":"Ne","totem_sazka":"Ne","iso_totem":"Ne","deska_losy":"Ne","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "16962602",
  "storeName": "16962602 - ČS PHM Semerád Bantice BANTICE, parc. č. 241, v k.ú. Bantice (areál Agrodružstva), BANTICE",
  "chain": "4OSTATNI",
  "region": "RSB České Budějovice",
  "executor": "Roman Koutný",
  "date": "2026-06-16",
  "answers": {"rebranding":"IDT-C","eso_vymenene":"Ano","eso_sviti":"Ano","eso_bez_zavad":"Ano","samolepky_vymenene":"Ano","ext_nestandard":"Ne","totem_sazka":"Ne","iso_totem":"Ano","deska_losy":"Ne","cdu_lcd":"Ano","stojanek":"Ne","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "11885601",
  "storeName": "11885601 - Město Trhový Štěpánov - Pošta partner, Náměstí, 143, TRHOVÝ ŠTĚPÁNOV",
  "chain": "2POSTAF",
  "region": "RSA Praha - Střední Čechy",
  "executor": "Miroslav Fiedler",
  "date": "2026-06-18",
  "answers": {"rebranding":"IDT-B ","eso_vymenene":"Ne","samolepky_vymenene":"Ne","ext_nestandard":"Ne","totem_sazka":"Ne","iso_totem":"Ne","deska_losy":"Ne","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "17847801",
  "storeName": "17847801 - Obec Petrov nad Desnou, Petrov nad Desnou, 156, PETROV NAD DESNOU",
  "chain": "2POSTAF",
  "region": "RSG Ostrava",
  "executor": "Ivo Gelnar",
  "date": "2026-06-17",
  "answers": {"rebranding":"KAM","eso_vymenene":"Ne","samolepky_vymenene":"Ano","ext_nestandard":"Ne","totem_sazka":"Ne","iso_totem":"Ne","deska_losy":"Ano","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "17769313",
  "storeName": "17769313 - KONZUM, obchodní družstvo v Ústí nad Orlicí, 9. května, 228, RUDA NAD MORAVOU",
  "chain": "2COOP",
  "region": "RSG Ostrava",
  "executor": "Michal Brindžák",
  "date": "2026-06-17",
  "answers": {"rebranding":"IDT-C","eso_vymenene":"Ano","eso_sviti":"Ano","eso_bez_zavad":"Ano","samolepky_vymenene":"Ano","ext_nestandard":"Ne","totem_sazka":"Ne","iso_totem":"Ne","deska_losy":"Ano","cdu_lcd":"Ano","stojanek":"Ne","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "11527601",
  "storeName": "11527601 - Duy Quang Nguyen, Veltruská, 557/27, PRAHA 9 - PROSEK",
  "chain": "4OSTATNI",
  "region": "RSA Praha - Střední Čechy",
  "executor": "Jiří Hrubý",
  "date": "2026-06-15",
  "answers": {"rebranding":"IDT-C","eso_vymenene":"Ne","samolepky_vymenene":"Ne","ext_nestandard":"Ne","totem_sazka":"Ne","iso_totem":"Ne","deska_losy":"Ne","cdu_lcd":"Ano","stojanek":"Ne","chci_hodnoceni":"Ano"}
 },
 {
  "posId": "12641402",
  "storeName": "12641402 - PAJAK s.r.o., Soběslavská, 3038, TÁBOR",
  "chain": "3PAJAK",
  "region": "RSB České Budějovice",
  "executor": "Petr Dvořák",
  "date": "2026-06-17",
  "answers": {"rebranding":"KAM","eso_vymenene":"Ano","eso_sviti":"Ano","eso_bez_zavad":"Ano","samolepky_vymenene":"Ne","ext_nestandard":"Ne","totem_sazka":"Ne","iso_totem":"Ne","deska_losy":"Ano","cdu_lcd":"Ano","stojanek":"Ano","chci_hodnoceni":"Ano"}
 }
];
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VISIT_CHECKLIST_RAW;
} else {
  (typeof window !== 'undefined' ? window : globalThis).VISIT_CHECKLIST_RAW = VISIT_CHECKLIST_RAW;
}
