import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { AudioLines, ArrowLeft, Pause, Play, Radio, ScanLine, Square, Volume2, VolumeX, Zap } from 'lucide-react';
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
const initialSnapshot:PlaybackSnapshot={ status:'ready',seconds:0,current:null,active:[] };
export default function ElectricSky() {
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
  const renderDay=(d:(typeof days)[number]) => <button key={d.day} aria-pressed={day.day===d.day} disabled={starting} onClick={()=>changeDate(days.indexOf(d))} aria-label={`${dateLabel(d.day)}; ${format(d.flashes.length)} ${t.flashes}`}><span>{new Date(d.day+'T12:00:00Z').toLocaleDateString(language==='ar'?'ar':'en',{month:'short',timeZone:'UTC'})}</span><strong>{format(Number(d.day.slice(-2)))}</strong><i style={{height:`${8+20*d.flashes.length/Math.max(...days.map(x=>x.flashes.length))}px`}}/></button>;
  const play=async() => {setStarting(true);setAudioError(false);try{await engine.play();}catch{if(mounted.current)setAudioError(true);}finally{if(mounted.current){setStarting(false);setSnapshot(engine.getSnapshot());}}};
  const pause=async() => {try{await engine.pause();}catch{setAudioError(true);}if(mounted.current)setSnapshot(engine.getSnapshot());};
  const stop=() => {engine.stop();setSnapshot(engine.getSnapshot());};
  const changeDate=(index:number) => {stop();setDateIndex(index);setAudioError(false);};
  const current=snapshot.status==='ready' ? null : snapshot.current;
  const audible=snapshot.status==='playing' && !muted && volume>0 ? snapshot.active.at(-1) : null;
  const longitude=score ? -180+360*snapshot.seconds/score.seconds : null;
  const column=score ? Math.min(score.columns-1,Math.floor(snapshot.seconds/score.seconds*score.columns)) : null;
  const status=starting ? t.starting : t[snapshot.status];
  return <div className="mc sky experience" dir={language === 'ar' ? 'rtl' : 'ltr'} lang={language}>
    <a href="#sky-main" className="mc-skip">{t.title}</a><MissionHeader subtitle={t.title} back/>
    <main id="sky-main">
      <Link className="sky-return" href="/mission-control"><ArrowLeft size={15}/>{t.returned}</Link>
      <div className="sky-heading"><div><p className="mc-eyebrow">{t.eyebrow}</p><h1 ref={title} tabIndex={-1}>{t.title}</h1><p className="sky-lead">{t.lead}</p><p className="sky-intro">{t.intro}</p></div><Zap size={80} strokeWidth={.6} aria-hidden="true"/></div>
      {query.isPending ? <div className="sky-load" role="status"><Radio size={30}/><p>{t.loading}</p></div> : query.isError || !query.data || !day || !score ? <div className="sky-load" role="alert"><p>{t.loadError}</p><button className="mc-button" onClick={()=>void query.refetch()}>{t.retry}</button></div> : <>
        <section className="sky-observation-bar" aria-label={t.date}><div><label htmlFor="sky-date">{t.date}</label><select id="sky-date" value={dateIndex} onChange={e=>changeDate(+e.target.value)} disabled={starting}><optgroup label={monthLabel}>{calendar.primary.map(d=><option key={d.day} value={days.indexOf(d)}>{dateLabel(d.day)}</option>)}</optgroup>{calendar.additional.length>0 && <optgroup label={t.additionalDates}>{calendar.additional.map(d=><option key={d.day} value={days.indexOf(d)}>{dateLabel(d.day)} / {t.additionalShort}</option>)}</optgroup>}</select></div><div className="sky-feed-status"><i/><span>{t.noLive}</span></div></section>
        {calendar.additional.length>0 && <aside className="sky-boundary-note" aria-label={t.boundaryTitle}><strong>{t.boundaryTitle}</strong><p>{boundaryNote}</p></aside>}
        <section className="sky-observation" aria-label={t.map}>
          <div className="sky-map-head"><span><ScanLine size={15}/>{t.map}</span><span className="sky-status" role="status">{status}</span></div>
          <div className="scientific-view"><LightningMap day={day} score={score} snapshot={snapshot} label={t.map} mapError={t.loadError}/>
    <ScientificHud label={t.telemetry} language={language} indicators={[
            {label:language==='ar'?'ومضات البرق':'Lightning activity',value:format(day.flashes.length)},
            {label:language==='ar'?'موقع المسح':'Scanning position',value:format(longitude!,1)+'°',direction:'ltr'},
            {label:language==='ar'?'الصوت المباشر':'Live frequency',eventKey:audible?String(audible.at):undefined,value:audible?noteName(audible.note)+' · '+format(noteHz(audible.note),1)+' Hz':'—',direction:'ltr'},
          ]}/>
</div>
          <div className="sky-transport">
            <button className="mc-button mc-primary" onClick={()=>void play()} disabled={!supported || starting || snapshot.status==='playing'}><Play size={17}/>{snapshot.status==='paused' ? t.resume : snapshot.status==='complete' ? t.play : t.activate}</button>
            <button className="sky-icon-button" onClick={()=>void pause()} disabled={snapshot.status!=='playing' && !starting} aria-label={t.pause} title={t.pause}><Pause size={19}/></button>
            <button className="sky-icon-button" onClick={stop} disabled={snapshot.status==='ready' && !starting} aria-label={t.stop} title={t.stop}><Square size={17}/></button>

          </div>
            <div className="sky-position"><label htmlFor="sky-position">{t.progress}<output>{format(snapshot.seconds,1)} / {format(score.seconds)} s</output></label><input id="sky-position" type="range" min="0" max={score.seconds} step="0.01" value={snapshot.seconds} disabled={starting} onChange={e=>{engine.seek(+e.target.value);setSnapshot(engine.getSnapshot());}} aria-valuetext={`${format(longitude!,1)}°; ${format(snapshot.seconds,1)} s`}/></div>
          {!supported && <p className="sky-warning" role="status">{t.unsupported}</p>}{audioError && <p className="sky-warning" role="alert">{t.audioError}</p>}
        </section>
        <section className="sky-date-timeline" aria-labelledby="sky-date-title"><div><h2 id="sky-date-title">{t.timeline}</h2><p>{t.dateHelp}</p></div><div className="sky-calendar"><div className="sky-days" role="group" aria-label={monthLabel}>{calendar.primary.map(renderDay)}</div>{calendar.additional.length>0 && <div className="sky-extra-days"><p>{t.additionalDates}</p><div className="sky-days" role="group" aria-label={t.additionalDates}>{calendar.additional.map(renderDay)}</div></div>}</div></section>
              <details className="experience-science"><summary>{language==='ar'?'استكشف العلم':'Explore the Science'}</summary>          <div className="sky-map-legend"><span><i/>{t.legendRecorded}</span><span><i className="gold"/>{t.legendActive}</span><span><i className="band"/>{t.legendBand}</span></div>
          <p className="sky-map-help">{t.mapHelp}</p>
<div className="sky-instruments">
          <section className="sky-telemetry" aria-labelledby="sky-telemetry-title"><h2 id="sky-telemetry-title"><Radio size={18}/>{t.telemetry}</h2><div className="sky-readings"><div><span>{t.longitude}</span><strong dir="ltr">{longitude===null ? '—' : `${format(longitude,1)}°`}</strong><small>{t.band} {column===null ? '—' : format(column+1)} / {format(score.columns)}</small></div><div><span>{t.latitude}</span><strong dir="ltr">{current ? `${format(current.flash.latitude,2)}°` : '—'}</strong><small>{t.measurement}</small></div><div><span>{t.frequency}</span><strong dir="ltr">{current ? `${format(noteHz(current.note),1)} Hz` : '—'}</strong><small>{t.interpretation}</small></div><div><span>{t.note}</span><strong dir="ltr">{current ? noteName(current.note) : '—'}</strong><small>{current ? `MIDI ${current.note}` : t.none}</small></div></div>
            <details className="sky-audit"><summary>{t.readout}</summary><dl><div><dt>{t.sourceTime}</dt><dd dir="ltr">{current?.flash.time ?? '—'}</dd></div><div><dt>{t.sourceLongitude}</dt><dd dir="ltr">{current ? `${format(current.flash.longitude,4)}°` : '—'}</dd></div><div><dt>{t.radiance}</dt><dd dir="ltr">{current ? `${format(current.flash.radiance)} ${query.data.radiance_unit}` : '—'}</dd></div><div><dt>{t.bandCount}</dt><dd>{column!==null ? format(score.byColumn[column].length) : '—'}</dd></div><div><dt>{t.notes}</dt><dd>{format(score.events.length)}</dd></div></dl></details>
          </section>
          <section className="sky-lab" aria-labelledby="sky-lab-title"><h2 id="sky-lab-title"><AudioLines size={18}/>{t.lab}</h2><AudioSpectrum engine={engine} playing={snapshot.status==='playing' && !muted} label={t.spectrum}/><div className="sky-volume"><button className="sky-icon-button" aria-label={muted?t.unmute:t.mute} title={muted?t.unmute:t.mute} aria-pressed={muted} disabled={!supported} onClick={()=>{engine.setMuted(!muted);setMuted(!muted);}}>{muted?<VolumeX size={18}/>:<Volume2 size={18}/>}</button><label htmlFor="sky-volume">{t.volume}</label><input id="sky-volume" type="range" min="0" max="1" step=".01" value={volume} disabled={!supported} onChange={e=>{setVolume(+e.target.value);engine.setVolume(+e.target.value);}}/><output>{format(volume*100)}%</output></div><p>{t.labNote}</p></section>
        </div>
        <aside className="sky-provenance" aria-label={t.limitations}><h3>{t.limitations}</h3><p>{t.coverage}</p><p>{t.attribution}</p><p>{t.timestampRange}: <bdi>{query.data.flashes[0].time} / {query.data.flashes.at(-1)?.time}</bdi></p><a href="https://ghrc.nsstc.nasa.gov/lightning/" target="_blank" rel="noreferrer">{t.source}</a></aside></details>
      </>}
    </main><footer className="mc-footer"><span>{t.noLive}</span><Link href="/">{t.home}</Link></footer>
  </div>;
}
