// Симуляція «ШІ проти ШІ» для підбору балансу.
//   npm run sim -- [кількість партій] [--hard] [--verbose]
import { createGame } from '../src/engine/scenario';
import { aiPlayFullTurn } from '../src/engine/ai';
import { CFG } from '../src/engine/config';
import { ALL_REGION_IDS, REGION_BY_ID, formatDate, getMods, invalidateMods, totalTroops } from '../src/engine/selectors';
import type { GameState } from '../src/engine/types';

const args = process.argv.slice(2);
const n = Number(args.find((a) => /^\d+$/.test(a)) ?? 6);
const verbose = args.includes('--verbose');
// --normal: УА керує «людина» (тут — той самий ШІ), а РФ отримує штраф звичайного режиму
const normal = args.includes('--normal');
const scenario = args.includes('--feb') ? 'feb-2022' : 'oct-2026';
// --ru: РФ керує «людина» (той самий ШІ), УА — ШІ з поблажками складності
const ruHuman = args.includes('--ru');
const diffArg = (args.find((a) => a.startsWith('--diff=')) ?? '--diff=').slice(7);

function summary(s: GameState): string {
  let uaReg = 0;
  let ruInUa = 0;
  for (const id of ALL_REGION_IDS) {
    if (REGION_BY_ID[id].country === 'UA') {
      if (s.regions[id].owner === 'UA') uaReg++;
      else ruInUa++;
    }
  }
  const t = s.sides;
  return `T${String(s.turn).padStart(3)} ${formatDate(s).padEnd(18)} UA:${String(Math.round(totalTroops(s, 'UA') / 1000)).padStart(3)}k res ${t.UA.resilience.toFixed(0).padStart(3)} pp ${t.UA.pp.toFixed(0).padStart(3)} | RU:${String(Math.round(totalTroops(s, 'RU') / 1000)).padStart(3)}k res ${t.RU.resilience.toFixed(0).padStart(3)} pp ${t.RU.pp.toFixed(0).padStart(3)} | UA-земля ${uaReg}/${uaReg + ruInUa} BY:${s.belarus.active ? 'так' : s.belarus.tension.toFixed(0)}`;
}

const results: Record<string, number> = {};
let totalTurns = 0;
for (let i = 0; i < n; i++) {
  const s = createGame({ seed: 1000 + i, scenario, difficulty: (diffArg || (normal ? 'normal' : 'hard')) as 'easy' | 'normal' | 'hard', controllers: ruHuman ? { UA: 'ai', RU: 'human' } : { UA: normal ? 'human' : 'ai', RU: 'ai' } });
  if (args.includes('--boost')) {
    // «умілий гравець»: +2 наказів на тиждень
    s.sides.UA.effects.push({ id: 'boost', key: 'orders', value: 2, turnsLeft: 9999, label: 'boost' });
    invalidateMods(s);
    s.ordersLeft = getMods(s, 'UA').orders;
  }
  const t0 = Date.now();
  while (!s.outcome) {
    aiPlayFullTurn(s, 'UA');
    if (s.outcome) break;
    aiPlayFullTurn(s, 'RU');
    if (verbose && s.turn % 10 === 0 && s.activeSide === 'UA') console.log(summary(s));
    if (s.turn > CFG.maxTurns + 5) break;
  }
  const o = s.outcome;
  const caps = s.log.filter((l) => l.kind === 'capture').length;
  const key = o ? `${o.winner}: ${o.reason.slice(0, 40)}` : 'немає';
  results[key] = (results[key] ?? 0) + 1;
  totalTurns += s.turn;
  console.log(`#${i} seed ${1000 + i}: ${o?.winner} на ході ${s.turn} (${Date.now() - t0} мс), захоплень ${caps}, втрати УА ${Math.round(s.sides.UA.casualties / 1000)}k РФ ${Math.round(s.sides.RU.casualties / 1000)}k. ${summary(s)}`);
}
console.log('\nПідсумок:', results, 'середня тривалість', (totalTurns / n).toFixed(1));
