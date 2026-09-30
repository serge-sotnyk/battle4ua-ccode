import { describe, expect, it } from 'vitest';
import { getMap, neighborsOf, ALL_REGION_IDS, REGION_BY_ID } from '../src/engine/selectors';
import { createGame } from '../src/engine/scenario';

describe('карта', () => {
  const map = getMap();

  it('кожна область має полігон із додатною площею', () => {
    for (const id of ALL_REGION_IDS) {
      expect(map.regions[id], id).toBeTruthy();
      expect(map.regions[id].ring.length, id).toBeGreaterThan(5);
      expect(map.regions[id].area, id).toBeGreaterThan(200);
    }
  });

  it('суміжність симетрична та не має самопетель', () => {
    for (const a of ALL_REGION_IDS) {
      expect(neighborsOf(a)).not.toContain(a);
      for (const b of neighborsOf(a)) expect(neighborsOf(b), `${b}→${a}`).toContain(a);
    }
  });

  it('граф зв’язний', () => {
    const seen = new Set<string>([ALL_REGION_IDS[0]]);
    const q = [ALL_REGION_IDS[0]];
    while (q.length) {
      const c = q.pop()!;
      for (const n of neighborsOf(c)) if (!seen.has(n)) { seen.add(n); q.push(n); }
    }
    expect(seen.size).toBe(ALL_REGION_IDS.length);
  });

  it('ключові сусідства на місці', () => {
    const must: Array<[string, string]> = [
      ['kyiv', 'zhytomyr'], ['kyiv', 'chernihiv'], ['kharkiv', 'belgorod'], ['kharkiv', 'luhansk'],
      ['chernihiv', 'homel'], ['sumy', 'kursk'], ['crimea', 'kherson_l'], ['crimea', 'krasnodar'],
      ['kherson_r', 'kherson_l'], ['lviv', 'volyn'], ['volyn', 'brest'], ['rostov', 'donetsk_s'],
    ];
    for (const [a, b] of must) expect(neighborsOf(a), `${a}-${b}`).toContain(b);
  });

  it('Москва не межує з Україною, Крим з’єднаний з материком мостом', () => {
    for (const n of neighborsOf('moscow')) expect(REGION_BY_ID[n].country).toBe('RU');
    const e = map.edges.find((x) => (x.a === 'crimea' && x.b === 'krasnodar') || (x.b === 'crimea' && x.a === 'krasnodar'));
    expect(e?.kind).toBe('bridge');
  });

  it('стартовий сценарій містить дані для кожної області', () => {
    const g = createGame();
    expect(Object.keys(g.regions).length).toBe(ALL_REGION_IDS.length);
  });
});
