import { noteHz, type ScannerScore, type ScannerEvent } from './scanner-score';
export type PlaybackStatus = 'ready' | 'playing' | 'paused' | 'complete';
export type PlaybackSnapshot = { status: PlaybackStatus; seconds: number; current: ScannerEvent | null; active: ScannerEvent[] };
/** One AudioContext clock owns notes, scan position, and source-record highlights.
 * Native synthesis replaces Tone.js only; EarthJukeBox score mapping stays unchanged.
 * No fixed chords, bass or fabricated observations are added.
 */
export class ScannerAudioEngine {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private voices = new Set<{ oscillator: OscillatorNode; gain: GainNode; panner: AudioNode | null; startAt: number }>();
  private score: ScannerScore | null = null;
  private status: PlaybackStatus = 'ready';
  private offset = 0;
  private playedFrom: number | null = null;
  private anchor = 0;
  private volume = .65;
  private muted = false;
  private generation = 0;
  private disposed = false;
  constructor(private createContext: () => AudioContext = () => new AudioContext()) {}
  load(score: ScannerScore) { this.stop(); this.score = score; }
  private initialize() {
    if (this.disposed) throw Error('Audio engine disposed');
    if (this.context) return this.context;
    const context = this.createContext();
    this.context = context;
    this.output = context.createGain();
    this.output.gain.value = this.muted ? 0 : this.volume;
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 128;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -8; limiter.knee.value = 12; limiter.ratio.value = 8;
    this.output.connect(this.analyser); this.analyser.connect(limiter); limiter.connect(context.destination);
    return context;
  }
  async play() {
    if (!this.score || this.status === 'playing') return;
    const token = ++this.generation;
    const context = this.initialize();
    await context.resume(); // called exclusively from an explicit playback gesture
    if (token !== this.generation || this.disposed) return;
    if (context.state !== 'running') throw Error('Audio context could not start');
    if (this.status === 'complete') this.offset = 0;
    this.clearVoices();
    this.playedFrom = this.offset;
    this.anchor = context.currentTime + .06 - this.offset;
    for (const event of this.score.events) {
      if (event.at < this.offset) continue;
      const at = this.anchor + event.at;
      const oscillator = context.createOscillator(), gain = context.createGain();
      const longitude = event.flash.longitude;
      const stereo = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null;
      const panner: AudioNode | null = stereo ?? (typeof context.createPanner === 'function' ? context.createPanner() : null);
      if (stereo) stereo.pan.setValueAtTime(Math.max(-1, Math.min(1, longitude / 180)), at);
      else if (panner) { const legacy = panner as PannerNode; legacy.panningModel = 'equalpower'; legacy.setPosition(Math.sin(longitude * Math.PI / 180), 0, -Math.cos(longitude * Math.PI / 180)); }
      oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(noteHz(event.note), at);
      const level = event.velocity * .16;
      gain.gain.setValueAtTime(0,at);
      gain.gain.linearRampToValueAtTime(level,at+.015);
      gain.gain.linearRampToValueAtTime(level*.24,at+Math.min(.175,event.duration));
      gain.gain.setValueAtTime(level*.24,at+event.duration);
      gain.gain.linearRampToValueAtTime(0,at+event.duration+.26);
      oscillator.connect(gain); if (panner) { gain.connect(panner); panner.connect(this.output!); } else gain.connect(this.output!);
      const voice = { oscillator, gain, panner, startAt:at }; this.voices.add(voice);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); panner?.disconnect(); this.voices.delete(voice); };
      oscillator.start(at); oscillator.stop(at+event.duration+.27);
    }
    this.status = 'playing';
  }
  async pause() {
    const token = ++this.generation;
    if (!this.context) return;
    this.offset = this.getSnapshot().seconds;
    this.status = 'paused';
    this.clearVoices();
    // Allow the short release to finish before freezing the audio clock.
    await new Promise(resolve => setTimeout(resolve,12));
    if (token === this.generation && this.context.state !== 'closed') await this.context.suspend();
  }
  stop() {
    ++this.generation; this.clearVoices(); this.offset = 0; this.playedFrom = null; this.status = 'ready';
  }
  seek(seconds: number) {
    ++this.generation; this.clearVoices(); this.playedFrom = null;
    this.offset = Math.max(0,Math.min(this.score?.seconds ?? 0,seconds));
    this.status = this.offset >= (this.score?.seconds ?? Infinity) ? 'complete' : 'paused';
  }
  setVolume(value: number) { this.volume = Math.max(0,Math.min(1,value)); this.updateGain(); }
  setMuted(value: boolean) { this.muted = value; this.updateGain(); }
  private updateGain() {
    if (this.context && this.output) this.output.gain.setTargetAtTime(this.muted ? 0 : this.volume,this.context.currentTime,.025);
  }
  private clearVoices() {
    for (const { oscillator, gain, panner, startAt } of this.voices) {
      oscillator.onended = null;
      const disconnect=()=>{oscillator.disconnect();gain.disconnect();panner?.disconnect();};
      const now=this.context?.currentTime??0;
      if(this.context?.state==='running' && now>=startAt && typeof gain.gain.cancelAndHoldAtTime==='function') {
        gain.gain.cancelAndHoldAtTime(now);
        gain.gain.linearRampToValueAtTime(0,now+.006);
        try { oscillator.stop(now+.007); } catch { /* already stopped */ }
        setTimeout(disconnect,12);
      } else {
        try { oscillator.stop(); } catch { /* already stopped */ }
        disconnect();
      }
    }
    this.voices.clear();
  }
  getSnapshot(): PlaybackSnapshot {
    const score = this.score;
    const seconds = this.status === 'playing' && this.context ? Math.max(0,Math.min(score?.seconds ?? 0,this.context.currentTime-this.anchor)) : this.offset;
    if (score && seconds >= score.seconds && this.status === 'playing') { this.offset = score.seconds; this.status = 'complete'; this.clearVoices(); }
    // Browser background suspension / audio interruptions must not leave a moving visual clock.
    if (this.status === 'playing' && this.context?.state === 'suspended') { this.offset = seconds; this.status = 'paused'; this.clearVoices(); }
    const clockStarted = this.status !== 'playing' || Boolean(this.context && this.context.currentTime >= this.anchor + (this.playedFrom ?? 0));
    const past = this.playedFrom === null || !clockStarted ? [] : score?.events.filter(e => e.at >= this.playedFrom! && e.at <= seconds) ?? [];
    return { status:this.status, seconds, current:past.at(-1) ?? null, active:this.status === 'playing' ? past.filter(e => seconds < e.at+e.duration+.26) : [] };
  }
  getSpectrum(): Uint8Array<ArrayBuffer> {
    const bins = new Uint8Array(this.analyser?.frequencyBinCount ?? 64);
    this.analyser?.getByteFrequencyData(bins);
    return bins;
  }
  async dispose() {
    this.disposed = true; this.stop();
    if (this.context && this.context.state !== 'closed') await this.context.close();
    this.output?.disconnect(); this.analyser?.disconnect();
  }
}
