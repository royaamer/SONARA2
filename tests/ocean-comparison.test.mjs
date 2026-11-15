import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { transform } from 'esbuild';
import { assertOceanSource, assertSource } from './nimer-source.mjs';
import { wavDuration } from '../scripts/integrate-ocean.mjs';

async function module(file) {
  const { code } = await transform(await readFile(file, 'utf8'), { loader: 'ts', format: 'cjs' });
  const m = { exports: {} }; new Function('module', 'exports', code)(m, m.exports); return m.exports;
}
const { sampleComparison, verifyComparisonCatalog, verifyComparisonMonth, oceanStylePath } = await module('src/living-ocean/comparison.ts');
const json = async file => JSON.parse(await readFile('public/data/ocean/' + file));
const catalog = verifyComparisonCatalog(await json('comparison/months.json'));
const months = new Map(await Promise.all(catalog.months.map(async entry => {
  const bytes = await readFile('public/data/ocean/comparison/' + entry.file);
  await assertOceanSource('comparison/' + entry.file, bytes);
  return [entry.month, verifyComparisonMonth(entry.month, catalog.grid, JSON.parse(bytes))];
})));

test('all twelve monthly comparison grids match upstream, including masks and coverage', async () => {
  assert.equal(months.size, 12);
  await assertOceanSource('comparison/months.json', await readFile('public/data/ocean/comparison/months.json'));
  assertSource('scripts/build_oscar_spacetime.py', await readFile('scripts/build_oscar_spacetime.py'));
  for (const month of months.values()) {
    assert.equal(month.validDays.filter(n => n > 0).length, catalog.months.find(entry => entry.month === month.month).validGridCells);
    const invalid = structuredClone(month); invalid.meanSpeedMps[0] = 0; invalid.validDays[0] = 0;
    assert.throws(() => verifyComparisonMonth(month.month, catalog.grid, invalid));
  }
  assert.throws(() => verifyComparisonCatalog({ ...catalog, source: 'invented' }));
  assert.throws(() => verifyComparisonCatalog({ ...catalog, months: [catalog.months[0], catalog.months[0]] }));
});

test('monthly sampling exactly matches Nimer at ocean, land, polar and dateline locations', async () => {
  const original = await readFile('tests/fixtures/nimer/oceanComparison.js', 'utf8');
  assertSource('audio/oceanComparison.js', Buffer.from(original));
  const fn = original.slice(original.indexOf('function sample('), original.indexOf('\nfunction baseMonth('));
  const sample = new Function('state', fn + ';return sample;')({ data: months });
  for (const month of months.keys()) for (const lon of [-180, -179.9, -150, -60, 0, 35, 80, 179.9, 180])
    for (const lat of [-90, -65, -20, 0, 31, 37, 85, 90]) assert.deepEqual(sampleComparison(months.get(month), lon, lat), sample(month, lon, lat));
  assert.equal(sampleComparison(undefined, 0, 0), null);
  assert.equal(sampleComparison(months.get('2023-01'), NaN, 0), null);
});

test('monthly speed means reproduce daily vector magnitudes at the comparison reference footprint', async () => {
  const music = await json('months.json'), g = catalog.grid;
  const gx = (-60 - g.lonStart + 360) % 360 / g.lonStep, gy = (g.latStart - 37) / g.latStep;
  const ids = [Math.floor(gy) * g.width + Math.floor(gx), Math.floor(gy) * g.width + Math.floor(gx) + 1,
    (Math.floor(gy) + 1) * g.width + Math.floor(gx), (Math.floor(gy) + 1) * g.width + Math.floor(gx) + 1];
  for (const entry of music.months) {
    const manifest = await json(entry.manifest), sums = ids.map(() => ({ u: 0, v: 0, speed: 0, count: 0 }));
    for (const day of manifest.days) {
      const field = await json(entry.fieldsRoot + day.file);
      ids.forEach((id, corner) => { const u = field.u[id], v = field.v[id]; if (!Number.isFinite(u) || !Number.isFinite(v)) return;
        const sum = sums[corner]; sum.u += u; sum.v += v; sum.speed += Math.hypot(u, v); sum.count++;
      });
    }
    const summary = months.get(entry.month);
    ids.forEach((id, corner) => {
      const sum = sums[corner]; assert.equal(summary.validDays[id], sum.count);
      for (const [key, total] of [['meanSpeedMps', sum.speed], ['meanUMps', sum.u], ['meanVMps', sum.v]])
        assert.ok(Math.abs(summary[key][id] - total / sum.count) <= .000050001, entry.month + ' ' + key);
    });
  }
});

test('all original soundtrack styles and Bassoon are unique, intact 25-second WAVs for every month', async () => {
  const music = await json('months.json'); let count = 0;
  for (const entry of music.months) {
    const files = [...['deep_ocean', 'hybrid', 'orchestral'].map(style => oceanStylePath(entry.audio, style)), entry.bassoon];
    assert.equal(new Set(files).size, 4);
    for (const file of files) { const bytes = await readFile('public/data/ocean/' + file); await assertOceanSource(file, bytes); assert.equal(wavDuration(bytes), 25); count++; }
  }
  assert.equal(count, 48);
  const walk = async dir => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? walk(dir + '/' + e.name) : [e.name]))).flat();
  assert.equal((await walk('public/data/ocean')).filter(file => file.endsWith('.wav')).length, 48);
});

test('comparison chart preserves the original drawing commands and selected month markers', async () => {
  const original = await readFile('tests/fixtures/nimer/oceanComparison.js', 'utf8');
  const draw = new Function('ctx', 'YEAR', original.slice(original.indexOf('function drawChart('), original.indexOf('\nfunction render(')) + ';return drawChart;');
  const port = await module('src/living-ocean/comparison-chart.ts');
  function context() { const calls = [], target = { canvas: { width: 840, height: 310 } }; return { calls, ctx: new Proxy(target, {
    get: (t, k) => k in t ? t[k] : (...args) => calls.push([k, ...args]), set: (t, k, v) => { calls.push([k, v]); t[k] = v; return true; },
  }) }; }
  for (const point of [{ lon: -60, lat: 37 }, { lon: 35, lat: 31 }]) {
    const values = [...months.values()].map(month => sampleComparison(month, point.lon, point.lat)?.speed ?? null);
    const a = context(), b = context(); draw(a.ctx, 2023)(values, '2023-01', '2023-12'); port.drawComparisonChart(b.ctx, values, '2023-01', '2023-12'); assert.deepEqual(b.calls, a.calls);
  }
});

test('soundtrack metadata follows the original renderer event strides, durations and octaves', async () => {
  const { soundtrackNotes, soundtrackSourceEvent } = await module('src/living-ocean/soundtrack.ts');
  const audit = await json('audio_previews/sonification_audit.json');
  // These are the three arrangements documented in the original render() function.
  const source = await readFile('tests/fixtures/nimer/render_oscar_audio.py'); assertSource('scripts/render_oscar_audio.py', source);
  for (const [style, stride, highDuration, lowDuration] of [['deep_ocean', 4, null, 5.4], ['hybrid', 2, 1.85, 2.1], ['orchestral', 1, 1, 1.15]]) {
    const events = audit.note_events.filter((_, i) => i % stride === 0);
    for (const seconds of [0, .5, 1, 3, 6, 12, 18, 24.9, 25]) {
      const expected = events.flatMap(event => {
        const offset = seconds - event.at_seconds;
        if (offset < 0) return [];
        return [...(highDuration && offset < event.duration_seconds * highDuration ? [event.midi_note] : []),
          ...(offset < (style === 'deep_ocean' ? 5.4 : event.duration_seconds * lowDuration) ? [event.midi_note - 12] : [])];
      });
      assert.deepEqual(soundtrackNotes(audit, seconds, style).map(e => e.note), expected);
      assert.deepEqual(soundtrackSourceEvent(audit, seconds, style), events.findLast(e => e.at_seconds <= seconds) ?? null);
    }
  }
});
