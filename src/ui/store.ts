// Стан застосунку: обгортка над рушієм. Тримає вибір гравця, скасування наказів,
// автозбереження та цикл ходів ШІ з паузами для анімацій.

import { aiChooseOrder } from '../engine/ai';
import { applyOrder, attackError } from '../engine/orders';
import { createGame, GAME_VERSION } from '../engine/scenario';
import { estimateBattle } from '../engine/combat';
import { CFG } from '../engine/config';
import { REGION_BY_ID, other, reachableFriendly, distanceToNearestOwnKm, ALL_REGION_IDS, getMods } from '../engine/selectors';
import type { GameConfig, GameState, LogEntry, Order, OrderResult, Side } from '../engine/types';

const SAVE_KEY = 'b4ua.save.v1';
const SETTINGS_KEY = 'b4ua.settings.v1';

export type FxEvent =
  | { kind: 'battle'; from: string; to: string; captured: boolean; side: Side; attackerLoss: number; defenderLoss: number }
  | { kind: 'move'; from: string; to: string; side: Side; n: number }
  | { kind: 'strike'; side: Side; origin: string; target: string; hits: number; launched: number }
  | { kind: 'pulse'; region: string; color: string };

export type Mode = 'normal' | 'strike';
export type AiSpeed = 'slow' | 'normal' | 'fast' | 'instant';

export interface Settings {
  aiSpeed: AiSpeed;
  showFacilities: boolean;
  classicHalf: boolean;
  fraction: number;
  lastConfig: Partial<GameConfig> & { humanSide?: Side | 'both' | 'none' };
  tipsDismissed: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  aiSpeed: 'normal',
  showFacilities: false,
  classicHalf: false,
  fraction: 0.5,
  lastConfig: { difficulty: 'normal', humanSide: 'UA' },
  tipsDismissed: false,
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class GameStore {
  state!: GameState;
  settings: Settings = loadSettings();

  selected: string | null = null;
  inspect: string | null = null;
  hover: string | null = null;
  mode: Mode = 'normal';
  viewSide: Side = 'UA';
  paused = false;
  busy = false;
  curtain: Side | null = null; // hot-seat: очікуємо передачі керування
  /** Ім'я сторони, що ходила останньою — для підсвітки ходу ШІ. */
  lastAiOrder: Order | null = null;
  /** Підсумок дій ворога за минулий тиждень (показується на початку ходу людини). */
  recap: LogEntry[] | null = null;
  private recapSeq = 0;

  private listeners = new Set<() => void>();
  private fxListeners = new Set<(e: FxEvent) => void>();
  private undoStack: string[] = [];
  private aiToken = 0;

  get hasGame(): boolean {
    return !!this.state;
  }

  // ---------------------------------------------------------------- підписки

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  onFx(fn: (e: FxEvent) => void): () => void {
    this.fxListeners.add(fn);
    return () => this.fxListeners.delete(fn);
  }
  notify(): void {
    for (const l of this.listeners) l();
  }
  fx(e: FxEvent): void {
    for (const l of this.fxListeners) l(e);
  }

  // ---------------------------------------------------------------- життєвий цикл

  newGame(cfg: Partial<GameConfig> & { humanSide?: Side | 'both' | 'none' }): void {
    const humanSide = cfg.humanSide ?? 'UA';
    const controllers: Record<Side, 'human' | 'ai'> = {
      UA: humanSide === 'UA' || humanSide === 'both' ? 'human' : 'ai',
      RU: humanSide === 'RU' || humanSide === 'both' ? 'human' : 'ai',
    };
    this.aiToken++;
    this.state = createGame({
      seed: cfg.seed ?? Math.floor(Math.random() * 1e9),
      difficulty: cfg.difficulty ?? 'normal',
      scenario: cfg.scenario ?? 'oct-2026',
      controllers,
    });
    this.recapSeq = (this.state.flags.logSeq ?? 0) + 1;
    this.recap = null;
    this.settings.lastConfig = { difficulty: this.state.config.difficulty, scenario: this.state.config.scenario, humanSide };
    this.saveSettings();
    this.viewSide = humanSide === 'RU' ? 'RU' : 'UA';
    this.resetInteraction();
    this.undoStack = [];
    this.paused = false;
    this.curtain = null;
    this.save();
    this.notify();
    void this.maybeRunAi();
  }

  loadSaved(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw) as { version: number; state: GameState };
      if (data.version !== GAME_VERSION || !data.state) return false;
      this.state = data.state;
      const c = this.state.config.controllers;
      const active = this.state.activeSide;
      // у «двох гравцях» показуємо сторону, яка зараз ходить
      this.viewSide = c[active] === 'human' ? active : c.UA === 'human' ? 'UA' : c.RU === 'human' ? 'RU' : 'UA';
      this.recapSeq = (this.state.flags.logSeq ?? 0) + 1;
      this.recap = null;
      this.resetInteraction();
      this.undoStack = [];
      this.notify();
      void this.maybeRunAi();
      return true;
    } catch {
      return false;
    }
  }

  hasSave(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw) as { version?: number };
      return data.version === GAME_VERSION;
    } catch {
      return false;
    }
  }

  save(): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ version: GAME_VERSION, state: this.state }));
    } catch {
      /* сховище може бути недоступне — не критично */
    }
  }

  saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* ignore */
    }
  }

  resetInteraction(): void {
    this.selected = null;
    this.inspect = null;
    this.hover = null;
    this.mode = 'normal';
  }

  // ---------------------------------------------------------------- запити

  get activeSide(): Side {
    return this.state.activeSide;
  }
  isHumanTurn(): boolean {
    return !this.state.outcome && this.state.config.controllers[this.state.activeSide] === 'human' && !this.busy && !this.curtain;
  }
  isSpectator(): boolean {
    const c = this.state.config.controllers;
    return c.UA === 'ai' && c.RU === 'ai';
  }
  isHotSeat(): boolean {
    const c = this.state.config.controllers;
    return c.UA === 'human' && c.RU === 'human';
  }

  currentFraction(): number {
    return this.settings.classicHalf ? 0.5 : this.settings.fraction;
  }

  reachableFrom(id: string): string[] {
    if (!this.isHumanTurn()) return [];
    const r = this.state.regions[id];
    if (!r || r.owner !== this.state.activeSide) return [];
    return reachableFriendly(this.state, this.state.activeSide, id);
  }

  attackTargetsFrom(id: string): string[] {
    if (!this.isHumanTurn()) return [];
    const side = this.state.activeSide;
    const r = this.state.regions[id];
    if (!r || r.owner !== side) return [];
    return ALL_REGION_IDS.filter((t) => !attackError(this.state, side, id, t));
  }

  // ---------------------------------------------------------------- дії гравця

  dispatch(order: Order, quiet = false): OrderResult {
    if (!this.isHumanTurn()) return { ok: false, error: 'Зараз не ваш хід.' };
    return this.execute(order, quiet);
  }

  private execute(order: Order, quiet: boolean): OrderResult {
    const side = this.state.activeSide;
    const snapshot = order.type === 'endTurn' ? null : JSON.stringify(this.state);
    const before = this.state;
    const seqBefore = this.state.flags.logSeq ?? 0;
    const res = applyOrder(this.state, order);
    if (!res.ok) {
      if (!quiet) this.toast(res.error ?? 'Неможливо виконати наказ.', 'error');
      return res;
    }
    if (this.recap && order.type !== 'endTurn') this.recap = null;
    if (order.type === 'attack' && res.battle && !quiet) {
      const b = res.battle;
      const n = (x: number) => Math.round(x).toLocaleString('uk-UA').replace(/\u00a0/g, ' ');
      this.toast(
        b.captured
          ? `Область взято! Втрати: ви −${n(b.attackerLoss)}, ворог −${n(b.defenderLoss)}.`
          : `Втрати: ворог −${n(b.defenderLoss)}, ви −${n(b.attackerLoss)}. Співвідношення сил ${b.ratio.toFixed(2)}.`,
        'info',
      );
    }
    if (snapshot && before === this.state) {
      this.undoStack.push(snapshot);
      if (this.undoStack.length > 40) this.undoStack.shift();
    }
    this.emitFx(side, order, res);
    this.save();
    if (order.type === 'endTurn') {
      this.undoStack = [];
      this.selected = null;
      this.mode = 'normal';
      this.recapSeq = seqBefore + 1;
      this.recap = null;
      void this.afterEndTurn();
    }
    this.notify();
    return res;
  }

  undo(): void {
    if (!this.isHumanTurn() || !this.undoStack.length) return;
    const snap = this.undoStack.pop()!;
    this.state = JSON.parse(snap) as GameState;
    this.selected = null;
    this.save();
    this.notify();
  }
  canUndo(): boolean {
    return this.isHumanTurn() && this.undoStack.length > 0;
  }

  private async afterEndTurn(): Promise<void> {
    if (this.state.outcome) {
      this.notify();
      return;
    }
    if (this.isHotSeat()) {
      this.curtain = this.state.activeSide;
      this.viewSide = this.state.activeSide;
    }
    await this.maybeRunAi();
  }

  confirmCurtain(): void {
    this.curtain = null;
    this.viewSide = this.state.activeSide;
    this.notify();
  }

  // ---------------------------------------------------------------- ШІ

  setPaused(p: boolean): void {
    this.paused = p;
    this.notify();
    if (!p) void this.maybeRunAi();
  }

  private speedMs(): number {
    switch (this.settings.aiSpeed) {
      case 'slow':
        return 1100;
      case 'normal':
        return 520;
      case 'fast':
        return 160;
      default:
        return 0;
    }
  }

  async maybeRunAi(): Promise<void> {
    if (!this.state) return;
    // кожен новий запуск скасовує попередній цикл (той завершується на перевірці токена)
    const token = ++this.aiToken;
    this.busy = false;
    try {
      while (token === this.aiToken && !this.state.outcome) {
        const side = this.state.activeSide;
        if (this.state.config.controllers[side] !== 'ai') break;
        if (this.paused) {
          await sleep(250);
          continue;
        }
        this.busy = true;
        this.notify();
        const order = aiChooseOrder(this.state, side);
        const ms = this.speedMs();
        if (ms) await sleep(ms);
        if (token !== this.aiToken) break;
        const res = applyOrder(this.state, order);
        if (!res.ok) applyOrder(this.state, { type: 'endTurn' });
        this.lastAiOrder = order;
        if (res.ok) this.emitFx(side, order, res);
        if (order.type === 'endTurn' || !res.ok || this.state.outcome) {
          this.save();
          if (this.isHotSeat()) break;
        }
        this.notify();
        if (!ms && order.type !== 'endTurn') await sleep(0);
        if (!ms && order.type === 'endTurn') await sleep(0);
      }
    } finally {
      if (token === this.aiToken) {
        this.busy = false;
        this.buildRecap();
        this.notify();
      }
    }
  }

  private buildRecap(): void {
    if (!this.state || this.state.outcome) return;
    const me = this.state.activeSide;
    if (this.state.config.controllers[me] !== 'human') return;
    const keep = new Set(['capture', 'strike', 'tech', 'event', 'op', 'attack', 'loss']);
    const entries = visibleLog(this.state, me).filter((e) => (e.seq ?? 0) >= this.recapSeq && e.side !== me && e.kind && keep.has(e.kind));
    this.recap = entries.length ? entries : null;
  }

  dismissRecap(): void {
    this.recap = null;
    this.notify();
  }

  // ---------------------------------------------------------------- ефекти

  private emitFx(side: Side, order: Order, res: OrderResult): void {
    if (order.type === 'move') {
      this.fx({ kind: 'move', from: order.from, to: order.to, side, n: res.moved ?? 0 });
    } else if (order.type === 'attack' && res.battle) {
      this.fx({
        kind: 'battle',
        from: order.from,
        to: order.to,
        captured: res.battle.captured,
        side,
        attackerLoss: res.battle.attackerLoss,
        defenderLoss: res.battle.defenderLoss,
      });
    } else if (order.type === 'strike' && res.strike) {
      const target = res.strike.region;
      // «Початок» польоту — найближча своя область
      let origin = target;
      let best = Infinity;
      for (const id of ALL_REGION_IDS) {
        if (this.state.regions[id].owner !== side) continue;
        const d = distToGeo(id, target);
        if (d < best) {
          best = d;
          origin = id;
        }
      }
      this.fx({ kind: 'strike', side, origin, target, hits: res.strike.dronesHit + res.strike.missilesHit, launched: res.strike.drones + res.strike.missiles });
    }
  }

  // ---------------------------------------------------------------- повідомлення

  private toastListeners = new Set<(msg: string, kind: 'error' | 'info') => void>();
  onToast(fn: (msg: string, kind: 'error' | 'info') => void): void {
    this.toastListeners.add(fn);
  }
  toast(msg: string, kind: 'error' | 'info' = 'info'): void {
    for (const l of this.toastListeners) l(msg, kind);
  }

  // ---------------------------------------------------------------- прогноз для підказок

  forecast(from: string, to: string): ReturnType<typeof estimateBattle> | null {
    if (!this.state) return null;
    const side = this.state.activeSide;
    if (attackError(this.state, side, from, to)) return null;
    const src = this.state.regions[from];
    const n = Math.min(src.troops - CFG.minGarrison, Math.max(1, Math.floor(src.troops * this.currentFraction())));
    if (n < 1) return null;
    return estimateBattle(this.state, from, to, n);
  }

  distanceKm(side: Side, region: string): number {
    return distanceToNearestOwnKm(this.state, side, region);
  }

  foe(): Side {
    return other(this.state.activeSide);
  }
}

/** Журнал, яким може скористатися сторона `me`: початок ворожих досліджень/операцій прихований без розвідки. */
export function visibleLog(state: GameState, me: Side): LogEntry[] {
  const foe = other(me);
  const intel = getMods(state, me).intel;
  return state.log.filter((e) => {
    if (e.side !== foe) return true;
    if (e.kind === 'tech' && e.text.startsWith('Розпочато') && intel < 1) return false;
    if (e.kind === 'op' && e.text.startsWith('Розпочато') && intel < 2) return false;
    return true;
  });
}

function distToGeo(a: string, b: string): number {
  const A = REGION_BY_ID[a].seed;
  const B = REGION_BY_ID[b].seed;
  return Math.hypot(A[0] - B[0], A[1] - B[1]);
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS };
}
