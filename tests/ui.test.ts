import { describe, expect, it } from 'vitest';
import { GameStore } from '../src/ui/store';
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
    expect(newGameModal(store, false, { first: true })).toContain('Почати гру');
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
