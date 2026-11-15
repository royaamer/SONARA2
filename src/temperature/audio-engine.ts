import type { PlaybackState } from '../experiences/playback-state';
import { COLOR_NOTES, DURATION, RASTER_H, clamp, colorCounts, hz, pitchForPixels, scanColumn } from './mapping';

export class TemperatureAudioEngine {
  playbackState: PlaybackState = 'idle';
  private context:AudioContext|null=null;
  private compressor:DynamicsCompressorNode|null=null;
  private master:GainNode|null=null;
  private analyser:AnalyserNode|null=null;
  private volume=.78;
  private voices:{osc:OscillatorNode;gain:GainNode}[]=[];
  private bands:Int8Array|null=null;
  private position=0;
  private startClock=0;
  private generation=0;
  private disposed=false;
  private column=-1;
  status:'ready'|'playing'|'paused'|'complete'='ready';

  load(bands:Int8Array){this.disposed=false;this.restart();this.bands=bands;this.playbackState='idle';}
  async play(){
    if(!this.bands||this.status==='playing'||this.disposed)return;
    const token=++this.generation;
    if(!this.context){
      const AudioContextCtor=window.AudioContext??(window as Window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
      if(!AudioContextCtor)throw Error('Web Audio is unavailable in this browser');
      this.context=new AudioContextCtor();
      this.compressor=this.context.createDynamicsCompressor();
      this.compressor.threshold.value=-18;this.compressor.knee.value=14;this.compressor.ratio.value=2.7;this.compressor.attack.value=.02;this.compressor.release.value=.18;
      this.master=this.context.createGain();this.master.gain.value=this.volume;
      this.analyser=this.context.createAnalyser();this.analyser.fftSize=2048;
      this.compressor.connect(this.master).connect(this.analyser).connect(this.context.destination);
    }
    try{await this.context.resume();}catch(error){if(token!==this.generation||this.disposed)return;throw error;}
    if(token!==this.generation||this.disposed)return;
    if(this.context.state!=='running')throw Error('Browser audio is suspended');
    if(this.position>=DURATION)this.position=0;
    this.release();
    const now=this.context.currentTime;
    for(const color of COLOR_NOTES){const osc=this.context.createOscillator(),gain=this.context.createGain();osc.type=color.shape;osc.frequency.value=hz(color.midi);gain.gain.value=0;osc.connect(gain).connect(this.compressor!);osc.start(now);osc.stop(now+DURATION-this.position);osc.onended=()=>{if(token===this.generation&&this.status==='playing'){this.position=DURATION;this.status='complete';this.playbackState='ended';this.release();}};this.voices.push({osc,gain});}
    this.startClock=now-this.position;this.column=-1;this.status='playing';this.playbackState='playing';this.snapshot();
  }
  private release(){
    if(!this.context)return;
    const now=this.context.currentTime;
    for(const {osc,gain} of this.voices){gain.gain.cancelScheduledValues(now);gain.gain.setValueAtTime(0,now);osc.onended=null;try{osc.stop(now);}catch{/* already stopped */}osc.disconnect();gain.disconnect();}
    this.voices=[];
  }
  pause(){++this.generation;if(this.status==='playing')this.position=this.time();this.status=this.position>=DURATION?'complete':'paused';this.playbackState=this.status==='complete'?'ended':'paused';this.release();}
  restart(){this.pause();this.position=0;this.status='ready';this.playbackState='stopped';this.column=-1;}
  seek(seconds:number){const resume=this.status==='playing';this.pause();this.position=clamp(seconds,0,DURATION);this.status=this.position>=DURATION?'complete':'paused';this.playbackState=this.status==='complete'?'ended':'paused';return resume&&this.position<DURATION;}
  private time(){return this.status==='playing'&&this.context?clamp(this.context.currentTime-this.startClock,0,DURATION):this.position;}
  snapshot(){
    const seconds=this.time(),column=scanColumn(seconds);
    const {counts,valid}=this.bands?colorCounts(this.bands,column):{counts:Array<number>(7).fill(0),valid:0};
    if(this.status==='playing'&&this.context){
      if(seconds>=DURATION){this.position=DURATION;this.status='complete';this.release();}
      else if(this.context.state!=='running'){this.pause();}
      else if(column!==this.column){
        this.column=column;
        const active=counts.filter(n=>n>0).length,now=this.context.currentTime;
        this.voices.forEach(({osc,gain},i)=>{const pixels=counts[i],share=pixels/RASTER_H;osc.frequency.setTargetAtTime(hz(pitchForPixels(COLOR_NOTES[i],pixels)),now,.045);const level=pixels===0?0:(.012+.20*Math.pow(share,.95))/Math.sqrt(Math.max(1,active/2));gain.gain.setTargetAtTime(level,now,pixels ? .055 : .04);});
      }
    }
    return {status:this.status,seconds,column,counts,valid};
  }
  setVolume(value:number){this.volume=clamp(value,0,1);if(this.master)this.master.gain.value=this.volume;}
  getPcm(){if(!this.analyser)return null;const samples=new Float32Array(this.analyser.fftSize);this.analyser.getFloatTimeDomainData(samples);return samples;}
  dispose(){this.disposed=true;this.restart();this.bands=null;this.master?.disconnect();this.analyser?.disconnect();void this.context?.close().catch(()=>{});this.context=null;this.master=null;this.analyser=null;}
}
