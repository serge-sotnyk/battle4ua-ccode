// Диспетчер наказів: перевірка правил і виконання. Єдина точка входу і для людини, і для ШІ.

import { CFG } from './config';
import { resolveBattle } from './combat';
import { pushLog, pushTicker, fmt } from './log';
import { startOperation } from './ops';
import { performStrike, validateStrike } from './strikes';
import {
  REGION_BY_ID,
  edgeKind,
  edgePassable,
  getMods,
  groundWarAllowed,
  invalidateMods,
  isFront,
  neighborsOf,
  other,
  reachableFriendly,
} from './selectors';
import { TECH_BY_ID } from './techs';
import { endSideTurn } from './turn';
import { evaluateOutcome } from './victory';
import type { GameState, Order, OrderResult, Side } from './types';

export const ORDER_COST: Record<Order['type'], number> = {
  move: 1,
  attack: 1,
  strike: 1,
  fortify: 1,
  startOp: 1,
  pressure: 1,
  fortifyNorth: 1,
  research: 0,
  cancelResearch: 0,
  policy: 0,
  deployAD: 0,
  endTurn: 0,
};

const NORTH_REGIONS = ['chernihiv', 'zhytomyr', 'volyn', 'rivne', 'kyiv'];
const fail = (error: string): OrderResult => ({ ok: false, error });

function clampFraction(f: number): number {
  if (!Number.isFinite(f)) return 0.5;
  return Math.min(1, Math.max(0.05, f));
}

export function applyOrder(state: GameState, order: Order): OrderResult {
  if (state.outcome) return fail('Гру завершено.');
  const side = state.activeSide;
  const cost = ORDER_COST[order.type];
  if (cost > 0 && state.ordersLeft < cost) return fail('Немає вільних наказів.');

  const res = execute(state, side, order);
  if (res.ok && cost > 0) state.ordersLeft -= cost;
  if (res.ok && order.type !== 'endTurn') {
    const outcome = evaluateOutcome(state);
    if (outcome) {
      state.outcome = outcome;
      pushLog(state, { side: 'world', kind: 'info', text: `Кінець гри: ${outcome.reason}` });
    }
  }
  return res;
}

function execute(state: GameState, side: Side, order: Order): OrderResult {
  switch (order.type) {
    case 'move':
      return doMove(state, side, order.from, order.to, clampFraction(order.fraction));
    case 'attack':
      return doAttack(state, side, order.from, order.to, clampFraction(order.fraction));
    case 'strike': {
      const err = validateStrike(state, side, order.target, order.drones, order.missiles);
      if (err) return fail(err);
      const report = performStrike(state, side, order.target, order.drones, order.missiles);
      return { ok: true, strike: report };
    }
    case 'fortify': {
      const r = state.regions[order.region];
      if (!r || r.owner !== side) return fail('Це не ваша область.');
      if (r.fort >= CFG.fortify.max) return fail('Досягнуто максимального рівня укріплень.');
      const price = CFG.fortify.cost[r.fort];
      if (state.sides[side].pp < price) return fail(`Потрібно ${price} виробництва.`);
      state.sides[side].pp -= price;
      r.fort += 1;
      pushLog(state, { side, kind: 'info', region: order.region, text: `Укріплено «${REGION_BY_ID[order.region].name}» (рівень ${r.fort}).` });
      return { ok: true };
    }
    case 'startOp': {
      const err = startOperation(state, side, order.op, order.target);
      return err ? fail(err) : { ok: true };
    }
    case 'pressure': {
      if (side !== 'RU') return fail('Лише для РФ.');
      if (state.belarus.active) return fail('Білорусь уже залучена.');
      state.belarus.tension = Math.min(99, state.belarus.tension + CFG.belarus.pressure);
      pushLog(state, { side, kind: 'info', text: 'Тиск на Мінськ: напруга на північному кордоні зросла.' });
      return { ok: true };
    }
    case 'fortifyNorth': {
      if (side !== 'UA') return fail('Лише для України.');
      if (state.belarus.active) return fail('Білорусь уже вступила у війну.');
      const price = 15;
      if (state.sides.UA.pp < price) return fail(`Потрібно ${price} виробництва.`);
      state.sides.UA.pp -= price;
      state.belarus.tension = Math.max(0, state.belarus.tension - CFG.belarus.fortifyNorth);
      const cand = NORTH_REGIONS.filter((id) => state.regions[id].owner === 'UA' && state.regions[id].fort < CFG.fortify.max).sort(
        (a, b) => state.regions[a].fort - state.regions[b].fort,
      );
      if (cand.length) state.regions[cand[0]].fort += 1;
      pushLog(state, { side, kind: 'info', text: 'Північний кордон укріплено: напруга знизилась.' });
      return { ok: true };
    }
    case 'research': {
      const s = state.sides[side];
      const t = TECH_BY_ID[order.tech];
      if (!t) return fail('Невідома технологія.');
      if (t.side !== 'both' && t.side !== side) return fail('Недоступно вашій стороні.');
      if (s.techs.includes(t.id)) return fail('Вже досліджено.');
      if (s.research.some((j) => j.tech === t.id)) return fail('Вже досліджується.');
      if (s.research.length >= CFG.research.slots) return fail('Усі дослідницькі слоти зайняті.');
      for (const req of t.requires) if (!s.techs.includes(req)) return fail('Потрібні попередні технології.');
      if (s.pp < t.cost) return fail(`Потрібно ${t.cost} виробництва.`);
      s.pp -= t.cost;
      s.research.push({ tech: t.id, turnsLeft: t.turns });
      pushLog(state, { side, kind: 'tech', text: `Розпочато дослідження: ${t.name} (${t.turns} тиж.).` });
      return { ok: true };
    }
    case 'cancelResearch': {
      const s = state.sides[side];
      const idx = s.research.findIndex((j) => j.tech === order.tech);
      if (idx < 0) return fail('Немає такого дослідження.');
      const t = TECH_BY_ID[order.tech];
      s.research.splice(idx, 1);
      s.pp += Math.floor(t.cost / 2);
      return { ok: true };
    }
    case 'policy': {
      const s = state.sides[side];
      if (order.mobilization !== undefined) {
        if (order.mobilization < 0 || order.mobilization > 3) return fail('Невірний рівень мобілізації.');
        s.mobilization = Math.round(order.mobilization);
      }
      const d = order.allocDrones ?? s.allocDrones;
      const m = order.allocMissiles ?? s.allocMissiles;
      if (d < 0 || m < 0 || d + m > 100) return fail('Сума часток не може перевищувати 100%.');
      s.allocDrones = Math.round(d);
      s.allocMissiles = Math.round(m);
      return { ok: true };
    }
    case 'deployAD': {
      const r = state.regions[order.region];
      if (!r || r.owner !== side) return fail('Це не ваша область.');
      if (r.ad >= CFG.ad.maxLevel) return fail('Досягнуто максимального рівня ППО.');
      const price = CFG.ad.cost[r.ad];
      if (state.sides[side].pp < price) return fail(`Потрібно ${price} виробництва.`);
      state.sides[side].pp -= price;
      r.ad += 1;
      invalidateMods(state);
      pushLog(state, { side, kind: 'info', region: order.region, text: `Розгорнуто ППО: «${REGION_BY_ID[order.region].name}» → рівень ${r.ad}.` });
      return { ok: true };
    }
    case 'endTurn':
      endSideTurn(state);
      return { ok: true };
  }
}

function doMove(state: GameState, side: Side, from: string, to: string, fraction: number): OrderResult {
  const s = state.regions[from];
  const t = state.regions[to];
  if (!s || !t) return fail('Невідома область.');
  if (from === to) return fail('Оберіть іншу область.');
  if (s.owner !== side) return fail('Джерело — не ваша область.');
  if (t.owner !== side) return fail('Перекидати можна лише у свої області.');
  if (!reachableFriendly(state, side, from).includes(to)) return fail('Область поза радіусом логістики.');
  const movable = s.troops - CFG.minGarrison;
  if (movable < 1) return fail('Замало військ для перекидання.');
  const n = Math.min(movable, Math.max(1, Math.floor(s.troops * fraction)));
  const foe = other(side);
  let loss = 0;
  if (isFront(state, to)) loss += n * getMods(state, foe).interdiction;
  if (s.railCut > 0 || t.railCut > 0) loss += n * 0.25;
  loss = Math.min(Math.round(loss), n - 1 < 0 ? 0 : n - 1);
  s.troops -= n;
  t.troops += n - loss;
  if (loss > 0) {
    state.sides[side].casualties += loss;
    state.sides[side].weekCasualties += loss;
    state.sides[foe].kills += loss;
    state.sides[foe].weekKills += loss;
  }
  pushLog(state, {
    side,
    kind: 'move',
    region: to,
    text: `Перекинуто ${fmt(n)} бійців: ${REGION_BY_ID[from].name} → ${REGION_BY_ID[to].name}${loss ? ` (втрати в дорозі: ${fmt(loss)})` : ''}.`,
  });
  return { ok: true, moved: n, lost: loss };
}

export function attackError(state: GameState, side: Side, from: string, to: string): string | null {
  const s = state.regions[from];
  const t = state.regions[to];
  if (!s || !t) return 'Невідома область.';
  if (s.owner !== side) return 'Джерело — не ваша область.';
  if (t.owner !== other(side)) return t.owner === 'BY' ? 'Білорусь поки нейтральна.' : 'Атакувати можна лише ворожі області.';
  if (!neighborsOf(from).includes(to)) return 'Області не межують.';
  if (edgeKind(from, to) === 'bridge' || !edgePassable(state, from, to)) return 'Через міст атакувати неможливо.';
  if (!groundWarAllowed(side, to)) return 'Глибокий тил РФ недосяжний для наземних боїв — використовуйте удари.';
  if (s.troops - CFG.minGarrison < 1) return 'Замало військ для атаки.';
  return null;
}

function doAttack(state: GameState, side: Side, from: string, to: string, fraction: number): OrderResult {
  const err = attackError(state, side, from, to);
  if (err) return fail(err);
  const s = state.regions[from];
  const committed = Math.min(s.troops - CFG.minGarrison, Math.max(1, Math.floor(s.troops * fraction)));
  const prevOwner = state.regions[to].owner as Side;
  const report = resolveBattle(state, from, to, committed);
  const fn = REGION_BY_ID[from].name;
  const tn = REGION_BY_ID[to].name;
  if (report.captured) {
    applyCaptureEffects(state, side, prevOwner, to);
    pushLog(state, {
      side,
      kind: 'capture',
      region: to,
      text: `${side === 'UA' ? 'ЗСУ звільняють / беруть' : 'Російські війська захоплюють'} «${tn}»! Втрати: нападники ${fmt(report.attackerLoss)}, оборонці ${fmt(report.defenderLoss)}.`,
    });
    if (side === 'UA') pushTicker(state, `«${tn}» звільнено. Окупанти заявили про «жест доброї волі».`);
    else pushTicker(state, `Втрата «${tn}». Генерали підкреслюють, що це тактичний відхід на заздалегідь підготовлені позиції.`);
  } else {
    pushLog(state, {
      side,
      kind: 'attack',
      region: to,
      text: `Атака ${fn} → ${tn}: втрати нападників ${fmt(report.attackerLoss)}, оборонців ${fmt(report.defenderLoss)}. Залишок оборонців: ${fmt(state.regions[to].troops)}.`,
    });
  }
  return { ok: true, battle: report };
}

function applyCaptureEffects(state: GameState, winner: Side, loser: Side, regionId: string): void {
  const R = CFG.resilience;
  const def = REGION_BY_ID[regionId];
  state.sides[winner].resilience = Math.min(100, state.sides[winner].resilience + R.capture);
  state.sides[loser].resilience = Math.max(0, state.sides[loser].resilience - (def.capital ? R.capitalLose : R.lose));
  if (winner === 'UA') state.sides.UA.support = Math.min(100, state.sides.UA.support + 0.8);
  else state.sides.UA.support = Math.max(0, state.sides.UA.support - 1.2);
}
