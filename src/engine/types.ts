// Спільні типи рушія гри «Битва за Україну: Лінія дронів».

export type Side = 'UA' | 'RU';
/** BY — Білорусь: нейтральна, доки напруга не сягне межі; тоді переходить до RU. */
export type Owner = Side | 'BY';
export type Country = 'UA' | 'RU' | 'BY';

export type Terrain = 'plain' | 'forest' | 'marsh' | 'mountain' | 'urban' | 'coast' | 'steppe' | 'fortress';

export type FacilityType =
  | 'refinery'
  | 'airfield'
  | 'drone_factory'
  | 'ammo_depot'
  | 'power_plant'
  | 'port'
  | 'bridge';

export interface FacilityDef {
  id: string;
  type: FacilityType;
  name: string;
  /** Вага в енергосистемі (лише для power_plant). */
  weight?: number;
  /** Аеродром стратегічної авіації (ціль «Павутини»). */
  strategic?: boolean;
}

export interface RegionDef {
  id: string;
  name: string;
  country: Country;
  /** Опорна точка (довгота, широта) для побудови меж і підпису. */
  seed: [number, number];
  weight?: number;
  terrain: Terrain;
  /** Вага набору рекрутів. */
  pop: number;
  /** Вага промисловості. */
  industry: number;
  facilities: FacilityDef[];
  capital?: boolean;
  /** Прикордонна зона РФ: по ній можна вести наземні бої. */
  belt?: boolean;
  ownPolygon?: 'crimea';
}

// ---------------------------------------------------------------- стан гри

export interface RegionState {
  owner: Owner;
  troops: number;
  /** Рівень ППО 0..4. */
  ad: number;
  /** Рівень укріплень 0..3. */
  fort: number;
  /** hp об'єктів у відсотках 0..100 за id. */
  facilities: Record<string, number>;
  /** Діверсія на залізниці: скільки ходів лишилось. */
  railCut: number;
  /** Діверсія проти ППО: скільки ходів лишилось. */
  aaSabotage: number;
}

export interface ResearchJob {
  tech: string;
  turnsLeft: number;
}

export interface OpJob {
  op: string;
  target?: string;
  prepLeft: number;
  exposed: boolean;
}

export interface TimedEffect {
  id: string;
  turnsLeft: number;
  /** Ключ множника в Mods або службовий ключ. */
  key: string;
  value: number;
  label: string;
}

export interface SideState {
  pp: number;
  /** 0..100. Для України — готовність партнерів допомагати; для РФ — експортні доходи. */
  support: number;
  /** 0..100. 0 = капітуляція. */
  resilience: number;
  /** 0..100 відсотків справності енергосистеми (обчислюється з об'єктів). */
  energy: number;
  drones: number;
  missiles: number;
  techs: string[];
  research: ResearchJob[];
  ops: OpJob[];
  opCooldown: Record<string, number>;
  /** 0..3 */
  mobilization: number;
  /** Частка доходу в %, що йде на дрони / ракети. */
  allocDrones: number;
  allocMissiles: number;
  casualties: number;
  kills: number;
  /** Втрати/вбиті за поточний тиждень (скидаються в кінці ходу). */
  weekCasualties: number;
  weekKills: number;
  effects: TimedEffect[];
  /** Стратегічна авіація, 0..1 (РФ). */
  stratAir: number;
  /** Доходи останнього ходу — для відображення. */
  lastIncome: number;
}

export interface BelarusState {
  tension: number;
  active: boolean;
}

export type Difficulty = 'easy' | 'normal' | 'hard';
export type Controller = 'human' | 'ai';

export interface LogEntry {
  turn: number;
  side: Side | 'world';
  text: string;
  kind?: 'move' | 'attack' | 'capture' | 'strike' | 'op' | 'tech' | 'event' | 'info' | 'loss';
  region?: string;
}

export interface GameOutcome {
  winner: Side | 'draw';
  reason: string;
  /** Скільки тижнів тривала партія (для підсумкового екрана). */
  weeks?: number;
}

export interface GameConfig {
  seed: number;
  difficulty: Difficulty;
  controllers: Record<Side, Controller>;
  scenario: string;
}

export interface HistoryPoint {
  week: number;
  uaRegions: number;
  uaTroops: number;
  ruTroops: number;
  uaRes: number;
  ruRes: number;
}

export interface GameState {
  version: number;
  config: GameConfig;
  /** Понеділок першого ходу (ISO-дата). */
  startDate: string;
  turn: number;
  /** Генератор випадкових чисел (стан mulberry32). */
  rng: number;
  activeSide: Side;
  ordersLeft: number;
  regions: Record<string, RegionState>;
  sides: Record<Side, SideState>;
  belarus: BelarusState;
  log: LogEntry[];
  /** Тижневий зріз для графіка на фінальному екрані. */
  history: HistoryPoint[];
  ticker: string[];
  outcome: GameOutcome | null;
  /** Ходи, у яких відбувалися події «світу». */
  flags: Record<string, number>;
}

// ---------------------------------------------------------------- модифікатори технологій

export interface Mods {
  atk: number;
  def: number;
  /** множник власних втрат (менше = краще) */
  ownLoss: number;
  /** частка підкріплень, що гинуть, заходячи у прифронтову область супротивника */
  interdiction: number;
  moveRange: number;
  orders: number;
  droneCost: number;
  missileCost: number;
  droneYield: number;
  /** додаток до виживання дронів/ракет у ППО */
  penDrone: number;
  penMissile: number;
  adDrone: number;
  adMissile: number;
  rangeMul: number;
  ppMul: number;
  aidMul: number;
  oilMul: number;
  energyResist: number;
  recruit: number;
  intel: number;
  seaEcon: number;
  killBonus: number;
  repair: number;
  airSupport: number;
  opRisk: number;
  researchSpeed: number;
  strikeDamage: number;
  /** множник ударів по портах і мостах (морські дрони) */
  seaStrike: number;
}

export type ModKey = keyof Mods;

export interface TechEffect {
  key: ModKey;
  /** Додається до базового значення (після масштабування контрзаходами). */
  add: number;
}

export interface TechCounter {
  tech: string;
  /** 0..1 — на скільки послаблюється ефект цілі */
  factor: number;
}

export interface TechDef {
  id: string;
  name: string;
  side: Side | 'both';
  branch: 'front' | 'strike' | 'econ' | 'special';
  cost: number;
  turns: number;
  requires: string[];
  desc: string;
  effects: TechEffect[];
  /** Якщо власник має цю технологію — вона послаблює вказані технології супротивника. */
  counters?: TechCounter[];
  /** Власні ефекти ігнорують контрзаходи цих технологій супротивника. */
  ignores?: string[];
  icon: string;
}

// ---------------------------------------------------------------- накази

export type Order =
  | { type: 'move'; from: string; to: string; fraction: number }
  | { type: 'attack'; from: string; to: string; fraction: number }
  | { type: 'strike'; target: StrikeTarget; drones: number; missiles: number }
  | { type: 'fortify'; region: string }
  | { type: 'startOp'; op: string; target?: string }
  | { type: 'pressure' } // РФ: тиск на Мінськ
  | { type: 'fortifyNorth' } // УА: укріпити північ
  // --- безкоштовні дії (не витрачають наказ)
  | { type: 'research'; tech: string }
  | { type: 'cancelResearch'; tech: string }
  | { type: 'policy'; mobilization?: number; allocDrones?: number; allocMissiles?: number }
  | { type: 'deployAD'; region: string }
  | { type: 'endTurn' };

export type StrikeTarget =
  | { kind: 'facility'; region: string; facility: string }
  | { kind: 'city'; region: string };

export interface BattleReport {
  from: string;
  to: string;
  attackers: number;
  defenders: number;
  attackerLoss: number;
  defenderLoss: number;
  captured: boolean;
  retreated: number;
  ratio: number;
}

export interface OrderResult {
  ok: boolean;
  error?: string;
  battle?: BattleReport;
  strike?: StrikeReport;
  /** Скільки бійців реально перемістилося. */
  moved?: number;
  lost?: number;
}

export interface StrikeReport {
  target: StrikeTarget;
  region: string;
  drones: number;
  missiles: number;
  dronesHit: number;
  missilesHit: number;
  damage: number;
  facilityHp?: number;
}
