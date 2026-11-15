import { readFile, readdir, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { wavDuration } from './integrate-ocean.mjs';

// The checkout must have been freshly fetched before this command is run.
const upstream = path.resolve(process.env.EARTHJUKEBOX_SOURCE || '.artifacts/EarthJukeBox');
const commit = execFileSync('git', ['-C', upstream, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const tracked = execFileSync('git', ['-C', upstream, 'ls-tree', '-r', '--name-only', 'HEAD'], { encoding: 'utf8' }).trim().split('\n');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const records = [];
let verifiedWavs = 0;
for (const file of tracked) {
  // This integration is confined to Ocean. Other experiences keep their data.
  if (!file.startsWith('data/processed/oscar/') && !file.startsWith('data/processed/temperature/') && ![
    'audio/oscarMonthlyBassoon.html', 'audio/oscarMonthlyBassoon.js', 'audio/oceanComparison.js',
    'scripts/build_oscar_spacetime.py', 'scripts/render_oscar_audio.py',
    'audio/temperaturePlayer.js', 'sonification/scannerScore.js',
  ].includes(file)) continue;
  const bytes = await readFile(path.join(upstream, file));
  const record = { source: file, sha256: hash(bytes), bytes: bytes.length };
  let target;
  if (file.startsWith('data/processed/oscar/')) {
    const relative = file.slice('data/processed/oscar/'.length);
    if (relative.startsWith('comparison/')) target = 'public/data/ocean/' + relative;
    else if (relative.startsWith('web/') || relative.startsWith('audio_previews/') || relative === 'months.json') {
      target = 'public/data/ocean/' + relative;
      // Existing source assets must match. Never silently replace or duplicate recordings.
      const existing = await readFile(target);
      if (hash(existing) !== record.sha256) throw Error('Existing asset differs from latest main: ' + target);
      if (file.endsWith('.wav')) {
        if (wavDuration(bytes) !== 25 || wavDuration(existing) !== 25) throw Error('Invalid original WAV: ' + file);
        const pointer = execFileSync('git', ['-C', upstream, 'show', commit + ':' + file], { maxBuffer: 3e6 }).toString();
        if (!pointer.includes('oid sha256:' + record.sha256) || !pointer.includes('size ' + bytes.length)) throw Error('Git LFS object mismatch: ' + file);
        verifiedWavs++;
      }
    }
  } else if (file === 'scripts/build_oscar_spacetime.py') target = file;
  if (target) {
    await mkdir(path.dirname(target), { recursive: true });
    let exists = false;
    try { exists = hash(await readFile(target)) === record.sha256; } catch {}
    if (!exists) await copyFile(path.join(upstream, file), target);
    record.target = target;
  }
  records.push(record);
}
if (verifiedWavs !== 48) throw Error('Expected exactly 48 verified original Ocean WAVs');
const walk = async root => (await Promise.all((await readdir(root, { withFileTypes: true })).map(async e => e.isDirectory() ? walk(path.join(root, e.name)) : [path.join(root, e.name)]))).flat();
if ((await walk('public/data/ocean')).filter(f => f.endsWith('.wav')).length !== 48) throw Error('Duplicate Ocean WAVs');
// Keep original algorithm fixtures available for repeatable offline parity tests.
for (const file of ['audio/oceanComparison.js', 'audio/oscarMonthlyBassoon.js', 'audio/temperaturePlayer.js', 'sonification/scannerScore.js', 'scripts/render_oscar_audio.py']) {
  const target = 'tests/fixtures/nimer/' + path.posix.basename(file);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(path.join(upstream, file), target);
}
// Chart drawing is an unchanged upstream function, with an explicit context.
const chartSource = await readFile(path.join(upstream, 'audio/oceanComparison.js'), 'utf8');
const chart = chartSource.slice(chartSource.indexOf('function drawChart('), chartSource.indexOf('\nfunction render(){'))
  .replace('function drawChart(values,base,comparison)', 'export function drawComparisonChart(ctx: CanvasRenderingContext2D, values: (number|null)[], base: string, comparison: string)')
  .replace('const present=values.filter(v=>Number.isFinite(v));', 'const present=values.filter((v): v is number=>Number.isFinite(v));')
  .replace('const x=i=>', 'const x=(i:number)=>').replace('const y=v=>', 'const y=(v:number)=>')
  .replaceAll('y(v)', 'y(v!)');
await writeFile('src/living-ocean/comparison-chart.ts', '// Drawing ported from EarthJukeBox oceanComparison.js at ' + commit + '\nconst YEAR = 2023;\n' + chart + '\n');
await mkdir('docs', { recursive: true });
await writeFile('docs/nimer-source-manifest.json', JSON.stringify({ repository: 'https://github.com/Namalomaa/EarthJukeBox', branch: 'main', commit, verifiedWavs, files: records }, null, 2) + '\n');
console.log(JSON.stringify({ commit, inspectedFiles: records.length, verifiedWavs, assets: records.filter(r => r.target).length }));
