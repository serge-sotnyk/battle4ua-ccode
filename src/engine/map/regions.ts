// Статичні дані регіонів: геометричне «насіння», місцевість, населення, промисловість, об'єкти.
// Це ігрова стилізація, а не статистика.

import type { FacilityDef, RegionDef } from '../types';

const f = (id: string, type: FacilityDef['type'], name: string, extra: Partial<FacilityDef> = {}): FacilityDef => ({
  id,
  type,
  name,
  ...extra,
});

export const REGION_DEFS: RegionDef[] = [
  // ---------------- Україна ----------------
  { id: 'volyn', name: 'Волинь', country: 'UA', seed: [25.0, 51.1], terrain: 'forest', pop: 4, industry: 2, facilities: [] },
  { id: 'rivne', name: 'Рівненщина', country: 'UA', seed: [26.5, 51.0], terrain: 'marsh', pop: 4, industry: 2,
    facilities: [f('rivne_aes', 'power_plant', 'Рівненська АЕС', { weight: 12 })] },
  { id: 'lviv', name: 'Львівщина', country: 'UA', seed: [24.0, 49.75], terrain: 'plain', pop: 8, industry: 5,
    facilities: [f('lviv_drones', 'drone_factory', 'Дронові заводи Львова')] },
  { id: 'zakarpattia', name: 'Закарпаття', country: 'UA', seed: [23.2, 48.5], terrain: 'mountain', pop: 3, industry: 2, facilities: [] },
  { id: 'ivano', name: 'Івано-Франківщина', country: 'UA', seed: [24.6, 48.7], terrain: 'mountain', pop: 5, industry: 3,
    facilities: [f('burshtyn', 'power_plant', 'Бурштинська ТЕС', { weight: 10 })] },
  { id: 'chernivtsi', name: 'Чернівеччина', country: 'UA', seed: [25.9, 48.25], terrain: 'mountain', pop: 3, industry: 2, facilities: [] },
  { id: 'ternopil', name: 'Тернопільщина', country: 'UA', seed: [25.6, 49.45], terrain: 'plain', pop: 4, industry: 2,
    facilities: [f('ternopil_depot', 'ammo_depot', 'Склади боєприпасів (Тернопіль)')] },
  { id: 'khmelnytskyi', name: 'Хмельниччина', country: 'UA', seed: [26.9, 49.55], terrain: 'plain', pop: 4, industry: 3,
    facilities: [
      f('khmelnytskyi_aes', 'power_plant', 'Хмельницька АЕС', { weight: 16 }),
      f('starokostiantyniv', 'airfield', 'Аеродром Старокостянтинів'),
    ] },
  { id: 'zhytomyr', name: 'Житомирщина', country: 'UA', seed: [28.3, 50.75], terrain: 'forest', pop: 5, industry: 3,
    facilities: [f('zhytomyr_depot', 'ammo_depot', 'Склади боєприпасів (Житомир)')] },
  { id: 'vinnytsia', name: 'Вінниччина', country: 'UA', seed: [28.5, 49.0], weight: -200, terrain: 'plain', pop: 5, industry: 3,
    facilities: [f('kalynivka', 'ammo_depot', 'Склади боєприпасів (Калинівка)')] },
  { id: 'kyiv', name: 'Київщина', country: 'UA', seed: [30.3, 50.3], terrain: 'urban', pop: 14, industry: 9, capital: true,
    facilities: [
      f('kyiv_tec', 'power_plant', 'ТЕЦ Києва', { weight: 20 }),
      f('kyiv_drones', 'drone_factory', 'Київські дронові майстерні'),
    ] },
  { id: 'chernihiv', name: 'Чернігівщина', country: 'UA', seed: [31.8, 51.4], terrain: 'marsh', pop: 4, industry: 2, facilities: [] },
  { id: 'cherkasy', name: 'Черкащина', country: 'UA', seed: [31.6, 49.4], terrain: 'plain', pop: 5, industry: 3, facilities: [] },
  { id: 'poltava', name: 'Полтавщина', country: 'UA', seed: [34.0, 49.6], terrain: 'plain', pop: 6, industry: 5,
    facilities: [
      f('kremenchuk', 'refinery', 'Кременчуцький НПЗ'),
      f('myrhorod', 'airfield', 'Аеродром Миргород'),
    ] },
  { id: 'sumy', name: 'Сумщина', country: 'UA', seed: [34.3, 50.95], terrain: 'forest', pop: 4, industry: 2, facilities: [] },
  { id: 'kharkiv', name: 'Харківщина', country: 'UA', seed: [36.6, 49.65], terrain: 'urban', pop: 9, industry: 7,
    facilities: [
      f('kharkiv_tec', 'power_plant', 'ТЕЦ Харкова', { weight: 14 }),
      f('balakliia', 'ammo_depot', 'Склади боєприпасів (Балаклія)'),
    ] },
  { id: 'luhansk', name: 'Луганщина', country: 'UA', seed: [39.0, 49.0], terrain: 'steppe', pop: 4, industry: 4, facilities: [] },
  { id: 'donetsk_n', name: 'Донеччина (Краматорськ)', country: 'UA', seed: [37.6, 48.7], terrain: 'fortress', pop: 4, industry: 5,
    facilities: [] },
  { id: 'donetsk_s', name: 'Донеччина (Маріуполь)', country: 'UA', seed: [37.6, 47.5], terrain: 'urban', pop: 5, industry: 6,
    facilities: [f('mariupol_port', 'port', 'Маріупольський порт')] },
  { id: 'dnipro', name: 'Дніпропетровщина', country: 'UA', seed: [34.9, 48.5], terrain: 'urban', pop: 11, industry: 10,
    facilities: [f('dnipro_tes', 'power_plant', 'Придніпровська ТЕС', { weight: 18 })] },
  { id: 'zaporizhzhia_n', name: 'Запоріжжя', country: 'UA', seed: [35.2, 47.75], terrain: 'urban', pop: 6, industry: 7,
    facilities: [f('dniprohes', 'power_plant', 'Дніпровська ГЕС', { weight: 14 })] },
  { id: 'zaporizhzhia_s', name: 'Мелітопольщина', country: 'UA', seed: [35.5, 46.95], terrain: 'steppe', pop: 3, industry: 2,
    facilities: [
      f('zaes', 'power_plant', 'Запорізька АЕС', { weight: 12 }),
      f('melitopol_air', 'airfield', 'Аеродром Мелітополь'),
    ] },
  { id: 'kirovohrad', name: 'Кіровоградщина', country: 'UA', seed: [32.2, 48.6], terrain: 'steppe', pop: 3, industry: 2, facilities: [] },
  { id: 'mykolaiv', name: 'Миколаївщина', country: 'UA', seed: [31.7, 47.3], terrain: 'steppe', pop: 4, industry: 3,
    facilities: [f('mykolaiv_yards', 'port', 'Миколаївські верфі')] },
  { id: 'odesa', name: 'Одещина', country: 'UA', seed: [30.0, 47.1], weight: 1100, terrain: 'coast', pop: 8, industry: 6,
    facilities: [f('odesa_port', 'port', 'Одеський порт')] },
  { id: 'kherson_r', name: 'Херсонщина (правий берег)', country: 'UA', seed: [32.6, 47.0], terrain: 'steppe', pop: 2, industry: 1, facilities: [] },
  { id: 'kherson_l', name: 'Херсонщина (лівий берег)', country: 'UA', seed: [34.0, 46.3], terrain: 'steppe', pop: 2, industry: 1, facilities: [] },
  { id: 'crimea', name: 'Крим', country: 'UA', seed: [34.1, 45.1], terrain: 'coast', pop: 5, industry: 3, ownPolygon: 'crimea',
    facilities: [
      f('kerch_bridge', 'bridge', 'Кримський міст'),
      f('saky', 'airfield', 'Аеродром Саки'),
      f('sevastopol', 'port', 'Севастополь (база флоту)'),
    ] },

  // ---------------- Білорусь ----------------
  { id: 'brest', name: 'Берестейщина', country: 'BY', seed: [25.0, 52.3], terrain: 'marsh', pop: 4, industry: 2, facilities: [] },
  { id: 'hrodna', name: 'Гродненщина', country: 'BY', seed: [25.3, 53.7], terrain: 'forest', pop: 3, industry: 2, facilities: [] },
  { id: 'minsk', name: 'Мінщина', country: 'BY', seed: [27.6, 53.8], terrain: 'urban', pop: 7, industry: 5, facilities: [] },
  { id: 'vitebsk', name: 'Вітебщина', country: 'BY', seed: [29.6, 55.2], terrain: 'forest', pop: 3, industry: 2, facilities: [] },
  { id: 'mogilev', name: 'Могильовщина', country: 'BY', seed: [30.4, 53.8], terrain: 'plain', pop: 3, industry: 2, facilities: [] },
  { id: 'homel', name: 'Гомельщина', country: 'BY', seed: [30.2, 52.3], terrain: 'marsh', pop: 4, industry: 3,
    facilities: [f('zyabrovka', 'airfield', 'Аеродром Зябровка')] },

  // ---------------- Росія ----------------
  { id: 'bryansk', name: 'Брянщина', country: 'RU', seed: [34.0, 53.2], terrain: 'forest', pop: 5, industry: 3, belt: true,
    facilities: [f('bryansk_arsenal', 'ammo_depot', 'Брянський арсенал')] },
  { id: 'kursk', name: 'Курщина', country: 'RU', seed: [36.4, 51.7], terrain: 'plain', pop: 5, industry: 3, belt: true,
    facilities: [
      f('kursk_aes', 'power_plant', 'Курська АЕС', { weight: 14 }),
      f('khalino', 'airfield', 'Аеродром Халіно'),
    ] },
  { id: 'belgorod', name: 'Бєлгородщина', country: 'RU', seed: [37.7, 50.6], terrain: 'plain', pop: 4, industry: 3, belt: true,
    facilities: [f('belgorod_tec', 'power_plant', 'Бєлгородська ТЕЦ', { weight: 8 })] },
  { id: 'voronezh', name: 'Воронежчина', country: 'RU', seed: [39.8, 51.3], terrain: 'plain', pop: 6, industry: 4, belt: true,
    facilities: [
      f('novovoronezh', 'power_plant', 'Нововоронезька АЕС', { weight: 12 }),
      f('borisoglebsk', 'airfield', 'Аеродром Борисоглібськ'),
    ] },
  { id: 'rostov', name: 'Ростовщина', country: 'RU', seed: [40.6, 47.8], terrain: 'steppe', pop: 8, industry: 6, belt: true,
    facilities: [
      f('rostov_aes', 'power_plant', 'Ростовська АЕС', { weight: 10 }),
      f('morozovsk', 'airfield', 'Аеродром Морозовськ'),
      f('novoshakhtinsk', 'refinery', 'Новошахтинський НПЗ'),
      f('taganrog_drones', 'drone_factory', 'Таганрозький завод'),
    ] },
  { id: 'krasnodar', name: 'Кубань', country: 'RU', seed: [39.7, 45.2], terrain: 'plain', pop: 9, industry: 6, belt: true,
    facilities: [
      f('tuapse', 'refinery', 'Туапсинський НПЗ'),
      f('ilsky', 'refinery', 'НПЗ Ільський / Афіпський'),
      f('novorossiysk', 'port', 'Новоросійськ'),
      f('yeysk', 'airfield', 'Аеродром Єйськ'),
      f('tikhoretsk', 'ammo_depot', 'Склади у Тихорецьку'),
    ] },
  { id: 'stavropol', name: 'Північний Кавказ', country: 'RU', seed: [43.5, 44.6], terrain: 'plain', pop: 8, industry: 3, facilities: [] },
  { id: 'astrakhan', name: 'Астраханщина', country: 'RU', seed: [46.3, 46.5], terrain: 'steppe', pop: 3, industry: 2, facilities: [] },
  { id: 'volgograd', name: 'Волгоградщина', country: 'RU', seed: [44.4, 49.5], terrain: 'steppe', pop: 5, industry: 4,
    facilities: [
      f('volgograd_npz', 'refinery', 'Волгоградський НПЗ'),
      f('volgograd_ges', 'power_plant', 'Волзька ГЕС', { weight: 8 }),
      f('kotluban', 'ammo_depot', 'Склади у Котлубані'),
    ] },
  { id: 'saratov', name: 'Саратовщина', country: 'RU', seed: [46.6, 51.6], terrain: 'steppe', pop: 5, industry: 4,
    facilities: [
      f('saratov_npz', 'refinery', 'Саратовський НПЗ'),
      f('balakovo', 'power_plant', 'Балаківська АЕС', { weight: 10 }),
      f('engels', 'airfield', 'Аеродром Енгельс (стратегічна авіація)', { strategic: true }),
    ] },
  { id: 'tambov', name: 'Тамбовщина', country: 'RU', seed: [41.5, 52.8], terrain: 'plain', pop: 4, industry: 2, facilities: [] },
  { id: 'oryol', name: 'Орловщина', country: 'RU', seed: [36.1, 52.95], terrain: 'plain', pop: 3, industry: 2, facilities: [] },
  { id: 'penza', name: 'Пензенщина', country: 'RU', seed: [45.0, 53.2], terrain: 'plain', pop: 4, industry: 2, facilities: [] },
  { id: 'ryazan', name: 'Рязанщина', country: 'RU', seed: [40.3, 54.4], terrain: 'plain', pop: 4, industry: 3,
    facilities: [
      f('ryazan_npz', 'refinery', 'Рязанський НПЗ'),
      f('dyagilevo', 'airfield', 'Аеродром Дягілєво (стратегічна авіація)', { strategic: true }),
    ] },
  { id: 'tula', name: 'Тульщина', country: 'RU', seed: [36.6, 54.2], terrain: 'plain', pop: 5, industry: 4,
    facilities: [f('shaykovka', 'airfield', 'Аеродром Шайківка')] },
  { id: 'smolensk', name: 'Смоленщина', country: 'RU', seed: [32.6, 54.9], terrain: 'forest', pop: 4, industry: 2,
    facilities: [f('smolensk_aes', 'power_plant', 'Смоленська АЕС', { weight: 10 })] },
  { id: 'moscow', name: 'Москва й область', country: 'RU', seed: [37.6, 55.75], terrain: 'urban', pop: 20, industry: 14, capital: true,
    facilities: [
      f('moscow_npz', 'refinery', 'Московський НПЗ'),
      f('moscow_tec', 'power_plant', 'ТЕЦ Москви', { weight: 16 }),
      f('moscow_drones', 'drone_factory', 'Підмосковні виробництва «Гераней»'),
    ] },
  { id: 'tver', name: 'Тверщина', country: 'RU', seed: [34.8, 57.2], terrain: 'forest', pop: 3, industry: 2,
    facilities: [f('toropets', 'ammo_depot', 'Склади у Торопці')] },
  { id: 'yaroslavl', name: 'Ярославщина', country: 'RU', seed: [40.0, 57.6], terrain: 'forest', pop: 4, industry: 3,
    facilities: [f('yaroslavl_npz', 'refinery', 'Ярославський НПЗ')] },
  { id: 'vladimir', name: 'Володимирщина', country: 'RU', seed: [41.2, 56.1], terrain: 'forest', pop: 4, industry: 3, facilities: [] },
  { id: 'nizhny', name: 'Нижегородщина', country: 'RU', seed: [44.0, 56.2], terrain: 'forest', pop: 6, industry: 5,
    facilities: [
      f('kstovo', 'refinery', 'Кстовський НПЗ'),
      f('nizhny_drones', 'drone_factory', 'Нижньогородські БпЛА-заводи'),
    ] },
  { id: 'tatarstan', name: 'Татарстан', country: 'RU', seed: [48.5, 55.5], terrain: 'plain', pop: 6, industry: 6,
    facilities: [
      f('alabuga', 'drone_factory', 'Алабуга (завод «Шахедів»)'),
      f('taneco', 'refinery', 'ТАНЕКО'),
    ] },
  { id: 'kirov', name: 'Кіровщина', country: 'RU', seed: [46.5, 58.8], terrain: 'forest', pop: 3, industry: 2, facilities: [] },
  { id: 'novgorod', name: 'Новгородщина–Псковщина', country: 'RU', seed: [31.0, 58.0], terrain: 'forest', pop: 3, industry: 2, facilities: [] },
  { id: 'leningrad', name: 'Ленінградщина', country: 'RU', seed: [31.6, 59.9], terrain: 'forest', pop: 9, industry: 6,
    facilities: [
      f('kirishi', 'refinery', 'Кіріші (НПЗ)'),
      f('lenin_aes', 'power_plant', 'Ленінградська АЕС', { weight: 12 }),
      f('primorsk', 'port', 'Приморськ / Усть-Луга'),
    ] },
  { id: 'vologda', name: 'Вологодщина', country: 'RU', seed: [38.5, 59.8], terrain: 'forest', pop: 3, industry: 3, facilities: [] },
];

/** Ребра суміжності, яких геометрія не дасть (наприклад, міст) — або які треба заборонити. */
export const EXTRA_EDGES: Array<[string, string, { kind: 'bridge' }]> = [
  ['crimea', 'krasnodar', { kind: 'bridge' }],
];

/** Ребра, що геометрично торкаються, але в грі не є сусідніми. */
export const BLOCKED_EDGES: Array<[string, string]> = [];

/** Ребра з річковою перешкодою: атака через них має штраф. */
export const RIVER_EDGES: Array<[string, string]> = [
  ['kherson_r', 'kherson_l'],
  ['dnipro', 'kherson_l'],
  ];
