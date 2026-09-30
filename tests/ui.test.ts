import { describe, expect, it } from 'vitest';
import { GameStore, visibleLog } from '../src/ui/store';
import { invalidateMods } from '../src/engine/selectors';
import { renderActionBar, renderSide, renderTicker, renderTopbar, tooltipHtml } from '../src/ui/panels';
import { gameOverModal, newGameModal, opsModal, policyModal, rulesModal, strikeModal, techModal } from '../src/ui/modals';
import { regionFill } from '../src/ui/map';
import { fmtK } from '../src/ui/format';

describe('інтерфейс (дим-тест відмальовування)', () => {
  const store = new GameStore();
  store.settings.aiSpeed = 'instant';
  store.newGame({ humanSide: 'UA', difficulty: 'normal', seed: 1 });

  it('панелі та підказки будуються без винятків', () => {
    store.selected = 'kharkiv';
    store.inspect = 'luhansk';
    expect(renderSide(store)).toContain('Накази на тиждень');
    expect(renderTopbar(store)).toContain('Тиждень');
    expect(renderActionBar(store)).toContain('Частка військ');
    expect(tooltipHtml(store, 'luhansk')).toContain('Атака');
    expect(renderTicker(store).length).toBeGreaterThan(0);
  });

  it('вікна будуються для обох сторін', () => {
    for (const side of ['UA', 'RU'] as const) {
      store.state.activeSide = side;
      expect(techModal(store)).toContain('Технології');
      expect(policyModal(store)).toContain('Мобілізація');
      expect(opsModal(store)).toContain('Спецоперації');
    }
    store.state.activeSide = 'UA';
    expect(strikeModal(store, { region: 'belgorod', facility: 'belgorod_tec', drones: 10, missiles: 1 })).toContain('Запустити');
    expect(rulesModal()).toContain('Правила');
    expect(newGameModal(store, false, { first: true }, { side: "UA", diff: "normal", scen: "oct-2026", seed: "" })).toContain('Почати гру');
    store.state.outcome = { winner: 'draw', reason: 'тест' };
    expect(gameOverModal(store)).toContain('Перемир');
  });

  it('форматування та кольори', () => {
    expect(fmtK(950)).toBe('950');
    expect(fmtK(17598)).toBe('18к');
    expect(fmtK(3200)).toBe('3,2к');
    expect(regionFill('UA', 40000).fill).toMatch(/^hsl\(232/);
    expect(regionFill('RU', 1000).fill).toMatch(/^hsl\(5/);
  });
});

describe('підсумок тижня та видимість журналу', () => {
  it('після ходу ШІ підсумок містить лише ворожі/світові події нового тижня', async () => {
    const s = new GameStore();
    s.settings.aiSpeed = 'instant';
    s.newGame({ humanSide: 'UA', difficulty: 'normal', seed: 3 });
    s.dispatch({ type: 'endTurn' });
    for (let i = 0; i < 400 && !s.isHumanTurn(); i++) await new Promise((r) => setTimeout(r, 5));
    expect(s.isHumanTurn()).toBe(true);
    expect(s.recap).toBeTruthy();
    expect(s.recap!.every((e) => e.side !== 'UA')).toBe(true);
    // кожен запис має наскрізний номер
    expect(s.state.log.every((e) => typeof e.seq === 'number')).toBe(true);
  });

  it('початок ворожих досліджень прихований без розвідки', () => {
    const s = new GameStore();
    s.newGame({ humanSide: 'none', difficulty: 'hard', seed: 1 });
    s.state.log.push({ turn: 0, side: 'RU', kind: 'tech', text: 'Розпочато дослідження: Балістичні ракети (5 тиж.).', seq: 9991 });
    s.state.log.push({ turn: 0, side: 'RU', kind: 'tech', text: 'Завершено дослідження: Тіньовий флот.', seq: 9992 });
    const texts = visibleLog(s.state, 'UA').map((e) => e.text);
    expect(texts.some((t) => t.startsWith('Розпочато дослідження: Балістичні'))).toBe(false);
    expect(texts.some((t) => t.startsWith('Завершено дослідження: Тіньовий'))).toBe(true);
    s.state.sides.UA.techs.push('intel_net');
    invalidateMods(s.state);
    expect(visibleLog(s.state, 'UA').some((e) => e.text.startsWith('Розпочато дослідження: Балістичні'))).toBe(true);
  });
});
