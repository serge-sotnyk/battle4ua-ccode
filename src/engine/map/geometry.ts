// Мінімальна 2D-геометрія для генерації схематичної карти.
// Усе тут чисте й детероване: однакові входи дають однакові полігони.

export type Pt = [number, number];
export type Ring = Pt[];

/** Межі кадру карти в градусах. Координати в (довгота, широта). */
export const FRAME = { lon0: 14, lon1: 50, lat0: 41, lat1: 61.5 };
/** Ширина карти в одиницях SVG-viewBox. */
export const VIEW_WIDTH = 1200;

const D2R = Math.PI / 180;
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * D2R) / 2));

const X0 = FRAME.lon0 * D2R;
const SCALE = VIEW_WIDTH / ((FRAME.lon1 - FRAME.lon0) * D2R);
const Y0 = mercY(FRAME.lat1);

/** (lon, lat) → координати viewBox. Меркатор, початок у лівому верхньому куті кадру. */
export function project(lon: number, lat: number): Pt {
  return [(lon * D2R - X0) * SCALE, (Y0 - mercY(lat)) * SCALE];
}

export const VIEW_HEIGHT = project(FRAME.lon0, FRAME.lat0)[1];

export function projectRing(ring: Array<[number, number]>): Ring {
  return ring.map(([lon, lat]) => project(lon, lat));
}

/** Відстань між двома точками (lon,lat) у км (гаверсинус). */
export function geoDistanceKm(a: Pt, b: Pt): number {
  const R = 6371;
  const dLat = (b[1] - a[1]) * D2R;
  const dLon = (b[0] - a[0]) * D2R;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * D2R) * Math.cos(b[1] * D2R) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Обрізати багатокутник піввизначенням a*x + b*y <= c (Сазерленд–Ходжман). */
export function clipHalfPlane(poly: Ring, a: number, b: number, c: number): Ring {
  const out: Ring = [];
  const n = poly.length;
  if (n === 0) return out;
  for (let i = 0; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    const fp = a * p[0] + b * p[1] - c;
    const fq = a * q[0] + b * q[1] - c;
    const pIn = fp <= 0;
    const qIn = fq <= 0;
    if (pIn) out.push(p);
    if (pIn !== qIn) {
      const t = fp / (fp - fq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

export interface Seed {
  pos: Pt;
  weight: number;
}

/**
 * Комірка «зваженої діаграми Вороного» (power diagram) для насіння `i`,
 * обрізана контуром `outline`. Повертає можливо порожній полігон.
 */
export function powerCell(outline: Ring, seeds: Seed[], i: number): Ring {
  let poly = outline;
  const si = seeds[i];
  for (let j = 0; j < seeds.length; j++) {
    if (j === i) continue;
    const sj = seeds[j];
    const a = 2 * (sj.pos[0] - si.pos[0]);
    const b = 2 * (sj.pos[1] - si.pos[1]);
    const c =
      sj.pos[0] ** 2 + sj.pos[1] ** 2 - (si.pos[0] ** 2 + si.pos[1] ** 2) - (sj.weight - si.weight);
    poly = clipHalfPlane(poly, a, b, c);
    if (poly.length < 3) return [];
  }
  return poly;
}

export function ringArea(ring: Ring): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    s += p[0] * q[1] - q[0] * p[1];
  }
  return s / 2;
}

export function ringCentroid(ring: Ring): Pt {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    const cr = p[0] * q[1] - q[0] * p[1];
    a += cr;
    cx += (p[0] + q[0]) * cr;
    cy += (p[1] + q[1]) * cr;
  }
  if (Math.abs(a) < 1e-9) return ring[0] ?? [0, 0];
  return [cx / (3 * a), cy / (3 * a)];
}

export function pointInRing(pt: Pt, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function bbox(ring: Ring): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of ring) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

/** Додати проміжні точки на ребрах довших за `step`. */
export function densify(ring: Ring, step: number): Ring {
  const out: Ring = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    out.push(p);
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const k = Math.floor(d / step);
    for (let m = 1; m <= k; m++) {
      const t = m / (k + 1);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/**
 * Гладке детерміноване «розхитування» координат. Воно залежить лише від позиції точки,
 * тож спільні межі сусідніх областей лишаються спільними, а кордони виглядають природніше.
 */
export function warp([x, y]: Pt): Pt {
  const dx =
    2.1 * Math.sin(0.045 * y + 0.031 * x) +
    1.2 * Math.sin(0.11 * y - 0.07 * x + 1.3) +
    0.6 * Math.sin(0.27 * x + 0.21 * y);
  const dy =
    2.1 * Math.sin(0.04 * x - 0.033 * y + 0.7) +
    1.2 * Math.sin(0.09 * x + 0.12 * y + 2.1) +
    0.6 * Math.sin(0.23 * y - 0.29 * x + 4.0);
  return [x + dx, y + dy];
}

export function smoothWarp(ring: Ring, step = 5): Ring {
  return densify(ring, step).map(warp);
}

export function ringToPath(ring: Ring): string {
  if (ring.length === 0) return '';
  let d = `M${ring[0][0].toFixed(1)},${ring[0][1].toFixed(1)}`;
  for (let i = 1; i < ring.length; i++) d += `L${ring[i][0].toFixed(1)},${ring[i][1].toFixed(1)}`;
  return d + 'Z';
}

/** Відстань від точки до відрізка. */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
}

/**
 * Сумарна довжина ребер кільця A, що лежать (в межах eps) на межі кільця B.
 * Використовується для автоматичного визначення сусідства областей.
 */
export function sharedBoundaryLength(a: Ring, b: Ring, eps = 0.05): number {
  let total = 0;
  const nb = b.length;
  const onB = (p: Pt) => {
    for (let k = 0; k < nb; k++) {
      if (distToSegment(p, b[k], b[(k + 1) % nb]) <= eps) return true;
    }
    return false;
  };
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    const q = a[(i + 1) % a.length];
    const mid: Pt = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    if (onB(p) && onB(q) && onB(mid)) total += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  return total;
}
