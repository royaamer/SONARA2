import { useEffect, useLayoutEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useLocation } from 'wouter';
import { useEarthSession } from '../earth/session';
import { AmbientSoundscape } from './ambient-audio';

export function IntroSoundscape() {
  const [location] = useLocation();
  const { language } = useEarthSession();
  const [engine] = useState(() => new AmbientSoundscape());
  const [snapshot, setSnapshot] = useState(() => engine.getSnapshot());
  const { muted, status } = snapshot;
  const unavailable = status === 'unavailable';
  const introductory = location === '/';

  useLayoutEffect(() => {
    engine.stop();
  }, [engine, location]);

  useEffect(() => {
    if (!introductory) return;
    const update = () => {
      const next = engine.getSnapshot();
      setSnapshot(previous => previous.status === next.status && previous.muted === next.muted ? previous : next);
    };
    update();
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [engine, introductory]);

  useEffect(() => {
    const stop = () => engine.stop();
    window.addEventListener('pagehide', stop);
    return () => { window.removeEventListener('pagehide', stop); engine.stop(); };
  }, [engine]);

  if (!introductory) return null;
  const ar = language === 'ar';
  const label = unavailable
    ? (ar ? 'الصوت المحيطي غير متاح' : 'Ambient sound unavailable')
    : muted ? (ar ? 'تشغيل الصوت المحيطي' : 'Unmute ambient sound')
      : (ar ? 'كتم الصوت المحيطي' : 'Mute ambient sound');
  const statusLabel = ar
    ? { playing:'يعمل الصوت', muted:'الصوت مكتوم', waiting:'بانتظار التفاعل', unavailable:'الصوت غير متاح' }[status]
    : { playing:'Playing', muted:'Muted', waiting:'Waiting for interaction', unavailable:'Audio unavailable' }[status];
  return <div className="ambient-control" lang={language} dir={ar ? 'rtl' : 'ltr'}>
  <button type="button" className="ambient-toggle" data-ambient-toggle="" data-testid="ambient-toggle"
    lang={language} aria-label={label} title={label} aria-pressed={muted} disabled={unavailable}
    onClick={() => {
      const next = !engine.getSnapshot().muted;
      engine.setMuted(next);
      setSnapshot(engine.getSnapshot());

    }}>
    {muted || unavailable ? <VolumeX size={17} aria-hidden="true"/> : <Volume2 size={17} aria-hidden="true"/>}
  </button>
  <span className="ambient-status" role="status" aria-live="polite" data-testid="ambient-status" data-state={status}>{statusLabel}</span>
  </div>;
}
