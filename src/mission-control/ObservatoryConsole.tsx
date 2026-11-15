import { useEffect, useState } from 'react';
import { AudioLines, Crosshair, Earth, Pause, Play, Radio, ScanLine } from 'lucide-react';
import Globe, { type GlobeFailure } from '../Globe';
import GlobeErrorBoundary from '../GlobeErrorBoundary';
import { useEarthTextures } from '../earth/useEarthTextures';
import { useEarthSession } from '../earth/session';
import { EXPERIENCES } from '../observatory/content';
import { MISSION_COPY } from './content';

export default function ObservatoryConsole() {
  const { language } = useEarthSession();
  const t = MISSION_COPY[language];
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [clouds, setClouds] = useState(true);
  const [orbits, setOrbits] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [failure, setFailure] = useState<GlobeFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { textures, textureState, retryTextures } = useEarthTextures();
  const stage = Math.min(3, Math.floor(progress / 25));
  useEffect(() => {
    if (!scanning) return;
    const timer = window.setInterval(() => setProgress(p => Math.min(100, p + 1)), 100);
    return () => window.clearInterval(timer);
  }, [scanning]);
  useEffect(() => { if (progress === 100) setScanning(false); }, [progress]);
  const status = scanning ? t.scanning : progress === 100 ? t.complete : t.idle;
  return (
    <div className="mc-console">
          <div className="mc-workspace">
            <aside className="mc-rail" aria-label={t.systems}>
              <h2><Earth size={16}/>{t.systems}</h2>
              <fieldset className="mc-layers"><legend>{t.layers}</legend><label><input type="checkbox" checked={clouds} onChange={e => setClouds(e.target.checked)}/>{t.clouds}</label><label><input type="checkbox" checked={orbits} onChange={e => setOrbits(e.target.checked)}/>{t.orbits}</label></fieldset>
            </aside>
            <section className={`mc-viewport ${scanning ? 'is-scanning' : ''}`} aria-label={t.target}>
              <div className="mc-viewport-label"><span><Crosshair size={14}/> {t.target}</span><span>{t.earth}</span></div>
              <div className="mc-earth">
                {failure || textureState === 'error' ? <div className="mc-earth-state" role="alert"><Earth size={40}/><p>{t.failure}</p><button className="mc-button" onClick={() => { setFailure(null); setAttempt(v => v + 1); if (textureState === 'error') retryTextures(); }}>{t.retry}</button></div> : textures && textureState === 'ready' ? <GlobeErrorBoundary key={attempt} onFailure={() => setFailure('unavailable')}><Globe textures={textures} variant="mission" onFailure={setFailure} rtl={language === 'ar'} showClouds={clouds} showOrbits={orbits} labels={{ earth: t.earthLabel, controls: t.zoomControls, zoomIn: t.zoomIn, zoomOut: t.zoomOut }}/></GlobeErrorBoundary> : <div className="mc-earth-state" role="status"><Earth size={40}/><p>{t.loading}</p></div>}
                <div className="mc-reticle" aria-hidden="true"><i/><i/><i/><i/></div>
                {scanning && <div className="mc-sweep" aria-hidden="true" style={{ top: `${12 + progress * .76}%` }}/ >}
                <span className="mc-axis mc-axis-n" aria-hidden="true">N</span><span className="mc-axis mc-axis-s" aria-hidden="true">S</span>
              </div>
              <div className="mc-scanner"><p role="status"><span className={scanning ? 'mc-live-dot' : ''}/>{status}</p><button className="mc-button mc-primary" aria-pressed={scanning} onClick={() => { if (scanning) setScanning(false); else { setProgress(0); setScanning(true); } }}><ScanLine size={18}/>{scanning ? t.stop : t.scanner}</button><small>{t.scanNote}</small></div>
            </section>
            <aside className="mc-telemetry"><h2><Radio size={16}/>{t.telemetry}</h2><p className="mc-instrument">{t.instrument}</p><div className="mc-empty-signal" aria-hidden="true"><span/><span/><span/><span/><span/><span/><span/><span/></div><dl><div><dt>{t.feed}</dt><dd className="mc-amber">{t.unavailable}</dd></div><div><dt>{t.flashes}</dt><dd>—<small>{t.awaiting}</small></dd></div><div><dt>{t.window}</dt><dd>—<small>{t.awaiting}</small></dd></div></dl><div className="mc-source"><p>{t.source}</p>{EXPERIENCES[2].sources.map(source => <a key={source.href} href={source.href} target="_blank" rel="noreferrer">{source.label}</a>)}</div></aside>
          </div>
          <section className="mc-timeline" aria-labelledby="timeline-title"><div><h2 id="timeline-title">{t.timeline}</h2><p>{t.timelineNote}</p></div><div className="mc-timeline-track"><input type="range" min="0" max="100" value={progress} aria-label={t.elapsed} aria-valuetext={`${progress}% · ${t.stages[stage]}`} onChange={e => { setScanning(false); setProgress(Number(e.target.value)); }}/><div className="mc-timeline-stages">{t.stages.map((label, i) => <button key={label} aria-pressed={stage === i} onClick={() => { setScanning(false); setProgress(i === 3 ? 100 : i * 25); }}>{label}</button>)}</div></div><output>{progress.toString().padStart(3, '0')}<small>%</small></output></section>
          <div className="mc-bottom"><section className="mc-decode"><h2><AudioLines size={21}/>{t.decode}</h2><p>{t.explanation}</p><button className="mc-text-button" aria-expanded={expanded} aria-controls="mc-science-details" onClick={() => setExpanded(v => !v)}>{expanded ? t.hide : t.details}</button>{expanded && <ol id="mc-science-details">{t.steps.map(step => <li key={step}>{step}</li>)}</ol>}</section><section className="mc-lab"><h2>{t.lab}</h2><p className="mc-amber" id="mc-audio-status">{t.audio}</p><div className="mc-audio-controls" aria-describedby="mc-audio-status"><button disabled aria-label={t.play}><Play size={18}/></button><button disabled aria-label={t.pause}><Pause size={18}/></button><div className="mc-audio-line" aria-hidden="true"/><label>{t.volume}<input type="range" disabled aria-label={t.volume} value="0" readOnly/></label></div><small>{t.audioNote}</small></section></div>
    </div>
  );
}
