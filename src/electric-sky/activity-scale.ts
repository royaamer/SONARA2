import type { ObservationDay } from './scanner-score';

export const ACTIVITY_CELL_DEGREES = 5;

export function buildActivityGrid(day: ObservationDay) {
  const counts = new Map<number, number>();
  const columns = 360 / ACTIVITY_CELL_DEGREES;
  for (const flash of day.flashes) {
    const x = Math.min(columns - 1, Math.floor((flash.longitude + 180) / ACTIVITY_CELL_DEGREES));
    const y = Math.min(180 / ACTIVITY_CELL_DEGREES - 1, Math.floor((90 - flash.latitude) / ACTIVITY_CELL_DEGREES));
    const key = y * columns + x;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const cells = [...counts].map(([key, count]) => ({ x: key % columns, y: Math.floor(key / columns), count }));
  return { cells, maximum: Math.max(1, ...counts.values()), columns };
}

export const activityPosition=(count:number,maximum:number)=>Math.max(0,Math.min(1,count/maximum));
export function activityColor(count: number, maximum: number) {
  const strength = activityPosition(count,maximum);
  const stops = [[40,235,255],[100,90,255],[255,55,205]];
  const index = strength < .5 ? 0 : 1, mix = strength < .5 ? strength * 2 : (strength - .5) * 2;
  return `rgb(${stops[index].map((v,i)=>Math.round(v+(stops[index+1][i]-v)*mix)).join(",")})`;
}

export function activityAt(grid:ReturnType<typeof buildActivityGrid>,lon:number,lat:number){
 const x=Math.max(0,Math.min(grid.columns-1,Math.floor((lon+180)/ACTIVITY_CELL_DEGREES)));
 const y=Math.max(0,Math.min(35,Math.floor((90-lat)/ACTIVITY_CELL_DEGREES)));
 return grid.cells.find(c=>c.x===x&&c.y===y)?.count??null;
}
