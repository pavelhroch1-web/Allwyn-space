// ══════════════════════════════════════════════════════
// CONSTANTS & META
// ══════════════════════════════════════════════════════
const WEEKS_META = {
  '23':{l:'W23',d:'2.–6. 6.',dd:['2. 6.','3. 6.','4. 6.','5. 6.','6. 6.']},
  '24':{l:'W24',d:'9.–13. 6.',dd:['9. 6.','10. 6.','11. 6.','12. 6.','13. 6.']},
  '25':{l:'W25',d:'16.–20. 6.',dd:['16. 6.','17. 6.','18. 6.','19. 6.','20. 6.']},
  '26':{l:'W26',d:'23.–27. 6.',dd:['23. 6.','24. 6.','25. 6.','26. 6.','27. 6.']},
  '27':{l:'W27',d:'30. 6.–4. 7.',dd:['30. 6.','1. 7.','2. 7.','3. 7.','4. 7.']},
  '28':{l:'W28',d:'7.–11. 7.',dd:['7. 7.','8. 7.','9. 7.','10. 7.','11. 7.']},
};
const DAYS = ['Po','Út','St','Čt','Pá'];
const DAY_ICONS = ['☀️','🌤️','⛅','🌥️','🌦️'];

const TASK_TMPL = {
  IDT:['Zkontroluj stav a čistotu terminálu','Osaď aktuální POS materiály dle planogramu','Zkontroluj zásobu papíru a tiskárnu','Ověř funkčnost a viditelnost terminálu'],
  PETROL:['Zkontroluj umístění terminálu na ČS','Osaď plakáty a POS materiály','Zkontroluj zásobu papíru a tiskárnu','Ověř funkčnost displeje','Vyfotit terminál z pohledu zákazníka'],
  KA:['Zkontroluj umístění dle planogramu partnera','Osaď sadu POS materiálů pro tohoto partnera','Vyfotit terminál z pohledu zákazníka od vstupu','Zkontroluj viditelnost a označení','Ověř správnost cen a letáků u terminálu'],
  CORN:[
    'Zkontroluj primární pult — osaď aktuální emisi losů dle plánogramu',
    'Zkontroluj sekundární pult — osaď všechny losy dle plánogramu',
    'Totem: osaď 2 plakáty (losy + loterie) — nikdy bílá plocha',
    'Barketa: osaď Rybky + 20 Mega sazenka stojánek',
    'Předej sazenku + obálky obsluze',
    'Vyfotit totem z pohledu zákazníka (přední i zadní strana)',
    'Zkontroluj a odstraň staré materiály',
  ],
};
const REFS = {
  IDT:[
    {i:'🖼️',l:'Standardní osazení IDT',d:'POS materiály nad displej terminálu, viditelné od příchodu'},
    {i:'📋',l:'Plakát A4',d:'Vždy nad terminál, ne na výlohu nebo sklo'},
    {i:'🏷️',l:'Samolepka na stojan',d:'Stojánek na sázenky — samolepka 20 Mega dle aktuální kampaně'},
  ],
  PETROL:[
    {i:'⛽',l:'Umístění na ČS',d:'Terminál viditelný od pistolí i od vstupu do prodejny'},
    {i:'📋',l:'POS materiály',d:'Plakát nad terminál, stojan u pokladny — viditelné místo'},
    {i:'📸',l:'Foto standard',d:'Záběr z výšky očí, celý terminál v záběru'},
    {i:'🏛️',l:'Totem Allwyn',d:'3prvkový totem — pokladní zóna, deska na losy 38,5×24,5'},
  ],
  KA:[
    {i:'🏪',l:'Planogram partnera',d:'Terminál přesně na pozici dle schválené smlouvy — nesmí se měnit'},
    {i:'📸',l:'Foto dokumentace',d:'2 fotky povinné: pohled od vstupu + detail terminálu'},
    {i:'🏷️',l:'Ceny a letáky',d:'Vždy aktuální — zkontroluj datum v rohu letáku'},
    {i:'🏛️',l:'Totem Allwyn',d:'3prvkový, výměna víka desky na losy 32,5×44,5, prostor pro korunku'},
  ],
  CORN:[
    {i:'🟡',l:'Primární pult — aktuální emise',d:'Zlatá rybka NOVÁ emise — ne původní! Dle plánogramu lokace (Černý most, Arkády, Chodov = jiný než Plzeň, Smíchov)'},
    {i:'📋',l:'Totem: VŽDY 2 plakáty',d:'PŘEDNÍ: losy (Zlatá rybka) · ZADNÍ: loterie (EuroJackpot). Jen 1 kampaň → stejný plakát z obou stran. NIKDY bílá plocha!'},
    {i:'🎫',l:'Barketa Rybky + 20 Mega',d:'Barketa Zlatá rybka plní přání + stojánek 20 Mega. Žádná další visibilita — staré materiály vždy odstranit'},
    {i:'📂',l:'Sekundární pult — všechny losy',d:'Celé portfolio losů dle plánogramu. Jeden pult = všechny losy. Výjimka: Čestlice má nástěnku + plakát A1/A2'},
    {i:'🏛️',l:'Totem — prvky dle SAP',d:'Deska na losy 38,5×38,5 (SAP 122000) · Víko (SAP 122001) · Rámeček CDU (SAP 122007). Neponechávat prázdná místa!'},
  ],
};
// Inventory = dlouhodobý majetek
// Struktura: { vnitrni: [...], venkovni: [...] }
// Inventory = dlouhodobý majetek (Doménová pravidla #1: odděleno od Merch a
// Spotřebního materiálu). `sap`/`qty`/`installDate` jsou jen STRUKTURA pro
// budoucí napojení na reálný SAP — žádná SAP integrační logika zatím.
const INV_DEFAULT = {
  IDT:{
    vnitrni:[
      {id:'t',i:'🖥️',n:'Terminál Allwyn',typ:'',s:null,sap:'SAP-INV-001',qty:1,installDate:null},
      {id:'st',i:'🏛️',n:'Stojan na sázenky (velký)',typ:'',s:null,sap:'SAP-INV-002',qty:1,installDate:null},
      {id:'eso',i:'💡',n:'ESO výstrč',typ:'vnitřní',s:null,sap:'SAP-INV-003',qty:1,installDate:null},
    ],
    venkovni:[
      {id:'svetlo',i:'🏢',n:'Venkovní světelné označení',typ:'',s:null,sap:'SAP-INV-010',qty:1,installDate:null},
    ]
  },
  PETROL:{
    vnitrni:[
      {id:'t',i:'🖥️',n:'Terminál Allwyn',typ:'',s:null,sap:'SAP-INV-001',qty:1,installDate:null},
      {id:'to',i:'🏛️',n:'Totem Allwyn',typ:'3prvkový',s:null,sap:'SAP-INV-004',qty:1,installDate:null},
      {id:'st',i:'🏛️',n:'Stojan na sázenky (velký)',typ:'',s:null,sap:'SAP-INV-002',qty:1,installDate:null},
      {id:'eso',i:'💡',n:'ESO výstrč',typ:'vnitřní',s:null,sap:'SAP-INV-003',qty:1,installDate:null},
    ],
    venkovni:[
      {id:'svetlo',i:'🏢',n:'Venkovní světelné označení',typ:'',s:null,sap:'SAP-INV-010',qty:1,installDate:null},
    ]
  },
  KA:{
    vnitrni:[
      {id:'t',i:'🖥️',n:'Terminál Allwyn',typ:'',s:null,sap:'SAP-INV-001',qty:1,installDate:null},
      {id:'to',i:'🏛️',n:'Totem Allwyn',typ:'3prvkový',s:null,sap:'SAP-INV-004',qty:1,installDate:null},
      {id:'v',i:'📺',n:'VCU obrazovka',typ:'',s:null,sap:'SAP-INV-005',qty:1,installDate:null},
      {id:'st',i:'🏛️',n:'Stojan na sázenky (velký)',typ:'',s:null,sap:'SAP-INV-002',qty:1,installDate:null},
      {id:'eso',i:'💡',n:'ESO výstrč',typ:'vnitřní',s:null,sap:'SAP-INV-003',qty:1,installDate:null},
    ],
    venkovni:[
      {id:'svetlo',i:'🏢',n:'Venkovní světelné označení',typ:'',s:null,sap:'SAP-INV-010',qty:1,installDate:null},
    ]
  },
  CORN:{
    vnitrni:[
      {id:'t',i:'🖥️',n:'Terminál Allwyn',typ:'',s:null,sap:'SAP-INV-001',qty:1,installDate:null},
      {id:'to',i:'🏛️',n:'Totem Allwyn',typ:'',s:null,sap:'SAP-INV-004',qty:1,installDate:null},
      {id:'pult1',i:'🟡',n:'Primární pult (losy)',typ:'',s:null,sap:'SAP-INV-006',qty:1,installDate:null},
      {id:'pult2',i:'🟡',n:'Sekundární pult (losy)',typ:'',s:null,sap:'SAP-INV-007',qty:1,installDate:null},
      {id:'barketa',i:'🎫',n:'Barketa',typ:'',s:null,sap:'SAP-INV-008',qty:1,installDate:null},
      {id:'stojka',i:'📋',n:'Stojka',typ:'',s:null,sap:'SAP-INV-009',qty:1,installDate:null},
      {id:'eso',i:'💡',n:'ESO výstrč',typ:'vnitřní',s:null,sap:'SAP-INV-003',qty:1,installDate:null},
    ],
    venkovni:[
      {id:'svetlo',i:'🏢',n:'Venkovní světelné označení',typ:'',s:null,sap:'SAP-INV-010',qty:1,installDate:null},
    ]
  },
};

// Merch items per channel - co se osazuje (bez podpisu)
const MERCH_ITEMS = {
  IDT:[
    {n:'Plakát A4 — aktuální kampaň',done:false},
    {n:'Samolepka na stojan (20 Mega)',done:false},
    {n:'Odstranění starých materiálů Sazka',done:false},
  ],
  PETROL:[
    {n:'Plakát A4 — aktuální kampaň',done:false},
    {n:'Samolepka na stojan (20 Mega)',done:false},
    {n:'Osadit totem — plakáty přední + zadní',done:false},
    {n:'Korunka 15" — Zlatá rybka',done:false},
    {n:'Odstranění starých materiálů Sazka',done:false},
  ],
  KA:[
    {n:'Plakát A4 losy — dle plánogramu partnera',done:false},
    {n:'Samolepka na stojan (20 Mega)',done:false},
    {n:'Osadit totem — 2 plakáty (losy + loterie)',done:false},
    {n:'Korunka 15" — Zlatá rybka',done:false},
    {n:'Kontrola planogramu — správná pozice',done:false},
    {n:'Odstranění starých materiálů Sazka',done:false},
  ],
  CORN:[
    {n:'Primární pult — osadit aktuální emisi dle plánogramu',done:false},
    {n:'Sekundární pult — osadit všechny losy dle plánogramu',done:false},
    {n:'Totem přední strana — plakát Losy (Zlatá rybka)',done:false},
    {n:'Totem zadní strana — plakát Loterie (EuroJackpot)',done:false},
    {n:'Barketa Rybky + stojánek 20 Mega',done:false},
    {n:'Kontrola: žádná bílá plocha na totemu',done:false},
    {n:'Odstranění starých materiálů — veškerá Sazka visibilita',done:false},
  ],
};
const SUPPLY_DEFAULT = [
  {n:'Kotouče papíru do terminálu',qty:0,sap:'SAP-MOCK-001',unit:'role'},
  {n:'Samolepky na terminál — Allwyn',qty:0,sap:'SAP-MOCK-002',unit:'ks'},
  {n:'Trojúhelníky',qty:0,sap:'SAP-MOCK-003',unit:'ks'},
  {n:'Výměna sázenek',qty:0,sap:'SAP-MOCK-004',unit:'sada'},
  {n:'Šanon na losy',qty:0,sap:'SAP-MOCK-005',unit:'ks'},
  {n:'Plakáty A4 — aktuální kampaň',qty:0,sap:'SAP-MOCK-006',unit:'ks'},
  {n:'Plakáty A3 — aktuální kampaň',qty:0,sap:'SAP-MOCK-007',unit:'ks'},
];

const SUPPLY_CORN = [
  {n:'Kotouče papíru do terminálu',qty:0,sap:'SAP-MOCK-001',unit:'role'},
  {n:'Samolepky na terminál — Allwyn',qty:0,sap:'SAP-MOCK-002',unit:'ks'},
  {n:'Trojúhelníky',qty:0,sap:'SAP-MOCK-003',unit:'ks'},
  {n:'Výměna sázenek',qty:0,sap:'SAP-MOCK-004',unit:'sada'},
  {n:'Šanon na losy',qty:0,sap:'SAP-MOCK-005',unit:'ks'},
  {n:'Sazenka + obálky',qty:0,sap:'SAP-MOCK-010',unit:'sada'},
  {n:'Plakáty A4 — losy (Corn totem)',qty:0,sap:'SAP-MOCK-011',unit:'ks'},
  {n:'Plakáty A4 — loterie (Corn totem)',qty:0,sap:'SAP-MOCK-012',unit:'ks'},
  {n:'Deska na losy velká 38,5×38,5',qty:0,sap:'SAP 122000',unit:'ks'},
  {n:'Víko na desku na losy 34×44',qty:0,sap:'SAP 122001',unit:'ks'},
  {n:'Rámeček na CDU 38,5×24,5',qty:0,sap:'SAP 122007',unit:'ks'},
  {n:'Deska na losy malá 38,5×24,5',qty:0,sap:'SAP 121999',unit:'ks'},
  {n:'Deska na RS 38,5×10',qty:0,sap:'SAP 121998',unit:'ks'},
];
const CAMPAIGNS = {
  losy:[
    {
      name:'Zlatá rybka — nová emise',
      dates:'W23 – W28 (červen–červenec 2025)',
      deadline:'2025-07-11',
      items:[
        '⚠️ POUZE nová emise Zlaté rybky — ne původní!',
        'Plakát A4 Zlatá rybka — nad displej terminálu',
        'Stojánek na sázenky — samolepka 20 Mega',
        'Barketa Rybky — na Corn totem (jen Corn POS)',
        'Deska na losy dle plánogramu partnera',
      ],
      note:'Stále se objevují případy kdy se vystavuje původní zlatá rybka — ZAKÁZÁNO'
    }
  ],
  loterie:[
    {
      name:'EuroJackpot',
      dates:'W23 – W28 (červen–červenec 2025)',
      deadline:'2025-07-11',
      items:[
        'Plakát A4 EuroJackpot — nad displej terminálu',
        'Na Corn totemu: vždy 2 plakáty (losy + loterie)',
        'Nikdy nenechávej viditelnou bílou plochu na totemu',
      ]
    }
  ],
  rebranding:[
    {
      name:'Rebranding — norma 2 POS/den',
      dates:'Probíhá, W23–W28',
      deadline:'2025-07-11',
      items:[
        '✓ Norma: 2 rebrandované POS za den',
        'Kontrola samolepek Sazka mobil — musí být odstraněny',
        'ORLEN: pouze výměna losů + zásobování, NE rebranding',
        'Penalizace za Sazka samolepky na dokončených POS',
      ],
      note:'Materiály pro ORLEN jsou ve výrobě — rebranding bude následovat'
    }
  ]
};

