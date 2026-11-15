import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {transform} from 'esbuild';
const source=(spec)=>execFileSync('git',['-c','safe.directory=C:/Users/user/EarthJukeBox','-C','C:/Users/user/EarthJukeBox','show',spec],{maxBuffer:20e6});
const js=source('79102a1:audio/temperaturePlayer.js').toString();
const oceanJs=source('4929d2e:audio/oscarMonthlyBassoon.js').toString();
async function module(file){const {code}=await transform(await readFile(file,'utf8'),{loader:'ts',format:'cjs'});const m={exports:{}};new Function('module','exports',code)(m,m.exports);return m.exports;}
function canvas(){return {getContext(){return {createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},putImageData(img){this.image=img;},clearRect(){},drawImage(){}};}};}
const document={createElement:canvas};
const mapping=await module('src/temperature/mapping.ts');
const inspection=await module('src/living-ocean/inspection.ts');

test('all twelve 2025 datasets and scientific metadata are byte-identical to source commit',async()=>{
 const catalog=JSON.parse(await readFile('public/data/temperature/months.json'));
 assert.equal(catalog.months.length,12);
 for(const name of ['months.json','sonification_audit.json',...catalog.months.map(m=>m.file)])assert.deepEqual(await readFile('public/data/temperature/'+name),source('79102a1:data/processed/temperature/'+name));
});

test('temperature raster and every audio color bin match original player for January and November',async()=>{
 const constants=js.slice(js.indexOf('const DURATION'),js.indexOf('const $'));
 const helpers=js.slice(js.indexOf('const clamp'),js.indexOf('const timeLabel'));
 const functions=js.slice(js.indexOf('function colorBand'),js.indexOf('async function makeCoastlinesVisible'));
 const state={},els={heatmap:{style:{}}},ctx={clearRect(){},drawImage(){}};
 const original=new Function('document','els','heatCtx','state',constants+helpers+functions+'; return renderSmoothHeatmap;')(document,els,ctx,state);
 const saved=globalThis.document;globalThis.document=document;
 try{for(const month of ['2025-01','2025-11']){
  const data=JSON.parse(await readFile('public/data/temperature/'+month+'.json'));
  original(data);const expected=state.rasterBands,actual=mapping.renderSmoothHeatmap(data);
  assert.deepEqual(actual.bands,expected,month+' audio bins');
  // Capture source and port pixel bytes independently on a second render.
  let capture=[];document.createElement=()=>{const c=canvas(),g=c.getContext();c.getContext=()=>g;capture.push(g);return c;};
  original(data);mapping.renderSmoothHeatmap(data);assert.deepEqual(capture[1].image.data,capture[0].image.data,month+' RGBA raster');document.createElement=canvas;
  for(const seconds of [0,6,12,18,24]){const column=mapping.scanColumn(seconds),result=mapping.colorCounts(actual.bands,column);assert.equal(result.counts.reduce((a,b)=>a+b,0),result.valid);assert.ok(result.valid<=1024);}
 }}finally{globalThis.document=saved;document.createElement=canvas;}
});

test('Ocean inspection matches original spatial and time interpolation on real daily fields',async()=>{
 const catalog=JSON.parse(await readFile('public/data/ocean/months.json'));
 const selected=catalog.months[0],root='public/data/ocean/',manifest=JSON.parse(await readFile(root+selected.manifest));
 const fields=await Promise.all(manifest.days.map(async d=>JSON.parse(await readFile(root+selected.fieldsRoot+d.file))));
 const audit=JSON.parse(await readFile(root+selected.audit)),data={manifest,fields,audit,selected};
 const funcs=oceanJs.slice(oceanJs.indexOf('function sampleField'),oceanJs.indexOf('function buildSeedPool'));
 const sample=new Function('manifest','fields','clamp',funcs+';return sample;')(manifest,fields,(x,a,b)=>Math.max(a,Math.min(b,x)));
 for(const lon of [-180,-160,-60,0,70,140,180])for(const lat of [-80,-40,0,37,80])for(const seconds of [0,8.25,25]){
  const actual=inspection.inspectOcean(data,seconds,lon,lat),expected=sample(lon,lat,Math.max(0,Math.min(1,seconds/audit.duration_seconds))*(fields.length-1));
  assert.deepEqual(actual.velocity,expected);if(expected)assert.equal(actual.speed,Math.hypot(expected.u,expected.v));else assert.equal(actual.speed,null);
  if(Math.abs(lat)>73)assert.equal(actual.status,'visual-cutoff');
 }
});
