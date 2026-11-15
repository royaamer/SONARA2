import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform,build} from 'esbuild';
import {runInNewContext} from 'node:vm';
import {inspectOcean} from '../scripts/integrate-ocean.mjs';
import {assertOceanSource} from './nimer-source.mjs';
const root='public/data/ocean/';
const json=async p=>JSON.parse(await readFile(root+p,'utf8'));
test('monthly catalog and all referenced assets match the latest source catalog',async()=>{
 const bytes=await readFile(root+'months.json');
 await assertOceanSource('months.json',bytes);
 const catalog=JSON.parse(bytes);
 assert.equal(catalog.dataset,'NASA PO.DAAC OSCAR_L4_OC_FINAL_V2.0');
 for(const month of catalog.months){
   const manifest=await json(month.manifest);
   assert.equal(manifest.days.length,month.days);
   assert.equal(manifest.days[0].date,month.dateStart);
   assert.equal(manifest.days.at(-1).date,month.dateEnd);
   for(const path of [month.manifest,month.audio,month.audit,month.bassoon,month.bassoonAudit,...manifest.days.map(d=>month.fieldsRoot+d.file)])
     await assertOceanSource(path,await readFile(root+path));
 }
});
test('Ocean worker loads catalog paths and fails closed for missing or corrupted assets',async()=>{
 const code=(await transform(await readFile('src/living-ocean/loader.worker.ts','utf8'),{loader:'ts'})).code;
 async function load(mutate,month='2023-11'){
   const messages=[],requested=[];
   const self={postMessage:m=>messages.push(m)};
   const fetch=async url=>{
     const path=url.replace('https://sonara.test/ocean/','');requested.push(path);
     const value=await json(path),result=mutate?.(path,value);
     return {ok:result!=='missing',status:result==='missing'?404:200,json:async()=>value};
   };
   runInNewContext(code,{self,fetch});
   await self.onmessage({data:{root:'https://sonara.test/ocean/',month}});
   return {messages,requested};
 }
 const good=await load();
 assert.equal(good.messages.at(-1).data.fields.length,30);
 assert.equal(good.requested[0],'months.json');
 for(const month of ['2023-01','2023-02','2023-11','2023-12']){
   const loaded=await load(undefined,month),d=loaded.messages.at(-1).data;
   assert.ok(d,JSON.stringify(loaded.messages.at(-1)));
   assert.equal(d.fields.length,new Date(Date.UTC(2023,+month.slice(5),0)).getUTCDate());
   assert.equal(d.fields[0].date,month+'-01');assert.equal(d.fields.at(-1).date,month+'-'+d.fields.length);
   assert.equal(d.bassoonAudit.month,month);assert.ok(loaded.requested.includes(d.selected.audit));
   assert.equal(loaded.requested.includes('web/sonification_metrics.json'),month==='2023-11');
 }
 for(const corrupt of [
   (p,v)=>{if(p==='months.json')v.dataset='wrong';},
   (p,v)=>{if(p==='web/2023-11-30.json')v.u[0]='invalid';},
   p=>p==='web/2023-11-15.json'?'missing':undefined,
   (p,v)=>{if(p==='availability.json')v.months.find(m=>m.month==='2023-11').ready=false;},
   (p,v)=>{if(p==='audio_previews/bassoon_audit.json')v.source_files[0]='wrong.nc';},
 ]){
   const result=await load(corrupt);
   assert.ok(result.messages.at(-1).error);
   assert.ok(!result.messages.some(m=>m.data));
 }
});
test('all 365 days, twelve monthly WAV/audit packages and optional metrics validate independently',async()=>{
 const result=await inspectOcean(root);
 assert.equal(result.dailyFiles,365);assert.equal(result.uniqueDailyHashes,365);
 assert.equal(result.months.length,12);assert.ok(result.months.every(m=>m.ready&&m.bassoon&&m.issues.length===0));
 assert.equal(result.months.filter(m=>m.metricsPath).length,1);
});
test('particle strokes exactly match the current EarthJukeBox renderer and depend on the selected daily field',async()=>{
 const bundle=await build({entryPoints:['src/living-ocean/renderer.ts'],bundle:true,write:false,format:'cjs',platform:'node'});
 const rendererModule={exports:{}};
 class Observer { observe(){} disconnect(){} }
 runInNewContext(bundle.outputFiles[0].text,{module:rendererModule,exports:rendererModule.exports,ResizeObserver:Observer,MutationObserver:Observer,window:{devicePixelRatio:1,addEventListener(){},removeEventListener(){}}});
 const {createOceanRenderer}=rendererModule.exports;
 const sourceCode=await readFile('tests/fixtures/nimer/oscarMonthlyBassoon.js','utf8');
 const helpers=sourceCode.slice(sourceCode.indexOf('function sampleField'),sourceCode.indexOf('function showBassoonStatus'));
 const manifest=await json('web/2023-02/manifest.json'),first=await json('web/2023-02/2023-02-01.json'),last=await json('web/2023-02/2023-02-28.json');
 function context(){return {strokes:[],setTransform(){},clearRect(){},save(){},restore(){},fillRect(){},beginPath(){this.points=[];},moveTo(x,y){this.points.push(x,y);},lineTo(x,y){this.points.push(x,y);},stroke(){this.strokes.push([...this.points,this.strokeStyle,this.lineWidth]);}};}
 const expected=context();
 runInNewContext(`const W=1600,H=800;const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));const px=lon=>(lon+180)/360*W,py=lat=>(90-lat)/180*H;let seeds=[],particles=[],rngState=0,lastAudioTime=0,lastFrame=0,shownEvent=0;function random(){rngState=(1664525*rngState+1013904223)>>>0;return rngState/4294967296;}const VISUAL={thickness:2.2,trailSeconds:9,brightness:1};${helpers};drawMetadata=()=>{};buildSeedPool();reset();integrate(.7,0);`,{manifest,fields:[first,first],selected:{month:'2023-02'},ctx:expected,audio:{currentTime:0}});
 function actual(field){const ctx=context();const renderer=createOceanRenderer({width:1600,height:800,getBoundingClientRect:()=>({width:1600,height:800}),closest:()=>null,getContext:()=>ctx},manifest,[field,field],'2023-02');renderer.reset();ctx.strokes=[];renderer.advance(0,.7,.1);renderer.dispose();return ctx.strokes;}
 assert.ok(expected.strokes.length>0);
 assert.deepEqual(JSON.parse(JSON.stringify(actual(first))),JSON.parse(JSON.stringify(expected.strokes)));
 assert.notDeepEqual(actual(first),actual(last),'different genuine fields must change current paths');
});
test('all 30 OSCAR grids preserve original u/v and missing values',async()=>{
 const m=await json('web/manifest.json');assert.equal(m.days.length,30);
 for(let i=0;i<30;i++){
 const day=m.days[i];assert.equal(day.date,`2023-11-${String(i+1).padStart(2,'0')}`);
 const bytes=await readFile(root+'web/'+day.file);await assertOceanSource('web/'+day.file,bytes);
 const f=JSON.parse(bytes);assert.equal(f.date,day.date);assert.equal(f.u.length,m.grid.width*m.grid.height);assert.equal(f.v.length,f.u.length);assert.ok(f.u.includes(null));assert.ok(f.u.some(x=>Number.isFinite(x)&&x!==0));
 }
});
test('all three soundtracks, score audit and metrics are byte-identical to EarthJukeBox',async()=>{
 for(const file of ['audio_previews/deep_ocean_OSCAR.wav','audio_previews/hybrid_OSCAR.wav','audio_previews/orchestral_OSCAR.wav','audio_previews/sonification_audit.json','web/sonification_metrics.json'])await assertOceanSource(file,await readFile(root+file));
 const audit=await json('audio_previews/sonification_audit.json');assert.equal(audit.duration_seconds,25);assert.equal(audit.source_files.length,30);assert.equal(audit.days.length,30);assert.equal(audit.note_events.length,16);
});
