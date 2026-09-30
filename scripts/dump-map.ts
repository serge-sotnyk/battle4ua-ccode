import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('.debug', { recursive: true });
import { buildMap } from '../src/engine/map/build';
import { REGION_DEFS } from '../src/engine/map/regions';
import { project } from '../src/engine/map/geometry';

const t0 = Date.now();
const m = buildMap();
console.log('build ms', Date.now() - t0);
const fills: Record<string, string> = { UA: '#6f86ff', RU: '#ff8a7a', BY: '#9bb59a' };
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.width} ${m.height}" width="${m.width}" height="${m.height}" style="background:#0a1a2e">`;
svg += `<path d="${m.landPath}" fill="#2b2f3a" fill-rule="evenodd"/>`;
for (const id of m.order) {
  const r = m.regions[id];
  svg += `<path d="${r.path}" fill="${fills[r.country]}" stroke="#fff" stroke-width="0.8"/>`;
}
svg += `<path d="${m.dniproPath}" fill="none" stroke="#6cf" stroke-width="1.2"/>`;
for (const id of m.order) {
  const r = m.regions[id];
  const d = REGION_DEFS.find((x) => x.id === id)!;
  svg += `<text x="${r.label[0].toFixed(0)}" y="${r.label[1].toFixed(0)}" font-size="9" text-anchor="middle" fill="#000">${d.name.split(' ')[0]}</text>`;
}
for (let lon = 15; lon <= 50; lon += 5) {
  const a = project(lon, 41), b = project(lon, 61.5);
  svg += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#ff0" stroke-width="0.5" opacity="0.5"/><text x="${a[0]}" y="${a[1]-4}" font-size="11" fill="#ff0">${lon}</text>`;
}
for (let lat = 42; lat <= 61; lat += 2) {
  const a = project(14, lat), b = project(50, lat);
  svg += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#ff0" stroke-width="0.5" opacity="0.5"/><text x="${a[0]+3}" y="${a[1]-2}" font-size="11" fill="#ff0">${lat}</text>`;
}
svg += '</svg>';
writeFileSync('.debug/map-debug.svg', svg);
// Крупний план України
{
  const a = project(21.5, 53.2), b = project(41.5, 44.0);
  const vb = `${a[0]} ${a[1]} ${b[0] - a[0]} ${b[1] - a[1]}`;
  writeFileSync('.debug/ua-debug.svg', svg.replace(/viewBox="[^"]+"/, `viewBox="${vb}"`).replace(/width="\d+" height="\d+"/, 'width="1400" height="1000"').replace('background:#0a1a2e', 'background:#05101c').replace(/font-size="9"/g, 'font-size="6"'));
}
if (process.argv.includes('--adj')) for (const id of m.order) console.log(id.padEnd(16), m.neighbors[id].join(', '));
console.log('edges', m.edges.length);
