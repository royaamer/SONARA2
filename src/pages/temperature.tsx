import { observeMapResolution } from '../experiences/map-resolution';
import { OriginalWaveform, PlaybackVolume } from '../experiences/original-waveform';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Play, Pause, RotateCcw, ThermometerSun } from 'lucide-react';
import { useEarthSession } from '../earth/session';
import { MissionHeader, useMissionDocument } from '../mission-control/shared';
import { ScientificHud } from '../experiences/dashboard';
import { ExperienceDashboard, ObservationNavigator, ScientificScale, type MapPoint } from '../experiences/experience-dashboard';
import { useTemperature } from '../temperature/use-temperature';
import { TEMPERATURE_COPY } from '../temperature/content';
import { TEMPERATURE_ROOT, temperatureCell } from '../temperature/data';
import { colorAt, temperaturePosition, COLOR_NOTES, DURATION, RASTER_W, RASTER_H, STOPS, areaWeightedMean, noteName, pitchForPixels } from '../temperature/mapping';
import '../experiences/experience.css';
import '../temperature/temperature.css';

export default function Temperature(){
 const [point,setPoint]=useState<MapPoint|null>(null);
  const {language}=useEarthSession(),ar=language==='ar',t=TEMPERATURE_COPY[language],o=useTemperature();
  const canvas=useRef<HTMLCanvasElement>(null),heading=useRef<HTMLHeadingElement>(null);
  const [coast,setCoast]=useState('');
  useMissionDocument(t.title);
  useEffect(()=>heading.current?.focus({preventScroll:true}),[]);
  useEffect(()=>{
    const ctx=canvas.current?.getContext('2d');if(!ctx)return;
    return observeMapResolution(canvas.current!,RASTER_W,RASTER_H,()=>{ctx.clearRect(0,0,RASTER_W,RASTER_H);if(o.raster)ctx.drawImage(o.raster.raster,0,0);});
  },[o.raster]);
  useEffect(()=>{
    const controller=new AbortController();let url='';
    void fetch(import.meta.env.BASE_URL+'maps/world-equirectangular.svg',{signal:controller.signal}).then(r=>{if(!r.ok)throw Error('Coastline unavailable');return r.text();}).then(text=>{
      if(controller.signal.aborted)return;
      const svg=new DOMParser().parseFromString(text,'image/svg+xml');
      if(svg.querySelector('parsererror'))throw Error('Invalid coastline SVG');
      svg.documentElement.querySelector('rect')?.setAttribute('fill','none');
      for(const group of svg.documentElement.querySelectorAll('g')){group.setAttribute('fill','#113449');group.setAttribute('fill-opacity','0.10');group.setAttribute('stroke','#bcebe8');group.setAttribute('stroke-opacity','0.92');group.setAttribute('stroke-width','0.85');}
      url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));setCoast(url);
    }).catch(()=>{});
    return()=>{controller.abort();if(url)URL.revokeObjectURL(url);};
  },[]);
  const mean=useMemo(()=>o.data?areaWeightedMean(o.data):null,[o.data]);
  const active=o.snapshot.counts.map((count,i)=>({count,color:COLOR_NOTES[i],midi:pitchForPixels(COLOR_NOTES[i],count)})).filter(n=>n.count>0).sort((a,b)=>b.count-a.count);
  const notes=o.snapshot.status==='playing'?active.slice(0,3).map(n=>noteName(n.midi)).join(' · ')||t.silent:'—';
  const gradient=`linear-gradient(90deg in srgb, ${STOPS.map(([value,color])=>`rgb(${color.join(',')}) ${(value+5)*10}%`).join(',')})`;
  const monthLabel=(month:string,short=false)=>new Date(month+'-01T00:00:00Z').toLocaleDateString(language,{timeZone:'UTC',month:short?'short':'long',...(short?{}:{year:'numeric'})});
  const audit={source:{dataset:o.data?.dataset,month:o.month,baseline:o.data?.baseline,units:o.data?.units,source_file:o.data?.source_file,source_sha256:o.data?.source_sha256},scanner:{seconds:o.snapshot.seconds,column:o.snapshot.column,longitude:-180+(o.snapshot.column+.5)*360/RASTER_W,valid_pixels:o.snapshot.valid,raster:`${RASTER_W} × ${RASTER_H}`},notes:COLOR_NOTES.map((color,i)=>({color:color.name,pixels:o.snapshot.counts[i],base_midi:color.midi,assigned_midi:o.snapshot.counts[i]?pitchForPixels(color,o.snapshot.counts[i]):null})),mapping:t.mapping};
  const pixel=point?Math.min(RASTER_H-1,Math.floor((90-point.lat)/180*RASTER_H))*RASTER_W+Math.min(RASTER_W-1,Math.floor((point.lon+180)/360*RASTER_W)):null;
  const sampled=pixel===null?null:o.raster?.values[pixel];
  const measurement=sampled!=null&&Number.isFinite(sampled)?sampled:null;
  const cell=point&&o.data?temperatureCell(o.data,point.lon,point.lat):null;
  const scaleValue=point ? cell?.value??null : mean;
  const ready=!!o.raster&&!!o.data;
  const status=o.error?o.error:!ready?t.loading:t[o.snapshot.status];
  return <div className="mc experience temperature dashboard-experience" lang={language} dir={ar?'rtl':'ltr'}>
    <a className="mc-skip" href="#temperature-main">{t.title}</a><MissionHeader subtitle={t.title} back/>
    <main id="temperature-main">
      <div className="dashboard-heading"><h1 ref={heading} tabIndex={-1}>{t.title}</h1><Link className="temperature-return" href="/mission-control"><ArrowLeft size={15}/>{t.back}</Link></div>
      <ExperienceDashboard language={language} locations={o.data?.anomalies.flatMap((row,y)=>{const x=row.findIndex(v=>v!==null);return x<0?[]:[{lat:o.data!.lat[y],lon:o.data!.lon[x]}];})} temporal={{kind:"temperature"}} pauseOriginal={o.pause} point={point} onSelect={setPoint} label={t.map} busy={!ready&&!o.error} status={status}
        footprints={cell?[cell]:[]} observationKey={o.month+(o.data?'-ready':'-loading')}
        selectionSummary={cell?`GISTEMP source cell, latitude ${cell.south} to ${cell.north}, longitude ${cell.west} to ${cell.east}. ${o.month}. Original anomaly ${cell.value===null?'unavailable':cell.value.toFixed(3)+' degrees Celsius difference relative to 1951 to 1980'}. Smoothed display ${measurement===null?'unavailable':measurement.toFixed(3)+' degrees Celsius difference'}.`:''}
        navigator={<ObservationNavigator id="temperature-month" label={t.month} ar={ar} value={o.month} disabled={!o.catalog||o.starting} onChange={o.changeMonth} options={o.catalog?.months.map(m=>({value:m.month,label:monthLabel(m.month)}))??[]}/>}
        map={<div className="temperature-map" data-column={o.snapshot.column}>
          <canvas ref={canvas} width={RASTER_W} height={RASTER_H} role="img" aria-label={`${t.map} ${o.month}`} className="temperature-heatmap"/>
          {coast&&<img src={coast} alt="" className="temperature-coast"/>}
          {o.snapshot.status==='playing'&&<svg viewBox={`0 0 ${RASTER_W} ${RASTER_H}`} className="temperature-scanner" aria-hidden="true"><line x1={o.snapshot.seconds/DURATION*RASTER_W} x2={o.snapshot.seconds/DURATION*RASTER_W} y1="0" y2={RASTER_H}/></svg>}
        </div>}
        information={<>
          <div className="selection-reading" aria-label="Selected GISTEMP source cell">{cell ? <>
            <strong>GISTEMP source cell / {o.month}</strong>
            <p dir="ltr">Latitude {cell.south}–{cell.north}° / Longitude {cell.west}–{cell.east}°</p>
            <p>Original source anomaly {cell.value === null ? 'unavailable (missing data)' : cell.value.toFixed(3)+' °C difference'}</p>
            <p>Relative to 1951-1980. Scale uses the original source-cell anomaly.</p>
          </> : <p>Select a location to inspect its source cell.</p>}</div>
          </>}
        telemetry={<ScientificHud language={language} label={t.title} indicators={[
            {label:t.observation,value:o.data?monthLabel(o.month):'—'},
            {label:t.mean,value:mean===null?'—':`≈ ${mean>=0?'+':''}${mean.toLocaleString(language,{minimumFractionDigits:2,maximumFractionDigits:2})} °C`,direction:'ltr'},
            {label:t.notes,value:notes,direction:'ltr'},
          ]}/>}
        science={<>
          <ScientificScale measurement={{value:scaleValue,minimum:-5,maximum:5,unit:"°C",position:temperaturePosition(scaleValue??0),color:"rgb("+colorAt(scaleValue??0).join(",")+")",label:point?"Selected Region / source cell":"Full Map / area-weighted mean source anomaly"}} title={ar?'شذوذ الحرارة · فرق °C':'Temperature anomaly · °C difference'} gradient={gradient} ticks={['≤ −5 °C','0 °C','≥ +5 °C']}>
            <p>{ar?'خط الأساس 1951–1980. القيم الطرفية للألوان مقصوصة.':'Baseline 1951–1980. Colors clip at the endpoints.'}</p>
          </ScientificScale>
          <div className="dashboard-scope"><p>{ar?'الصوت الأصلي: مسح جغرافي لمدة 24 ثانية.':'Original audio · geographic scan (24 s).'}</p><p>{ar?'خلايا مفقودة شفافة؛ لا أرصاد يومية.':'Missing cells are transparent. No daily observations.'}</p></div>
        </>}
        controls={<><div className="temperature-transport"><button className="mc-button mc-primary" disabled={!ready} onClick={()=>o.snapshot.status==='playing'||o.starting?o.pause():void o.play()}>{o.snapshot.status==='playing'?<Pause size={17}/>:<Play size={17}/>} {o.snapshot.status==='playing'?t.pause:o.snapshot.status==='paused'?t.resume:t.play}</button><button className="mc-button" disabled={!ready} onClick={()=>{o.restart();void o.play();}}><RotateCcw size={17}/>{t.restart}</button><button className="mc-button" disabled={!ready} onClick={o.restart}>Stop</button></div><PlaybackVolume onChange={o.setVolume}/></>}
        timeline={<OriginalWaveform id="temperature-seek" identity={o.month} seconds={o.snapshot.seconds} duration={DURATION} playing={o.snapshot.status==='playing'} getPcm={o.getPcm} onSeek={o.seek} disabled={!ready||o.starting}/>}
        error={o.error&&<div role="alert" className="temperature-error"><p>{o.error}</p><button className="mc-button" onClick={o.retry}>{t.retry}</button></div>}
      />
      <details className="experience-science temperature-science"><summary>{t.science}</summary><p>{t.lead}</p><p>{t.intro}</p><p>{t.scope}</p><p>{t.mapping}</p><p>{t.legacy}</p><a href={o.data?.dataset_url??'https://data.giss.nasa.gov/gistemp/'} target="_blank" rel="noreferrer">NASA GISS GISTEMP v4</a><p><a href={TEMPERATURE_ROOT+'sonification_audit.json'}>{ar?'تدقيق المعالجة الأصلي':'Original processing audit'}</a></p><pre dir="ltr">{JSON.stringify(audit,null,2)}</pre><details><summary>{ar?'بيانات تدقيق المصدر':'Source audit metadata'}</summary><pre dir="ltr">{JSON.stringify(o.audit,null,2)}</pre></details></details>
    </main>
  </div>;
}
