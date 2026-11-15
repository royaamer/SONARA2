import type { MapPoint } from './experience-dashboard';
import { buildActivityGrid } from '../electric-sky/activity-scale';
import type { ObservationDay } from '../electric-sky/scanner-score';
import { temperatureCell, temperatureJson, validateCatalog, validateTemperature, type TemperatureMonth } from '../temperature/data';
import type { Catalog, Field, Manifest } from '../living-ocean/types';
import { sampleInspectionField } from '../living-ocean/inspection';

export type Phenomenon = 'lightning' | 'ocean' | 'temperature';
export type TemporalFrame = {
  date: string; value: number | null; unit: string; detail: string;
  temperature?: TemperatureMonth; ocean?: { manifest: Manifest; field: Field };
};
export const STEP_SECONDS = .6;
export function temporalIndex(seconds: number, length: number) {
  return Math.max(0, Math.min(length - 1, Math.floor(seconds / STEP_SECONDS)));
}
export function temporalMapping(kind: Phenomenon, value: number) {
  const normalized = kind === 'temperature' ? (value + 5) / 10
    : kind === 'ocean' ? value / 1.6 : Math.log1p(value) / Math.log1p(1000);
  const position = Math.max(0, Math.min(1, normalized));
  return { position, midi: 48 + 36 * position, amplitude: .12 + .28 * position };
}
export function renderTemporalPcm(frames: TemporalFrame[], kind: Phenomenon, rate = 16000) {
  const samples = new Float32Array(Math.round(frames.length * STEP_SECONDS * rate));
  frames.forEach((frame, index) => {
    if (frame.value === null || !Number.isFinite(frame.value)) return;
    const mapping = temporalMapping(kind, frame.value);
    const frequency = 440 * 2 ** ((mapping.midi - 69) / 12);
    const start = Math.round(index * STEP_SECONDS * rate);
    const count = Math.round(STEP_SECONDS * .85 * rate);
    for (let i = 0; i < count; i++) {
      const envelope = Math.min(1, i / (rate * .02), (count - i) / (rate * .08));
      samples[start + i] = Math.sin(2 * Math.PI * frequency * i / rate) * mapping.amplitude * envelope;
    }
  });
  return samples;
}
export function pcmPeaks(samples: Float32Array, bins = 240) {
  return Array.from({ length: bins }, (_, bin) => {
    let peak = 0;
    for (let i = Math.floor(bin * samples.length / bins); i < Math.floor((bin + 1) * samples.length / bins); i++) peak = Math.max(peak, Math.abs(samples[i]));
    return peak;
  });
}
export function lightningSeries(days: ObservationDay[], point: MapPoint | null): TemporalFrame[] {
  const cell = (lon: number, lat: number) => [Math.min(71, Math.floor((lon + 180) / 5)), Math.min(35, Math.floor((90 - lat) / 5))];
  const selected = point ? cell(point.lon, point.lat) : null;
  return days.map(day => {
    const flashes = day.flashes.filter(f => !selected || cell(f.longitude, f.latitude).every((v, i) => v === selected[i]));
    const cells=buildActivityGrid(day).cells;
    return { date: day.day, value: selected ? flashes.length || null : cells.length ? day.flashes.length/cells.length : null, unit: 'recorded flashes / cell', detail: `${point ? 'Selected Region source cell' : 'Full Map mean recorded flashes per occupied 5 degree cell'}. ${flashes.length} recorded flashes. ISS LIS coverage is incomplete and unquantified. Empty observations are missing. One synthesized note per observed date.` };
  });
}
export async function temperatureSeries(point: MapPoint | null, signal: AbortSignal): Promise<TemporalFrame[]> {
  const catalog = validateCatalog(await temperatureJson('months.json', signal));
  return Promise.all(catalog.months.map(async entry => {
    const data = validateTemperature(await temperatureJson(entry.file, signal), entry.month, catalog);
    let weighted = 0, weight = 0;
    data.anomalies.forEach((row, y) => row.forEach(value => {
      if (value === null) return;
      const area = Math.cos(data.lat[y] * Math.PI / 180); weighted += value * area; weight += area;
    }));
    return { date: entry.month, value: point ? temperatureCell(data, point.lon, point.lat).value : weight ? weighted / weight : null,
      unit: '°C anomaly', detail: `${point ? 'Original 2° source cell' : 'Area-weighted valid source cells'}. Monthly anomaly relative to 1951–1980. Smoothed map colors are for display.`, temperature: data };
  }));
}
export async function oceanSeries(point: MapPoint | null, signal: AbortSignal): Promise<TemporalFrame[]> {
  const root = import.meta.env.BASE_URL + 'data/ocean/';
  const json = async (path: string) => { const response = await fetch(root + path, { signal }); if (!response.ok) throw Error(`${path}: HTTP ${response.status}`); return response.json(); };
  const catalog: Catalog = await json('months.json');
  if (catalog.year !== 2023 || catalog.dataset !== 'NASA PO.DAAC OSCAR_L4_OC_FINAL_V2.0') throw Error('Invalid OSCAR catalog');
  const frames: TemporalFrame[] = [];
  // Bound requests and retain only scalar measurements, loading map fields on demand.
  for (const month of catalog.months) {
    const manifest: Manifest = await json(month.manifest);
    if (manifest.units !== 'm/s' || manifest.source !== catalog.dataset) throw Error('Invalid OSCAR manifest');
    for (let offset = 0; offset < manifest.days.length; offset += 5) {
      const batch = await Promise.all(manifest.days.slice(offset, offset + 5).map(async day => {
        const field: Field = await json(month.fieldsRoot + day.file);
        if (field.date !== day.date || field.u.length !== manifest.grid.width * manifest.grid.height || field.v.length !== field.u.length || !field.u.every((u, i) => u === null && field.v[i] === null || typeof u === 'number' && Number.isFinite(u) && typeof field.v[i] === 'number' && Number.isFinite(field.v[i]))) throw Error('Invalid OSCAR field');
        const velocity = point ? sampleInspectionField(manifest, field, point.lon, point.lat) : null;
        let sum = 0, weight = 0;
        if (!point) field.u.forEach((u, i) => {
          const v = field.v[i]; if (!Number.isFinite(u) || !Number.isFinite(v)) return;
          const area = Math.cos((manifest.grid.latStart - Math.floor(i / manifest.grid.width) * manifest.grid.latStep) * Math.PI / 180);
          sum += Math.hypot(u!, v!) * area; weight += area;
        });
        const value = point ? velocity ? Math.hypot(velocity.u, velocity.v) : null : weight ? sum / weight : null;
        return { date: day.date, value, unit: 'm/s', detail: velocity ? `Daily spatial bilinear sample. Eastward ${velocity.u.toFixed(4)} m/s, northward ${velocity.v.toFixed(4)} m/s. ${value === 0 ? 'Direction unavailable at zero speed.' : `Direction ${((Math.atan2(velocity.u, velocity.v) * 180 / Math.PI + 360) % 360).toFixed(1)}° clockwise from north.`}` : point ? 'Missing daily velocity at selection.' : 'Daily area-weighted speed across valid ocean grid cells.' };
      }));
      frames.push(...batch);
    }
  }
  return frames;
}
export async function oceanFrame(date: string, signal: AbortSignal) {
  const root = import.meta.env.BASE_URL + 'data/ocean/web/' + date.slice(0, 7) + '/';
  const json = async (file: string) => { const r = await fetch(root + file, { signal }); if (!r.ok) throw Error('Daily ocean map unavailable'); return r.json(); };
  const [manifest, field] = await Promise.all([json('manifest.json'), json(date + '.json')]);
  return { manifest: manifest as Manifest, field: field as Field };
}
