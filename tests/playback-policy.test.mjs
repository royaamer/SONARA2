import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const load=async path=>{const r=await build({entryPoints:[path],bundle:true,write:false,format:'esm'});return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'))};
const {TemperatureAudioEngine}=await load('src/temperature/audio-engine.ts');
const {oceanMeanSpeed}=await load('src/living-ocean/inspection.ts');
class Param{value=0;setValueAtTime(v){this.value=v}setTargetAtTime(v){this.value=v}cancelScheduledValues(){}}
class Node{gain=new Param;frequency=new Param;threshold=new Param;knee=new Param;ratio=new Param;attack=new Param;release=new Param;connect(){return this}disconnect(){this.disconnected=true}start(t){this.startAt=t}stop(t){this.stopAt=t}getFloatTimeDomainData(a){a.fill(0)}}
class Context{currentTime=0;state='suspended';destination=new Node;voices=[];createGain(){return new Node}createAnalyser(){return new Node}createDynamicsCompressor(){return new Node}createOscillator(){const n=new Node;this.voices.push(n);return n}async resume(){this.state='running'}async close(){this.state='closed'}}
test('temperature stops on the audio clock without animation frames, restart and paused seek stay silent',async()=>{
 const ctx=new Context;globalThis.window={AudioContext:class{constructor(){return ctx}}};
 const e=new TemperatureAudioEngine;e.load(new Int8Array(720*360));assert.equal(ctx.voices.length,0);
 await e.play();assert.ok(ctx.voices.length>0);assert.ok(ctx.voices.every(n=>n.stopAt===24));
 ctx.currentTime=24;ctx.voices[0].onended();assert.equal(e.playbackState,'ended');assert.ok(ctx.voices.every(n=>n.disconnected));
 assert.equal(e.snapshot().seconds,24);e.restart();assert.equal(e.playbackState,'stopped');assert.equal(e.snapshot().seconds,0);
 const count=ctx.voices.length;assert.equal(e.seek(5),false);assert.equal(ctx.voices.length,count);e.dispose();
});
test('temperature cancels pending activation on restart',async()=>{
 const ctx=new Context;let resolve;ctx.resume=()=>new Promise(r=>resolve=()=>{ctx.state='running';r()});globalThis.window={AudioContext:class{constructor(){return ctx}}};
 const e=new TemperatureAudioEngine;e.load(new Int8Array(720*360));const pending=e.play();e.restart();resolve();await pending;assert.equal(ctx.voices.length,0);assert.equal(e.playbackState,'stopped');e.dispose();
});
test('ocean full-map mean uses interpolated source vectors, area weights and missing masks',()=>{
 const data={manifest:{grid:{width:2,latStart:60,latStep:60}},audit:{duration_seconds:10},fields:[{u:[0,2,null,0],v:[0,0,null,2]},{u:[2,4,4,0],v:[0,0,0,4]}]};
 assert.ok(Math.abs(oceanMeanSpeed(data,5)-2.5)<1e-12);
 const missing={...data,fields:data.fields.map(f=>({u:f.u.map(()=>null),v:f.v.map(()=>null)}))};assert.equal(oceanMeanSpeed(missing,5),null);
});

test('temperature ignores rejection from an invalidated activation',async()=>{
 const ctx=new Context;let reject;ctx.resume=()=>new Promise((_,r)=>reject=r);globalThis.window={AudioContext:class{constructor(){return ctx}}};
 const e=new TemperatureAudioEngine;e.load(new Int8Array(720*360));const stale=e.play();e.restart();ctx.resume=async()=>{ctx.state='running'};await e.play();reject(Error('old activation failed'));await stale;assert.equal(e.playbackState,'playing');e.dispose();
});

test('active temperature seek to the end does not grant permission to replay',async()=>{
 const ctx=new Context;globalThis.window={AudioContext:class{constructor(){return ctx}}};const e=new TemperatureAudioEngine;e.load(new Int8Array(720*360));await e.play();assert.equal(e.seek(24),false);assert.equal(e.playbackState,'ended');assert.equal(e.snapshot().seconds,24);e.dispose();
});
