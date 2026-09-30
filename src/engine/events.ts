// Випадкові події й сатиричний рядок новин.

import { pushLog, pushTicker } from './log';
import { chance, nextRandom, pickOne } from './rng';
import { ALL_REGION_IDS, REGION_BY_ID, facilitiesOfType, invalidateMods } from './selectors';
import type { GameState } from './types';

interface EventDef {
  id: string;
  weight: (s: GameState) => number;
  run: (s: GameState) => string | null;
}

const log = (s: GameState, text: string, region?: string) => pushLog(s, { side: 'world', kind: 'event', text, region });

const EVENTS: EventDef[] = [
  {
    id: 'aid_package',
    weight: (s) => 0.9 * (s.sides.UA.support / 60),
    run: (s) => {
      const gain = 14 + Math.round(nextRandom(s) * 10);
      s.sides.UA.pp += gain;
      s.sides.UA.support = Math.min(100, s.sides.UA.support + 2);
      log(s, `Партнери ухвалили новий пакет допомоги: +${gain} виробництва.`);
      return 'Новий пакет допомоги пройшов усі погодження лише з третьої спроби.';
    },
  },
  {
    id: 'western_air_defense',
    weight: (s) => 0.5 * (s.sides.UA.support / 60),
    run: (s) => {
      const cand = ALL_REGION_IDS.filter((id) => s.regions[id].owner === 'UA' && s.regions[id].ad < 3 && REGION_BY_ID[id].pop >= 5);
      if (!cand.length) return null;
      const id = pickOne(s, cand);
      s.regions[id].ad += 1;
      log(s, `Партнери передали ППО: рівень захисту області «${REGION_BY_ID[id].name}» зріс до ${s.regions[id].ad}.`, id);
      return null;
    },
  },
  {
    id: 'sanctions',
    weight: () => 0.7,
    run: (s) => {
      s.sides.RU.support = Math.max(25, s.sides.RU.support - 7);
      log(s, 'Новий раунд санкцій проти Росії: нафтові доходи просідають.');
      return 'Ухвалено новий пакет санкцій. Кремль запевняє, що нічого не відчув.';
    },
  },
  {
    id: 'refinery_fire',
    weight: () => 0.8,
    run: (s) => {
      const list = facilitiesOfType(s, 'RU', 'refinery').filter((f) => f.hp > 30);
      if (!list.length) return null;
      const f = pickOne(s, list);
      s.regions[f.region].facilities[f.def.id] = Math.max(0, f.hp - 22);
      log(s, `Раптова пожежа на об’єкті «${f.def.name}»: −22% потужності. Причина, як завжди, — необережне куріння.`, f.region);
      return `«${f.def.name}»: сталася пожежа з невідомих причин.`;
    },
  },
  {
    id: 'partisans',
    weight: () => 0.8,
    run: (s) => {
      const cand = ALL_REGION_IDS.filter((id) => s.regions[id].owner === 'RU' && REGION_BY_ID[id].country !== 'RU');
      if (!cand.length) return null;
      const id = pickOne(s, cand);
      s.regions[id].railCut = Math.max(s.regions[id].railCut, 3);
      log(s, `Партизани підірвали колію в області «${REGION_BY_ID[id].name}»: на 3 тижні ускладнено перекидання.`, id);
      return null;
    },
  },
  {
    id: 'ru_mobilization_wave',
    weight: () => 0.6,
    run: (s) => {
      const id = s.regions.moscow.owner === 'RU' ? 'moscow' : 'tula';
      const n = 4500 + Math.round(nextRandom(s) * 3500);
      s.regions[id].troops += n;
      s.sides.RU.resilience = Math.max(0, s.sides.RU.resilience - 0.8);
      log(s, `У Росії оголошено «добровільний набір»: +${n} бійців у резерв, стійкість трохи знизилась.`);
      return 'Росіяни масово «добровільно» записуються до війська.';
    },
  },
  {
    id: 'ua_volunteers',
    weight: () => 0.6,
    run: (s) => {
      const id = s.regions.kyiv.owner === 'UA' ? 'kyiv' : 'lviv';
      const n = 2500 + Math.round(nextRandom(s) * 2000);
      s.regions[id].troops += n;
      log(s, `Хвиля добровольців: +${n} бійців у резерв (${REGION_BY_ID[id].name}).`);
      return null;
    },
  },
  {
    id: 'shell_shortage',
    weight: (s) => (s.sides.UA.support < 45 ? 1.1 : 0.15),
    run: (s) => {
      s.sides.UA.effects.push({ id: `shells-${s.turn}`, key: 'atk', value: -0.05, turnsLeft: 4, label: 'Снарядний голод' });
      invalidateMods(s);
      log(s, 'Затримка постачань снарядів: сила атаки України −5% на 4 тижні.');
      return null;
    },
  },
  {
    id: 'belarus_drills',
    weight: (s) => (s.belarus.active ? 0 : 0.8),
    run: (s) => {
      s.belarus.tension = Math.min(99, s.belarus.tension + 7);
      log(s, 'Білорусь оголосила раптові навчання біля українського кордону: напруга росте.');
      return 'У Мінську заявили, що лише «перевіряють готовність» уже в п’ятий раз.';
    },
  },
  {
    id: 'grid_storm',
    weight: () => 0.5,
    run: (s) => {
      const side = chance(s, 0.5) ? 'UA' : 'RU';
      const list = facilitiesOfType(s, side, 'power_plant').filter((f) => f.hp > 12);
      if (!list.length) return null;
      const f = pickOne(s, list);
      s.regions[f.region].facilities[f.def.id] = Math.max(0, f.hp - 12);
      log(s, `Негода пошкодила лінії електропередач біля «${f.def.name}» (−12%).`, f.region);
      return null;
    },
  },
];

export function rollEvents(state: GameState): void {
  // до двох подій на тиждень, щоб світ не здавався порожнім і не був надто галасливим
  for (let i = 0; i < 2; i++) {
    if (!chance(state, 0.45)) continue;
    const weights = EVENTS.map((e) => Math.max(0, e.weight(state)));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return;
    let r = nextRandom(state) * total;
    let idx = 0;
    for (; idx < EVENTS.length; idx++) {
      r -= weights[idx];
      if (r <= 0) break;
    }
    const ev = EVENTS[Math.min(idx, EVENTS.length - 1)];
    const line = ev.run(state);
    if (line) pushTicker(state, line);
  }
  // звичайний шматочок «новин» для атмосфери
  if (chance(state, 0.55)) pushTicker(state, pickOne(state, FLAVOR));
}

export const FLAVOR: readonly string[] = [
  'Міноборони РФ повідомило, що знищило ще 300 українських дронів. Ті, що долетіли, вважаються «птахами».',
  'Аналітики підрахували: на обслуговування «скреп» російська влада витратила більше, ніж на ремонт доріг.',
  'У московському метро відкрили нову станцію. Вона чудово підходить для сховища від тривоги.',
  'Експерти: «лінія дронів» тепер ширша за деякі європейські країни.',
  'Український фермер випадково збив «шахед» граблями. Нагороду вручать після жнив.',
  'Російські ЗМІ повідомили про 14-те «остаточне» знищення складу боєприпасів у Бєлгородській області.',
  'Кремль пояснив чергове відключення світла «сезонним оновленням мережі».',
  'Волонтери зібрали рекордну суму за ніч. Учасники збору обурені, що не дали донатити ще.',
  'Нова пропозиція Мінська: «нейтралітет» із досвідчених військових на кордоні.',
  'На фронті запровадили вихідний для дронів. Вони не зрозуміли і вилетіли на роботу.',
  'Міністерство правди повідомило, що світ не може сказати, що війни не було.',
  'Пригоди «паралельного імпорту»: офіцер купив запчастини у власного ж постачальника дронів.',
  'У Європі знову шукають гроші. Цього разу — у кишенях одне одного.',
  'Російське ППО успішно збило 40 власних дронів. Доповідь про «успішні навчання» вже готова.',
  'Хмарочос у Москві сьогодні не працює через «технічні роботи». Повітря теж, фактично.',
  'Російські аналітики: «Українська ППО вичерпана». Третій місяць поспіль. Нахабно не вичерпується.',
];
