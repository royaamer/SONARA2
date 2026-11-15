import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import Globe, { type GlobeFailure, type TravelLink } from '../Globe';
import GlobeErrorBoundary from '../GlobeErrorBoundary';
import { UI, type DialogKind } from '../observatory/content';
import { InfoDialog, ObservatoryHeader } from '../observatory/components';
import { IntroLayer, useCinematicIntro } from '../observatory/intro';
import { useEarthSession } from '../earth/session';
import { useEarthTextures } from '../earth/useEarthTextures';
export default function Home() {
  const { arrivalRequested, cancelTransition, language, setLanguage, visited, setVisited, setMissionEntered, transitionProgress, transitionActive, transitionReverse, travelOrigin, globeRotation, runTransition, cinematicTransition } = useEarthSession();
  const [, navigate] = useLocation();
  const returning = useRef(visited);
  const { textures, textureState, retryTextures } = useEarthTextures();
  const [globeFailure, setGlobeFailure] = useState<GlobeFailure | null>(null);
  const [globeAttempt, setGlobeAttempt] = useState(0);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const exploreRef = useRef<HTMLElement>(null);
  const t = UI[language];
  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const skipped = useRef(false);
  const intro = useCinematicIntro(rootRef, visited);
  const introLink = useMemo(() => ({ progress: intro.progress, owning: intro.owning }), [intro.progress, intro.owning]);
  const { finish: finishIntro, run: runIntro, enter: enterIntro } = intro;
  const [globeReady, setGlobeReady] = useState(false);
  const [beginningListening, setBeginningListening] = useState(false);
  const beginHandled = useRef(false);
  const travelLink = useMemo<TravelLink>(() => ({ progress: transitionProgress, active: transitionActive, reverse: transitionReverse, origin: travelOrigin }), [transitionProgress, transitionActive, transitionReverse]);
  const onGlobeReady = useCallback(() => { setGlobeReady(true); }, []);
  const failed = textureState === 'error' || Boolean(globeFailure);
  const enter = useCallback(() => {
    // A failed renderer never blocks: Enter reveals the real fallback immediately.
    if (failed) { finishIntro('aborted'); return; }
    enterIntro(globeReady);
  }, [failed, globeReady, enterIntro, finishIntro]);
  const skipIntro = useCallback(() => { skipped.current = true; finishIntro('skipped'); }, [finishIntro]);

  // Main UI is unavailable to keyboard/AT while the intro is pending; only Skip is reachable.
  useEffect(() => {
    const m = mainRef.current;
    if (!m) return;
    if (intro.state === 'done') m.removeAttribute('inert'); else m.setAttribute('inert', '');
    if (intro.state === 'done' && skipped.current) {
      skipped.current = false;
      requestAnimationFrame(() => titleRef.current?.focus());
    }
  }, [intro.state]);
  useEffect(() => {
    if (intro.state === 'done') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') skipIntro(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [intro.state, skipIntro]);
  // Visitor already chose to enter: start once ready, fall back on failure, never strand.
  useEffect(() => {
    if (intro.state !== 'waiting') return;
    if (failed) { finishIntro('aborted'); return; }
    if (globeReady) { runIntro(); return; }
    const id = window.setTimeout(() => finishIntro('aborted'), 12000);
    return () => window.clearTimeout(id);
  }, [intro.state, failed, globeReady, runIntro, finishIntro]);
  // Failure during a running timeline settles immediately.
  useEffect(() => { if (failed && intro.state === 'running') finishIntro('aborted'); }, [failed, intro.state, finishIntro]);
  const introStatus = intro.state === 'waiting' ? t.introWaiting
    : failed ? t.introFallback
    : globeReady ? t.introReady : t.introPreparing;
  const uiOn = intro.stage === 'reveal' || intro.stage === 'final';


  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);


  const focusExperiences = () => { arrivalRequested.current = true; setVisited(true); navigate('/mission-control'); };
  const beginListening = () => {
    if (beginHandled.current || cinematicTransition !== 'none') return;
    beginHandled.current = true;
    setBeginningListening(true);
    setVisited(true); setMissionEntered(true);
    runTransition('forward', () => { setVisited(true); setMissionEntered(true); navigate('/mission-control'); });
  };

  useEffect(() => () => { cancelTransition(); window.speechSynthesis?.cancel(); }, [cancelTransition]);

  const globeLayer = (
    <section ref={exploreRef} tabIndex={-1} id="explore" aria-label={t.globeRegion} data-testid="section-globe" className={`ob-globe${globeFailure ? ' is-unavailable' : ''}`}>
      {globeFailure ? (
        <div className="state-card" role="alert" aria-atomic="true" data-testid="status-webgl-error">
          <p className="sci-kicker">SONARA / 3D</p>
          <h2>{globeFailure === 'context-lost' ? t.contextLostTitle : t.unavailableTitle}</h2>
          <p>{globeFailure === 'context-lost' ? t.contextLostBody : t.unavailableBody}</p>
          <p className="muted">{t.renderingAlternative}</p>
          <button type="button" className="btn btn-ghost btn-sm" data-testid="button-retry-3d" onClick={() => { setGlobeAttempt((v) => v + 1); setGlobeFailure(null); }}>{t.retry3d}</button>
        </div>
      ) : textureState === 'ready' && textures ? (
        <GlobeErrorBoundary key={globeAttempt} onFailure={() => setGlobeFailure('unavailable')}>
          <Globe textures={textures} onFailure={setGlobeFailure}
            intro={introLink} travel={travelLink} onReady={onGlobeReady} rtl={language === 'ar'} rotation={globeRotation} />
        </GlobeErrorBoundary>
      ) : textureState === 'loading' ? (
        <div className="globe-wait" role="status" data-testid="status-loading"><span className="wait-orb" aria-hidden="true" /><span>{t.loading}</span></div>
      ) : (
        <div className="state-card" role="alert" data-testid="status-error">
          <h2>{t.failedTitle}</h2>
          <p>{t.failedBody}</p>
          <button type="button" className="btn btn-ghost btn-sm" data-testid="button-retry" onClick={() => { retryTextures(); }}>{t.retry}</button>
        </div>
      )}
      {!globeFailure && textureState === 'ready' && <p className="globe-hint" aria-hidden="true">{t.drag}<i /> {t.zoom}</p>}
    </section>
  );


  return (
    <div ref={rootRef} className="ob-root" data-return={returning.current || undefined} data-testid="root-observatory" data-intro={intro.state} data-intro-stage={intro.stage}
      data-intro-end={intro.end ?? 'none'} data-intro-progress={intro.state === 'done' ? '1.000' : undefined}
      data-globe-ready={globeFailure ? 'failed' : globeReady ? 'ready' : 'pending'} data-texture-state={textureState} data-ui={uiOn ? 'on' : 'off'}>
      {intro.state !== 'done' && (
        <IntroLayer state={intro.state} frameCb={intro.frameCb} progress={intro.progress} onSkip={skipIntro} onEnter={enter}
          label={t.introLabel} enterLabel={t.enterIntro} skipLabel={t.skipIntro} status={introStatus} tagline={t.tagline} />
      )}
      <main ref={mainRef} id="top" data-testid="page-observatory" className={`ob${language === 'ar' ? ' rtl' : ''}${globeFailure || textureState === 'error' ? ' has-fallback' : ''}`} lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'}>
        <a href="/mission-control" className="skip-link" onClick={(e) => { e.preventDefault(); focusExperiences(); }}>{t.skip}</a>
        <div className="ob-atmos" aria-hidden="true" />
        <ObservatoryHeader t={t} lang={language} onLang={() => setLanguage(language === 'en' ? 'ar' : 'en')} onOpen={setDialog} />

        <div className="ob-stage">
          <section className="ob-hero rv rv-3" aria-labelledby="hero-title">
            <p className="ob-eyebrow"><span className="tick" aria-hidden="true" />{t.eyebrow}</p>
            <h1 id="hero-title" ref={titleRef} tabIndex={-1} className="ob-title" data-testid="text-hero-title"><span>{t.h1a}</span> <span className="soft">{t.h1b}</span></h1>
            <p className="ob-lead">{t.lead}</p>
            <div className="ob-actions">
              <button type="button" className="btn btn-primary" onClick={beginListening} disabled={beginningListening} aria-busy={beginningListening} data-testid="button-begin-listening">
                <svg viewBox="0 0 20 12" aria-hidden="true" className="btn-ico"><path d="M1 6h3M6 3v6M9 1v10M12 4v4M15 2v8M18 6h1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                {t.begin}
              </button>

            </div>

          </section>

          <div className="ob-window" aria-hidden="true" />

          <div className="ob-lower">
            <div className="ob-context rv rv-5">
            </div>
          </div>
        </div>

        {globeLayer}

        <footer className="ob-foot rv rv-6">
          <p><span className="ob-micro">{t.micro}</span> {t.archival}</p>
        </footer>

        <InfoDialog kind={dialog} lang={language} t={t} onClose={() => setDialog(null)} />
      </main>
    </div>
  );
}
