export type AmbientStatus = 'playing' | 'muted' | 'waiting' | 'unavailable';
const AMBIENT_LEVEL = .6;

/** Procedural introduction ambience. Owns no scientific playback sources. */
export class AmbientSoundscape {
  private session: {
    context: AudioContext;
    output: GainNode;
    nodes: AudioNode[];
    oscillators: OscillatorNode[];
    analyser: AnalyserNode;
    samples: Float32Array<ArrayBuffer>;
    activated: boolean;
  } | null = null;
  private generation = 0;
  private muted = false;
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
    const filter = context.createBiquadFilter();
    const reverb = context.createConvolver();
    const wet = context.createGain();
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    const nodes: AudioNode[] = [output, filter, reverb, wet, analyser];
    const oscillators: OscillatorNode[] = [];
    this.session = { context, output, nodes, oscillators, analyser, samples:new Float32Array(analyser.fftSize), activated:false };
    output.gain.value = 0;
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    filter.Q.value = .35;
    wet.gain.value = .35;

    // A generated, decaying stereo impulse adds distance without loading a file.
    const impulse = context.createBuffer(2, Math.ceil(context.sampleRate * 3.5), context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const samples = impulse.getChannelData(channel);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / samples.length, 3);
      }
    }
    reverb.buffer = impulse;
    filter.connect(output);
    filter.connect(reverb);
    reverb.connect(wet);
    wet.connect(output);
    output.connect(analyser);
    analyser.connect(context.destination);

    // Quiet sine pads with slow amplitude drift, free of percussive transients.
    const pads = [
      { frequency: 55, level: .055, drift: .031, detune: -2 },
      { frequency: 82.4069, level: .04, drift: .023, detune: 2 },
      { frequency: 110, level: .055, drift: .019, detune: 1 },
      { frequency: 164.8138, level: .06, drift: .013, detune: -1 },
      { frequency: 220, level: .065, drift: .017, detune: 2 },
      { frequency: 329.6276, level: .045, drift: .011, detune: -2 },
      { frequency: 440, level: .025, drift: .007, detune: 1 },
    ];
    for (const pad of pads) {
      const tone = context.createOscillator();
      const level = context.createGain();
      const drift = context.createOscillator();
      const depth = context.createGain();
      tone.type = 'sine';
      tone.frequency.value = pad.frequency;
      tone.detune.value = pad.detune;
      level.gain.value = pad.level;
      drift.frequency.value = pad.drift;
      depth.gain.value = pad.level * .12;
      tone.connect(level);
      level.connect(filter);
      drift.connect(depth);
      depth.connect(level.gain);
      nodes.push(tone, level, drift, depth);
      oscillators.push(tone, drift);
      tone.start();
      drift.start();
    }
    try {
      await context.resume();
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
