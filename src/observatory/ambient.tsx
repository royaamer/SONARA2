import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  const allowed = useRef(introductory);
  allowed.current = introductory;

  useLayoutEffect(() => {
    if (location === '/mission-control') engine.fadeOut(3);
    else engine.stop();
  }, [engine, location]);

  useEffect(() => {
    if (!introductory || unavailable) return;
    const activate = (event: Event) => {
      if (!allowed.current || !event.isTrusted || muted) return;
      if ((event.target as HTMLElement).closest?.('[data-ambient-toggle]')) return;
      if (event instanceof KeyboardEvent && (event.ctrlKey || event.metaKey || event.altKey || event.key === 'Tab' || event.key === 'Shift')) return;
      void engine.start().catch(() => engine.markUnavailable());
    };
    document.addEventListener('pointerup', activate, true);
    document.addEventListener('click', activate, true);
    document.addEventListener('keydown', activate, true);
    return () => {
      document.removeEventListener('pointerup', activate, true);
      document.removeEventListener('click', activate, true);
      document.removeEventListener('keydown', activate, true);
    };
  }, [engine, introductory, muted, unavailable]);

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
      if (!next) void engine.start().catch(() => engine.markUnavailable());
    }}>
    {muted || unavailable ? <VolumeX size={17} aria-hidden="true"/> : <Volume2 size={17} aria-hidden="true"/>}
  </button>
  <span className="ambient-status" role="status" aria-live="polite" data-testid="ambient-status" data-state={status}>{statusLabel}</span>
  </div>;
}
