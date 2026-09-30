import { CFG } from './config';
import { ALL_REGION_IDS, REGION_BY_ID } from './selectors';
import type { GameState, GameOutcome } from './types';

export function evaluateOutcome(state: GameState): GameOutcome | null {
  if (state.outcome) return state.outcome;
  const ua = state.sides.UA;
  const ru = state.sides.RU;
  if (ru.resilience <= 0) {
    return { winner: 'UA', reason: 'Стійкість Росії вичерпана: режим змушений сісти за стіл переговорів на умовах України.' };
  }
  if (ua.resilience <= 0) {
    return { winner: 'RU', reason: 'Стійкість України вичерпана: держава більше не може вести війну.' };
  }
  if (state.regions.kyiv.owner === 'RU') {
    return { winner: 'RU', reason: 'Падіння Києва: столицю захоплено.' };
  }
  let liberated = true;
  for (const id of ALL_REGION_IDS) {
    if (REGION_BY_ID[id].country === 'UA' && state.regions[id].owner !== 'UA') {
      liberated = false;
      break;
    }
  }
  if (liberated) {
    return { winner: 'UA', reason: 'Повне звільнення: усі області України, включно з Кримом, під контролем ЗСУ.' };
  }
  if (state.turn >= CFG.maxTurns) {
    const t = territoryScore(state);
    const line = `Україна контролює ${t.uaHeld} з ${t.uaTotal} своїх областей${t.ruRegions ? ` і ${t.ruRegions} ворожих` : ''}.`;
    if (t.uaHeld >= CFG.victory.uaWinAtTimeout) {
      return { winner: 'UA', reason: `Перемир’я на умовах України: фронт майже повністю звільнено. ${line}` };
    }
    if (t.uaHeld <= CFG.victory.ruWinAtTimeout) {
      return { winner: 'RU', reason: `Перемир’я на умовах РФ: значна частина України втрачена. ${line}` };
    }
    return { winner: 'draw', reason: `Час вичерпано: перемир’я по лінії зіткнення. ${line}` };
  }
  return null;
}

/** Підрахунок очок для фінального екрана: частка території України, яку тримає УА. */
export function territoryScore(state: GameState): { uaHeld: number; uaTotal: number; ruHeldInUa: number; ruRegions: number } {
  let uaHeld = 0;
  let uaTotal = 0;
  let ruHeldInUa = 0;
  let ruRegions = 0;
  for (const id of ALL_REGION_IDS) {
    const def = REGION_BY_ID[id];
    if (def.country === 'UA') {
      uaTotal++;
      if (state.regions[id].owner === 'UA') uaHeld++;
      else ruHeldInUa++;
    }
    if (def.country !== 'UA' && state.regions[id].owner === 'UA') ruRegions++;
  }
  return { uaHeld, uaTotal, ruHeldInUa, ruRegions };
}
