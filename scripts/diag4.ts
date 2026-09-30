import { createGame } from '../src/engine/scenario';
import { aiPlayFullTurn } from '../src/engine/ai';
const seed = Number(process.argv[2] ?? 1001);
const s = createGame({ seed, difficulty: 'hard', controllers: { UA: 'ai', RU: 'ai' } });
while (!s.outcome && s.turn < 160) { aiPlayFullTurn(s, 'UA'); aiPlayFullTurn(s, 'RU'); }
for (const l of s.log) if (l.kind === 'capture' || l.kind === 'tech' && /Завершено/.test(l.text)) console.log(`[T${l.turn} ${l.side}] ${l.text}`);
const att = s.log.filter((l) => l.kind === 'attack').length;
const strikes = s.log.filter((l) => l.kind === 'strike').length;
const moves = s.log.filter((l) => l.kind === 'move').length;
console.log({ att, strikes, moves });
console.log(s.outcome);
