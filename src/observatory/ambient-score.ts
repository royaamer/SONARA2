/** Original score: “A Quiet Departure”. No recordings or third-party melodies.
 * 60 BPM, eight twelve-beat phrases in D major / B minor, 96 seconds.
 * Render two passes and retain the second: pad releases and effect tails wrap
 * naturally across the loop, without fading the whole piece at its boundary.
 */
export const INTRO_LOOP_SECONDS = 96;
const RATE = 24000;
let score: Promise<AudioBuffer> | undefined;
const hz = (note: number) => 440 * 2 ** ((note - 69) / 12);

export function createIntroScore(): Promise<AudioBuffer> {
  return score ??= renderScore().catch(error => { score = undefined; throw error; });
}

async function renderScore() {
  const context = new OfflineAudioContext(2, RATE * INTRO_LOOP_SECONDS * 2, RATE);
  const dry = context.createGain();
  const space = context.createConvolver();
  const wet = context.createGain();
  const master = context.createGain();
  dry.gain.value = .8;
  wet.gain.value = .32;
  master.gain.value = .7;
  dry.connect(master);
  dry.connect(space);
  space.connect(wet).connect(master);
  master.connect(context.destination);

  // Deterministic diffuse stereo room; noise exists only as a reverb impulse.
  const impulse = context.createBuffer(2, RATE * 7, RATE);
  let seed = 781;
  for (let channel = 0; channel < 2; channel++) {
    const samples = impulse.getChannelData(channel);
    let smooth = 0;
    for (let i = 0; i < samples.length; i++) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      smooth = smooth * .55 + (seed / 2 ** 32 * 2 - 1) * .45;
      samples[i] = smooth * Math.exp(-i / RATE * .85);
    }
  }
  space.buffer = impulse;

  // Rounded, gently detuned harmonic pads rather than exposed electronic tones.
  const real = new Float32Array([0, 0, 0, 0, 0, 0]);
  const imaginary = new Float32Array([0, 1, .28, .12, .045, .015]);
  const padWave = context.createPeriodicWave(real, imaginary);
  function voice(note: number, at: number, hold: number, level: number, pan: number, melody = false) {
    const envelope = context.createGain();
    const filter = context.createBiquadFilter();
    const stereo = context.createStereoPanner();
    const attack = melody ? 1.2 : 3.8;
    const release = melody ? 5 : 5.5;
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(level, at + attack);
    envelope.gain.linearRampToValueAtTime(level * .85, at + hold);
    envelope.gain.linearRampToValueAtTime(0, at + hold + release);
    filter.type = 'lowpass';
    filter.Q.value = .35;
    filter.frequency.setValueAtTime(melody ? 2600 : 950, at);
    filter.frequency.linearRampToValueAtTime(melody ? 1400 : 1500, at + hold);
    stereo.pan.value = pan;
    envelope.connect(filter).connect(stereo).connect(dry);
    for (const detune of [-3, 3]) {
      const oscillator = context.createOscillator();
      if (melody) oscillator.type = 'sine'; else oscillator.setPeriodicWave(padWave);
      oscillator.frequency.value = hz(note);
      oscillator.detune.value = detune;
      oscillator.connect(envelope);
      oscillator.start(at);
      oscillator.stop(at + hold + release);
    }
    if (melody) {
      const echo = context.createDelay(2);
      const echoLevel = context.createGain();
      const echoPan = context.createStereoPanner();
      echo.delayTime.value = 1.5;
      echoLevel.gain.value = .22;
      echoPan.pan.value = -pan;
      filter.connect(echo).connect(echoLevel).connect(echoPan).connect(space);
    }
  }

  // Dmaj9 – Aadd9 – Bm11 – Gmaj9 – Em9 – Bm7 – Gmaj9 – Asus(add9).
  const chords = [
    [38, 57, 61, 64, 66], [33, 57, 59, 64, 69],
    [35, 54, 57, 61, 64], [31, 54, 57, 59, 62],
    [40, 55, 59, 62, 66], [35, 54, 57, 62, 66],
    [31, 54, 57, 62, 69], [33, 55, 59, 62, 64],
  ];
  // Deliberately phrased motif, its answer, a quiet ascent, then a suspended return.
  const phrases = [
    [[0, 74, 4], [5, 78, 3], [9, 81, 3]],
    [[1, 76, 5], [7, 73, 4]],
    [[0, 74, 4], [5, 78, 3], [9, 76, 3]],
    [[1, 74, 6]],
    [[0, 71, 4], [5, 74, 3], [9, 78, 3]],
    [[1, 81, 5], [7, 78, 4]],
    [[0, 79, 4], [5, 78, 3], [9, 74, 3]],
    [[1, 76, 6], [8, 73, 3]],
  ];
  for (let pass = 0; pass < 2; pass++) {
    chords.forEach((chord, phrase) => {
      const at = pass * INTRO_LOOP_SECONDS + phrase * 12;
      chord.forEach((note, i) => voice(note, at, 12, i === 0 ? .024 : .018, (i - 2) * .23));
      for (const [offset, note, length] of phrases[phrase]) {
        voice(note, at + offset, length, .038, phrase % 2 ? .18 : -.18, true);
      }
      // Soft, sparse upper-octave blooms follow the harmony, never random pitches.
      voice(chord[3] + 24, at + 4, 5, .005, phrase % 2 ? -.65 : .65, true);
    });
  }
  const rendered = await context.startRendering();
  const loop = new AudioBuffer({ numberOfChannels: 2, length: RATE * INTRO_LOOP_SECONDS, sampleRate: RATE });
  let peak = 0;
  for (let channel = 0; channel < 2; channel++) {
    const data = rendered.getChannelData(channel).subarray(loop.length);
    loop.copyToChannel(data, channel);
    for (const sample of data) peak = Math.max(peak, Math.abs(sample));
  }
  // Comfortable headroom; the existing ambient output control applies on top.
  const scale = peak > 0 ? .55 / peak : 1;
  for (let channel = 0; channel < 2; channel++) {
    const data = loop.getChannelData(channel);
    for (let i = 0; i < data.length; i++) data[i] *= scale;
  }
  return loop;
}
