import type { FacilityType, Owner, Side, Terrain } from '../engine/types';

/** Компактний запис: 17 598 → «17,6к», 950 → «950». */
export function fmtK(n: number): string {
  const v = Math.round(n);
  if (v < 1000) return String(v);
  if (v < 10000) return (v / 1000).toFixed(1).replace('.', ',') + 'к';
  return Math.round(v / 1000) + 'к';
}

export function fmtN(n: number): string {
  return Math.round(n).toLocaleString('uk-UA').replace(/ /g, ' ');
}

export function fmt1(n: number): string {
  return n.toFixed(1).replace('.', ',');
}

export const SIDE_NAME: Record<Owner, string> = { UA: 'Україна', RU: 'Росія', BY: 'Білорусь' };
export const SIDE_ARMY: Record<Owner, string> = { UA: 'ЗСУ', RU: 'РФ', BY: 'ЗС Білорусі' };

export const TERRAIN_NAME: Record<Terrain, string> = {
  plain: 'рівнина',
  forest: 'ліс',
  marsh: 'болота (Полісся)',
  mountain: 'гори',
  urban: 'міська забудова',
  coast: 'узбережжя',
  steppe: 'степ',
  fortress: 'укріплений район',
};

export const FAC_NAME: Record<FacilityType, string> = {
  refinery: 'НПЗ',
  airfield: 'аеродром',
  drone_factory: 'виробництво дронів',
  ammo_depot: 'склад боєприпасів',
  power_plant: 'електростанція',
  port: 'порт',
  bridge: 'міст',
};

export const FAC_ICON: Record<FacilityType, string> = {
  refinery: '🛢️',
  airfield: '🛫',
  drone_factory: '🏭',
  ammo_depot: '💥',
  power_plant: '⚡',
  port: '⚓',
  bridge: '🌉',
};

export const FAC_EFFECT: Record<FacilityType, string> = {
  refinery: 'Нафтові доходи й паливо для наступу',
  airfield: 'Авіаційна підтримка (КАБи), стратегічна авіація',
  drone_factory: 'Випуск дронів і ракет',
  ammo_depot: 'Постачання військ у прилеглих областях',
  power_plant: 'Енергосистема: виробництво та стійкість',
  port: 'Експорт / економіка, база флоту',
  bridge: 'Постачання Криму',
};

export function sideColor(s: Side | Owner): string {
  return s === 'UA' ? 'var(--ua-soft)' : s === 'RU' ? 'var(--ru)' : '#9fd3b0';
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
