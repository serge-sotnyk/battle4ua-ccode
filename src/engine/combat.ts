// Бойова модель: «лінійний Ланчестер» з перевагою оборони, місцевістю, укріпленнями,
// технологіями, сезоном і станом тилу.

import { CFG } from './config';
import { jitter } from './rng';
import {
  REGION_BY_ID,
  edgeKind,
  getMods,
  meanFacilityHp,
  neighborsOf,
  other,
  seasonAttackMod,
  supplyFactor,
} from './selectors';
import type { BattleReport, GameState, Side } from './types';

export function moraleFactor(state: GameState, side: Side): number {
  return CFG.combat.moraleBase + (1 - CFG.combat.moraleBase) * (state.sides[side].resilience / 100);
}

/** Паливо: якщо НПЗ зруйновані, наступ слабшає (до −25%). */
export function fuelFactor(state: GameState, side: Side): number {
  const ref = meanFacilityHp(state, side, 'refinery', 1);
  return 0.75 + 0.25 * ref;
}

export function airFactor(state: GameState, side: Side): number {
  const m = getMods(state, side);
  const af = meanFacilityHp(state, side, 'airfield', 1);
  const strat = side === 'RU' ? 0.75 + 0.25 * state.sides.RU.stratAir : 1;
  return 1 + m.airSupport * af * strat;
}

export interface BattleMath {
  attackers: number;
  defenders: number;
  atkPow: number;
  defPow: number;
  ratio: number;
  terrain: number;
  killsDefenders: number;
  killsAttackers: number;
  captured: boolean;
}

function aiLossPenalty(state: GameState, side: Side): number {
  const c = state.config.controllers;
  if (c[side] === 'ai' && c[other(side)] === 'human') return CFG.difficulty[state.config.difficulty].aiLossMul;
  return 1;
}

export function battleMath(state: GameState, from: string, to: string, committed: number, noise: boolean): BattleMath {
  const src = state.regions[from];
  const dst = state.regions[to];
  const A = src.owner as Side;
  const D = dst.owner as Side;
  const mA = getMods(state, A);
  const mD = getMods(state, D);
  const terrain = CFG.terrainDef[REGION_BY_ID[to].terrain];
  const river = edgeKind(from, to) === 'river' ? CFG.combat.riverDefense : 1;
  const fort = 1 + CFG.combat.fortBonus * dst.fort;
  const atkPow =
    committed *
    mA.atk *
    moraleFactor(state, A) *
    seasonAttackMod(state.turn) *
    supplyFactor(state, from) *
    airFactor(state, A) *
    fuelFactor(state, A);
  const defPow = dst.troops * mD.def * moraleFactor(state, D) * terrain * fort * river * supplyFactor(state, to);
  const jA = noise ? jitter(state, CFG.combat.variance) : 1;
  const jD = noise ? jitter(state, CFG.combat.variance) : 1;
  let killsDefenders = atkPow * CFG.combat.attackKill * jA * mD.ownLoss * aiLossPenalty(state, D);
  let killsAttackers = defPow * CFG.combat.defenseKill * jD * mA.ownLoss * aiLossPenalty(state, A);
  killsDefenders = Math.min(dst.troops, killsDefenders);
  killsAttackers = Math.min(committed, killsAttackers);
  const aLeft = committed - killsAttackers;
  const dLeft = dst.troops - killsDefenders;
  const captured = aLeft > 0 && dLeft <= CFG.combat.collapse * aLeft;
  return {
    attackers: committed,
    defenders: dst.troops,
    atkPow,
    defPow,
    ratio: defPow > 0 ? atkPow / defPow : 99,
    terrain,
    killsDefenders,
    killsAttackers,
    captured,
  };
}

export function estimateBattle(state: GameState, from: string, to: string, committed: number): BattleMath {
  return battleMath(state, from, to, committed, false);
}

/** Куди відступають залишки оборонців. */
function retreatDestination(state: GameState, lostRegion: string, defender: Side, attackerFrom: string): string | null {
  let best: string | null = null;
  let bestTroops = -1;
  for (const n of neighborsOf(lostRegion)) {
    if (n === attackerFrom) continue;
    const r = state.regions[n];
    if (r.owner !== defender) continue;
    if (r.troops > bestTroops) {
      best = n;
      bestTroops = r.troops;
    }
  }
  return best;
}

/**
 * Виконати бій. Мутує стан. Повертає звіт. НЕ перевіряє правил наказів — це робить orders.ts.
 * Наслідки для стійкості/підтримки при захопленні застосовуються тут.
 */
export function resolveBattle(state: GameState, from: string, to: string, committed: number): BattleReport {
  const src = state.regions[from];
  const dst = state.regions[to];
  const A = src.owner as Side;
  const D = dst.owner as Side;
  const m = battleMath(state, from, to, committed, true);

  const killsD = Math.round(m.killsDefenders);
  const killsA = Math.round(m.killsAttackers);
  const aLeft = committed - killsA;
  const dLeft = dst.troops - killsD;

  state.sides[A].casualties += killsA;
  state.sides[A].weekCasualties += killsA;
  state.sides[D].casualties += killsD;
  state.sides[D].weekCasualties += killsD;
  state.sides[A].kills += killsD;
  state.sides[A].weekKills += killsD;
  state.sides[D].kills += killsA;
  state.sides[D].weekKills += killsA;

  const report: BattleReport = {
    from,
    to,
    attackers: committed,
    defenders: dst.troops,
    attackerLoss: killsA,
    defenderLoss: killsD,
    captured: false,
    retreated: 0,
    ratio: m.ratio,
  };

  if (m.captured && aLeft > 0) {
    const retreatTo = retreatDestination(state, to, D, from);
    let retreated = 0;
    if (retreatTo) {
      retreated = Math.floor(dLeft * CFG.combat.retreatKeep);
      state.regions[retreatTo].troops += retreated;
    }
    const extraDead = dLeft - retreated;
    state.sides[D].casualties += extraDead;
    state.sides[D].weekCasualties += extraDead;
    state.sides[A].kills += extraDead;
    state.sides[A].weekKills += extraDead;
    report.defenderLoss += extraDead;
    report.retreated = retreated;
    report.captured = true;

    src.troops -= committed;
    dst.owner = A;
    dst.troops = aLeft;
    dst.ad = 0;
    dst.fort = 0;
    dst.railCut = 0;
    dst.aaSabotage = 0;
  } else {
    src.troops -= killsA;
    dst.troops = dLeft;
  }
  return report;
}
