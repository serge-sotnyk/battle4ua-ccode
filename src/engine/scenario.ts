// Початковий сценарій «Жовтень 2026» — стилізована, а не документальна розстановка.

import { CFG } from './config';
import { REGION_DEFS } from './map/regions';
import { invalidateMods, ordersFor } from './selectors';
import { FEB_2022, SCENARIO_BY_ID, type ScenarioOverrides } from './scenarios';
import type { GameConfig, GameState, RegionState, Side, SideState } from './types';

export const GAME_VERSION = 2;

type Start = { owner: 'UA' | 'RU' | 'BY'; troops: number; ad?: number; fort?: number };

const START: Record<string, Start> = {
  // Україна
  volyn: { owner: 'UA', troops: 3000 },
  rivne: { owner: 'UA', troops: 2000, ad: 1 },
  lviv: { owner: 'UA', troops: 9000, ad: 1 },
  zakarpattia: { owner: 'UA', troops: 2000 },
  ivano: { owner: 'UA', troops: 2000, ad: 1 },
  chernivtsi: { owner: 'UA', troops: 1800 },
  ternopil: { owner: 'UA', troops: 2200 },
  khmelnytskyi: { owner: 'UA', troops: 3000, ad: 1 },
  zhytomyr: { owner: 'UA', troops: 5000 },
  vinnytsia: { owner: 'UA', troops: 3000 },
  kyiv: { owner: 'UA', troops: 28000, ad: 3 },
  chernihiv: { owner: 'UA', troops: 6500, fort: 1 },
  cherkasy: { owner: 'UA', troops: 3000 },
  poltava: { owner: 'UA', troops: 6000, ad: 1 },
  sumy: { owner: 'UA', troops: 8500, ad: 1, fort: 1 },
  kharkiv: { owner: 'UA', troops: 15000, ad: 2, fort: 1 },
  donetsk_n: { owner: 'UA', troops: 19000, fort: 1 },
  dnipro: { owner: 'UA', troops: 16000, ad: 2 },
  zaporizhzhia_n: { owner: 'UA', troops: 14000, ad: 2, fort: 1 },
  kirovohrad: { owner: 'UA', troops: 3000 },
  mykolaiv: { owner: 'UA', troops: 7000, ad: 1 },
  odesa: { owner: 'UA', troops: 8000, ad: 2 },
  kherson_r: { owner: 'UA', troops: 9000, fort: 1 },
  // Окуповані області
  luhansk: { owner: 'RU', troops: 23000, fort: 1 },
  donetsk_s: { owner: 'RU', troops: 27000, fort: 1 },
  zaporizhzhia_s: { owner: 'RU', troops: 17000, fort: 2 },
  kherson_l: { owner: 'RU', troops: 11000, fort: 1 },
  crimea: { owner: 'RU', troops: 13000, ad: 3, fort: 1 },
  // Росія: прикордонна зона
  belgorod: { owner: 'RU', troops: 14000, ad: 2 },
  kursk: { owner: 'RU', troops: 13000, ad: 2 },
  bryansk: { owner: 'RU', troops: 10000, ad: 2 },
  voronezh: { owner: 'RU', troops: 11000, ad: 1 },
  rostov: { owner: 'RU', troops: 22000, ad: 2 },
  krasnodar: { owner: 'RU', troops: 9000, ad: 2 },
  // Росія: тил
  moscow: { owner: 'RU', troops: 35000, ad: 4 },
  tula: { owner: 'RU', troops: 7000, ad: 1 },
  oryol: { owner: 'RU', troops: 5000 },
  ryazan: { owner: 'RU', troops: 6000, ad: 1 },
  tambov: { owner: 'RU', troops: 5000 },
  volgograd: { owner: 'RU', troops: 8000, ad: 1 },
  stavropol: { owner: 'RU', troops: 7000, ad: 1 },
  saratov: { owner: 'RU', troops: 6000, ad: 1 },
  smolensk: { owner: 'RU', troops: 5000, ad: 1 },
  leningrad: { owner: 'RU', troops: 9000, ad: 2 },
  novgorod: { owner: 'RU', troops: 3000 },
  tver: { owner: 'RU', troops: 3000 },
  yaroslavl: { owner: 'RU', troops: 3000, ad: 1 },
  vladimir: { owner: 'RU', troops: 3000 },
  nizhny: { owner: 'RU', troops: 5000, ad: 1 },
  tatarstan: { owner: 'RU', troops: 5000, ad: 2 },
  penza: { owner: 'RU', troops: 3000 },
  astrakhan: { owner: 'RU', troops: 2500 },
  kirov: { owner: 'RU', troops: 2500 },
  vologda: { owner: 'RU', troops: 2000 },
  // Білорусь (нейтральна)
  brest: { owner: 'BY', troops: 4000 },
  hrodna: { owner: 'BY', troops: 3000 },
  minsk: { owner: 'BY', troops: 6000, ad: 2 },
  vitebsk: { owner: 'BY', troops: 3000 },
  mogilev: { owner: 'BY', troops: 3000 },
  homel: { owner: 'BY', troops: 5000, ad: 1 },
};

function freshSide(side: Side): SideState {
  const ua = side === 'UA';
  return {
    pp: ua ? 30 : 40,
    support: ua ? CFG.support.startUA : 70,
    resilience: CFG.resilience.start[side],
    energy: 100,
    drones: ua ? 40 : 70,
    missiles: ua ? 4 : 14,
    techs: ua ? ['fpv', 'ew', 'nets', 'lr_drones'] : ['fpv', 'ew', 'mines', 'cruise', 'shahed', 'glide_bombs'],
    research: [],
    ops: [],
    opCooldown: {},
    mobilization: 1,
    allocDrones: ua ? 32 : 22,
    allocMissiles: ua ? 10 : 12,
    casualties: 0,
    kills: 0,
    weekCasualties: 0,
    weekKills: 0,
    effects: [],
    stratAir: 1,
    lastIncome: 0,
  };
}

export function createGame(partial: Partial<GameConfig> = {}): GameState {
  const config: GameConfig = {
    seed: partial.seed ?? 1,
    difficulty: partial.difficulty ?? 'normal',
    controllers: partial.controllers ?? { UA: 'human', RU: 'ai' },
    scenario: partial.scenario ?? 'oct-2026',
  };
  const regions: Record<string, RegionState> = {};
  for (const def of REGION_DEFS) {
    const st = START[def.id];
    if (!st) throw new Error(`Немає стартових даних для регіону ${def.id}`);
    const facilities: Record<string, number> = {};
    for (const f of def.facilities) facilities[f.id] = 100;
    regions[def.id] = {
      owner: st.owner,
      troops: st.troops,
      ad: st.ad ?? 0,
      fort: st.fort ?? 0,
      facilities,
      railCut: 0,
      aaSabotage: 0,
    };
  }
  const meta = SCENARIO_BY_ID[config.scenario] ?? SCENARIO_BY_ID['oct-2026'];
  config.scenario = meta.id;
  const state: GameState = {
    version: GAME_VERSION,
    config,
    startDate: meta.startDate,
    turn: 0,
    rng: config.seed | 0 || 1,
    activeSide: 'UA',
    ordersLeft: CFG.baseOrders,
    regions,
    sides: { UA: freshSide('UA'), RU: freshSide('RU') },
    belarus: { tension: CFG.belarus.startTension, active: false },
    log: [],
    ticker: ['Гра розпочалася. Україна тримає оборону, а небо над нею — «лінія дронів».'],
    outcome: null,
    flags: {},
  };
  if (meta.id === 'feb-2022') applyOverrides(state, FEB_2022);
  invalidateMods(state);
  state.ordersLeft = ordersFor(state, 'UA');
  state.log.push({ turn: 0, side: 'world', kind: 'info', text: meta.id === 'feb-2022' ? FEB_2022.intro : 'Початок кампанії: жовтень 2026. Тиждень — один хід.' });
  return state;
}

function applyOverrides(state: GameState, ov: ScenarioOverrides): void {
  for (const [id, o] of Object.entries(ov.regions)) {
    const r = state.regions[id];
    if (!r) throw new Error(`Сценарій посилається на невідомий регіон ${id}`);
    if (o.owner) r.owner = o.owner;
    if (o.troops !== undefined) r.troops = o.troops;
    if (o.ad !== undefined) r.ad = o.ad;
    if (o.fort !== undefined) r.fort = o.fort;
  }
  for (const side of ['UA', 'RU'] as Side[]) {
    const so = ov.sides[side];
    if (!so) continue;
    const s = state.sides[side];
    if (so.pp !== undefined) s.pp = so.pp;
    if (so.support !== undefined) s.support = so.support;
    if (so.resilience !== undefined) s.resilience = so.resilience;
    if (so.drones !== undefined) s.drones = so.drones;
    if (so.missiles !== undefined) s.missiles = so.missiles;
    if (so.techs) s.techs = [...so.techs];
    if (so.allocDrones !== undefined) s.allocDrones = so.allocDrones;
    if (so.allocMissiles !== undefined) s.allocMissiles = so.allocMissiles;
  }
  state.belarus.tension = ov.tension;
  state.ticker = [ov.ticker];
}
