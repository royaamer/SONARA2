import { observeMapResolution } from '../experiences/map-resolution';
import type { Field, Manifest } from './types';
import { sampleInspectionField } from './inspection';
import { currentPosition, currentColor } from './current-color';
// Ported from EarthJukeBox oscarMonthly.js, preserving interpolation and midpoint integration.
export function createOceanRenderer(canvas: HTMLCanvasElement, manifest: Manifest, fields: Field[], month: string) {
const ctx=canvas.getContext('2d')!; const W=1600,H=800;
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const px=(lon:number)=>(lon+180)/360*W,py=(lat:number)=>(90-lat)/180*H;
let rngState=202311+Number(month.replace('-',''));
const random=()=>{rngState=(1664525*rngState+1013904223)>>>0;return rngState/4294967296;};
let seeds: {lon:number;lat:number;cumulative:number}[]=[];
let particles: {lon:number;lat:number;drawLon:number;drawLat:number;life:number}[]=[];
const settings={brightness:1,thickness:2.2,trail:9};
function sampleField(field: Field,lon: number,lat: number){
  return sampleInspectionField(manifest,field,lon,lat);
}
function sample(lon: number,lat: number,day: number){
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
    const speed=Math.hypot(u!,v!),lat=g.latStart-y*g.latStep;
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

function integrate(simDays: number,from: number){
  let left=simDays;
  while(left>1e-8){
    const step=Math.min(left,.10),dt=step*86400;
    const brightness=settings.brightness,thickness=settings.thickness;
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
      const speed=Math.hypot(sm.u,sm.v),strength=currentPosition(speed);
      ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);
      // One cohesive turquoise palette only — no artificial yellow or grey current lines.
      ctx.strokeStyle=currentColor(speed,brightness);
      ctx.lineWidth=thickness*(.88+.22*strength);
      ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();
      p.drawLon=nextLon;p.drawLat=nextLat;
    }
    from+=step;left-=step;
  }
}

buildSeedPool();
function reset(){ctx.clearRect(0,0,W,H);rngState=202311+Number(month.replace('-',''));particles=Array.from({length:3900},spawn);}
let position=0;
const dispose=observeMapResolution(canvas,W,H,()=>{reset();integrate(2,Math.max(0,position-2));});
return {reset,dispose,settings,advance(from:number,to:number,elapsed:number){
position=to;
ctx.save();ctx.globalCompositeOperation='destination-out';ctx.fillStyle='rgba(0,0,0,'+(1-Math.exp(-Math.LN2*elapsed/settings.trail))+')';ctx.fillRect(0,0,W,H);ctx.restore();
if(to<from-.005){reset();return;}if(to>from)integrate(to-from,from);
}};}
