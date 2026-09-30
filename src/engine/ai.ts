// ШІ обох сторін. Працює через ті самі applyOrder / estimateBattle, що й гравець.
//
// Схема: (1) aiPrepare — безкоштовні рішення тижня (політики, дослідження, ППО);
// (2) aiChooseOrder — вибір наступного наказу за оцінкою «ціна/користь»; (3) коли
// нічого корисного немає — завершення ходу.

import { CFG } from './config';
import { estimateBattle, fuelFactor, airFactor, moraleFactor } from './combat';
import { attackError, applyOrder } from './orders';
import { OPS, opAvailability, validTargets } from './ops';
import { forecastStrike, validateStrike } from './strikes';
import { nextRandom } from './rng';
import {
  ALL_REGION_IDS,
  REGION_BY_ID,
  adjacentEnemyTroops,
  friendlyDistances,
  getMods,
  isFront,
  neighborsOf,
  other,
  reachableFriendly,
  seasonAttackMod,
  supplyFactor,
} from './selectors';
import { TECH_BY_ID, techsForSide } from './techs';
import type { GameState, Order, Side, StrikeTarget } from './types';

const TECH_PRIORITY: Record<Side, string[]> = {
  UA: [
    'interceptors', 'backup_power', 'drone_line', 'ad_net', 'arms_industry', 'rail_logistics', 'fiber_fpv', 'patriot', 'c2', 'midstrike',
    'repair_crews', 'army_of_drones', 'partner_lobby', 'saboteurs', 'sea_drones', 'cruise',
    'strike_planning', 'decoys', 'mobilization_sys', 'intel_net', 'ugv', 'short_ad', 'mines',
    'western_arty', 'logistic_hubs', 'cyber', 'intel_ai',
  ],
  RU: [
    'arms_industry', 'mass_assault', 'rail_logistics', 'shell_imports', 'fiber_fpv', 'midstrike', 's400', 'ballistic',
    'shadow_fleet', 'c2', 'repair_crews', 'interceptors', 'coastal_def', 'mobilization_sys', 'nets', 'backup_power',
    'saboteurs', 'short_ad', 'ad_net', 'strike_planning', 'ugv', 'logistic_hubs', 'intel_net', 'cyber', 'decoys',
  ],
};

interface AiPlan {
  /** Скільки потрібно для оборони (без планів наступу). */
  defNeed: Record<string, number>;
  /** Бажаний гарнізон з урахуванням збору сил для наступу. */
  desired: Record<string, number>;
  spare: Record<string, number>;
  deficit: Record<string, number>;
}

// ----------------------------------------------------------------------------------
// Оцінка областей

function defPerUnit(state: GameState, id: string): number {
  const r = state.regions[id];
  const side = r.owner as Side;
  return (
    getMods(state, side).def *
    moraleFactor(state, side) *
    CFG.terrainDef[REGION_BY_ID[id].terrain] *
    (1 + CFG.combat.fortBonus * r.fort) *
    supplyFactor(state, id)
  );
}

/** Потенційна сила ворожого удару по області в наступний хід. */
function attackPotential(state: GameState, id: string): number {
  const r = state.regions[id];
  if (r.owner === 'BY') return 0;
  const side = r.owner as Side;
  const foe = other(side);
  const mF = getMods(state, foe);
  let s = 0;
  for (const n of neighborsOf(id)) {
    const nr = state.regions[n];
    if (nr.owner !== foe) continue;
    if (attackError(state, foe, n, id)) continue;
    s += nr.troops * 0.7 * mF.atk * moraleFactor(state, foe) * seasonAttackMod(state.turn) * fuelFactor(state, foe) * airFactor(state, foe);
  }
  return s;
}

export function regionValue(state: GameState, side: Side, id: string): number {
  const def = REGION_BY_ID[id];
  let v = 3500 + 1100 * def.industry + 500 * def.pop + 900 * def.facilities.length;
  if (def.capital) v += 45000;
  if (side === 'UA' && def.country === 'UA') v += 3500; // звільнення власної землі
  if (side === 'UA' && def.country === 'RU') v *= 0.55; // рейд у РФ — другорядне
  if (side === 'RU' && id === 'kyiv') v += 40000;
  return v;
}

function computePlan(state: GameState, side: Side): AiPlan {
  const desired: Record<string, number> = {};
  const defNeed: Record<string, number> = {};
  const spare: Record<string, number> = {};
  const deficit: Record<string, number> = {};
  const own = ALL_REGION_IDS.filter((id) => state.regions[id].owner === side);
  for (const id of own) {
    const r = state.regions[id];
    let d: number = CFG.minGarrison * 6;
    if (isFront(state, id)) {
      const pot = attackPotential(state, id);
      d = Math.max(d, (pot * 1.1) / Math.max(0.5, defPerUnit(state, id)));
      const def = REGION_BY_ID[id];
      if (def.capital) d *= 1.25;
    }
    defNeed[id] = d;
    desired[id] = d;
    spare[id] = Math.max(0, r.troops - d);
    deficit[id] = Math.max(0, d - r.troops);
  }

  // наступальні цілі: 1–2 найвигідніші
  const mods = getMods(state, side);
  const atkPerUnit = mods.atk * moraleFactor(state, side) * seasonAttackMod(state.turn) * fuelFactor(state, side) * airFactor(state, side);
  const objectives: Array<{ from: string; to: string; need: number; score: number }> = [];
  for (const from of own) {
    for (const to of neighborsOf(from)) {
      if (state.regions[to].owner !== other(side)) continue;
      if (attackError(state, side, from, to)) continue;
      const t = state.regions[to];
      const defPow = t.troops * getMods(state, other(side)).def * moraleFactor(state, other(side)) * CFG.terrainDef[REGION_BY_ID[to].terrain] * (1 + CFG.combat.fortBonus * t.fort) * supplyFactor(state, to);
      const need = (1.45 * defPow) / atkPerUnit;
      const score = regionValue(state, side, to) / (need + 2500);
      objectives.push({ from, to, need, score });
    }
  }
  objectives.sort((a, b) => b.score - a.score);
  const used = new Set<string>();
  let k = 0;
  for (const o of objectives) {
    if (k >= 2) break;
    if (used.has(o.from)) continue;
    used.add(o.from);
    k++;
    const want = o.need + desired[o.from] * 0.6;
    if (want > desired[o.from]) {
      desired[o.from] = want;
      spare[o.from] = Math.max(0, state.regions[o.from].troops - want);
      deficit[o.from] = Math.max(0, want - state.regions[o.from].troops);
    }
  }
  return { defNeed, desired, spare, deficit };
}

// ----------------------------------------------------------------------------------
// Безкоштовні рішення

export function aiPrepare(state: GameState, side: Side): void {
  const key = `aiPrep${side}`;
  if (state.flags[key] === state.turn + 1) return;
  state.flags[key] = state.turn + 1;
  const s = state.sides[side];
  const plan = computePlan(state, side);
  const totalDeficit = Object.values(plan.deficit).reduce((a, b) => a + b, 0);
  const totalTroops = ALL_REGION_IDS.reduce((a, id) => a + (state.regions[id].owner === side ? state.regions[id].troops : 0), 0);

  // мобілізація
  let mob = 1;
  if (totalDeficit > 0.22 * totalTroops && s.resilience > 45) mob = 2;
  if (totalDeficit > 0.45 * totalTroops && s.resilience > 60) mob = 3;
  if (s.resilience < 38) mob = 0;
  applyOrder(state, { type: 'policy', mobilization: mob });

  // частки на боєприпаси
  const stockD = s.drones / CFG.munitions.droneStockCap;
  const stockM = s.missiles / CFG.munitions.missileStockCap;
  const baseD = side === 'UA' ? 32 : 22;
  const baseM = side === 'UA' ? 10 : 12;
  applyOrder(state, {
    type: 'policy',
    allocDrones: stockD > 0.75 ? 5 : baseD,
    allocMissiles: stockM > 0.75 ? 3 : baseM,
  });

  // дослідження
  const reserve = 12;
  for (const id of TECH_PRIORITY[side]) {
    if (s.research.length >= CFG.research.slots) break;
    const t = TECH_BY_ID[id];
    if (!t || (t.side !== 'both' && t.side !== side)) continue;
    if (s.techs.includes(id) || s.research.some((j) => j.tech === id)) continue;
    if (t.requires.some((r) => !s.techs.includes(r))) continue;
    if (s.pp - t.cost < reserve) continue;
    applyOrder(state, { type: 'research', tech: id });
  }
  // підхоплюємо будь-яку доступну, якщо ще є слоти й гроші
  if (s.research.length < CFG.research.slots && s.pp > 70) {
    for (const t of techsForSide(side)) {
      if (s.research.length >= CFG.research.slots) break;
      if (s.techs.includes(t.id) || s.research.some((j) => j.tech === t.id)) continue;
      if (t.requires.some((r) => !s.techs.includes(r))) continue;
      if (s.pp - t.cost < 30) continue;
      applyOrder(state, { type: 'research', tech: t.id });
    }
  }

  // ППО: у цінні області
  if (s.pp > 28) {
    const cand = ALL_REGION_IDS.filter((id) => state.regions[id].owner === side)
      .map((id) => {
        const def = REGION_BY_ID[id];
        const fac = def.facilities.filter((f) => f.type === 'refinery' || f.type === 'power_plant' || f.type === 'drone_factory').length;
        const plant = def.facilities.some((f) => f.type === 'power_plant');
        const want = def.capital ? 4 : plant ? 3 : fac >= 2 ? 3 : fac >= 1 ? 2 : def.pop >= 8 ? 2 : 0;
        return { id, gap: want - state.regions[id].ad, w: def.industry + fac * 3 + (plant ? 8 : 0) + (def.capital ? 10 : 0) };
      })
      .filter((c) => c.gap > 0)
      .sort((a, b) => b.w * b.gap - a.w * a.gap);
    for (const c of cand.slice(0, 2)) {
      if (state.sides[side].pp < 28) break;
      applyOrder(state, { type: 'deployAD', region: c.id });
    }
  }
}

// ----------------------------------------------------------------------------------
// Наступний наказ

interface Candidate {
  order: Order;
  score: number;
}

const FACILITY_VALUE: Record<string, number> = {
  refinery: 6.5,
  airfield: 4,
  drone_factory: 6,
  ammo_depot: 4,
  power_plant: 3.5,
  port: 4.5,
  bridge: 3,
};

function chooseStrike(state: GameState, side: Side): Candidate | null {
  const s = state.sides[side];
  const foe = other(side);
  const minDrones = side === 'UA' ? 26 : 36;
  const minMissiles = 4;
  if (s.drones < minDrones && s.missiles < minMissiles) return null;
  let best: Candidate | null = null;
  for (const rid of ALL_REGION_IDS) {
    const r = state.regions[rid];
    if (r.owner !== foe) continue;
    for (const f of REGION_BY_ID[rid].facilities) {
      const hp = r.facilities[f.id] ?? 100;
      if (hp < 25) continue;
      if (side === 'RU' && f.type === 'refinery') continue; // РФ б'є по енергетиці, складах, аеродромах
      const drones = Math.floor(s.drones * 0.9);
      const missiles = Math.floor(s.missiles * 0.75);
      const target: StrikeTarget = { kind: 'facility', region: rid, facility: f.id };
      const dUse = drones >= minDrones ? drones : 0;
      const mUse = missiles >= minMissiles ? missiles : 0;
      if (dUse + mUse === 0) continue;
      if (validateStrike(state, side, target, dUse, mUse)) {
        // спробувати лише дронами або лише ракетами
        if (!validateStrike(state, side, target, dUse, 0) && dUse > 0) {
          const fc = forecastStrike(state, side, target, dUse, 0);
          const sc = Math.min(hp, fc.expectedDamage) * (FACILITY_VALUE[f.type] ?? 3) * 0.3;
          if (!best || sc > best.score) best = { order: { type: 'strike', target, drones: dUse, missiles: 0 }, score: sc };
        }
        continue;
      }
      const fc = forecastStrike(state, side, target, dUse, mUse);
      let val = FACILITY_VALUE[f.type] ?? 3;
      if (side === 'RU' && f.type === 'power_plant') val += 2.5;
      const sc = Math.min(hp, fc.expectedDamage) * val * 0.3;
      if (!best || sc > best.score) best = { order: { type: 'strike', target, drones: dUse, missiles: mUse }, score: sc };
    }
    // РФ: терор проти міст як запасний варіант
    if (side === 'RU' && REGION_BY_ID[rid].pop >= 8 && s.drones >= 50) {
      const target: StrikeTarget = { kind: 'city', region: rid };
      const dUse = Math.floor(s.drones * 0.8);
      if (!validateStrike(state, side, target, dUse, 0)) {
        const sc = 6;
        if (!best || sc > best.score) best = { order: { type: 'strike', target, drones: dUse, missiles: 0 }, score: sc };
      }
    }
  }
  if (!best || best.score < 10) return null;
  return best;
}

export function aiChooseOrder(state: GameState, side: Side): Order {
  if (state.outcome || state.ordersLeft <= 0) return { type: 'endTurn' };
  aiPrepare(state, side);
  const plan = computePlan(state, side);
  const cands: Candidate[] = [];
  const mods = getMods(state, side);
  const own = ALL_REGION_IDS.filter((id) => state.regions[id].owner === side);
  const aggr = side === 'RU' ? 1.0 : 0.9;

  // ---- атаки (у «звичайному» режимі ШІ дає людині кілька тижнів на підготовку)
  const grace = state.config.difficulty === 'normal' && state.config.controllers[other(side)] === 'human' && state.turn < CFG.ai.normalGraceTurns;
  for (const from of grace ? [] : own) {
    const r = state.regions[from];
    const spareTroops = r.troops - Math.max(plan.defNeed[from] * 0.8, CFG.minGarrison * 3);
    if (spareTroops < 300) continue;
    for (const to of neighborsOf(from)) {
      if (attackError(state, side, from, to)) continue;
      for (const f of [0.5, 0.8, 1]) {
        const committed = Math.floor(spareTroops * f);
        if (committed < 200) continue;
        const est = estimateBattle(state, from, to, committed);
        const minRatio = 0.98 / aggr;
        if (est.ratio < minRatio) continue;
        const cap = est.captured ? regionValue(state, side, to) : 0;
        const value = est.killsDefenders - 0.85 * est.killsAttackers * mods.ownLoss + cap * 0.9;
        // мала поправка, щоб не робити однакових рішень
        const score = value / 100 + 0.05 * nextRandom(state);
        if (score > 2) cands.push({ order: { type: 'attack', from, to, fraction: Math.min(1, committed / r.troops) }, score });
      }
    }
  }

  // ---- перекидання до областей з дефіцитом
  for (const from of own) {
    const r = state.regions[from];
    const spare = plan.spare[from];
    if (spare < 400 || r.troops - CFG.minGarrison < 1) continue;
    const reach = reachableFriendly(state, side, from);
    const dist = friendlyDistances(state, side, from);
    for (const to of reach) {
      const def = plan.deficit[to];
      if (def < 300) continue;
      const moved = Math.min(spare, def * 1.05);
      if (moved < 300) continue;
      const fraction = Math.min(1, moved / r.troops);
      const importance = 1 + (isFront(state, to) ? 0.5 : 0) + (REGION_BY_ID[to].capital ? 0.6 : 0);
      const score = (Math.min(moved, def) / 100) * 0.55 * importance / (1 + 0.15 * (dist[to] ?? 1));
      cands.push({ order: { type: 'move', from, to, fraction }, score });
    }
  }

  // ---- удари
  const strike = chooseStrike(state, side);
  if (strike) cands.push(strike);

  // ---- інше
  if (side === 'UA' && !state.belarus.active && state.belarus.tension > 68 && state.sides.UA.pp >= 30) {
    cands.push({ order: { type: 'fortifyNorth' }, score: 6 + (state.belarus.tension - 68) * 0.5 });
  }
  if (side === 'RU' && !state.belarus.active && state.belarus.tension < 70 && state.turn % 4 === 0 && state.ordersLeft >= 2) {
    cands.push({ order: { type: 'pressure' }, score: 3.5 });
  }
  for (const op of OPS) {
    if (op.side !== 'both' && op.side !== side) continue;
    if (opAvailability(state, side, op)) continue;
    if (state.sides[side].pp < op.cost + 25) continue;
    if (op.id === 'nuclear_blackmail' && state.sides.UA.support < 50) continue;
    const targets = validTargets(state, side, op);
    if (op.target === 'enemy-region' && !targets.length) continue;
    let target: string | undefined;
    if (op.target === 'enemy-region') {
      // найкорисніша ціль: де найбільше ворожих військ біля нашого фронту
      let bestT = targets[0];
      let bestV = -1;
      for (const t of targets) {
        const v = state.regions[t].troops * (isFront(state, t) ? 2 : 0.5);
        if (v > bestV) {
          bestV = v;
          bestT = t;
        }
      }
      target = bestT;
    }
    cands.push({ order: { type: 'startOp', op: op.id, target }, score: 9 });
  }
  // укріплення фронтових областей із дефіцитом
  if (state.sides[side].pp > 70) {
    const fr = own
      .filter((id) => isFront(state, id) && state.regions[id].fort < 2)
      .sort((a, b) => adjacentEnemyTroops(state, b) - adjacentEnemyTroops(state, a))[0];
    if (fr) cands.push({ order: { type: 'fortify', region: fr }, score: 3 });
  }

  cands.sort((a, b) => b.score - a.score);
  for (const c of cands) {
    if (c.score < 2) break;
    return c.order;
  }
  return { type: 'endTurn' };
}

/** Виконати весь хід ШІ (для симуляцій і тестів). */
export function aiPlayFullTurn(state: GameState, side: Side): void {
  let guard = 0;
  while (state.activeSide === side && !state.outcome && guard++ < 20) {
    const order = aiChooseOrder(state, side);
    const res = applyOrder(state, order);
    if (!res.ok) {
      // на випадок неузгодженості — завершити хід, щоб не зависнути
      applyOrder(state, { type: 'endTurn' });
      break;
    }
    if (order.type === 'endTurn') break;
  }
  if (state.activeSide === side && !state.outcome) applyOrder(state, { type: 'endTurn' });
}

