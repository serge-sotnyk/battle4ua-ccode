// Детермінований генератор (mulberry32). Стан зберігається в GameState.rng,
// тож партії відтворювані, а «скасувати хід» не дає перекидати кубики.

import type { GameState } from './types';

export function nextRandom(state: GameState): number {
  state.rng = (state.rng + 0x6d2b79f5) | 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Число в [1-spread, 1+spread]. */
export function jitter(state: GameState, spread: number): number {
  return 1 + (nextRandom(state) * 2 - 1) * spread;
}

export function chance(state: GameState, p: number): boolean {
  return nextRandom(state) < p;
}

export function pickOne<T>(state: GameState, arr: readonly T[]): T {
  return arr[Math.floor(nextRandom(state) * arr.length)];
}

export function randInt(state: GameState, lo: number, hi: number): number {
  return lo + Math.floor(nextRandom(state) * (hi - lo + 1));
}
