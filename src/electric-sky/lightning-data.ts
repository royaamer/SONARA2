import type { Flash, ObservationDay } from './scanner-score';
export const LIGHTNING_ASSET = 'data/lightning/2017-03.json';
// Nominal month comes from the requested asset name, not an assertion of coverage.
export const NOMINAL_MONTH = LIGHTNING_ASSET.match(/(\d{4}-\d{2})\.json$/)![1];
export function partitionObservationDates(days: ObservationDay[], month = NOMINAL_MONTH) {
  return { primary: days.filter(d => d.day.startsWith(month+'-')), additional: days.filter(d => !d.day.startsWith(month+'-')) };
}
export type LightningDataset = {
  source: string; window_minutes: number; flash_count: number; radiance_unit: string;
  observation_coverage: string; flashes: Flash[];
  windows: { start: string; end: string; flash_count: number }[];
};
/** Fail closed: malformed data never silently becomes an observation or an invented date. */
export function parseLightningDataset(input: unknown): LightningDataset {
  if (!input || typeof input !== 'object') throw Error('Invalid dataset');
  const d = input as LightningDataset;
  if (d.source !== 'NASA ISS LIS Science Data V3' || !Array.isArray(d.flashes) || !d.flashes.length || !Array.isArray(d.windows) || d.flash_count !== d.flashes.length || typeof d.radiance_unit !== 'string' || typeof d.observation_coverage !== 'string' || !(d.window_minutes > 0)) throw Error('Invalid ISS LIS metadata');
  for (const f of d.flashes) {
    if (!f || typeof f.time !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(f.time) || !Number.isFinite(Date.parse(f.time)) || !Number.isFinite(f.latitude) || Math.abs(f.latitude)>90 || !Number.isFinite(f.longitude) || Math.abs(f.longitude)>180 || !Number.isFinite(f.radiance) || f.radiance<0) throw Error('Invalid flash observation');
  }
  const counts = new Map<number, number>();
  const width = d.window_minutes * 60_000;
  for (const f of d.flashes) { const key = Math.floor(Date.parse(f.time)/width)*width; counts.set(key,(counts.get(key) ?? 0)+1); }
  if (counts.size !== d.windows.length) throw Error('Window count mismatch');
  for (const w of d.windows) {
    const start = Date.parse(w.start), end = Date.parse(w.end);
    if (!Number.isFinite(start) || end-start !== width || !Number.isInteger(w.flash_count) || counts.get(start) !== w.flash_count) throw Error('Observation totals do not match windows');
    counts.delete(start);
  }
  if (counts.size) throw Error('Missing observation windows');
  return d;
}
export async function loadLightningDataset(signal?: AbortSignal): Promise<LightningDataset> {
  const response = await fetch(`${import.meta.env.BASE_URL}${LIGHTNING_ASSET}`, { signal });
  if (!response.ok) throw Error(`Dataset HTTP ${response.status}`);
  return parseLightningDataset(await response.json());
}
