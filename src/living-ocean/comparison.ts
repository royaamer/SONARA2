import type { Manifest } from './types';

export const OSCAR_SOURCE = 'NASA PO.DAAC OSCAR_L4_OC_FINAL_V2.0';
export type ComparisonGrid = Manifest['grid'];
export type ComparisonMonth = {
  month: string; source: string; units: string; grid: ComparisonGrid; observationDays: number;
  meanSpeedMps: (number | null)[]; meanUMps: (number | null)[]; meanVMps: (number | null)[]; validDays: number[];
};
export type ComparisonCatalog = {
  schemaVersion: number; source: string; year: number; grid: ComparisonGrid; statistic: string; missingRule: string;
  months: { month: string; file: string; observationDays: number; validGridCells: number }[];
};
export function verifyComparisonCatalog(catalog: ComparisonCatalog) {
  const g = catalog?.grid;
  if (catalog?.schemaVersion !== 1 || catalog.source !== OSCAR_SOURCE || catalog.year !== 2023 || !Array.isArray(catalog.months) || !catalog.months.length ||
    !g || !Number.isInteger(g.width) || !Number.isInteger(g.height) || g.width < 2 || g.height < 2 ||
    ![g.lonStart, g.latStart, g.lonStep, g.latStep].every(Number.isFinite) || g.lonStep <= 0 || g.latStep <= 0 ||
    new Set(catalog.months.map(m => m.month)).size !== catalog.months.length ||
    catalog.months.some(m => !/^2023-(0[1-9]|1[0-2])$/.test(m.month) || m.file !== m.month + '.json')) throw Error('Incompatible OSCAR comparison catalog');
  return catalog;
}
export function verifyComparisonMonth(month: string, grid: ComparisonGrid, file: ComparisonMonth) {
  const n = grid.width * grid.height;
  if (file?.month !== month || file.source !== OSCAR_SOURCE || file.units !== 'm/s' ||
    !(['width', 'height', 'lonStart', 'lonStep', 'latStart', 'latStep'] as const).every(k => file.grid?.[k] === grid[k])) throw Error(month + ': OSCAR metadata mismatch');
  for (const key of ['meanSpeedMps', 'meanUMps', 'meanVMps', 'validDays'] as const)
    if (!Array.isArray(file[key]) || file[key].length !== n) throw Error(month + ': grid size mismatch');
  const days = new Date(Date.UTC(2023, Number(month.slice(-2)), 0)).getUTCDate();
  if (file.observationDays !== days) throw Error(month + ': incomplete observation month');
  for (let i = 0; i < n; i++) {
    const count = file.validDays[i], values = [file.meanSpeedMps[i], file.meanUMps[i], file.meanVMps[i]];
    if (!Number.isInteger(count) || count < 0 || count > days || (count === 0 ? values.some(v => v !== null) : values.some(v => !Number.isFinite(v))) || (count > 0 && file.meanSpeedMps[i]! < 0)) throw Error(month + ': invalid measurement or mask');
  }
  return file;
}

// Port of oceanComparison.js sample(): interpolate the monthly mean SPEED,
// separately from mean U/V. hypot(mean U, mean V) is a different statistic.
export function sampleComparison(data: ComparisonMonth | undefined, lon: number, lat: number) {
  if (!data || !Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const g = data.grid, gx = ((lon - g.lonStart + 360) % 360) / g.lonStep, gy = (g.latStart - lat) / g.latStep;
  if (!Number.isFinite(gx) || !Number.isFinite(gy) || gy < 0 || gy >= g.height - 1) return null;
  const x0 = ((Math.floor(gx) % g.width) + g.width) % g.width, x1 = (x0 + 1) % g.width;
  const y0 = Math.floor(gy), y1 = y0 + 1, ax = gx - Math.floor(gx), ay = gy - y0;
  const ids = [y0 * g.width + x0, y0 * g.width + x1, y1 * g.width + x0, y1 * g.width + x1];
  if (ids.some(i => data.validDays[i] === 0 || !Number.isFinite(data.meanSpeedMps[i]) || !Number.isFinite(data.meanUMps[i]) || !Number.isFinite(data.meanVMps[i]))) return null;
  const interpolate = (key: 'meanSpeedMps' | 'meanUMps' | 'meanVMps') => {
    const f = data[key];
    return (f[ids[0]]! * (1 - ax) + f[ids[1]]! * ax) * (1 - ay) + (f[ids[2]]! * (1 - ax) + f[ids[3]]! * ax) * ay;
  };
  return { speed: interpolate('meanSpeedMps'), u: interpolate('meanUMps'), v: interpolate('meanVMps'), days: Math.min(...ids.map(i => data.validDays[i])), observationDays: data.observationDays };
}

export type OceanStyle = 'deep_ocean' | 'hybrid' | 'orchestral';
export function oceanStylePath(audio: string, style: OceanStyle) {
  return audio.replace(/deep_ocean_OSCAR\.wav$/, style + '_OSCAR.wav');
}
