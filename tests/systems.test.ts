import { describe, expect, it } from 'vitest';
import { applyOrder } from '../src/engine/orders';
import { createGame } from '../src/engine/scenario';
import { aiChooseOrder } from '../src/engine/ai';
import { CFG } from '../src/engine/config';
import { getMods, invalidateMods, ordersFor } from '../src/engine/selectors';
import { upkeep } from '../src/engine/turn';
import { OP_BY_ID, opAvailability } from '../src/engine/ops';
import type { GameState } from '../src/engine/types';

const fresh = (extra: Partial<Parameters<typeof createGame>[0]> = {}): GameState =>
  createGame({ seed: 11, difficulty: 'hard', controllers: { UA: 'human', RU: 'human' }, ...extra });

describe('спецоперації', () => {
  it('«Павутина» недоступна без технологій і коштів, готується 3 тижні, руйнує стратегічну авіацію', () => {
    const s = fresh();
    expect(opAvailability(s, 'UA', OP_BY_ID.spiderweb)).toBeTruthy();
    s.sides.UA.techs.push('saboteurs');
    s.sides.UA.pp = 200;
    invalidateMods(s);
    expect(opAvailability(s, 'UA', OP_BY_ID.spiderweb)).toBeNull();
    // ризик викриття обнуляємо, щоб тест був детермінованим
    OP_BY_ID.spiderweb.risk = 0;
    const r = applyOrder(s, { type: 'startOp', op: 'spiderweb' });
    expect(r.ok).toBe(true);
    expect(s.sides.UA.pp).toBe(130);
    const before = s.sides.RU.stratAir;
    for (let i = 0; i < 3; i++) upkeep(s);
    expect(s.sides.RU.stratAir).toBeLessThan(before);
    expect(s.regions.saratov.facilities['engels']).toBeLessThan(100);
    expect(s.sides.UA.opCooldown['spiderweb']).toBeGreaterThan(0);
    OP_BY_ID.spiderweb.risk = 0.12;
  });

  it('диверсія на залізниці додає втрати при перекиданні до області', () => {
    const s = fresh();
    s.sides.UA.techs.push('saboteurs');
    s.sides.UA.pp = 100;
    invalidateMods(s);
    OP_BY_ID.rail_sabotage.risk = 0;
    expect(applyOrder(s, { type: 'startOp', op: 'rail_sabotage', target: 'luhansk' }).ok).toBe(true);
    upkeep(s);
    expect(s.regions.luhansk.railCut).toBeGreaterThan(0);
    OP_BY_ID.rail_sabotage.risk = 0.1;
  });
});

describe('Білорусь', () => {
  it('тиск і укріплення міняють напругу; при 100% Білорусь вступає у війну', () => {
    const s = fresh();
    s.activeSide = 'RU';
    const t0 = s.belarus.tension;
    expect(applyOrder(s, { type: 'pressure' }).ok).toBe(true);
    expect(s.belarus.tension).toBeGreaterThan(t0);
    s.activeSide = 'UA';
    s.sides.UA.pp = 100;
    const t1 = s.belarus.tension;
    expect(applyOrder(s, { type: 'fortifyNorth' }).ok).toBe(true);
    expect(s.belarus.tension).toBeLessThan(t1);
    s.belarus.tension = 99.9;
    upkeep(s);
    expect(s.belarus.active).toBe(true);
    expect(s.regions.homel.owner).toBe('RU');
    expect(s.regions.homel.troops).toBeGreaterThan(10000);
  });
});

describe('режими складності', () => {
  it('у «звичайному» режимі людина отримує бонусний наказ, ШІ — ні', () => {
    const s = createGame({ seed: 3, difficulty: 'normal', controllers: { UA: 'human', RU: 'ai' } });
    expect(ordersFor(s, 'UA')).toBe(getMods(s, 'UA').orders + CFG.difficulty.normal.humanBonusOrders);
    expect(ordersFor(s, 'RU')).toBe(getMods(s, 'RU').orders);
    const h = createGame({ seed: 3, difficulty: 'hard', controllers: { UA: 'human', RU: 'ai' } });
    expect(ordersFor(h, 'UA')).toBe(getMods(h, 'UA').orders);
    const e = createGame({ seed: 3, difficulty: 'easy', controllers: { UA: 'human', RU: 'ai' } });
    expect(ordersFor(e, 'UA')).toBe(getMods(e, 'UA').orders + 2);
  });

  it('ШІ не атакує людину перші тижні (тривалість залежить від складності)', () => {
    const s = createGame({ seed: 9, difficulty: 'normal', controllers: { UA: 'human', RU: 'ai' } });
    s.activeSide = 'RU';
    s.ordersLeft = 4;
    for (let i = 0; i < 10; i++) {
      const o = aiChooseOrder(s, 'RU');
      expect(o.type).not.toBe('attack');
      if (o.type === 'endTurn') break;
      applyOrder(s, o);
    }
  });

  it('у «звичайному» режимі втрати ШІ більші, ніж у «тяжкому»', () => {
    const a = createGame({ seed: 1, difficulty: 'normal', controllers: { UA: 'human', RU: 'ai' } });
    const b = createGame({ seed: 1, difficulty: 'hard', controllers: { UA: 'human', RU: 'ai' } });
    const ra = applyOrder(a, { type: 'attack', from: 'kharkiv', to: 'luhansk', fraction: 0.6 });
    const rb = applyOrder(b, { type: 'attack', from: 'kharkiv', to: 'luhansk', fraction: 0.6 });
    expect(ra.battle!.defenderLoss).toBeGreaterThan(rb.battle!.defenderLoss);
  });
});

describe('економіка та ППО', () => {
  it('розгортання ППО коштує виробництво й підіймає рівень', () => {
    const s = fresh();
    s.sides.UA.pp = 50;
    const ad = s.regions.lviv.ad;
    expect(applyOrder(s, { type: 'deployAD', region: 'lviv' }).ok).toBe(true);
    expect(s.regions.lviv.ad).toBe(ad + 1);
    expect(s.sides.UA.pp).toBe(50 - CFG.ad.cost[ad]);
    expect(applyOrder(s, { type: 'deployAD', region: 'luhansk' }).ok).toBe(false);
  });

  it('політика: частки не перевищують 100%', () => {
    const s = fresh();
    expect(applyOrder(s, { type: 'policy', allocDrones: 70, allocMissiles: 40 }).ok).toBe(false);
    expect(applyOrder(s, { type: 'policy', allocDrones: 60, allocMissiles: 40 }).ok).toBe(true);
    expect(applyOrder(s, { type: 'policy', mobilization: 5 }).ok).toBe(false);
  });

  it('укріплення дає бонус оборони', () => {
    const s = fresh();
    s.sides.UA.pp = 100;
    const before = s.regions.sumy.fort;
    expect(applyOrder(s, { type: 'fortify', region: 'sumy' }).ok).toBe(true);
    expect(s.regions.sumy.fort).toBe(before + 1);
  });
});
