// Опис сценаріїв (стартових розстановок). Базовий сценарій «Жовтень 2026» лежить у scenario.ts;
// тут — перелік метаданих та перевизначення для інших стартів.

import type { Side } from './types';

export interface ScenarioMeta {
  id: string;
  name: string;
  blurb: string;
  /** Понеділок початку гри (ISO). */
  startDate: string;
}

export const SCENARIOS: ScenarioMeta[] = [
  {
    id: 'oct-2026',
    name: 'Жовтень 2026',
    blurb: 'Сучасна війна дронів: окуповані Крим, Луганщина, південь Донеччини й Запоріжжя; сильна РФ, розвинені технології.',
    startDate: '2026-10-05',
  },
  {
    id: 'feb-2022',
    name: 'Лютий 2022 — «класика»',
    blurb: 'Стартова розстановка оригінальної гри: сильніша Україна, мало технологій, а з Білорусі ось-ось прийде удар. Оборона Києва.',
    startDate: '2022-02-21',
  },
];

export const SCENARIO_BY_ID: Record<string, ScenarioMeta> = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));

export interface RegionOverride {
  owner?: 'UA' | 'RU' | 'BY';
  troops?: number;
  ad?: number;
  fort?: number;
}

export interface SideOverride {
  pp?: number;
  support?: number;
  resilience?: number;
  drones?: number;
  missiles?: number;
  techs?: string[];
  allocDrones?: number;
  allocMissiles?: number;
}

export interface ScenarioOverrides {
  regions: Record<string, RegionOverride>;
  sides: Partial<Record<Side, SideOverride>>;
  tension: number;
  ticker: string;
  intro: string;
}

/** Лютий 2022: розстановка за описом оригінальної гри (+ стилізований російський тил і Білорусь). */
export const FEB_2022: ScenarioOverrides = {
  tension: 96,
  ticker: 'Лютий 2022. Військові навчання біля кордонів, «ми нікого не збираємося атакувати». Київ тримається.',
  intro: 'Початок кампанії: лютий 2022. Україна готується до великого вторгнення.',
  regions: {
    // Україна — розстановка оригінальної гри
    lviv: { troops: 30000, ad: 0 },
    kyiv: { troops: 26000, ad: 2 },
    dnipro: { troops: 13000, ad: 1 },
    odesa: { troops: 9000, ad: 1 },
    mykolaiv: { troops: 9000, ad: 0 },
    kharkiv: { troops: 7000, ad: 1, fort: 1 },
    volyn: { troops: 3000, ad: 0 },
    zhytomyr: { troops: 3000 },
    zakarpattia: { troops: 3000 },
    ivano: { troops: 3000, ad: 0 },
    ternopil: { troops: 3000 },
    khmelnytskyi: { troops: 3000, ad: 0 },
    chernivtsi: { troops: 3000 },
    vinnytsia: { troops: 3000 },
    cherkasy: { troops: 3000 },
    kirovohrad: { troops: 3000 },
    poltava: { troops: 3000, ad: 0 },
    sumy: { troops: 3000, ad: 0, fort: 0 },
    rivne: { troops: 1500, ad: 0 },
    chernihiv: { troops: 1500, ad: 0, fort: 0 },
    // Українські території, які в грі-оригіналі починають за ворогом
    luhansk: { owner: 'RU', troops: 20000, fort: 1 },
    donetsk_s: { owner: 'RU', troops: 15000, fort: 1 },
    donetsk_n: { owner: 'UA', troops: 6000, ad: 0, fort: 1 },
    zaporizhzhia_n: { owner: 'UA', troops: 6000, ad: 0, fort: 0 },
    zaporizhzhia_s: { owner: 'RU', troops: 17000, fort: 0 },
    kherson_r: { owner: 'UA', troops: 4000, fort: 0 },
    kherson_l: { owner: 'RU', troops: 10000, fort: 0 },
    crimea: { owner: 'RU', troops: 10000, ad: 2, fort: 1 },
    // Росія: прикордонні угруповання біля України та Білорусі, тил слабший
    belgorod: { troops: 14000, ad: 1 },
    kursk: { troops: 10000, ad: 1 },
    bryansk: { troops: 14000, ad: 1 },
    voronezh: { troops: 8000, ad: 1 },
    rostov: { troops: 16000, ad: 1 },
    krasnodar: { troops: 7000, ad: 1 },
    moscow: { troops: 20000, ad: 3 },
    tula: { troops: 4000 },
    oryol: { troops: 3000 },
    ryazan: { troops: 3000 },
    tambov: { troops: 3000 },
    volgograd: { troops: 4000 },
    stavropol: { troops: 5000 },
    saratov: { troops: 3000 },
    smolensk: { troops: 5000 },
    leningrad: { troops: 5000, ad: 1 },
    novgorod: { troops: 2000 },
    tver: { troops: 2000 },
    yaroslavl: { troops: 2000 },
    vladimir: { troops: 2000 },
    nizhny: { troops: 3000 },
    tatarstan: { troops: 3000, ad: 1 },
    penza: { troops: 2000 },
    astrakhan: { troops: 2000 },
    kirov: { troops: 1500 },
    vologda: { troops: 1500 },
    // Білорусь — місце збору
    homel: { troops: 7000 },
    minsk: { troops: 8000 },
  },
  sides: {
    UA: { pp: 14, support: 42, resilience: 82, drones: 6, missiles: 0, techs: ['mines'], allocDrones: 25, allocMissiles: 0 },
    RU: { pp: 45, support: 78, resilience: 88, drones: 0, missiles: 60, techs: ['cruise', 'ew'], allocDrones: 8, allocMissiles: 14 },
  },
};
