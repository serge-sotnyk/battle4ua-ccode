// Далекобійні удари: дрони й ракети проти об'єктів у глибокому тилу ворога.

import { CFG } from './config';
import { pushLog, pushTicker } from './log';
import { jitter } from './rng';
import {
  FACILITY_BY_ID,
  REGION_BY_ID,
  distanceToNearestOwnKm,
  getMods,
  other,
  seasonEnergyMod,
} from './selectors';
import type { GameState, Side, StrikeReport, StrikeTarget } from './types';

export function strikeRanges(state: GameState, side: Side): { drone: number; missile: number } {
  const m = getMods(state, side);
  return { drone: CFG.strike.rangeDrone * m.rangeMul, missile: CFG.strike.rangeMissile * m.rangeMul };
}

export interface StrikeForecast {
  survDrone: number;
  survMissile: number;
  adLevel: number;
  inRangeDrone: boolean;
  inRangeMissile: boolean;
  distanceKm: number;
  expectedDamage: number;
}

export function targetRegionId(t: StrikeTarget): string {
  return t.region;
}

export function forecastStrike(state: GameState, side: Side, target: StrikeTarget, drones: number, missiles: number): StrikeForecast {
  const region = state.regions[target.region];
  const foe = other(side);
  const mA = getMods(state, side);
  const mD = getMods(state, foe);
  const level = Math.max(0, region.ad - (region.aaSabotage > 0 ? 1 : 0));
  const survDrone = Math.min(1, Math.max(CFG.strike.minSurvDrone, 1 - CFG.strike.adKillDrone * level * mD.adDrone + mA.penDrone));
  const survMissile = Math.min(1, Math.max(CFG.strike.minSurvMissile, 1 - CFG.strike.adKillMissile * level * mD.adMissile + mA.penMissile));
  const dist = distanceToNearestOwnKm(state, side, target.region);
  const ranges = strikeRanges(state, side);
  let dmg = 0;
  if (target.kind === 'facility') {
    const fdef = FACILITY_BY_ID[target.facility].def;
    const tough = CFG.strike.toughness[fdef.type];
    const sea = fdef.type === 'port' || fdef.type === 'bridge' ? mA.seaStrike : 1;
    dmg = ((drones * survDrone * CFG.strike.dmgDrone + missiles * survMissile * CFG.strike.dmgMissile) * mA.strikeDamage * sea) / tough;
  }
  return {
    survDrone,
    survMissile,
    adLevel: level,
    inRangeDrone: dist <= ranges.drone,
    inRangeMissile: dist <= ranges.missile,
    distanceKm: dist,
    expectedDamage: dmg,
  };
}

export function validateStrike(
  state: GameState,
  side: Side,
  target: StrikeTarget,
  drones: number,
  missiles: number,
): string | null {
  const foe = other(side);
  const sd = state.sides[side];
  if (!Number.isInteger(drones) || !Number.isInteger(missiles)) return 'Невірна кількість.';
  if (drones < 0 || missiles < 0 || drones + missiles <= 0) return 'Оберіть кількість дронів чи ракет.';
  if (drones > sd.drones) return 'Недостатньо дронів у запасі.';
  if (missiles > sd.missiles) return 'Недостатньо ракет у запасі.';
  const region = state.regions[target.region];
  if (!region || region.owner !== foe) return 'Ціль має належати супротивнику.';
  if (target.kind === 'facility') {
    const f = FACILITY_BY_ID[target.facility];
    if (!f || f.region !== target.region) return 'Невідомий об’єкт.';
    if ((region.facilities[target.facility] ?? 100) <= 0) return 'Об’єкт уже знищений.';
  } else {
    if (side !== 'RU') return 'Цей тип цілей недоступний.';
  }
  const f = forecastStrike(state, side, target, drones, missiles);
  if (drones > 0 && !f.inRangeDrone) return 'Ціль поза дальністю дронів.';
  if (missiles > 0 && !f.inRangeMissile) return 'Ціль поза дальністю ракет.';
  return null;
}

export function performStrike(state: GameState, side: Side, target: StrikeTarget, drones: number, missiles: number): StrikeReport {
  const foe = other(side);
  const fc = forecastStrike(state, side, target, drones, missiles);
  const mA = getMods(state, side);
  const hitsD = drones * fc.survDrone * jitter(state, 0.08);
  const hitsM = missiles * fc.survMissile * jitter(state, 0.08);
  state.sides[side].drones -= drones;
  state.sides[side].missiles -= missiles;
  const region = state.regions[target.region];
  const rdef = REGION_BY_ID[target.region];
  const report: StrikeReport = {
    target,
    region: target.region,
    drones,
    missiles,
    dronesHit: Math.round(hitsD),
    missilesHit: Math.round(hitsM),
    damage: 0,
  };
  const launched = `${drones ? drones + ' дронів' : ''}${drones && missiles ? ' і ' : ''}${missiles ? missiles + ' ракет' : ''}`;
  if (target.kind === 'facility') {
    const fdef = FACILITY_BY_ID[target.facility].def;
    const tough = CFG.strike.toughness[fdef.type];
    const sea = fdef.type === 'port' || fdef.type === 'bridge' ? mA.seaStrike : 1;
    const dmg = ((hitsD * CFG.strike.dmgDrone + hitsM * CFG.strike.dmgMissile) * mA.strikeDamage * sea) / tough;
    const before = region.facilities[target.facility] ?? 100;
    const after = Math.max(0, before - dmg);
    region.facilities[target.facility] = after;
    report.damage = before - after;
    report.facilityHp = after;
    pushLog(state, {
      side,
      kind: 'strike',
      region: target.region,
      text: `Удар (${launched}) по об’єкту «${fdef.name}» (${rdef.name}): збито ${Math.round(drones + missiles - hitsD - hitsM)}, влучань ${Math.round(hitsD + hitsM)}. Справність: ${Math.round(before)}% → ${Math.round(after)}%.`,
    });
    if (after <= 0) pushTicker(state, `«${fdef.name}» більше не працює. Місцева влада пояснює це «технічним оглядом».`);
  } else {
    // удар по містах (лише РФ): шкода стійкості України, але росте підтримка партнерів
    const hits = hitsD + hitsM * 3;
    const resHit = Math.min(CFG.strike.cityResCap, hits * CFG.strike.cityResPerHit) * seasonEnergyMod(state);
    const supHit = Math.min(CFG.strike.citySupportCap, hits * CFG.strike.citySupportPerHit);
    state.sides[foe].resilience = Math.max(0, state.sides[foe].resilience - resHit);
    state.sides[foe].support = Math.min(100, state.sides[foe].support + supHit);
    report.damage = resHit;
    pushLog(state, {
      side,
      kind: 'strike',
      region: target.region,
      text: `Удар (${launched}) по містах (${rdef.name}): стійкість ${foe === 'UA' ? 'України' : 'ворога'} −${resHit.toFixed(1)}, підтримка партнерів +${supHit.toFixed(1)}.`,
    });
  }
  return report;
}
