// Кінець ходу сторони та щотижневе «оновлення світу».

import { CFG } from './config';
import { rollEvents } from './events';
import { pushLog, pushTicker } from './log';
import { nextRandom } from './rng';
import { progressOps } from './ops';
import {
  ALL_REGION_IDS,
  REGION_BY_ID,
  energyPct,
  getMods,
  incomeBreakdown,
  invalidateMods,
  isFront,
  meanFacilityHp,
  oilFactor,
  ordersFor,
  seasonEnergyMod,
} from './selectors';
import { TECH_BY_ID } from './techs';
import { evaluateOutcome } from './victory';
import type { GameState, Side } from './types';

const SIDES: Side[] = ['UA', 'RU'];

export function endSideTurn(state: GameState): void {
  if (state.outcome) return;
  if (state.activeSide === 'UA') {
    state.activeSide = 'RU';
    state.ordersLeft = ordersFor(state, 'RU');
    return;
  }
  upkeep(state);
  state.turn += 1;
  state.activeSide = 'UA';
  state.ordersLeft = ordersFor(state, 'UA');
  const outcome = evaluateOutcome(state);
  if (outcome) {
    state.outcome = outcome;
    pushLog(state, { side: 'world', kind: 'info', text: `Кінець гри: ${outcome.reason}` });
  }
}

/** Щотижневий розрахунок: виробництво, дослідження, підкріплення, ремонт, події, стійкість. */
export function upkeep(state: GameState): void {
  // 1. Виробництво й боєзапас
  for (const side of SIDES) produce(state, side);
  // 2. Дослідження
  for (const side of SIDES) progressResearch(state, side);
  // 3. Спецоперації
  progressOps(state);
  // 4. Ремонт, таймери
  repairAndTimers(state);
  // 5. Підкріплення
  for (const side of SIDES) recruit(state, side);
  // 6. Білорусь
  progressBelarus(state);
  // 7. Події
  rollEvents(state);
  // 8. Стійкість та підтримка
  for (const side of SIDES) updateMorale(state, side);
  // 9. Тижнева статистика скидається
  for (const side of SIDES) {
    state.sides[side].weekCasualties = 0;
    state.sides[side].weekKills = 0;
  }
  pushLog(state, {
    side: 'world',
    kind: 'info',
    text: `Тиждень завершено. Виробництво: УА ${state.sides.UA.lastIncome.toFixed(1)}, РФ ${state.sides.RU.lastIncome.toFixed(1)}.`,
  });
}

function produce(state: GameState, side: Side): void {
  const s = state.sides[side];
  const mods = getMods(state, side);
  const inc = incomeBreakdown(state, side);
  let income = inc.total;
  income += (s.weekKills / 1000) * mods.killBonus * CFG.economy.killBonusPerThousand;
  s.lastIncome = income;
  s.pp += income;
  s.energy = energyPct(state, side);

  const factory = 0.4 + 0.6 * meanFacilityHp(state, side, 'drone_factory', 1);
  // дрони
  if (s.allocDrones > 0) {
    const budget = Math.min(s.pp, (income * s.allocDrones) / 100);
    const unit = (CFG.munitions.droneCost * mods.droneCost) / Math.max(0.2, mods.droneYield);
    let n = Math.floor((budget / unit) * factory);
    n = Math.max(0, Math.min(n, CFG.munitions.droneStockCap - s.drones));
    s.drones += n;
    s.pp -= (n / factory) * unit;
  }
  if (s.allocMissiles > 0) {
    const budget = Math.min(s.pp, (income * s.allocMissiles) / 100);
    const strat = side === 'RU' ? 0.45 + 0.55 * s.stratAir : 1;
    const unit = CFG.munitions.missileCost * Math.max(0.3, mods.missileCost);
    let n = Math.floor((budget / unit) * factory * strat);
    n = Math.max(0, Math.min(n, CFG.munitions.missileStockCap - s.missiles));
    s.missiles += n;
    s.pp -= (n / (factory * strat)) * unit;
  }
  if (s.pp < 0) s.pp = 0;
}

function progressResearch(state: GameState, side: Side): void {
  const s = state.sides[side];
  const mods = getMods(state, side);
  const keep: typeof s.research = [];
  for (const job of s.research) {
    job.turnsLeft -= mods.researchSpeed >= 1.5 ? 2 : 1;
    if (job.turnsLeft <= 0) {
      s.techs.push(job.tech);
      invalidateMods(state);
      const t = TECH_BY_ID[job.tech];
      pushLog(state, { side, kind: 'tech', text: `Завершено дослідження: ${t.name}.` });
    } else {
      keep.push(job);
    }
  }
  s.research = keep;
}

function repairAndTimers(state: GameState): void {
  for (const side of SIDES) {
    const s = state.sides[side];
    const repair = getMods(state, side).repair;
    for (const id of ALL_REGION_IDS) {
      const r = state.regions[id];
      if (r.owner !== side) continue;
      for (const f of REGION_BY_ID[id].facilities) {
        const hp = r.facilities[f.id] ?? 100;
        if (hp < 100) {
          const rate = f.type === 'bridge' ? CFG.repair.bridge : CFG.repair.perTurn;
          r.facilities[f.id] = Math.min(100, hp + rate * repair);
        }
      }
    }
    if (side === 'RU') s.stratAir = Math.min(1, s.stratAir + 0.03);
    // тимчасові ефекти
    const kept = s.effects.filter((e) => {
      e.turnsLeft -= 1;
      return e.turnsLeft > 0;
    });
    if (kept.length !== s.effects.length) invalidateMods(state);
    s.effects = kept;
  }
  for (const id of ALL_REGION_IDS) {
    const r = state.regions[id];
    if (r.railCut > 0) r.railCut -= 1;
    if (r.aaSabotage > 0) r.aaSabotage -= 1;
  }
}

/** Скільки бійців сторона отримає за тиждень (без випадкового розкиду). */
export function recruitAmount(state: GameState, side: Side, noise = 1): number {
  const s = state.sides[side];
  const mods = getMods(state, side);
  const res = s.resilience / 100;
  const regions = ALL_REGION_IDS.filter((id) => state.regions[id].owner === side);
  if (!regions.length) return 0;
  const armyNow = regions.reduce((a, id) => a + state.regions[id].troops, 0);
  const capFactor = Math.min(1, Math.max(0.12, 1.6 * (1 - armyNow / CFG.recruit.softCap[side])));
  let total = capFactor * CFG.recruit[side] * mods.recruit * CFG.recruit.mobilizationMul[s.mobilization] * (0.85 + 0.15 * res) * noise;
  if (side === 'UA') {
    // людські ресурси України пропорційні залишку її населення
    const popAll = ALL_REGION_IDS.filter((id) => REGION_BY_ID[id].country === 'UA').reduce((a, id) => a + REGION_BY_ID[id].pop, 0);
    const popNow = regions.reduce((a, id) => a + (REGION_BY_ID[id].country === 'UA' ? REGION_BY_ID[id].pop : 0), 0);
    total *= 0.5 + 0.5 * (popNow / popAll);
  }
  return total;
}

function recruit(state: GameState, side: Side): void {
  const regions = ALL_REGION_IDS.filter((id) => state.regions[id].owner === side);
  if (!regions.length) return;
  const total = recruitAmount(state, side, 0.95 + nextRandom(state) * 0.1);
  const weights = regions.map((id) => REGION_BY_ID[id].pop * (isFront(state, id) ? CFG.recruit.frontWeight : 1));
  const wsum = weights.reduce((a, b) => a + b, 0);
  let given = 0;
  regions.forEach((id, i) => {
    const n = Math.floor((total * weights[i]) / wsum);
    state.regions[id].troops += n;
    given += n;
  });
  // залишок — у найбільшу область за вагою
  let bi = 0;
  weights.forEach((w, i) => {
    if (w > weights[bi]) bi = i;
  });
  state.regions[regions[bi]].troops += Math.round(total - given);
}

const BELARUS_SURGE: Array<[string, number]> = [
  ['homel', 0.4],
  ['brest', 0.22],
  ['mogilev', 0.14],
  ['minsk', 0.24],
];

export function activateBelarus(state: GameState): void {
  state.belarus.active = true;
  state.belarus.tension = 100;
  for (const id of ALL_REGION_IDS) {
    if (REGION_BY_ID[id].country === 'BY') state.regions[id].owner = 'RU';
  }
  for (const [id, share] of BELARUS_SURGE) state.regions[id].troops += Math.round(CFG.belarus.surge * share);
  pushLog(state, { side: 'world', kind: 'event', text: 'Кремль ввів війська з Білорусі! З півночі загроза Києву, Чернігову та Волині.' });
  pushTicker(state, 'УВАГА: російські війська вступили з території Білорусі. Мінськ називає це «гостинністю».');
}

function progressBelarus(state: GameState): void {
  if (state.belarus.active) return;
  state.belarus.tension += CFG.belarus.perTurn * (0.75 + nextRandom(state) * 0.5);
  if (state.belarus.tension >= CFG.belarus.activationAt) activateBelarus(state);
}

function updateMorale(state: GameState, side: Side): void {
  const s = state.sides[side];
  const R = CFG.resilience;
  let d = 0;
  if (s.resilience < 100) d += R.regen;
  d -= (s.weekCasualties / 1000) * R.perKiloCasualty;
  d += (s.weekKills / 1000) * R.perKiloKill;
  d -= ((100 - s.energy) / 100) * R.energyDrain * seasonEnergyMod(state.turn);
  d -= CFG.recruit.mobilizationResDrain[s.mobilization];
  if (side === 'RU') d -= (1 - oilFactor(state)) * R.oilDrain;
  if (side === 'UA' && s.support < 30) d -= 0.4;
  s.resilience = Math.max(0, Math.min(100, s.resilience + d));
  // підтримка дрейфує до середнього рівня
  const target = side === 'UA' ? CFG.support.driftTarget : 70;
  s.support += (target - s.support) * CFG.support.driftRate;
  s.support = Math.max(0, Math.min(100, s.support));
}
