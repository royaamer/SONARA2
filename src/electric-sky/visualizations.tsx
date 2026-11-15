import { observeMapResolution } from '../experiences/map-resolution';
﻿import { useEffect, useRef } from 'react';
import type { ObservationDay, ScannerScore } from './scanner-score';
import { projectFlash } from './scanner-score';
import { activityAt, activityColor, type buildActivityGrid } from './activity-scale';
import type { PlaybackSnapshot, ScannerAudioEngine } from './audio-engine';
export function LightningMap({ day, score, snapshot, label, mapError, activity }: { day:ObservationDay; score:ScannerScore; snapshot:PlaybackSnapshot; label:string; mapError:string; activity:ReturnType<typeof buildActivityGrid> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if(!ctx) return;
    return observeMapResolution(canvas.current!,2000,1000,()=>{
    ctx.clearRect(0,0,2000,1000);
    // Keep dots small in screen pixels at the current DPR and zoom.
    const radius = 1.5 * 2000 / canvas.current!.getBoundingClientRect().width;
    for (const flash of day.flashes) {
      const p = projectFlash(flash);
      ctx.beginPath();
      ctx.arc(p.x * 2, p.y * 2, radius, 0, Math.PI * 2);
      ctx.fillStyle = activityColor(activityAt(activity, flash.longitude, flash.latitude)!, activity.maximum);
      ctx.fill();
    }
    });
  },[day,activity]);
  const progress=snapshot.seconds/score.seconds;
  const column=Math.min(score.columns-1,Math.floor(progress*score.columns));
  const active=snapshot.active;
  return <div className="sky-map" role="img" aria-label={`${label}: ${day.day}; ${day.flashes.length}`} dir="ltr">
    <img src={`${import.meta.env.BASE_URL}maps/world-equirectangular.svg`} alt="" onError={e => { e.currentTarget.style.opacity='0'; e.currentTarget.parentElement?.setAttribute('data-map-error',mapError); }}/>
    <canvas ref={canvas} width="2000" height="1000" aria-hidden="true"/>
    <svg viewBox="0 0 1000 500" aria-hidden="true" className="sky-map-overlay">
      <defs><linearGradient id="scanner-trail"><stop stopColor="#a4dceb" stopOpacity="0"/><stop offset="1" stopColor="#a4dceb" stopOpacity=".25"/></linearGradient></defs>
      {[250,500,750].map(x => <line key={x} x1={x} x2={x} y1="0" y2="500" className="sky-graticule"/>)}
      {[125,250,375].map(y => <line key={y} x1="0" x2="1000" y1={y} y2={y} className="sky-graticule"/>)}
      {snapshot.status !== 'ready' && <><rect x={column/score.columns*1000} width={1000/score.columns} height="500" fill="#d6a66b" opacity=".08"/><rect x={Math.max(0,progress*1000-55)} width={Math.min(55,progress*1000)} height="500" fill="url(#scanner-trail)"/><line x1={progress*1000} x2={progress*1000} y1="0" y2="500" className="sky-scan-line"/></>}
      {active.map((event,i) => { const p=projectFlash(event.flash);return <g key={`${event.at}-${i}`}><circle cx={p.x} cy={p.y} r="11" fill="#e8bd7422" stroke="#e8bd7477"/><circle cx={p.x} cy={p.y} r="4" fill="#ffda91"/></g>; })}
      <text x="12" y="24">90° N</text><text x="12" y="485">90° S</text><text x="12" y="260">0°</text><text x="500" y="485" textAnchor="middle">0°</text><text x="970" y="485" textAnchor="end">180° E</text><text x="12" y="465">180° W</text>
    </svg>
  </div>;
}
export function AudioSpectrum({ engine, playing, label }: { engine:ScannerAudioEngine; playing:boolean; label:string }) {
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame=0;
    const draw=() => {
      const ctx=canvas.current?.getContext('2d');
      if(ctx){const bins=engine.getSpectrum();ctx.clearRect(0,0,640,96);ctx.fillStyle='#a4dceb';for(let i=0;i<48;i++){const height=playing ? bins[i]/255*80 : 0;ctx.fillRect(i*13,90-height,5,Math.max(1,height));}}
      frame=requestAnimationFrame(draw);
    };draw();return () => cancelAnimationFrame(frame);
  },[engine,playing]);
  return <canvas className="sky-spectrum" ref={canvas} width="640" height="96" role="img" aria-label={label}/>;
}
