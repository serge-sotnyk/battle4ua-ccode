import { createGame } from '../src/engine/scenario';
import { aiPlayFullTurn } from '../src/engine/ai';
import { estimateBattle } from '../src/engine/combat';
import { attackError } from '../src/engine/orders';
import { ALL_REGION_IDS, neighborsOf } from '../src/engine/selectors';

const s = createGame({ seed: 1000, difficulty: 'hard', controllers: { UA: 'ai', RU: 'ai' } });
for (let t = 0; t < 12; t++) { aiPlayFullTurn(s, 'UA'); aiPlayFullTurn(s, 'RU'); }
for (const from of ALL_REGION_IDS) {
  const r = s.regions[from];
  if (r.owner === 'BY') continue;
  for (const to of neighborsOf(from)) {
    if (attackError(s, r.owner as any, from, to)) continue;
    const est = estimateBattle(s, from, to, Math.floor(r.troops * 0.9));
    console.log(`${r.owner} ${from.padEnd(15)}(${String(r.troops).padStart(6)}) -> ${to.padEnd(15)}(${String(s.regions[to].troops).padStart(6)}) ratio ${est.ratio.toFixed(2)} kD ${Math.round(est.killsDefenders)} kA ${Math.round(est.killsAttackers)} cap ${est.captured}`);
  }
}
