import type {Manifest,Field,Audit,BassoonAudit,Catalog,Availability} from './types';
const SOURCE='NASA PO.DAAC OSCAR_L4_OC_FINAL_V2.0';
const check=(ok:unknown,message:string)=>{if(!ok)throw Error(message);};
self.onmessage=async(event:MessageEvent<{root:string;month:string}>)=>{
 const {root,month}=event.data;
 const json=async(path:string)=>{check(!path.includes('..')&&!path.includes(':')&&!path.startsWith('/'),'Unsafe asset path');const r=await fetch(root+path);if(!r.ok)throw Error(`${path}: HTTP ${r.status}`);return r.json();};
 try{
  const catalog:Catalog=await json('months.json');
  check(catalog.schemaVersion===1&&catalog.dataset===SOURCE&&catalog.year===2023&&Array.isArray(catalog.months),'Invalid OSCAR month catalog');
  const available:{months:Availability[]}=await json('availability.json');
  const selected=catalog.months.find(m=>m.month===month),verified=available.months.find(m=>m.month===month);
  if(!selected||!verified?.ready)throw Error('Ocean month has incomplete assets');
  const count=new Date(Date.UTC(catalog.year,+month.slice(5),0)).getUTCDate();
  check(selected.days===count,'Incomplete month catalog entry');
  const [manifest,audit]:[Manifest,Audit]=await Promise.all([json(selected.manifest),json(selected.audit)]);
  const g=manifest.grid;
  check(manifest.source===SOURCE&&manifest.units==='m/s'&&manifest.days.length===count&&g&&Number.isInteger(g.width)&&Number.isInteger(g.height)&&g.width>=2&&g.height>=2&&[g.lonStart,g.latStart,g.lonStep,g.latStep].every(Number.isFinite)&&g.lonStep>0&&g.latStep>0,'Invalid OSCAR grid metadata');
  check(audit.provenance.startsWith(SOURCE)&&!/synthetic/i.test(audit.provenance)&&audit.source_files.length===count&&audit.days.length===count&&Number.isFinite(audit.duration_seconds)&&audit.duration_seconds===selected.audioDurationSeconds&&audit.note_events.length>0,'Invalid source audit');
  const fields:Field[]=[];
  for(let i=0;i<count;i+=5){
   const batch:Field[]=await Promise.all(manifest.days.slice(i,i+5).map(d=>json(selected.fieldsRoot+d.file)));
   for(const f of batch){const n=fields.length,date=`${month}-${String(n+1).padStart(2,'0')}`;
    check(manifest.days[n].date===date&&manifest.days[n].file===date+'.json'&&f.date===date&&Array.isArray(f.u)&&Array.isArray(f.v)&&f.u.length===g.width*g.height&&f.v.length===f.u.length&&audit.source_files[n]===`oscar_currents_final_${date.replaceAll('-','')}.nc`&&audit.days[n].date===date.replaceAll('-',''),'Invalid daily grid '+date);
    check(f.u.every((u,j)=>u===null&&f.v[j]===null||Number.isFinite(u)&&Number.isFinite(f.v[j])),'Invalid velocity values/mask');fields.push(f);
   }
   self.postMessage({progress:fields.length,total:count});
  }
  check(selected.dateStart===manifest.days[0].date&&selected.dateEnd===manifest.days.at(-1)!.date,'Catalog date range mismatch');
  for(const e of audit.note_events)check([e.at_seconds,e.data_day_position,e.velocity_speed_mps,e.velocity_east_mps,e.velocity_north_mps,e.midi_note].every(Number.isFinite)&&e.data_day_position>=0&&e.data_day_position<=count-1,'Invalid score event');
  let bassoonAudit:BassoonAudit|null=null;
  if(verified.bassoon&&selected.bassoon&&selected.bassoonAudit){
   const ba:BassoonAudit=await json(selected.bassoonAudit);
   check(ba.dataset===SOURCE&&ba.month===month&&ba.duration_seconds===audit.duration_seconds&&JSON.stringify(ba.source_files)===JSON.stringify(audit.source_files)&&Number.isFinite(ba.speed_threshold_mps)&&Array.isArray(ba.note_events),'Bassoon audit mismatch');
   for(const e of ba.note_events){const i=audit.source_files.indexOf(e.source_file),v=audit.days[i]?.metrics[e.region];check(i>=0&&e.source_date===manifest.days[i].date&&v&&Number.isFinite(e.regional_mean_speed_mps)&&e.regional_mean_speed_mps>=ba.speed_threshold_mps-1e-6&&Math.abs(v.speed-e.regional_mean_speed_mps)<1e-5&&Number.isFinite(e.at_seconds),'Unsupported bassoon event');}
   bassoonAudit=ba;
  }
  let metrics:unknown=null;
  if(verified.metricsPath){const m=await json(verified.metricsPath);check(m.source===SOURCE&&JSON.stringify(m.days.map((d:{date:string})=>d.date))===JSON.stringify(manifest.days.map(d=>d.date)),'Metrics coverage mismatch');metrics=m;}
  self.postMessage({data:{manifest,audit,fields,selected,bassoonAudit,metrics}});
 }catch(e){self.postMessage({error:e instanceof Error?e.message:String(e)});}
};
