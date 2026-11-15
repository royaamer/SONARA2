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


  const setSelect=async(label,value)=>evaluate(`(()=>{const e=document.querySelector('select[aria-label="${label}"]');const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;setter.call(e,'${value}');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  async function verifyScale() {
    const state = await evaluate("(()=>{const output=document.querySelector('.temporal-reading output'),scale=document.querySelector('.scientific-scale-value'),pointer=document.querySelector('.scientific-scale-indicator span');return {value:output.textContent,scale:scale.textContent,accessible:scale.getAttribute('aria-label'),pointer:pointer?{value:Number(pointer.dataset.value),left:parseFloat(pointer.style.left),animation:getComputedStyle(pointer).animationName}:null};})()");
    if (/Missing|No data/.test(state.value)) { assert.equal(state.pointer,null); assert.match(state.scale,/No data/); }
    else { assert.ok(state.pointer); assert.ok(Math.abs(parseFloat(state.value)-state.pointer.value)<.00011); assert.ok(state.pointer.left>=0 && state.pointer.left<=100); assert.equal(state.pointer.animation,'none'); assert.ok(state.accessible.includes(state.pointer.value.toFixed(3))); }
    return state;
  }
  for(const name of (process.env.OCEAN_NAMES_ONLY ? ['living-ocean'] : ['electric-sky','temperature','living-ocean'])){
    await navigate('/mission-control/'+name);
    await wait("!!document.querySelector('.dashboard-controls .mc-primary') && !document.querySelector('.dashboard-controls .mc-primary').disabled",45000);
    await evaluate("(()=>{for(const [label,v] of [['Latitude','30'],['Longitude','-40']]){const e=document.querySelector('input[aria-label='+label+']');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));}})()");
    await click('.coordinate-selection button');
    await wait("!!document.querySelector('.map-selected-point')");
    if(name==='living-ocean'){
      for(const [lon,lat,ocean] of [[-150,20,'Pacific Ocean'],[-40,30,'Atlantic Ocean'],[80,-20,'Indian Ocean'],[0,85,'Arctic Ocean'],[0,-65,'Southern Ocean'],[35,31,'Ocean region unavailable']]){
        await evaluate(`(()=>{for(const [label,v] of [['Latitude','${lat}'],['Longitude','${lon}']]){const e=document.querySelector('input[aria-label='+label+']');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
        await click('.coordinate-selection button');
        await wait(`document.querySelector('.selection-reading strong')?.textContent===${JSON.stringify(ocean)}`);
        assert.ok(await evaluate(`document.querySelector('.selection-reading').textContent.includes('Latitude ${lat.toFixed(2)}')`));
      }
      passed('All five ocean names update immediately; land keeps coordinates and unavailable label');
      if(process.env.OCEAN_NAMES_ONLY)continue;
      await evaluate("(()=>{for(const [label,v] of [['Latitude','30'],['Longitude','-40']]){const e=document.querySelector('input[aria-label='+label+']');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));}})()");
      await click('.coordinate-selection button');
    }
    await setSelect('Audio mode','temporal');await setSelect('Playback scope','selected');
    await wait("!!document.querySelector('.temporal-reading output') && !document.querySelector('.dashboard-controls .mc-primary').disabled",90000);
    assert.ok(await evaluate("document.querySelector('.pcm-waveform svg').querySelectorAll('line').length>200"));
    assert.equal(await evaluate("document.querySelectorAll('.temporal-date option').length"),name==='temperature'?12:name==='living-ocean'?365:32);
    await verifyScale();
    for(const [width,height] of [[1366,768],[1280,720],[390,844],[320,740]]){
      await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
      await new Promise(r=>setTimeout(r,120));
      assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false,name+' horizontal overflow');
      if(width>900 && !process.env.SCIENTIFIC_SCALE_ONLY){
        const layout=await evaluate("(()=>{const p=document.querySelector('.dashboard-playback').getBoundingClientRect(),i=document.querySelector('.dashboard-information');return {bottom:p.bottom,body:document.documentElement.scrollHeight,info:i.scrollHeight,client:i.clientHeight}})()");
        assert.ok(layout.bottom<=height+1,name+' playback visible '+JSON.stringify(layout));
        assert.ok(layout.body<=height+1,name+' page fits '+JSON.stringify(layout));
      }
      await screenshot('temporal-'+name+'-'+width);
    }
    await command('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
    await click('.dashboard-controls .mc-primary');await wait("+document.querySelector('.pcm-waveform svg').getAttribute('aria-valuenow')>.65");
    await verifyScale();
    await click('.dashboard-controls .mc-primary');
    const frozenScale=await verifyScale();
    const paused=await evaluate("+document.querySelector('.pcm-waveform svg').getAttribute('aria-valuenow')");await new Promise(r=>setTimeout(r,150));assert.equal(await evaluate("+document.querySelector('.pcm-waveform svg').getAttribute('aria-valuenow')"),paused);
    assert.deepEqual(await verifyScale(),frozenScale);
    await click('.temporal-controls button:nth-child(2)');
    await wait("+document.querySelector('.pcm-waveform svg').getAttribute('aria-valuenow')===0");
    assert.equal(await evaluate("+document.querySelector('.temporal-date select').value"),0);
    await verifyScale();
    await evaluate("document.querySelector('.pcm-waveform svg').focus()");await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Home',code:'Home'});for(let i=0;i<3;i++)await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});
    await wait("+document.querySelector('.temporal-date select').value===5");
    assert.equal(await evaluate("document.querySelector('.temporal-reading h2').textContent"),await evaluate("document.querySelector('.temporal-date select').selectedOptions[0].textContent"));
    await evaluate("document.querySelector('.pcm-waveform svg').focus()");await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});
    assert.ok(await evaluate("+document.querySelector('.pcm-waveform svg').getAttribute('aria-valuenow')>=3"));
    await verifyScale();
    await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await verifyScale();
    const tree=await command('Accessibility.getFullAXTree');assert.ok(tree.nodes.some(n=>n.role?.value==='slider'));
    await evaluate("(()=>{const e=document.querySelector('input[aria-label=Longitude]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'70');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await click('.coordinate-selection button');
    await wait("!document.querySelector('.dashboard-controls .mc-primary').disabled",90000);
    await verifyScale();
    await setSelect('Audio mode','original');
    await wait("!!document.querySelector('.original-waveform')");
    await click('.dashboard-controls .mc-primary');
    await wait("+document.querySelector('.pcm-waveform svg').getAttribute('aria-valuenow')>.2");
    await click('.dashboard-controls .mc-primary');
    passed(name+' temporal selection, PCM waveform, seek, audio clock, keyboard, AX tree, original mode and responsive layout');
    await evaluate("void (window.leavingContexts=[...window.audioContexts]);void (window.leavingAudio=[...document.querySelectorAll('audio')])");
    await click('.dashboard-heading a');await wait("location.pathname==='/mission-control'");
    await wait("window.leavingContexts.every(c=>c.state==='closed') && window.leavingAudio.every(a=>a.paused)");
    passed(name+' SPA navigation closes audio contexts and stops original media');
  }
  assert.deepEqual(errors,[]);
}finally{
  if(pageSocket?.readyState===1){pageSocket.send(JSON.stringify({id:++id,method:'Browser.close'}));pageSocket.close();}
  if(chrome.exitCode===null){await Promise.race([new Promise(resolve=>chrome.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,2000))]);if(chrome.exitCode===null)chrome.kill();}chrome.stderr?.destroy();server.closeAllConnections();server.close();
  // Only the uniquely created isolated test profile may be removed.
  if(path.resolve(profile).startsWith(path.resolve(os.tmpdir())+path.sep+'sonara-browser-')){try{await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:100});}catch{console.log('Isolated temporary Chrome profile retained:',profile);}}
}
