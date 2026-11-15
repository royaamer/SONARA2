export const TEMPERATURE_ROOT=import.meta.env.BASE_URL+'data/temperature/';
export type TemperatureMonth={dataset:string;dataset_url:string;source_file:string;source_sha256:string;month:string;baseline:string;variable:string;units:string;projection:string;lat:number[];lon:number[];anomalies:(number|null)[][];note_events:Record<string,unknown>[]};
export type TemperatureCatalog={dataset:string;source_sha256:string;months:{month:string;file:string;notes:number}[]};

export async function temperatureJson(path:string,signal?:AbortSignal):Promise<unknown>{
  const response=await fetch(TEMPERATURE_ROOT+path,{signal});
  if(!response.ok)throw Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

export function validateCatalog(input:unknown):TemperatureCatalog {
  const c=input as TemperatureCatalog;
  if(!c||!c.dataset?.startsWith('NASA GISS GISTEMP v4')||!/^[a-f0-9]{64}$/.test(c.source_sha256)||!Array.isArray(c.months)||!c.months.length)throw Error('Invalid temperature catalog');
  const seen=new Set<string>();
  for(const m of c.months){if(!/^2025-(0[1-9]|1[0-2])$/.test(m.month)||m.file!==m.month+'.json'||seen.has(m.month))throw Error('Invalid temperature month');seen.add(m.month);}
  return c;
}

export function validateTemperature(input:unknown,month:string,catalog:TemperatureCatalog):TemperatureMonth {
  const d=input as TemperatureMonth;
  if(!d||d.month!==month||d.dataset!==catalog.dataset||d.source_sha256!==catalog.source_sha256||d.variable!=='tempanomaly'||d.baseline!=='1951-1980'||!d.units?.startsWith('K')||d.projection!=='equirectangular'||!Array.isArray(d.lat)||d.lat.length!==90||!Array.isArray(d.lon)||d.lon.length!==180||!Array.isArray(d.anomalies)||d.anomalies.length!==90)throw Error('Invalid GISTEMP metadata');
  if(d.lat.some((x,i)=>!Number.isFinite(x)||Math.abs(x-(-89+2*i))>1e-5)||d.lon.some((x,i)=>!Number.isFinite(x)||Math.abs(x-(-179+2*i))>1e-5))throw Error('Invalid GISTEMP coordinates');
  let valid=0;
  for(const row of d.anomalies){if(!Array.isArray(row)||row.length!==180)throw Error('Invalid GISTEMP grid');for(const value of row){if(value!==null&&(typeof value!=='number'||!Number.isFinite(value)))throw Error('Invalid GISTEMP anomaly');if(value!==null)valid++;}}
  if(!valid)throw Error('No valid GISTEMP anomalies');
  return d;
}

export function temperatureCell(data: TemperatureMonth, lon: number, lat: number) {
  const column = Math.max(0, Math.min(data.lon.length - 1, Math.floor((lon + 180) / 2)));
  const row = Math.max(0, Math.min(data.lat.length - 1, Math.floor((lat + 90) / 2)));
  return {
    row, column, value: data.anomalies[row][column],
    west: data.lon[column] - 1, east: data.lon[column] + 1,
    south: data.lat[row] - 1, north: data.lat[row] + 1,
  };
}
