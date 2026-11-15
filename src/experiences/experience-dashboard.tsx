import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './experience-dashboard.css';
import { TemporalMap, TemporalReading, useTemporalPlayer } from './temporal-player';
import type { Phenomenon } from './temporal-science';
import type { ObservationDay } from '../electric-sky/scanner-score';
type ObservationOption = {
    value: string;
    label: string;
    group?: string;
};
export function ObservationNavigator({ id, label, options, value, onChange, disabled, ar }: {
    id: string;
    label: string;
    options: ObservationOption[];
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    ar: boolean;
}) {
    const index = options.findIndex(option => option.value === value);
    const groups = [...new Set(options.map(option => option.group ?? ''))];
    return <div className="observation-navigator">
    <label htmlFor={id}>{label}</label>
    <div>
      <button type="button" className="mc-button" aria-label={ar ? 'الرصد السابق' : 'Previous observation'} disabled={disabled || index <= 0} onClick={() => onChange(options[index - 1].value)}><ChevronLeft size={18}/></button>
      <select id={id} value={value} disabled={disabled || !options.length} onChange={event => onChange(event.target.value)}>
        {groups.map(group => group
            ? <optgroup key={group} label={group}>{options.filter(option => option.group === group).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>
            : options.filter(option => !option.group).map(option => <option key={option.value} value={option.value}>{option.label}</option>))}
      </select>
      <button type="button" className="mc-button" aria-label={ar ? 'الرصد التالي' : 'Next observation'} disabled={disabled || index < 0 || index >= options.length - 1} onClick={() => onChange(options[index + 1].value)}><ChevronRight size={18}/></button>
    </div>
  </div>;
}
export { ScientificScale } from './scientific-scale';
export type MapFootprint = { west: number; east: number; south: number; north: number };

export function ExperienceDashboard({ label, navigator, status, map, information, science, controls, timeline, busy, error, point, onSelect, footprints = [], selectionSummary = '', observationKey = '', temporal, pauseOriginal }: {
    temporal?: { kind: Phenomenon; days?: ObservationDay[] };
    pauseOriginal?: () => void;
    footprints?: MapFootprint[];
    selectionSummary?: string;
    observationKey?: string;
    point: MapPoint | null;
    onSelect: (point: MapPoint | null) => void;
    label: string;
    navigator: ReactNode;
    status: string;
    map: ReactNode;
    information: ReactNode;
    science: ReactNode;
    controls: ReactNode;
    timeline: ReactNode;
    busy?: boolean;
    error?: ReactNode;
}) {
    const player = useTemporalPlayer(temporal?.kind, point, temporal?.days);
    useLayoutEffect(() => { pauseOriginal?.(); player.pause(); }, [point, observationKey, player.scope]);
    const [announcement, setAnnouncement] = useState('');
    const summary = useRef(selectionSummary);
    summary.current = selectionSummary;
    useEffect(() => {
        // Announce deliberate selection/date changes, keeping automatic playback quiet.
        setAnnouncement(point ? (!player.enabled && summary.current) || `Selected ${point.lat.toFixed(3)} degrees latitude, ${point.lon.toFixed(3)} degrees longitude.` : observationKey ? `Observation period ${observationKey}. Selection cleared.` : 'Selection cleared.');
    }, [point, observationKey]);
    useEffect(() => {
        if (player.enabled && player.frames.length) setAnnouncement(`${player.scope === 'selected' ? 'Selected Region' : 'Full Map'} observation period ${player.frames[0].date} to ${player.frames.at(-1)!.date}. ${player.frames.length} source dates.`);
    }, [player.enabled, player.frames, player.scope]);
    return <section className="experience-dashboard" aria-label={label} aria-busy={busy} onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); onSelect(null); }
    }}>
    <div className="dashboard-navigation">{player.enabled ? <label className="temporal-date">Observation date <select aria-label="Temporal observation date" disabled={!player.frames.length} value={player.index} onChange={e => { player.pause(); player.seek(+e.target.value * .6); setAnnouncement(`Observation ${player.frames[+e.target.value].date}`); }}>{player.frames.map((frame, i) => <option key={frame.date} value={i}>{frame.date}</option>)}</select></label> : navigator}<span className="dashboard-status" role="status" aria-live="polite">{player.enabled ? player.loading ? 'Loading temporal observations' : player.playing ? 'Playing temporal observations' : 'Temporal playback ' + player.playbackState : status}</span></div>
    <aside className="dashboard-information" aria-label={label}>{player.enabled && temporal ? <TemporalReading days={temporal.days} kind={temporal.kind} frame={player.frame} point={point} selected={player.scope === 'selected'} panel="selection"/> : information}</aside>
    <aside className="dashboard-information dashboard-science" aria-label="Scientific scale and general statistics">{player.enabled && temporal ? <TemporalReading days={temporal.days} kind={temporal.kind} frame={player.frame} point={point} selected={player.scope === 'selected'} panel="science"/> : science}</aside>
    <div className="dashboard-map"><div className="dashboard-map-content"><ControlledMap point={point} onSelect={p => { pauseOriginal?.(); player.pause(); onSelect(p); }} footprints={footprints}><div hidden={player.enabled}>{map}</div>{player.enabled && temporal && <TemporalMap kind={temporal.kind} frame={player.frame} days={temporal.days}/>}</ControlledMap></div></div>
    <span className="sr-only selection-announcement" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
    <div className="dashboard-playback">
      {temporal && <div className="playback-mode"><label>Audio mode <select aria-label="Audio mode" value={player.enabled ? 'temporal' : 'original'} onChange={e => { pauseOriginal?.(); player.pause(); player.setEnabled(e.target.value === 'temporal'); setAnnouncement(e.target.value === 'temporal' ? 'Temporal synthesis. Observation period follows available source dates.' : 'Original audio selected.'); }}><option value="original">{temporal.kind === 'ocean' ? 'Original Deep Ocean / Bassoon WAV' : 'Original geographic scan'}</option><option value="temporal">Data-driven temporal synthesis</option></select></label>
        <label>Playback scope <select aria-label="Playback scope" disabled={!player.enabled} value={player.scope} onChange={e => { pauseOriginal?.(); player.pause(); player.setScope(e.target.value); }}><option value="full">Full Map</option><option value="selected" disabled={!point}>Selected Region</option></select></label>
        <CoordinateSelection point={point} onSelect={onSelect}/>
      </div>}
      <div className="dashboard-controls">{player.enabled ? player.controls : controls}</div><div className="dashboard-timeline">{player.enabled ? player.timeline : timeline}</div>
      {player.enabled && <span className="waveform-description">{player.frames[0]?.date} – {player.frames.at(-1)?.date} · PCM waveform · {player.frames.filter(f => f.value !== null).length} synthesized notes</span>}
      {player.error && <p role="alert">{player.error}<button type="button" onClick={() => { player.setEnabled(false); }}>Return to original audio</button></p>}{!player.enabled && error}
    </div>
  </section>;
}
function CoordinateSelection({ point, onSelect }: { point: MapPoint | null; onSelect: (p: MapPoint) => void }) {
  const [lon, setLon] = useState('0'), [lat, setLat] = useState('0');
  useEffect(() => { if (point) { setLon(point.lon.toFixed(3)); setLat(point.lat.toFixed(3)); } }, [point]);
  return <form className="coordinate-selection" aria-label="Select geographic coordinates" onSubmit={e => { e.preventDefault(); const longitude = Number(lon), latitude = Number(lat); if (lon.trim() && lat.trim() && Number.isFinite(longitude) && Number.isFinite(latitude) && Math.abs(longitude) <= 180 && Math.abs(latitude) <= 90) onSelect({ lon: longitude, lat: latitude }); }}>
    <label>Latitude<input aria-label="Latitude" type="number" min="-90" max="90" step="any" required value={lat} onChange={e => setLat(e.target.value)}/></label>
    <label>Longitude<input aria-label="Longitude" type="number" min="-180" max="180" step="any" required value={lon} onChange={e => setLon(e.target.value)}/></label>
    <button type="submit" className="mc-button">Select</button>
  </form>;
}
export type MapPoint = {
    lon: number;
    lat: number;
};

function ControlledMap({ children, point, onSelect, footprints }: {
  footprints: MapFootprint[];
  children: ReactNode;
  point: MapPoint | null;
  onSelect: (point: MapPoint | null) => void;
}) {
  const select = onSelect;
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
  } | null>(null);
  const bound = (value: number, zoom: number) =>
    Math.max(-(zoom - 1) / 2, Math.min((zoom - 1) / 2, value));
  const zoom = (delta: number) => setView(previous => {
    const next = Math.max(1, Math.min(4, previous.zoom + delta));
    return { zoom: next, x: bound(previous.x, next), y: bound(previous.y, next) };
  });

  return <div className="controlled-map">
    <div className="map-viewport" role="group" tabIndex={0}
      aria-label="Scientific map. Click, tap, or use arrow keys to select a location. Escape clears selection. Drag to pan when zoomed."
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); select(null); return; }
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(point ?? { lon: 0, lat: 0 }); return; }
        const delta = ({ ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, 5], ArrowDown: [0, -5] } as Record<string, number[]>)[event.key];
        if (!delta) return;
        event.preventDefault();
        select({
          lon: Math.max(-180, Math.min(180, (point?.lon ?? 0) + delta[0])),
          lat: Math.max(-90, Math.min(90, (point?.lat ?? 0) + delta[1])),
        });
      }}
      onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          id: event.pointerId, x: event.clientX, y: event.clientY,
          offsetX: view.x, offsetY: view.y, moved: false,
        };
      }}
      onPointerMove={event => {
        const start = drag.current;
        if (!start || start.id !== event.pointerId) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) start.moved = true;
        if (start.moved && view.zoom > 1) {
          setView(previous => ({
            ...previous,
            x: bound(start.offsetX + (event.clientX - start.x) / bounds.width, previous.zoom),
            y: bound(start.offsetY + (event.clientY - start.y) / bounds.height, previous.zoom),
          }));
        }
      }}
      onPointerCancel={() => { drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }}
      onPointerUp={event => {
        const start = drag.current;
        drag.current = null;
        if (!start || start.id !== event.pointerId || start.moved || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        // Invert the shared transform so selection stays geographic at every zoom.
        const x = ((event.clientX - bounds.left) / bounds.width - .5 - view.x) / view.zoom + .5;
        const y = ((event.clientY - bounds.top) / bounds.height - .5 - view.y) / view.zoom + .5;
        select({ lon: Math.max(-180, Math.min(180, x * 360 - 180)), lat: Math.max(-90, Math.min(90, 90 - y * 180)) });
      }}>
      <div className="map-transform" style={{ transform: 'translate(' + view.x * 100 + '%,' + view.y * 100 + '%) scale(' + view.zoom + ')' }}>
        {children}
        {point && <svg className="map-selection-outline" viewBox="0 0 360 180" preserveAspectRatio="none" aria-hidden="true">
          {footprints.map((bounds, index) => <rect key={index}
            data-west={bounds.west} data-east={bounds.east} data-south={bounds.south} data-north={bounds.north}
            x={bounds.west + 180} y={90 - bounds.north}
            width={bounds.east - bounds.west} height={bounds.north - bounds.south}
            vectorEffect="non-scaling-stroke" />)}
        </svg>}
        {point && <span className="map-selected-point" aria-hidden="true" style={{ left: (point.lon + 180) / 360 * 100 + '%', top: (90 - point.lat) / 180 * 100 + '%' }}>+</span>}
      </div>
    </div>
    <div className="map-zoom-controls" role="group" aria-label="Map zoom controls">
      <button type="button" aria-label="Zoom in" disabled={view.zoom === 4} onClick={() => zoom(.5)}>+</button>
      <button type="button" aria-label="Zoom out" disabled={view.zoom === 1} onClick={() => zoom(-.5)}>-</button>
      <button type="button" onClick={() => setView({ zoom: 1, x: 0, y: 0 })}>Reset View</button><button type="button" disabled={!point} onClick={() => select(null)}>Clear selection</button>
    </div>
  </div>;
}
