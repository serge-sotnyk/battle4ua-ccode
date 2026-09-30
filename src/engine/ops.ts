// Спецоперації: рідкісні, дорогі, готуються кілька ходів і можуть провалитися.

import { pushLog, pushTicker } from './log';
import { chance } from './rng';
import { ALL_REGION_IDS, FACILITY_BY_ID, REGION_BY_ID, getMods, invalidateMods, other } from './selectors';
import { hasTech } from './techs';
import type { GameState, Side } from './types';

export interface OpDef {
  id: string;
  name: string;
  icon: string;
  side: Side | 'both';
  cost: number;
  prep: number;
  risk: number;
  cooldown: number;
  requires: string[];
  target: 'none' | 'enemy-region';
  desc: string;
  /** Застосувати ефект; повертає текст результату. */
  apply: (state: GameState, side: Side, target?: string) => string;
  /** Чи доступна ціль. */
  validTarget?: (state: GameState, side: Side, region: string) => boolean;
}

const dmgFacility = (state: GameState, id: string, amount: number) => {
  const f = FACILITY_BY_ID[id];
  const r = state.regions[f.region];
  r.facilities[id] = Math.max(0, (r.facilities[id] ?? 100) - amount);
};

export const OPS: OpDef[] = [
  {
    id: 'spiderweb',
    name: 'Операція «Павутина»',
    icon: '🕸️',
    side: 'UA',
    cost: 70,
    prep: 3,
    risk: 0.12,
    cooldown: 26,
    requires: ['saboteurs', 'lr_drones'],
    target: 'none',
    desc: 'Кілька тижнів ви таємно завозите дрони під аеродроми стратегічної авіації. У разі успіху ворог надовго втрачає частину бомбардувальників: рідшають ракетні удари й падає підтримка з повітря.',
    apply: (state, side) => {
      const foe = state.sides[other(side)];
      foe.stratAir = Math.max(0.2, foe.stratAir - 0.5);
      dmgFacility(state, 'engels', 55);
      dmgFacility(state, 'dyagilevo', 55);
      state.sides[side].resilience = Math.min(100, state.sides[side].resilience + 3);
      foe.resilience = Math.max(0, foe.resilience - 3);
      state.sides[side].support = Math.min(100, state.sides[side].support + 3);
      return 'Стратегічна авіація ворога сильно пошкоджена (Енгельс, Дягілєво). Ракетні удари стануть рідшими.';
    },
  },
  {
    id: 'kerch',
    name: 'Удар по Кримському мосту',
    icon: '🌉',
    side: 'UA',
    cost: 55,
    prep: 2,
    risk: 0.15,
    cooldown: 18,
    requires: ['sea_drones'],
    target: 'none',
    desc: 'Морські дрони й підводні заряди. Міст зруйновано приблизно на 5 тижнів: перекидання між Кубанню й Кримом неможливе, а війська Криму слабшають без постачання.',
    apply: (state, side) => {
      dmgFacility(state, 'kerch_bridge', 100);
      const foe = state.sides[other(side)];
      foe.resilience = Math.max(0, foe.resilience - 1.5);
      state.sides[side].resilience = Math.min(100, state.sides[side].resilience + 1);
      return 'Кримський міст зруйновано. Постачання Криму через Керченську протоку перервано.';
    },
  },
  {
    id: 'rail_sabotage',
    name: 'Диверсія на залізниці',
    icon: '🚂',
    side: 'both',
    cost: 25,
    prep: 1,
    risk: 0.1,
    cooldown: 3,
    requires: ['saboteurs'],
    target: 'enemy-region',
    desc: 'Партизани підривають колію в обраній області: на 4 тижні перекидання військ туди й звідти несе втрати.',
    apply: (state, _side, target) => {
      if (target) state.regions[target].railCut = 4;
      return `Залізницю в області «${target ? REGION_BY_ID[target].name : '?'}» виведено з ладу на 4 тижні.`;
    },
  },
  {
    id: 'cyber_grid',
    name: 'Кібератака на енергосистему',
    icon: '💻',
    side: 'both',
    cost: 35,
    prep: 1,
    risk: 0.1,
    cooldown: 6,
    requires: ['cyber'],
    target: 'none',
    desc: 'Тимчасове відключення частини енергосистеми супротивника (−12% на 3 тижні).',
    apply: (state, side) => {
      const foe = other(side);
      state.sides[foe].effects.push({ id: `cyber-${state.turn}`, key: 'energyCyber', value: 0.12, turnsLeft: 3, label: 'Кібератака на енергосистему' });
      invalidateMods(state);
      return 'Кібератака відключила частину енергосистеми ворога.';
    },
  },
  {
    id: 'sabotage_aa',
    name: 'Диверсія проти ППО',
    icon: '📡',
    side: 'both',
    cost: 30,
    prep: 1,
    risk: 0.12,
    cooldown: 4,
    requires: ['saboteurs'],
    target: 'enemy-region',
    desc: 'Виведення з ладу радарів і засобів зв’язку: у обраній області ППО діє на рівень слабше 4 тижні.',
    validTarget: (state, _side, region) => state.regions[region].ad > 0,
    apply: (state, _side, target) => {
      if (target) state.regions[target].aaSabotage = 4;
      return `ППО в області «${target ? REGION_BY_ID[target].name : '?'}» ослаблено на 4 тижні.`;
    },
  },
  {
    id: 'nuclear_blackmail',
    name: 'Ядерний шантаж',
    icon: '☢️',
    side: 'RU',
    cost: 15,
    prep: 0,
    risk: 0,
    cooldown: 12,
    requires: [],
    target: 'none',
    desc: 'Гучні заяви на найвищому рівні. Частина партнерів гальмує допомогу, але на вас дивляться косо навіть союзники.',
    apply: (state, side) => {
      const foe = state.sides[other(side)];
      foe.support = Math.max(10, foe.support - 8);
      state.sides[side].resilience = Math.min(100, state.sides[side].resilience + 1);
      return 'Підтримка партнерів України просіла. Офіційний коментар: «ми лише констатуємо факти».';
    },
  },
];

export const OP_BY_ID: Record<string, OpDef> = Object.fromEntries(OPS.map((o) => [o.id, o]));

export function opsForSide(side: Side): OpDef[] {
  return OPS.filter((o) => o.side === 'both' || o.side === side);
}

export function opAvailability(state: GameState, side: Side, op: OpDef): string | null {
  if (op.side !== 'both' && op.side !== side) return 'Недоступно для цієї сторони.';
  for (const t of op.requires) if (!hasTech(state, side, t)) return 'Потрібні технології.';
  const s = state.sides[side];
  if ((s.opCooldown[op.id] ?? 0) > 0) return `Перезарядка: ще ${s.opCooldown[op.id]} тиж.`;
  if (s.ops.some((j) => j.op === op.id)) return 'Операція вже готується.';
  if (s.pp < op.cost) return 'Не вистачає виробництва.';
  return null;
}

export function validTargets(state: GameState, side: Side, op: OpDef): string[] {
  if (op.target === 'none') return [];
  const foe = other(side);
  return ALL_REGION_IDS.filter((id) => state.regions[id].owner === foe && (!op.validTarget || op.validTarget(state, side, id)));
}

export function startOperation(state: GameState, side: Side, opId: string, target?: string): string | null {
  const op = OP_BY_ID[opId];
  if (!op) return 'Невідома операція.';
  const why = opAvailability(state, side, op);
  if (why) return why;
  if (op.target === 'enemy-region') {
    if (!target || !validTargets(state, side, op).includes(target)) return 'Оберіть ціль.';
  }
  state.sides[side].pp -= op.cost;
  pushLog(state, { side, kind: 'op', text: `Розпочато підготовку: ${op.name}${target ? ` (${REGION_BY_ID[target].name})` : ''}.` });
  if (op.prep === 0) {
    const msg = op.apply(state, side, target);
    state.sides[side].opCooldown[op.id] = op.cooldown;
    pushLog(state, { side, kind: 'op', text: `${op.name}: ${msg}` });
    return null;
  }
  state.sides[side].ops.push({ op: opId, target, prepLeft: op.prep, exposed: false });
  return null;
}

/** Щотижня: готовність, ризик викриття, виконання. */
export function progressOps(state: GameState): void {
  for (const side of ['UA', 'RU'] as Side[]) {
    const s = state.sides[side];
    // перезарядки спливають до розгляду нових завершень, щоб значення cooldown було точним
    for (const k of Object.keys(s.opCooldown)) if (s.opCooldown[k] > 0) s.opCooldown[k] -= 1;
    const foeIntel = getMods(state, other(side)).intel;
    const keep: typeof s.ops = [];
    for (const job of s.ops) {
      const op = OP_BY_ID[job.op];
      const riskMul = getMods(state, side).opRisk * (1 + 0.25 * foeIntel);
      const risk = Math.min(0.6, Math.max(0, op.risk * riskMul));
      if (job.prepLeft > 0 && chance(state, risk)) {
        pushLog(state, { side, kind: 'op', text: `Операцію «${op.name}» викрито — підготовку зірвано. Витрати втрачено.` });
        s.resilience = Math.max(0, s.resilience - 1);
        s.opCooldown[op.id] = Math.max(s.opCooldown[op.id] ?? 0, 2);
        continue;
      }
      job.prepLeft -= 1;
      if (job.prepLeft <= 0) {
        const msg = op.apply(state, side, job.target);
        s.opCooldown[op.id] = op.cooldown;
        pushLog(state, { side, kind: 'op', text: `${op.name}: успіх! ${msg}` });
        pushTicker(state, `${op.name}: «нічого особливого, звичайна технічна несправність».`);
      } else {
        keep.push(job);
      }
    }
    s.ops = keep;
  }
}
