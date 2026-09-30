import './ui/style.css';
import { forecastStrike } from './engine/strikes';
import { aiChooseOrder } from './engine/ai';
import { REGION_BY_ID, other } from './engine/selectors';
import { MapView } from './ui/map';
import {
  Modals,
  curtainModal,
  gameOverModal,
  newGameModal,
  opsModal,
  policyModal,
  rulesModal,
  strikeModal,
  techModal,
  type StrikeArgs,
} from './ui/modals';
import { renderActionBar, renderSide, renderTicker, renderTopbar, tooltipHtml } from './ui/panels';
import { GameStore, type AiSpeed } from './ui/store';
import type { Side } from './engine/types';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const store = new GameStore();
const modals = new Modals($('modal-root'));

let mapView: MapView | null = null;
let strikeArgs: StrikeArgs | null = null;
let opsPick: { op: string; target?: string } | undefined;
let ngSide: Side | 'both' | 'none' = 'UA';
let ngDiff: 'easy' | 'normal' | 'hard' = 'normal';
let ngScen = 'oct-2026';
let shownOutcome = false;
let lastTicker = '';
let endConfirmUntil = 0;

/** Завершення ходу: якщо лишилися невикористані накази — просимо підтвердити повторним натисканням. */
function requestEndTurn(): void {
  if (!store.isHumanTurn()) return;
  const left = store.state.ordersLeft;
  const now = Date.now();
  if (left > 0 && now > endConfirmUntil) {
    endConfirmUntil = now + 3500;
    store.toast(`Лишилось невикористаних наказів: ${left}. Натисніть ще раз, щоб завершити хід.`, 'info');
    return;
  }
  endConfirmUntil = 0;
  store.dispatch({ type: 'endTurn' });
}
let rafPending = false;

// ---------------------------------------------------------------- відмальовування

function scheduleRender(): void {
  if (rafPending) return;
  rafPending = true;
  // setTimeout замість rAF: оновлення не «засинають», коли вкладка у фоні
  setTimeout(() => {
    rafPending = false;
    renderAll();
  }, 0);
}

function renderAll(): void {
  if (!store.state) return;
  $('topbar').innerHTML = renderTopbar(store);
  const side = $('side');
  const scroll = side.scrollTop;
  side.innerHTML = renderSide(store);
  side.scrollTop = scroll;
  $('actionbar').innerHTML = renderActionBar(store);
  const t = renderTicker(store);
  if (t !== lastTicker) {
    $('ticker-inner').innerHTML = t;
    lastTicker = t;
  }
  mapView?.update();
  // відкриті вікна, що залежать від стану
  const id = modals.openId;
  if (id === 'tech' || id === 'policy') modals.refresh();
  if (store.curtain && id !== 'curtain') {
    modals.open('curtain', () => curtainModal(store), { closable: false, wide: 'narrow' });
  }
  if (store.state.outcome && !shownOutcome) {
    shownOutcome = true;
    modals.open('gameover', () => gameOverModal(store), { closable: true, wide: 'mid' });
  }
}

store.subscribe(scheduleRender);
store.onToast((msg, kind) => toast(msg, kind));

function toast(msg: string, kind: 'error' | 'info' = 'info'): void {
  const t = document.createElement('div');
  t.className = `toast ${kind === 'info' ? 'info' : ''}`;
  t.textContent = msg;
  $('toast-root').appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// ---------------------------------------------------------------- карта: взаємодія

function ensureMap(): void {
  if (mapView) return;
  mapView = new MapView($('map') as unknown as SVGSVGElement, store, {
    onRegionClick: handleRegionClick,
    onHover: handleHover,
    onFacilityClick: (region, fac) => openStrike(region, fac),
  });
  store.onFx((e) => mapView?.fx(e));
}

function handleRegionClick(id: string): void {
  if (!store.state) return;
  if (!id) {
    store.selected = null;
    store.mode = 'normal';
    scheduleRender();
    return;
  }
  const s = store.state;
  const side = s.activeSide;
  const r = s.regions[id];
  store.inspect = id;
  if (!store.isHumanTurn()) {
    scheduleRender();
    return;
  }
  if (store.mode === 'strike') {
    // у режимі ударів область лише інспектується
    scheduleRender();
    return;
  }
  const src = store.selected;
  if (src && src !== id) {
    if (r.owner === side) {
      if (store.reachableFrom(src).includes(id)) {
        store.dispatch({ type: 'move', from: src, to: id, fraction: store.currentFraction() });
        afterOrderSelection(src);
        return;
      }
      store.selected = id;
    } else if (r.owner === other(side)) {
      const res = store.dispatch({ type: 'attack', from: src, to: id, fraction: store.currentFraction() });
      if (res.ok) afterOrderSelection(src);
      return;
    } else {
      store.toast('Білорусь поки нейтральна: її територія недоступна.', 'info');
    }
  } else if (r.owner === side && r.troops > 0) {
    store.selected = src === id ? null : id;
  }
  scheduleRender();
}

/** Після виконаного наказу: якщо в джерела ще є війська — лишаємо його вибраним (швидкі серії). */
function afterOrderSelection(src: string): void {
  const s = store.state;
  if (s.regions[src].owner === s.activeSide && s.regions[src].troops > 60 && s.ordersLeft > 0) store.selected = src;
  else store.selected = null;
  scheduleRender();
}

function handleHover(id: string | null, ev: MouseEvent | null): void {
  store.hover = id;
  const tip = $('maptip');
  if (!id || !ev || !store.state) {
    tip.hidden = true;
    return;
  }
  tip.innerHTML = tooltipHtml(store, id);
  tip.hidden = false;
  const wrap = $('mapwrap').getBoundingClientRect();
  let x = ev.clientX - wrap.left + 16;
  let y = ev.clientY - wrap.top + 16;
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  if (x + tw > wrap.width - 8) x = ev.clientX - wrap.left - tw - 16;
  if (y + th > wrap.height - 40) y = ev.clientY - wrap.top - th - 16;
  tip.style.left = `${Math.max(4, x)}px`;
  tip.style.top = `${Math.max(4, y)}px`;
}

// ---------------------------------------------------------------- удари

function openStrike(region: string, facility?: string): void {
  if (!store.isHumanTurn()) return;
  const s = store.state;
  const side = s.activeSide;
  const sd = s.sides[side];
  const target = facility ? ({ kind: 'facility', region, facility } as const) : ({ kind: 'city', region } as const);
  const fc = forecastStrike(s, side, target, 1, 0);
  strikeArgs = {
    region,
    facility,
    drones: fc.inRangeDrone ? Math.min(sd.drones, 40) : 0,
    missiles: fc.inRangeMissile ? Math.min(sd.missiles, 4) : 0,
  };
  modals.open('strike', () => strikeModal(store, strikeArgs!), { wide: 'mid' });
}

function updateStrikeLive(): void {
  if (!strikeArgs) return;
  const a = strikeArgs;
  const s = store.state;
  const target = a.facility ? ({ kind: 'facility', region: a.region, facility: a.facility } as const) : ({ kind: 'city', region: a.region } as const);
  const fc = forecastStrike(s, s.activeSide, target, a.drones, a.missiles);
  const hp = a.facility ? Math.round(s.regions[a.region].facilities[a.facility] ?? 100) : 100;
  const root = $('modal-root');
  const set = (id: string, html: string) => {
    const e = root.querySelector('#' + id);
    if (e) e.innerHTML = html;
  };
  set('st-d', String(a.drones));
  set('st-m', String(a.missiles));
  if (a.facility) set('st-dmg', `<b>≈ ${Math.min(hp, fc.expectedDamage).toFixed(0)}%</b>`);
  const btn = root.querySelector('[data-act="launch"]') as HTMLButtonElement | null;
  if (btn) btn.disabled = a.drones + a.missiles <= 0;
}

// ---------------------------------------------------------------- делегування подій

function handleAct(el: HTMLElement, type: string): void {
  const act = el.dataset.act!;
  const v = el.dataset.v;
  const isInput = type === 'input';
  const isChange = type === 'change';

  // --- елементи, що реагують на input/change
  if (act === 'fraction-slider') {
    if (!isInput) return;
    store.settings.fraction = Number((el as HTMLInputElement).value) / 100;
    store.saveSettings();
    scheduleRender();
    return;
  }
  if (act === 'classic') {
    if (!isChange) return;
    store.settings.classicHalf = (el as HTMLInputElement).checked;
    store.saveSettings();
    scheduleRender();
    return;
  }
  if (act === 'alloc') {
    const input = el as HTMLInputElement;
    const kind = el.dataset.kind!;
    const val = Number(input.value);
    const lbl = $('modal-root').querySelector(kind === 'drones' ? '#lbl-d' : '#lbl-m');
    if (lbl) lbl.textContent = `${val}%`;
    if (!isChange) return;
    const sd = store.state.sides[store.state.activeSide];
    let d = kind === 'drones' ? val : sd.allocDrones;
    let m = kind === 'missiles' ? val : sd.allocMissiles;
    if (d + m > 100) {
      if (kind === 'drones') m = 100 - d;
      else d = 100 - m;
    }
    store.dispatch({ type: 'policy', allocDrones: d, allocMissiles: m });
    return;
  }
  if (act === 'st-slider') {
    if (!isInput || !strikeArgs) return;
    const val = Number((el as HTMLInputElement).value);
    if (el.dataset.kind === 'drones') strikeArgs.drones = val;
    else strikeArgs.missiles = val;
    updateStrikeLive();
    return;
  }
  if (act === 'op-target') {
    if (!isChange) return;
    opsPick = { op: el.dataset.op!, target: (el as HTMLSelectElement).value || undefined };
    modals.open('ops', () => opsModal(store, opsPick));
    return;
  }
  if (type !== 'click') return;

  switch (act) {
    case 'end-turn':
      requestEndTurn();
      break;
    case 'undo':
      store.undo();
      break;
    case 'tech':
      modals.open('tech', () => techModal(store));
      break;
    case 'policy':
      modals.open('policy', () => policyModal(store), { wide: 'mid' });
      break;
    case 'ops':
      opsPick = undefined;
      modals.open('ops', () => opsModal(store, opsPick));
      break;
    case 'rules':
      modals.open('rules', () => rulesModal(), { wide: 'mid' });
      break;
    case 'new-game':
      openNewGame(false);
      break;
    case 'close-modal':
      modals.close();
      break;
    case 'strike-mode':
      store.mode = store.mode === 'strike' ? 'normal' : 'strike';
      store.selected = null;
      store.notify();
      break;
    case 'north':
      store.dispatch({ type: 'fortifyNorth' });
      break;
    case 'pressure':
      store.dispatch({ type: 'pressure' });
      break;
    case 'fraction':
      store.settings.fraction = Number(v);
      store.settings.classicHalf = false;
      store.saveSettings();
      store.notify();
      break;
    case 'deploy-ad':
      store.dispatch({ type: 'deployAD', region: el.dataset.region! });
      break;
    case 'fortify':
      store.dispatch({ type: 'fortify', region: el.dataset.region! });
      break;
    case 'strike-facility':
      openStrike(el.dataset.region!, el.dataset.fac!);
      break;
    case 'strike-city':
      openStrike(el.dataset.region!);
      break;
    case 'launch': {
      if (!strikeArgs) break;
      const a = strikeArgs;
      const target = a.facility ? ({ kind: 'facility', region: a.region, facility: a.facility } as const) : ({ kind: 'city', region: a.region } as const);
      const res = store.dispatch({ type: 'strike', target, drones: a.drones, missiles: a.missiles });
      if (res.ok) {
        modals.close();
        strikeArgs = null;
        store.mode = 'normal';
        store.notify();
      }
      break;
    }
    case 'research':
      store.dispatch({ type: 'research', tech: el.dataset.tech! });
      break;
    case 'cancel-research':
      store.dispatch({ type: 'cancelResearch', tech: el.dataset.tech! });
      break;
    case 'mobilization':
      store.dispatch({ type: 'policy', mobilization: Number(v) });
      break;
    case 'start-op': {
      const op = el.dataset.op!;
      const target = opsPick && opsPick.op === op ? opsPick.target : undefined;
      const res = store.dispatch({ type: 'startOp', op, target });
      if (res.ok) {
        modals.close();
        toast('Операцію розпочато. Деталі — у журналі.', 'info');
      }
      break;
    }
    case 'ng-side':
      ngSide = v as typeof ngSide;
      modals.open('newgame', () => newGameModal(store, store.hasSave(), { first: !store.hasGame }), { closable: store.hasGame, wide: 'mid' });
      break;
    case 'ng-scen':
      ngScen = v!;
      modals.open('newgame', () => newGameModal(store, store.hasSave(), { first: !store.hasGame }), { closable: store.hasGame, wide: 'mid' });
      break;
    case 'ng-diff':
      ngDiff = v as typeof ngDiff;
      modals.open('newgame', () => newGameModal(store, store.hasSave(), { first: !store.hasGame }), { closable: store.hasGame, wide: 'mid' });
      break;
    case 'ng-start': {
      const seedTxt = ($('modal-root').querySelector('#ng-seed') as HTMLInputElement | null)?.value.trim();
      const seed = seedTxt ? hashSeed(seedTxt) : undefined;
      modals.close();
      shownOutcome = false;
      store.newGame({ humanSide: ngSide, difficulty: ngDiff, scenario: ngScen, seed });
      ensureMap();
      mapView?.resetView();
      renderAll();
      break;
    }
    case 'continue':
      modals.close();
      shownOutcome = !!store.state?.outcome;
      if (!store.state) store.loadSaved();
      ensureMap();
      renderAll();
      break;
    case 'dismiss-recap':
      store.dismissRecap();
      break;
    case 'dismiss-tips':
      store.settings.tipsDismissed = true;
      store.saveSettings();
      store.notify();
      break;
    case 'curtain-ok':
      modals.close();
      store.confirmCurtain();
      break;
    case 'copy-result':
      void navigator.clipboard?.writeText(el.dataset.text ?? '').then(() => toast('Скопійовано', 'info'));
      break;
    case 'ai-speed':
      store.settings.aiSpeed = v as AiSpeed;
      store.saveSettings();
      store.notify();
      break;
    case 'pause':
      store.setPaused(!store.paused);
      break;
    case 'swap-view':
      store.viewSide = store.viewSide === 'UA' ? 'RU' : 'UA';
      store.notify();
      break;
  }
}

function hashSeed(text: string): number {
  if (/^\d+$/.test(text)) return Number(text) | 0 || 1;
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h | 0 || 1;
}

for (const type of ['click', 'input', 'change'] as const) {
  document.addEventListener(type, (e) => {
    const t = (e.target as HTMLElement).closest?.('[data-act]') as HTMLElement | null;
    if (!t) return;
    if (type === 'click' && (t.tagName === 'INPUT' || t.tagName === 'SELECT')) return;
    handleAct(t, type);
  });
}

// кнопки масштабу
document.querySelectorAll<HTMLElement>('#zoomctl button').forEach((b) => {
  b.addEventListener('click', () => {
    const z = b.dataset.zoom;
    if (z === 'in') mapView?.zoomBy(1.4);
    else if (z === 'out') mapView?.zoomBy(1 / 1.4);
    else if (z === 'reset') mapView?.resetView();
    else if (z === 'legend') {
      const lg = $('legend');
      lg.hidden = !lg.hidden;
      b.classList.toggle('on', !lg.hidden);
    } else if (z === 'facilities') {
      store.settings.showFacilities = !store.settings.showFacilities;
      store.saveSettings();
      store.notify();
    }
  });
});

// клавіатура
document.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (!store.state) return;
  if (modals.openId && modals.openId !== 'strike') return;
  const k = e.key.toLowerCase();
  if (k === ' ') {
    e.preventDefault();
    requestEndTurn();
  } else if (k === 'z') {
    store.undo();
  } else if (k >= '1' && k <= '4') {
    store.settings.fraction = [0.25, 0.5, 0.75, 1][Number(k) - 1];
    store.settings.classicHalf = false;
    store.saveSettings();
    store.notify();
  } else if (k === 't') {
    modals.open('tech', () => techModal(store));
  } else if (k === 's') {
    store.mode = store.mode === 'strike' ? 'normal' : 'strike';
    store.selected = null;
    store.notify();
  } else if (k === 'f') {
    store.settings.showFacilities = !store.settings.showFacilities;
    store.saveSettings();
    store.notify();
  } else if (k === 'escape') {
    store.selected = null;
    store.mode = 'normal';
    store.notify();
  } else if (k === '+' || k === '=') {
    mapView?.zoomBy(1.3);
  } else if (k === '-') {
    mapView?.zoomBy(1 / 1.3);
  } else if (k === '0') {
    mapView?.resetView();
  }
});

// ---------------------------------------------------------------- старт

function openNewGame(first: boolean): void {
  const last = store.settings.lastConfig;
  ngSide = (last.humanSide ?? 'UA') as typeof ngSide;
  ngDiff = (last.difficulty ?? 'normal') as typeof ngDiff;
  ngScen = last.scenario ?? 'oct-2026';
  modals.open('newgame', () => newGameModal(store, store.hasSave(), { first }), { closable: !first, wide: 'mid' });
}

function boot(): void {
  ensureMapPlaceholder();
  if (store.hasSave() && store.loadSaved()) {
    shownOutcome = !!store.state.outcome;
    ensureMap();
    renderAll();
  } else {
    openNewGame(true);
  }
}

/** До появи гри малюємо порожній каркас, щоб інтерфейс не «стрибав». */
function ensureMapPlaceholder(): void {
  $('topbar').innerHTML = `<span class="title"><span class="flag"></span>Битва за Україну<small>Лінія дронів</small></span>`;
}

// доступ із консолі для налагодження
(window as unknown as { __b4ua: unknown }).__b4ua = { store, REGION_BY_ID, ai: aiChooseOrder };

boot();
