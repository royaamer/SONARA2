/** Isolated production-browser verification. Uses installed Chrome and native CDP; installs nothing. */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const output=path.resolve('.artifacts/browser');await mkdir(output,{recursive:true});
const bundle={outputFiles:[]};
const dist=path.resolve(process.env.SONARA_TEST_DIST||'dist');let missingData=false;let missingOcean=false;
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/__test/modules.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}if(missingOcean&&url.pathname==='/data/ocean/audio_previews/2023-02/deep_ocean_OSCAR.wav'){res.writeHead(404);res.end();return;}if(missingData&&url.pathname==='/data/lightning/2017-03.json'){res.writeHead(404);res.end();return;}const target=path.resolve(dist,'.'+decodeURIComponent(url.pathname));if(!target.startsWith(dist+path.sep)&&target!==dist){res.writeHead(403);res.end();return;}let file=target;if(!path.extname(file))file=path.join(dist,'index.html');const bytes=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg','.wav':'audio/wav'})[path.extname(file)]||'application/octet-stream');if(path.extname(file)==='.wav'){res.setHeader('Accept-Ranges','bytes');const match=req.headers.range?.match(/bytes=(\d+)-(\d*)/);if(match){const start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),bytes.length-1):bytes.length-1;res.writeHead(206,{'Content-Range':'bytes '+start+'-'+end+'/'+bytes.length,'Content-Length':end-start+1});res.end(bytes.subarray(start,end+1));return;}res.setHeader('Content-Length',bytes.length);}res.end(bytes);}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const profile=await mkdtemp(path.join(os.tmpdir(),'sonara-browser-'));
const chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--window-size=1440,1000','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let browserSocket;let pageSocket;const errors=[];const results=[];const oceanAssetFailures=[];
function connect(url){return new Promise((resolve,reject)=>{const ws=new WebSocket(url);ws.addEventListener('open',()=>resolve(ws),{once:true});ws.addEventListener('error',reject,{once:true});});}
let id=0;const pending=new Map();
function command(method,params={}){return new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout: '+method));},30000);pending.set(n,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});pageSocket.send(JSON.stringify({id:n,method,params}));});}
async function evaluate(expression){const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function wait(expression,timeout=15000){const until=Date.now()+timeout;while(Date.now()<until){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,75));}console.log('Timeout state:',await evaluate("({text:document.body.innerText,audio:[...document.querySelectorAll('audio')].map(a=>({ready:a.readyState,error:a.error?.message,src:a.currentSrc,duration:a.duration})),errors:window.testConsoleErrors})"));throw Error('Timed out: '+expression);}
async function click(selector){await wait(`!!document.querySelector(${JSON.stringify(selector)})`);const box=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...box});await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...box});}
async function navigate(route){if(await evaluate('!!window.voiceCalls'))assert.deepEqual(await evaluate('window.voiceCalls'),{speech:0,recognition:0,microphone:0});await command('Page.navigate',{url:origin+route});await wait("document.readyState==='complete'");}
async function screenshot(name){
  assert.match(await evaluate('document.title'),/SONARA/);
  assert.equal(await evaluate("document.querySelector('.ob-brand-word,.mc-brand > span')?.firstChild.textContent + (document.querySelector('.ob-brand-word > span')?.textContent || '')"),'SONARA');
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.ob-brand,.mc-brand')).every(e=>{const r=e.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth+1;})"),true,'brand fits viewport');
  assert.doesNotMatch(await evaluate("document.body.innerText + ' ' + Array.from(document.querySelectorAll('[aria-label]')).map(e=>e.getAttribute('aria-label')).join(' ')"),/earth[ _-]?echo|\u0635\u062f\u0649 \u0627\u0644\u0623\u0631\u0636/i);
const r=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(output,name+'.png'),Buffer.from(r.data,'base64'));}
function passed(name){results.push(name);console.log('PASS '+name);}
try{
  const endpoint=await new Promise((resolve,reject)=>{let text='';const timeout=setTimeout(()=>reject(Error('Chrome debugging endpoint unavailable')),15000);chrome.once('error',reject);chrome.stderr.on('data',b=>{text+=b;const m=text.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timeout);resolve(m[1]);}});});
  const debugOrigin=new URL(endpoint);const tabs=await (await fetch(`http://${debugOrigin.host}/json`)).json();const page=tabs.find(t=>t.type==='page');pageSocket=await connect(page.webSocketDebuggerUrl);
  pageSocket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(Error(m.error.message));else p?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
  await command('Page.enable');await command('Emulation.setFocusEmulationEnabled',{enabled:true});await command('Runtime.enable');await command('Network.enable');await command('Network.setCacheDisabled',{cacheDisabled:true});
  pageSocket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Network.responseReceived'){const r=m.params.response;if(r.url.includes('/data/ocean/')&&r.status>=400&&!missingOcean)oceanAssetFailures.push({url:r.url,status:r.status});}});
  await command('Page.addScriptToEvaluateOnNewDocument',{source:"window.testConsoleErrors=[];const originalConsoleError=console.error;console.error=(...args)=>{window.testConsoleErrors.push(args.map(String).join(' '));originalConsoleError(...args);};"});
  await command('Page.addScriptToEvaluateOnNewDocument',{source:`window.voiceCalls={speech:0,recognition:0,microphone:0};speechSynthesis.speak=()=>{window.voiceCalls.speech++;};class DisabledRecognition{start(){window.voiceCalls.recognition++;}abort(){}}window.SpeechRecognition=window.webkitSpeechRecognition=DisabledRecognition;if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{window.voiceCalls.microphone++;return Promise.reject(Error('Unexpected microphone request'));};`});
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});

  await command('Page.addScriptToEvaluateOnNewDocument',{source: `window.audioContexts=[];window.mediaElements=[];const AC=window.AudioContext;window.AudioContext=class extends AC{constructor(...a){super(...a);window.audioContexts.push(this)}};const A=window.Audio;window.Audio=class extends A{constructor(...a){super(...a);window.mediaElements.push(this)}};`});



  await command('Page.addScriptToEvaluateOnNewDocument',{source: `window.audioStarts=0;window.sources=[];for(const C of [OscillatorNode,AudioBufferSourceNode]){const start=C.prototype.start;C.prototype.start=function(...args){window.audioStarts++;window.sources.push(this);this.testEnded=false;this.addEventListener('ended',()=>this.testEnded=true);return start.apply(this,args)};}const disconnect=AudioNode.prototype.disconnect;AudioNode.prototype.disconnect=function(...args){this.testDisconnected=true;return disconnect.apply(this,args)};window.mediaStarts=0;const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(...args){window.mediaStarts++;return play.apply(this,args)};`});
  const setSelect=async(label,value)=>evaluate(`(()=>{const e=document.querySelector('select[aria-label="${label}"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'${value}');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const silent=()=>evaluate("window.sources.every(s=>s.testEnded||s.testDisconnected)&&[...document.querySelectorAll('audio')].every(a=>a.paused)");
  const seek=async(value)=>{await evaluate("document.querySelector('.pcm-waveform svg').focus()");await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Home',code:'Home'});for(let i=0;i<value;i++)await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});};
  await navigate('/');await click('body');assert.equal(await evaluate('window.audioStarts+window.mediaStarts'),0);passed('Welcome interaction never starts audio');
  await navigate('/mission-control');assert.equal(await evaluate('window.audioStarts+window.mediaStarts'),0);
  for(const name of ['electric-sky','temperature','living-ocean']){
    await navigate('/mission-control/'+name);
    await wait("document.querySelector('.dashboard-controls .mc-primary')&&!document.querySelector('.dashboard-controls .mc-primary').disabled",60000);
    assert.equal(await evaluate('window.audioStarts+window.mediaStarts'),0);
    assert.match(await evaluate("document.querySelector('.scientific-scale-value').textContent"),/Full Map.*mean/i);
    assert.ok(await evaluate("Number.isFinite(Number(document.querySelector('.scientific-scale-indicator span')?.dataset.value))"));
    const full=await evaluate("document.querySelector('.scientific-scale-indicator span').dataset.value");
    await seek(2);assert.equal(await silent(),true);assert.equal(await evaluate('window.audioStarts+window.mediaStarts'),0);
    if(name!=='living-ocean')assert.equal(await evaluate("document.querySelector('.scientific-scale-indicator span').dataset.value"),full);
    await click('.dashboard-controls .mc-primary');await wait("document.querySelector('.dashboard-controls .mc-primary').textContent.includes('Pause')");
    await click('.dashboard-controls .mc-primary');assert.equal(await silent(),true);
    await seek(3);assert.equal(await silent(),true);
    await click('.dashboard-controls .mc-primary');await click('.dashboard-controls button:nth-child(2)');assert.equal(await silent(),true);
    await wait("+document.querySelector('.pcm-waveform svg').getAttribute('aria-valuenow')===0");
    // Seek close to the actual end, then explicitly Play. No UI clock polling is needed for source stop.
    await evaluate("document.querySelector('.pcm-waveform svg').focus()");await command('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End'});await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft'});
    await click('.dashboard-controls .mc-primary');await wait("!document.querySelector('.dashboard-controls .mc-primary').textContent.includes('Pause')",5000);
    assert.equal(await silent(),true);const starts=await evaluate('window.audioStarts+window.mediaStarts');await new Promise(r=>setTimeout(r,300));assert.equal(await evaluate('window.audioStarts+window.mediaStarts'),starts);
    const end=await evaluate("+document.querySelector('.pcm-waveform svg').getAttribute('aria-valuenow')");assert.equal(end,await evaluate("+document.querySelector('.pcm-waveform svg').getAttribute('aria-valuemax')"));
    await setSelect('Audio mode','temporal');await wait("!document.querySelector('.dashboard-controls .mc-primary').disabled",90000);assert.equal(await silent(),true);
    assert.match(await evaluate("document.querySelector('.scientific-scale-value').textContent"),/Full Map.*mean/i);
    await click('.dashboard-controls .mc-primary');await click('.temporal-controls button:nth-child(2)');assert.equal(await silent(),true);
    await evaluate("document.querySelector('.pcm-waveform svg').focus()");await command('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End'});await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft'});assert.equal(await silent(),true);
    await click('.dashboard-controls .mc-primary');await wait("!document.querySelector('.dashboard-controls .mc-primary').textContent.includes('Pause')",5000);assert.equal(await silent(),true);
    await click('.dashboard-controls .mc-primary');await evaluate("document.querySelector('.pcm-waveform svg').focus()");await command('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End'});await wait("!document.querySelector('.dashboard-controls .mc-primary').textContent.includes('Pause')");assert.equal(await silent(),true);
    await click('.dashboard-controls .mc-primary');
    await evaluate("(()=>{for(const [label,v] of [['Latitude','90'],['Longitude','0']]){const e=document.querySelector('input[aria-label='+label+']');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));}})()");
    await click('.coordinate-selection button');assert.equal(await silent(),true);
    await setSelect('Playback scope','selected');await wait("!document.querySelector('.dashboard-controls .mc-primary').disabled",90000);assert.equal(await silent(),true);
    if(name!=='temperature')assert.match(await evaluate("document.querySelector('.scientific-scale-value').textContent"),/No data/);
    await click('.dashboard-controls .mc-primary');await setSelect('Audio mode','original');assert.equal(await silent(),true);
    await click('.dashboard-controls .mc-primary');await click('.dashboard-heading a');await wait("location.pathname==='/mission-control'");assert.equal(await silent(),true);
    passed(name+' full-map pointer, no autoplay, silent seek/restart, original and temporal completion, replay and navigation');
  }
  assert.deepEqual(errors,[]);
}finally{
  if(pageSocket?.readyState===1){pageSocket.send(JSON.stringify({id:++id,method:'Browser.close'}));pageSocket.close();}
  if(chrome.exitCode===null){await Promise.race([new Promise(resolve=>chrome.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,2000))]);if(chrome.exitCode===null)chrome.kill();}chrome.stderr?.destroy();server.closeAllConnections();server.close();
  // Only the uniquely created isolated test profile may be removed.
  if(path.resolve(profile).startsWith(path.resolve(os.tmpdir())+path.sep+'sonara-browser-')){try{await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:100});}catch{console.log('Isolated temporary Chrome profile retained:',profile);}}
}
