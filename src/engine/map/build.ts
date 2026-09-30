// Побудова геометрії карти: полігони областей (діаграма Вороного, обрізана контурами країн),
// сусідство (з геометрії), допоміжні шари (суходіл, річка).

import {
  FRAME,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  bbox,
  pointInRing,
  powerCell,
  project,
  projectRing,
  ringArea,
  ringCentroid,
  ringToPath,
  sharedBoundaryLength,
  smoothWarp,
  warp,
  type Pt,
  type Ring,
  type Seed,
} from './geometry';
import {
  BELARUS_RING,
  BLACK_SEA_HOLE,
  CRIMEA,
  DNIPRO,
  NEUTRAL_OUTER,
  RUSSIA_RING,
  UKRAINE_RING,
} from './outlines';
import { BLOCKED_EDGES, EXTRA_EDGES, REGION_DEFS, RIVER_EDGES } from './regions';
import type { Country, RegionDef } from '../types';

export interface MapRegion {
  id: string;
  country: Country;
  /** SVG path (після розхитування). */
  path: string;
  ring: Ring;
  /** Точка для підпису. */
  label: Pt;
  /** Ґеографічне насіння в координатах viewBox (для відстаней). */
  seed: Pt;
  /** Географічні координати (lon,lat) — для дальності ударів. */
  geo: [number, number];
  area: number;
}

export interface MapEdge {
  a: string;
  b: string;
  kind: 'land' | 'river' | 'bridge';
}

export interface MapData {
  width: number;
  height: number;
  regions: Record<string, MapRegion>;
  /** Впорядкований список id (стабільний порядок). */
  order: string[];
  neighbors: Record<string, string[]>;
  edges: MapEdge[];
  landPath: string;
  seaHolePath: string;
  countryPaths: Record<Country, string>;
  crimeaPath: string;
  dniproPath: string;
}

const MIN_SHARED = 3; // мін. спільна межа у одиницях viewBox, щоб вважати області сусідами

export function buildMap(): MapData {
  const outlines: Record<Country, Ring> = {
    UA: projectRing(UKRAINE_RING),
    BY: projectRing(BELARUS_RING),
    RU: projectRing(RUSSIA_RING),
  };
  const crimeaRing = projectRing(CRIMEA);

  const rawRings: Record<string, Ring> = {};
  const defsById: Record<string, RegionDef> = {};
  for (const d of REGION_DEFS) defsById[d.id] = d;

  for (const country of ['UA', 'BY', 'RU'] as Country[]) {
    const defs = REGION_DEFS.filter((d) => d.country === country && !d.ownPolygon);
    const seeds: Seed[] = defs.map((d) => ({ pos: project(d.seed[0], d.seed[1]), weight: d.weight ?? 0 }));
    defs.forEach((d, i) => {
      rawRings[d.id] = powerCell(outlines[country], seeds, i);
    });
  }
  for (const d of REGION_DEFS) {
    if (d.ownPolygon === 'crimea') rawRings[d.id] = crimeaRing;
  }

  // --- сусідство з «сирої» (нерозхитаної) геометрії
  const ids = REGION_DEFS.map((d) => d.id);
  const boxes: Record<string, [number, number, number, number]> = {};
  for (const id of ids) boxes[id] = bbox(rawRings[id]);
  const adj = new Set<string>();
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const A = ids[i];
      const B = ids[j];
      const ba = boxes[A];
      const bb = boxes[B];
      if (ba[2] < bb[0] - 0.5 || bb[2] < ba[0] - 0.5 || ba[3] < bb[1] - 0.5 || bb[3] < ba[1] - 0.5) continue;
      const len = Math.max(
        sharedBoundaryLength(rawRings[A], rawRings[B]),
        sharedBoundaryLength(rawRings[B], rawRings[A]),
      );
      if (len >= MIN_SHARED) adj.add(key(A, B));
    }
  }
  for (const [a, b] of BLOCKED_EDGES) adj.delete(key(a, b));
  const edges: MapEdge[] = [];
  const riverKeys = new Set(RIVER_EDGES.map(([a, b]) => key(a, b)));
  for (const k of adj) {
    const [a, b] = k.split('|');
    edges.push({ a, b, kind: riverKeys.has(k) ? 'river' : 'land' });
  }
  for (const [a, b, extra] of EXTRA_EDGES) {
    if (!adj.has(key(a, b))) edges.push({ a, b, kind: extra.kind });
  }
  const neighbors: Record<string, string[]> = {};
  for (const id of ids) neighbors[id] = [];
  for (const e of edges) {
    neighbors[e.a].push(e.b);
    neighbors[e.b].push(e.a);
  }
  for (const id of ids) neighbors[id].sort();

  // --- розхитування + підписи
  const regions: Record<string, MapRegion> = {};
  for (const d of REGION_DEFS) {
    const warped = smoothWarp(rawRings[d.id]);
    const seedView = warp(project(d.seed[0], d.seed[1]));
    let label = ringCentroid(warped);
    if (!pointInRing(label, warped)) label = seedView;
    regions[d.id] = {
      id: d.id,
      country: d.country,
      path: ringToPath(warped),
      ring: warped,
      label,
      seed: seedView,
      geo: d.seed,
      area: Math.abs(ringArea(warped)),
    };
  }

  const landOuter = smoothWarp(projectRing(NEUTRAL_OUTER), 8);
  const hole = smoothWarp(projectRing(BLACK_SEA_HOLE), 8);
  const dnipro = smoothWarp(projectRing(DNIPRO), 4);
  const dniproPath = 'M' + dnipro.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L');

  return {
    width: VIEW_WIDTH,
    height: VIEW_HEIGHT,
    regions,
    order: ids,
    neighbors,
    edges,
    landPath: ringToPath(landOuter) + ringToPath(hole),
    seaHolePath: ringToPath(hole),
    countryPaths: {
      UA: ringToPath(smoothWarp(outlines.UA)),
      BY: ringToPath(smoothWarp(outlines.BY)),
      RU: ringToPath(smoothWarp(outlines.RU)),
    },
    crimeaPath: ringToPath(smoothWarp(crimeaRing)),
    dniproPath,
  };
}

export { FRAME };
