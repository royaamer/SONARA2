import type {Field, Manifest, OceanData} from './types';

// The four source-grid centers bounding the bilinear point sample, split at the seam.
// This footprint describes interpolation support, not an area-averaged current.
export function oceanSamplingFootprint(manifest: Manifest, lon: number, lat: number) {
 const g=manifest.grid;
 const gx=((lon-g.lonStart+360)%360)/g.lonStep;
 const gy=(g.latStart-lat)/g.latStep;
 if(!Number.isFinite(gx)||!Number.isFinite(gy)||gy<0||gy>=g.height-1)return [];
 const west=((g.lonStart+Math.floor(gx)*g.lonStep+180)%360+360)%360-180;
 const east=west+g.lonStep;
 const north=g.latStart-Math.floor(gy)*g.latStep;
 const south=north-g.latStep;
 return east>180
  ? [{west,east:180,north,south},{west:-180,east:east-360,north,south}]
  : [{west,east,north,south}];
}

// EarthJukeBox 4929d2e: the renderer's bilinear spatial sampling, including
// its four-valid-corners mask and wrapped longitude seam. No nearest-land fill.
export function sampleInspectionField(manifest:Manifest,field:Field,lon:number,lat:number){
 const g=manifest.grid,gx=((lon-g.lonStart+360)%360)/g.lonStep,gy=(g.latStart-lat)/g.latStep;
 if(!Number.isFinite(gx)||!Number.isFinite(gy)||gy<0||gy>=g.height-1)return null;
 const x0=((Math.floor(gx)%g.width)+g.width)%g.width,x1=(x0+1)%g.width,y0=Math.floor(gy),y1=y0+1,ax=gx-Math.floor(gx),ay=gy-y0;
 const ids=[y0*g.width+x0,y0*g.width+x1,y1*g.width+x0,y1*g.width+x1];
 if(ids.some(i=>!Number.isFinite(field.u[i])||!Number.isFinite(field.v[i])))return null;
 const blend=(a:(number|null)[])=>((a[ids[0]]!*(1-ax)+a[ids[1]]!*ax)*(1-ay)+(a[ids[2]]!*(1-ax)+a[ids[3]]!*ax)*ay);
 return {u:blend(field.u),v:blend(field.v)};
}
export function inspectOcean(data:OceanData,seconds:number,lon:number,lat:number){
 const position=Math.max(0,Math.min(1,seconds/data.audit.duration_seconds))*(data.fields.length-1),a=Math.floor(position),b=Math.min(a+1,data.fields.length-1),f=position-a;
 const date=data.manifest.days[Math.round(position)].date;
 const first=sampleInspectionField(data.manifest,data.fields[a],lon,lat),second=sampleInspectionField(data.manifest,data.fields[b],lon,lat);
 const velocity=first&&second?{u:first.u+(second.u-first.u)*f,v:first.v+(second.v-first.v)*f}:null;
 const status=Math.abs(lat)>73?'visual-cutoff':!velocity?'no-valid-interpolated-velocity':Math.hypot(velocity.u,velocity.v)<.06?'below-seeding-threshold':'valid-but-sampled';
 const speed=velocity?Math.hypot(velocity.u,velocity.v):null,heading=velocity?(Math.atan2(velocity.v,velocity.u)*180/Math.PI+360)%360:null;
 return {date,position,status,velocity,speed,heading,changeMps:first&&second&&a!==b?Math.hypot(second.u,second.v)-Math.hypot(first.u,first.v):null,comparedDates:[data.manifest.days[a].date,data.manifest.days[b].date]};
}

export function oceanMeanSpeed(data:OceanData,seconds:number){
 const position=Math.max(0,Math.min(1,seconds/data.audit.duration_seconds))*(data.fields.length-1);
 const a=Math.floor(position),b=Math.min(a+1,data.fields.length-1),f=position-a,g=data.manifest.grid;
 let sum=0,weight=0;
 data.fields[a].u.forEach((u,i)=>{
  const v=data.fields[a].v[i],u2=data.fields[b].u[i],v2=data.fields[b].v[i];
  if(![u,v,u2,v2].every(x=>typeof x==='number'&&Number.isFinite(x)))return;
  const area=Math.cos((g.latStart-Math.floor(i/g.width)*g.latStep)*Math.PI/180);
  sum+=Math.hypot(u!+(u2!-u!)*f,v!+(v2!-v!)*f)*area;weight+=area;
 });
 return weight?sum/weight:null;
}
