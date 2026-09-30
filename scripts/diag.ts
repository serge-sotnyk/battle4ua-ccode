import { createGame } from '../src/engine/scenario';
import { aiChooseOrder } from '../src/engine/ai';
import { applyOrder } from '../src/engine/orders';
import { energyPct, incomeBreakdown, totalTroops } from '../src/engine/selectors';

const s = createGame({ seed: 1000, difficulty: 'hard', controllers: { UA: 'ai', RU: 'ai' } });
for (let t = 0; t < 14; t++) {
  const before = { ua: { ...s.sides.UA }, ru: { ...s.sides.RU } };
  const counts: Record<string, number> = {};
  for (const side of ['UA', 'RU'] as const) {
    let guard = 0;
    while (s.activeSide === side && !s.outcome && guard++ < 20) {
      const o = aiChooseOrder(s, side);
      const key = side + ':' + o.type;
      counts[key] = (counts[key] ?? 0) + 1;
      applyOrder(s, o);
      if (o.type === 'endTurn') break;
    }
  }
  const u = s.sides.UA, r = s.sides.RU;
  console.log(`T${s.turn} UA res ${u.resilience.toFixed(1)} en ${energyPct(s, 'UA')} mob ${u.mobilization} cas ${u.casualties - before.ua.casualties} inc ${incomeBreakdown(s,'UA').total.toFixed(1)} troops ${totalTroops(s,'UA')} dr ${u.drones} ms ${u.missiles} | RU res ${r.resilience.toFixed(1)} en ${energyPct(s,'RU')} cas ${r.casualties-before.ru.casualties} troops ${totalTroops(s,'RU')} dr ${r.drones} ms ${r.missiles}`, JSON.stringify(counts));
}
console.log(s.log.slice(-40).map((l) => `[${l.turn}${l.side}] ${l.text}`).join('\n'));
