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
  await command('Page.enable');await command('Runtime.enable');await command('Network.enable');await command('Network.setCacheDisabled',{cacheDisabled:true});
  pageSocket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Network.responseReceived'){const r=m.params.response;if(r.url.includes('/data/ocean/')&&r.status>=400&&!missingOcean)oceanAssetFailures.push({url:r.url,status:r.status});}});
  await command('Page.addScriptToEvaluateOnNewDocument',{source:"window.testConsoleErrors=[];const originalConsoleError=console.error;console.error=(...args)=>{window.testConsoleErrors.push(args.map(String).join(' '));originalConsoleError(...args);};"});
  await command('Page.addScriptToEvaluateOnNewDocument',{source:`window.voiceCalls={speech:0,recognition:0,microphone:0};speechSynthesis.speak=()=>{window.voiceCalls.speech++;};class DisabledRecognition{start(){window.voiceCalls.recognition++;}abort(){}}window.SpeechRecognition=window.webkitSpeechRecognition=DisabledRecognition;if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{window.voiceCalls.microphone++;return Promise.reject(Error('Unexpected microphone request'));};`});
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});

  await command('Page.addScriptToEvaluateOnNewDocument',{source: `window.audioContexts=[];window.mediaElements=[];const AC=window.AudioContext;window.AudioContext=class extends AC{constructor(...a){super(...a);window.audioContexts.push(this)}};const A=window.Audio;window.Audio=class extends A{constructor(...a){super(...a);window.mediaElements.push(this)}};`});
  const noArrival=async()=>assert.equal(await evaluate("!!document.querySelector('.mc-arrival')"),false);
  const welcome=async()=>{await wait("location.pathname==='/' && document.querySelector('[data-testid=root-observatory]')?.dataset.intro==='welcome'");};
  const skip=async()=>{await click('[data-testid=button-skip-intro]');await wait("document.querySelector('[data-testid=root-observatory]')?.dataset.intro==='done'");};
  const routes=['/mission-control','/mission-control/living-ocean','/mission-control/electric-sky'];
  for(const route of routes){
    await navigate(route);await wait("!!document.querySelector('.mc-brand')");await noArrival();
    await click('.mc-brand');await welcome();await noArrival();passed('logo '+route+' -> original Welcome');
    await navigate(route);await wait("!!document.querySelector('.mc-brand')");
    await command('Page.reload');await welcome();await noArrival();passed('refresh '+route+' -> original Welcome');
  }
  await skip();await click('[data-testid=button-begin-listening]');
  await wait("!!document.querySelector('.nav-transition-mission')");await noArrival();
  await wait("location.pathname==='/mission-control' && !document.querySelector('.nav-transition-mission')");await noArrival();
  const duration=await evaluate('Number(document.documentElement.dataset.navTransitionMs)');assert.ok(duration>=1300&&duration<=2100);passed('normal cinematic transition preserved ('+duration+'ms)');
  for(let i=0;i<3;i++){
    await evaluate('history.back()');await wait("location.pathname==='/' && !!document.querySelector('[data-testid=button-begin-listening]')");
    await evaluate('history.forward()');await wait("location.pathname==='/mission-control' && !!document.querySelector('.mc-brand')");await noArrival();
  }passed('repeated Back/Forward never replays arrival');
  await click('.mc-brand');await welcome();await skip();
  await evaluate("document.querySelector('.skip-link').click()");await wait("!!document.querySelector('.mc-arrival')");
  await click('.mc-arrival button');await noArrival();passed('intended welcome shortcut arrival appears and dismisses');
  await navigate('/mission-control/electric-sky');await wait("!!document.querySelector('.sky-transport .mc-primary')",30000);
  await click('.sky-transport .mc-primary');await wait("window.audioContexts.some(c=>c.state==='running')");
  await click('.mc-brand');await welcome();await wait("window.audioContexts.every(c=>c.state==='closed')");passed('Electric Sky active audio closes on logo return');
  await navigate('/mission-control/living-ocean');await wait("!!document.querySelector('.ocean-transport button') && !document.querySelector('.ocean-transport button').disabled",60000);
  await evaluate("void(window.mediaElements=Array.from(document.querySelectorAll('audio')))");
  await click('.ocean-transport button');await wait('window.mediaElements.some(a=>!a.paused)');
  await click('.mc-brand');await welcome();await wait("window.mediaElements.every(a=>a.paused && !a.getAttribute('src'))");passed('Living Ocean active audio stops and clears sources on logo return');
  await navigate('/');await welcome();await click('[data-testid=button-enter]');
  await wait("document.querySelector('[data-testid=root-observatory]')?.dataset.intro==='done'",30000);
  await click('[data-testid=button-begin-listening]');await wait("location.pathname==='/mission-control'");await noArrival();passed('full introduction -> Mission Control');
  await evaluate('history.back()');await wait("location.pathname==='/' && !!document.querySelector('[data-testid=button-begin-listening]')");
  await click('[data-testid=button-begin-listening]');await wait("!!document.querySelector('.nav-transition-mission')");
  await evaluate('history.forward()');await wait("location.pathname==='/mission-control' && !document.querySelector('.nav-transition-mission')");
  await new Promise(resolve=>setTimeout(resolve,2200));await noArrival();assert.equal(await evaluate("document.documentElement.style.getPropertyValue('--nav-progress')"),'');passed('interrupted cinematic transition cancels timer and preview');
  assert.deepEqual(errors,[]);passed('no uncaught browser exceptions');
  await writeFile(path.join(output,'navigation-results.json'),JSON.stringify({results,errors},null,2));
}finally{
  if(pageSocket?.readyState===1){pageSocket.send(JSON.stringify({id:++id,method:'Browser.close'}));pageSocket.close();}
  if(chrome.exitCode===null){await Promise.race([new Promise(resolve=>chrome.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,2000))]);if(chrome.exitCode===null)chrome.kill();}chrome.stderr?.destroy();server.closeAllConnections();server.close();
  // Only the uniquely created isolated test profile may be removed.
  if(path.resolve(profile).startsWith(path.resolve(os.tmpdir())+path.sep+'sonara-browser-')){try{await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:100});}catch{console.log('Isolated temporary Chrome profile retained:',profile);}}
}
