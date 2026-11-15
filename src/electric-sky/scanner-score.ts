/** Adapted from EarthJukeBox sonification/scannerScore.js. Mapping equations and sampling are unchanged.
 * Scientific records are never deduplicated or synthesized here. A record may drive multiple notes
 * in a sparse band in the original algorithm; note count is NOT a flash count.
 */
import { mapToPitchWithDensity, mapToIntensity } from './scientific-mapping';
export type Flash = { time: string; latitude: number; longitude: number; radiance: number };
export type ObservationDay = { day: string; flashes: Flash[] };
export type ScannerEvent = { at: number; duration: number; note: number; velocity: number; flash: Flash; column: number; sectionCount: number };
export type ScannerScore = { events: ScannerEvent[]; byColumn: Flash[][]; seconds: number; columns: number; day: string; count: number };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const scale = [48,50,52,55,57,60,62,64,67,69,72,74,76,79,81];
export const noteHz = (n: number) => 440 * 2 ** ((n - 69) / 12);
export function buildDayIndex(input: Flash[] | { flashes: Flash[] }): ObservationDay[] {
  const source = Array.isArray(input) ? input : input.flashes;
  if (!Array.isArray(source)) throw Error('Missing flashes array');
  const grouped = new Map<string, Flash[]>();
  for (const f of source) {
    if (typeof f.time !== 'string' || !Number.isFinite(Date.parse(f.time)) || ![f.latitude,f.longitude,f.radiance].every(v => Number.isFinite(Number(v)))) continue;
    const key = f.time.slice(0,10);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push({ time: f.time, latitude: +f.latitude, longitude: +f.longitude, radiance: +f.radiance });
  }
  for (const group of grouped.values()) group.sort((a,b) => a.longitude-b.longitude || a.time.localeCompare(b.time));
  const dates = [...grouped.keys()].sort();
  if (!dates.length) return [];
  const first = dates[0], last = dates[dates.length-1];
  const days: ObservationDay[] = [];
  for (const d = new Date(first+'T00:00:00Z'), end = new Date(last+'T00:00:00Z'); d <= end; d.setUTCDate(d.getUTCDate()+1)) {
    const day = d.toISOString().slice(0,10);
    days.push({ day, flashes: grouped.get(day) || [] });
  }
  return days;
}
export function buildScannerScore(day: ObservationDay, seconds = 24, columns = 48): ScannerScore {
  if (!(seconds > 0) || !Number.isInteger(columns) || columns < 1) throw Error('Invalid scan configuration');
  const flashes = day.flashes;
  if(!Array.isArray(flashes)) throw Error('Missing day flashes');
  const maxRadiance = Math.max(1,flashes.reduce((max,f) => Math.max(max,Number(f.radiance)||0),0));
  const scaleHz = scale.map(noteHz);
  const byColumn: Flash[][] = Array.from({length: columns}, () => []);
  for (const f of flashes) byColumn[clamp(Math.floor((f.longitude+180)/360*columns),0,columns-1)].push(f);
  const maxCount = Math.max(1,...byColumn.map(a => a.length));
  const events: ScannerEvent[] = [];
  byColumn.forEach((group,i) => {
    if (!group.length) return;
    const density = group.length/maxCount;
    const voices = Math.min(5,1+Math.floor(Math.log2(group.length+1)));
    const sorted = [...group].sort((a,b) => b.radiance-a.radiance);
    for (let j=0;j<voices;j++) {
      const f = sorted[Math.min(sorted.length-1,Math.floor((j+.5)*sorted.length/voices))];
      const frequencyHz = mapToPitchWithDensity(f.latitude,scaleHz,group.length,0,maxCount);
      const note = Math.round(69+12*Math.log2(frequencyHz/440));
      const velocity = mapToIntensity(Math.max(0,f.radiance),0,maxRadiance,group.length,0,maxCount);
      events.push({ at:i*seconds/columns+j*.045, duration:.20+.14*density, note, velocity, flash:f, column:i, sectionCount:group.length });
    }
  });
  return { events, byColumn, seconds, columns, day:day.day, count:flashes.length };
}
export const noteName = (midi: number) => ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][midi % 12] + (Math.floor(midi / 12)-1);
export const projectFlash = (f: Pick<Flash, 'latitude' | 'longitude'>) => ({ x:(f.longitude+180)/360*1000, y:(90-f.latitude)/180*500 });
