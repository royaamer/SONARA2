import {readFile, readdir, mkdir, copyFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const SOURCE='NASA PO.DAAC OSCAR_L4_OC_FINAL_V2.0';
const ensure=(value,message)=>{if(!value)throw Error(message);};
const hash=b=>createHash('sha256').update(b).digest('hex');
export function wavDuration(bytes){
 ensure(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WAVE','Invalid WAV header');
 let byteRate=0,size=0;
 for(let i=12;i+8<=bytes.length;){const n=bytes.readUInt32LE(i+4),id=bytes.toString('ascii',i,i+4);ensure(i+8+n<=bytes.length,'Truncated WAV');if(id==='fmt ')byteRate=bytes.readUInt32LE(i+16);if(id==='data')size=n;i+=8+n+(n%2);}
 ensure(byteRate>0&&size>0,'Missing WAV format/data');return size/byteRate;
}
export async function inspectOcean(root){
 const files=new Map();
 const read=async p=>{ensure(!path.isAbsolute(p)&&!p.split(/[\\/]/).includes('..'),'Unsafe asset path');const bytes=await readFile(path.join(root,p));files.set(p,{sha256:hash(bytes),bytes:bytes.length});return bytes;};
 const json=async p=>JSON.parse((await read(p)).toString('utf8').replace(/^\uFEFF/,''));
 const catalog=await json('months.json');
 ensure(catalog.dataset===SOURCE&&catalog.year===2023&&catalog.schemaVersion===1,'Invalid catalog');
 const months=[],dates=new Set(),dailyHashes=new Set();
 for(const m of catalog.months){
  const result={month:m.month,ready:false,bassoon:false,metricsPath:null,issues:[],days:0};
  try{
   ensure(/^2023-(0[1-9]|1[0-2])$/.test(m.month)&&!months.some(x=>x.month===m.month),'Invalid/duplicate month');
   const n=new Date(Date.UTC(2023,+m.month.slice(5),0)).getUTCDate(),man=await json(m.manifest),g=man.grid;
   ensure(man.source===SOURCE&&man.units==='m/s'&&man.days.length===n&&m.days===n,'Manifest coverage/product mismatch');
   ensure(g&&Number.isInteger(g.width)&&Number.isInteger(g.height)&&g.width>=2&&g.height>=2&&[g.lonStart,g.latStart,g.lonStep,g.latStep].every(Number.isFinite)&&g.lonStep>0&&g.latStep>0,'Invalid grid');
   ensure(m.dateStart===m.month+'-01'&&m.dateEnd===m.month+'-'+n,'Catalog date mismatch');
   for(let i=0;i<n;i++){
    const date=m.month+'-'+String(i+1).padStart(2,'0'),d=man.days[i],f=await json(m.fieldsRoot+d.file);
    ensure(d.date===date&&d.file===date+'.json'&&f.date===date,'Daily date mismatch: '+date);
    ensure(Array.isArray(f.u)&&Array.isArray(f.v)&&f.u.length===g.width*g.height&&f.v.length===f.u.length,'Grid dimensions: '+date);
    let valid=0;for(let j=0;j<f.u.length;j++){const u=f.u[j],v=f.v[j];ensure(u===null&&v===null||Number.isFinite(u)&&Number.isFinite(v),'Invalid/mismatched u/v mask: '+date);if(u!==null)valid++;}
    ensure(valid>0&&!dates.has(date),'Empty/duplicate day: '+date);dates.add(date);dailyHashes.add(files.get(m.fieldsRoot+d.file).sha256);
   }
   result.days=n;result.grid=[g.width,g.height];
   const audit=await json(m.audit),sources=man.days.map(d=>'oscar_currents_final_'+d.date.replaceAll('-','')+'.nc');
   ensure(audit.provenance.startsWith(SOURCE)&&!/synthetic/i.test(audit.provenance)&&JSON.stringify(audit.source_files)===JSON.stringify(sources)&&audit.days.length===n,'Invalid source audit');
   for(let i=0;i<n;i++)ensure(audit.days[i].date===man.days[i].date.replaceAll('-','')&&Object.values(audit.days[i].metrics).every(v=>['speed','u','v'].every(k=>Number.isFinite(v[k]))),'Invalid daily audit metrics');
   ensure(Array.isArray(audit.note_events)&&audit.note_events.length>0&&audit.note_events.every(e=>['at_seconds','data_day_position','velocity_speed_mps','velocity_east_mps','velocity_north_mps','midi_note'].every(k=>Number.isFinite(e[k]))&&e.at_seconds>=0&&e.at_seconds<audit.duration_seconds&&e.data_day_position>=0&&e.data_day_position<=n-1),'Invalid score events');
   result.audioSeconds=wavDuration(await read(m.audio));ensure(Math.abs(result.audioSeconds-audit.duration_seconds)<.3&&Math.abs(result.audioSeconds-m.audioDurationSeconds)<.3,'Audio/audit duration mismatch');
   result.ready=true;
   if(m.bassoon&&m.bassoonAudit)try{
    const ba=await json(m.bassoonAudit);ensure(ba.dataset===SOURCE&&ba.month===m.month&&JSON.stringify(ba.source_files)===JSON.stringify(sources)&&ba.duration_seconds===audit.duration_seconds&&Number.isFinite(ba.speed_threshold_mps)&&Array.isArray(ba.note_events),'Invalid bassoon audit');
    for(const e of ba.note_events){const i=sources.indexOf(e.source_file),v=audit.days[i]?.metrics[e.region];ensure(i>=0&&e.source_date===man.days[i].date&&v&&Number.isFinite(e.at_seconds)&&Number.isFinite(e.duration_seconds)&&e.at_seconds>=0&&e.duration_seconds>0&&e.at_seconds+e.duration_seconds<=ba.duration_seconds+.001&&Number.isFinite(e.regional_mean_speed_mps)&&e.regional_mean_speed_mps>=ba.speed_threshold_mps-1e-6&&Math.abs(v.speed-e.regional_mean_speed_mps)<1e-5,'Unsupported bassoon event');}
    ensure(Math.abs(wavDuration(await read(m.bassoon))-audit.duration_seconds)<.3,'Bassoon WAV duration mismatch');result.bassoon=true;result.bassoonEvents=ba.note_events.length;
   }catch(e){result.issues.push('Bassoon unavailable: '+e.message);}
   const metrics=m.fieldsRoot+'sonification_metrics.json';
   if((await readdir(path.join(root,m.fieldsRoot))).includes('sonification_metrics.json')){
    const v=await json(metrics);ensure(v.source===SOURCE&&JSON.stringify(v.days.map(d=>d.date))===JSON.stringify(man.days.map(d=>d.date)),'Optional metrics coverage mismatch');result.metricsPath=metrics;
   }
   // Preserve all other original monthly listening renders without exposing new playback modes.
   for(const f of await readdir(path.dirname(path.join(root,m.audio))))if(f.endsWith('.wav')){const p=path.posix.join(path.posix.dirname(m.audio),f);ensure(Math.abs(wavDuration(await read(p))-audit.duration_seconds)<.3,'Alternative WAV duration mismatch');}
  }catch(e){result.ready=false;result.issues.push(e.message);}
  months.push(result);
 }
 return {catalog,months,files:Object.fromEntries(files),dailyFiles:dates.size,uniqueDailyHashes:dailyHashes.size};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=process.argv[2]||'C:/Users/user/EarthJukeBox/data/processed/oscar',target=path.resolve('public/data/ocean');
 const report=await inspectOcean(root);
 if(process.argv.includes('--copy')){
  for(const [p,info] of Object.entries(report.files)){const dest=path.join(target,p);await mkdir(path.dirname(dest),{recursive:true});await copyFile(path.join(root,p),dest);ensure(hash(await readFile(dest))===info.sha256,'Copy checksum mismatch: '+p);}
  await writeFile(path.join(target,'availability.json'),JSON.stringify({months:report.months},null,2)+'\n');
  await mkdir('.artifacts/ocean-year',{recursive:true});await writeFile('.artifacts/ocean-year/verification.json',JSON.stringify(report,null,2)+'\n');
 }
 console.log(JSON.stringify({dailyFiles:report.dailyFiles,uniqueDailyHashes:report.uniqueDailyHashes,months:report.months},null,2));
}
