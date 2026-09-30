import { createGame } from '../src/engine/scenario';
import { aiPlayFullTurn } from '../src/engine/ai';
import { CFG } from '../src/engine/config';
import { energyPct, oilFactor, seasonEnergyMod, totalTroops } from '../src/engine/selectors';

const s = createGame({ seed: 1000, difficulty: 'hard', controllers: { UA: 'ai', RU: 'ai' } });
for (let t = 0; t < 40; t++) {
  const u = s.sides.UA;
  const cas = u.weekCasualties; // до обнулення це накопичено за попередній тиждень — тут дивимось наприкінці ходу
  aiPlayFullTurn(s, 'UA');
  aiPlayFullTurn(s, 'RU');
  const R = CFG.resilience;
  const parts = {
    regen: u.resilience < 100 ? R.regen : 0,
    energy: -((100 - energyPct(s, 'UA')) / 100) * R.energyDrain * seasonEnergyMod(s.turn - 1),
    mob: -CFG.recruit.mobilizationResDrain[u.mobilization],
  };
  if (t % 3 === 0) console.log(`T${s.turn} res ${u.resilience.toFixed(1)} en ${energyPct(s,'UA')} mob ${u.mobilization} ${JSON.stringify(Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,+v.toFixed(2)])))} totCas ${u.casualties} kills ${u.kills} troops UA ${totalTroops(s,'UA')} RU ${totalTroops(s,'RU')} oil ${oilFactor(s).toFixed(2)} RUres ${s.sides.RU.resilience.toFixed(1)} ${cas}`);
}
