// Бокова панель, верхня смуга, підказки та рядок новин. Повертають HTML-рядки;
// події обробляються делегуванням за атрибутами data-act.

import { CFG } from '../engine/config';
import { recruitAmount } from '../engine/turn';
import {
  REGION_BY_ID,
  adjacentEnemyTroops,
  energyPct,
  formatDate,
  getMods,
  incomeBreakdown,
  isFront,
  oilFactor,
  ordersFor,
  other,
  seasonName,
  totalTroops,
} from '../engine/selectors';
import { TECH_BY_ID } from '../engine/techs';
import { OP_BY_ID } from '../engine/ops';
import { territoryScore } from '../engine/victory';
import type { Side } from '../engine/types';
import { FAC_ICON, FAC_NAME, SIDE_ARMY, SIDE_NAME, TERRAIN_NAME, esc, fmt1, fmtK, fmtN } from './format';
import type { GameStore } from './store';

// ---------------------------------------------------------------- верхня смуга

export function renderTopbar(store: GameStore): string {
  const s = store.state;
  const c = s.config.controllers;
  const who = store.curtain
    ? 'Передача керування'
    : s.outcome
      ? 'Гру завершено'
      : c[s.activeSide] === 'human'
        ? `Ваш хід: ${SIDE_NAME[s.activeSide]}`
        : `Хід: ${SIDE_NAME[s.activeSide]} (ШІ)`;
  const speed = store.settings.aiSpeed;
  const speedBtns = store.isSpectator() || c.UA === 'ai' || c.RU === 'ai'
    ? `<span class="mini" style="margin-left:4px">Темп ШІ:</span>
       ${(['slow', 'normal', 'fast', 'instant'] as const)
         .map((k) => `<button class="tbtn" data-act="ai-speed" data-v="${k}" style="padding:3px 8px;${speed === k ? 'border-color:var(--gold)' : ''}">${{ slow: '🐢', normal: '▶', fast: '⏩', instant: '⚡' }[k]}</button>`)
         .join('')}`
    : '';
  return `
    <span class="title"><span class="flag"></span>Битва за Україну<small>Лінія дронів</small></span>
    <span class="chip ${s.activeSide === 'UA' ? 'ua' : 'ru'}">${who}</span>
    <span class="date">Тиждень <b>${s.turn + 1}</b> · <b>${formatDate(s.turn)}</b> · ${seasonName(s.turn)}</span>
    <span class="spacer"></span>
    ${speedBtns}
    ${store.isSpectator() ? `<button class="tbtn" data-act="pause">${store.paused ? '▶ Продовжити' : '⏸ Пауза'}</button><button class="tbtn" data-act="swap-view">Вид: ${store.viewSide === 'UA' ? 'Україна' : 'Росія'}</button>` : ''}
    <button class="tbtn" data-act="rules">Правила</button>
    <button class="tbtn" data-act="new-game">Нова гра</button>
    <span class="support-links"><a href="https://u24.gov.ua/" target="_blank" rel="noopener">Підтримати ЗСУ</a><a href="https://savelife.in.ua/" target="_blank" rel="noopener">Повернись живим</a></span>`;
}

// ---------------------------------------------------------------- бокова панель

function bar(value: number, cls = ''): string {
  const v = Math.max(0, Math.min(100, value));
  const auto = cls || (v > 60 ? '' : v > 30 ? 'warn' : 'bad');
  return `<div class="bar ${auto}"><i style="width:${v}%"></i></div>`;
}

function statusCard(store: GameStore, side: Side): string {
  const s = store.state;
  const sd = s.sides[side];
  const inc = incomeBreakdown(s, side);
  const troops = totalTroops(s, side);
  const rec = recruitAmount(s, side);
  const energy = energyPct(s, side);
  const supLabel = side === 'UA' ? 'Підтримка партнерів' : 'Економіка та експорт';
  const sup = side === 'RU' ? Math.round(oilFactor(s) * 100) : Math.round(sd.support);
  return `
  <div class="card">
    <h3>${side === 'UA' ? '🇺🇦 Україна' : '⬛ Росія'} — стан</h3>
    <div class="stats">
      <div class="stat"><span class="k">Бійці</span><span class="v">${fmtN(troops)}<small>+${fmtN(rec)}/тиж</small></span></div>
      <div class="stat"><span class="k">Виробництво</span><span class="v">${sd.pp.toFixed(0)}<small>+${fmt1(inc.total)}/тиж</small></span></div>
      <div class="stat"><span class="k">${supLabel}</span><span class="v">${sup}</span>${bar(sup, 'blue')}</div>
      <div class="stat"><span class="k">Стійкість</span><span class="v">${sd.resilience.toFixed(0)}</span>${bar(sd.resilience)}</div>
      <div class="stat"><span class="k">Енергосистема</span><span class="v">${energy}%</span>${bar(energy)}</div>
      <div class="stat"><span class="k">Запас ударів</span><span class="v">🛩 ${sd.drones} <small>🚀 ${sd.missiles}</small></span></div>
    </div>
    ${
      !s.belarus.active
        ? `<div style="margin-top:8px"><div class="row mini"><span>Напруга на кордоні з Білоруссю</span><span>${Math.round(s.belarus.tension)}%</span></div>${bar(100 - s.belarus.tension, s.belarus.tension > 75 ? 'bad' : s.belarus.tension > 50 ? 'warn' : '')}</div>`
        : `<div class="mini" style="margin-top:8px;color:var(--ru)">⚠ Білорусь вступила у війну на боці РФ.</div>`
    }
    ${sd.research.length ? `<hr class="sep"><div class="mini">Дослідження:</div>${sd.research.map((j) => `<div class="kv"><span>${TECH_BY_ID[j.tech].icon} ${esc(TECH_BY_ID[j.tech].name)}</span><span>${j.turnsLeft} тиж.</span></div>`).join('')}` : ''}
    ${sd.ops.length ? `<hr class="sep"><div class="mini">Спецоперації в підготовці:</div>${sd.ops.map((j) => `<div class="kv"><span>${OP_BY_ID[j.op].icon} ${esc(OP_BY_ID[j.op].name)}</span><span>${j.prepLeft} тиж.</span></div>`).join('')}` : ''}
    ${sd.effects.filter((e) => e.turnsLeft > 0).length ? `<hr class="sep">${sd.effects.map((e) => `<div class="kv warn"><span>${esc(e.label)}</span><span>${e.turnsLeft} тиж.</span></div>`).join('')}` : ''}
  </div>`;
}

function ordersBlock(store: GameStore): string {
  const s = store.state;
  if (s.outcome) return '';
  if (store.curtain) return '';
  if (!store.isHumanTurn()) {
    return `<div class="card"><div class="row"><b>${store.busy ? 'Ворог ходить…' : 'Очікування'}</b><span class="mini">${SIDE_NAME[s.activeSide]}</span></div></div>`;
  }
  const max = ordersFor(s, s.activeSide);
  const pips = Array.from({ length: max }, (_, i) => `<span class="pip ${i < s.ordersLeft ? 'on' : ''}"></span>`).join('');
  const total = s.ordersLeft;
  return `
  <div class="card">
    <div class="row"><b>Накази на тиждень</b><span class="pips">${pips}</span></div>
    <div class="btnrow">
      <button class="tbtn primary big" data-act="end-turn">${total > 0 ? 'Завершити хід (Пробіл)' : 'Наступний хід (Пробіл)'}</button>
      <button class="tbtn big" data-act="undo" ${store.canUndo() ? '' : 'disabled'} title="Скасувати останній наказ (Z)">↶</button>
    </div>
    <div class="btnrow tools">
      <button class="tbtn" data-act="tech">Технології${s.sides[s.activeSide].research.length ? ` (${s.sides[s.activeSide].research.length})` : ''}</button>
      <button class="tbtn" data-act="ops">Операції</button>
      <button class="tbtn" data-act="policy">Політика</button>
    </div>
    <div class="btnrow tools" style="margin-top:6px">
      <button class="tbtn ${store.mode === 'strike' ? 'primary' : ''}" data-act="strike-mode" style="grid-column: span 2">🎯 Режим ударів ${store.mode === 'strike' ? '(увімк.)' : ''}</button>
      ${s.activeSide === 'UA' && !s.belarus.active ? `<button class="tbtn" data-act="north" title="15 вир.: знизити напругу на північному кордоні">Північ</button>` : s.activeSide === 'RU' && !s.belarus.active ? `<button class="tbtn" data-act="pressure" title="Підвищити напругу на кордоні Білорусі">Тиск на Мінськ</button>` : '<span></span>'}
    </div>
  </div>`;
}

function regionCard(store: GameStore): string {
  const s = store.state;
  const id = store.inspect;
  if (!id) return `<div class="card"><h3>Область</h3><div class="mini">Клацніть область на карті: свою — щоб обрати джерело дій, ворожу — щоб побачити деталі та цілі для ударів.</div></div>`;
  const def = REGION_BY_ID[id];
  const r = s.regions[id];
  const own = r.owner === s.activeSide && store.isHumanTurn();
  const foe = other(s.activeSide);
  const enemyThere = r.owner === foe || (r.owner === 'BY');
  const facs = def.facilities
    .map((f) => {
      const hp = Math.round(r.facilities[f.id] ?? 100);
      const strikeBtn = store.isHumanTurn() && r.owner === foe && hp > 0 ? `<button data-act="strike-facility" data-region="${id}" data-fac="${f.id}">Удар</button>` : '<span></span>';
      const col = hp > 66 ? '' : hp > 33 ? 'warn' : 'bad';
      return `<div class="fac-item" title="${esc(f.name)} — ${esc(FAC_NAME[f.type])}">
        <span>${FAC_ICON[f.type]}</span><span>${esc(f.name)}</span>
        <span>${bar(hp, col)}</span>${strikeBtn}</div>`;
    })
    .join('');
  const pp = s.sides[s.activeSide].pp;
  const adCost = r.ad < CFG.ad.maxLevel ? CFG.ad.cost[r.ad] : null;
  const fortCost = r.fort < CFG.fortify.max ? CFG.fortify.cost[r.fort] : null;
  const cityBtn = store.isHumanTurn() && s.activeSide === 'RU' && r.owner === 'UA'
    ? `<button class="tbtn" data-act="strike-city" data-region="${id}" style="margin-top:6px">🎯 Удар по містах</button>` : '';
  return `
  <div class="card">
    <h3>${esc(def.name)}</h3>
    <div><span class="tag ${r.owner === 'RU' ? 'ru' : r.owner === 'BY' ? 'by' : ''}">${SIDE_NAME[r.owner]}</span><span class="tag">${TERRAIN_NAME[def.terrain]}</span>${def.capital ? '<span class="tag">столиця</span>' : ''}${def.belt ? '<span class="tag">прикордонна зона</span>' : ''}${isFront(s, id) ? '<span class="tag ru">фронт</span>' : ''}</div>
    <div class="stats" style="margin-top:8px">
      <div class="stat"><span class="k">Гарнізон</span><span class="v">${fmtN(r.troops)}</span></div>
      <div class="stat"><span class="k">Ворог поруч</span><span class="v">${fmtN(adjacentEnemyTroops(s, id))}</span></div>
      <div class="stat"><span class="k">ППО</span><span class="v">🛡 ${r.ad}${r.aaSabotage > 0 ? '<small>(диверсія)</small>' : ''}</span></div>
      <div class="stat"><span class="k">Укріплення</span><span class="v">⛏ ${r.fort}${r.railCut > 0 ? ' <small>🚧 залізницю підірвано</small>' : ''}</span></div>
    </div>
    ${own ? `<div class="btnrow tools" style="margin-top:8px">
      <button class="tbtn" data-act="deploy-ad" data-region="${id}" ${adCost === null || pp < adCost ? 'disabled' : ''}>+ППО${adCost !== null ? ` (${adCost})` : ''}</button>
      <button class="tbtn" data-act="fortify" data-region="${id}" ${fortCost === null || pp < fortCost || s.ordersLeft < 1 ? 'disabled' : ''} title="Витрачає наказ">+Укріпл.${fortCost !== null ? ` (${fortCost})` : ''}</button>
      <span></span></div>` : ''}
    ${facs ? `<hr class="sep"><div class="mini">Об’єкти${enemyThere ? ' (можна вражати ударами)' : ''}:</div><div class="fac-list">${facs}</div>` : ''}
    ${cityBtn}
  </div>`;
}

function intelCard(store: GameStore): string {
  const s = store.state;
  const me = store.viewSide;
  const foe = other(me);
  const intel = getMods(s, me).intel;
  const fs = s.sides[foe];
  const names = fs.techs.filter((t) => TECH_BY_ID[t]).map((t) => `${TECH_BY_ID[t].icon} ${esc(TECH_BY_ID[t].name)}`);
  return `
  <div class="card">
    <h3>Розвідка про ${SIDE_NAME[foe]}</h3>
    ${intel >= 1
      ? `<div class="kv"><span>Стійкість</span><span>${fs.resilience.toFixed(0)}</span></div>
         <div class="kv"><span>Виробництво (банк)</span><span>${fs.pp.toFixed(0)}</span></div>
         <div class="kv"><span>Запас ударів</span><span>🛩 ${fs.drones} 🚀 ${fs.missiles}</span></div>
         <div class="mini" style="margin-top:6px">Досліджують: ${fs.research.length ? fs.research.map((j) => esc(TECH_BY_ID[j.tech].name) + ` (${j.turnsLeft})`).join(', ') : '—'}</div>
         <div class="mini" style="margin-top:6px">Відомі технології: ${names.join(' · ') || '—'}</div>
         ${intel >= 2 ? `<div class="mini" style="margin-top:6px">Спецоперації в підготовці: ${fs.ops.length ? fs.ops.map((j) => OP_BY_ID[j.op].name).join(', ') : 'не виявлено'}</div>` : ''}`
      : `<div class="mini">Дані обмежені. Дослідіть «Розвідувальну мережу», щоб бачити ресурси, технології й плани супротивника.</div>
         <div class="mini" style="margin-top:6px">Відомі технології: ${names.length ? names.slice(0, 4).join(' · ') + (names.length > 4 ? '…' : '') : '—'}</div>`}
  </div>`;
}

function logCard(store: GameStore): string {
  const s = store.state;
  const entries = s.log.slice(-40).reverse();
  return `
  <div class="card">
    <h3>Журнал</h3>
    <div class="log">${entries
      .map((e) => `<div class="e ${e.side} ${e.kind ?? ''}"><span class="t">Т${e.turn + 1}</span>${esc(e.text)}</div>`)
      .join('')}</div>
  </div>`;
}

function scoreCard(store: GameStore): string {
  const s = store.state;
  const t = territoryScore(s);
  return `
  <div class="card">
    <h3>Рахунок</h3>
    <div class="kv"><span>Області України під контролем УА</span><span><b>${t.uaHeld}</b> / ${t.uaTotal}</span></div>
    <div class="kv"><span>Втрати: ЗСУ / РФ</span><span>${fmtK(s.sides.UA.casualties)} / ${fmtK(s.sides.RU.casualties)}</span></div>
    <div class="kv"><span>До кінця партії</span><span>${Math.max(0, CFG.maxTurns - s.turn)} тиж.</span></div>
  </div>`;
}

function recapCard(store: GameStore): string {
  if (!store.recap || !store.isHumanTurn()) return '';
  const lines = store.recap.slice(-9);
  return `
  <div class="card" style="border-color:#7a5a1a;background:#1c160a">
    <div class="row"><h3 style="margin:0;color:var(--gold)">Що сталося за тиждень</h3><button class="tbtn" data-act="dismiss-recap" style="padding:1px 8px">✕</button></div>
    <div class="log" style="max-height:200px;margin-top:6px">${lines.map((e) => `<div class="e ${e.side} ${e.kind ?? ''}">${esc(e.text)}</div>`).join('')}</div>
  </div>`;
}

function tipsCard(store: GameStore): string {
  const s = store.state;
  if (store.settings.tipsDismissed || s.turn > 2 || !store.isHumanTurn()) return '';
  const tips = [
    'Клацніть свою область (вона стане жовтою), потім сусідню: свою — перекидання, ворожу — атака.',
    'Наведіть курсор на ворожу область — побачите прогноз бою. Атакуйте, коли співвідношення сил > 1.',
    'Тримайте резерви біля фронту: перекидання можливе лише між сусідніми областями.',
    'Технології й політика — безкоштовні. Ударні засоби й ППО захищають та руйнують тил.',
  ];
  return `
  <div class="card" style="border-color:#2e4f94">
    <div class="row"><h3 style="margin:0">Швидкий старт</h3><button class="tbtn" data-act="dismiss-tips" style="padding:1px 8px">Зрозуміло</button></div>
    <ul class="mini" style="margin:6px 0 0;padding-left:18px">${tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
  </div>`;
}

export function renderSide(store: GameStore): string {
  const s = store.state;
  if (!s) return '';
  const side = store.viewSide;
  return `${recapCard(store)}${tipsCard(store)}${ordersBlock(store)}${statusCard(store, side)}${regionCard(store)}${scoreCard(store)}${intelCard(store)}${logCard(store)}`;
}

// ---------------------------------------------------------------- підказка на карті

export function tooltipHtml(store: GameStore, id: string): string {
  const s = store.state;
  const def = REGION_BY_ID[id];
  const r = s.regions[id];
  const lines: string[] = [];
  lines.push(`<h4>${esc(def.name)}</h4>`);
  lines.push(`<div class="sub">${SIDE_NAME[r.owner]} · ${TERRAIN_NAME[def.terrain]} · ${SIDE_ARMY[r.owner]}: <b>${fmtN(r.troops)}</b></div>`);
  const extra: string[] = [];
  if (r.ad) extra.push(`🛡 ППО ${r.ad}`);
  if (r.fort) extra.push(`⛏ укріпл. ${r.fort}`);
  if (extra.length) lines.push(`<div class="sub">${extra.join(' · ')}</div>`);
  const sel = store.selected;
  if (sel && sel !== id && store.isHumanTurn()) {
    const fc = store.forecast(sel, id);
    if (fc) {
      lines.push(`<hr class="sep">`);
      lines.push(`<div><b>Атака з «${esc(REGION_BY_ID[sel].name)}»</b></div>`);
      lines.push(`<div>Сили: ${fmtN(fc.attackers)} проти ${fmtN(fc.defenders)} · співвідн. <b class="${fc.ratio >= 1.2 ? 'good' : fc.ratio < 0.85 ? 'bad' : ''}">${fc.ratio.toFixed(2)}</b></div>`);
      lines.push(`<div>Очікувані втрати: оборонці −${fmtN(fc.killsDefenders)}, ви −${fmtN(fc.killsAttackers)}</div>`);
      lines.push(`<div>${fc.captured ? '<span class="good">Область, імовірно, буде взято</span>' : 'Область не буде взято одним ударом'}</div>`);
    } else if (r.owner === s.activeSide && store.reachableFrom(sel).includes(id)) {
      const src = s.regions[sel];
      const n = Math.floor(src.troops * store.currentFraction());
      lines.push(`<hr class="sep"><div><b>Перекинути ≈ ${fmtN(n)} бійців</b> з «${esc(REGION_BY_ID[sel].name)}»</div>`);
    }
  }
  const facs = def.facilities.map((f) => `${FAC_ICON[f.type]} ${Math.round(r.facilities[f.id] ?? 100)}%`).join('  ');
  if (facs) lines.push(`<div class="sub" style="margin-top:3px">${facs}</div>`);
  return lines.join('');
}

// ---------------------------------------------------------------- панель дій під картою

export function renderActionBar(store: GameStore): string {
  const s = store.state;
  if (!s || s.outcome || !store.isHumanTurn()) return '';
  const f = store.currentFraction();
  const presets = [0.25, 0.5, 0.75, 1];
  const seg = presets
    .map((p, i) => `<button data-act="fraction" data-v="${p}" class="${Math.abs(f - p) < 0.01 ? 'on' : ''}" title="Клавіша ${i + 1}">${Math.round(p * 100)}%</button>`)
    .join('');
  let hint = '';
  if (store.mode === 'strike') hint = '🎯 Режим ударів: клацніть значок об’єкта ворога на карті. <span class="kbd">Esc</span> — вихід.';
  else if (store.selected) hint = `Джерело: <b>${esc(REGION_BY_ID[store.selected].name)}</b> — клацніть свою область (перекидання) або ворожу (атака).`;
  else hint = 'Оберіть свою область із військами.';
  const slider = store.settings.classicHalf ? '' : `<input type="range" min="5" max="100" step="5" value="${Math.round(f * 100)}" data-act="fraction-slider">`;
  return `
    <div class="abox">Частка військ: <span class="seg">${seg}</span>${slider}
      <label class="mini"><input type="checkbox" data-act="classic" ${store.settings.classicHalf ? 'checked' : ''}> класичний режим (½)</label>
    </div>
    <div class="abox">${hint}</div>`;
}

// ---------------------------------------------------------------- рядок новин

export function renderTicker(store: GameStore): string {
  const s = store.state;
  if (!s) return '';
  const lines = s.ticker.slice(-14);
  return lines.map((l) => `<span style="margin-right:80px">${esc(l)}</span>`).join('');
}

