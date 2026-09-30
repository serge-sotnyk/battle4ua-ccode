import { createGame } from '../src/engine/scenario';
import { aiPlayFullTurn, aiChooseOrder } from '../src/engine/ai';
import { estimateBattle } from '../src/engine/combat';
import { attackError } from '../src/engine/orders';
import { ALL_REGION_IDS, neighborsOf, isFront, adjacentEnemyTroops } from '../src/engine/selectors';
const s = createGame({ seed: 1001, difficulty: 'hard', controllers: { UA: 'ai', RU: 'ai' } });
for (let t = 0; t < 30; t++) { aiPlayFullTurn(s, 'UA'); aiPlayFullTurn(s, 'RU'); }
console.log('turn', s.turn, 'active', s.activeSide);
for (const from of ALL_REGION_IDS) {
  const r = s.regions[from];
  if (r.owner === 'BY' || !isFront(s, from)) continue;
  const row: string[] = [];
  for (const to of neighborsOf(from)) {
    if (attackError(s, r.owner as any, from, to)) continue;
    const est = estimateBattle(s, from, to, Math.floor(r.troops * 0.8));
    row.push(`${to}(${s.regions[to].troops}) r=${est.ratio.toFixed(2)}`);
  }
  console.log(`${r.owner} ${from.padEnd(15)} ${String(r.troops).padStart(6)} advEnemy ${adjacentEnemyTroops(s, from)}  -> ${row.join(' | ')}`);
}
console.log(aiChooseOrder(s, 'UA'));
