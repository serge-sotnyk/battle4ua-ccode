// SVG-карта: шари, масштабування/перетягування, підписи, значки об'єктів, ефекти.

import { getMap, REGION_BY_ID, ALL_REGION_IDS, FACILITY_BY_ID } from '../engine/selectors';
import type { Owner } from '../engine/types';
import { FAC_ICON, fmtK } from './format';
import type { FxEvent, GameStore } from './store';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface MapHandlers {
  onRegionClick(id: string): void;
  onHover(id: string | null, ev: PointerEvent | MouseEvent | null): void;
  onFacilityClick(region: string, facility: string): void;
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
}

export function regionFill(owner: Owner, troops: number): { fill: string; dark: boolean } {
  const t = Math.min(1, Math.max(0, Math.log(Math.max(troops, 600) / 600) / Math.log(45000 / 600)));
  if (owner === 'UA') {
    const l = 88 - 44 * t;
    return { fill: `hsl(232 100% ${l}%)`, dark: l > 62 };
  }
  if (owner === 'RU') {
    const l = 84 - 38 * t;
    return { fill: `hsl(5 76% ${l}%)`, dark: l > 58 };
  }
  const l = 68 - 12 * t;
  return { fill: `hsl(135 14% ${l}%)`, dark: true };
}

function hpColor(hp: number): string {
  if (hp <= 0) return '#555';
  if (hp > 66) return '#4fd38b';
  if (hp > 33) return '#ffb347';
  return '#ff5a4a';
}

export class MapView {
  readonly svg: SVGSVGElement;
  private store: GameStore;
  private handlers: MapHandlers;
  private W = 0;
  private H = 0;
  private vb = { x: 0, y: 0, w: 0, h: 0 };
  private paths: Record<string, SVGPathElement> = {};
  private labels: Record<string, { troops: SVGTextElement; name: SVGTextElement; badge: SVGTextElement }> = {};
  private facs: Record<string, SVGGElement> = {};
  private fxLayer!: SVGGElement;
  private hlLayer!: SVGGElement;
  private dragging = false;
  private dragMoved = false;
  private pts = new Map<number, { x: number; y: number }>();
  private pinch0 = 0;

  constructor(svg: SVGSVGElement, store: GameStore, handlers: MapHandlers) {
    this.svg = svg;
    this.store = store;
    this.handlers = handlers;
    this.build();
    this.bindInteractions();
    this.update();
  }

  // ---------------------------------------------------------------- побудова

  private build(): void {
    const map = getMap();
    this.W = map.width;
    this.H = map.height;
    this.vb = { x: 0, y: 0, w: this.W, h: this.H };
    const svg = this.svg;
    svg.innerHTML = '';
    this.applyViewBox();

    const defs = el('defs', {}, svg);
    const glow = el('filter', { id: 'glow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
    el('feGaussianBlur', { stdDeviation: 3 }, glow);

    el('path', { class: 'land', d: map.landPath, 'fill-rule': 'evenodd' }, svg);

    const gReg = el('g', { id: 'regions' }, svg);
    for (const id of map.order) {
      const r = map.regions[id];
      const p = el('path', { class: 'region', d: r.path, 'data-id': id }, gReg);
      this.paths[id] = p;
    }
    el('path', { class: 'river', d: map.dniproPath }, svg);
    for (const c of ['UA', 'BY', 'RU'] as const) {
      el('path', { d: map.countryPaths[c], fill: 'none', stroke: '#ffffffcc', 'stroke-width': 1.6, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }, svg);
    }
    el('path', { d: map.crimeaPath, fill: 'none', stroke: '#ffffffcc', 'stroke-width': 1.6, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }, svg);

    this.hlLayer = el('g', { id: 'hl', 'pointer-events': 'none' }, svg);
    const gLbl = el('g', { id: 'labels' }, svg);
    for (const id of map.order) {
      const r = map.regions[id];
      const g = el('g', { transform: `translate(${r.label[0].toFixed(1)},${r.label[1].toFixed(1)})` }, gLbl);
      const troops = el('text', { class: 'lbl dark', y: 4 }, g);
      const name = el('text', { class: 'lbl-name', y: 14 }, g);
      name.textContent = shortName(REGION_BY_ID[id].name);
      const badge = el('text', { class: 'badge', y: 24, fill: '#fff' }, g);
      this.labels[id] = { troops, name, badge };
    }

    const gFac = el('g', { id: 'facilities' }, svg);
    for (const id of map.order) {
      const def = REGION_BY_ID[id];
      const r = map.regions[id];
      const n = def.facilities.length;
      def.facilities.forEach((f, i) => {
        const x = r.label[0] + (i - (n - 1) / 2) * 17;
        const y = r.label[1] + 27;
        const g = el('g', { class: 'fac', transform: `translate(${x.toFixed(1)},${y.toFixed(1)})`, 'data-region': id, 'data-fac': f.id }, gFac);
        el('rect', { x: -8, y: -8, width: 16, height: 16, fill: '#0b101c', stroke: '#4fd38b' }, g);
        const t = el('text', {}, g);
        t.textContent = FAC_ICON[f.type];
        const title = el('title', {}, g);
        title.textContent = f.name;
        this.facs[f.id] = g;
        g.addEventListener('click', (ev) => {
          if (this.store.mode !== 'strike') return;
          ev.stopPropagation();
          this.handlers.onFacilityClick(id, f.id);
        });
      });
    }
    this.fxLayer = el('g', { id: 'fx' }, svg);
    this.updateZoomClasses();
  }

  // ---------------------------------------------------------------- масштаб

  private zoomFactor(): number {
    return this.W / this.vb.w;
  }

  private applyViewBox(): void {
    const v = this.vb;
    this.svg.setAttribute('viewBox', `${v.x.toFixed(1)} ${v.y.toFixed(1)} ${v.w.toFixed(1)} ${v.h.toFixed(1)}`);
  }

  private clampView(): void {
    const v = this.vb;
    v.x = Math.min(Math.max(v.x, -40), this.W - v.w + 40);
    v.y = Math.min(Math.max(v.y, -40), this.H - v.h + 40);
  }

  private updateZoomClasses(): void {
    const z = this.zoomFactor();
    this.svg.classList.toggle('zoom2', z >= 1.55 && z < 2.7);
    this.svg.classList.toggle('zoom3', z >= 2.7);
    this.svg.style.setProperty('--fs', `${(13.5 / Math.pow(z, 0.62)).toFixed(2)}px`);
    this.svg.classList.toggle('show-fac', this.store.settings.showFacilities || z >= 2.0);
  }

  zoomBy(f: number, cx?: number, cy?: number): void {
    const v = this.vb;
    const nz = Math.min(8, Math.max(1, this.zoomFactor() * f));
    const nw = this.W / nz;
    const nh = this.H / nz;
    const fx = cx === undefined ? 0.5 : (cx - v.x) / v.w;
    const fy = cy === undefined ? 0.5 : (cy - v.y) / v.h;
    const px = v.x + v.w * fx;
    const py = v.y + v.h * fy;
    v.w = nw;
    v.h = nh;
    v.x = px - nw * fx;
    v.y = py - nh * fy;
    this.clampView();
    this.applyViewBox();
    this.updateZoomClasses();
  }

  resetView(): void {
    this.vb = { x: 0, y: 0, w: this.W, h: this.H };
    this.applyViewBox();
    this.updateZoomClasses();
  }

  /** Плавно навести камеру на область. */
  focus(id: string, zoom = 2.4): void {
    const r = getMap().regions[id];
    const w = this.W / zoom;
    const h = this.H / zoom;
    this.vb = { x: r.label[0] - w / 2, y: r.label[1] - h / 2, w, h };
    this.clampView();
    this.applyViewBox();
    this.updateZoomClasses();
  }

  private toSvgPoint(clientX: number, clientY: number): { x: number; y: number } {
    const pt = this.svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const m = this.svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = pt.matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  // ---------------------------------------------------------------- взаємодія

  private bindInteractions(): void {
    const svg = this.svg;
    svg.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const p = this.toSvgPoint(e.clientX, e.clientY);
        this.zoomBy(Math.exp(-e.deltaY * 0.0016), p.x, p.y);
      },
      { passive: false },
    );
    let startX = 0;
    let startY = 0;
    svg.addEventListener('pointerdown', (e) => {
      svg.setPointerCapture(e.pointerId);
      this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      startX = e.clientX;
      startY = e.clientY;
      this.dragMoved = false;
      this.dragging = true;
      if (this.pts.size === 2) {
        const [a, b] = [...this.pts.values()];
        this.pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    svg.addEventListener('pointermove', (e) => {
      const prev = this.pts.get(e.pointerId);
      if (this.dragging && prev) {
        if (this.pts.size === 1) {
          if (Math.hypot(e.clientX - startX, e.clientY - startY) > 5) this.dragMoved = true;
          if (this.dragMoved) {
            const m = this.svg.getScreenCTM();
            if (m) {
              this.vb.x -= (e.clientX - prev.x) / m.a;
              this.vb.y -= (e.clientY - prev.y) / m.d;
              this.clampView();
              this.applyViewBox();
              this.svg.classList.add('dragging');
            }
          }
        } else if (this.pts.size === 2) {
          this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const [a, b] = [...this.pts.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (this.pinch0 > 0) {
            const c = this.toSvgPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
            this.zoomBy(d / this.pinch0, c.x, c.y);
          }
          this.pinch0 = d;
          this.dragMoved = true;
          return;
        }
        this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        return;
      }
      // наведення
      const target = (e.target as Element).closest?.('.region') as SVGPathElement | null;
      this.handlers.onHover(target ? target.dataset.id ?? null : null, e);
    });
    const end = (e: PointerEvent) => {
      const moved = this.dragMoved;
      const wasDrag = this.dragging;
      this.pts.delete(e.pointerId);
      if (this.pts.size === 0) {
        this.dragging = false;
        this.svg.classList.remove('dragging');
      }
      if (wasDrag && !moved && e.type === 'pointerup') {
        const t = document.elementFromPoint(e.clientX, e.clientY);
        const reg = t && ((t as Element).closest?.('.region') as SVGPathElement | null);
        this.handlers.onRegionClick(reg && reg.dataset.id ? reg.dataset.id : '');
      }
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('pointerleave', () => this.handlers.onHover(null, null));
    svg.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.handlers.onRegionClick('');
    });
  }

  // ---------------------------------------------------------------- оновлення стану

  update(): void {
    const s = this.store.state;
    if (!s) return;
    const sel = this.store.selected;
    const strike = this.store.mode === 'strike';
    const moveT = new Set<string>();
    const atkT = new Set<string>();
    if (sel && this.store.isHumanTurn()) {
      for (const id of this.store.reachableFrom(sel)) moveT.add(id);
      for (const id of this.store.attackTargetsFrom(sel)) atkT.add(id);
    }
    const human = this.store.isHumanTurn();
    const side = s.activeSide;
    for (const id of ALL_REGION_IDS) {
      const r = s.regions[id];
      const path = this.paths[id];
      const { fill, dark } = regionFill(r.owner, r.troops);
      path.style.fill = fill;
      path.classList.toggle('selected', sel === id);
      path.classList.toggle('inactive', r.owner === 'BY');
      const dim = strike && r.owner === side;
      path.classList.toggle('dim', dim);
      const lbl = this.labels[id];
      lbl.troops.textContent = fmtK(r.troops);
      lbl.troops.setAttribute('class', `lbl ${dark || sel === id ? 'dark' : 'light'}`);
      const badges: string[] = [];
      if (r.ad > 0) badges.push(`🛡${r.ad}`);
      if (r.fort > 0) badges.push(`⛏${r.fort}`);
      if (r.railCut > 0) badges.push('🚧');
      lbl.badge.textContent = badges.join(' ');
    }
    // підсвітка цілей окремим шаром, щоб її не перекривали сусідні заливки
    this.hlLayer.innerHTML = '';
    const map = getMap();
    for (const id of moveT) el('path', { d: map.regions[id].path, class: 'hl-move' }, this.hlLayer);
    for (const id of atkT) el('path', { d: map.regions[id].path, class: 'hl-attack' }, this.hlLayer);
    if (sel) el('path', { d: map.regions[sel].path, class: 'hl-sel' }, this.hlLayer);
    for (const fid of Object.keys(this.facs)) {
      const info = FACILITY_BY_ID[fid];
      const r = s.regions[info.region];
      const hp = r.facilities[fid] ?? 100;
      const g = this.facs[fid];
      const rect = g.querySelector('rect')!;
      rect.setAttribute('stroke', hpColor(hp));
      g.style.opacity = hp <= 0 ? '.45' : '1';
      const enemyOfActive = strike && human && r.owner !== side && r.owner !== 'BY' && hp > 0;
      g.classList.toggle('clickable', enemyOfActive);
      const title = g.querySelector('title');
      if (title) title.textContent = `${info.def.name} — ${Math.round(hp)}%`;
    }
    this.svg.classList.toggle('show-fac', this.store.settings.showFacilities || strike || this.zoomFactor() >= 2.0);
    const btn = document.getElementById('btn-fac');
    btn?.classList.toggle('on', this.store.settings.showFacilities);
  }

  // ---------------------------------------------------------------- ефекти

  fx(e: FxEvent): void {
    const map = getMap();
    if (e.kind === 'battle') {
      const a = map.regions[e.from].label;
      const b = map.regions[e.to].label;
      const color = e.side === 'UA' ? '#6f8cff' : '#ff6e5e';
      this.arrow(a, b, color, 700, 3.5);
      this.pulse(b, e.captured ? '#ffe14a' : color, e.captured ? 46 : 30, 800);
      this.floatText(b, `−${fmtK(e.defenderLoss)}`, '#ff8a7a', 0);
      this.floatText(a, `−${fmtK(e.attackerLoss)}`, '#9fb0ff', 14);
    } else if (e.kind === 'move') {
      const a = map.regions[e.from].label;
      const b = map.regions[e.to].label;
      this.arrow(a, b, e.side === 'UA' ? '#8ea6ff' : '#ff9a8a', 650, 2.2, true);
    } else if (e.kind === 'strike') {
      const a = map.regions[e.origin].label;
      const b = map.regions[e.target].label;
      this.missile(a, b, e.side === 'UA' ? '#ffd24a' : '#ff7a4a', e.hits);
    } else if (e.kind === 'pulse') {
      this.pulse(map.regions[e.region].label, e.color, 30, 800);
    }
  }

  private arrow(a: [number, number], b: [number, number], color: string, dur: number, w: number, dashed = false): void {
    const line = el('line', { class: 'fx-line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: color, 'stroke-width': w, 'vector-effect': 'non-scaling-stroke' }, this.fxLayer);
    if (dashed) line.setAttribute('stroke-dasharray', '6 5');
    const anim = line.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur, easing: 'ease-in' });
    anim.onfinish = () => line.remove();
  }

  private pulse(p: [number, number], color: string, r: number, dur: number): void {
    const c = el('circle', { class: 'fx-pulse', cx: p[0], cy: p[1], r: 4, fill: color, 'fill-opacity': 0.35, stroke: color, 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }, this.fxLayer);
    const anim = c.animate([{ r: 4, opacity: 1 }, { r, opacity: 0 }], { duration: dur, easing: 'ease-out' });
    anim.onfinish = () => c.remove();
  }

  private floatText(p: [number, number], text: string, color: string, dy: number): void {
    const t = el('text', { x: p[0], y: p[1] - 6 + dy, fill: color, 'font-weight': 800, 'text-anchor': 'middle', 'font-size': 'var(--fs)', stroke: '#000', 'stroke-width': 2.5, 'paint-order': 'stroke', 'pointer-events': 'none' }, this.fxLayer);
    t.textContent = text;
    const anim = t.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-18px)', opacity: 0 }], { duration: 1300, easing: 'ease-out' });
    anim.onfinish = () => t.remove();
  }

  private missile(a: [number, number], b: [number, number], color: string, hits: number): void {
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2 - Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.22;
    const path = el('path', { class: 'fx-line', d: `M${a[0]},${a[1]} Q${mx},${my} ${b[0]},${b[1]}`, stroke: color, 'stroke-width': 2.4, 'stroke-dasharray': '7 6', 'vector-effect': 'non-scaling-stroke' }, this.fxLayer);
    const anim = path.animate([{ opacity: 0.2 }, { opacity: 1 }, { opacity: 0 }], { duration: 1100 });
    anim.onfinish = () => {
      path.remove();
      this.pulse(b, '#ffb347', 40, 900);
      this.pulse(b, '#ff5a4a', 22, 650);
      this.floatText(b, `💥 ${hits}`, '#ffe0a0', 0);
    };
  }
}

function shortName(n: string): string {
  return n
    .replace(' (правий берег)', ' (пр.)')
    .replace(' (лівий берег)', ' (лів.)')
    .replace('Донеччина (Краматорськ)', 'Донеччина-пн')
    .replace('Донеччина (Маріуполь)', 'Донеччина-пд')
    .replace('Новгородщина–Псковщина', 'Новгород–Псков')
    .replace(' і область', '');
}
