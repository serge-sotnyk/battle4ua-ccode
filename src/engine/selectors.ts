// Допоміжні вибірки над станом гри. Тут немає мутацій (крім кешу модифікаторів).

import { buildMap, type MapData } from './map/build';
import { REGION_DEFS } from './map/regions';
import { geoDistanceKm } from './map/geometry';
import { CFG } from './config';
import { computeMods } from './techs';
import type { FacilityDef, FacilityType, GameState, Mods, Owner, RegionDef, Side } from './types';

// ---------------------------------------------------------------- карта (синглтон)

let MAP: MapData | null = null;
export function getMap(): MapData {
  if (!MAP) MAP = buildMap();
  return MAP;
}

export const REGION_BY_ID: Record<string, RegionDef> = Object.fromEntries(REGION_DEFS.map((r) => [r.id, r]));
export const ALL_REGION_IDS: string[] = REGION_DEFS.map((r) => r.id);
export const FACILITY_BY_ID: Record<string, { region: string; def: FacilityDef }> = {};
for (const r of REGION_DEFS) for (const f of r.facilities) FACILITY_BY_ID[f.id] = { region: r.id, def: f };

export function neighborsOf(id: string): string[] {
  return getMap().neighbors[id] ?? [];
}

const EDGE_KIND_CACHE = new Map<string, 'land' | 'river' | 'bridge'>();
export function edgeKind(a: string, b: string): 'land' | 'river' | 'bridge' | null {
  if (EDGE_KIND_CACHE.size === 0) {
    for (const e of getMap().edges) {
      EDGE_KIND_CACHE.set(`${e.a}|${e.b}`, e.kind);
      EDGE_KIND_CACHE.set(`${e.b}|${e.a}`, e.kind);
    }
  }
  return EDGE_KIND_CACHE.get(`${a}|${b}`) ?? null;
}

export const other = (s: Side): Side => (s === 'UA' ? 'RU' : 'UA');

// ---------------------------------------------------------------- модифікатори (кеш)

const MODS_CACHE = new WeakMap<GameState, { UA: Mods | null; RU: Mods | null }>();
export function getMods(state: GameState, side: Side): Mods {
  let c = MODS_CACHE.get(state);
  if (!c) {
    c = { UA: null, RU: null };
    MODS_CACHE.set(state, c);
  }
  let m = c[side];
  if (!m) {
    m = computeMods(state, side);
    c[side] = m;
  }
  return m;
}
export function invalidateMods(state: GameState): void {
  MODS_CACHE.delete(state);
}

/** Накази на тиждень: технології + поблажка людині у «звичайному» режимі. */
export function ordersFor(state: GameState, side: Side): number {
  const human = state.config.controllers[side] === 'human' && state.config.controllers[other(side)] === 'ai';
  return getMods(state, side).orders + (human && state.config.difficulty === 'normal' ? CFG.humanBonusOrders : 0);
}

// ---------------------------------------------------------------- дата і сезон

const MONTHS_GEN = [
  'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
  'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня',
];

export function dateOfTurn(turn: number): Date {
  const d = new Date(CFG.startDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + turn * CFG.turnDays);
  return d;
}
export function formatDate(turn: number): string {
  const d = dateOfTurn(turn);
  return `${d.getUTCDate()} ${MONTHS_GEN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export function monthOf(turn: number): number {
  return dateOfTurn(turn).getUTCMonth();
}
export function seasonName(turn: number): string {
  return CFG.season.names[monthOf(turn)];
}
export function seasonAttackMod(turn: number): number {
  return CFG.season.attack[monthOf(turn)];
}
export function seasonEnergyMod(turn: number): number {
  return CFG.season.energyHit[monthOf(turn)];
}

// ---------------------------------------------------------------- належність і фронт

export function isEnemyOwner(owner: Owner, side: Side): boolean {
  return owner === other(side);
}

export function regionsOf(state: GameState, owner: Owner): string[] {
  return ALL_REGION_IDS.filter((id) => state.regions[id].owner === owner);
}

export function totalTroops(state: GameState, side: Side): number {
  let n = 0;
  for (const id of ALL_REGION_IDS) if (state.regions[id].owner === side) n += state.regions[id].troops;
  return n;
}

export function isFront(state: GameState, id: string): boolean {
  const owner = state.regions[id].owner;
  if (owner === 'BY') return false;
  const foe = other(owner as Side);
  for (const n of neighborsOf(id)) {
    if (state.regions[n].owner === foe) return true;
  }
  return false;
}

/** Сумарні сили ворога поруч з областю. */
export function adjacentEnemyTroops(state: GameState, id: string): number {
  const owner = state.regions[id].owner;
  if (owner === 'BY') return 0;
  const foe = other(owner as Side);
  let s = 0;
  for (const n of neighborsOf(id)) if (state.regions[n].owner === foe) s += state.regions[n].troops;
  return s;
}

/** Чи можна вести наземний бій у цій області за чинними правилами. */
export function groundWarAllowed(attacker: Side, targetId: string): boolean {
  const def = REGION_BY_ID[targetId];
  if (def.country === 'RU' && attacker === 'UA' && !def.belt) return false;
  return true;
}

/** Чи прохідне ребро (міст пошкоджено → ні). */
export function edgePassable(state: GameState, a: string, b: string): boolean {
  if (edgeKind(a, b) !== 'bridge') return true;
  const hp = state.regions.crimea.facilities['kerch_bridge'] ?? 100;
  return hp >= 25;
}

/** Області, куди з `from` можна перекинути війська (шлях через свої області, ≤ moveRange кроків). */
export function reachableFriendly(state: GameState, side: Side, from: string): string[] {
  const range = Math.max(1, Math.round(getMods(state, side).moveRange));
  const dist: Record<string, number> = { [from]: 0 };
  const queue = [from];
  const out: string[] = [];
  while (queue.length) {
    const cur = queue.shift()!;
    if (dist[cur] >= range) continue;
    for (const n of neighborsOf(cur)) {
      if (dist[n] !== undefined) continue;
      if (state.regions[n].owner !== side) continue;
      if (!edgePassable(state, cur, n)) continue;
      dist[n] = dist[cur] + 1;
      out.push(n);
      queue.push(n);
    }
  }
  return out;
}

/** Найкоротша довжина шляху через свої області (для ШІ), або Infinity. */
export function friendlyDistances(state: GameState, side: Side, from: string): Record<string, number> {
  const dist: Record<string, number> = { [from]: 0 };
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of neighborsOf(cur)) {
      if (dist[n] !== undefined) continue;
      if (state.regions[n].owner !== side) continue;
      if (!edgePassable(state, cur, n)) continue;
      dist[n] = dist[cur] + 1;
      queue.push(n);
    }
  }
  return dist;
}

// ---------------------------------------------------------------- об'єкти й економіка

export interface FacilityRef {
  region: string;
  def: FacilityDef;
  hp: number;
}

export function facilitiesOfType(state: GameState, owner: Owner, type: FacilityType): FacilityRef[] {
  const out: FacilityRef[] = [];
  for (const id of ALL_REGION_IDS) {
    const rs = state.regions[id];
    if (rs.owner !== owner) continue;
    for (const f of REGION_BY_ID[id].facilities) {
      if (f.type === type) out.push({ region: id, def: f, hp: rs.facilities[f.id] ?? 100 });
    }
  }
  return out;
}

export function meanFacilityHp(state: GameState, owner: Owner, type: FacilityType, fallback = 1): number {
  const list = facilitiesOfType(state, owner, type);
  if (list.length === 0) return fallback;
  return list.reduce((s, f) => s + f.hp, 0) / list.length / 100;
}

/** Сумарна «вага» електростанцій кожної сторони на старті (база для відсотка). */
const BASE_ENERGY_WEIGHT: Record<Side, number> = { UA: 0, RU: 0 };
for (const r of REGION_DEFS) {
  for (const f of r.facilities) {
    // ЗАЕС на старті окупована — не входить у базу України (це «бонус» за звільнення)
    if (f.type === 'power_plant' && f.id !== 'zaes') {
      const s: Side = r.country === 'UA' ? 'UA' : 'RU';
      BASE_ENERGY_WEIGHT[s] += f.weight ?? 10;
    }
  }
}
export function baseEnergyWeight(side: Side): number {
  return BASE_ENERGY_WEIGHT[side];
}

/** Відсоток справності енергосистеми: частка потужності власних станцій. */
export function energyPct(state: GameState, side: Side): number {
  let cur = 0;
  for (const p of facilitiesOfType(state, side, 'power_plant')) cur += ((p.def.weight ?? 10) * p.hp) / 100;
  const resist = getMods(state, side).energyResist;
  const base = BASE_ENERGY_WEIGHT[side] || 1;
  let frac = Math.min(1, cur / base);
  frac = 1 - (1 - frac) * (1 - Math.min(0.7, resist));
  // тимчасова кібератака
  const cyber = state.sides[side].effects.filter((e) => e.key === ('energyCyber' as string));
  for (const c of cyber) frac -= c.value;
  return Math.max(15, Math.min(100, Math.round(frac * 100)));
}

/** 0.8..1: виснаження місцевих складів для області (склади в ній і в сусідніх своїх областях). */
export function supplyFactor(state: GameState, regionId: string): number {
  const owner = state.regions[regionId].owner;
  let worst = 1;
  const check = (rid: string) => {
    if (state.regions[rid].owner !== owner) return;
    for (const f of REGION_BY_ID[rid].facilities) {
      if (f.type !== 'ammo_depot') continue;
      const hp = (state.regions[rid].facilities[f.id] ?? 100) / 100;
      worst = Math.min(worst, hp);
    }
  };
  check(regionId);
  for (const n of neighborsOf(regionId)) check(n);
  return 1 - 0.2 * (1 - worst);
}

export function oilFactor(state: GameState): number {
  const ref = meanFacilityHp(state, 'RU', 'refinery', 1);
  const ports = meanFacilityHp(state, 'RU', 'port', 1);
  const health = 0.6 * ref + 0.4 * ports;
  return CFG.economy.oilFloor + (1 - CFG.economy.oilFloor) * health;
}

export interface Income {
  domestic: number;
  external: number;
  total: number;
}

export function incomeBreakdown(state: GameState, side: Side): Income {
  const s = state.sides[side];
  const mods = getMods(state, side);
  let industry = 0;
  for (const id of ALL_REGION_IDS) if (state.regions[id].owner === side) industry += REGION_BY_ID[id].industry;
  const energy = energyPct(state, side) / 100;
  const domestic = industry * CFG.economy.ppPerIndustry * mods.ppMul * (0.55 + 0.45 * energy);
  let external = 0;
  if (side === 'UA') {
    external += s.support * CFG.economy.aidPerSupport * mods.aidMul;
    const port = meanFacilityHp(state, 'UA', 'port', 1);
    external += CFG.economy.seaEconBase * mods.seaEcon * 10 * port;
  } else {
    external += CFG.economy.oilBase * oilFactor(state) * (0.6 + 0.4 * (s.support / 100)) * mods.oilMul;
  }
  const dom = Math.max(0, domestic);
  const ext = Math.max(0, external);
  return { domestic: dom, external: ext, total: dom + ext };
}

export function incomePerTurn(state: GameState, side: Side): number {
  return incomeBreakdown(state, side).total;
}

export function distanceToNearestOwnKm(state: GameState, side: Side, regionId: string): number {
  const map = getMap();
  const t = map.regions[regionId].geo;
  let best = Infinity;
  for (const id of ALL_REGION_IDS) {
    if (state.regions[id].owner !== side || id === regionId) continue;
    if (state.regions[id].troops <= 0) continue;
    const d = geoDistanceKm(map.regions[id].geo, t);
    if (d < best) best = d;
  }
  return best;
}
