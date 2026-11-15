import {oceanName} from './ocean-name';
import type {OceanData} from './types';
import {inspectOcean, oceanSamplingFootprint} from './inspection';
import type {MapPoint} from '../experiences/experience-dashboard';

// Reuse the renderer-aligned spatial and temporal inspector for the shared selection.
export function RegionInspector({data,seconds,point}:{data:OceanData|null;seconds:number;point:MapPoint|null}) {
 const info=point&&data?inspectOcean(data,seconds,point.lon,point.lat):null;
 const footprint=point&&data?oceanSamplingFootprint(data.manifest,point.lon,point.lat):[];
 return <div className="selection-reading" aria-label="Selected ocean location">
  {point ? <>
   <strong>{oceanName(point.lon,point.lat)}</strong>
   <p dir="ltr">Latitude {point.lat.toFixed(2)}° / Longitude {point.lon.toFixed(2)}°</p>
   <p>Nearest observation {info?.date??'unavailable'} UTC</p>
   <p>Four-center sampling footprint{footprint.length ? ` · lat ${footprint[0].south.toFixed(2)}–${footprint[0].north.toFixed(2)}°, lon ${footprint.map(b=>b.west.toFixed(2)+'–'+b.east.toFixed(2)).join(' / ')}°.` : ' unavailable outside source latitude support.'}</p>
   <dl className="selection-values" dir="ltr">
    <div><dt>Speed</dt><dd>{info?.speed?.toFixed(3)??'Unavailable'} m/s</dd></div>
    <div><dt>Eastward u</dt><dd>{info?.velocity?.u.toFixed(3)??'Unavailable'} m/s</dd></div>
    <div><dt>Northward v</dt><dd>{info?.velocity?.v.toFixed(3)??'Unavailable'} m/s</dd></div>
    <div><dt>Direction</dt><dd>{info?.heading==null||info.speed===0?'Unavailable':info.heading.toFixed(1)+' degrees CCW from east'}</dd></div>
   </dl>
   <p>{!info?.velocity?'No valid interpolated velocity. Land or missing data may prevent sampling.':Math.abs(point.lat)>73?'Valid surface velocity outside the +/-73 degree trail display.':'Surface velocity, spatially and temporally interpolated.'}</p>
  </> : <p>Select a location to inspect surface currents.</p>}
 </div>;
}
