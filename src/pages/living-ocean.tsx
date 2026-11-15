import {useEffect,useRef} from 'react';
import {Link} from 'wouter';
import {ArrowLeft,Waves,Play,Pause,RotateCcw} from 'lucide-react';
import {useEarthSession} from '../earth/session';
import {MissionHeader,useMissionDocument} from '../mission-control/shared';
import {COPY} from '../living-ocean/content';
import {OCEAN_ROOT,useOcean} from '../living-ocean/use-ocean';
import '../living-ocean/ocean.css';
import '../experiences/experience.css';
import { ScientificHud } from '../experiences/dashboard';
import { noteName } from '../electric-sky/scanner-score';

export default function LivingOcean(){
 const {language}=useEarthSession(),t=COPY[language],o=useOcean(),heading=useRef<HTMLHeadingElement>(null);
 const ar=language==='ar',locale=ar?'ar':'en';useMissionDocument(t.title);
 useEffect(()=>heading.current?.focus({preventScroll:true}),[]);
 const {data}=o;
 const selected=o.catalog?.months.find(m=>m.month===o.month);
 const duration=data?.audit.duration_seconds??selected?.audioDurationSeconds??0,days=data?.manifest.days.length??selected?.days??0;
 const position=data&&duration?Math.max(0,Math.min(1,o.seconds/duration))*(days-1):0,index=Math.floor(position);
 const observationDate=data?.manifest.days[index]?.date??selected?.dateStart;
 const date=observationDate?new Date(observationDate+'T00:00:00Z').getTime()+(position-index)*86400000:null;
 const dateLabel=date===null?'—':new Date(date).toLocaleString(locale,{timeZone:'UTC',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})+' UTC';
 const monthLabel=(month:string,short=false)=>new Date(month+'-01T00:00:00Z').toLocaleDateString(locale,{timeZone:'UTC',month:short?'short':'long',...(short?{}:{year:'numeric'})});
 const fmt=(s:number)=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
 const eventIndex=data?.audit.note_events.findLastIndex(e=>e.at_seconds<=o.seconds)??-1;
 const event=eventIndex<0?null:data!.audit.note_events[Math.floor(eventIndex/4)*4];
 const sourceIndex=event?Math.min(days-1,Math.floor(event.data_day_position)):0;
 const region=(name:string)=>ar?({gulf_stream:'تيار الخليج',kuroshio:'كوروشيو',agulhas:'أغولهاس'}[name]??name):name.replaceAll('_',' ');
 const bassoonEvent=data?.bassoonAudit?.note_events.find(e=>o.seconds>=e.at_seconds&&o.seconds<e.at_seconds+e.duration_seconds);
 // Deep Ocean renders every fourth audit event one octave lower for 5.4 seconds.
 const padEvent=data?.audit.note_events.filter((_,i)=>i%4===0).findLast(e=>e.at_seconds<=o.seconds && o.seconds<e.at_seconds+5.4);
 const audible=o.status==='playing' && o.ready && !o.error ? (o.bassoonOn && bassoonEvent ? {region:bassoonEvent.region,note:bassoonEvent.midi_note} : padEvent ? {region:padEvent.region,note:padEvent.midi_note-12} : null) : null;
 const total=o.catalog?.months.find(m=>m.month===o.month)?.days??0;
 const status=o.error?t.failed:o.ready?t[o.status]:data?t.loadingAudio:`${t.loading}: ${o.progress}/${total||'—'}`;
 return <div className="mc ocean experience" lang={language} dir={ar?'rtl':'ltr'}>
  <a className="mc-skip" href="#ocean-main">{t.title}</a><MissionHeader subtitle={t.title} back/>
  <main id="ocean-main">
   <Link className="ocean-return" href="/mission-control"><ArrowLeft size={15}/>{t.back}</Link>
   <div className="ocean-heading"><div><p className="mc-eyebrow">OSCAR / {o.month?monthLabel(o.month):'2023'} / {total||'—'} {t.dailyFields}</p><h1 ref={heading} tabIndex={-1}>{t.title}</h1><p className="ocean-lead">{t.lead}</p><p className="ocean-intro">{t.intro}</p></div><Waves size={80} strokeWidth={.6} aria-hidden="true"/></div>
   <section className="ocean-panel" aria-label={t.map} aria-busy={!o.ready&&!o.error}>
    <div className="ocean-toolbar"><label>{t.month}<select id="ocean-month" value={o.month} disabled={!o.catalog} onChange={e=>o.changeMonth(e.target.value)}>
     {Array.from({length:12},(_,i)=>{const key=`${o.catalog?.year??2023}-${String(i+1).padStart(2,'0')}`,available=o.availability.some(m=>m.month===key&&m.ready);return <option key={key} value={key} disabled={!available}>{monthLabel(key)}{available?'':` / ${t.unavailable}`}</option>;})}
    </select></label><span className="experience-status" role="status" aria-live="polite">{status}</span></div>
    <div className="ocean-months" role="group" aria-label={t.month}>{Array.from({length:12},(_,i)=>{const key=`${o.catalog?.year??2023}-${String(i+1).padStart(2,'0')}`;return <button key={key} data-month={key} disabled={!o.availability.some(m=>m.month===key&&m.ready)} aria-pressed={o.month===key} aria-label={monthLabel(key)} onClick={()=>o.changeMonth(key)}>{monthLabel(key,true)}</button>;})}</div>
    <div className="scientific-view"><div className="ocean-stage"><img src={OCEAN_ROOT+'world.svg'} alt=""/><canvas ref={o.canvas} width="1600" height="800" role="img" aria-label={t.map}/></div>
    <ScientificHud label={t.title} language={language} indicators={[
     {label:ar?'رصد المحيط':'Observation time',value:dateLabel,id:'ocean-visual-date'},
     {label:ar?'منطقة المحيط':'Ocean region',value:o.error||!data?'—':event?region(event.region):t.foundation},
     {label:ar?'صوت المحيط':'Musical note',eventKey:audible?String(audible.note):undefined,value:audible?noteName(audible.note):'—',direction:'ltr'},
    ]}/>
</div>
    <div className="ocean-transport">
     <button className="mc-button mc-primary" disabled={!o.ready||!!o.error} onClick={()=>o.status==='playing'?o.pause():o.start()}>{o.status==='playing'?<Pause size={17}/>:<Play size={17}/>} {o.status==='playing'?t.pause:o.status==='paused'?t.resume:t.play}</button>
     <button className="mc-button" disabled={!o.ready||!!o.error} onClick={()=>o.seek(0,true)}><RotateCcw size={17}/>{t.restart}</button>
    </div>
    <label className="ocean-timeline">{t.visualTimeline}<input id="ocean-seek" type="range" dir="ltr" aria-label={t.visualTimeline} min="0" max="1000" step="1" value={duration?Math.round(o.seconds/duration*1000):0} disabled={!o.ready||!!o.error} onChange={e=>o.seek(+e.target.value/1000*duration)}/><output dir="ltr">{fmt(o.seconds)} / {fmt(duration)}</output></label>
    {o.error&&<div className="experience-error" role="alert"><p>{t.error}</p><button className="mc-button" onClick={o.retry}>{t.retry}</button></div>}
    <details className="experience-science"><summary>{ar?'استكشف العلم':'Explore the Science'}</summary>    <p className="ocean-range" dir="ltr">{data?`${data.selected.dateStart} — ${data.selected.dateEnd} UTC`:'—'}</p>
    <div className="ocean-settings" aria-label={t.fixedSettings}><span>{t.thickness} <strong>2.2 px</strong></span><span>{t.trail} <strong>9 s</strong></span><span>{t.brightness} <strong>1.0×</strong></span><label><input id="ocean-bassoon" type="checkbox" checked={o.bassoonOn} disabled={!o.ready||!data?.bassoonAudit} onChange={e=>o.toggleBassoon(e.target.checked)}/>{t.bassoon}</label></div>
    <p className="ocean-bassoon-status" role="status">{!data?.bassoonAudit?t.bassoonUnavailable:!o.bassoonOn?t.bassoonOff:bassoonEvent?`${t.bassoon}: ${region(bassoonEvent.region)} / ${bassoonEvent.regional_mean_speed_mps.toFixed(3)} m/s / ${bassoonEvent.source_date}`:`${t.bassoonQuiet} ≥ ${data.bassoonAudit.speed_threshold_mps.toFixed(3)} m/s`}</p>
<details><summary>{t.audit}</summary>{event&&<pre dir="ltr">{JSON.stringify({dataset:data!.manifest.source,month:o.month,source_file:data!.audit.source_files[sourceIndex],audio_trigger_seconds:event.at_seconds,source_observation_day_position:event.data_day_position,source_observation_date:data!.manifest.days[sourceIndex].date,source_region:event.region,eastward_u_mps:event.velocity_east_mps,northward_v_mps:event.velocity_north_mps,current_speed_mps:event.velocity_speed_mps,assigned_midi_note:event.midi_note-12},null,2)}</pre>}
     {data&&<a href={OCEAN_ROOT+data.selected.audit}>{t.audit}</a>}{data?.bassoonAudit&&<><p><a href={OCEAN_ROOT+data.selected.bassoonAudit}>{t.bassoonAudit}</a></p><pre dir="ltr">{JSON.stringify(bassoonEvent??{speed_threshold_mps:data.bassoonAudit.speed_threshold_mps},null,2)}</pre></>}
    </details><p>{t.note}</p>
   <aside className="ocean-provenance"><p>{t.science}</p><p>{t.music}</p><a href="https://podaac.jpl.nasa.gov/dataset/OSCAR_L4_OC_FINAL_V2.0" target="_blank" rel="noreferrer">NASA PO.DAAC / OSCAR v2.0</a></aside></details>
   </section>
   <audio ref={o.audio} preload="metadata"/><audio ref={o.bassoon} preload="metadata"/>
  </main>
 </div>;
}
