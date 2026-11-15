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
function command(method,params={}){return new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});pageSocket.send(JSON.stringify({id:n,method,params}));});}
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
  await click('[data-testid=button-begin-listening]');await wait("location.pathname==='/mission-control' && document.querySelectorAll('.mc-experience-card').length===5");const beginElapsed=Number(await evaluate("document.documentElement.dataset.navTransitionMs"));
  assert.ok(beginElapsed>=1200&&beginElapsed<=1600,`expected 1.2-1.5s zoom, got ${beginElapsed}ms`);assert.equal(await evaluate("!!document.querySelector('.mc-arrival,[inert]')"),false);assert.equal(await evaluate("getComputedStyle(document.querySelector('.mc-experience-card')).animationDuration"),'0.2s');
  assert.equal(await evaluate("document.querySelectorAll('.mc-card-status.is-available').length"),3);await screenshot('selection-desktop');assert.equal(await evaluate("document.querySelectorAll('canvas').length"),0);passed(`Begin Listening zoom and crossfade completed in ${beginElapsed}ms; no arrival overlay; cards fade in over 200ms`);
  assert.equal(await evaluate("document.querySelectorAll('.mc-console-section,#observatory-console,.mc-workspace').length"),0);passed('3D observatory is absent from the rendered selection screen');
  for(const key of ['forest','ice']){await click('.mc-experience-'+key);await wait("!!document.querySelector('.mc-coming')");assert.equal(await evaluate("location.pathname"),'/mission-control');await click('.mc-coming button');await wait("document.querySelectorAll('.mc-experience-card').length===5");}passed('both Coming Soon experiences return to selection without redirecting');
  await click('.mc-experience-sky');await wait("!!document.querySelector('#sky-date')");await wait("document.querySelectorAll('#sky-date option').length===32");
  assert.equal(await evaluate("document.querySelectorAll('.sky .scientific-hud-indicator').length"),3);
  assert.ok(await evaluate("(()=>{const selectors=['.sky-map','.scientific-hud','.sky-transport','.sky-position','.experience-science'];return selectors.every((s,i)=>!i||!!(document.querySelector(selectors[i-1]).compareDocumentPosition(document.querySelector(s))&Node.DOCUMENT_POSITION_FOLLOWING));})()"));assert.equal(await evaluate("document.querySelectorAll('#sky-date optgroup')[0].querySelectorAll('option').length"),31);assert.equal(await evaluate("document.querySelectorAll('#sky-date optgroup')[1].querySelectorAll('option').length"),1);assert.match(await evaluate("document.querySelector('.sky-boundary-note').textContent"),/April/);await screenshot('electric-sky-desktop');passed('Electric Sky route loads monthly dataset, all March dates, and explicit April boundary observations');
  const offline=await evaluate(`(async()=>{const {ScannerAudioEngine,buildDayIndex,buildScannerScore}=await import('/__test/modules.js');const data=await(await fetch('/data/lightning/2017-03.json')).json();const score=buildScannerScore(buildDayIndex(data)[0]);async function render(muted){const c=new OfflineAudioContext(1,25*22050,22050);const proxy=new Proxy(c,{get(target,key){if(key==='resume')return async()=>{};if(key==='state')return 'running';const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v;}});const engine=new ScannerAudioEngine(()=>proxy);engine.load(score);engine.setMuted(muted);await engine.play();const buffer=await c.startRendering();let peak=0,sum=0;for(const v of buffer.getChannelData(0)){peak=Math.max(peak,Math.abs(v));sum+=v*v;}return {peak,rms:Math.sqrt(sum/buffer.length)};}return {audible:await render(false),muted:await render(true),eventCount:score.events.length};})()`);
  assert.ok(offline.audible.peak>.01&&offline.audible.peak<=1);assert.ok(offline.audible.rms>.001);assert.equal(offline.muted.peak,0);await writeFile(path.join(output,'audio-waveform.json'),JSON.stringify(offline,null,2));passed('native OfflineAudioContext produces nonzero PCM waveform; mute produces digital silence');
  await click('.sky-transport .mc-primary');await wait("document.querySelector('#sky-position').value > 1");
  assert.equal(await evaluate("document.querySelector('.experience-science').open"),false);
  await click('.experience-science > summary');
  await wait("document.querySelectorAll('.sky-readings strong')[2].textContent !== '\u2014'");
  await wait("document.querySelectorAll('.sky-map-overlay circle').length>0");
  const synchronized=await evaluate(`(async()=>{const {buildDayIndex,buildScannerScore}=await import('/__test/modules.js');const data=await(await fetch('/data/lightning/2017-03.json')).json();const score=buildScannerScore(buildDayIndex(data)[0]);const sliderSeconds=+document.querySelector('#sky-position').value;const x=+document.querySelector('.sky-scan-line').getAttribute('x1');const seconds=x/1000*24;const event=score.events.filter(e=>e.at<=seconds).at(-1);const uiFrequency=document.querySelectorAll('.sky-readings strong')[2].textContent;
const cards=[...document.querySelectorAll('.scientific-hud dd')].map(e=>e.textContent);
const active=score.events.filter(e=>e.at<=seconds&&seconds<e.at+e.duration+.26).at(-1);
if(cards[0]!==score.count.toLocaleString('en'))throw Error('Flash count mismatch');
if(cards[1]!==(-180+360*seconds/score.seconds).toLocaleString('en',{minimumFractionDigits:1,maximumFractionDigits:1})+'°')throw Error('Longitude mismatch');
if(active&&!cards[2].includes((440*2**((active.note-69)/12)).toLocaleString('en',{minimumFractionDigits:1,maximumFractionDigits:1})+' Hz'))throw Error('Live note mismatch');
return {frequency:uiFrequency,expected:(440*2**((event.note-69)/12)).toLocaleString('en',{minimumFractionDigits:1,maximumFractionDigits:1})+' Hz',difference:Math.abs(seconds-sliderSeconds)};})()`);
  assert.equal(synchronized.frequency,synchronized.expected);assert.ok(synchronized.difference<=.0051,'range input rounds to its 0.01-second step; map retains full audio-clock precision');passed('source-derived frequency and scanner position match the same playback clock');
  const playing=await evaluate("({position:+document.querySelector('#sky-position').value,status:document.querySelector('.dashboard-status').textContent,frequency:document.querySelectorAll('.sky-readings strong')[2].textContent})");
  assert.equal(playing.status,'Scanning west to east');await click('.sky-transport button[title="Pause"]');await wait("document.querySelector('.dashboard-status').textContent==='Scanner paused'");
  assert.equal(await evaluate("document.querySelectorAll('.scientific-hud dd')[2].textContent"),'—');
  const paused=await evaluate("+document.querySelector('#sky-position').value");await new Promise(r=>setTimeout(r,300));assert.equal(await evaluate("+document.querySelector('#sky-position').value"),paused);
  await click('.sky-transport .mc-primary');await wait(`+document.querySelector('#sky-position').value > ${paused+.3}`);await screenshot('electric-sky-scanning');
  await evaluate("const slider=document.querySelector('#sky-volume');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(slider,'0.3');slider.dispatchEvent(new Event('input',{bubbles:true}));slider.dispatchEvent(new Event('change',{bubbles:true}));");assert.equal(await evaluate("document.querySelector('.sky-volume output').textContent"),'30%');
  await click('.sky-volume button');assert.equal(await evaluate("document.querySelector('.sky-volume button').getAttribute('aria-pressed')"),'true');await click('.sky-volume button');
  await evaluate("const select=document.querySelector('#sky-date');select.value='1';select.dispatchEvent(new Event('change',{bubbles:true}));");await wait("document.querySelector('#sky-position').value==='0'");assert.equal(await evaluate("document.querySelector('.scientific-hud dd').textContent"),'1,990');passed('real-time scanner, pause/resume, volume, mute, and date-change reset');
  await click('.sky-transport .mc-primary');await wait("+document.querySelector('#sky-position').value>.2");await click('.sky-transport button[title="Stop"]');await wait("document.querySelector('#sky-position').value==='0'");assert.equal(await evaluate("document.querySelectorAll('.sky-readings strong')[2].textContent"),'\u2014');passed('Stop resets playback, scanner, and generated-note telemetry');
  await evaluate("const boundarySelect=document.querySelector('#sky-date');boundarySelect.value='31';boundarySelect.dispatchEvent(new Event('change',{bubbles:true}));");await wait("document.querySelector('.scientific-hud dd').textContent==='9'");assert.equal(await evaluate("+document.querySelector('#sky-position').value"),0);
  await evaluate("const input=document.querySelector('#sky-position');const positionSet=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;positionSet.call(input,'11');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));");await click('.sky-transport .mc-primary');await wait("+document.querySelector('#sky-position').value>13");await wait("document.querySelectorAll('.sky-readings strong')[2].textContent.includes('Hz')");await click('.sky-transport button[title=\"Stop\"]');passed('April boundary observations are selectable and produce data-driven audio');
  assert.deepEqual(await evaluate('window.testConsoleErrors'),[]);passed('Lightning playback has no console errors');
  assert.equal(await evaluate("document.querySelectorAll('.sky-voice').length"),0);assert.deepEqual(await evaluate('window.voiceCalls'),{speech:0,recognition:0,microphone:0});
  assert.equal(await evaluate("document.querySelectorAll('.sky-decode,#sky-science,.sky-science-tabs,.sky-science-panel').length"),0);assert.equal(await evaluate("document.querySelectorAll('.sky-telemetry,.sky-lab').length"),2);passed('explanation UI removed while actual scientific telemetry and audio lab remain');
  await evaluate("window.returnOverlays=[];window.returnObserver=new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n.nodeType===1&&(n.matches('.mc-arrival,.intro')||n.querySelector('.mc-arrival,.intro')||n.textContent.trim()==='SONARA / ...'))window.returnOverlays.push(n.className||n.textContent);});window.returnObserver.observe(document.body,{childList:true,subtree:true});");
  await click('.sky-return');
  assert.equal(await evaluate("location.pathname"),'/mission-control');assert.equal(await evaluate("document.querySelectorAll('.mc-experience-card').length"),5);assert.equal(await evaluate("document.querySelectorAll('.mc-arrival,[inert]').length"),0);assert.deepEqual(await evaluate("window.returnOverlays"),[]);assert.equal(await evaluate("window.scrollY"),0);passed('Electric Sky RETURN immediately shows five choices with no intro or loading overlay');
  await click('.mc-experience-sky');await wait("!!document.querySelector('#sky-date')");await evaluate("window.scrollTo(0,document.body.scrollHeight);history.back();");await wait("location.pathname==='/mission-control' && document.querySelectorAll('.mc-experience-card').length===5");assert.equal(await evaluate("!!document.querySelector('.mc-arrival')"),false);passed('browser Back from a scrolled lightning page returns to selection without an intro');
  await evaluate("document.querySelector('.mc-brand').click()");await wait("location.pathname==='/' && !!document.querySelector('[data-testid=button-begin-listening]')");assert.equal(await evaluate("document.querySelectorAll('.nav-transition-earth').length"),0);passed('Mission Control RETURN navigates immediately without reverse WebGL preview');await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});const reducedStarted=Date.now();await click('[data-testid=button-begin-listening]');await wait("location.pathname==='/mission-control' && document.querySelectorAll('.mc-experience-card').length===5");const reducedElapsed=Date.now()-reducedStarted;assert.ok(reducedElapsed<500,`reduced motion should navigate immediately, got ${reducedElapsed}ms`);assert.equal(await evaluate("!!document.querySelector('.mc-arrival')"),false);passed(`reduced-motion navigation completed in ${reducedElapsed}ms without zoom`);await command('Emulation.setEmulatedMedia',{features:[]});
  await click('.mc-experience-sky');await wait("!!document.querySelector('#sky-date')");
  await click('.mc-language');await wait("document.documentElement.dir==='rtl'");assert.match(await evaluate("document.querySelector('h1').textContent"),/السماء/);assert.equal(await evaluate("document.querySelector('.sky-map').dir"),'ltr');
  await evaluate("window.scrollTo(0,0)");await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await screenshot('electric-sky-arabic-mobile');
  assert.ok(await evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"));passed('Arabic/RTL and mobile layout without horizontal overflow');
  await click('.mc-back');assert.equal(await evaluate("document.querySelectorAll('.mc-experience-card').length"),5);assert.equal(await evaluate("!!document.querySelector('.mc-arrival')"),false);passed('Arabic header RETURN immediately shows experience selection');await screenshot('selection-arabic-mobile');assert.ok(await evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"));
  await click('.mc-experience-forest');await wait("!!document.querySelector('.mc-coming')");assert.match(await evaluate("document.querySelector('.mc-coming').textContent"),/غير متاحة/);passed('Arabic Coming Soon and return navigation');
  await navigate('/mission-control/electric-sky');await wait("!!document.querySelector('#sky-date')");await click('.sky-return');assert.equal(await evaluate("document.querySelectorAll('.mc-experience-card').length"),5);assert.equal(await evaluate("!!document.querySelector('.mc-arrival')"),false);passed('direct Electric Sky page load also returns without initialization');

  await click('.mc-experience-ocean');
  await wait("!!document.querySelector('#ocean-month')?.value");
  assert.notEqual(await evaluate("document.querySelector('#ocean-visual-date').textContent"),'—');
  await wait("document.querySelectorAll('#ocean-month option:not(:disabled)').length===12 && !document.querySelector('.ocean-transport button').disabled",30000);
  if(await evaluate("document.documentElement.lang!=='en'")){await click('.mc-language');await wait("document.documentElement.lang==='en'");}
  const oceanCatalog=await evaluate("fetch('/data/ocean/months.json').then(r=>r.json())");
  assert.equal(oceanCatalog.months.length,12);
  await evaluate("window.oceanAudio=document.querySelectorAll('.ocean audio')[0];window.oceanBassoon=document.querySelectorAll('.ocean audio')[1];void 0;");
  async function oceanMonth(month){
    await evaluate("(()=>{const e=document.querySelector('#ocean-month');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,"+JSON.stringify(month)+");e.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await wait("document.querySelector('#ocean-month').value==="+JSON.stringify(month)+" && !document.querySelector('.ocean-transport button').disabled",30000);
  }
  async function oceanSeek(value){
    await evaluate("(()=>{const e=document.querySelector('#ocean-seek');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'"+value+"');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await wait('Math.abs(window.oceanAudio.currentTime-'+(value/1000*25)+')<.02');
  }
  assert.equal(await evaluate("document.querySelectorAll('.ocean .scientific-hud-indicator').length"),3);
  async function dashboardEvidence(name){
    await evaluate("document.querySelector('.ocean-transport').scrollIntoView({block:'start'});");
    const values=await evaluate("[...document.querySelectorAll('.scientific-hud dd')].map(e=>e.textContent)");
    console.log(name,JSON.stringify(values));
    await screenshot(name);
    return values;
  }
  const before=await dashboardEvidence('ocean-dashboard-before-playback');
  assert.notEqual(before[0],'—');
  assert.ok(await evaluate("window.oceanAudio.paused"));
  const order=await evaluate("(()=>{const selectors=['.ocean-stage','.scientific-hud','.ocean-transport','.ocean-timeline','.experience-science'];return selectors.every((s,i)=>!i||!!(document.querySelector(selectors[i-1]).compareDocumentPosition(document.querySelector(s))&Node.DOCUMENT_POSITION_FOLLOWING));})()");
  assert.equal(order,true);
  await click('.experience-science > summary');
  for(const entry of oceanCatalog.months){
    await oceanMonth(entry.month);
    assert.equal(await evaluate('window.oceanAudio.duration'),entry.audioDurationSeconds);
    assert.equal(await evaluate('window.oceanBassoon.duration'),entry.audioDurationSeconds);
    assert.equal(await evaluate('window.oceanAudio.playbackRate'),1);
    assert.equal(await evaluate('window.oceanBassoon.playbackRate'),1);
    assert.ok((await evaluate('window.oceanAudio.currentSrc')).endsWith(entry.audio));
    const initial=await evaluate("[...document.querySelectorAll('.scientific-hud dd')].map(e=>e.textContent)");
    const audit=await evaluate("fetch('/data/ocean/'+"+JSON.stringify(entry.audit)+").then(r=>r.json())");
    const firstIndex=audit.note_events.findLastIndex(e=>e.at_seconds<=0);
    if(firstIndex>=0)assert.equal(initial[1],audit.note_events[Math.floor(firstIndex/4)*4].region.replaceAll('_',' '));
    assert.ok((await evaluate('window.oceanBassoon.currentSrc')).endsWith(entry.bassoon));
    assert.ok((await evaluate("document.querySelector('.ocean-range').textContent")).includes(entry.dateEnd));
    for(const [value,date] of [[0,entry.dateStart],[1000,entry.dateEnd]]){
      await oceanSeek(value);
      const label=await evaluate("new Date("+JSON.stringify(date+'T00:00:00Z')+").toLocaleString('en',{timeZone:'UTC',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})+' UTC'");
      await wait("document.querySelector('#ocean-visual-date').textContent==="+JSON.stringify(label));
    }
    await oceanSeek(0);await click('.ocean-transport .mc-primary');await wait('window.oceanAudio.currentTime>.4');
    assert.ok(await evaluate('Math.abs(window.oceanBassoon.currentTime-window.oceanAudio.currentTime)<.15'));
    assert.ok(await evaluate(`(async()=>{const a=await(await fetch('/data/ocean/'+${JSON.stringify(entry.audit)})).json();const b=await(await fetch('/data/ocean/'+${JSON.stringify(entry.bassoonAudit)})).json();const t=window.oceanAudio.currentTime;const event=b.note_events.find(e=>t>=e.at_seconds&&t<e.at_seconds+e.duration_seconds);const pad=a.note_events.filter((_,i)=>i%4===0).findLast(e=>t>=e.at_seconds&&t<e.at_seconds+5.4);const note=event?.midi_note??(pad?pad.midi_note-12:null);const names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];const expected=note===null?'—':names[note%12]+(Math.floor(note/12)-1);return document.querySelectorAll('.scientific-hud dd')[2].textContent===expected;})()`));
    const regionMatches=await evaluate(`(async()=>{const audit=await(await fetch('/data/ocean/'+${JSON.stringify(entry.audit)})).json();const i=audit.note_events.findLastIndex(e=>e.at_seconds<=window.oceanAudio.currentTime);return i<0||document.querySelectorAll('.scientific-hud dd')[1].textContent===audit.note_events[Math.floor(i/4)*4].region.replaceAll('_',' ');})()`);
    assert.equal(regionMatches,true);
    if(entry===oceanCatalog.months[0])await dashboardEvidence('ocean-dashboard-playing');
    await click('.ocean-transport .mc-primary');assert.equal(await evaluate('window.oceanAudio.paused&&window.oceanBassoon.paused'),true);
  }
  assert.deepEqual(oceanAssetFailures,[]);
  passed('all twelve genuine months load correct original audio; first/last dates, 28/30/31-day coverage, playback and Bassoon synchronization pass');
  await oceanMonth('2023-02');await click('.ocean-transport .mc-primary');await wait('window.oceanAudio.currentTime>.5');
  assert.ok(await evaluate("(()=>{const c=document.querySelector('.ocean canvas');return c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0);})()"));
  await click('.ocean-transport .mc-primary');await click('.ocean-transport .mc-primary');await wait('!window.oceanAudio.paused');
  await click('.ocean-transport button:nth-child(2)');await wait('window.oceanAudio.currentTime<.4 && !window.oceanAudio.paused');
  const restarted=await dashboardEvidence('ocean-dashboard-restarted');
  assert.notEqual(restarted[0],'—');assert.notEqual(restarted[1],'—');
  await click('#ocean-bassoon');assert.equal(await evaluate('window.oceanBassoon.paused'),true);await click('#ocean-bassoon');await wait('!window.oceanBassoon.paused');
  await click('.ocean-transport .mc-primary');await evaluate("document.querySelector('#ocean-seek').focus()");
  for(const [key,code] of [['Home',36],['ArrowRight',39]]){await command('Input.dispatchKeyEvent',{type:'keyDown',key,windowsVirtualKeyCode:code});await command('Input.dispatchKeyEvent',{type:'keyUp',key,windowsVirtualKeyCode:code});}
  await wait('window.oceanAudio.currentTime>0 && window.oceanAudio.currentTime<1');
  await oceanSeek(750);
  const changed=await dashboardEvidence('ocean-dashboard-date-changed');
  assert.notEqual(changed[0],restarted[0]);assert.notEqual(changed[1],'—');
  passed('actual current trails, pause/resume, Restart, Bassoon toggle and keyboard seeking pass');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await evaluate('window.scrollTo(0,0)');await screenshot('living-ocean-desktop');
  await click('.mc-language');await wait("document.documentElement.lang==='ar'");await screenshot('living-ocean-arabic-desktop');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await screenshot('living-ocean-arabic-mobile');assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  assert.deepEqual(await evaluate('window.testConsoleErrors'),[]);passed('full-year Ocean bilingual responsive layout has no console errors');
  await click('.ocean-return');await wait("location.pathname==='/mission-control'");assert.equal(await evaluate('window.oceanAudio.paused&&window.oceanBassoon.paused'),true);assert.equal(await evaluate("window.oceanAudio.hasAttribute('src')||window.oceanBassoon.hasAttribute('src')"),false);passed('Ocean RETURN releases both original audio layers and returns directly');
  await navigate('/mission-control/living-ocean');await wait("!!document.querySelector('.ocean-transport button') && !document.querySelector('.ocean-transport button').disabled",30000);
  await evaluate("window.oceanAudio=document.querySelectorAll('.ocean audio')[0];window.oceanBassoon=document.querySelectorAll('.ocean audio')[1];void 0;");
  missingOcean=true;
  await evaluate("(()=>{const e=document.querySelector('#ocean-month');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'2023-02');e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await wait("!!document.querySelector('.experience-error')",30000);
  assert.equal(await evaluate("document.querySelector('.ocean-transport button').disabled"),true);
  assert.ok((await evaluate('window.oceanAudio.currentSrc')).endsWith('2023-02/deep_ocean_OSCAR.wav'));
  missingOcean=false;await click('.experience-error button');await wait("!document.querySelector('.ocean-transport button').disabled",30000);
  passed('missing monthly WAV disables playback without substituting November audio; Retry recovers');
  await click('.ocean-transport .mc-primary');
  await evaluate("for(const month of ['2023-01','2023-02','2023-12']){const e=document.querySelector('#ocean-month');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,month);e.dispatchEvent(new Event('change',{bubbles:true}));}");
  await wait("document.querySelector('#ocean-month').value==='2023-12' && !document.querySelector('.ocean-transport button').disabled",30000);
  assert.ok((await evaluate('window.oceanAudio.currentSrc')).endsWith('2023-12/deep_ocean_OSCAR.wav'));
  assert.equal(await evaluate('window.oceanAudio.paused&&window.oceanBassoon.paused'),true);
  await evaluate("document.querySelector('#ocean-month').dispatchEvent(new Event('change',{bubbles:true}))");await wait("!document.querySelector('.ocean-transport button').disabled",30000);
  passed('rapid month changes discard stale playback; reselecting the current month reloads safely');
  await click('.ocean-return');
  missingData=true;await navigate('/mission-control/electric-sky');await wait("!!document.querySelector('.sky-load button')");assert.equal(await evaluate("!!document.querySelector('.sky-transport')"),false);passed('missing dataset fails closed with retry and no working-looking playback');
  assert.deepEqual(await evaluate('window.voiceCalls'),{speech:0,recognition:0,microphone:0});passed('no speech or microphone activation on load and navigation');
  assert.deepEqual(errors,[]);passed('no uncaught browser exceptions');
  await writeFile(path.join(output,'results.json'),JSON.stringify({results,offline,errors},null,2));
}finally{
  if(pageSocket?.readyState===1){try{await command('Browser.close');}catch{}pageSocket.close();}
  if(chrome.exitCode===null)chrome.kill();server.close();
  // Only the uniquely created isolated test profile may be removed.
  if(path.resolve(profile).startsWith(path.resolve(os.tmpdir())+path.sep+'sonara-browser-')){try{await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:100});}catch{console.log('Isolated temporary Chrome profile retained:',profile);}}
}
