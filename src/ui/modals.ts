// Модальні вікна: технології, політика, операції, удари, правила, нова гра, кінець гри.

import { CFG } from '../engine/config';
import { forecastStrike, strikeRanges } from '../engine/strikes';
import {
  FACILITY_BY_ID,
  REGION_BY_ID,
  getMods,
  incomeBreakdown,
  other,
  totalTroops,
} from '../engine/selectors';
import { OPS, opAvailability, validTargets } from '../engine/ops';
import { TECHS, activeCounters, TECH_BY_ID } from '../engine/techs';
import { territoryScore } from '../engine/victory';
import type { ModKey, Side, TechDef, TechEffect } from '../engine/types';
import { FAC_EFFECT, FAC_ICON, FAC_NAME, SIDE_NAME, esc, fmt1, fmtK, fmtN } from './format';
import type { GameStore } from './store';

// ---------------------------------------------------------------- менеджер вікон

interface Current {
  id: string;
  render: () => string;
  mount?: (root: HTMLElement) => void;
  closable: boolean;
  wide?: 'narrow' | 'mid' | '';
}

export class Modals {
  private root: HTMLElement;
  private cur: Current | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.cur?.closable) this.close();
    });
    this.root.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).classList.contains('veil') && this.cur?.closable) this.close();
    });
  }

  get openId(): string | null {
    return this.cur?.id ?? null;
  }

  open(id: string, render: () => string, opts: { closable?: boolean; wide?: 'narrow' | 'mid' | ''; mount?: (root: HTMLElement) => void } = {}): void {
    this.cur = { id, render, mount: opts.mount, closable: opts.closable ?? true, wide: opts.wide ?? '' };
    this.paint(0);
  }

  refresh(): void {
    if (!this.cur) return;
    const scroller = this.root.querySelector('.modal') as HTMLElement | null;
    this.paint(scroller?.scrollTop ?? 0);
  }

  private paint(scroll: number): void {
    const c = this.cur!;
    this.root.innerHTML = `<div class="veil"><div class="modal ${c.wide ?? ''}">${c.closable ? '<button class="tbtn close" data-act="close-modal">✕</button>' : ''}${c.render()}</div></div>`;
    const modal = this.root.querySelector('.modal') as HTMLElement;
    modal.scrollTop = scroll;
    c.mount?.(this.root);
  }

  close(): void {
    this.cur = null;
    this.root.innerHTML = '';
  }
}

// ---------------------------------------------------------------- технології

const EFFECT_LABEL: Partial<Record<ModKey, (v: number) => string>> = {
  atk: (v) => `атака ${sgnPct(v)}`,
  def: (v) => `оборона ${sgnPct(v)}`,
  ownLoss: (v) => `власні втрати ${sgnPct(v)}`,
  interdiction: (v) => `${Math.round(v * 100)}% підкріплень ворога гине дорогою до фронту`,
  moveRange: (v) => `перекидання на ${v} обл. далі`,
  orders: (v) => `${v > 0 ? '+' : ''}${v} наказ на тиждень`,
  droneYield: (v) => `дронів за ту саму ціну ${sgnPct(v)}`,
  droneCost: (v) => `вартість дронів ${sgnPct(v)}`,
  missileCost: (v) => `вартість ракет ${sgnPct(v)}`,
  penDrone: (v) => `прорив ППО дронами ${sgnPct(v)}`,
  penMissile: (v) => `прорив ППО ракетами ${sgnPct(v)}`,
  adDrone: (v) => `ППО проти дронів ${sgnPct(v)}`,
  adMissile: (v) => `ППО проти ракет ${sgnPct(v)}`,
  rangeMul: (v) => `дальність ударів ${sgnPct(v)}`,
  ppMul: (v) => `виробництво ${sgnPct(v)}`,
  aidMul: (v) => `допомога партнерів ${sgnPct(v)}`,
  oilMul: (v) => `нафтові доходи ${sgnPct(v)}`,
  energyResist: (v) => `стійкість енергосистеми ${sgnPct(v)}`,
  recruit: (v) => `приплив бійців ${sgnPct(v)}`,
  intel: (v) => `розвідка +${v}`,
  seaEcon: (v) => `морська економіка ${sgnPct(v)}`,
  killBonus: () => `бали за знищених ворогів → виробництво`,
  repair: (v) => `ремонт об’єктів ${sgnPct(v)}`,
  airSupport: (v) => `авіаційна підтримка ${sgnPct(v)}`,
  opRisk: (v) => `ризик викриття операцій ${sgnPct(v)}`,
  strikeDamage: (v) => `шкода від ударів ${sgnPct(v)}`,
  seaStrike: (v) => `удари по портах і мостах ${sgnPct(v)}`,
};

function sgnPct(v: number): string {
  const p = Math.round(v * 100);
  return `${p > 0 ? '+' : ''}${p}%`;
}

function effectsText(effects: TechEffect[]): string {
  return effects
    .map((e) => (EFFECT_LABEL[e.key] ? EFFECT_LABEL[e.key]!(e.add) : `${e.key} ${e.add}`))
    .join(' · ');
}

const BRANCH_NAME: Record<TechDef['branch'], string> = {
  front: 'Фронт і наземні дії',
  strike: 'Далекобійні удари та ППО',
  econ: 'Економіка, логістика, розвідка',
  special: 'Спеціальні дії',
};

export function techModal(store: GameStore): string {
  const s = store.state;
  const side = s.activeSide;
  const sd = s.sides[side];
  const slotsFree = CFG.research.slots - sd.research.length;
  const techs = TECHS.filter((t) => t.side === 'both' || t.side === side);
  const branches: TechDef['branch'][] = ['front', 'strike', 'econ', 'special'];
  const cards = branches
    .map((b) => {
      const list = techs.filter((t) => t.branch === b);
      const html = list
        .map((t) => {
          const done = sd.techs.includes(t.id);
          const job = sd.research.find((j) => j.tech === t.id);
          const missing = t.requires.filter((r) => !sd.techs.includes(r));
          const can = !done && !job && !missing.length && slotsFree > 0 && sd.pp >= t.cost && store.isHumanTurn();
          const counters = (t.counters ?? []).map((c) => `${TECH_BY_ID[c.tech].name} (−${Math.round(c.factor * 100)}%)`).join(', ');
          const hampered = done
            ? activeCounters(s, side, t.id)
                .filter((c) => !c.ignored)
                .map((c) => `${TECH_BY_ID[c.by].name} (−${Math.round(c.factor * 100)}%)`)
            : [];
          const ignores = t.ignores?.length ? `Обходить: ${t.ignores.map((i) => TECH_BY_ID[i].name).join(', ')}` : '';
          return `<div class="tech ${done ? 'done' : job ? 'busy' : missing.length ? 'locked' : ''}">
            <div class="nm">${t.icon} ${esc(t.name)}</div>
            <div class="ds">${esc(t.desc)}</div>
            <div class="meta"><span>${esc(effectsText(t.effects) || 'відкриває можливості')}</span></div>
            ${counters ? `<div class="meta"><span>Послаблює у ворога: ${esc(counters)}</span></div>` : ''}
            ${ignores ? `<div class="good">${esc(ignores)}</div>` : ''}
            ${hampered.length ? `<div class="warn">Послаблено ворожими: ${esc(hampered.join(', '))}</div>` : ''}
            <div class="meta"><span>Ціна: ${t.cost}</span><span>Час: ${t.turns} тиж.</span></div>
            ${
              done
                ? '<div class="good">✔ Досліджено</div>'
                : job
                  ? `<div class="warn">⏳ Досліджується: ще ${job.turnsLeft} тиж. <button data-act="cancel-research" data-tech="${t.id}" style="padding:1px 8px">скасувати</button></div>`
                  : missing.length
                    ? `<div class="meta">Потрібно: ${missing.map((m) => esc(TECH_BY_ID[m].name)).join(', ')}</div>`
                    : `<button data-act="research" data-tech="${t.id}" ${can ? '' : 'disabled'}>Дослідити</button>`
            }
          </div>`;
        })
        .join('');
      return `<div class="branch">${BRANCH_NAME[b]}</div><div class="tech-cols">${html}</div>`;
    })
    .join('');
  const foe = other(side);
  const intel = getMods(s, side).intel;
  const foeTechs = s.sides[foe].techs.filter((t) => TECH_BY_ID[t]);
  const foeList = intel >= 1
    ? foeTechs.map((t) => `${TECH_BY_ID[t].icon} ${esc(TECH_BY_ID[t].name)}`).join(' · ')
    : foeTechs.slice(0, 5).map((t) => `${TECH_BY_ID[t].icon} ${esc(TECH_BY_ID[t].name)}`).join(' · ') + ' …';
  return `
    <h2>Технології</h2>
    <p class="sub">Виробництво: <b>${sd.pp.toFixed(0)}</b> · слотів дослідження вільно: <b>${slotsFree}</b> з ${CFG.research.slots}. Технології мають контрзаходи: нова зброя працює, доки ворог не знайде відповідь.</p>
    ${cards}
    <div class="branch">Що відомо про супротивника</div>
    <p class="mini">${foeList || '—'}</p>`;
}

// ---------------------------------------------------------------- політика

export function policyModal(store: GameStore): string {
  const s = store.state;
  const side = s.activeSide;
  const sd = s.sides[side];
  const mods = getMods(s, side);
  const inc = incomeBreakdown(s, side);
  const mobs = [
    ['Мінімальна', 'Менше бійців на тиждень (×0.55), стійкість потроху відновлюється.'],
    ['Звичайна', 'Базовий приплив бійців, без штрафів.'],
    ['Посилена', 'Приплив ×1.35, але стійкість падає на 0.25 щотижня.'],
    ['Повна', 'Приплив ×1.7, стійкість падає на 0.65 щотижня.'],
  ];
  const dronesEst = ((inc.total * sd.allocDrones) / 100 / ((CFG.munitions.droneCost * mods.droneCost) / mods.droneYield)) * 0.9;
  const missEst = ((inc.total * sd.allocMissiles) / 100 / (CFG.munitions.missileCost * mods.missileCost)) * 0.9;
  return `
    <h2>Політика</h2>
    <p class="sub">Рішення, що діють щотижня. Безкоштовні — не витрачають наказів.</p>
    <div class="branch">Мобілізація</div>
    <div class="choice">${mobs
      .map(([n, d], i) => `<button data-act="mobilization" data-v="${i}" class="${sd.mobilization === i ? 'on' : ''}">${n}<small>${d}</small></button>`)
      .join('')}</div>
    <div class="branch">Розподіл виробництва на ударні засоби</div>
    <p class="mini">Частка тижневого доходу (${fmt1(inc.total)}), яка автоматично йде на запас. Решта накопичується для досліджень, ППО та операцій.</p>
    <div class="field"><label>🛩 Дрони: <b id="lbl-d">${sd.allocDrones}%</b> (≈ ${fmt1(dronesEst)}/тиж, запас ${sd.drones}/${CFG.munitions.droneStockCap})</label>
      <input type="range" min="0" max="100" step="5" value="${sd.allocDrones}" data-act="alloc" data-kind="drones"></div>
    <div class="field"><label>🚀 Ракети: <b id="lbl-m">${sd.allocMissiles}%</b> (≈ ${fmt1(missEst)}/тиж, запас ${sd.missiles}/${CFG.munitions.missileStockCap})</label>
      <input type="range" min="0" max="100" step="5" value="${sd.allocMissiles}" data-act="alloc" data-kind="missiles"></div>
    <p class="mini">Решта на тиждень: ≈ ${Math.max(0, 100 - sd.allocDrones - sd.allocMissiles)}% — у банк виробництва.</p>`;
}

// ---------------------------------------------------------------- спецоперації

export function opsModal(store: GameStore, pick?: { op: string; target?: string }): string {
  const s = store.state;
  const side = s.activeSide;
  const sd = s.sides[side];
  const list = OPS.filter((o) => o.side === 'both' || o.side === side);
  const html = list
    .map((o) => {
      const why = opAvailability(s, side, o);
      const targets = o.target === 'enemy-region' ? validTargets(s, side, o) : [];
      const sel = pick?.op === o.id ? pick.target : undefined;
      const needT = o.target === 'enemy-region';
      const disabled = !!why || (needT && !targets.length) || !store.isHumanTurn() || s.ordersLeft < 1;
      const reqs = o.requires.map((r) => TECH_BY_ID[r]?.name).filter(Boolean).join(', ');
      return `<div class="tech ${why ? 'locked' : ''}">
        <div class="nm">${o.icon} ${esc(o.name)}</div>
        <div class="ds">${esc(o.desc)}</div>
        <div class="meta"><span>Ціна: ${o.cost}</span><span>Підготовка: ${o.prep} тиж.</span><span>Ризик викриття: ~${Math.round(o.risk * 100)}%/тиж</span><span>Перезарядка: ${o.cooldown} тиж.</span></div>
        ${reqs ? `<div class="meta"><span>Потрібно: ${esc(reqs)}</span></div>` : ''}
        ${why ? `<div class="warn">${esc(why)}</div>` : ''}
        ${
          needT && !why
            ? `<select data-act="op-target" data-op="${o.id}" style="margin:4px 0;padding:4px;background:#0a0e18;color:inherit;border:1px solid var(--line);border-radius:6px">
                 <option value="">— оберіть ціль —</option>
                 ${targets.map((t) => `<option value="${t}" ${sel === t ? 'selected' : ''}>${esc(REGION_BY_ID[t].name)} (${fmtK(s.regions[t].troops)})</option>`).join('')}
               </select>`
            : ''
        }
        <button data-act="start-op" data-op="${o.id}" data-needt="${needT ? 1 : 0}" ${disabled || (needT && !sel) ? 'disabled' : ''}>Розпочати (1 наказ)</button>
      </div>`;
    })
    .join('');
  return `
    <h2>Спецоперації</h2>
    <p class="sub">Виробництво: <b>${sd.pp.toFixed(0)}</b>. Операція готується кілька тижнів і може бути викрита; успіх змінює хід війни.</p>
    <div class="tech-cols">${html}</div>`;
}

// ---------------------------------------------------------------- удар

export interface StrikeArgs {
  region: string;
  facility?: string; // відсутнє → міста
  drones: number;
  missiles: number;
}

export function strikeModal(store: GameStore, a: StrikeArgs): string {
  const s = store.state;
  const side = s.activeSide;
  const sd = s.sides[side];
  const r = s.regions[a.region];
  const def = REGION_BY_ID[a.region];
  const target = a.facility
    ? ({ kind: 'facility', region: a.region, facility: a.facility } as const)
    : ({ kind: 'city', region: a.region } as const);
  const fc = forecastStrike(s, side, target, Math.max(a.drones, 1), Math.max(a.missiles, 0));
  const ranges = strikeRanges(s, side);
  const fdef = a.facility ? FACILITY_BY_ID[a.facility].def : null;
  const hp = fdef ? Math.round(r.facilities[fdef.id] ?? 100) : 100;
  const dmg = a.facility ? forecastStrike(s, side, target, a.drones, a.missiles).expectedDamage : 0;
  return `
    <h2>${fdef ? `${FAC_ICON[fdef.type]} ${esc(fdef.name)}` : `Удар по містах: ${esc(def.name)}`}</h2>
    <p class="sub">${esc(def.name)} · ${fdef ? esc(FAC_NAME[fdef.type]) + ' — ' + esc(FAC_EFFECT[fdef.type]) : 'тиск на населення'}</p>
    <div class="grid" style="grid-template-columns:1fr 1fr">
      <div class="card"><h3>Ціль</h3>
        <div class="kv"><span>Справність</span><span>${hp}%</span></div>
        <div class="kv"><span>Рівень ППО</span><span>🛡 ${fc.adLevel}</span></div>
        <div class="kv"><span>Відстань до найближчого свого району</span><span>${fmtN(fc.distanceKm)} км</span></div>
        <div class="kv"><span>Дальність дронів / ракет</span><span>${fmtN(ranges.drone)} / ${fmtN(ranges.missile)} км</span></div>
      </div>
      <div class="card"><h3>Прогноз</h3>
        <div class="kv"><span>Виживання дронів</span><span>${Math.round(fc.survDrone * 100)}%</span></div>
        <div class="kv"><span>Виживання ракет</span><span>${Math.round(fc.survMissile * 100)}%</span></div>
        <div class="kv"><span>${fdef ? 'Очікувана шкода' : 'Очікувана шкода стійкості'}</span><span id="st-dmg"><b>${fdef ? '≈ ' + Math.min(hp, dmg).toFixed(0) + '%' : '—'}</b></span></div>
        <div class="kv"><span>Дальність дронів</span><span class="${fc.inRangeDrone ? 'good' : 'bad'}">${fc.inRangeDrone ? 'так' : 'поза дальністю'}</span></div>
        <div class="kv"><span>Дальність ракет</span><span class="${fc.inRangeMissile ? 'good' : 'bad'}">${fc.inRangeMissile ? 'так' : 'поза дальністю'}</span></div>
      </div>
    </div>
    <div class="field"><label>🛩 Дрони: <b id="st-d">${a.drones}</b> з ${sd.drones}</label>
      <input type="range" min="0" max="${sd.drones}" step="1" value="${a.drones}" data-act="st-slider" data-kind="drones"></div>
    <div class="field"><label>🚀 Ракети: <b id="st-m">${a.missiles}</b> з ${sd.missiles}</label>
      <input type="range" min="0" max="${sd.missiles}" step="1" value="${a.missiles}" data-act="st-slider" data-kind="missiles"></div>
    <div class="row" style="margin-top:10px">
      <span class="mini">Використовує 1 наказ. Запас не повертається.</span>
      <button class="tbtn primary big" data-act="launch" ${a.drones + a.missiles > 0 ? '' : 'disabled'}>Запустити</button>
    </div>`;
}

// ---------------------------------------------------------------- правила

export function rulesModal(): string {
  return `
  <div class="rules">
    <h2>Правила гри</h2>
    <p class="sub">Покрокова стратегія на схематичній карті Східної Європи. Один хід — один тиждень. Натхненна простою грою «Битва за Україну» (MaxD), розширена технологіями, ударами по тилу та Білоруссю.</p>
    <h3>Хід</h3>
    <p>На тиждень у вас <b>4 накази</b> (у «звичайному» режимі людині дають ще +1; технології можуть додати ще). Накази витрачають: <b>перекидання</b>, <b>атака</b>, <b>удар</b>, <b>укріплення</b>, <b>спецоперація</b>. Безкоштовні: дослідження, політика, ППО. Потім ходить супротивник, і настає підсумок тижня: виробництво, підкріплення, ремонт, події.</p>
    <h3>Перекидання й атака</h3>
    <p>Клацніть свою область — вона стане жовтою. Потім клацніть сусідню свою (перекидання) або ворожу (атака). Частку військ задайте внизу: 25/50/75/100% або «класичний режим» (завжди ½). Наведіть курсор на ціль — побачите прогноз бою.</p>
    <p>Бій — «лінійний Ланчестер»: втрати сторін пропорційні силі супротивника, а оборона виграє від місцевості, укріплень, річки й технологій. Область падає, коли вцілілий гарнізон став замалим порівняно з нападниками. Залишки оборонців відступають до сусідньої області.</p>
    <p>Перекинути війська можна лише через свої області; радіус логістики (1 → 3) збільшують технології. До прифронтових областей частина підкріплень може гинути через ворожий мідл-страйк.</p>
    <h3>Тил і удари</h3>
    <p>Значки на карті (<span class="kbd">F</span> або режим ударів) — стратегічні об’єкти: 🛢️ НПЗ, 🛫 аеродроми, 🏭 виробництво дронів, 💥 склади, ⚡ електростанції, ⚓ порти, 🌉 міст. Дрони й ракети виробляються з виробництва за відсотком, який ви задаєте в «Політиці». ППО в області збиває частину; ракети прориваються краще за дрони. Пошкоджені об’єкти ремонтуються.</p>
    <p>НПЗ → нафтові доходи й паливо РФ; аеродроми → авіаційна підтримка (КАБи); заводи → випуск дронів; склади → сила військ навколо; електростанції → виробництво й стійкість; міст → постачання Криму.</p>
    <h3>Ресурси</h3>
    <p><b>Бійці</b> — у кожній області. <b>Виробництво</b> — дохід тижня (промисловість × енергосистема + зовнішній дохід). <b>Підтримка</b> — допомога партнерів (УА) або нафтові доходи (РФ). <b>Стійкість</b> — суспільна витривалість: падає від втрат, відключень, мобілізації; якщо досягне 0 — сторона програє. <b>Енергосистема</b> — справність електростанцій.</p>
    <h3>Технології</h3>
    <p>Кожна технологія має контрзаходи: ФПВ слабшає від РЕБ, оптоволокно РЕБ обходить, але мерзне від сіток; мідл-страйк душить вогневі групи; «шахеди» — перехоплювачі. Дві дослідницькі ячейки; досліджується кілька тижнів. Супротивник бачить вашу зброю — контр-технологію ШІ теж шукає.</p>
    <h3>Білорусь</h3>
    <p>Доки напруга на кордоні не досягла 100%, Білорусь нейтральна й недоступна. Тоді вона переходить на бік РФ і з півночі з’являється ударна група. Україна може знижувати напругу («Північ»), РФ — підвищувати («Тиск на Мінськ»).</p>
    <h3>Перемога</h3>
    <p>Повне звільнення України (усі області) · стійкість супротивника = 0 · для РФ — падіння Києва. Через ${CFG.maxTurns} тижнів — перемир’я: результат залежить від кількості областей України під контролем УА (≥${CFG.victory.uaWinAtTimeout} — перемога України, ≤${CFG.victory.ruWinAtTimeout} — РФ, між ними — нічия).</p>
    <h3>Клавіші</h3>
    <p><span class="kbd">Пробіл</span> завершити хід · <span class="kbd">Z</span> скасувати наказ · <span class="kbd">1–4</span> частка військ · <span class="kbd">T</span> технології · <span class="kbd">S</span> режим ударів · <span class="kbd">F</span> об’єкти · <span class="kbd">Esc</span> скасувати вибір · колесо — масштаб, перетягування — пересування.</p>
    <p class="mini" style="margin-top:14px">Карта — схематична, розстановка сил — ігрова умовність, не документальна. Підтримайте ЗСУ: <a href="https://u24.gov.ua/" target="_blank" rel="noopener">United24</a> · <a href="https://savelife.in.ua/" target="_blank" rel="noopener">Повернись живим</a>.</p>
  </div>`;
}

// ---------------------------------------------------------------- нова гра

export function newGameModal(store: GameStore, hasSave: boolean, opts: { first: boolean }): string {
  const last = store.settings.lastConfig;
  const sideSel = last.humanSide ?? 'UA';
  const diff = last.difficulty ?? 'normal';
  return `
    <h2>Битва за Україну: Лінія дронів</h2>
    <p class="sub">Покрокова стратегія: фронт, дрони, далекобійні удари по тилу, технології «меч і щит» і Білорусь. Один хід — тиждень.</p>
    <div class="branch">Ваша сторона</div>
    <div class="choice" id="ng-side">
      <button data-act="ng-side" data-v="UA" class="${sideSel === 'UA' ? 'on' : ''}">🇺🇦 Україна<small>Стартуємо в жовтні 2026: утримати Київ, звільнити окуповане, вдарити по тилу.</small></button>
      <button data-act="ng-side" data-v="RU" class="${sideSel === 'RU' ? 'on' : ''}">⬛ Росія<small>Більше людей і дешеві штурми, але крихка економіка й нафта. Мета — Київ.</small></button>
      <button data-act="ng-side" data-v="both" class="${sideSel === 'both' ? 'on' : ''}">👥 Двоє гравців (один комп’ютер)<small>По черзі, з передачею керування.</small></button>
      <button data-act="ng-side" data-v="none" class="${sideSel === 'none' ? 'on' : ''}">👁 Спостерігач<small>ШІ проти ШІ — цікаво подивитися.</small></button>
    </div>
    <div class="branch">Складність</div>
    <div class="choice" id="ng-diff">
      <button data-act="ng-diff" data-v="normal" class="${diff === 'normal' ? 'on' : ''}">Звичайна<small>Втрати ШІ на ×1.25 більші — як у «звичайному режимі» оригіналу.</small></button>
      <button data-act="ng-diff" data-v="hard" class="${diff === 'hard' ? 'on' : ''}">Тяжка<small>Без поблажок для ШІ.</small></button>
    </div>
    <div class="field"><label>Зерно випадковості (необов’язково — для відтворюваних партій)</label>
      <input id="ng-seed" type="text" placeholder="випадкове" style="padding:8px;border-radius:8px;border:1px solid var(--line);background:#0a0e18;color:inherit"></div>
    <div class="row" style="margin-top:12px;gap:10px;flex-wrap:wrap">
      <span>${hasSave ? '<button class="tbtn big" data-act="continue">Продовжити збережену</button>' : ''}</span>
      <span>${opts.first ? '' : '<button class="tbtn big" data-act="close-modal">Скасувати</button> '}<button class="tbtn primary big" data-act="ng-start">Почати гру</button></span>
    </div>`;
}

// ---------------------------------------------------------------- кінець гри

export function gameOverModal(store: GameStore): string {
  const s = store.state;
  const o = s.outcome!;
  const t = territoryScore(s);
  const humanSides = (['UA', 'RU'] as Side[]).filter((x) => s.config.controllers[x] === 'human');
  let headline = '';
  if (o.winner === 'draw') headline = 'Перемир’я';
  else if (humanSides.length === 1) headline = humanSides[0] === o.winner ? 'Перемога!' : 'Поразка';
  else headline = `Перемога: ${SIDE_NAME[o.winner]}`;
  const share = `Битва за Україну: Лінія дронів — ${headline} на тижні ${s.turn + 1}. Україна тримає ${t.uaHeld}/${t.uaTotal} областей; втрати ЗСУ ${fmtK(s.sides.UA.casualties)}, РФ ${fmtK(s.sides.RU.casualties)}.`;
  return `
    <h2>${headline}</h2>
    <p class="sub">${esc(o.reason)}</p>
    <div class="grid" style="grid-template-columns:1fr 1fr">
      <div class="card"><h3>Україна</h3>
        <div class="kv"><span>Бійці</span><span>${fmtN(totalTroops(s, 'UA'))}</span></div>
        <div class="kv"><span>Втрати</span><span>${fmtN(s.sides.UA.casualties)}</span></div>
        <div class="kv"><span>Стійкість</span><span>${s.sides.UA.resilience.toFixed(0)}</span></div>
        <div class="kv"><span>Технології</span><span>${s.sides.UA.techs.length}</span></div>
      </div>
      <div class="card"><h3>Росія</h3>
        <div class="kv"><span>Бійці</span><span>${fmtN(totalTroops(s, 'RU'))}</span></div>
        <div class="kv"><span>Втрати</span><span>${fmtN(s.sides.RU.casualties)}</span></div>
        <div class="kv"><span>Стійкість</span><span>${s.sides.RU.resilience.toFixed(0)}</span></div>
        <div class="kv"><span>Технології</span><span>${s.sides.RU.techs.length}</span></div>
      </div>
    </div>
    <div class="kv"><span>Областей України під контролем УА</span><span>${t.uaHeld} / ${t.uaTotal}</span></div>
    <div class="kv"><span>Тривалість</span><span>${s.turn + 1} тиж.</span></div>
    <div class="field"><label>Результат для поширення</label>
      <textarea readonly rows="3" style="padding:8px;border-radius:8px;border:1px solid var(--line);background:#0a0e18;color:inherit">${esc(share)}</textarea></div>
    <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap">
      <button class="tbtn" data-act="copy-result" data-text="${esc(share)}">Скопіювати результат</button>
      <span><button class="tbtn" data-act="close-modal">Переглянути карту</button> <button class="tbtn primary big" data-act="new-game">Нова гра</button></span>
    </div>`;
}

export function curtainModal(store: GameStore): string {
  const side = store.state.activeSide;
  return `
    <h2>Передайте керування</h2>
    <p class="sub">Тепер ходить: <b>${SIDE_NAME[side]}</b>. Другий гравець має відвернутися, поки ви не натиснете кнопку.</p>
    <div class="row" style="margin-top:14px"><span></span><button class="tbtn primary big" data-act="curtain-ok">Я готовий(-а) до ходу</button></div>`;
}

