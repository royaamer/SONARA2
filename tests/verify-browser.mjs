/** Isolated production-browser verification. Uses installed Chrome and native CDP; installs nothing. */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const output=path.resolve('.artifacts/browser');await mkdir(output,{recursive:true});
const bundle=await build({stdin:{contents:"export { ScannerAudioEngine } from './src/electric-sky/audio-engine'; export { buildDayIndex, buildScannerScore } from './src/electric-sky/scanner-score';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser',logLevel:'silent'});
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
  await navigate('/');await wait("!!document.querySelector('[data-testid=button-skip-intro]')");await click('[data-testid=button-skip-intro]');await wait("document.querySelector('[data-testid=root-observatory]')?.dataset.intro==='done'");
  await screenshot('sonara-home-desktop');
  assert.equal(await evaluate("document.querySelector('meta[property=\"og:title\"]').content"),'SONARA');
  assert.equal(await evaluate("!!document.querySelector('.exp-nav')"),false);
  assert.equal(await evaluate("!!document.querySelector('[data-testid=button-begin-listening]')"),true);passed('homepage selection removed; primary actions preserved');
  assert.equal(await evaluate("document.querySelectorAll('.ob-nav button').length"),2);assert.equal(await evaluate("!!document.querySelector('[data-testid=nav-explore]') || !!document.querySelector('[data-testid=nav-experiences]')"),false);passed('homepage navigation contains only About and Accessibility');
  await click('[data-testid=nav-about]');await wait("document.querySelector('[data-testid=dialog-about]')?.open");const aboutEn=await evaluate("document.querySelector('[data-testid=dialog-about]').textContent");for(const phrase of ['transforms Earth observation data into sound','The Electric Sky is currently available','NASA ISS LIS','not actual recordings of lightning','The Living Ocean','The Breathing Forest','The Frozen Earth','accessible and engaging'])assert.ok(aboutEn.includes(phrase),`missing About fact: ${phrase}`);await click('[data-testid=button-dialog-close]');passed('English About dialog contains the requested project and data facts');
  await click('[data-testid=button-language]');await wait("document.querySelector('[data-testid=nav-about]').textContent.includes('عن المشروع')");await click('[data-testid=nav-about]');await wait("document.querySelector('[data-testid=dialog-about]')?.open");const aboutAr=await evaluate("document.querySelector('[data-testid=dialog-about]').textContent");for(const phrase of ['يحوّل SONARA بيانات رصد الأرض إلى صوت','السماء الكهربائية','NASA ISS LIS','ليست تسجيلات فعلية للبرق','المحيط الحي','الغابة التي تتنفس','الأرض المتجمدة'])assert.ok(aboutAr.includes(phrase),`missing Arabic About fact: ${phrase}`);await click('[data-testid=button-dialog-close]');passed('Arabic About dialog contains the requested project and data facts');
  assert.equal(await evaluate("document.querySelectorAll('.voice-onboarding,.sky-voice').length"),0);assert.deepEqual(await evaluate('window.voiceCalls'),{speech:0,recognition:0,microphone:0});passed('voice assistant sections removed; homepage and language changes stay silent');
  await click('[data-testid=button-language]');await wait("document.querySelector('[data-testid=nav-about]').textContent==='About'");
  const offline=await evaluate(`(async()=>{const {ScannerAudioEngine,buildDayIndex,buildScannerScore}=await import('/__test/modules.js');const data=await(await fetch('/data/lightning/2017-03.json')).json();const score=buildScannerScore(buildDayIndex(data)[0]);async function render(muted){const c=new OfflineAudioContext(1,25*22050,22050);const proxy=new Proxy(c,{get(target,key){if(key==='resume')return async()=>{};if(key==='state')return 'running';const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v;}});const engine=new ScannerAudioEngine(()=>proxy);engine.load(score);engine.setMuted(muted);await engine.play();const buffer=await c.startRendering();let peak=0,sum=0;for(const v of buffer.getChannelData(0)){peak=Math.max(peak,Math.abs(v));sum+=v*v;}return {peak,rms:Math.sqrt(sum/buffer.length)};}return {audible:await render(false),muted:await render(true),eventCount:score.events.length};})()`);
  assert.ok(offline.audible.peak>.01&&offline.audible.peak<=1);assert.ok(offline.audible.rms>.001);assert.equal(offline.muted.peak,0);await writeFile(path.join(output,'audio-waveform.json'),JSON.stringify(offline,null,2));passed('native OfflineAudioContext produces nonzero PCM waveform; mute produces digital silence');
  assert.deepEqual(errors,[]);
  await writeFile(path.join(output,'welcome-results.json'),JSON.stringify({results,offline,errors},null,2));
}finally{
  if(pageSocket?.readyState===1){pageSocket.send(JSON.stringify({id:++id,method:'Browser.close'}));pageSocket.close();}
  if(chrome.exitCode===null){await Promise.race([new Promise(resolve=>chrome.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,2000))]);if(chrome.exitCode===null)chrome.kill();}chrome.stderr?.destroy();server.closeAllConnections();server.close();
  // Only the uniquely created isolated test profile may be removed.
  if(path.resolve(profile).startsWith(path.resolve(os.tmpdir())+path.sep+'sonara-browser-')){try{await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:100});}catch{console.log('Isolated temporary Chrome profile retained:',profile);}}
}

// Current experiences share geographic maps and waveform sliders. Run their
// dedicated regression suites instead of obsolete card/inspector/range selectors.
const suites=['navigation','experience-dashboard','map-quality','temporal-playback','final-audio','ocean-year','playback-policy'];
const outcomes=[];
async function worker(){
  while(suites.length){
    const name=suites.shift();
    const outcome=await new Promise(resolve=>{
      const child=spawn(process.execPath,['tests/'+name+'.browser.mjs'],{windowsHide:true,env:process.env,stdio:['ignore','pipe','pipe']});
      let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
      child.once('error',error=>resolve({name,code:1,log:log+'\n'+error.message}));
      child.once('exit',code=>resolve({name,code,log}));
    });
    await writeFile(path.join(output,'suite-'+name+'.log'),outcome.log);
    outcomes.push({name:outcome.name,code:outcome.code});
    console.log((outcome.code===0?'PASS ':'FAIL ')+name+' browser suite');
    if(outcome.code!==0)console.error(outcome.log.slice(-3000));
  }
}
await Promise.all([worker(),worker()]);
await writeFile(path.join(output,'final-suite-results.json'),JSON.stringify(outcomes,null,2));
assert.ok(outcomes.every(result=>result.code===0),'Every current browser suite must pass; see .artifacts/browser/suite-*.log');
