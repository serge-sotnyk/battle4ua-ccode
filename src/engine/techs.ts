// Дерево технологій і обчислення модифікаторів сторони.
//
// Центральна ідея «меч і щит»: кожна технологія може мати контрзаходи. Якщо супротивник
// володіє технологією, що її контрить, ефект послаблюється. `ignores` дозволяє технології
// обходити конкретні контрзаходи (оптоволоконні FPV проти РЕБ).

import type { GameState, ModKey, Mods, Side, TechDef } from './types';
import { CFG } from './config';

export const BASE_MODS: Mods = {
  atk: 1,
  def: 1,
  ownLoss: 1,
  interdiction: 0,
  moveRange: 1,
  orders: CFG.baseOrders,
  droneCost: 1,
  missileCost: 1,
  droneYield: 1,
  penDrone: 0,
  penMissile: 0,
  adDrone: 1,
  adMissile: 1,
  rangeMul: 1,
  ppMul: 1,
  aidMul: 1,
  oilMul: 1,
  energyResist: 0,
  recruit: 1,
  intel: 0,
  seaEcon: 0,
  killBonus: 0,
  repair: 1,
  airSupport: 0,
  opRisk: 1,
  researchSpeed: 1,
  strikeDamage: 1,
  seaStrike: 1,
};

const T = (t: TechDef): TechDef => t;

export const TECHS: TechDef[] = [
  // ------------------------------------------------------------- ФРОНТ
  T({ id: 'fpv', name: 'FPV-дрони', side: 'both', branch: 'front', cost: 28, turns: 3, requires: [], icon: '🎯',
    desc: 'Дешеві дрони-камікадзе створюють «зону ураження» перед позиціями: краща оборона й трохи сильніша атака.',
    effects: [{ key: 'atk', add: 0.07 }, { key: 'def', add: 0.09 }] }),
  T({ id: 'ew', name: 'Засоби РЕБ', side: 'both', branch: 'front', cost: 26, turns: 3, requires: [], icon: '📡',
    desc: 'Глушіння зв’язку й керування: послаблює звичайні FPV супротивника.',
    effects: [{ key: 'def', add: 0.04 }],
    counters: [{ tech: 'fpv', factor: 0.4 }] }),
  T({ id: 'fiber_fpv', name: 'Оптоволоконні FPV', side: 'both', branch: 'front', cost: 45, turns: 4, requires: ['fpv'], icon: '🧵',
    desc: 'Керування кабелем — РЕБ безсилий. Відповідь — сітки над дорогами й полювання на оператори.',
    effects: [{ key: 'atk', add: 0.06 }, { key: 'def', add: 0.07 }],
    ignores: ['ew'] }),
  T({ id: 'nets', name: 'Протидронові сітки', side: 'both', branch: 'front', cost: 24, turns: 2, requires: [], icon: '🕸️',
    desc: 'Сітки над дорогами й позиціями; особливо ріжуть оптоволоконні FPV.',
    effects: [{ key: 'def', add: 0.04 }],
    counters: [{ tech: 'fpv', factor: 0.2 }, { tech: 'fiber_fpv', factor: 0.35 }] }),
  T({ id: 'midstrike', name: 'Мідл-страйк дрони', side: 'both', branch: 'front', cost: 50, turns: 4, requires: ['fpv'], icon: '🚁',
    desc: 'Удари на десятки кілометрів по логістиці: частина підкріплень ворога гине дорогою до фронту.',
    effects: [{ key: 'interdiction', add: 0.07 }] }),
  T({ id: 'short_ad', name: 'Мобільні вогневі групи', side: 'both', branch: 'front', cost: 34, turns: 3, requires: [], icon: '🔫',
    desc: 'Ближня ППО проти «шахедів», розвідників і мідл-страйку.',
    effects: [{ key: 'adDrone', add: 0.12 }, { key: 'def', add: 0.02 }],
    counters: [{ tech: 'midstrike', factor: 0.45 }, { tech: 'shahed', factor: 0.2 }, { tech: 'lr_drones', factor: 0.15 }] }),
  T({ id: 'ugv', name: 'Наземні роботи', side: 'both', branch: 'front', cost: 55, turns: 5, requires: ['fpv'], icon: '🤖',
    desc: 'Логістика й евакуація без людей на передку: власні втрати менші.',
    effects: [{ key: 'ownLoss', add: -0.1 }] }),
  T({ id: 'mines', name: 'Мінні поля й загородження', side: 'both', branch: 'front', cost: 30, turns: 3, requires: [], icon: '🧨',
    desc: 'Інженерні загородження підсилюють оборону.',
    effects: [{ key: 'def', add: 0.06 }] }),
  T({ id: 'drone_line', name: 'Лінія дронів', side: 'UA', branch: 'front', cost: 60, turns: 5, requires: ['fpv', 'nets'], icon: '🛰️',
    desc: 'Багаторівнева смуга «зон ураження»: сильна оборона й менші втрати піхоти.',
    effects: [{ key: 'def', add: 0.12 }, { key: 'ownLoss', add: -0.04 }] }),
  T({ id: 'western_arty', name: 'Західна далекобійна артилерія', side: 'UA', branch: 'front', cost: 45, turns: 4, requires: [], icon: '💥',
    desc: 'Точна артилерія з партнерських поставок.',
    effects: [{ key: 'atk', add: 0.06 }, { key: 'def', add: 0.04 }] }),
  T({ id: 'glide_bombs', name: 'Керовані авіабомби (КАБи)', side: 'RU', branch: 'front', cost: 40, turns: 3, requires: [], icon: '✈️',
    desc: 'Потужна підтримка штурмів з-за меж ППО. Залежить від справних аеродромів. Послаблюється «Патріотами».',
    effects: [{ key: 'atk', add: 0.05 }, { key: 'airSupport', add: 0.12 }] }),
  T({ id: 'mass_assault', name: 'Масові штурми', side: 'RU', branch: 'front', cost: 20, turns: 2, requires: [], icon: '🪖',
    desc: 'Дешеві піхотні хвилі: сильніша атака ціною більших власних втрат.',
    effects: [{ key: 'atk', add: 0.1 }, { key: 'ownLoss', add: 0.12 }] }),
  T({ id: 'shell_imports', name: 'Імпорт боєприпасів', side: 'RU', branch: 'front', cost: 25, turns: 2, requires: [], icon: '📦',
    desc: 'Снаряди від союзників: більше вогню і на атаці, і в обороні.',
    effects: [{ key: 'atk', add: 0.04 }, { key: 'def', add: 0.03 }] }),

  // ------------------------------------------------------------- УДАРИ / ППО
  T({ id: 'lr_drones', name: 'Далекобійні дрони', side: 'UA', branch: 'strike', cost: 35, turns: 3, requires: [], icon: '🛩️',
    desc: 'Більше дронів за одиницю виробництва й кращий прорив ППО. Послаблюється мобільними вогневими групами.',
    effects: [{ key: 'droneYield', add: 0.3 }, { key: 'rangeMul', add: 0.1 }, { key: 'penDrone', add: 0.05 }] }),
  T({ id: 'shahed', name: '«Шахеди» (серійне виробництво)', side: 'RU', branch: 'strike', cost: 25, turns: 2, requires: [], icon: '🪰',
    desc: 'Масовий дешевий дрон-камікадзе для виснаження ППО й енергетики.',
    effects: [{ key: 'droneYield', add: 0.6 }, { key: 'droneCost', add: -0.1 }] }),
  T({ id: 'interceptors', name: 'Дрони-перехоплювачі', side: 'both', branch: 'strike', cost: 40, turns: 4, requires: [], icon: '🦅',
    desc: 'Дешево збивають «шахеди» й далекобійні дрони.',
    effects: [{ key: 'adDrone', add: 0.3 }],
    counters: [{ tech: 'shahed', factor: 0.35 }, { tech: 'lr_drones', factor: 0.3 }] }),
  T({ id: 'decoys', name: 'Дрони-імітатори', side: 'both', branch: 'strike', cost: 25, turns: 2, requires: [], icon: '🎭',
    desc: 'Відволікають ППО — більше справжніх дронів долітає.',
    effects: [{ key: 'penDrone', add: 0.1 }] }),
  T({ id: 'cruise', name: 'Крилаті ракети', side: 'both', branch: 'strike', cost: 55, turns: 5, requires: [], icon: '🚀',
    desc: 'Дешевші й краще долають ППО ракети середньої дальності.',
    effects: [{ key: 'missileCost', add: -0.4 }, { key: 'penMissile', add: 0.1 }, { key: 'rangeMul', add: 0.08 }] }),
  T({ id: 'ballistic', name: 'Балістичні ракети', side: 'RU', branch: 'strike', cost: 60, turns: 5, requires: ['cruise'], icon: '☄️',
    desc: 'Майже не збиваються звичайною ППО. Контра — «Патріоти».',
    effects: [{ key: 'penMissile', add: 0.2 }] }),
  T({ id: 'patriot', name: 'ППО «Патріот» / IRIS-T', side: 'UA', branch: 'strike', cost: 55, turns: 5, requires: [], icon: '🛡️',
    desc: 'Сильне ППО проти ракет і КАБів. Залежить від партнерів.',
    effects: [{ key: 'adMissile', add: 0.35 }, { key: 'adDrone', add: 0.1 }],
    counters: [{ tech: 'ballistic', factor: 0.3 }, { tech: 'cruise', factor: 0.15 }, { tech: 'glide_bombs', factor: 0.3 }] }),
  T({ id: 's400', name: 'ППО С-400 / С-500', side: 'RU', branch: 'strike', cost: 50, turns: 4, requires: [], icon: '🛡️',
    desc: 'Щільне ешелоноване ППО над тилом.',
    effects: [{ key: 'adMissile', add: 0.3 }, { key: 'adDrone', add: 0.15 }],
    counters: [{ tech: 'cruise', factor: 0.2 }, { tech: 'lr_drones', factor: 0.15 }] }),
  T({ id: 'ad_net', name: 'Мережа акустичних постів', side: 'both', branch: 'strike', cost: 30, turns: 3, requires: [], icon: '👂',
    desc: 'Дешеве виявлення низьких цілей по всій території.',
    effects: [{ key: 'adDrone', add: 0.15 }] }),
  T({ id: 'strike_planning', name: 'Планування ударів', side: 'both', branch: 'strike', cost: 35, turns: 3, requires: [], icon: '🗺️',
    desc: 'Краща розвідка цілей і узгодження залпів: більше шкоди з кожного влучання.',
    effects: [{ key: 'strikeDamage', add: 0.15 }] }),
  T({ id: 'sea_drones', name: 'Морські дрони', side: 'UA', branch: 'strike', cost: 45, turns: 4, requires: [], icon: '🚤',
    desc: 'Вигнання флоту з заходу Чорного моря, зерновий коридор (+економіка), ефективні удари по портах і мостах.',
    effects: [{ key: 'seaEcon', add: 0.08 }, { key: 'seaStrike', add: 0.4 }] }),
  T({ id: 'coastal_def', name: 'Берегова оборона', side: 'RU', branch: 'strike', cost: 30, turns: 3, requires: [], icon: '⚓',
    desc: 'Катери, ракети й РЕБ на узбережжі: зменшує ефект морських дронів.',
    effects: [{ key: 'adDrone', add: 0.05 }],
    counters: [{ tech: 'sea_drones', factor: 0.5 }] }),

  // ------------------------------------------------------------- ЕКОНОМІКА
  T({ id: 'arms_industry', name: 'Оборонна промисловість', side: 'both', branch: 'econ', cost: 40, turns: 4, requires: [], icon: '🏭',
    desc: 'Розширення виробництва: +15% до виробництва.',
    effects: [{ key: 'ppMul', add: 0.15 }] }),
  T({ id: 'backup_power', name: 'Розосереджена генерація', side: 'both', branch: 'econ', cost: 35, turns: 3, requires: [], icon: '🔋',
    desc: 'Менша вразливість до ударів по енергосистемі.',
    effects: [{ key: 'energyResist', add: 0.3 }] }),
  T({ id: 'mobilization_sys', name: 'Система обліку й мобілізації', side: 'both', branch: 'econ', cost: 30, turns: 3, requires: [], icon: '🗂️',
    desc: '+15% до щотижневого припливу бійців.',
    effects: [{ key: 'recruit', add: 0.15 }] }),
  T({ id: 'army_of_drones', name: '«Армія дронів. Бонус»', side: 'UA', branch: 'econ', cost: 25, turns: 2, requires: [], icon: '⭐',
    desc: 'Бали за знищених ворогів конвертуються у виробництво: заохочує активну оборону.',
    effects: [{ key: 'killBonus', add: 0.8 }] }),
  T({ id: 'shadow_fleet', name: 'Тіньовий флот', side: 'RU', branch: 'econ', cost: 30, turns: 3, requires: [], icon: '🛢️',
    desc: 'Обхід санкцій: +20% нафтових доходів.',
    effects: [{ key: 'oilMul', add: 0.2 }] }),
  T({ id: 'partner_lobby', name: 'Дипломатія партнерів', side: 'UA', branch: 'econ', cost: 30, turns: 3, requires: [], icon: '🤝',
    desc: '+25% до допомоги партнерів.',
    effects: [{ key: 'aidMul', add: 0.25 }] }),
  T({ id: 'rail_logistics', name: 'Залізничні перевезення', side: 'both', branch: 'econ', cost: 40, turns: 3, requires: [], icon: '🚆',
    desc: 'Перекидання військ на 2 області за наказ.',
    effects: [{ key: 'moveRange', add: 1 }] }),
  T({ id: 'logistic_hubs', name: 'Логістичні хаби', side: 'both', branch: 'econ', cost: 70, turns: 5, requires: ['rail_logistics'], icon: '📦',
    desc: 'Перекидання військ на 3 області за наказ.',
    effects: [{ key: 'moveRange', add: 1 }] }),
  T({ id: 'c2', name: 'Єдина система управління', side: 'both', branch: 'econ', cost: 70, turns: 5, requires: ['rail_logistics'], icon: '🧭',
    desc: '+1 наказ на тиждень.',
    effects: [{ key: 'orders', add: 1 }] }),
  T({ id: 'repair_crews', name: 'Ремонтні бригади', side: 'both', branch: 'econ', cost: 28, turns: 3, requires: [], icon: '🔧',
    desc: 'Об’єкти відновлюються швидше.',
    effects: [{ key: 'repair', add: 0.6 }] }),
  T({ id: 'intel_net', name: 'Розвідувальна мережа', side: 'both', branch: 'econ', cost: 25, turns: 3, requires: [], icon: '🔭',
    desc: 'Показує, що досліджує супротивник.',
    effects: [{ key: 'intel', add: 1 }] }),
  T({ id: 'intel_ai', name: 'Аналітичний центр', side: 'both', branch: 'econ', cost: 40, turns: 4, requires: ['intel_net'], icon: '🧠',
    desc: 'Бачить підготовку ворожих спецоперацій; власні операції рідше викриваються.',
    effects: [{ key: 'intel', add: 1 }, { key: 'opRisk', add: -0.25 }] }),

  // ------------------------------------------------------------- СПЕЦІАЛЬНЕ
  T({ id: 'saboteurs', name: 'Диверсійні мережі', side: 'both', branch: 'special', cost: 40, turns: 4, requires: [], icon: '🕵️',
    desc: 'Відкриває диверсійні спецоперації (залізниця, «Павутина», діверсії проти ППО).',
    effects: [{ key: 'opRisk', add: -0.1 }] }),
  T({ id: 'cyber', name: 'Кібервійська', side: 'both', branch: 'special', cost: 45, turns: 4, requires: [], icon: '💻',
    desc: 'Відкриває кібератаки на енергосистему супротивника.',
    effects: [] }),
];

export const TECH_BY_ID: Record<string, TechDef> = Object.fromEntries(TECHS.map((t) => [t.id, t]));

export function techsForSide(side: Side): TechDef[] {
  return TECHS.filter((t) => t.side === 'both' || t.side === side);
}

export function hasTech(state: GameState, side: Side, id: string): boolean {
  return state.sides[side].techs.includes(id);
}

/** Які саме контрзаходи ворога послаблюють цю технологію (і на скільки, підсумок). */
export function techScale(state: GameState, side: Side, techId: string): number {
  const other: Side = side === 'UA' ? 'RU' : 'UA';
  const def = TECH_BY_ID[techId];
  let scale = 1;
  for (const oid of state.sides[other].techs) {
    if (def.ignores?.includes(oid)) continue;
    const od = TECH_BY_ID[oid];
    for (const c of od.counters ?? []) {
      if (c.tech === techId) scale *= 1 - c.factor;
    }
  }
  return scale;
}

export function activeCounters(state: GameState, side: Side, techId: string): Array<{ by: string; factor: number; ignored: boolean }> {
  const other: Side = side === 'UA' ? 'RU' : 'UA';
  const def = TECH_BY_ID[techId];
  const out: Array<{ by: string; factor: number; ignored: boolean }> = [];
  for (const oid of state.sides[other].techs) {
    const od = TECH_BY_ID[oid];
    for (const c of od.counters ?? []) {
      if (c.tech === techId) out.push({ by: oid, factor: c.factor, ignored: !!def.ignores?.includes(oid) });
    }
  }
  return out;
}

/** Обчислити модифікатори сторони: технології (з контрзаходами) + тимчасові ефекти. */
export function computeMods(state: GameState, side: Side): Mods {
  const m: Mods = { ...BASE_MODS };
  for (const id of state.sides[side].techs) {
    const def = TECH_BY_ID[id];
    if (!def) continue;
    const scale = techScale(state, side, id);
    for (const e of def.effects) {
      // моделі, що не є «множниками сили» (дальність ходу, наказів, розвідка), не масштабуємо
      const raw = e.add;
      const scaled = e.key === 'moveRange' || e.key === 'orders' || e.key === 'intel' ? raw : raw * scale;
      (m[e.key as ModKey] as number) += scaled;
    }
  }
  for (const eff of state.sides[side].effects) {
    // службові ефекти (наприклад, кібератака) не є модифікаторами
    if (eff.key in m) (m[eff.key as ModKey] as number) += eff.value;
  }
  return m;
}
