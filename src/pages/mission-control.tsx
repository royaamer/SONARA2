import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowUpRight, Waves, Zap, Orbit, ThermometerSun } from 'lucide-react';
import { TEMPERATURE_COPY } from '../temperature/content';
import { useEarthSession } from '../earth/session';
import { EXPERIENCES, EXP_COPY, type ExperienceId } from '../observatory/content';
import { BrandMark } from '../observatory/components';
import { MISSION_COPY } from '../mission-control/content';
import { EXPERIENCE_COPY } from '../mission-control/experience-content';
import { MissionArrival, MissionHeader, useMissionDocument } from '../mission-control/shared';
// Add an implemented experience here when its route is ready.
const AVAILABLE_EXPERIENCES = {
  ocean: { Icon: Waves, route: '/mission-control/living-ocean' },
  sky: { Icon: Zap, route: '/mission-control/electric-sky' },
};

export default function MissionControl({ transitionPreview = false }: { transitionPreview?: boolean } = {}) {
  const { language, arrivalRequested, setVisited } = useEarthSession();
  const t = EXPERIENCE_COPY[language], m = MISSION_COPY[language];
  const [,navigate] = useLocation();
  const [arriving,setArriving] = useState(() => !transitionPreview && arrivalRequested.current && !matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [unavailable,setUnavailable] = useState<ExperienceId | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const finish = useCallback(() => setArriving(false),[]);
  useMissionDocument(m.title, !transitionPreview);
  useEffect(() => { if (!transitionPreview) arrivalRequested.current = false; }, [arrivalRequested, transitionPreview]);
  useLayoutEffect(() => { if(!transitionPreview && !arriving) { window.scrollTo(0,0); heading.current?.focus({preventScroll:true}); } },[arriving,unavailable,transitionPreview]);
  const choose = (id: ExperienceId, button: HTMLButtonElement) => {
    if (id in AVAILABLE_EXPERIENCES) { navigate(AVAILABLE_EXPERIENCES[id as keyof typeof AVAILABLE_EXPERIENCES].route); return; }
    trigger.current = button; setUnavailable(id);
  };
  const returnToSelection = () => { setUnavailable(null); requestAnimationFrame(() => trigger.current?.focus()); };
  // RETURN must never depend on a WebGL frame or animation completion.
  const returnHome = () => { setVisited(true); window.scrollTo(0,0); navigate('/'); };
  return <div onClickCapture={event => { const anchor = (event.target as HTMLElement).closest('a.mc-back, a.mc-text-button'); if (anchor) { event.preventDefault(); returnHome(); } }} className="mc mc-selection" lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'}>
    {arriving && <MissionArrival onFinish={finish}/>}
    <div inert={arriving}>
      <a className="mc-skip" href="#experience-main">{t.choose}</a>
      <MissionHeader subtitle={m.title}/>
      <main id="experience-main">
        {unavailable ? <section className="mc-coming"><Orbit size={60} strokeWidth={.8}/><p className="mc-eyebrow">{t.soon}</p><h1 ref={heading} tabIndex={-1}>{EXP_COPY[language][unavailable].name}</h1><p>{t.unavailable}</p><button className="mc-button" onClick={returnToSelection}>{t.explore}</button><Link href="/" className="mc-text-button">{t.home}</Link></section> : <>
          <div className="mc-selection-intro"><div className="mc-orbit-emblem" aria-hidden="true" style={{ opacity: 1 }}><BrandMark className="mc-selection-logo"/></div><p className="mc-eyebrow">SONARA / {m.title}</p><h1 ref={heading} tabIndex={-1}>{t.choose}</h1><p>{t.lead}</p></div>
          <section className="mc-experience-grid" aria-label={t.choose}>
            {EXPERIENCES.filter(experience => experience.id in AVAILABLE_EXPERIENCES).map(experience => { const { Icon } = AVAILABLE_EXPERIENCES[experience.id as keyof typeof AVAILABLE_EXPERIENCES]; const ready = true; return <button key={experience.id} className={`mc-experience-card mc-experience-${experience.id}`} onClick={e => choose(experience.id,e.currentTarget)}>
              <span className="mc-card-art" aria-hidden="true"><Icon size={100} strokeWidth={.55}/><span/></span>
              <span className="mc-card-top"><span className="mc-card-number">{experience.index}</span><span className={ready ? 'mc-card-status is-available' : 'mc-card-status'}>{ready ? t.available : t.soon}</span></span>
              <span className="mc-card-icon"><Icon size={24} strokeWidth={1.3}/></span>
              <span className="mc-card-title">{EXP_COPY[language][experience.id].name}</span><span className="mc-card-theme">{t.themes[experience.id]}</span><span className="mc-card-description">{t.descriptions[experience.id]}</span><span className="mc-card-bottom">{ready ? t.enter : t.soon}<ArrowUpRight size={19}/></span>
            </button>; })}
            <button type="button" className="mc-experience-card mc-experience-temperature" onClick={()=>navigate('/mission-control/temperature')}>
              <span className="mc-card-art" aria-hidden="true"><ThermometerSun size={100} strokeWidth={.55}/><span/></span>
              <span className="mc-card-top"><span className="mc-card-number">05</span><span className="mc-card-status is-available">{t.available}</span></span>
              <span className="mc-card-icon"><ThermometerSun size={24} strokeWidth={1.3}/></span>
              <span className="mc-card-title">{TEMPERATURE_COPY[language].title}</span><span className="mc-card-theme">{TEMPERATURE_COPY[language].cardTheme}</span><span className="mc-card-description">{TEMPERATURE_COPY[language].cardDescription}</span><span className="mc-card-bottom">{t.enter}<ArrowUpRight size={19}/></span>
            </button>
          </section>
        </>}
      </main><footer className="mc-footer"><span>{m.archive}</span><Link href="/">{t.home}</Link></footer>
    </div>
  </div>;
}
