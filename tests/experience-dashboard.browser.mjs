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
let browserSocket;let pageSocket;const errors=[];const layoutFailures=[];const results=[];const oceanAssetFailures=[];
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
  await command('Page.enable');await command('Emulation.setFocusEmulationEnabled',{enabled:true});await command('Runtime.enable');await command('Network.enable');await command('Network.setCacheDisabled',{cacheDisabled:true});
  pageSocket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Network.responseReceived'){const r=m.params.response;if(r.url.includes('/data/ocean/')&&r.status>=400&&!missingOcean)oceanAssetFailures.push({url:r.url,status:r.status});}});
  await command('Page.addScriptToEvaluateOnNewDocument',{source:"window.testConsoleErrors=[];const originalConsoleError=console.error;console.error=(...args)=>{window.testConsoleErrors.push(args.map(String).join(' '));originalConsoleError(...args);};"});
  await command('Page.addScriptToEvaluateOnNewDocument',{source:`window.voiceCalls={speech:0,recognition:0,microphone:0};speechSynthesis.speak=()=>{window.voiceCalls.speech++;};class DisabledRecognition{start(){window.voiceCalls.recognition++;}abort(){}}window.SpeechRecognition=window.webkitSpeechRecognition=DisabledRecognition;if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{window.voiceCalls.microphone++;return Promise.reject(Error('Unexpected microphone request'));};`});
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});

  await command('Page.addScriptToEvaluateOnNewDocument',{source: `window.audioContexts=[];window.mediaElements=[];const AC=window.AudioContext;window.AudioContext=class extends AC{constructor(...a){super(...a);window.audioContexts.push(this)}};const A=window.Audio;window.Audio=class extends A{constructor(...a){super(...a);window.mediaElements.push(this)}};`});

  const routes=[['electric-sky','.sky-map','#sky-position'],['living-ocean','.ocean-stage','#ocean-seek'],['temperature','.temperature-map','#temperature-seek']];
  for(const [name,map,seek] of routes){
    await navigate('/mission-control/'+name);
    await wait("!!document.querySelector('.dashboard-controls .mc-primary') && !document.querySelector('.dashboard-controls .mc-primary').disabled",45000);
    for(const [width,height] of [[1440,900],[1366,768],[1280,720],[1024,768],[390,844],[320,740]]){
      await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
      await evaluate('window.scrollTo(0,0)');
      await wait("Array.from(document.images).every(image=>image.complete)");await new Promise(resolve=>setTimeout(resolve,100));
      const layout=await evaluate(`(()=>{const frame=document.querySelector('.experience-dashboard').getBoundingClientRect(),map=document.querySelector('${map}').getBoundingClientRect(),controls=document.querySelector('.dashboard-playback').getBoundingClientRect(),info=document.querySelector('.dashboard-information'),scale=document.querySelector('.scientific-scale').getBoundingClientRect();return {frame:{x:frame.x,y:frame.y,bottom:frame.bottom},map:{width:map.width,height:map.height},controls:{y:controls.y,bottom:controls.bottom},scale:{bottom:scale.bottom},info:{y:info.getBoundingClientRect().y,bottom:info.getBoundingClientRect().bottom,scrollHeight:info.scrollHeight,clientHeight:info.clientHeight},overflow:document.documentElement.scrollWidth>innerWidth+1,bodyHeight:document.documentElement.scrollHeight,viewportHeight:innerHeight};})()`);
      assert.equal(layout.overflow,false,name+' horizontal overflow '+width);
      assert.ok(Math.abs(layout.map.width/layout.map.height-2)<.02,name+' proportional map');
      if(width>900){try{assert.equal(await evaluate("document.querySelector('.dashboard-information').getBoundingClientRect().right<=document.querySelector('.dashboard-map').getBoundingClientRect().left+1"),true,name+' information panel on left');assert.ok(layout.controls.bottom<=height+1,name+' controls below fold '+JSON.stringify(layout));assert.ok(layout.scale.bottom<=layout.info.bottom+1,name+' scale below sidebar '+JSON.stringify(layout));assert.ok(layout.info.scrollHeight<=layout.info.clientHeight+1,name+' essential information requires scrolling '+JSON.stringify(layout));assert.ok(layout.bodyHeight<=height+1,name+' desktop page scroll '+JSON.stringify(layout));}catch(error){layoutFailures.push({name,width,height,error:error.message});console.log('LAYOUT_FAILURE',error.message);}}
      console.log('LAYOUT',name,width,height,JSON.stringify(layout));
      await screenshot('phase1-'+name+'-'+width);
    }
    await command('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
    const transform=()=>evaluate("document.querySelector('.map-transform').style.transform");
    const original=await transform();
    const box=await evaluate("(()=>{const r=document.querySelector('.map-viewport').getBoundingClientRect();return {x:r.x+r.width*.4,y:r.y+r.height*.5};})()");
    for(const offset of [0,20,40])await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:box.x+offset,y:box.y});
    assert.equal(await transform(),original,name+' pointer movement keeps map stable');
    await click('[aria-label="Zoom in"]');assert.notEqual(await transform(),original);
    const zoomed=await transform();
    await command('Input.dispatchMouseEvent',{type:'mouseMoved',...box});assert.equal(await transform(),zoomed);
    await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...box});
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...box});
    assert.equal(await transform(),zoomed,name+' selection does not recenter');
    await wait("!!document.querySelector('.map-selected-point')");
    await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...box});
    await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:box.x+40,y:box.y+20});
    await wait(`document.querySelector('.map-transform').style.transform!==${JSON.stringify(zoomed)}`);
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:box.x+40,y:box.y+20});
    assert.notEqual(await transform(),zoomed,name+' deliberate drag pans');
    assert.equal(await evaluate("getSelection().toString()"),'',name+' dragging creates no text selection');
    const projected=await evaluate("(()=>{const r=document.querySelector('.map-transform').getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height}})()");
    await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...box});
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...box});
    const selectedPosition=await evaluate("(()=>{const p=document.querySelector('.map-selected-point');return {left:parseFloat(p.style.left),top:parseFloat(p.style.top)}})()");
    assert.ok(Math.abs(selectedPosition.left-(box.x-projected.left)/projected.width*100)<.001,name+' longitude selection after pan');
    assert.ok(Math.abs(selectedPosition.top-(box.y-projected.top)/projected.height*100)<.001,name+' latitude selection after pan');
    await click('[aria-label="Zoom out"]');
    assert.equal(await transform(),original,name+' zoom out restores unzoomed bounds');

    await evaluate("[...document.querySelectorAll('.map-zoom-controls button')].find(b=>b.textContent==='Reset View').click()");assert.equal(await transform(),original);
    for(let i=0;i<10;i++)await evaluate("document.querySelector('[aria-label=\"Zoom in\"]').click()");
    assert.ok(await evaluate("document.querySelector('[aria-label=\"Zoom in\"]').disabled"));
    await evaluate("[...document.querySelectorAll('.map-zoom-controls button')].find(b=>b.textContent==='Reset View').click()");
    // Verify keyboard clearing and geographic selection without changing the viewport.
    await evaluate("document.querySelector('.map-viewport').focus()");
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
    await wait("!document.querySelector('.map-selected-point')");
    assert.equal(await evaluate("!!document.querySelector('.map-selection-outline')"),false);
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});
    await wait("!!document.querySelector('.map-selected-point')");
    const selected=await evaluate("document.querySelector('.map-selected-point').style.cssText");
    await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...box});
    await command('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:box.x+40,y:box.y+20});
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:box.x+40,y:box.y+20});
    assert.equal(await evaluate("document.querySelector('.map-selected-point').style.cssText"),selected,name+' drag preserves selection');
    await command('Emulation.setTouchEmulationEnabled',{enabled:true});
    await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...box,id:1}]});
    await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.ok(await evaluate("!!document.querySelector('.map-selected-point')"));
    await command('Emulation.setTouchEmulationEnabled',{enabled:false});
    for(const [width,height] of [[1366,768],[1280,720]]){
      await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      await new Promise(resolve=>setTimeout(resolve,100));
      const selectedLayout=await evaluate("(()=>{const i=document.querySelector('.dashboard-information');return {content:i.scrollHeight,available:i.clientHeight}})()");
      if(selectedLayout.content>selectedLayout.available+1){layoutFailures.push({name,width,height,...selectedLayout});console.log('SELECTED_LAYOUT_OVERFLOW',name,width,selectedLayout);}
      await screenshot('selected-'+name+'-'+width);
    }
    await command('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
    await wait("!!document.querySelector('.map-selection-outline rect')");
    const footprint=await evaluate("(()=>{const r=document.querySelector('.map-selection-outline rect');return {west:+r.dataset.west,east:+r.dataset.east,north:+r.dataset.north,south:+r.dataset.south,fill:getComputedStyle(r).fill,glow:getComputedStyle(r).filter};})()");
    assert.equal(footprint.fill,'none');assert.notEqual(footprint.glow,'none');
    if(name==='electric-sky'){assert.equal(footprint.east-footprint.west,5);assert.equal(footprint.north-footprint.south,5);}
    if(name==='temperature'){assert.equal(footprint.east-footprint.west,2);assert.equal(footprint.north-footprint.south,2);}
    assert.ok(await evaluate("document.querySelector('.selection-announcement').textContent.length>30"));
    const outlineBounds=await evaluate("document.querySelector('.map-selection-outline rect').outerHTML");
    await click('[aria-label="Zoom in"]');
    assert.equal(await evaluate("document.querySelector('.map-selection-outline rect').outerHTML"),outlineBounds,name+' footprint remains geographic on zoom');
    await evaluate("[...document.querySelectorAll('.map-zoom-controls button')].find(b=>b.textContent==='Reset View').click()");
    await screenshot('outlined-'+name);
    passed(name+' left panel, exact footprint, glow, keyboard, Escape, touch, and drag selection protection');

    if(name==='electric-sky'){
      const expected=await evaluate(`(async()=>{
        const data=await (await fetch('/data/lightning/2017-03.json')).json();
        const day=data.flashes.filter(f=>f.time.startsWith('2017-03-01'));
        const first=day[0],gx=Math.floor((first.longitude+180)/5),gy=Math.floor((90-first.latitude)/5);
        const count=day.filter(f=>Math.floor((f.longitude+180)/5)===gx&&Math.floor((90-f.latitude)/5)===gy).length;
        const counts=new Map();for(const f of day){const key=Math.floor((90-f.latitude)/5)*72+Math.floor((f.longitude+180)/5);counts.set(key,(counts.get(key)||0)+1);}
        const r=document.querySelector('.map-viewport').getBoundingClientRect();
        return {count,maximum:Math.max(...counts.values()),x:r.x+(gx+.5)/72*r.width,y:r.y+(gy+.5)/36*r.height};
      })()`);
      await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:expected.x,y:expected.y});
      await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:expected.x,y:expected.y});
      await wait(`document.querySelector('.scientific-scale-value').textContent.includes('${expected.count.toFixed(3)}') && /flashes/.test(document.querySelector('.scientific-scale-value').textContent)`);
      const position=await evaluate("parseFloat(document.querySelector('.scientific-scale-indicator span').style.left)");
      assert.ok(Math.abs(position-expected.count/expected.maximum*100)<.001);
      await screenshot('lightning-recorded-count-indicator');
      passed('lightning indicator value and position reconcile with actual recorded selected-cell activity');
    }
    
    if(name==='temperature'||name==='living-ocean'){
      const missing=await evaluate(name==='temperature' ? `(async()=>{const d=await(await fetch('/data/temperature/2025-01.json')).json();const row=d.anomalies.findIndex(r=>r.some(v=>v===null)),col=d.anomalies[row].indexOf(null);const r=document.querySelector('.map-viewport').getBoundingClientRect();return {x:r.x+(d.lon[col]+180)/360*r.width,y:r.y+(90-d.lat[row])/180*r.height};})()` : `(()=>{const r=document.querySelector('.map-viewport').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+1};})()`);
      await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...missing});
      await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...missing});
      await wait("/unavailable|No valid/.test(document.querySelector('.selection-reading').textContent)");
      await wait("!document.querySelector('.scientific-scale-indicator span')");
      passed(name+' missing source sample has unavailable information and scale');
      await evaluate("document.querySelector('.map-viewport').focus()");
      await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown'});
    }
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const selectionBeforePlayback=await evaluate("document.querySelector('.map-selected-point').style.cssText");
    const announcementBeforePlayback=await evaluate("document.querySelector('.selection-announcement').textContent");
    passed(name+' stable pointer, controlled zoom, bounded drag, selection, and reset');
    await click('.dashboard-controls .mc-primary');
    await wait(`Number(document.querySelector('${seek}').getAttribute('aria-valuenow')??document.querySelector('${seek}').value)>0.3`);
    await click('.dashboard-controls .mc-primary');
    await wait("/paused/i.test(document.querySelector('.dashboard-status').textContent)");
    const paused=await evaluate(`Number(document.querySelector('${seek}').getAttribute('aria-valuenow')??document.querySelector('${seek}').value)`);
    assert.equal(await evaluate("document.querySelector('.map-selected-point').style.cssText"),selectionBeforePlayback);
    assert.equal(await evaluate("document.querySelector('.selection-announcement').textContent"),announcementBeforePlayback,name+' automatic updates do not repeat announcements');
    await new Promise(resolve=>setTimeout(resolve,200));
    assert.equal(await evaluate(`Number(document.querySelector('${seek}').getAttribute('aria-valuenow')??document.querySelector('${seek}').value)`),paused);
    await click('.dashboard-controls .mc-primary');await wait(`Number(document.querySelector('${seek}').getAttribute('aria-valuenow')??document.querySelector('${seek}').value)>${paused+.3}`);
    await click('.dashboard-controls .mc-primary');
    
    const before=await evaluate("document.querySelector('.observation-navigator select').value");
    await click('.observation-navigator button:last-child');
    await wait(`document.querySelector('.observation-navigator select').value!==${JSON.stringify(before)} && !document.querySelector('.dashboard-controls .mc-primary').disabled`,45000);
    assert.equal(await evaluate(`Number(document.querySelector('${seek}').getAttribute('aria-valuenow')??document.querySelector('${seek}').value)`),0);
    await click('.dashboard-controls button:nth-child(2)');
    
    await click('.mc-language');await wait("document.documentElement.lang==='ar'");
    assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth+1"),false);
    assert.equal(await evaluate("document.body.innerText.includes('???')"),false);
    await screenshot('phase1-'+name+'-arabic-desktop');
    await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth+1"),false);
    await screenshot('phase1-'+name+'-arabic-mobile');
    await click('.mc-language');await wait("document.documentElement.lang==='en'");
    await click('.dashboard-heading a');await wait("location.pathname==='/mission-control'");
    passed(name+' responsive dashboard, playback, navigation, and available-date stepping');
  }
  assert.deepEqual(errors,[]);
  assert.deepEqual(layoutFailures,[],'selected information fits laptop screens');
}finally{
  if(pageSocket?.readyState===1){try{await command('Browser.close');}catch{}pageSocket.close();}
  if(chrome.exitCode===null)chrome.kill();server.close();
  // Only the uniquely created isolated test profile may be removed.
  if(path.resolve(profile).startsWith(path.resolve(os.tmpdir())+path.sep+'sonara-browser-')){try{await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:100});}catch{console.log('Isolated temporary Chrome profile retained:',profile);}}
}
