import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { INTRO_SECONDS } from '../Globe';

/** welcome: artwork held until the visitor chooses. running: single timeline. done: observatory. */
export type IntroState = 'welcome' | 'waiting' | 'running' | 'done';
export type IntroStage = 'dark' | 'title' | 'rise' | 'brand' | 'reveal' | 'final';
export type IntroEnd = 'played' | 'skipped' | 'aborted' | 'instant' | null;

const STAGES: [number, IntroStage][] = [[0, 'title'], [2.5, 'rise'], [4.5, 'brand'], [5.4, 'reveal']];
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const prefersReduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/**
 * Restartable single timeline. Always opens on the welcome artwork (no storage skip).
 * enter() -> waits for renderer readiness -> runs; finish() settles.
 */
export function useCinematicIntro(rootRef: RefObject<HTMLElement | null>, completed = false) {
  const [state, setState] = useState<IntroState>(completed ? 'done' : 'welcome');
  const [stage, setStage] = useState<IntroStage>(completed ? 'final' : 'dark');
  const [end, setEnd] = useState<IntroEnd>(null);
  const progress = useRef(completed ? 1 : 0);
  const owning = useRef(!completed);
  const stateRef = useRef<IntroState>(completed ? 'done' : 'welcome');
  const raf = useRef(0);
  const frameCb = useRef<((p: number) => void) | null>(null);

  const write = (p: number) => { rootRef.current?.setAttribute('data-intro-progress', p.toFixed(3)); };
  const set = (s: IntroState) => { stateRef.current = s; setState(s); };

  const finish = useCallback((reason: Exclude<IntroEnd, null>) => {
    if (stateRef.current === 'done') return;
    cancelAnimationFrame(raf.current);
    progress.current = 1;
    owning.current = false;
    write(1);
    frameCb.current?.(1);
    setEnd(reason);
    set('done');
    setStage('final');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback(() => {
    if (stateRef.current !== 'welcome' && stateRef.current !== 'waiting') return;
    set('running');
    setStage('title');
    const t0 = performance.now();
    let last: IntroStage = 'title';
    const tick = (now: number) => {
      const s = Math.min(INTRO_SECONDS, (now - t0) / 1000);
      const p = s / INTRO_SECONDS;
      progress.current = p;
      write(p);
      frameCb.current?.(p);
      let st: IntroStage = 'title';
      for (const [at, name] of STAGES) if (s >= at) st = name;
      if (st !== last) { last = st; setStage(st); }
      if (p >= 1) { finish('played'); return; }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [finish]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Visitor pressed Enter. ready=false means the renderer is still preparing. */
  const enter = useCallback((ready: boolean) => {
    if (stateRef.current !== 'welcome') return;
    if (prefersReduced()) { finish('instant'); return; }
    if (ready) run(); else set('waiting');
  }, [finish, run]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => {
      if (media.matches && (stateRef.current === 'running' || stateRef.current === 'waiting')) finish('instant');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [finish]);
  useEffect(() => {
    if (state === 'done') return;
    const el = document.documentElement;
    const prev = el.style.overflow;
    el.style.overflow = 'hidden';
    return () => { el.style.overflow = prev; };
  }, [state]);

  return { state, stage, end, progress, owning, frameCb, enter, run, finish };
}

const smooth = (t: number) => t * t * t * (t * (t * 6 - 15) + 10); // quintic smootherstep: zero velocity + acceleration at both ends
const TRAVEL: [number, number] = [1.3, 4.9];
const HANDOFF = 5.0;

export function IntroLayer({ state, frameCb, progress, onEnter, onSkip, label, enterLabel, skipLabel, status, tagline }: {
  state: IntroState; frameCb: MutableRefObject<((p: number) => void) | null>; progress: MutableRefObject<number>;
  onEnter: () => void; onSkip: () => void; label: string; enterLabel: string; skipLabel: string; status: string; tagline: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const veil = useRef<HTMLDivElement>(null);
  const word = useRef<HTMLParagraphElement>(null);
  const trail = useRef<HTMLSpanElement>(null);
  const tag = useRef<HTMLParagraphElement>(null);
  const bar = useRef<HTMLElement>(null);
  const enterBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (state === 'welcome') enterBtn.current?.focus({ preventScroll: true }); }, [state]);

  useEffect(() => {
    const apply = (p: number) => {
      const s = p * INTRO_SECONDS;
      const w = word.current; const tg = tag.current;
      const ob = root.current?.closest('.ob-root');
      const target = document.querySelector<HTMLElement>('[data-brand-word]');
      if (w && target) {
        const vw = window.innerWidth; const vh = window.innerHeight;
        const rtl = document.documentElement.dir === 'rtl';
        const W = w.offsetWidth; const H = w.offsetHeight; // untransformed layout size
        const mobile = vw < 861;
        const ox = mobile ? (vw - W) / 2 : rtl ? vw - W - vw * 0.1 : vw * 0.1;
        const oy = mobile ? vh * 0.24 : vh * 0.4 - H / 2;
        const r = target.getBoundingClientRect(); // laid out (visibility hidden), not transformed
        const sc = r.width / W;
        const t = smooth(clamp01((s - TRAVEL[0]) / (TRAVEL[1] - TRAVEL[0])));
        const x = ox + (r.left - ox) * t; const y = oy + (r.top - oy) * t; const k = 1 + (sc - 1) * t;
        w.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${k.toFixed(5)})`;
        // Depth/sheen flatten to 0 exactly at the endpoint so the handoff matches the flat header word.
        const d = 1 - t;
        w.style.setProperty('--d', d.toFixed(4));
        w.style.setProperty('--sheen', `${(20 + t * 60).toFixed(2)}%`);
        // Trail from the analytic eased velocity (time-based, frame-rate independent); 0 at rest.
        const u = clamp01((s - TRAVEL[0]) / (TRAVEL[1] - TRAVEL[0]));
        const vel = 30 * u * u * (1 - u) * (1 - u) / 1.875; // normalised 0..1
        if (trail.current) {
          const moving = s > TRAVEL[0] && s < TRAVEL[1];
          trail.current.style.opacity = moving ? (vel * 0.4).toFixed(3) : '0';
          const lag = vel * 0.05 / k;
          trail.current.style.transform = `translate3d(${((ox - r.left) * lag).toFixed(2)}px, ${((oy - r.top) * lag).toFixed(2)}px, 0)`;
        }
        const handed = s >= HANDOFF;
        w.style.visibility = handed ? 'hidden' : 'visible';
        if (ob) { if (handed) ob.setAttribute('data-handoff', ''); else ob.removeAttribute('data-handoff'); }
        if (tg) {
          const tw = tg.offsetWidth;
          const tx = mobile ? (vw - tw) / 2 : rtl ? ox + W - tw : ox + W * 0.02;
          const f = clamp01((s - 0.6) / 1.2);
          tg.style.transform = `translate3d(${tx.toFixed(1)}px, ${(oy + H * 1.12 + f * 10).toFixed(1)}px, 0)`;
          tg.style.opacity = String(1 - easeInOut(f));
        }
      }
      if (veil.current) veil.current.style.opacity = String(1 - easeInOut(clamp01((s - 1) / 3)));
      if (bar.current) bar.current.style.transform = `scaleX(${p})`;
    };
    apply(progress.current);
    frameCb.current = apply;
    const onResize = () => apply(progress.current);
    window.addEventListener('resize', onResize);
    document.fonts?.ready.then(onResize).catch(() => undefined);
    return () => {
      window.removeEventListener('resize', onResize);
      root.current?.closest('.ob-root')?.removeAttribute('data-handoff');
      if (frameCb.current === apply) frameCb.current = null;
    };
  }, [frameCb, progress]);

  const welcome = state === 'welcome' || state === 'waiting';
  return (
    <div ref={root} className="intro" data-testid="intro-layer" data-state={state} role="region" aria-label={label}>
      <div ref={veil} className="intro-veil" aria-hidden="true" />
      <p ref={word} className="intro-word" data-testid="intro-wordmark" aria-hidden="true">
        SON<span>ARA</span><span ref={trail} className="trail">SONARA</span>
      </p>
      <p ref={tag} className="intro-tag" data-testid="intro-tagline">{tagline}</p>
      {welcome && (
        <div className="intro-actions">
          <button ref={enterBtn} type="button" className="btn btn-primary intro-enter" onClick={onEnter} disabled={state === 'waiting'} data-testid="button-enter">
            {enterLabel}
          </button>
          <p className="intro-status" role="status" data-testid="status-intro-loading">{status && <i aria-hidden="true" />}{status}</p>
        </div>
      )}
      <button type="button" className="intro-skip" onClick={onSkip} data-testid="button-skip-intro">
        {skipLabel}
        <span className="intro-skip-track" aria-hidden="true"><b ref={bar} /></span>
      </button>
    </div>
  );
}
