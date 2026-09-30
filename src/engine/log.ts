import type { GameState, LogEntry } from './types';

const MAX_LOG = 600;

export function pushLog(state: GameState, entry: Omit<LogEntry, 'turn'>): void {
  const seq = (state.flags.logSeq = (state.flags.logSeq ?? 0) + 1);
  state.log.push({ turn: state.turn, seq, ...entry });
  if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG);
}

export function pushTicker(state: GameState, line: string): void {
  state.ticker.push(line);
  if (state.ticker.length > 40) state.ticker.shift();
}

export const fmt = (n: number): string => Math.round(n).toLocaleString('uk-UA').replace(/ /g, ' ');
export const fmt1 = (n: number): string => n.toFixed(1).replace('.', ',');
