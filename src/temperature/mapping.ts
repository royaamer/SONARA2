// Numerical display and scan mapping ported from EarthJukeBox 79102a1, temperaturePlayer.js.
import type { TemperatureMonth } from './data';
export const clamp=(x:number,a:number,b:number)=>Math.min(b,Math.max(a,x));
export const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
export const DURATION = 24;                    // seconds for a complete global scan
// Fixed-resolution display/audio raster: reproducible pixel counts on every device.
// Larger than typical displayed map area; avoids magnifying the NASA 2° cells.
export const RASTER_W = 2048;
export const RASTER_H = 1024;
export const HEAT_ALPHA = 165;                 // 0..255, soft translucent overlay
// Gaussian averaging on the *numeric source grid*, not a blur of colored blocks.
// ~2° original grid; sigma 1.1 source cells (~2.2°). Missing samples ignored.
export const SOURCE_SMOOTH_SIGMA = 1.10;
export const SOURCE_SMOOTH_BLEND = 0.86;        // retain some original local contrast
export const MIN_INTERPOLATION_SUPPORT = 0.60;

// Fixed color stops for temperature ANOMALY relative to 1951–1980, in K / °C difference.
export const STOPS: [number, [number, number, number]][] = [
  [-5, [23, 52, 126]],
  [-3, [52, 125, 212]],
  [-1, [127, 209, 238]],
  [ 0, [244, 241, 223]],
  [ 1, [246, 209, 107]],
  [ 3, [242, 138, 61]],
  [ 5, [201, 45, 66]]
];

// Each color RANGE has one base note. The pixel count adds 0–12 semitones.
// Boundaries are the midpoints between the stops above. They never depend
// on browser scaling, transparency, or the decorative coastline overlay.
export const COLOR_NOTES: {name:string;max:number;midi:number;shape:OscillatorType}[] = [
  { name: "Deep blue",   max: -4.0, midi: 48, shape: "sine" },     // C3
  { name: "Blue",        max: -2.0, midi: 50, shape: "sine" },     // D3
  { name: "Cyan",        max: -0.5, midi: 53, shape: "triangle" }, // F3
  { name: "Ivory",       max:  0.5, midi: 55, shape: "sine" },     // G3
  { name: "Yellow",      max:  2.0, midi: 57, shape: "triangle" }, // A3
  { name: "Orange",      max:  4.0, midi: 60, shape: "sine" },     // C4
  { name: "Red",         max: Infinity, midi: 64, shape: "triangle" } // E4
];

export function colorBand(value: number) {
  for (let i = 0; i < COLOR_NOTES.length; i++) {
    if (value < COLOR_NOTES[i].max) return i;
  }
  return COLOR_NOTES.length - 1;
}
export const temperaturePosition=(value:number)=>(clamp(value,-5,5)+5)/10;
export function colorAt(value: number) {
  const v = temperaturePosition(value)*10-5;
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [lo, a] = STOPS[i];
    const [hi, b] = STOPS[i + 1];
    if (v <= hi) {
      const t = clamp((v - lo) / (hi - lo), 0, 1);
      return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t)
      ];
    }
  }
  return STOPS[STOPS.length - 1][1];
}
export function validateMonth(data: TemperatureMonth, month: string) {
  if (data.month !== month || data.variable !== "tempanomaly" ||
      !Array.isArray(data.lat) || data.lat.length !== 90 ||
      !Array.isArray(data.lon) || data.lon.length !== 180 ||
      !Array.isArray(data.anomalies) || data.anomalies.length !== 90 ||
      !data.anomalies.every(row => Array.isArray(row) && row.length === 180)) {
    throw new Error("Unexpected JSON grid. Expected original 90×180 GISTEMP monthly export.");
  }
  for (let i = 0; i < 90; i++) {
    if (Math.abs(data.lat[i] - (-89 + 2 * i)) > 1e-5) throw new Error("Unexpected latitude centers");
  }
  for (let i = 0; i < 180; i++) {
    if (Math.abs(data.lon[i] - (-179 + 2 * i)) > 1e-5) throw new Error("Unexpected longitude centers");
  }
}

// --- Scientifically transparent display preprocessing ----------------------
// The ORIGINAL 90x180 values remain in data.anomalies, untouched. This
// mask-aware Gaussian averages only known neighbors and never inserts a value
// at a missing original grid center. Longitude wraps at +/-180; latitude does
// not wrap. Smoothing is a presentation choice, not a NASA measurement.
export function makeDisplayField(data: TemperatureMonth) {
  const kernel: number[] = [];
  for (let d = -2; d <= 2; d++) {
    kernel.push(Math.exp(-0.5 * (d / SOURCE_SMOOTH_SIGMA) ** 2));
  }
  const out = new Float32Array(90 * 180);
  out.fill(NaN);
  for (let y = 0; y < 90; y++) {
    const originalRow = 89 - y; // raster = north to south
    for (let x = 0; x < 180; x++) {
      const center = data.anomalies[originalRow][x];
      if (!finite(center)) continue; // no invention at missing NASA cells
      let total = 0;
      let support = 0;
      for (let dy = -2; dy <= 2; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= 90) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const xx = (x + dx + 180) % 180;
          const neighbor = data.anomalies[89 - yy][xx];
          if (!finite(neighbor)) continue;
          const weight = kernel[dx + 2] * kernel[dy + 2];
          total += weight * neighbor;
          support += weight;
        }
      }
      out[y * 180 + x] = center * (1 - SOURCE_SMOOTH_BLEND) +
        (support ? (total / support) : center) * SOURCE_SMOOTH_BLEND;
    }
  }
  return out;
}

// Bicubic B-spline kernel: C2-continuous numeric interpolation without the
// overshoots of an unconstrained cubic interpolator. Missing samples are
// excluded and normalized; support is tracked to fade data boundaries.
export function bsplineWeight(x: number) {
  const a = Math.abs(x);
  if (a < 1) return (4 - 6 * a * a + 3 * a * a * a) / 6;
  if (a < 2) return (2 - a) ** 3 / 6;
  return 0;
}

// Precompute basis weights for the 2048x1024 raster (no allocations per pixel).
export function makeAxisLookup(length: number, gridLength: number, wrap: boolean) {
  const positions = new Int16Array(length * 4);
  const weights = new Float32Array(length * 4);
  for (let p = 0; p < length; p++) {
    const coordinate = (p + 0.5) * gridLength / length - 0.5;
    const base = Math.floor(coordinate);
    for (let j = 0; j < 4; j++) {
      const position = base + j - 1;
      const offset = p * 4 + j;
      positions[offset] = wrap
        ? ((position % gridLength) + gridLength) % gridLength
        : clamp(position, 0, gridLength - 1);
      weights[offset] = bsplineWeight(coordinate - position);
    }
  }
  return { positions, weights };
}

// Palette uses fixed NASA anomaly thresholds, not arbitrary image RGB values.
// Numbers are the same interpolation as the live scan uses for note selection.
export function writeColor(pixelBytes: Uint8ClampedArray, offset: number, value: number, alpha: number) {
  const v = clamp(value, -5, 5);
  let index = 0;
  while (index < STOPS.length - 2 && v > STOPS[index + 1][0]) index++;
  const low = STOPS[index];
  const high = STOPS[index + 1];
  const t = clamp((v - low[0]) / (high[0] - low[0]), 0, 1);
  // A regular continuous ramp preserves the fixed anomaly-to-color mapping.
  pixelBytes[offset] = low[1][0] + (high[1][0] - low[1][0]) * t;
  pixelBytes[offset + 1] = low[1][1] + (high[1][1] - low[1][1]) * t;
  pixelBytes[offset + 2] = low[1][2] + (high[1][2] - low[1][2]) * t;
  pixelBytes[offset + 3] = alpha;
}

export function renderSmoothHeatmap(data: TemperatureMonth) {
  const field = makeDisplayField(data);
  const xLookup = makeAxisLookup(RASTER_W, 180, true);
  const yLookup = makeAxisLookup(RASTER_H, 90, false);
  const raster = document.createElement("canvas");
  raster.width = RASTER_W;
  raster.height = RASTER_H;
  const rc = raster.getContext("2d", { alpha: true });
  if (!rc) throw new Error("2D canvas is unavailable");
  const img = rc.createImageData(RASTER_W, RASTER_H);
  const bands = new Int8Array(RASTER_W * RASTER_H);
  bands.fill(-1);
  const values=new Float32Array(RASTER_W*RASTER_H);
  values.fill(NaN);

  // We cache each value and coverage at a pixel. The audio scanner consults
  // this exact same raster's band IDs, so it never listens to off-screen cells.
  for (let y = 0; y < RASTER_H; y++) {
    const yi = y * 4;
    for (let x = 0; x < RASTER_W; x++) {
      const xi = x * 4;
      let sum = 0;
      let support = 0;
      // Only a handful of source cells are sampled at each rendered pixel.
      for (let j = 0; j < 4; j++) {
        const yw = yLookup.weights[yi + j];
        if (yw < 1e-8) continue;
        const row = yLookup.positions[yi + j] * 180;
        for (let i = 0; i < 4; i++) {
          const w = yw * xLookup.weights[xi + i];
          if (w < 1e-8) continue;
          const sample = field[row + xLookup.positions[xi + i]];
          if (!Number.isNaN(sample)) {
            sum += sample * w;
            support += w;
          }
        }
      }
      if (support < MIN_INTERPOLATION_SUPPORT) continue;

      const value = sum / support;
      // Fade missing-data edges, while excluding unsupported areas entirely.
      const fade = clamp((support - MIN_INTERPOLATION_SUPPORT) /
        (1 - MIN_INTERPOLATION_SUPPORT), 0, 1);
      const alpha = Math.round(HEAT_ALPHA * Math.pow(fade, 0.40));
      if (alpha < 12) continue;
      const pixel = y * RASTER_W + x;
      writeColor(img.data, pixel * 4, value, alpha);
      values[pixel] = value;
      bands[pixel] = colorBand(value);
    }
  }
  rc.putImageData(img, 0, 0);

  return { raster, bands, values };
}
export function areaWeightedMean(data: TemperatureMonth) {
  let total = 0, weightSum = 0;
  for (let y = 0; y < 90; y++) {
    const weight = Math.cos(data.lat[y] * Math.PI / 180);
    for (const v of data.anomalies[y]) {
      if (finite(v)) { total += v * weight; weightSum += weight; }
    }
  }
  return weightSum ? total / weightSum : null;
}

export const scanColumn=(seconds:number)=>clamp(Math.floor(clamp(seconds,0,DURATION-.000001)/DURATION*RASTER_W),0,RASTER_W-1);
export function colorCounts(bands:Int8Array,column:number){const counts=Array<number>(COLOR_NOTES.length).fill(0);let valid=0;for(let y=0;y<RASTER_H;y++){const bin=bands[y*RASTER_W+column];if(bin>=0){counts[bin]++;valid++;}}return {counts,valid};}
export const pitchForPixels=(color:(typeof COLOR_NOTES)[number],count:number)=>color.midi+Math.round(12*count/RASTER_H);
export const hz=(midi:number)=>440*Math.pow(2,(midi-69)/12);
export const noteName=(midi:number)=>['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][midi%12]+(Math.floor(midi/12)-1);
