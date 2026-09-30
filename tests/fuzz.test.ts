import { describe, expect, it } from 'vitest';
import { applyOrder } from '../src/engine/orders';
import { createGame } from '../src/engine/scenario';
import { nextRandom } from '../src/engine/rng';
import { ALL_REGION_IDS, FACILITY_BY_ID, neighborsOf } from '../src/engine/selectors';
import { OPS } from '../src/engine/ops';
import { TECHS } from '../src/engine/techs';
import type { GameState, Order } from '../src/engine/types';

// «мавпа»: сипемо випадкові (часто хибні) накази й перевіряємо, що рушій не падає
// й інваріанти (числа скінченні, війська ≥ 0, hp 0..100) не порушуються.

const FACS = Object.keys(FACILITY_BY_ID);
function rnd(s: GameState, n: number): number {
  return Math.floor(nextRandom(s) * n);
}
function randomOrder(s: GameState): Order {
  const a = ALL_REGION_IDS[rnd(s, ALL_REGION_IDS.length)];
  const nb = neighborsOf(a);
  const b = nb.length && rnd(s, 10) < 8 ? nb[rnd(s, nb.length)] : ALL_REGION_IDS[rnd(s, ALL_REGION_IDS.length)];
  const f = 0.05 + nextRandom(s) * 0.95;
  switch (rnd(s, 11)) {
    case 0:
    case 1:
      return { type: 'move', from: a, to: b, fraction: f };
    case 2:
    case 3:
    case 4:
      return { type: 'attack', from: a, to: b, fraction: f };
    case 5: {
      const fid = FACS[rnd(s, FACS.length)];
      return { type: 'strike', target: { kind: 'facility', region: FACILITY_BY_ID[fid].region, facility: fid }, drones: rnd(s, 60), missiles: rnd(s, 6) };
    }
    case 6:
      return { type: 'research', tech: TECHS[rnd(s, TECHS.length)].id };
    case 7:
      return { type: 'startOp', op: OPS[rnd(s, OPS.length)].id, target: nextRandom(s) < 0.5 ? a : undefined };
    case 8:
      return { type: 'deployAD', region: a };
    case 9:
      return { type: 'fortify', region: a };
    default:
      return { type: 'policy', mobilization: rnd(s, 4), allocDrones: rnd(s, 11) * 5, allocMissiles: rnd(s, 11) * 5 };
  }
}

function check(s: GameState) {
  for (const id of ALL_REGION_IDS) {
    const r = s.regions[id];
    expect(Number.isFinite(r.troops) && r.troops >= 0, `${id}.troops=${r.troops}`).toBe(true);
    expect(r.ad >= 0 && r.ad <= 4 && r.fort >= 0 && r.fort <= 3, id).toBe(true);
    for (const [fid, hp] of Object.entries(r.facilities)) expect(hp >= 0 && hp <= 100, `${fid}=${hp}`).toBe(true);
  }
  for (const side of ['UA', 'RU'] as const) {
    const x = s.sides[side];
    for (const v of [x.pp, x.support, x.resilience, x.drones, x.missiles, x.energy]) expect(Number.isFinite(v) && v >= 0).toBe(true);
    expect(x.resilience <= 100 && x.support <= 100).toBe(true);
  }
}

describe('фаззинг наказів', () => {
  for (let seed = 1; seed <= 12; seed++) {
    it(`випадкові накази, seed ${seed}`, () => {
      const s = createGame({ seed, difficulty: 'hard', controllers: { UA: 'human', RU: 'human' } });
      for (let i = 0; i < 400 && !s.outcome; i++) {
        const o = randomOrder(s);
        // часто завершуємо хід, щоб проходили тижні
        applyOrder(s, nextRandom(s) < 0.12 ? { type: 'endTurn' } : o);
        if (i % 25 === 0) check(s);
      }
      check(s);
    });
  }
});
