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
async function navigate(route){await command('Page.navigate',{url:origin+route});await wait("document.readyState==='complete'");}
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



  await command('Page.addScriptToEvaluateOnNewDocument',{source: `window.guideCalls={speak:0,pause:0,resume:0,cancel:0,text:''};for(const method of ['speak','pause','resume','cancel'])speechSynthesis[method]=function(utterance){window.guideCalls[method]++;if(utterance)window.guideCalls.text=utterance.text};`});
  const time=()=>evaluate("+document.querySelector('.dashboard-timeline [role=slider]').getAttribute('aria-valuenow')");
  const button=async(text)=>evaluate(`[...document.querySelectorAll('.dashboard-controls button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);
  const guide=async(text)=>evaluate(`[...document.querySelectorAll('.accessibility-tools button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);
  for(const name of ['electric-sky','living-ocean','temperature']){
    await navigate('/mission-control/'+name);
    await wait("document.querySelector('.dashboard-controls .mc-primary') && !document.querySelector('.dashboard-controls .mc-primary').disabled",60000);
    assert.equal(await time(),0);
    assert.equal(await evaluate('window.audioContexts.length'),0);
    assert.equal(await evaluate('window.guideCalls.speak'),0);
    assert.ok(await evaluate("[...document.querySelectorAll('audio')].every(a=>a.paused)"));
    const ax=await command('Accessibility.getFullAXTree');
    for(const node of ax.nodes.filter(n=>!n.ignored&&['button','combobox','slider','spinbutton'].includes(n.role?.value)))assert.ok(node.name?.value?.trim(),name+' unnamed '+node.role.value);
    await evaluate("document.querySelector('.accessibility-tools a').focus()");
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    assert.equal(await evaluate('document.activeElement.tagName'),'MAIN');
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    assert.ok(await evaluate('document.activeElement!==document.body'));
    await evaluate(`const select=document.querySelector('[aria-label="Available source locations"]');select.value='0';select.dispatchEvent(new Event('change',{bubbles:true}));`);
    await wait("!!document.querySelector('.map-selected-point')");
    assert.ok(await evaluate("document.querySelector('.selection-announcement').textContent.length>10"));
    await click('.dashboard-controls .mc-primary');await wait("+document.querySelector('.dashboard-timeline [role=slider]').getAttribute('aria-valuenow')>.1");
    await guide('Audio Guide');
    const at=await time();await new Promise(r=>setTimeout(r,200));assert.equal(await time(),at);
    assert.equal(await evaluate('window.guideCalls.speak'),1);
    assert.match(await evaluate('window.guideCalls.text'),/ISS LIS|OSCAR|GISTEMP/);
    await guide('Pause guidance');assert.equal(await evaluate('window.guideCalls.pause'),1);
    await guide('Resume guidance');assert.equal(await evaluate('window.guideCalls.resume'),1);
    await guide('Stop guidance');
    await guide('Audio Guide');const cancelled=await evaluate('window.guideCalls.cancel');
    await click('.dashboard-controls .mc-primary');assert.ok(await evaluate('window.guideCalls.cancel')>cancelled);
    await button('Stop');assert.equal(await time(),0);
    for(let i=0;i<8;i++){await click('.dashboard-controls .mc-primary');await button('Stop');}
    await new Promise(r=>setTimeout(r,250));assert.equal(await time(),0);
    await button('Restart');await wait("+document.querySelector('.dashboard-timeline [role=slider]').getAttribute('aria-valuenow')>.1");
    await evaluate("document.querySelector('.dashboard-timeline [role=slider]').focus()");
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End'});
    const end=await time();await new Promise(r=>setTimeout(r,300));assert.equal(await time(),end);
    assert.equal(await evaluate("+document.querySelector('.dashboard-timeline [role=slider]').getAttribute('aria-valuemax')"),end);
    await guide('High contrast');assert.equal(await evaluate("document.documentElement.classList.contains('sonara-high-contrast')"),true);
    await guide('High contrast');
    await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.mc-button')).transitionDuration"),'1e-05s');
    await command('Emulation.setEmulatedMedia',{features:[]});
    await button('Restart');await wait("+document.querySelector('.dashboard-timeline [role=slider]').getAttribute('aria-valuenow')>.1");
    await evaluate("window.oldMedia=[...document.querySelectorAll('audio')]");
    await click('.dashboard-heading a');await wait("!document.querySelector('.experience-dashboard')");
    await wait("window.audioContexts.every(c=>c.state==='closed') && window.oldMedia.every(a=>a.paused)");
    passed(name+' no autoplay, AX names, keyboard skip, source selection, guide interruption/pause/resume/stop, rapid play/stop, restart, end, contrast, reduced motion, route cleanup');
  }
  await navigate('/mission-control');assert.equal(await evaluate('window.guideCalls.speak'),0);
  await guide('Audio Guide');assert.match(await evaluate('window.guideCalls.text'),/Mission Control/);await guide('Stop guidance');
  await command('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(window,'speechSynthesis',{value:undefined,configurable:true})"});
  await navigate('/mission-control');
  assert.equal(await evaluate("[...document.querySelectorAll('.accessibility-tools button')].find(b=>b.textContent==='Audio Guide').disabled"),true);
  assert.match(await evaluate("document.querySelector('.accessibility-tools [role=status]').textContent"),/unavailable/);
  passed('Mission Control guide and unsupported speech fallback');
  assert.deepEqual(errors,[]);
  await writeFile(path.join(output,'accessibility-audio-results.json'),JSON.stringify({results,errors},null,2));
}finally{
  if(pageSocket?.readyState===1){pageSocket.send(JSON.stringify({id:++id,method:'Browser.close'}));pageSocket.close();}
  if(chrome.exitCode===null){await Promise.race([new Promise(resolve=>chrome.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,2000))]);if(chrome.exitCode===null)chrome.kill();}chrome.stderr?.destroy();server.closeAllConnections();server.close();
  // Only the uniquely created isolated test profile may be removed.
  if(path.resolve(profile).startsWith(path.resolve(os.tmpdir())+path.sep+'sonara-browser-')){try{await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:100});}catch{console.log('Isolated temporary Chrome profile retained:',profile);}}
}
