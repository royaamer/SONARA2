import type { PlaybackState } from '../experiences/playback-state';
import {useEffect,useRef,useState} from 'react';
import type {Availability,Catalog,OceanData} from './types';
import {createOceanRenderer} from './renderer';
export const OCEAN_ROOT=import.meta.env.BASE_URL+'data/ocean/';
export function useOcean(){
 const [catalog,setCatalog]=useState<Catalog|null>(null),[availability,setAvailability]=useState<Availability[]>([]),[month,setMonth]=useState('');
 const [data,setData]=useState<OceanData|null>(null),[progress,setProgress]=useState(0),[error,setError]=useState(''),[ready,setReady]=useState(false),[seconds,setSeconds]=useState(0),[status,setStatus]=useState<'ready'|'playing'|'paused'|'complete'>('ready'),[bassoonOn,setBassoonOn]=useState(true),[attempt,setAttempt]=useState(0);
 const playbackState=useRef<PlaybackState>('idle');
 const audio=useRef<HTMLAudioElement>(null),bassoon=useRef<HTMLAudioElement>(null),canvas=useRef<HTMLCanvasElement>(null),renderer=useRef<ReturnType<typeof createOceanRenderer>|null>(null),bassoonEnabled=useRef(true),generation=useRef(0);
 bassoonEnabled.current=bassoonOn;
 const volume=useRef(1);
 const setVolume=(value:number)=>{volume.current=Math.max(0,Math.min(1,value));if(audio.current)audio.current.volume=volume.current;if(bassoon.current)bassoon.current.volume=volume.current*.52;};
 const playbackRequested=useRef(false),bassoonRequest=useRef(0);
 useEffect(()=>{const controller=new AbortController();
  const json=async(p:string)=>{const r=await fetch(OCEAN_ROOT+p,{signal:controller.signal});if(!r.ok)throw Error(p+': HTTP '+r.status);return r.json();};
  void Promise.all([json('months.json'),json('availability.json')]).then(([c,a]:[Catalog,{months:Availability[]}])=>{
   if(controller.signal.aborted)return;
   if(c.dataset!=='NASA PO.DAAC OSCAR_L4_OC_FINAL_V2.0'||c.year!==2023||c.schemaVersion!==1||!Array.isArray(c.months)||!Array.isArray(a.months))throw Error('Invalid Ocean catalog');
   setCatalog(c);setAvailability(a.months);setMonth(current=>current||c.months.find(m=>a.months.some(v=>v.month===m.month&&v.ready))?.month||'');
   if(!c.months.some(m=>a.months.some(v=>v.month===m.month&&v.ready)))throw Error('No complete Ocean months');
  }).catch(e=>{if(!controller.signal.aborted)setError(String(e));});return()=>controller.abort();
 },[attempt]);
 useEffect(()=>{if(!month)return;setData(null);setReady(false);setError('');setProgress(0);setSeconds(0);setStatus('ready');playbackState.current='idle';
  const worker=new Worker(new URL('./loader.worker.ts',import.meta.url),{type:'module'});
  worker.onmessage=e=>{if(e.data.progress)setProgress(e.data.progress);if(e.data.data)setData(e.data.data);if(e.data.error)setError(e.data.error);};
  worker.onerror=()=>setError('Ocean worker failed');worker.postMessage({root:new URL(OCEAN_ROOT,document.baseURI).href,month});return()=>worker.terminate();
 },[month,attempt]);
 useEffect(()=>{
  const a=audio.current!,b=bassoon.current!;setReady(false);
  if(!data||!canvas.current)return;
  let frame=0,lastFrame=0,previous=0,alive=true;
  const count=data.fields.length,duration=data.audit.duration_seconds;
  try{renderer.current=createOceanRenderer(canvas.current,data.manifest,data.fields,data.selected.month);}catch(e){setError(String(e));return;}
  const position=(s:number)=>Math.max(0,Math.min(1,s/Math.max(a.duration||duration,.01)))*(count-1);
  const fail=()=>{if(alive){playbackRequested.current=false;generation.current++;bassoonRequest.current++;a.pause();b.pause();setReady(false);setError('Original monthly audio could not be loaded or played');}};
  const checkReady=()=>{if(!alive)return;const streams=data.bassoonAudit?[a,b]:[a];if(streams.every(x=>x.readyState>=1)){
   if(streams.some(x=>!Number.isFinite(x.duration)||Math.abs(x.duration-duration)>.3)){fail();return;}setReady(true);
  }};
  const tick=(now:number)=>{if(!alive||a.paused)return;if(!lastFrame)lastFrame=now;const elapsed=Math.max(0,Math.min(.12,(now-lastFrame)/1000));lastFrame=now;
   renderer.current?.advance(position(previous),position(a.currentTime),elapsed);previous=a.currentTime;
   if(data.bassoonAudit&&bassoonEnabled.current&&Math.abs(b.currentTime-a.currentTime)>.075)b.currentTime=Math.min(a.currentTime,b.duration||a.currentTime);
   setSeconds(a.currentTime);frame=requestAnimationFrame(tick);
  };
  const played=()=>{if(!playbackRequested.current){a.pause();b.pause();return;}if(a.paused)return;previous=a.currentTime;lastFrame=0;cancelAnimationFrame(frame);setStatus('playing');playbackState.current='playing';frame=requestAnimationFrame(tick);};
  const bassoonPlayed=()=>{if(!playbackRequested.current||!bassoonEnabled.current)b.pause();};
  // Media events are queued: a pause from seeking must not pause a subsequent resume.
  const paused=()=>{if(!a.paused)return;playbackRequested.current=false;generation.current++;cancelAnimationFrame(frame);b.pause();setSeconds(a.currentTime);setStatus(a.ended?'complete':'paused');playbackState.current=a.ended?'ended':'paused';};
  const ended=()=>{playbackRequested.current=false;generation.current++;bassoonRequest.current++;a.pause();b.pause();cancelAnimationFrame(frame);setSeconds(duration);setStatus('complete');playbackState.current='ended';};
  a.addEventListener('play',played);a.addEventListener('pause',paused);a.addEventListener('ended',ended);
  b.addEventListener('play',bassoonPlayed);
  for(const x of [a,b]){x.addEventListener('loadedmetadata',checkReady);x.addEventListener('error',fail);}
  a.src=OCEAN_ROOT+data.selected.audio;a.volume=volume.current;a.load();
  if(data.bassoonAudit&&data.selected.bassoon){b.src=OCEAN_ROOT+data.selected.bassoon;b.volume=volume.current*.52;b.load();}
  checkReady();
  return()=>{renderer.current?.dispose();alive=false;playbackRequested.current=false;generation.current++;bassoonRequest.current++;cancelAnimationFrame(frame);a.removeEventListener('play',played);a.removeEventListener('pause',paused);a.removeEventListener('ended',ended);b.removeEventListener('play',bassoonPlayed);for(const x of [a,b]){x.removeEventListener('loadedmetadata',checkReady);x.removeEventListener('error',fail);x.pause();x.removeAttribute('src');x.load();}renderer.current=null;};
 },[data]);
 const pause=()=>{playbackRequested.current=false;generation.current++;bassoonRequest.current++;audio.current?.pause();bassoon.current?.pause();setSeconds(audio.current?.currentTime??0);setStatus('paused');playbackState.current='paused';};
 const start=()=>{if(!data||!ready||error)return;const a=audio.current!,b=bassoon.current!,mine=++generation.current;playbackRequested.current=true;setStatus('playing');if(a.ended)a.currentTime=0;
  const failed=(e:DOMException)=>{if(generation.current===mine&&e.name!=='AbortError'){pause();setError(String(e));}};
  const settled=()=>{if(mine!==generation.current&&!playbackRequested.current){a.pause();b.pause();}};
  if(data.bassoonAudit&&bassoonOn){b.currentTime=a.currentTime;void b.play().then(settled).catch(failed);}
  void a.play().then(settled).catch(failed);
 };
 const seek=(value:number,resume=!audio.current!.paused)=>{pause();const a=audio.current!,b=bassoon.current!;a.currentTime=value;if(data?.bassoonAudit)b.currentTime=value;setSeconds(value);renderer.current?.reset();if(!resume&&value===0)playbackState.current='stopped';if(value>=(data?.audit.duration_seconds??Infinity)){setStatus('complete');playbackState.current='ended';}else if(resume)start();};
 const changeMonth=(value:string)=>{if(!availability.some(m=>m.month===value&&m.ready))return;pause();setReady(false);setData(null);if(value===month)setAttempt(n=>n+1);else setMonth(value);};
 const toggleBassoon=(value:boolean)=>{pause();bassoonEnabled.current=value;setBassoonOn(value);};
 const retry=()=>{pause();setError('');setAttempt(n=>n+1);};
 return {playbackState:playbackState.current,catalog,availability,month,data,progress,error,ready,seconds,status,bassoonOn,audio,bassoon,canvas,setVolume,start,pause,seek,changeMonth,toggleBassoon,retry};
}
