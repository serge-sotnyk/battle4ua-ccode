import { describe, expect, it } from 'vitest';
import { applyOrder } from '../src/engine/orders';
import { createGame } from '../src/engine/scenario';
import { estimateBattle } from '../src/engine/combat';
import { computeMods } from '../src/engine/techs';
import { aiPlayFullTurn } from '../src/engine/ai';
import { activateBelarus } from '../src/engine/turn';
import { forecastStrike } from '../src/engine/strikes';
import { CFG } from '../src/engine/config';
import { ALL_REGION_IDS, energyPct, invalidateMods, totalTroops } from '../src/engine/selectors';
import type { GameState } from '../src/engine/types';

const fresh = (seed = 7): GameState => createGame({ seed, controllers: { UA: 'human', RU: 'human' }, difficulty: 'hard' });

function assertSane(s: GameState) {
  for (const id of ALL_REGION_IDS) {
    const r = s.regions[id];
    expect(Number.isFinite(r.troops), id).toBe(true);
    expect(r.troops, id).toBeGreaterThanOrEqual(0);
    for (const hp of Object.values(r.facilities)) {
      expect(hp).toBeGreaterThanOrEqual(0);
      expect(hp).toBeLessThanOrEqual(100);
    }
  }
  for (const side of ['UA', 'RU'] as const) {
    const x = s.sides[side];
    for (const k of ['pp', 'support', 'resilience', 'drones', 'missiles'] as const) {
      expect(Number.isFinite(x[k]), `${side}.${k}`).toBe(true);
      expect(x[k]).toBeGreaterThanOrEqual(0);
    }
    expect(x.resilience).toBeLessThanOrEqual(100);
  }
}

describe('початок гри', () => {
  it('ходить Україна, 4 накази, Білорусь нейтральна', () => {
    const s = fresh();
    expect(s.activeSide).toBe('UA');
    expect(s.ordersLeft).toBe(CFG.baseOrders);
    expect(s.regions.minsk.owner).toBe('BY');
    expect(s.regions.kyiv.owner).toBe('UA');
    expect(s.regions.crimea.owner).toBe('RU');
  });
});

describe('перекидання', () => {
  it('половина гарнізону переходить у сусідню область, сума зберігається', () => {
    const s = fresh();
    const before = totalTroops(s, 'UA');
    const a = s.regions.kyiv.troops;
    const b = s.regions.zhytomyr.troops;
    const r = applyOrder(s, { type: 'move', from: 'kyiv', to: 'zhytomyr', fraction: 0.5 });
    expect(r.ok).toBe(true);
    expect(s.regions.kyiv.troops).toBe(a - Math.floor(a * 0.5));
    expect(s.regions.zhytomyr.troops).toBe(b + Math.floor(a * 0.5));
    expect(totalTroops(s, 'UA')).toBe(before);
    expect(s.ordersLeft).toBe(CFG.baseOrders - 1);
  });

  it('далеке перекидання вимагає логістики', () => {
    const s = fresh();
    expect(applyOrder(s, { type: 'move', from: 'lviv', to: 'kyiv', fraction: 0.5 }).ok).toBe(false);
    s.sides.UA.techs.push('rail_logistics');
    invalidateMods(s);
    expect(applyOrder(s, { type: 'move', from: 'lviv', to: 'zhytomyr', fraction: 0.5 }).ok).toBe(false); // 3 кроки
    expect(applyOrder(s, { type: 'move', from: 'lviv', to: 'kyiv', fraction: 0.5 }).ok).toBe(false); // далеко
    expect(applyOrder(s, { type: 'move', from: 'lviv', to: 'khmelnytskyi', fraction: 0.5 }).ok).toBe(true); // 2 кроки
    expect(applyOrder(s, { type: 'move', from: 'lviv', to: 'rivne', fraction: 0.5 }).ok).toBe(true);
  });

  it('у чужу область перекидати не можна, наказів не вистачає після 4', () => {
    const s = fresh();
    expect(applyOrder(s, { type: 'move', from: 'kharkiv', to: 'luhansk', fraction: 0.5 }).ok).toBe(false);
    for (let i = 0; i < 4; i++) expect(applyOrder(s, { type: 'move', from: 'kyiv', to: 'zhytomyr', fraction: 0.1 }).ok).toBe(true);
    const r = applyOrder(s, { type: 'move', from: 'kyiv', to: 'zhytomyr', fraction: 0.1 });
    expect(r.ok).toBe(false);
  });

  it('прифронтове перекидання втрачає частку через мідл-страйк ворога', () => {
    const s = fresh();
    s.sides.RU.techs.push('fpv', 'midstrike');
    invalidateMods(s);
    const n = Math.floor(s.regions.poltava.troops * 0.5);
    const before = s.regions.kharkiv.troops;
    const r = applyOrder(s, { type: 'move', from: 'poltava', to: 'kharkiv', fraction: 0.5 });
    expect(r.ok).toBe(true);
    expect(r.lost).toBeGreaterThan(0);
    expect(s.regions.kharkiv.troops).toBe(before + n - (r.lost ?? 0));
  });
});

describe('атака', () => {
  it('не можна атакувати нейтральну Білорусь, глибокий тил РФ чи несусідню область', () => {
    const s = fresh();
    expect(applyOrder(s, { type: 'attack', from: 'chernihiv', to: 'homel', fraction: 0.5 }).ok).toBe(false);
    expect(applyOrder(s, { type: 'attack', from: 'kyiv', to: 'luhansk', fraction: 0.5 }).ok).toBe(false);
    expect(applyOrder(s, { type: 'attack', from: 'kharkiv', to: 'luhansk', fraction: 0.5 }).ok).toBe(true);
  });

  it('оцінка монотонна: більше нападників — більше втрат оборонців', () => {
    const s = fresh();
    const small = estimateBattle(s, 'kharkiv', 'luhansk', 3000);
    const big = estimateBattle(s, 'kharkiv', 'luhansk', 12000);
    expect(big.killsDefenders).toBeGreaterThan(small.killsDefenders);
    expect(big.ratio).toBeGreaterThan(small.ratio);
  });

  it('переважні сили захоплюють область; власник змінюється, війська не від’ємні', () => {
    const s = fresh();
    s.regions.kharkiv.troops = 90000;
    s.regions.luhansk.troops = 4000;
    const r = applyOrder(s, { type: 'attack', from: 'kharkiv', to: 'luhansk', fraction: 1 });
    expect(r.ok).toBe(true);
    expect(r.battle?.captured).toBe(true);
    expect(s.regions.luhansk.owner).toBe('UA');
    expect(s.regions.luhansk.troops).toBeGreaterThan(0);
    assertSane(s);
  });

  it('падіння Києва закінчує гру перемогою РФ', () => {
    const s = fresh();
    s.activeSide = 'RU';
    s.ordersLeft = 4;
    s.regions.kyiv.troops = 300;
    s.regions.chernihiv.owner = 'RU';
    s.regions.chernihiv.troops = 90000;
    const r = applyOrder(s, { type: 'attack', from: 'chernihiv', to: 'kyiv', fraction: 1 });
    expect(r.battle?.captured).toBe(true);
    expect(s.outcome?.winner).toBe('RU');
  });
});

describe('технології', () => {
  it('РЕБ противника послаблює FPV, а оптоволокно цей контрзахід обходить', () => {
    const s = fresh();
    s.sides.UA.techs = ['fpv'];
    s.sides.RU.techs = [];
    invalidateMods(s);
    const noCounter = computeMods(s, 'UA');
    s.sides.RU.techs = ['ew'];
    const withCounter = computeMods(s, 'UA');
    expect(withCounter.def).toBeLessThan(noCounter.def);
    s.sides.UA.techs = ['fpv', 'fiber_fpv'];
    const fiber = computeMods(s, 'UA');
    // внесок оптоволокна повністю зберігся
    expect(fiber.def - withCounter.def).toBeCloseTo(0.07, 5);
  });

  it('дослідження коштує виробництво, займає слот і завершується через N тижнів', () => {
    const s = fresh();
    s.sides.UA.pp = 100;
    const r = applyOrder(s, { type: 'research', tech: 'interceptors' });
    expect(r.ok).toBe(true);
    expect(s.sides.UA.pp).toBe(60);
    expect(s.ordersLeft).toBe(CFG.baseOrders); // безкоштовна дія
    applyOrder(s, { type: 'research', tech: 'ad_net' });
    expect(applyOrder(s, { type: 'research', tech: 'decoys' }).ok).toBe(false); // слотів два
    for (let i = 0; i < 4; i++) {
      applyOrder(s, { type: 'endTurn' });
      applyOrder(s, { type: 'endTurn' });
    }
    expect(s.sides.UA.techs).toContain('interceptors');
  });

  it('технологія іншої сторони недоступна', () => {
    const s = fresh();
    s.sides.UA.pp = 200;
    expect(applyOrder(s, { type: 'research', tech: 'glide_bombs' }).ok).toBe(false);
  });
});

describe('удари', () => {
  it('ППО зменшує виживання, запас списується, об’єкт пошкоджується', () => {
    const s = fresh();
    s.sides.UA.drones = 100;
    const t = { kind: 'facility' as const, region: 'ryazan', facility: 'ryazan_npz' };
    s.regions.ryazan.ad = 0;
    const f0 = forecastStrike(s, 'UA', t, 50, 0);
    s.regions.ryazan.ad = 3;
    const f3 = forecastStrike(s, 'UA', t, 50, 0);
    expect(f3.survDrone).toBeLessThan(f0.survDrone);
    const r = applyOrder(s, { type: 'strike', target: t, drones: 50, missiles: 0 });
    expect(r.ok).toBe(true);
    expect(s.sides.UA.drones).toBe(50);
    expect(s.regions.ryazan.facilities['ryazan_npz']).toBeLessThan(100);
    expect(s.regions.ryazan.facilities['ryazan_npz']).toBeGreaterThanOrEqual(0);
  });

  it('не можна вдарити поза дальністю або по своєму об’єкту', () => {
    const s = fresh();
    s.sides.UA.drones = 100;
    expect(applyOrder(s, { type: 'strike', target: { kind: 'facility', region: 'kyiv', facility: 'kyiv_tec' }, drones: 10, missiles: 0 }).ok).toBe(false);
    s.sides.UA.missiles = 10;
    // Татарстан далеко для ракет (900 км), але дрони (1700) долітають
    expect(applyOrder(s, { type: 'strike', target: { kind: 'facility', region: 'tatarstan', facility: 'alabuga' }, drones: 0, missiles: 5 }).ok).toBe(false);
  });

  it('енергосистема відповідає станції', () => {
    const s = fresh();
    expect(energyPct(s, 'UA')).toBe(100);
    s.regions.kyiv.facilities['kyiv_tec'] = 0;
    expect(energyPct(s, 'UA')).toBeLessThan(100);
  });
});

describe('хід і світ', () => {
  it('після ходу обох сторін настає новий тиждень, з’являються підкріплення й дохід', () => {
    const s = fresh();
    const troops = totalTroops(s, 'UA');
    const pp = s.sides.UA.pp;
    applyOrder(s, { type: 'endTurn' });
    expect(s.activeSide).toBe('RU');
    applyOrder(s, { type: 'endTurn' });
    expect(s.turn).toBe(1);
    expect(s.activeSide).toBe('UA');
    expect(totalTroops(s, 'UA')).toBeGreaterThan(troops);
    expect(s.sides.UA.pp).toBeGreaterThan(pp - 1);
  });

  it('Білорусь переходить до РФ при активації', () => {
    const s = fresh();
    activateBelarus(s);
    expect(s.belarus.active).toBe(true);
    expect(s.regions.homel.owner).toBe('RU');
    s.activeSide = 'UA';
    expect(applyOrder(s, { type: 'attack', from: 'chernihiv', to: 'homel', fraction: 0.5 }).ok).toBe(true);
  });

  it('нульова стійкість дає перемогу супротивнику', () => {
    const s = fresh();
    s.sides.UA.resilience = 0;
    applyOrder(s, { type: 'fortify', region: 'kyiv' });
    expect(s.outcome?.winner).toBe('RU');
    expect(applyOrder(s, { type: 'endTurn' }).ok).toBe(false); // гру завершено
  });
});

describe('детермінізм і цілісність', () => {
  it('однаковий seed і однакові рішення ШІ дають однаковий стан', () => {
    const a = createGame({ seed: 42, difficulty: 'hard', controllers: { UA: 'ai', RU: 'ai' } });
    const b = createGame({ seed: 42, difficulty: 'hard', controllers: { UA: 'ai', RU: 'ai' } });
    for (let i = 0; i < 12; i++) {
      aiPlayFullTurn(a, 'UA'); aiPlayFullTurn(a, 'RU');
      aiPlayFullTurn(b, 'UA'); aiPlayFullTurn(b, 'RU');
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('збереження/завантаження через JSON не змінює хід гри', () => {
    const a = createGame({ seed: 5, difficulty: 'hard', controllers: { UA: 'ai', RU: 'ai' } });
    for (let i = 0; i < 6; i++) { aiPlayFullTurn(a, 'UA'); aiPlayFullTurn(a, 'RU'); }
    const b: GameState = JSON.parse(JSON.stringify(a));
    for (let i = 0; i < 6; i++) {
      aiPlayFullTurn(a, 'UA'); aiPlayFullTurn(a, 'RU');
      aiPlayFullTurn(b, 'UA'); aiPlayFullTurn(b, 'RU');
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('ШІ проти ШІ: 60 ходів без NaN, від’ємних чисел і винятків', () => {
    const s = createGame({ seed: 99, difficulty: 'hard', controllers: { UA: 'ai', RU: 'ai' } });
    for (let i = 0; i < 60 && !s.outcome; i++) {
      aiPlayFullTurn(s, 'UA');
      aiPlayFullTurn(s, 'RU');
      assertSane(s);
    }
  });
});
