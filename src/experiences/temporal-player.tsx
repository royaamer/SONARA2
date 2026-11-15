import { requestAudio, useAudioInterruption } from '../experiences/audio-focus';
import type { PlaybackState } from './playback-state';
import { oceanName } from '../living-ocean/ocean-name';
import { observeMapResolution } from './map-resolution';
import { useEffect, useRef, useState } from 'react';
import type { MapPoint } from './experience-dashboard';
import type { ObservationDay } from '../electric-sky/scanner-score';
import { lightningSeries, oceanSeries, temperatureSeries, oceanFrame, renderTemporalPcm, pcmPeaks, temporalIndex, temporalMapping, STEP_SECONDS, type Phenomenon, type TemporalFrame } from './temporal-science';
import { ScientificHud } from './dashboard';
import { ScientificScale } from './scientific-scale';
import { colorAt, STOPS, temperaturePosition } from '../temperature/mapping';
import { currentColor, currentPosition } from '../living-ocean/current-color';
import { activityAt, activityColor, activityPosition, buildActivityGrid } from '../electric-sky/activity-scale';

export function Waveform({ peaks, seconds, duration, onSeek, disabled = false, id }: {
  id?: string;
  peaks: (number | null)[]; seconds: number; duration: number; onSeek: (s: number) => void; disabled?: boolean;
}) {
  const seekAt = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(duration, (event.clientX - bounds.left) / bounds.width * duration)));
  };
  return <div className="pcm-waveform">Audio playback time <output>{seconds.toFixed(1)} / {duration.toFixed(1)} s</output>
    <svg id={id} viewBox="0 0 720 40" preserveAspectRatio="none" role="slider" tabIndex={disabled || !duration ? -1 : 0}
      aria-label="Seek audio playback" aria-valuemin={0} aria-valuemax={duration || 1} aria-valuenow={seconds} aria-valuetext={seconds.toFixed(1) + ' of ' + duration.toFixed(1) + ' seconds'} aria-disabled={disabled || !duration}
      onPointerDown={e => { if (disabled || !duration || e.button !== 0) return; e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId); seekAt(e); }}
      onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) seekAt(e); }}
      onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) { seekAt(e); e.currentTarget.releasePointerCapture(e.pointerId); } }}
      onKeyDown={e => { if (disabled || !duration) return; const next = e.key === 'Home' ? 0 : e.key === 'End' ? duration : ['ArrowRight','ArrowUp'].includes(e.key) ? seconds + 1 : ['ArrowLeft','ArrowDown'].includes(e.key) ? seconds - 1 : e.key === 'PageUp' ? seconds + duration / 10 : e.key === 'PageDown' ? seconds - duration / 10 : null; if (next !== null) { e.preventDefault(); onSeek(Math.max(0, Math.min(duration, next))); } }}>
      {peaks.map((peak, i) => <line key={i} x1={(i + .5) / peaks.length * 720} x2={(i + .5) / peaks.length * 720}
        y1={peak === null ? 4 : 20 - peak * 19} y2={peak === null ? 36 : 20 + Math.max(.02, peak) * 19}
        stroke={peak === null ? '#486074' : i / peaks.length <= seconds / duration ? '#e8bd74' : '#a4dceb'} strokeDasharray={peak === null ? '2 3' : undefined}/>) }
      <line x1={seconds / (duration || 1) * 720} x2={seconds / (duration || 1) * 720} y1="0" y2="40" stroke="white"/>
    </svg>
  </div>;
}

export function useTemporalPlayer(kind: Phenomenon | undefined, point: MapPoint | null, days?: ObservationDay[]) {
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [enabled, setEnabled] = useState(false), [scope, setScope] = useState('full');
  const [frames, setFrames] = useState<TemporalFrame[]>([]), [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0), [playing, setPlaying] = useState(false), [loading, setLoading] = useState(false);
  const [volume, setVolume] = useState(.65), [muted, setMuted] = useState(false);
  const levels = useRef({ volume, muted }); levels.current = { volume, muted };
  const [peaks, setPeaks] = useState<number[]>([]);
  const context = useRef<AudioContext | null>(null), source = useRef<AudioBufferSourceNode | null>(null), gain = useRef<GainNode | null>(null);
  const pcm = useRef<Float32Array | null>(null), position = useRef(0), started = useRef(0), running = useRef(false), generation = useRef(0);
  const duration = frames.length * STEP_SECONDS;
  const durationRef = useRef(duration); durationRef.current = duration;
  const clock = () => running.current && context.current ? Math.min(durationRef.current, context.current.currentTime - started.current) : position.current;
  const pause = () => {
    generation.current++; position.current = clock(); running.current = false;
    if (source.current) { source.current.onended = null; source.current.stop(); source.current.disconnect(); source.current = null; }
    setSeconds(position.current); setPlaying(false); setPlaybackState(position.current >= durationRef.current && durationRef.current > 0 ? 'ended' : 'paused');
  };
  useAudioInterruption('temporal', pause);
  const play = async () => {requestAudio('temporal');
    if (!pcm.current || running.current) return;
    const token = ++generation.current;
    try {
      const ctx = context.current ?? new AudioContext(); context.current = ctx;
      await ctx.resume(); if (token !== generation.current) return;
      if (ctx.state !== 'running') throw Error('Audio is suspended. Press Play to retry.');
      if (position.current >= durationRef.current) position.current = 0;
      const buffer = ctx.createBuffer(1, pcm.current.length, 16000); buffer.copyToChannel(new Float32Array(pcm.current), 0);
      const node = ctx.createBufferSource(); node.buffer = buffer;
      const output = gain.current ?? ctx.createGain(); gain.current = output; output.disconnect(); output.connect(ctx.destination);
      output.gain.value = levels.current.muted ? 0 : levels.current.volume; node.connect(output); source.current = node;
      started.current = ctx.currentTime - position.current; running.current = true;
      node.onended = () => { if (source.current !== node) return; position.current = durationRef.current; running.current = false; node.disconnect(); source.current = null; setSeconds(position.current); setPlaying(false); setPlaybackState('ended'); };
      node.start(0, position.current); setPlaying(true); setPlaybackState('playing'); setError('');
    } catch (e) { if (token !== generation.current) return; pause(); setError(String(e)); }
  };
  const seek = (value: number) => { const resume = running.current; pause(); position.current = Math.max(0, Math.min(duration, value)); setSeconds(position.current); setPlaybackState(position.current >= duration ? 'ended' : 'paused'); if (resume && position.current < duration) void play(); };
  useEffect(() => {
    if (!point && scope === 'selected') setScope('full');
  }, [point, scope]);
  const selectedLon = scope === 'selected' ? point?.lon : undefined;
  const selectedLat = scope === 'selected' ? point?.lat : undefined;
  useEffect(() => {
    pause(); setPlaybackState('stopped'); position.current = 0; setSeconds(0); setFrames([]); setPeaks([]); pcm.current = null; setError('');
    if (!enabled || !kind) { setLoading(false); return; }
    const controller = new AbortController(); setLoading(true);
    const selection = selectedLon === undefined || selectedLat === undefined ? null : { lon: selectedLon, lat: selectedLat };
    const load = kind === 'lightning' ? Promise.resolve(lightningSeries(days ?? [], selection)) : kind === 'temperature' ? temperatureSeries(selection, controller.signal) : oceanSeries(selection, controller.signal);
    void load.then(values => {
      if (controller.signal.aborted) return;
      if (!values.length) throw Error('No observation dates available');
      const samples = renderTemporalPcm(values, kind); pcm.current = samples; setPeaks(pcmPeaks(samples)); setFrames(values); setLoading(false);
    }).catch(e => { if (!controller.signal.aborted) { setError(String(e)); setLoading(false); } });
    return () => { controller.abort(); pause(); };
  }, [kind, enabled, scope, point?.lon, point?.lat, selectedLon, selectedLat, days]);
  useEffect(() => { if (gain.current) gain.current.gain.value = muted ? 0 : volume; }, [volume, muted]);
  useEffect(() => {
    let id = 0;
    const tick = () => { if (running.current) setSeconds(clock()); id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(id); generation.current++; running.current = false; if (source.current) source.current.onended = null; source.current?.stop(); source.current?.disconnect(); source.current = null; gain.current = null; void context.current?.close().catch(() => {}); context.current = null; };
  }, []);
  const index = temporalIndex(seconds, frames.length), frame = frames[index];
  return { playbackState, enabled, setEnabled, scope, setScope, frames, frame, index, error, seconds, playing, loading, duration, seek, pause,
    controls: <div className="temporal-controls"><button className="mc-button mc-primary" disabled={loading || !frames.length} onClick={() => playing ? pause() : void play()}>{playing ? 'Pause' : 'Play'}</button>
      <button className="mc-button" disabled={!frames.length} onClick={() => { pause(); position.current = 0; setSeconds(0); void play(); }}>Restart</button>
      <button className="mc-button" disabled={!frames.length} onClick={() => { pause(); setPlaybackState('stopped'); position.current = 0; setSeconds(0); }}>Stop</button>
      <button className="mc-button" aria-pressed={muted} onClick={() => setMuted(!muted)}>{muted ? 'Unmute' : 'Mute'}</button>
      <label>Volume <input aria-label="Volume" type="range" min="0" max="1" step=".01" value={volume} onChange={e => setVolume(+e.target.value)}/></label></div>,
    timeline: <Waveform peaks={peaks} seconds={seconds} duration={duration} onSeek={seek} disabled={loading}/>,
  };
}

export function TemporalMap({ kind, frame, days }: { kind: Phenomenon; frame?: TemporalFrame; days?: ObservationDay[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ocean, setOcean] = useState<TemporalFrame['ocean']>();
  const currentOcean = ocean?.field.date === frame?.date ? ocean : undefined;
  const [mapError, setMapError] = useState('');
  useEffect(() => {
    setOcean(undefined); setMapError('');
    if (kind !== 'ocean' || !frame) return;
    const controller = new AbortController();
    void oceanFrame(frame.date, controller.signal).then(value => { if (!controller.signal.aborted) setOcean(value); }).catch(e => { if (!controller.signal.aborted) setMapError(String(e)); });
    return () => controller.abort();
  }, [kind, frame]);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d'); if (!ctx) return;
    return observeMapResolution(canvas.current!,720,360,()=>{
    ctx.clearRect(0, 0, 720, 360);
    const temp = frame?.temperature;
    if (temp) temp.anomalies.forEach((row, y) => row.forEach((v, x) => {
      if (v === null) return; ctx.fillStyle = `rgb(${colorAt(v).join(',')})`; ctx.fillRect(x * 4, (89 - y) * 4, 4, 4);
    }));
    if (currentOcean) {
      const { manifest: { grid }, field } = currentOcean;
      field.u.forEach((u, i) => {
        const v = field.v[i]; if (!Number.isFinite(u) || !Number.isFinite(v)) return;
        ctx.fillStyle = currentColor(Math.hypot(u!, v!));
        const lon = ((grid.lonStart + i % grid.width * grid.lonStep + 180) % 360 + 360) % 360;
        ctx.fillRect(lon * 2, (90 - grid.latStart + Math.floor(i / grid.width) * grid.latStep) * 2, grid.lonStep * 2, grid.latStep * 2);
      });
    }
    if (kind === 'lightning') {
      const day = days?.find(d => d.day === frame?.date); if (!day) return;
      const activity = buildActivityGrid(day);
      const radius = 1.5 * 720 / canvas.current!.getBoundingClientRect().width;
      for (const flash of day.flashes) {
        ctx.fillStyle = activityColor(activityAt(activity, flash.longitude, flash.latitude)!, activity.maximum);
        ctx.beginPath();
        ctx.arc((flash.longitude + 180) * 2, (90 - flash.latitude) * 2, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    });
  }, [kind, frame, days, currentOcean]);
  return <div className="temporal-map" role="img" aria-label={`${frame?.date ?? 'Loading'} scientific source grid`}>
    <canvas ref={canvas} width="720" height="360"/><img src={import.meta.env.BASE_URL + 'maps/world-equirectangular.svg'} alt=""/>
    {kind === 'ocean' && !currentOcean && <span className="temporal-map-status">{mapError || 'Loading daily map'}</span>}
  </div>;
}

export function TemporalReading({ kind, frame, point, selected, panel, days, language = 'en', playing = false }: { days?: ObservationDay[]; kind: Phenomenon; frame?: TemporalFrame; point: MapPoint | null; selected: boolean; panel: "selection" | "science" | "telemetry"; language?: string; playing?: boolean }) {
  const value = frame?.value ?? null;
  if (panel === 'telemetry') return <ScientificHud label={language === 'ar' ? 'الرصد الزمني' : 'Temporal observation'} language={language} indicators={[
    {label: language === 'ar' ? 'تاريخ الرصد' : 'Observation date', value: frame?.date ?? '—', direction: 'ltr'},
    {label: language === 'ar' ? 'نطاق الرصد' : 'Observation scope', value: selected ? (language === 'ar' ? 'المنطقة المحددة' : 'Selected Region') : (language === 'ar' ? 'الخريطة الكاملة' : 'Full Map')},
    {label: language === 'ar' ? 'النغمة الحالية' : 'Current note', value: playing && value !== null ? 'MIDI ' + temporalMapping(kind, value).midi.toFixed(2) : '—', direction: 'ltr'},
  ]}/>;
  const day = days?.find(d => d.day === frame?.date);
  const maximum = kind === 'lightning' ? day ? buildActivityGrid(day).maximum : 1 : kind === 'ocean' ? 1.6 : 5;
  const minimum = kind === 'temperature' ? -5 : 0;
  const position = kind === 'temperature' ? temperaturePosition(value ?? 0) : kind === 'ocean' ? currentPosition(value ?? 0) : activityPosition(value ?? 0, maximum);
  const color = (v: number) => kind === 'temperature' ? 'rgb(' + colorAt(v).join(',') + ')' : kind === 'ocean' ? currentColor(v) : activityColor(v, maximum);
  const ramp = kind === 'temperature' ? 'linear-gradient(90deg in srgb, ' + STOPS.map(([v, rgb]) => 'rgb(' + rgb.join(',') + ') ' + (v + 5) * 10 + '%').join(',') + ')' : 'linear-gradient(90deg in srgb, ' + [0, maximum / 2, maximum].map(color).join(',') + ')';
  const unit = kind === 'lightning' ? 'recorded flashes / 5\u00b0 \u00d7 5\u00b0 cell' : kind === 'ocean' ? 'm/s' : '°C relative to 1951–1980';
  return <section className="temporal-reading" aria-label="Temporal scientific measurements">
    {panel === "selection" && kind === "ocean" && point && <strong>{oceanName(point.lon, point.lat)}</strong>}
    {panel === "selection" && (!selected ? <><p>{point ? `${point.lat.toFixed(3)}? latitude, ${point.lon.toFixed(3)}? longitude` : "Select a location to inspect surface currents."}</p><p>Choose Selected Region playback scope to inspect temporal measurements at a location.</p></> : <>
    <p>{selected && point ? `${point.lat.toFixed(3)}° latitude, ${point.lon.toFixed(3)}° longitude` : 'Full Map'}</p>
    <output>{value === null ? 'No data' : `${value.toFixed(4)} ${frame?.unit}`}</output>
    <p>{frame?.detail}</p>
    </>)}
    {panel === "science" && <>
    <ScientificScale title="Scientific color scale" gradient={ramp}
      ticks={[minimum + (kind === 'temperature' ? ' °C' : ''), kind === 'temperature' ? '0 °C' : String(maximum / 2), maximum + (kind === 'temperature' ? ' °C' : kind === 'ocean' ? ' m/s' : ' flashes / cell')]}
      measurement={{value, unit, position, color: color(value ?? 0), minimum, maximum, label: (frame?.date ?? 'Loading observations') + ' / ' + (selected ? 'Selected region' : 'Full Map / ' + (kind === 'lightning' ? 'mean flashes per occupied cell' : kind === 'temperature' ? 'area-weighted mean anomaly' : 'area-weighted mean speed'))}}>
      {kind === 'temperature' && <p>Anomaly relative to the 1951–1980 baseline.</p>}
    </ScientificScale>
    <p>Each source date occupies 0.6 s. Missing measurements produce silence. Valid measurements produce one synthesized note per date.</p>
    <details><summary>Sound mapping</summary><p>Pitch spans MIDI 48–84 and amplitude 0.12–0.40. {kind === 'temperature' ? 'Anomaly is normalized over −5 to +5 °C relative to 1951–1980.' : kind === 'ocean' ? 'Daily speed is normalized over 0–1.6 m/s. Spatial bilinear sampling requires four valid cells. Daily observations remain discrete.' : 'Recorded flash count uses log(1 + count) / log(1001). Counts represent incomplete ISS LIS sampling.'} Values beyond the mapping endpoints clip musically. Scientific readouts retain the original values.</p></details>
    </>}
  </section>;
}
