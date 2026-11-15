// The original score is authored in ambient-score.ts and rendered locally once.
// Cache the decoded loop across intro visits; playback still requires a gesture.
let music: Promise<AudioBuffer> | undefined;
function loadIntroMusic(context: AudioContext) {
  return music ??= fetch(import.meta.env.BASE_URL + 'audio/quiet-departure.opus')
    .then(response => { if (!response.ok) throw Error('Intro music unavailable'); return response.arrayBuffer(); })
    .then(bytes => context.decodeAudioData(bytes))
    .catch(error => { music = undefined; throw error; });
}

export type AmbientStatus = 'playing' | 'muted' | 'waiting' | 'unavailable';
const AMBIENT_LEVEL = .6;

/** Original looping introduction music. Owns no scientific playback sources. */
export class AmbientSoundscape {
  private session: {
    context: AudioContext;
    output: GainNode;
    nodes: AudioNode[];
    oscillators: AudioScheduledSourceNode[];
    analyser: AnalyserNode;
    samples: Float32Array<ArrayBuffer>;
    activated: boolean;
  } | null = null;
  private generation = 0;
  private muted = true;
  private fading = false;
  private unavailable = typeof window.AudioContext === 'undefined';
  private fadeTimer: ReturnType<typeof setTimeout> | undefined;

  async start() {
    if (this.fading || this.unavailable) return;
    if (this.session?.context.state === 'closed') this.stop();
    if (this.session) {
      const { context } = this.session;
      if (context.state !== 'running' || !this.session.activated) {
        const token = this.generation;
        try {
          await context.resume();
          if (token === this.generation && this.session?.context === context) {
            this.session.activated = true;
            this.ramp(this.muted ? 0 : AMBIENT_LEVEL, 1.5);
          }
        } catch (error) { this.handleActivationError(error, context); }
      }
      return;
    }
    const token = ++this.generation;
    const context = new AudioContext();
    const output = context.createGain();
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    const nodes: AudioNode[] = [output, analyser];
    const oscillators: AudioScheduledSourceNode[] = [];
    this.session = { context, output, nodes, oscillators, analyser, samples:new Float32Array(analyser.fftSize), activated:false };
    output.gain.value = 0;
    output.connect(analyser);
    analyser.connect(context.destination);
    try {
      // Resume inside the gesture, before fetching and decoding the local score.
      await context.resume();
      const buffer = await loadIntroMusic(context);
      if (token !== this.generation || this.session?.context !== context || this.fading) return;
      const music = context.createBufferSource();
      music.buffer = buffer;
      music.loop = false;
      music.onended = () => { if (token === this.generation) this.stop(); };
      music.connect(output);
      nodes.push(music);
      oscillators.push(music);
      music.start();
      if (token !== this.generation || this.session?.context !== context) return;
      this.session.activated = true;
      this.ramp(this.muted ? 0 : AMBIENT_LEVEL, 1.5);
    } catch (error) {
      this.handleActivationError(error, context);
    }
  }

  private handleActivationError(error: unknown, context: AudioContext) {
    if (this.session?.context !== context) return;
    // A browser gesture restriction can recover on the next click.
    if (error instanceof DOMException && error.name === 'NotAllowedError') return;
    this.markUnavailable();
  }

  markUnavailable() {
    this.stop();
    this.unavailable = true;
  }

  getSnapshot(): { status: AmbientStatus; muted: boolean } {
    if (this.unavailable) return { status:'unavailable', muted:this.muted };
    if (this.muted) return { status:'muted', muted:true };
    if (this.session?.context.state === 'running' && this.session.output.gain.value > 0) {
      const { analyser, samples } = this.session;
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
      if (rms > .000001) return { status:'playing', muted:false };
    }
    return { status:'waiting', muted:false };
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (!this.fading) this.ramp(muted ? 0 : AMBIENT_LEVEL, .12);
  }

  fadeOut(seconds = 3) {
    if (this.fading || !this.session) return;
    ++this.generation;
    this.fading = true;
    this.ramp(0, seconds);
    const end = this.session.context.currentTime + seconds;
    for (const oscillator of this.session.oscillators) oscillator.stop(end);
    this.fadeTimer = setTimeout(() => this.stop(), seconds * 1000);
  }

  private ramp(value: number, seconds: number) {
    if (!this.session) return;
    const { context, output } = this.session;
    const now = context.currentTime;
    output.gain.cancelAndHoldAtTime(now);
    output.gain.linearRampToValueAtTime(value, now + seconds);
  }

  stop() {
    ++this.generation;
    clearTimeout(this.fadeTimer);
    this.fadeTimer = undefined;
    this.fading = false;
    const session = this.session;
    this.session = null;
    if (!session) return;
    session.output.disconnect();
    for (const oscillator of session.oscillators) {
      try { oscillator.stop(); } catch { /* The fade may already have ended. */ }
    }
    for (const node of session.nodes) node.disconnect();
    void session.context.close().catch(() => {});
  }
}
