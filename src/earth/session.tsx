import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Lang } from '../observatory/content';
function useSession() {
  const [language, setLanguage] = useState<Lang>('en');
  const [visited, setVisited] = useState(false);
  const arrivalRequested = useRef(false);
  const [missionEntered, setMissionEntered] = useState(false);
  const [cinematicTransition, setCinematicTransition] = useState<'none'|'forward'>('none');
  const transitionProgress = useRef(0);
  const globeRotation = useRef<[number, number, number, number]>([0, 0, 0, 1]);
  const travelOrigin = useRef<{ x: number; y: number; z: number; cx: number; cy: number } | null>(null);
  const transitionActive = useRef(false);
  const transitionReverse = useRef(false);
  const transitionFrame = useRef(0);
  const transitionTimer = useRef(0);
  const runTransition = useCallback((direction: 'forward', done: () => void) => {
    if (transitionActive.current) return;
    delete document.documentElement.dataset.navTransitionFallback;
    const clearTransition = () => {
      if (transitionFrame.current) cancelAnimationFrame(transitionFrame.current);
      if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
      transitionFrame.current = 0;
      transitionTimer.current = 0;
      transitionProgress.current = 0;
      transitionActive.current = false;
      transitionReverse.current = false;
      document.documentElement.style.removeProperty('--nav-progress');
      document.documentElement.style.removeProperty('--nav-crossfade');
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      clearTransition();
      setCinematicTransition('none');
      done();
      return;
    }
    if (direction === 'forward') travelOrigin.current = null;
    setCinematicTransition(direction);
    transitionReverse.current = false;
    transitionProgress.current = 0;
    transitionActive.current = true;
    const started = performance.now();
    let settled = false;
    delete document.documentElement.dataset.navTransitionMs;
    const finish = (fallback: boolean, now = performance.now()) => {
      if (settled) return;
      settled = true;
      document.documentElement.dataset.navTransitionMs = String(Math.round(now - started));
      clearTransition();
      setCinematicTransition('none');
      done();
      if (fallback) document.documentElement.dataset.navTransitionFallback = 'true';
      else delete document.documentElement.dataset.navTransitionFallback;
    };
    const frame = (now: number) => {
      if (settled || !transitionActive.current) return;
      try {
        const progress = Math.min(1, Math.max(0, (now - started) / 1350));
        transitionProgress.current = progress;
        document.documentElement.style.setProperty('--nav-progress', String(progress));
        const reveal = Math.min(1, Math.max(0, (progress - 0.58) / 0.42));
        const crossfade = reveal < 0.5 ? 4 * reveal * reveal * reveal : 1 - Math.pow(-2 * reveal + 2, 3) / 2;
        document.documentElement.style.setProperty('--nav-crossfade', String(crossfade));
        if (progress >= 1) finish(false, now);
        else transitionFrame.current = requestAnimationFrame(frame);
      } catch {
        finish(true);
      }
    };
    transitionTimer.current = window.setTimeout(() => finish(true), 2000);
    try { transitionFrame.current = requestAnimationFrame(frame); }
    catch { finish(true); }
  }, []);
  const cancelTransition = useCallback(() => {
    if (transitionFrame.current) cancelAnimationFrame(transitionFrame.current);
    if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    transitionActive.current = false;
    document.documentElement.style.removeProperty('--nav-progress');
    document.documentElement.style.removeProperty('--nav-crossfade');
    transitionFrame.current = 0;
    transitionTimer.current = 0;
    transitionProgress.current = 0;
    transitionReverse.current = false;
    setCinematicTransition('none');
  }, []);
  useEffect(() => cancelTransition, [cancelTransition]);
  return { arrivalRequested, cancelTransition, language, setLanguage, visited, setVisited, missionEntered, setMissionEntered, cinematicTransition, transitionProgress, transitionActive, transitionReverse, travelOrigin, globeRotation, runTransition };
}
const Context = createContext<ReturnType<typeof useSession> | null>(null);
export function EarthSessionProvider({ children }: { children: ReactNode }) {
  return <Context.Provider value={useSession()}>{children}</Context.Provider>;
}
export function useEarthSession() {
  const session = useContext(Context);
  if (!session) throw new Error('Earth session provider is required');
  return session;
}
