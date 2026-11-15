import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import * as original from './fixtures/earthjukebox-scannerScore.js';
async function loadModule(path) {
  const result=await build({entryPoints:[path],bundle:true,write:false,format:'esm',platform:'node',logLevel:'silent'});
  return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const mapping=await loadModule('src/electric-sky/scanner-score.ts');
const {parseLightningDataset,partitionObservationDates}=await loadModule('src/electric-sky/lightning-data.ts');
const {ScannerAudioEngine}=await loadModule('src/electric-sky/audio-engine.ts');
const raw=await readFile('public/data/lightning/2017-03.json');
const dataset=JSON.parse(raw);
const days=mapping.buildDayIndex(dataset);
test('NASA extract is byte-identical to inspected EarthJukeBox dataset',()=>{
  assert.equal(createHash('sha256').update(raw).digest('hex'),'ee880b08fae6ff6063cfe3b5dc33eaeb828903a0981373deb51794eabe8a88df');
  assert.equal(parseLightningDataset(dataset).flashes.length,67029);
  assert.equal(days.length,32); assert.equal(days[0].day,'2017-03-01');assert.equal(days.at(-1).day,'2017-04-01');
  assert.equal(days.reduce((n,d)=>n+d.flashes.length,0),67029);
});
test('nominal month contains all March dates and preserves April boundary records separately',()=>{
  const calendar=partitionObservationDates(days);
  assert.equal(calendar.primary.length,31);
  assert.deepEqual(calendar.primary.map(d=>d.day),Array.from({length:31},(_,i)=>'2017-03-'+String(i+1).padStart(2,'0')));
  assert.equal(calendar.primary.reduce((n,d)=>n+d.flashes.length,0),67020);
  assert.equal(calendar.additional.length,1);assert.equal(calendar.additional[0].day,'2017-04-01');assert.equal(calendar.additional[0].flashes.length,9);
  assert.equal(new Set(dataset.flashes.map(f=>JSON.stringify(f))).size,dataset.flashes.length);
});
test('TypeScript scanner scores exactly match original EarthJukeBox for every date',()=>{
  assert.deepEqual(days,original.buildDayIndex(dataset));
  for(const day of days){
    const score=mapping.buildScannerScore(day);
    assert.deepEqual(score,original.buildScannerScore(day));
    assert.equal(score.byColumn.reduce((n,b)=>n+b.length,0),day.flashes.length);
    for(const e of score.events){assert.ok(day.flashes.includes(e.flash));assert.ok(e.at>=e.column*.5 && e.at<(e.column+1)*.5);assert.equal(mapping.noteHz(e.note),original.noteHz(e.note));}
  }
});
test('loader rejects corrupted measurements, wrong totals, missing data, and duplicate windows',()=>{
  const bad=structuredClone(dataset);bad.flashes[0].latitude=100;assert.throws(()=>parseLightningDataset(bad));
  const wrong=structuredClone(dataset);wrong.windows[0].flash_count++;assert.throws(()=>parseLightningDataset(wrong));
  const duplicate=structuredClone(dataset);duplicate.windows[1]=duplicate.windows[0];assert.throws(()=>parseLightningDataset(duplicate));
  assert.throws(()=>parseLightningDataset({flashes:[]}));assert.deepEqual(mapping.buildDayIndex([]),[]);
});
test('projection aligns longitude/latitude to the equirectangular map',()=>{
  assert.deepEqual(mapping.projectFlash({latitude:90,longitude:-180}),{x:0,y:0});
  assert.deepEqual(mapping.projectFlash({latitude:0,longitude:0}),{x:500,y:250});
  assert.deepEqual(mapping.projectFlash({latitude:-90,longitude:180}),{x:1000,y:500});
});
class Parameter { value=0; calls=[]; setValueAtTime(v,t){this.value=v;this.calls.push([v,t]);}linearRampToValueAtTime(v,t){this.value=v;this.calls.push([v,t]);}setTargetAtTime(v,t){this.value=v;this.calls.push([v,t]);} }
class Node { gain=new Parameter();frequency=new Parameter();threshold=new Parameter();knee=new Parameter();ratio=new Parameter();frequencyBinCount=64;connect(){}disconnect(){}start(t){this.started=t;}stop(t){this.stopped=t;}getByteFrequencyData(a){a.fill(0);} }
class Context { currentTime=0;state='suspended';destination=new Node();oscillators=[];gains=[];createGain(){const n=new Node();this.gains.push(n);return n;}createOscillator(){const n=new Node();this.oscillators.push(n);return n;}sources=[];createBufferSource(){const n=new Node();this.sources.push(n);return n;}createBuffer(){return {};}createAnalyser(){return new Node();}createDynamicsCompressor(){return new Node();}async resume(){this.state='running';}async suspend(){this.state='suspended';}async close(){this.state='closed';} }
test('audio transport uses one clock and supports pause/resume, seek, volume, mute, stop and disposal',async()=>{
  const context=new Context();let created=0;
  const engine=new ScannerAudioEngine(()=>{created++;return context;});
  const score=mapping.buildScannerScore(days[0]);engine.load(score);assert.equal(created,0,'loading must not activate audio');
  await engine.play();assert.equal(created,1);assert.equal(engine.getSnapshot().status,'playing');
  assert.equal(context.oscillators.length,score.events.length);
  assert.equal(context.oscillators[0].started,score.events[0].at+.06);
  assert.equal(context.oscillators[0].frequency.calls[0][0],mapping.noteHz(score.events[0].note));
  context.currentTime=5.06;assert.equal(engine.getSnapshot().seconds,5);
  await engine.pause();context.currentTime=12;assert.equal(engine.getSnapshot().seconds,5);
  await engine.play();context.currentTime=13.06;assert.ok(Math.abs(engine.getSnapshot().seconds-6)<1e-8);
  engine.setVolume(.2);assert.equal(context.gains[0].gain.value,.2);engine.setMuted(true);assert.equal(context.gains[0].gain.value,0);engine.setMuted(false);assert.equal(context.gains[0].gain.value,.2);
  engine.seek(10);assert.equal(engine.getSnapshot().current,null,'seeking does not claim a note was played');assert.equal(engine.getSnapshot().status,'paused');assert.equal(engine.getSnapshot().seconds,10);
  engine.stop();assert.equal(engine.getSnapshot().seconds,0);assert.equal(engine.getSnapshot().status,'ready');
  engine.load(mapping.buildScannerScore(days[1]));assert.equal(engine.getSnapshot().seconds,0);
  await engine.play();context.currentTime+=25;assert.equal(engine.getSnapshot().status,'complete');
  await engine.dispose();assert.equal(context.state,'closed');
});
test('cancelling a pending audio activation cannot restart a stopped scan',async()=>{
  const context=new Context();let resume;
  context.resume=()=>new Promise(resolve=>{resume=()=>{context.state='running';resolve();};});
  const engine=new ScannerAudioEngine(()=>context);engine.load(mapping.buildScannerScore(days[0]));
  const pending=engine.play();engine.stop();resume();await pending;
  assert.equal(engine.getSnapshot().status,'ready');assert.equal(context.oscillators.length,0);await engine.dispose();
});
test('Pause cancels a pending browser activation before notes are scheduled',async()=>{
  const context=new Context();let resume;
  context.resume=()=>new Promise(resolve=>{resume=()=>{context.state='running';resolve();};});
  const engine=new ScannerAudioEngine(()=>context);engine.load(mapping.buildScannerScore(days[0]));
  const pending=engine.play();const paused=engine.pause();resume();await Promise.all([pending,paused]);
  assert.equal(engine.getSnapshot().status,'paused');assert.equal(context.oscillators.length,0);
  await engine.dispose();
});

test('audio-clock boundary stops every scheduled voice without UI polling and ignores stale completion',async()=>{
 const context=new Context(),engine=new ScannerAudioEngine(()=>context);
 const score=mapping.buildScannerScore(days[0]);engine.load(score);await engine.play();
 const end=score.seconds+.06;
 assert.ok(context.oscillators.every(o=>o.stopped<=end));
 const completion=context.sources.at(-1).onended;
 context.currentTime=end;completion();
 assert.equal(engine.getSnapshot().status,'complete');assert.equal(engine.getSnapshot().seconds,score.seconds);
 assert.ok(context.oscillators.every(o=>o.onended===null));
 engine.stop();completion();assert.equal(engine.getSnapshot().status,'ready');
 await engine.dispose();
});

test('stale rejected activation cannot interrupt a later explicit Play session',async()=>{
 const ctx=new Context;let reject;ctx.resume=()=>new Promise((_,r)=>reject=r);
 const e=new ScannerAudioEngine(()=>ctx);e.load(mapping.buildScannerScore(days[0]));
 const stale=e.play();e.stop();ctx.resume=async()=>{ctx.state='running'};await e.play();
 reject(Error('old activation failed'));await stale;assert.equal(e.playbackState,'playing');await e.dispose();
});
