// Earthsonic Living Ocean — monthly live rendering, using ONLY exported OSCAR U/V.
// Sound is the existing NASA-derived Deep Ocean WAV. No random audio is generated here.
// Visual random values ONLY determine virtual tracer seed positions (fixed seed/month).
const $ = id => document.getElementById(id);
const canvas=$('flow'), ctx=canvas.getContext('2d',{alpha:true});
const W=canvas.width,H=canvas.height;
const audio=$('sound'),bassoon=$('bassoonSound');
// Fixed visual values approved for this edition (no editable controls).
const VISUAL={thickness:2.2,trailSeconds:9,brightness:1.0};
const ROOT='../data/processed/oscar/';
const SOURCE='NASA PO.DAAC OSCAR_L4_OC_FINAL_V2.0';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const px=lon=>(lon+180)/360*W,py=lat=>(90-lat)/180*H;
const fmt=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
const pad=x=>String(x).padStart(2,'0');
let catalog,selected,manifest,audit,bassoonAudit=null,fields=[],particles=[],seeds=[];
let ready=false,playing=false,raf=0,lastFrame=0,lastAudioTime=0,shownEvent=-2,version=0;
let rngState=202311;
function random(){rngState=(1664525*rngState+1013904223)>>>0;return rngState/4294967296}
function setStatus(t,isError=false){$('status').textContent=t;$('status').classList.toggle('error',isError)}
async function json(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error(`${url} returned HTTP ${r.status}`);return r.json()}
function monthDates(month){const [y,m]=month.split('-').map(Number),n=new Date(Date.UTC(y,m,0)).getUTCDate();return Array.from({length:n},(_,i)=>`${month}-${pad(i+1)}`)}
function populateMonths(){
  const available=new Map(catalog.months.map(m=>[m.month,m]));
  $('month').replaceChildren();$('monthStrip').replaceChildren();
  for(let mo=1;mo<=12;mo++){
    const key=`${catalog.year}-${pad(mo)}`;
    const label=new Date(Date.UTC(catalog.year,mo-1,1)).toLocaleDateString('en-US',{month:'long',timeZone:'UTC'});
    const item=available.get(key);
    const opt=document.createElement('option');opt.value=key;opt.textContent=`${label} ${catalog.year}${item?'':' — not processed'}`;opt.disabled=!item;
    $('month').appendChild(opt);
    const mark=document.createElement('button');
    mark.type='button';
    mark.className=`month ${item?'ready':'missing'}`;
    mark.textContent=label.slice(0,3);
    mark.title=item?`Load ${label} ${catalog.year} ocean and music`:`${label}: dataset and audio not yet prepared`;
    mark.dataset.month=key;
    mark.disabled=!item;
    mark.setAttribute('aria-label', item?`Load ${label} ${catalog.year}`:`${label} ${catalog.year} unavailable`);
    $('monthStrip').appendChild(mark);
  }
  $('month').disabled=!available.size;
  return available;
}
function validate(man,au,entry){
  if(man.source!==SOURCE||man.units!=='m/s')throw Error('Velocity export is not the expected OSCAR u/v product');
  if(!String(au.provenance||'').startsWith(SOURCE)||/synthetic/i.test(au.provenance))throw Error('Audio audit does not identify OSCAR-derived source data');
  const expect=monthDates(entry.month);
  if(man.days?.length!==expect.length||au.source_files?.length!==expect.length||au.days?.length!==expect.length)throw Error('Not a complete month of matching daily data');
  for(let i=0;i<expect.length;i++){
    if(man.days[i].date!==expect[i]||man.days[i].file!==expect[i]+'.json')throw Error(`Wrong day at index ${i}`);
    if(au.source_files[i]!==`oscar_currents_final_${expect[i].replaceAll('-','')}.nc`)throw Error(`Audio source differs on ${expect[i]}`);
  }
  const g=man.grid;
  if(!g||![g.width,g.height,g.lonStart,g.latStart,g.lonStep,g.latStep].every(Number.isFinite)||g.width<2||g.height<2||g.lonStep<=0||g.latStep<=0)throw Error('Invalid OSCAR grid metadata');
  if(!Array.isArray(au.note_events)||!Number.isFinite(au.duration_seconds))throw Error('Missing scientific musical audit');
}
function sampleField(field,lon,lat){
  const g=manifest.grid;
  const gx=((lon-g.lonStart+360)%360)/g.lonStep,gy=(g.latStart-lat)/g.latStep;
  if(!Number.isFinite(gx)||!Number.isFinite(gy)||gy<0||gy>=g.height-1)return null;
  const x0=((Math.floor(gx)%g.width)+g.width)%g.width,x1=(x0+1)%g.width;
  const y0=Math.floor(gy),y1=y0+1,ax=gx-Math.floor(gx),ay=gy-y0;
  const i00=y0*g.width+x0,i10=y0*g.width+x1,i01=y1*g.width+x0,i11=y1*g.width+x1;
  for(const i of [i00,i10,i01,i11])if(!Number.isFinite(field.u[i])||!Number.isFinite(field.v[i]))return null;
  const blend=a=>((a[i00]*(1-ax)+a[i10]*ax)*(1-ay)+(a[i01]*(1-ax)+a[i11]*ax)*ay);
  return {u:blend(field.u),v:blend(field.v)};
}
function sample(lon,lat,day){
  const a=clamp(Math.floor(day),0,fields.length-1),b=Math.min(a+1,fields.length-1),f=clamp(day-a,0,1);
  const aa=sampleField(fields[a],lon,lat);if(!aa)return null;
  if(a===b)return aa;
  const bb=sampleField(fields[b],lon,lat);if(!bb)return null;
  return {u:aa.u+(bb.u-aa.u)*f,v:aa.v+(bb.v-aa.v)*f};
}
function buildSeedPool(){
  const g=manifest.grid,day=fields[0];seeds=[];
  let weightSum=0;
  for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){
    const i=y*g.width+x,u=day.u[i],v=day.v[i];
    if(!Number.isFinite(u)||!Number.isFinite(v))continue;
    const speed=Math.hypot(u,v),lat=g.latStart-y*g.latStep;
    if(speed<.06||Math.abs(lat)>73)continue;
    weightSum+=Math.pow(speed+.06,1.35);
    seeds.push({lon:g.lonStart+x*g.lonStep,lat,cumulative:weightSum});
  }
  if(!seeds.length)throw Error('No valid moving OSCAR ocean cells in this month');
}
function spawn(){
  const r=random()*seeds[seeds.length-1].cumulative;
  let lo=0,hi=seeds.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(seeds[mid].cumulative<r)lo=mid+1;else hi=mid}
  const g=manifest.grid,p=seeds[lo];
  const lon=((p.lon+(random()-.5)*g.lonStep*.5+180+360)%360)-180;
  const lat=p.lat+(random()-.5)*g.latStep*.5;
  return {lon,lat,drawLon:lon,drawLat:lat,life:15+random()*18};
}
function reset(){
  ctx.clearRect(0,0,W,H);
  rngState=202311+Number(selected.month.replace('-',''));
  // Fewer tracers + a wider path makes the global view readable instead of dotted.
  particles=Array.from({length:3900},spawn);
  lastAudioTime=audio.currentTime;lastFrame=0;shownEvent=-2;drawMetadata();
}
function dayPosition(sec){
  // Daily fields represent 00:00 UTC snapshots, NOT direct measurements of every intermediate hour.
  return clamp(sec/Math.max(audio.duration||25,.01),0,1)*(fields.length-1);
}
function currentDate(){
  const pos=dayPosition(audio.currentTime),whole=Math.floor(pos),part=pos-whole;
  const date=manifest.days[Math.min(whole,manifest.days.length-1)].date;
  const dateObj=new Date(`${date}T00:00:00Z`);
  dateObj.setTime(dateObj.getTime()+part*86400000);
  return {position:pos,iso:dateObj.toISOString().slice(0,16).replace('T',' ')};
}
function showAudioAudit(){
  if(!audit?.note_events?.length)return;
  const events=audit.note_events,t=audio.currentTime;
  let i=-1;for(let j=0;j<events.length;j++){if(events[j].at_seconds<=t)i=j;else break}
  // This rendering's Deep Ocean score plays events[::4] from the same audited note list.
  const played=i<0?-1:Math.floor(i/4)*4;
  if(played===shownEvent)return;shownEvent=played;
  if(played<0){$('region').textContent='Atmospheric foundation';$('velocity').textContent='See audit';return}
  const e=events[played],didx=Math.min(manifest.days.length-1,Math.floor(e.data_day_position));
  $('region').textContent=e.region.replaceAll('_',' ');
  $('velocity').textContent=`${Number(e.velocity_speed_mps).toFixed(3)} m/s · ${manifest.days[didx].date}`;
  $('audit').textContent=JSON.stringify({
    dataset:SOURCE,month:selected.month,source_file:audit.source_files[didx],
    audio_trigger_seconds:e.at_seconds,source_observation_day_position:e.data_day_position,
    source_observation_date:manifest.days[didx].date,source_region:e.region,
    eastward_u_mps:e.velocity_east_mps,northward_v_mps:e.velocity_north_mps,
    current_speed_mps:e.velocity_speed_mps,assigned_midi_note:e.midi_note-12,
    visual_note:'Visual time interpolates between daily velocity fields across the month. Audio is a pre-composed, separately sampled interpretation; note events do not correspond to individual tracers.',
    processing:'See sonification_audit.json for all sampled regions and the fixed musical mapping.'
  },null,2);
}
function drawMetadata(){
  if(!ready)return;
  $('date').textContent=currentDate().iso+' UTC';
  $('elapsed').textContent=fmt(audio.currentTime);
  $('total').textContent=fmt(audio.duration||25);
  $('seek').value=Math.round(1000*audio.currentTime/Math.max(audio.duration||25,.01));
  showAudioAudit();
}
function integrate(simDays,from){
  let left=simDays;
  while(left>1e-8){
    const step=Math.min(left,.10),dt=step*86400;
    const {brightness,thickness}=VISUAL;
    for(let i=0;i<particles.length;i++){
      const p=particles[i];
      if(p.life<=0){particles[i]=spawn();continue}
      const s=sample(p.lon,p.lat,from);if(!s){particles[i]=spawn();continue}
      const midLat=p.lat+s.v*dt*.5/111132;
      const midLon=p.lon+s.u*dt*.5/(111320*Math.max(.15,Math.cos(p.lat*Math.PI/180)));
      const sm=sample(((midLon+180+360)%360)-180,midLat,from+.5*step);
      if(!sm){particles[i]=spawn();continue}
      const nextLat=p.lat+sm.v*dt/111132;
      const rawLon=p.lon+sm.u*dt/(111320*Math.max(.15,Math.cos(midLat*Math.PI/180)));
      const nextLon=((rawLon+180+360)%360)-180;
      if(Math.abs(nextLat)>74||Math.abs(nextLon-p.lon)>180||!sample(nextLon,nextLat,from+step)){
        particles[i]=spawn();continue;
      }
      p.lon=nextLon;p.lat=nextLat;p.life-=step;
      const x0=px(p.drawLon),y0=py(p.drawLat),x1=px(nextLon),y1=py(nextLat);
      // Avoid overpainting tiny, sub-pixel jumps; keep a continuous trajectory instead.
      if(Math.hypot(x1-x0,y1-y0)<.80)continue;
      if(Math.abs(x1-x0)>W*.20){p.drawLon=nextLon;p.drawLat=nextLat;continue}
      const speed=Math.hypot(sm.u,sm.v),strength=clamp(speed/1.6,0,1);
      ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);
      // One cohesive turquoise palette only — no artificial yellow or grey current lines.
      ctx.strokeStyle=`rgba(${Math.round(40+52*strength)},${Math.round(187+49*strength)},${Math.round(185+51*strength)},${clamp((.43+.21*strength)*brightness,.12,.87)})`;
      ctx.lineWidth=thickness*(.88+.22*strength);
      ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();
      p.drawLon=nextLon;p.drawLat=nextLat;
    }
    from+=step;left-=step;
  }
}
function showBassoonStatus(){
  if(!bassoonAudit){$('bassoonInfo').textContent='Bassoon not prepared for this month';return}
  const events=bassoonAudit.note_events||[];
  const t=audio.currentTime;
  const active=events.find(e=>t>=e.at_seconds&&t<e.at_seconds+e.duration_seconds);
  if(active){
    $('bassoonInfo').textContent=`Bassoon: ${active.region.replaceAll('_',' ')} · ${active.regional_mean_speed_mps.toFixed(3)} m/s · ${active.source_date}`;
  }else{
    $('bassoonInfo').textContent=`Bassoon quiet between high-current phrases · threshold ≥ ${Number(bassoonAudit.speed_threshold_mps).toFixed(3)} m/s`;
  }
}
function syncBassoon(){
  if(!bassoon.src||!$('bassoonOn').checked)return;
  if(Math.abs(bassoon.currentTime-audio.currentTime)>.075){
    bassoon.currentTime=Math.min(audio.currentTime,bassoon.duration||audio.currentTime);
  }
}
function frame(now){
  if(!playing)return;
  if(!lastFrame)lastFrame=now;
  const elapsed=clamp((now-lastFrame)/1000,0,.12);lastFrame=now;
  // Time-limited trails. Halving their opacity after the selected real-time interval.
  const halfLife=VISUAL.trailSeconds;
  const fade=1-Math.exp(-Math.LN2*elapsed/halfLife);
  ctx.save();ctx.globalCompositeOperation='destination-out';ctx.fillStyle=`rgba(0,0,0,${fade})`;ctx.fillRect(0,0,W,H);ctx.restore();
  const to=dayPosition(audio.currentTime);
  let from=dayPosition(lastAudioTime);
  if(to<from-.005){reset();from=to}
  if(to>from)integrate(to-from,from);
  lastAudioTime=audio.currentTime;syncBassoon();drawMetadata();showBassoonStatus();raf=requestAnimationFrame(frame);
}
function pause(){audio.pause();bassoon.pause();playing=false;cancelAnimationFrame(raf);lastFrame=0;$('play').textContent='▶ Resume';setStatus('Paused')}
function start(){
  if(!ready)return;
  if(bassoonAudit&&$('bassoonOn').checked){bassoon.currentTime=audio.currentTime; bassoon.play().catch(e=>setStatus('Bassoon playback failed: '+e.message,true));}
  audio.play().then(()=>{
    if(!playing){playing=true;lastFrame=0;lastAudioTime=audio.currentTime;
      $('play').textContent='⏸ Pause';setStatus('Playing measured currents with the month’s NASA-derived Deep Ocean WAV');raf=requestAnimationFrame(frame)}
  }).catch(e=>setStatus('Playback blocked: '+e.message,true));
}
async function activate(entry){
  const mine=++version;
  if(playing)pause();audio.pause();bassoon.pause();audio.removeAttribute('src');audio.load();bassoon.removeAttribute('src');bassoon.load();bassoonAudit=null;$('bassoonOn').disabled=true;$('bassoonInfo').textContent='Checking bassoon layer…';
  ready=false;cancelAnimationFrame(raf);
  $('play').disabled=$('restart').disabled=$('seek').disabled=true;
  $('month').disabled=true;setStatus(`Loading ${entry.label} velocity fields…`);
  manifest=audit=null;fields=[];particles=[];seeds=[];ctx.clearRect(0,0,W,H);
  $('simrange').textContent=entry.dateStart+' — '+entry.dateEnd+' UTC';
  try{
    const [man,au]=await Promise.all([json(ROOT+entry.manifest),json(ROOT+entry.audit)]);
    if(mine!==version)return;
    validate(man,au,entry);
    const f=[];
    // Moderate parallelism reduces memory/network spikes on the local server.
    for(let i=0;i<man.days.length;i+=5){
      const batch=await Promise.all(man.days.slice(i,i+5).map(d=>json(ROOT+entry.fieldsRoot+d.file)));
      if(mine!==version)return;
      for(const d of batch){
        if(d.date!==man.days[f.length].date||!Array.isArray(d.u)||!Array.isArray(d.v)||d.u.length!==man.grid.width*man.grid.height||d.v.length!==d.u.length)throw Error(`Invalid daily OSCAR data for day ${f.length+1}`);
        f.push(d);
      }
      setStatus(`Loading ${entry.label}: ${f.length}/${man.days.length} daily grids…`);
    }
    if(mine!==version)return;
    selected=entry;manifest=man;audit=au;fields=f;
    const loaded=new Promise((resolve,reject)=>{
      const onMeta=()=>{clean();resolve()},onError=()=>{clean();reject(Error('Missing or unreadable monthly WAV'))};
      function clean(){audio.removeEventListener('loadedmetadata',onMeta);audio.removeEventListener('error',onError)}
      audio.addEventListener('loadedmetadata',onMeta);audio.addEventListener('error',onError);
    });
    audio.src=ROOT+entry.audio;audio.load();await loaded;
    if(mine!==version)return;
    if(!Number.isFinite(audio.duration)||Math.abs(audio.duration-au.duration_seconds)>.3)throw Error('WAV duration differs from source audit');
    // Load the optional, source-validated bassoon WAV. Never invent one in-browser.
    if(entry.bassoon&&entry.bassoonAudit){
      const ba=await json(ROOT+entry.bassoonAudit);
      if(mine!==version)return;
      if(ba.dataset!==SOURCE || ba.month!==entry.month || ba.duration_seconds!==au.duration_seconds ||
         !Array.isArray(ba.source_files) || ba.source_files.length!==au.source_files.length ||
         ba.source_files.some((f,i)=>f!==au.source_files[i]) || !Array.isArray(ba.note_events)){
        throw Error('Bassoon audit does not match the November NASA source files/duration');
      }
      for(const e of ba.note_events){
        if(!Number.isFinite(e.regional_mean_speed_mps)||
           e.regional_mean_speed_mps < ba.speed_threshold_mps-1e-6 ||
           !au.source_files.includes(e.source_file)|| !Number.isFinite(e.at_seconds)){
          throw Error('Invalid or unsupported bassoon high-current event');
        }
      }
      const bassoonMeta=new Promise((resolve,reject)=>{
        const ok=()=>{clean();resolve()},fail=()=>{clean();reject(Error('Bassoon WAV not found'))};
        function clean(){bassoon.removeEventListener('loadedmetadata',ok);bassoon.removeEventListener('error',fail)}
        bassoon.addEventListener('loadedmetadata',ok,{once:true});bassoon.addEventListener('error',fail,{once:true});
      });
      bassoon.src=ROOT+entry.bassoon;bassoon.load();await bassoonMeta;
      if(mine!==version)return;
      if(Math.abs(bassoon.duration-audio.duration)>.30)throw Error('Bassoon WAV duration differs from Deep Ocean WAV');
      bassoon.volume=.52;  // sampled bassoon as a gentle accent over the ambient background
      $('bassoonOn').disabled=false;bassoonAudit=ba;
    }
    buildSeedPool();ready=true;audio.currentTime=0;reset();showBassoonStatus();
    $('month').value=entry.month;
    for(const c of $('monthStrip').children){
      const isSelected=c.dataset.month===entry.month;
      c.classList.toggle('selected',isSelected);
      c.setAttribute('aria-pressed',String(isSelected));
    }
    $('month').disabled=false;$('play').disabled=$('restart').disabled=$('seek').disabled=false;
    $('play').textContent='▶ Play ocean + sound';
    setStatus(`${entry.label} ready · ${fields.length} verified daily grids · Deep Ocean background ${bassoonAudit?'+ high-current bassoon':''}`);
  }catch(e){setStatus(`Setup error: ${e.message}`,true);console.error(e);$('month').disabled=false}
}
$('play').onclick=()=>playing?pause():start();
$('restart').onclick=()=>{if(!ready)return;pause();audio.currentTime=0;reset();start()};
$('month').onchange=()=>{const found=catalog.months.find(e=>e.month===$('month').value);if(found)activate(found)};
$('monthStrip').addEventListener('click', event=>{
  const tile=event.target.closest('button[data-month]');
  if(!tile||!$('monthStrip').contains(tile)||tile.disabled||$('month').disabled)return;
  if(selected?.month===tile.dataset.month)return;
  const match=catalog?.months?.find(entry=>entry.month===tile.dataset.month);
  if(!match)return;
  $('month').value=tile.dataset.month;
  $('month').dispatchEvent(new Event('change',{bubbles:true}));
});
$('bassoonOn').onchange=()=>{if(!ready||!bassoonAudit)return;if($('bassoonOn').checked&&playing){bassoon.currentTime=audio.currentTime;bassoon.play().catch(e=>setStatus('Bassoon playback failed: '+e.message,true))}else{bassoon.pause()}showBassoonStatus()};
$('seek').oninput=()=>{if(!ready)return;const was=playing;if(was)pause();audio.currentTime=Number($('seek').value)/1000*audio.duration;if(bassoonAudit)bassoon.currentTime=audio.currentTime;reset();drawMetadata();setStatus('Seek updated. Visual trails restart at this date; past trajectories are not reconstructed.');if(was)start()};
audio.addEventListener('ended',()=>{bassoon.pause();playing=false;cancelAnimationFrame(raf);$('play').textContent='▶ Replay';setStatus(`${selected?.label||'Month'} completed`);drawMetadata()});
async function boot(){
  try{
    catalog=await json(ROOT+'months.json');
    if(catalog.schemaVersion!==1||catalog.dataset!==SOURCE||catalog.year!==2023||!Array.isArray(catalog.months))throw Error('Invalid 2023 month catalog');
    const available=populateMonths();
    if(!available.size){setStatus('No complete ocean months are prepared. Generate months.json after exporting fields and audio.',true);return}
    const initial=available.get('2023-11')||[...available.values()][0];
    await activate(initial);
  }catch(err){setStatus(`Month catalog not found or invalid: ${err.message}`,true);console.error(err)}
}

// Read-only interface for the optional Behind the Sound demonstration.
// It exposes the same verified gridded data already used by this player; it does
// not alter the composition, the OSCAR export, or the virtual tracer algorithm.
window.EarthsonicOceanGuide = Object.freeze({
  state() {
    return {
      ready,
      month: selected?.month ?? null,
      currentTimeSeconds: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
      durationSeconds: Number.isFinite(audio.duration) ? audio.duration : null,
      playbackActive: playing,
      sampledDay: ready ? manifest.days[Math.round(dayPosition(audio.currentTime))]?.date ?? null : null,
      seedingSpeedThresholdMps: 0.06,
      visualLatitudeCutoffDegrees: 73,
      dataset: SOURCE
    };
  },
  inspect(lon,lat) {
    if (!ready) return {status:'loading'};
    if(!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lat)>90||Math.abs(lon)>180)
      return {status:'outside'};
    const date = manifest.days[Math.min(manifest.days.length-1, Math.max(0, Math.round(dayPosition(audio.currentTime))))]?.date;
    const data = sample(lon,lat,dayPosition(audio.currentTime));
    const point = {lon, lat, date, dataset:SOURCE};
    // Rendering includes only latitudes within +/-73 degrees, regardless of
    // whether measured values might exist outside that display restriction.
    if(Math.abs(lat)>73) return {...point,status:'visual-cutoff',velocity:data};
    if(!data) return {...point,status:'no-valid-interpolated-velocity'};
    const speed=Math.hypot(data.u,data.v);
    // Give the guide a transparent daily comparison, never an invented
    // intermediate observation. Continuous visual motion is interpolated.
    const pos=dayPosition(audio.currentTime);
    const d0=Math.floor(pos),d1=Math.min(fields.length-1,d0+1);
    const first=sampleField(fields[d0],lon,lat),second=sampleField(fields[d1],lon,lat);
    const change=(first&&second&&d1!==d0)
      ? Math.hypot(second.u,second.v)-Math.hypot(first.u,first.v) : null;
    return {
      ...point, status: speed<0.06?'below-seeding-threshold':'valid-but-sampled',
      u:data.u, v:data.v, speed,
      changeMps:change,
      comparedDates:change===null?null:[manifest.days[d0].date,manifest.days[d1].date],
      // atan2(v,u) is the velocity direction, measured from east.
      headingDegrees: (Math.atan2(data.v,data.u)*180/Math.PI+360)%360
    };
  },
  // A bassoon phrase is explained only while the actual bassoon layer is
  // enabled, playing, and within an event's audited note duration. The
  // source is a REGIONAL speed threshold, never the selected map pixel.
  bassoonEvent() {
    if(!ready || !bassoonAudit || !playing || bassoon.paused || !$('bassoonOn').checked) return null;
    const t = audio.currentTime;
    const e = bassoonAudit.note_events.find(event =>
      t >= event.at_seconds && t < event.at_seconds + event.duration_seconds);
    if(!e) return null;
    return {
      region: e.region,
      meanSpeedMps: e.regional_mean_speed_mps,
      thresholdMps: bassoonAudit.speed_threshold_mps,
      sourceDate: e.source_date,
      onsetSeconds: e.at_seconds
    };
  },
  soundEvent() {
    if(!ready || !audit?.note_events?.length) return null;
    // The website's Deep Ocean soundtrack plays every fourth recorded note
    // event. This matches the existing showAudioAudit() logic above.
    const events=audit.note_events;
    const t=Number.isFinite(audio.currentTime)?audio.currentTime:0;
    let idx=-1;
    for(let i=0;i<events.length;i++){
      if(events[i].at_seconds<=t) idx=i; else break;
    }
    if(idx<0) return null;
    const chosen=events[Math.floor(idx/4)*4];
    const dayIdx=Math.max(0,Math.min(manifest.days.length-1,Math.floor(chosen.data_day_position)));
    return {
      atSeconds:chosen.at_seconds,
      region:chosen.region,
      date:manifest.days[dayIdx].date,
      sourceFile:audit.source_files[dayIdx],
      currentSpeedMps:chosen.velocity_speed_mps,
      eastwardMps:chosen.velocity_east_mps,
      northwardMps:chosen.velocity_north_mps,
      bassoonEligible:!!bassoonAudit,
      displayedMidiNote:chosen.midi_note-12,
      dataDayPosition:chosen.data_day_position
    };
  }
});

boot();
