import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowUpRight, Snowflake, Trees, Waves, Zap, Orbit } from 'lucide-react';
import { useEarthSession } from '../earth/session';
import { EXPERIENCES, EXP_COPY, type ExperienceId } from '../observatory/content';
import { MISSION_COPY } from '../mission-control/content';
import { EXPERIENCE_COPY } from '../mission-control/experience-content';
import { MissionArrival, MissionHeader, useMissionDocument } from '../mission-control/shared';
export default function MissionControl({ transitionPreview = false }: { transitionPreview?: boolean } = {}) {
  const { language, missionEntered, setVisited } = useEarthSession();
  const t = EXPERIENCE_COPY[language], m = MISSION_COPY[language];
  const [,navigate] = useLocation();
  const [arriving,setArriving] = useState(() => !missionEntered && !matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [unavailable,setUnavailable] = useState<ExperienceId | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const finish = useCallback(() => setArriving(false),[]);
  useMissionDocument(m.title);
  useLayoutEffect(() => { if(!transitionPreview && !arriving) { window.scrollTo(0,0); heading.current?.focus({preventScroll:true}); } },[arriving,unavailable,transitionPreview]);
  const choose = (id: ExperienceId, button: HTMLButtonElement) => {
    if(id === 'ocean') { navigate('/mission-control/living-ocean'); return; }
    if(id === 'sky') { navigate('/mission-control/electric-sky'); return; }
    trigger.current = button; setUnavailable(id);
  };
  const returnToSelection = () => { setUnavailable(null); requestAnimationFrame(() => trigger.current?.focus()); };
  // RETURN must never depend on a WebGL frame or animation completion.
  const returnHome = () => { setVisited(true); window.scrollTo(0,0); navigate('/'); };
  return <div onClickCapture={event => { const anchor = (event.target as HTMLElement).closest('a.mc-back, a.mc-brand, a.mc-text-button'); if (anchor) { event.preventDefault(); returnHome(); } }} className="mc mc-selection" lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'}>
    {arriving && <MissionArrival onFinish={finish}/>}
    <div inert={arriving}>
      <a className="mc-skip" href="#experience-main">{t.choose}</a>
      <MissionHeader subtitle={m.title}/>
      <main id="experience-main">
        {unavailable ? <section className="mc-coming"><Orbit size={60} strokeWidth={.8}/><p className="mc-eyebrow">{t.soon}</p><h1 ref={heading} tabIndex={-1}>{EXP_COPY[language][unavailable].name}</h1><p>{t.unavailable}</p><button className="mc-button" onClick={returnToSelection}>{t.explore}</button><Link href="/" className="mc-text-button">{t.home}</Link></section> : <>
          <div className="mc-selection-intro"><div className="mc-orbit-emblem" aria-hidden="true"><Orbit size={66} strokeWidth={.65}/></div><p className="mc-eyebrow">SONARA / {m.title}</p><h1 ref={heading} tabIndex={-1}>{t.choose}</h1><p>{t.lead}</p></div>
          <section className="mc-experience-grid" aria-label={t.choose}>
            {EXPERIENCES.map((experience,i) => { const Icon = [Waves,Trees,Zap,Snowflake][i]; const ready = experience.id === 'sky' || experience.id === 'ocean'; return <button key={experience.id} className={`mc-experience-card mc-experience-${experience.id}`} onClick={e => choose(experience.id,e.currentTarget)}>
              <span className="mc-card-art" aria-hidden="true"><Icon size={100} strokeWidth={.55}/><span/></span>
              <span className="mc-card-top"><span className="mc-card-number">{experience.index}</span><span className={ready ? 'mc-card-status is-available' : 'mc-card-status'}>{ready ? t.available : t.soon}</span></span>
              <span className="mc-card-icon"><Icon size={24} strokeWidth={1.3}/></span>
              <span className="mc-card-title">{EXP_COPY[language][experience.id].name}</span><span className="mc-card-theme">{t.themes[experience.id]}</span><span className="mc-card-description">{t.descriptions[experience.id]}</span><span className="mc-card-bottom">{ready ? t.enter : t.soon}<ArrowUpRight size={19}/></span>
            </button>; })}
          </section>
        </>}
      </main><footer className="mc-footer"><span>{m.archive}</span><Link href="/">{t.home}</Link></footer>
    </div>
  </div>;
}
