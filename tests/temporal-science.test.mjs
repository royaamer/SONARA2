import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
const result=await build({entryPoints:['src/experiences/temporal-science.ts'],bundle:true,write:false,format:'esm',define:{'import.meta.env.BASE_URL':'"/"'}});
const m=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const frame=(value)=>({date:'2025-01',value,unit:'test',detail:''});
test('temporal mapping is monotonic, bounded and deterministic',()=>{
 for(const kind of ['temperature','ocean','lightning']){
  const values=kind==='temperature'?[-20,-5,0,5,20]:[0,.1,.8,1.6,1000,10000];
  let previous=-Infinity;
  for(const value of values){const mapped=m.temporalMapping(kind,value);assert.ok(mapped.midi>=48&&mapped.midi<=84);assert.ok(mapped.midi>=previous);assert.ok(mapped.amplitude>=.12&&mapped.amplitude<=.4);previous=mapped.midi;}
 }
});
test('actual generated PCM has correct duration, measured peaks, missing-data silence and envelopes',()=>{
 const pcm=m.renderTemporalPcm([frame(null),frame(0),frame(2)],'temperature');
 assert.equal(pcm.length,28800);assert.ok(pcm.slice(0,9600).every(v=>v===0));assert.ok(pcm.slice(9600,19200).some(v=>v!==0));
 assert.deepEqual(m.pcmPeaks(new Float32Array([0,-.25,.75,-1]),2),[.25,1]);
 assert.deepEqual(m.pcmPeaks(pcm,3)[0],0);
 assert.ok(Math.max(...pcm.slice(9600,19200))<=.401);
 assert.equal(pcm[9600],0);
});
test('playback boundaries and seek positions use exact audio-clock date bins',()=>{
 for(let i=0;i<365;i++)assert.equal(m.temporalIndex(i*.6+.001,365),i);
 assert.equal(m.temporalIndex(999,12),11);assert.equal(m.temporalIndex(-1,12),0);
});
test('lightning selected cells include boundaries, preserve counts and unknown coverage',()=>{
 const days=[{day:'2017-03-01',flashes:[{longitude:0,latitude:0},{longitude:1,latitude:-1},{longitude:50,latitude:50}]},{day:'2017-03-02',flashes:[]}];
 assert.equal(m.lightningSeries(days,{lon:0,lat:0})[0].value,2);
 assert.equal(m.lightningSeries(days,null)[0].value,1.5);
 assert.equal(m.lightningSeries(days,{lon:0,lat:0})[1].value,null);
 assert.match(m.lightningSeries(days,null)[1].detail,/coverage/);
 assert.equal(m.lightningSeries([{day:'x',flashes:[{longitude:180,latitude:-90}]}],{lon:180,lat:-90})[0].value,1);
});
test('temperature temporal extraction uses all twelve original monthly source cells and baseline',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(await readFile('public'+url,'utf8'))});
 try{
  const frames=await m.temperatureSeries({lon:0,lat:0},new AbortController().signal);
  assert.equal(frames.length,12);
  for(const f of frames){const data=JSON.parse(await readFile('public/data/temperature/'+f.date+'.json','utf8'));assert.equal(f.value,data.anomalies[45][90]);assert.match(f.detail,/1951/);assert.equal(f.unit,'°C anomaly');}
  const all=await m.temperatureSeries(null,new AbortController().signal);assert.ok(all.every(f=>Number.isFinite(f.value)));
 }finally{globalThis.fetch=original;}
});
test('ocean temporal sampling preserves 365 daily fields and land masks',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(await readFile('public'+url,'utf8'))});
 try{
  const frames=await m.oceanSeries({lon:-40,lat:30},new AbortController().signal);
  assert.equal(frames.length,365);assert.equal(frames[0].date,'2023-01-01');assert.equal(frames.at(-1).date,'2023-12-31');
  const manifest=JSON.parse(await readFile('public/data/ocean/web/2023-01/manifest.json','utf8'));
  const field=JSON.parse(await readFile('public/data/ocean/web/2023-01/2023-01-01.json','utf8'));
  const grid=manifest.grid,x=140,y=Math.floor((grid.latStart-30)/grid.latStep),a=(grid.latStart-30)/grid.latStep-y;
  const u=field.u[y*360+x]*(1-a)+field.u[(y+1)*360+x]*a;
  const v=field.v[y*360+x]*(1-a)+field.v[(y+1)*360+x]*a;
  assert.ok(Math.abs(frames[0].value-Math.hypot(u,v))<1e-10);
  assert.match(frames[0].detail,/Eastward/);
 }finally{globalThis.fetch=original;}
});
