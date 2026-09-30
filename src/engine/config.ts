// Увесь баланс гри в одному місці. Числа — стартова пропозиція, підбиралася симуляціями
// «ШІ проти ШІ» (npm run sim) і ручною грою.

import type { FacilityType, Terrain } from './types';

export interface DifficultyParams {
  label: string;
  aiLossMul: number;
  humanBonusOrders: number;
  aiBonusOrders: number;
  graceTurns: number;
  aiMinRatioMul: number;
  aiEconMul: number;
}

export const CFG = {
  turnDays: 7,
  /** Ліміт партії: приблизно 3 роки → «перемир'я по лінії». */
  maxTurns: 156,
  baseOrders: 4,
  /** Менше цього в області не лишається після наказів. */
  minGarrison: 50,

  combat: {
    attackKill: 0.18,
    defenseKill: 0.15,
    variance: 0.1,
    /** Оборона руйнується, якщо залишок ≤ collapse × (вцілілі нападники). */
    collapse: 0.4,
    /** Частка залишків оборонців, що відступає, а не гине. */
    retreatKeep: 0.55,
    /** Вплив стійкості на ефективність: 0.85 + 0.15·res/100 */
    moraleBase: 0.85,
    riverDefense: 1.12,
    fortBonus: 0.05,
  },

  terrainDef: {
    plain: 1.0,
    forest: 1.05,
    marsh: 1.1,
    mountain: 1.15,
    urban: 1.12,
    coast: 1.03,
    steppe: 1.0,
    fortress: 1.25,
  } as Record<Terrain, number>,

  /** Сезонні модифікатори атаки / ефективності ударів по енергетиці. Індекс = місяць (0=січень). */
  season: {
    attack: [0.96, 0.96, 0.88, 0.9, 1.0, 1.04, 1.05, 1.05, 1.0, 0.9, 0.88, 0.96],
    energyHit: [1.5, 1.5, 1.2, 1.0, 0.9, 0.85, 0.85, 0.85, 0.95, 1.1, 1.3, 1.5],
    names: ['зима', 'зима', 'бездоріжжя', 'бездоріжжя', 'весна', 'літо', 'літо', 'літо', 'осінь', 'осіннє бездоріжжя', 'бездоріжжя', 'зима'],
  },

  economy: {
    ppPerIndustry: 0.12,
    aidPerSupport: 0.11,
    oilBase: 13,
    /** Внесок розвалених НПЗ: oilFactor = floor + (1-floor)·(…) */
    oilFloor: 0.15,
    killBonusPerThousand: 1,
    seaEconBase: 4,
  },

  recruit: {
    UA: 5600,
    RU: 8600,
    /** М'який ліміт чисельності: що ближче до нього, то менше поповнення. */
    softCap: { UA: 320000, RU: 560000 } as Record<'UA' | 'RU', number>,
    mobilizationMul: [0.55, 1.0, 1.35, 1.7],
    mobilizationResDrain: [-0.25, 0, 0.25, 0.65],
    frontWeight: 0.5,
  },

  munitions: {
    droneCost: 0.4,
    missileCost: 3.0,
    /** Скільки дронів/ракет дає 1 PP при droneYield=1 */
    droneStockCap: 400,
    missileStockCap: 80,
  },

  strike: {
    /** Ймовірність збиття 1 дрона кожним рівнем ППО (до множників). */
    adKillDrone: 0.16,
    adKillMissile: 0.085,
    minSurvDrone: 0.06,
    minSurvMissile: 0.2,
    /** Пошкодження об'єкта (%) від одного влучання. */
    dmgDrone: 0.8,
    dmgMissile: 4.5,
    toughness: {
      refinery: 1.0,
      airfield: 1.25,
      drone_factory: 0.9,
      ammo_depot: 1.1,
      power_plant: 1.0,
      port: 1.3,
      bridge: 1.7,
    } as Record<FacilityType, number>,
    /** Базова дальність, км. */
    rangeDrone: 1700,
    rangeMissile: 900,
    /** Вплив ударів по містах (лише РФ → УА). */
    cityResPerHit: 0.04,
    cityResCap: 3,
    citySupportPerHit: 0.05,
    citySupportCap: 4,
  },

  repair: { perTurn: 6, bridge: 6 },

  resilience: {
    start: { UA: 72, RU: 78 } as Record<'UA' | 'RU', number>,
    regen: 0.45,
    perKiloCasualty: 0.12,
    perKiloKill: 0.03,
    energyDrain: 1.2,
    capture: 1.6,
    lose: 2.2,
    capitalLose: 8,
    oilDrain: 1.2,
  },

  support: {
    startUA: 62,
    /** Дрейф до цього рівня щотижня */
    driftTarget: 58,
    driftRate: 0.06,
  },

  belarus: {
    startTension: 18,
    perTurn: 1.4,
    pressure: 9,
    fortifyNorth: 9,
    /** Підкріплення РФ, що прибувають при вступі Білорусі. */
    surge: 34000,
    activationAt: 100,
  },

  research: {
    slots: 2,
  },

  ad: {
    maxLevel: 4,
    /** Вартість розгортання ППО у область (PP), залежно від поточного рівня. */
    cost: [10, 18, 28, 40],
  },

  fortify: { cost: [8, 14, 22], max: 3 },

  ops: {
    baseRisk: 0.1,
  },

  /**
   * Складність — окремо для гравця за Україну та за Росію (сторони асиметричні).
   * Діє лише проти людини. aiLossMul — множник втрат ШІ (як «пенальті» оригіналу);
   * humanBonusOrders / aiBonusOrders — додаткові накази; graceTurns — скільки тижнів ШІ не атакує;
   * aiMinRatioMul — обережність ШІ в атаках; aiEconMul — множник виробництва й поповнення ШІ.
   */
  difficulty: {
    UA: {
      easy: { label: 'Легка', aiLossMul: 1.5, humanBonusOrders: 2, aiBonusOrders: 0, graceTurns: 6, aiMinRatioMul: 1.3, aiEconMul: 0.9 },
      normal: { label: 'Звичайна', aiLossMul: 1.25, humanBonusOrders: 1, aiBonusOrders: 0, graceTurns: 2, aiMinRatioMul: 1.0, aiEconMul: 1.0 },
      hard: { label: 'Тяжка', aiLossMul: 1.0, humanBonusOrders: 0, aiBonusOrders: 0, graceTurns: 0, aiMinRatioMul: 1.0, aiEconMul: 1.0 },
    },
    RU: {
      easy: { label: 'Легка', aiLossMul: 1.15, humanBonusOrders: 1, aiBonusOrders: 1, graceTurns: 4, aiMinRatioMul: 1.15, aiEconMul: 1.1 },
      normal: { label: 'Звичайна', aiLossMul: 1.0, humanBonusOrders: 0, aiBonusOrders: 2, graceTurns: 2, aiMinRatioMul: 1.0, aiEconMul: 1.25 },
      hard: { label: 'Тяжка', aiLossMul: 1.0, humanBonusOrders: 0, aiBonusOrders: 3, graceTurns: 0, aiMinRatioMul: 0.9, aiEconMul: 1.5 },
    },
  } as Record<'UA' | 'RU', Record<'easy' | 'normal' | 'hard', DifficultyParams>>,

  /** Порогові значення для перемир'я за ліміту ходів (кількість областей України під контролем УА). */
  victory: { uaWinAtTimeout: 27, ruWinAtTimeout: 15 },
} as const;

export type Cfg = typeof CFG;
