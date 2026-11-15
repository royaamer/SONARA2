import { requestAudio, useAudioInterruption } from '../experiences/audio-focus';
import { OriginalWaveform, PlaybackVolume } from '../experiences/original-waveform';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { AudioLines, ArrowLeft, Pause, Play, Radio, RotateCcw, ScanLine, Square, Volume2, VolumeX, Zap } from 'lucide-react';
import { useEarthSession } from '../earth/session';
import { MissionHeader, useMissionDocument } from '../mission-control/shared';
import { loadLightningDataset, NOMINAL_MONTH, partitionObservationDates } from '../electric-sky/lightning-data';
import { buildDayIndex, buildScannerScore, noteHz, noteName } from '../electric-sky/scanner-score';
import { ScannerAudioEngine, type PlaybackSnapshot } from '../electric-sky/audio-engine';
import { AudioSpectrum, LightningMap } from '../electric-sky/visualizations';
import { SKY_COPY } from '../electric-sky/content';
import '../electric-sky/electric-sky.css';
import '../experiences/experience.css';
import { ScientificHud } from '../experiences/dashboard';
import { ExperienceDashboard, ObservationNavigator, ScientificScale, type MapPoint } from '../experiences/experience-dashboard';
import { activityAt, activityPosition, activityColor, buildActivityGrid } from '../electric-sky/activity-scale';
const initialSnapshot:PlaybackSnapshot={ status:'ready',seconds:0,current:null,active:[] };
export default function ElectricSky() {
 const [point,setPoint]=useState<MapPoint|null>(null);
  const { language } = useEarthSession();
  const t = SKY_COPY[language];
  useMissionDocument(t.title);
  const [engine]=useState(() => new ScannerAudioEngine());
  const [snapshot,setSnapshot]=useState<PlaybackSnapshot>(initialSnapshot);
  const [dateIndex,setDateIndex]=useState(0);
  const [volume,setVolume]=useState(.65);
  const [muted,setMuted]=useState(false);
  const [starting,setStarting]=useState(false);
  const [audioError,setAudioError]=useState(false);
  const title=useRef<HTMLHeadingElement>(null);
  const mounted=useRef(true);
  const supported=typeof window.AudioContext !== 'undefined';
  const query=useQuery({queryKey:['earthjukebox-iss-lis-v3',NOMINAL_MONTH],queryFn:({signal})=>loadLightningDataset(signal),staleTime:Infinity,retry:1});
  const days=useMemo(() => query.data ? buildDayIndex(query.data).filter(d=>d.flashes.length>0) : [],[query.data]);
  const calendar=useMemo(()=>partitionObservationDates(days),[days]);
  const day=days[dateIndex] ?? days[0];
  const activity=useMemo(() => day ? buildActivityGrid(day) : null,[day]);
  const score=useMemo(() => day ? buildScannerScore(day) : null,[day]);
  useEffect(() => { title.current?.focus({preventScroll:true}); },[]);
  useEffect(() => {
    mounted.current=true;
    let frame=0,last=0;
    const tick=(now:number) => { if(now-last>30){setSnapshot(engine.getSnapshot());last=now;}frame=requestAnimationFrame(tick); };
    frame=requestAnimationFrame(tick);
    return () => { mounted.current=false;cancelAnimationFrame(frame);window.speechSynthesis?.cancel();void engine.dispose(); };
  },[engine]);
  useEffect(() => { if(score){engine.load(score);setSnapshot(engine.getSnapshot());} },[score,engine]);
  const format = (n:number, digits=0) => n.toLocaleString(language === 'ar' ? 'ar' : 'en',{maximumFractionDigits:digits,minimumFractionDigits:digits});
  const dateLabel=(date:string) => new Date(date+'T12:00:00Z').toLocaleDateString(language === 'ar' ? 'ar' : 'en',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'});
  const monthLabel=new Date(NOMINAL_MONTH+'-01T12:00:00Z').toLocaleDateString(language==='ar'?'ar':'en',{timeZone:'UTC',month:'long',year:'numeric'});
  const additionalCount=calendar.additional.reduce((n,d)=>n+d.flashes.length,0);
  const boundaryNote=t.boundaryDetail.replace('{month}',monthLabel).replace('{dates}',calendar.additional.map(d=>dateLabel(d.day)).join(language==='ar'?' / ':', ')).replace('{count}',format(additionalCount));
  const play=async() => {requestAudio('sky');setStarting(true);setAudioError(false);try{await engine.play();}catch{if(mounted.current)setAudioError(true);}finally{if(mounted.current){setStarting(false);setSnapshot(engine.getSnapshot());}}};
  const pause=async() => {try{await engine.pause();}catch{setAudioError(true);}if(mounted.current)setSnapshot(engine.getSnapshot());};
  useAudioInterruption('sky', ()=>void pause());
  const stop=() => {engine.stop();setSnapshot(engine.getSnapshot());};
  const changeDate=(index:number) => {stop();setDateIndex(index);setAudioError(false);};
  const current=snapshot.status==='ready' ? null : snapshot.current;
  const audible=snapshot.status==='playing' && !muted && volume>0 ? snapshot.active.at(-1) : null;
  const longitude=score ? -180+360*snapshot.seconds/score.seconds : null;
  const column=score ? Math.min(score.columns-1,Math.floor(snapshot.seconds/score.seconds*score.columns)) : null;
  const selectedPoint=point;
  const measurement=activity ? selectedPoint ? activityAt(activity,selectedPoint.lon,selectedPoint.lat) : activity.cells.length ? activity.cells.reduce((sum,c)=>sum+c.count,0)/activity.cells.length : null : null;
  const cellWest=point?Math.min(71,Math.floor((point.lon+180)/5))*5-180:0;
  const cellNorth=point?90-Math.min(35,Math.floor((90-point.lat)/5))*5:0;
  const records=point&&day?day.flashes.filter(f=>Math.min(71,Math.floor((f.longitude+180)/5))*5-180===cellWest&&90-Math.min(35,Math.floor((90-f.latitude)/5))*5===cellNorth):[];
  const meanRadiance=records.length?records.reduce((sum,f)=>sum+f.radiance,0)/records.length:null;
  const status=starting ? t.starting : t[snapshot.status];
  return <div className="mc sky experience dashboard-experience" dir={language === 'ar' ? 'rtl' : 'ltr'} lang={language}>
    <a href="#sky-main" className="mc-skip">{t.title}</a><MissionHeader subtitle={t.title} back/>
    <main id="sky-main">
      <div className="dashboard-heading"><h1 ref={title} tabIndex={-1}>{t.title}</h1><Link className="sky-return" href="/mission-control"><ArrowLeft size={15}/>{t.returned}</Link></div>
      {query.isPending ? <div className="sky-load" role="status"><Radio size={30}/><p>{t.loading}</p></div> : query.isError || !query.data || !day || !score || !activity ? <div className="sky-load" role="alert"><p>{t.loadError}</p><button className="mc-button" onClick={()=>void query.refetch()}>{t.retry}</button></div> : <>
        <ExperienceDashboard locations={activity?.cells.map(cell=>({lon:-177.5+cell.x*5,lat:87.5-cell.y*5}))} temporal={{kind:"lightning",days}} pauseOriginal={()=>void pause()} point={point} onSelect={setPoint} label={t.map} status={status}
          footprints={point?[{west:cellWest,east:cellWest+5,south:cellNorth-5,north:cellNorth}]:[]}
          observationKey={day.day}
          selectionSummary={`ISS LIS cell, latitude ${cellNorth-5} to ${cellNorth}, longitude ${cellWest} to ${cellWest+5}. ${day.day} UTC. ${records.length} recorded flashes in the supplied extract. ${meanRadiance===null?'Radiance unavailable. Coverage unknown.':'Mean radiance '+meanRadiance.toFixed(2)+' '+query.data.radiance_unit+'. Coverage incomplete.'}`}
          navigator={<ObservationNavigator id="sky-date" label={t.date} ar={language==='ar'} value={String(dateIndex)} disabled={starting} onChange={value=>changeDate(+value)} options={days.map((d,index)=>({value:String(index),label:dateLabel(d.day),group:d.day.startsWith(NOMINAL_MONTH)?monthLabel:t.additionalDates}))}/>}
          map={<LightningMap day={day} score={score} snapshot={snapshot} label={t.map} mapError={t.loadError} activity={activity}/>}
          information={<>
            <div className="selection-reading" aria-label="Selected ISS LIS cell">{point ? <>
              <strong>Selected ISS LIS cell / {day.day} UTC</strong>
              <p dir="ltr">Latitude {cellNorth-5}–{cellNorth}° / Longitude {cellWest}–{cellWest+5}°</p>
              <p>{records.length?records.length+" flashes recorded in this 5 degree by 5 degree cell.":"0 flashes in the supplied extract cell. Coverage is unknown."}</p>
              <p>{meanRadiance===null?'No recorded radiance in this cell.':'Mean recorded radiance '+format(meanRadiance,2)+' '+query.data.radiance_unit}</p>
            </> : <p>Select a geographic cell.</p>}</div>
            </>} science={<>
            <ScientificHud label={t.telemetry} language={language} indicators={[
              {label:language==='ar'?'ومضات مسجلة':'Recorded flashes',value:format(day.flashes.length)},
              {label:language==='ar'?'خط طول المسح':'Scan longitude',value:format(longitude!,1)+'°',direction:'ltr'},
              {label:language==='ar'?'النغمة الحالية':'Current note',eventKey:audible?String(audible.at):undefined,value:audible?noteName(audible.note)+' · '+format(noteHz(audible.note),1)+' Hz':'—',direction:'ltr'},
            ]}/>
            <ScientificScale measurement={{value:measurement,minimum:0,maximum:activity.maximum,unit:"recorded flashes / 5° × 5° cell",position:activityPosition(measurement??0,activity.maximum),color:activityColor(measurement??0,activity.maximum),label:point?"Selected Region / source cell":"Full Map / occupied-cell mean"}} title={language==='ar'?'ومضات مسجلة لكل خلية 5° × 5°':'Recorded flashes / 5° × 5° cell'} gradient={`linear-gradient(90deg in srgb, ${activityColor(0,activity.maximum)}, ${activityColor(activity.maximum/2,activity.maximum)}, ${activityColor(activity.maximum,activity.maximum)})`} ticks={['0',format(activity.maximum/2,1),format(activity.maximum)]}>
              <p>{language==='ar'?'لا سجلات في الخلايا الفارغة؛ تغطية الرصد غير مقيّمة.':'ISS LIS coverage is incomplete. Zero extract records cannot confirm absence of lightning.'}</p>
            </ScientificScale>
            <div className="dashboard-scope"><p>{language==='ar'?'الصوت الأصلي: مسح جغرافي لمدة 24 ثانية لليوم المحدد.':'Original geographic scan · selected day · 24 s.'}</p></div>
          </>}
          controls={<><div className="sky-transport">
            <button className="mc-button mc-primary" title={snapshot.status==='playing'?t.pause:t.play} onClick={()=>snapshot.status==='playing'||starting?void pause():void play()} disabled={!supported}>{snapshot.status==='playing'?<Pause size={17}/>:<Play size={17}/>} {snapshot.status==='playing'?t.pause:snapshot.status==='paused'?t.resume:t.play}</button>
            <button className="mc-button" disabled={!supported||starting} onClick={()=>{stop();void play();}}><RotateCcw size={17}/>{language==='ar'?'إعادة البدء':'Restart'}</button><button className="mc-button" onClick={stop} disabled={!supported}>Stop</button>
            <button className="sky-icon-button" onClick={stop} disabled={snapshot.status==='ready'&&!starting} aria-label={t.stop} title={t.stop}><Square size={17}/></button>
          </div><div className="sky-volume"><button className="sky-icon-button" aria-label={muted?t.unmute:t.mute} title={muted?t.unmute:t.mute} aria-pressed={muted} disabled={!supported} onClick={()=>{engine.setMuted(!muted);setMuted(!muted);}}>{muted?<VolumeX size={18}/>:<Volume2 size={18}/>}</button><label htmlFor="sky-volume">{t.volume}</label><input id="sky-volume" type="range" min="0" max="1" step=".01" value={volume} disabled={!supported} onChange={e=>{setVolume(+e.target.value);engine.setVolume(+e.target.value);}}/><output>{format(volume*100)}%</output></div></>}
          timeline={<OriginalWaveform id="sky-position" identity={day.day+volume+String(muted)} seconds={snapshot.seconds} duration={score.seconds} playing={snapshot.status==='playing'} getPcm={()=>engine.getPcm()} onSeek={value=>{const resume=snapshot.status==='playing';engine.seek(value);setSnapshot(engine.getSnapshot());if(resume&&value<score.seconds)void play();}} disabled={starting}/>}
          error={<>{!supported&&<p className="sky-warning" role="status">{t.unsupported}</p>}{audioError&&<p className="sky-warning" role="alert">{t.audioError}</p>}</>}
        />
        <details className="experience-science"><summary>{language==='ar'?'استكشف العلم':'Explore the Science'}</summary><p>{t.lead}</p><p>{t.intro}</p><p>{t.noLive}</p>{calendar.additional.length>0&&<aside className="sky-boundary-note"><strong>{t.boundaryTitle}</strong><p>{boundaryNote}</p></aside>}<div className="sky-map-legend"><span><i/>{t.legendRecorded}</span><span><i className="gold"/>{t.legendActive}</span><span><i className="band"/>{t.legendBand}</span></div>
          <p className="sky-map-help">{t.mapHelp}</p>
<div className="sky-instruments">
          <section className="sky-telemetry" aria-labelledby="sky-telemetry-title"><h2 id="sky-telemetry-title"><Radio size={18}/>{t.telemetry}</h2><div className="sky-readings"><div><span>{t.longitude}</span><strong dir="ltr">{longitude===null ? '—' : `${format(longitude,1)}°`}</strong><small>{t.band} {column===null ? '—' : format(column+1)} / {format(score.columns)}</small></div><div><span>{t.latitude}</span><strong dir="ltr">{current ? `${format(current.flash.latitude,2)}°` : '—'}</strong><small>{t.measurement}</small></div><div><span>{t.frequency}</span><strong dir="ltr">{current ? `${format(noteHz(current.note),1)} Hz` : '—'}</strong><small>{t.interpretation}</small></div><div><span>{t.note}</span><strong dir="ltr">{current ? noteName(current.note) : '—'}</strong><small>{current ? `MIDI ${current.note}` : t.none}</small></div></div>
            <details className="sky-audit"><summary>{t.readout}</summary><dl><div><dt>{t.sourceTime}</dt><dd dir="ltr">{current?.flash.time ?? '—'}</dd></div><div><dt>{t.sourceLongitude}</dt><dd dir="ltr">{current ? `${format(current.flash.longitude,4)}°` : '—'}</dd></div><div><dt>{t.radiance}</dt><dd dir="ltr">{current ? `${format(current.flash.radiance)} ${query.data.radiance_unit}` : '—'}</dd></div><div><dt>{t.bandCount}</dt><dd>{column!==null ? format(score.byColumn[column].length) : '—'}</dd></div><div><dt>{t.notes}</dt><dd>{format(score.events.length)}</dd></div></dl></details>
          </section>
          <section className="sky-lab" aria-labelledby="sky-lab-title"><h2 id="sky-lab-title"><AudioLines size={18}/>{t.lab}</h2><AudioSpectrum engine={engine} playing={snapshot.status==='playing' && !muted} label={t.spectrum}/><p>{t.labNote}</p></section>
        </div>
        <aside className="sky-provenance" aria-label={t.limitations}><h3>{t.limitations}</h3><p>{t.coverage}</p><p>{t.attribution}</p><p>{t.timestampRange}: <bdi>{query.data.flashes[0].time} / {query.data.flashes.at(-1)?.time}</bdi></p><a href="https://ghrc.nsstc.nasa.gov/lightning/" target="_blank" rel="noreferrer">{t.source}</a></aside></details>
      </>}
    </main>
  </div>;
}
