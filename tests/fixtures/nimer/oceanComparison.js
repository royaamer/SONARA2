// Earthsonic Ocean · optional, real-data Space × Time comparison.
// Reads month means exported from ACTUAL daily NASA OSCAR U/V. No synthetic samples.
// Does NOT replace or modify the existing Ocean/Bassoon WAV playback engine.
'use strict';

const ROOT = '../data/processed/oscar/comparison/';
const SOURCE = 'NASA PO.DAAC OSCAR_L4_OC_FINAL_V2.0';
const YEAR = 2023;
const NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const $ = id => document.getElementById(id);
const elements = {
  toggle: $('compareToggle'),
  panel: $('oceanCompare'),
  status: $('ocStatus'),
  position: $('ocPosition'),
  chart: $('ocChart'),
  months: $('ocMonths'),
  base: $('ocBase'),
  comparison: $('ocCompare'),
  delta: $('ocDelta'),
  switch: $('ocSwitch')
};
const ctx = elements.chart.getContext('2d');
const state = {
  open: false,
  data: new Map(),
  available: [],
  pending: null,
  selected: null,
  currentPoint: {lon:-60, lat:37},
  lastPoint: null,
  lastBase: null,
  values: Array(12).fill(null)
};
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const number = v => Number.isFinite(v) ? `${v.toFixed(3)} m/s` : '—';
const label = key => key ? `${NAMES[Number(key.slice(-2)) - 1]} ${key.slice(0,4)}` : '—';
const coordLabel = (lon,lat) =>
  `${Math.abs(lat).toFixed(1)}°${lat>=0?'N':'S'}, ${Math.abs(lon).toFixed(1)}°${lon>=0?'E':'W'}`;

function report(message,isError=false){
  elements.status.textContent=message;
  elements.status.classList.toggle('oc-error',isError);
}
async function readJson(url){
  const r = await fetch(url,{cache:'no-store'});
  if(!r.ok)throw Error(`${url}: HTTP ${r.status}`);
  return r.json();
}
function gridMatches(a,b){
  return ['width','height','lonStart','lonStep','latStart','latStep'].every(k=>a?.[k]===b?.[k]);
}
function verifyMonth(month,grid,file){
  const n=grid.width*grid.height;
  if(file.month!==month || file.source!==SOURCE || file.units!=='m/s' || !gridMatches(file.grid,grid))
    throw Error(`${month}: metadata does not match OSCAR index`);
  for(const key of ['meanSpeedMps','meanUMps','meanVMps','validDays']){
    if(!Array.isArray(file[key])||file[key].length!==n)throw Error(`${month}: ${key} grid size mismatch`);
  }
  if(!Number.isInteger(file.observationDays)||file.observationDays<28||file.observationDays>31)
    throw Error(`${month}: invalid number of observation days`);
}

async function loadComparison(){
  if(state.pending)return state.pending;
  state.pending=(async()=>{
    report('Loading real monthly OSCAR summaries…');
    let catalog;
    try {
      catalog=await readJson(ROOT+'months.json');
    } catch(error){
      throw Error('Comparison data missing. Run: python scripts/build_oscar_spacetime.py --year 2023');
    }
    if(catalog.schemaVersion!==1||catalog.source!==SOURCE||catalog.year!==YEAR||!Array.isArray(catalog.months))
      throw Error('Comparison catalog is incompatible with this Ocean player');
    if(!catalog.months.length)throw Error('No complete OSCAR months for comparison');
    const ready=[];
    const items=catalog.months.filter(m=>/^2023-(0[1-9]|1[0-2])$/.test(m.month));
    // A few concurrent requests avoid overwhelming python http.server on slow machines.
    for(let i=0;i<items.length;i+=3){
      const batch=await Promise.all(items.slice(i,i+3).map(async item=>{
        try{
          const data=await readJson(ROOT+encodeURIComponent(item.file));
          verifyMonth(item.month,catalog.grid,data);
          return {month:item.month,data};
        } catch(error){
          console.warn('Excluded invalid comparison month:',item.month,error);
          return null;
        }
      }));
      batch.filter(Boolean).forEach(({month,data})=>{
        state.data.set(month,data);
        ready.push(month);
      });
      report(`Checking OSCAR history · ${Math.min(i+3,items.length)}/${items.length} months…`);
    }
    if(!ready.length)throw Error('No valid monthly summaries found; rebuild the comparison data.');
    state.available=ready.sort();
    report(`${ready.length}/12 real observation months ready · click a month to compare`);
  })().catch(error=>{
    state.pending=null;
    report(error.message,true);
    throw error;
  });
  return state.pending;
}

function sample(month,lon,lat){
  const data=state.data.get(month);
  if(!data||!Number.isFinite(lon)||!Number.isFinite(lat))return null;
  const g=data.grid;
  // Exactly the same equirectangular grid location logic as Ocean's main sampler.
  const gx=((lon-g.lonStart+360)%360)/g.lonStep;
  const gy=(g.latStart-lat)/g.latStep;
  if(!Number.isFinite(gx)||!Number.isFinite(gy)||gy<0||gy>=g.height-1)return null;
  const x0=((Math.floor(gx)%g.width)+g.width)%g.width;
  const x1=(x0+1)%g.width;
  const y0=Math.floor(gy),y1=y0+1;
  const ax=gx-Math.floor(gx),ay=gy-y0;
  const ids=[y0*g.width+x0,y0*g.width+x1,y1*g.width+x0,y1*g.width+x1];
  if(ids.some(i=>data.validDays[i]===0||!Number.isFinite(data.meanSpeedMps[i])||
                     !Number.isFinite(data.meanUMps[i])||!Number.isFinite(data.meanVMps[i])))return null;
  const interpolate=key=>{
    const f=data[key];
    return ((f[ids[0]]*(1-ax)+f[ids[1]]*ax)*(1-ay)+
            (f[ids[2]]*(1-ax)+f[ids[3]]*ax)*ay);
  };
  return {
    speed:interpolate('meanSpeedMps'),
    u:interpolate('meanUMps'),
    v:interpolate('meanVMps'),
    days:Math.min(...ids.map(i=>data.validDays[i])),
    observationDays:data.observationDays
  };
}

function baseMonth(){
  return window.EarthsonicOceanGuide?.state?.()?.month ?? null;
}
function createButtons(){
  elements.months.replaceChildren();
  for(let i=1;i<=12;i++){
    const key=`${YEAR}-${String(i).padStart(2,'0')}`;
    const button=document.createElement('button');
    button.type='button';button.className='oc-month';
    button.dataset.month=key;button.textContent=NAMES[i-1];
    button.disabled=!state.data.has(key);
    button.title=button.disabled?`${NAMES[i-1]}: no verified daily OSCAR export`:`Compare ${NAMES[i-1]} ${YEAR}`;
    button.addEventListener('click',()=>{
      state.selected=key;
      render();
    });
    elements.months.appendChild(button);
  }
}

function drawChart(values,base,comparison){
  const C=ctx.canvas,W=C.width,H=C.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#092335';ctx.fillRect(0,0,W,H);
  const top=17,bottom=H-28,left=52,right=W-20;
  const present=values.filter(v=>Number.isFinite(v));
  if(!present.length){
    ctx.fillStyle='#a2c3cc';ctx.textAlign='center';ctx.font='17px system-ui';
    ctx.fillText('Empty',W/2,H/2);return;
  }
  const max=Math.max(.1,Math.ceil(Math.max(...present)*10)/10);
  const x=i=>left+(right-left)*i/11;
  const y=v=>bottom-(v/max)*(bottom-top);
  for(let j=0;j<=3;j++){
    const v=max*j/3,yy=y(v);
    ctx.strokeStyle='#244255';ctx.lineWidth=1;ctx.setLineDash([4,7]);
    ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(right,yy);ctx.stroke();
    ctx.setLineDash([]);ctx.fillStyle='#8cadb8';ctx.textAlign='right';ctx.font='13px system-ui';
    ctx.fillText(v.toFixed(2),left-9,yy+4);
  }
  ctx.save();ctx.strokeStyle='#68ded2';ctx.lineWidth=3.1;ctx.lineJoin='round';ctx.lineCap='round';
  ctx.beginPath();let begun=false;
  values.forEach((v,i)=>{
    if(!Number.isFinite(v)){begun=false;return;}
    if(begun)ctx.lineTo(x(i),y(v));else ctx.moveTo(x(i),y(v));
    begun=true;
  });ctx.stroke();ctx.restore();
  values.forEach((v,i)=>{
    if(!Number.isFinite(v))return;
    ctx.beginPath();ctx.arc(x(i),y(v),3.6,0,Math.PI*2);
    ctx.fillStyle='#65daca';ctx.fill();
  });
  for(const [key,color] of [[base,'#65e5d6'],[comparison,'#f2bf77']]){
    if(!key||key.slice(0,4)!==String(YEAR))continue;
    const i=Number(key.slice(-2))-1,v=values[i];
    if(!Number.isFinite(v))continue;
    ctx.beginPath();ctx.arc(x(i),y(v),8,0,Math.PI*2);
    ctx.lineWidth=3;ctx.strokeStyle=color;ctx.stroke();
    ctx.fillStyle='#fff9e8';ctx.beginPath();ctx.arc(x(i),y(v),3,0,Math.PI*2);ctx.fill();
  }
  ctx.fillStyle='#8caab6';ctx.textAlign='center';ctx.font='12px system-ui';
  ctx.fillText('Monthly mean speed (m/s)',W/2,H-8);
}

function render(){
  if(!state.open||!state.data.size)return;
  const current=baseMonth();
  if(!state.selected||!state.data.has(state.selected))
    state.selected=state.data.has(current)?current:state.available[0];
  const {lon,lat}=state.currentPoint;
  elements.position.textContent=`${coordLabel(lon,lat)} · NASA OSCAR 2023`;
  const values=Array.from({length:12},(_,i)=>{
    const key=`${YEAR}-${String(i+1).padStart(2,'0')}`;
    return sample(key,lon,lat)?.speed??null;
  });
  state.values=values;
  drawChart(values,current,state.selected);
  const currentData=sample(current,lon,lat);
  const compareData=sample(state.selected,lon,lat);
  elements.base.textContent=`${label(current)} · ${number(currentData?.speed)}`;
  elements.comparison.textContent=`${label(state.selected)} · ${number(compareData?.speed)}`;
  elements.delta.textContent=(currentData&&compareData)
    ?`${compareData.speed-currentData.speed>=0?'+':''}${(compareData.speed-currentData.speed).toFixed(3)} m/s`:'—';
  elements.delta.title='Comparison month minus current map month';
  for(const button of elements.months.children){
    button.setAttribute('aria-pressed',String(button.dataset.month===state.selected));
  }
  const currentOption=[...$('month').options].find(o=>o.value===state.selected&&!o.disabled);
  elements.switch.hidden=!currentOption||state.selected===current;
  elements.switch.disabled=!currentOption;
  if(currentOption)elements.switch.textContent=`Load ${label(state.selected)}'s full music`;
  const atPoint=values.filter(Number.isFinite).length;
  report(atPoint ? `${atPoint}/12 months have valid observations at this location` : 'Empty');
  state.lastBase=current;
}

function setOpen(open){
  state.open=open;
  elements.panel.hidden=!open;
  elements.toggle.setAttribute('aria-expanded',String(open));
  elements.toggle.textContent=open?'⌃ Hide comparison':'◷ Compare over time';
  if(!open)return;
  // Keep the new feature discoverable even when the stage fills the viewport.
  elements.panel.scrollIntoView?.({behavior:'smooth',block:'nearest'});
  if(state.data.size){render();return;}
  void loadComparison().then(()=>{
    createButtons();render();
  }).catch(error=>console.warn('Ocean comparison not ready:',error));
}

elements.toggle.addEventListener('click',()=>setOpen(!state.open));
document.addEventListener('earthsonic:guide-close',()=>setOpen(false));
document.addEventListener('earthsonic:inspect',event=>{
  if(!event.detail.enabled)return;
  const {lon,lat}=event.detail;
  if(Math.abs(state.currentPoint.lon-lon)<0.06&&Math.abs(state.currentPoint.lat-lat)<0.06&&
     state.lastBase===baseMonth())return;
  state.currentPoint={lon,lat};
  if(state.open)render();
});
$('month').addEventListener('change',()=>{
  // Player may still be loading: the guide's inspect event will refresh on ready.
  if(state.open)render();
});
elements.switch.addEventListener('click',()=>{
  const chosen=state.selected;
  const option=[...$('month').options].find(o=>o.value===chosen&&!o.disabled);
  if(!option)return;
  $('month').value=chosen;
  $('month').dispatchEvent(new Event('change',{bubbles:true}));
  report(`Loading ${label(chosen)} in the original Ocean player. Press Play when ready.`);
});
elements.chart.addEventListener('click',event=>{
  if(!state.open)return;
  const b=elements.chart.getBoundingClientRect();
  // Chart coordinates are in logical 1100-pixel canvas, regardless of CSS width.
  const x=(event.clientX-b.left)/b.width*elements.chart.width;
  const index=Math.round(clamp((x-52)/(elements.chart.width-72)*11,0,11));
  const month=`${YEAR}-${String(index+1).padStart(2,'0')}`;
  if(state.data.has(month)){state.selected=month;render();}
});
elements.chart.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
  event.preventDefault();
  const keys=state.available;
  if(!keys.length)return;
  const i=keys.indexOf(state.selected);
  state.selected=keys[clamp(i+(event.key==='ArrowRight'?1:-1),0,keys.length-1)];
  render();
});
