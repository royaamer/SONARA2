import { OriginalWaveform, PlaybackVolume } from '../experiences/original-waveform';
import {useEffect,useRef,useState} from 'react';
import {Link} from 'wouter';
import {ArrowLeft,Waves,Play,Pause,RotateCcw} from 'lucide-react';
import {useEarthSession} from '../earth/session';
import {MissionHeader,useMissionDocument} from '../mission-control/shared';
import {COPY} from '../living-ocean/content';
import {OCEAN_ROOT,useOcean} from '../living-ocean/use-ocean';
import '../living-ocean/ocean.css';
import '../experiences/experience.css';
import { ScientificHud } from '../experiences/dashboard';
import { ExperienceDashboard, ObservationNavigator, ScientificScale, type MapPoint } from '../experiences/experience-dashboard';
import {inspectOcean, oceanMeanSpeed, oceanSamplingFootprint} from '../living-ocean/inspection';
import {currentPosition, currentColor } from '../living-ocean/current-color';
import {RegionInspector} from '../living-ocean/region-inspector';
import { noteName } from '../electric-sky/scanner-score';

export default function LivingOcean(){
 const [point,setPoint]=useState<MapPoint|null>(null);
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
 const inspection=point&&data&&!o.error?inspectOcean(data,o.seconds,point.lon,point.lat):null;
 const measurement=point ? inspection?.speed??null : data&&!o.error ? oceanMeanSpeed(data,o.seconds) : null;
 const footprint=point&&data?oceanSamplingFootprint(data.manifest,point.lon,point.lat):[];
 return <div className="mc ocean experience dashboard-experience" lang={language} dir={ar?'rtl':'ltr'}>
  <a className="mc-skip" href="#ocean-main">{t.title}</a><MissionHeader subtitle={t.title} back/>
  <main id="ocean-main">
   <div className="dashboard-heading"><h1 ref={heading} tabIndex={-1}>{t.title}</h1><Link className="ocean-return" href="/mission-control"><ArrowLeft size={15}/>{t.back}</Link></div>
   <ExperienceDashboard locations={data?.fields[0]?.u.flatMap((u,i)=>{const grid=data.manifest.grid;return i%grid.width===0?[]:u!==null&&data.fields[0].v[i]!==null&&i%60===0?[{lon:((grid.lonStart+(i%grid.width)*grid.lonStep+180)%360+360)%360-180,lat:grid.latStart-Math.floor(i/grid.width)*grid.latStep}]:[];}).slice(0,100)} temporal={{kind:"ocean"}} pauseOriginal={o.pause} point={point} onSelect={setPoint} label={t.map} busy={!o.ready&&!o.error} status={status}
    footprints={footprint} observationKey={data?.selected.month??o.month}
    selectionSummary={point?`Ocean sample at latitude ${point.lat.toFixed(2)}, longitude ${point.lon.toFixed(2)}. ${dateLabel}. ${inspection?.velocity?`Speed ${measurement!.toFixed(3)} m/s. Eastward ${inspection.velocity.u.toFixed(3)} m/s. Northward ${inspection.velocity.v.toFixed(3)} m/s. Direction ${inspection.heading!.toFixed(1)} degrees counterclockwise from east.`:'Velocity unavailable, land or missing data.'}`:''}
    navigator={<ObservationNavigator id="ocean-month" label={t.month} ar={ar} value={o.month} disabled={!o.catalog} onChange={o.changeMonth} options={o.catalog?.months.filter(m=>o.availability.some(a=>a.month===m.month&&a.ready)).map(m=>({value:m.month,label:monthLabel(m.month)}))??[]}/>}
    map={<div className="ocean-stage"><img src={OCEAN_ROOT+'world.svg'} alt=""/><canvas ref={o.canvas} width="1600" height="800" role="img" aria-label={t.map}/></div>}
    information={<>
      <RegionInspector point={point} data={o.error?null:data} seconds={o.seconds}/>
      </>} science={<>
      <ScientificHud label={t.title} language={language} indicators={[
        {label:ar?'وقت الحقل المستوفى':'Interpolated field time',value:dateLabel,id:'ocean-visual-date'},
        {label:ar?'منطقة الصوت':'Soundtrack region',value:o.error||!data?'—':event?region(event.region):t.foundation},
        {label:ar?'النغمة الحالية':'Current note',eventKey:audible?String(audible.note):undefined,value:audible?noteName(audible.note):'—',direction:'ltr'},
      ]}/>
      <ScientificScale measurement={{value:measurement,minimum:0,maximum:1.6,unit:"m/s",position:currentPosition(measurement??0),color:currentColor(measurement??0),label:point?"Selected Region / interpolated velocity":"Full Map / area-weighted mean interpolated speed"}} title={ar?'سرعة تيار السطح · m/s':'Surface current speed · m/s'} gradient={`linear-gradient(90deg in srgb, ${currentColor(0)}, ${currentColor(.8)}, ${currentColor(1.6)})`} ticks={['0 m/s','0.8','≥ 1.6 m/s']}>
        <p>{ar?'مسارات افتراضية؛ تتلاشى الألوان أيضاً مع العمر.':'Virtual trails. Color also fades with trail age.'}</p>

      </ScientificScale>
      <div className="dashboard-scope"><p>{ar?'الصوت الأصلي: ملف WAV إقليمي.':'Original audio · regional WAV.'}</p></div>

    </>}
    controls={<><PlaybackVolume onChange={o.setVolume}/><div className="ocean-transport">
     <button className="mc-button mc-primary" disabled={!o.ready||!!o.error} onClick={()=>o.status==='playing'?o.pause():o.start()}>{o.status==='playing'?<Pause size={17}/>:<Play size={17}/>} {o.status==='playing'?t.pause:o.status==='paused'?t.resume:t.play}</button>
     <button className="mc-button" disabled={!o.ready||!!o.error} onClick={()=>o.seek(0,true)}><RotateCcw size={17}/>{t.restart}</button><button className="mc-button" disabled={!o.ready} onClick={()=>o.seek(0,false)}>Stop</button>
    </div><label className="dashboard-bassoon"><input id="ocean-bassoon" type="checkbox" checked={o.bassoonOn} disabled={!o.ready||!data?.bassoonAudit} onChange={e=>o.toggleBassoon(e.target.checked)}/>{t.bassoon}</label></>}
    timeline={<OriginalWaveform id="ocean-seek" identity={o.month+String(o.bassoonOn)} seconds={o.seconds} duration={duration} playing={o.status==='playing'} urls={data?[{url:OCEAN_ROOT+data.selected.audio,gain:1},...(o.bassoonOn&&data.selected.bassoon?[{url:OCEAN_ROOT+data.selected.bassoon,gain:.52}]:[])]:[]} onSeek={o.seek} disabled={!o.ready||!!o.error}/>}
    error={o.error&&<div className="experience-error" role="alert"><p>{t.error}</p><button className="mc-button" onClick={o.retry}>{t.retry}</button></div>}
   />
   <details className="experience-science"><summary>{ar?'استكشف العلم':'Explore the Science'}</summary><p>{t.lead}</p><p>{t.intro}</p><p className="ocean-range" dir="ltr">{data?`${data.selected.dateStart} — ${data.selected.dateEnd} UTC`:'—'}</p>
    <div className="ocean-settings" aria-label={t.fixedSettings}><span>{t.thickness} <strong>2.2 px</strong></span><span>{t.trail} <strong>9 s</strong></span><span>{t.brightness} <strong>1.0×</strong></span></div>
    <p className="ocean-bassoon-status" role="status">{!data?.bassoonAudit?t.bassoonUnavailable:!o.bassoonOn?t.bassoonOff:bassoonEvent?`${t.bassoon}: ${region(bassoonEvent.region)} / ${bassoonEvent.regional_mean_speed_mps.toFixed(3)} m/s / ${bassoonEvent.source_date}`:`${t.bassoonQuiet} ≥ ${data.bassoonAudit.speed_threshold_mps.toFixed(3)} m/s`}</p>
<details><summary>{t.audit}</summary>{event&&<pre dir="ltr">{JSON.stringify({dataset:data!.manifest.source,month:o.month,source_file:data!.audit.source_files[sourceIndex],audio_trigger_seconds:event.at_seconds,source_observation_day_position:event.data_day_position,source_observation_date:data!.manifest.days[sourceIndex].date,source_region:event.region,eastward_u_mps:event.velocity_east_mps,northward_v_mps:event.velocity_north_mps,current_speed_mps:event.velocity_speed_mps,assigned_midi_note:event.midi_note-12},null,2)}</pre>}
     {data&&<a href={OCEAN_ROOT+data.selected.audit}>{t.audit}</a>}{data?.bassoonAudit&&<><p><a href={OCEAN_ROOT+data.selected.bassoonAudit}>{t.bassoonAudit}</a></p><pre dir="ltr">{JSON.stringify(bassoonEvent??{speed_threshold_mps:data.bassoonAudit.speed_threshold_mps},null,2)}</pre></>}
    </details><p>{t.note}</p>
   <aside className="ocean-provenance"><p>{t.science}</p><p>{t.music}</p><a href="https://podaac.jpl.nasa.gov/dataset/OSCAR_L4_OC_FINAL_V2.0" target="_blank" rel="noreferrer">NASA PO.DAAC / OSCAR v2.0</a></aside></details>
   <audio ref={o.audio} preload="metadata"/><audio ref={o.bassoon} preload="metadata"/>
  </main>
 </div>;
}
