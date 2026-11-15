import { useEffect, useRef, useState } from 'react';
import { TemperatureAudioEngine } from './audio-engine';
import { temperatureJson, validateCatalog, validateTemperature, type TemperatureCatalog, type TemperatureMonth } from './data';
import { renderSmoothHeatmap } from './mapping';

export function useTemperature(){
  const [catalog,setCatalog]=useState<TemperatureCatalog|null>(null);
  const [audit,setAudit]=useState<unknown>(null),[month,setMonth]=useState('');
  const [data,setData]=useState<TemperatureMonth|null>(null);
  const [raster,setRaster]=useState<ReturnType<typeof renderSmoothHeatmap>|null>(null);
  const [error,setError]=useState(''),[attempt,setAttempt]=useState(0),[starting,setStarting]=useState(false);
  const [engine]=useState(()=>new TemperatureAudioEngine());
  const [snapshot,setSnapshot]=useState(()=>engine.snapshot());
  const alive=useRef(true);
  useEffect(()=>{const controller=new AbortController();
    void Promise.all([temperatureJson('months.json',controller.signal),temperatureJson('sonification_audit.json',controller.signal)]).then(([input,sourceAudit])=>{
      const c=validateCatalog(input),a=sourceAudit as Record<string,unknown>;
      if(!a||a.dataset!==c.dataset||a.source_sha256!==c.source_sha256||a.baseline!=='1951-1980')throw Error('Temperature source audit mismatch');
      if(!controller.signal.aborted){setCatalog(c);setAudit(sourceAudit);setMonth(current=>current||c.months[0].month);}
    }).catch(e=>{if(!controller.signal.aborted)setError(String(e));});
    return()=>controller.abort();
  },[attempt]);
  useEffect(()=>{
    if(!catalog||!month)return;
    const controller=new AbortController();engine.restart();setSnapshot(engine.snapshot());setData(null);setRaster(null);setError('');
    const entry=catalog.months.find(m=>m.month===month);
    if(!entry){setError('Temperature month unavailable');return;}
    void temperatureJson(entry.file,controller.signal).then(input=>{
      if(controller.signal.aborted)return;
      const d=validateTemperature(input,month,catalog),rendered=renderSmoothHeatmap(d);
      if(controller.signal.aborted)return;
      engine.load(rendered.bands);setData(d);setRaster(rendered);setSnapshot(engine.snapshot());
    }).catch(e=>{if(!controller.signal.aborted)setError(String(e));});
    return()=>controller.abort();
  },[catalog,month,attempt,engine]);
  useEffect(()=>{
    alive.current=true;let frame=0,last=0;
    const tick=(now:number)=>{if(now-last>=32){setSnapshot(engine.snapshot());last=now;}frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);
    return()=>{alive.current=false;cancelAnimationFrame(frame);engine.dispose();};
  },[engine]);
  const play=async()=>{setStarting(true);setError('');try{await engine.play();}catch(e){if(alive.current){engine.pause();setError(String(e));}}finally{if(alive.current){setStarting(false);setSnapshot(engine.snapshot());}}};
  const pause=()=>{engine.pause();setSnapshot(engine.snapshot());};
  const restart=()=>{engine.restart();setSnapshot(engine.snapshot());};
  const seek=(seconds:number)=>{const resume=engine.seek(seconds);setSnapshot(engine.snapshot());if(resume)void play();};
  const changeMonth=(value:string)=>{if(!catalog?.months.some(m=>m.month===value))return;engine.restart();setData(null);setRaster(null);setSnapshot(engine.snapshot());if(value===month)setAttempt(n=>n+1);else setMonth(value);};
  return {catalog,audit,month,data,raster,error,starting,snapshot,play,pause,restart,seek,changeMonth,getPcm:()=>engine.getPcm(),setVolume:(v:number)=>engine.setVolume(v),retry:()=>setAttempt(n=>n+1)};
}
