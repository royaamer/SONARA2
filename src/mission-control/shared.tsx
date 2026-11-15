import { useEffect, useRef } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Radio } from 'lucide-react';
import { useEarthSession } from '../earth/session';
import { BrandMark } from '../observatory/components';
import { MISSION_COPY } from './content';
import { EXPERIENCE_COPY } from './experience-content';
import './mission-control.css';
import './experiences.css';
export function MissionHeader({ subtitle, back = false }: { subtitle: string; back?: boolean }) {
  const { language, setLanguage, setVisited, arrivalRequested, cancelTransition } = useEarthSession();
  const t = EXPERIENCE_COPY[language];
  return <header className="mc-header"><Link href="/" onClick={() => { arrivalRequested.current = false; cancelTransition(); setVisited(false); window.scrollTo(0, 0); }} className="mc-brand" aria-label={t.home}><BrandMark/><span>SONARA<small>{subtitle}</small></span></Link><span className="mc-connection"><i/>{t.historical}</span><div className="mc-header-actions"><button className="mc-language" onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')} aria-label={language === 'en' ? 'التبديل إلى العربية' : 'Switch to English'}>EN / ع</button><Link href={back ? '/mission-control' : '/'} className="mc-back" aria-label={back ? t.return : t.home}><ArrowLeft size={16}/><span>{back ? t.return : t.home}</span></Link></div></header>;
}
export function useMissionDocument(title: string, enabled = true) {
  const { language, setVisited, setMissionEntered } = useEarthSession();
  useEffect(() => {
    if (!enabled) return;
    document.documentElement.lang = language; document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'; document.title = `${title} | SONARA`; setVisited(true); setMissionEntered(true);
    return () => { document.title = 'SONARA'; };
  },[language,title,setVisited,setMissionEntered,enabled]);
}
export function MissionArrival({ onFinish }: { onFinish: () => void }) {
  const { language } = useEarthSession();
  const t = MISSION_COPY[language];
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    button.current?.focus();
    const timer = window.setTimeout(onFinish,3600);
    const key = (e: KeyboardEvent) => { if(e.key === 'Escape') onFinish(); };
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const reduce = () => { if(media.matches) onFinish(); };
    if(media.matches) onFinish();
    window.addEventListener('keydown',key); media.addEventListener('change',reduce);
    return () => { clearTimeout(timer); window.removeEventListener('keydown',key); media.removeEventListener('change',reduce); };
  },[onFinish]);
  return <div className="mc-arrival" role="region" aria-label={t.title}><div className="mc-arrival-orbit" aria-hidden="true"><Radio size={46}/></div><p>SONARA / {t.title}</p><h2>{t.transmission}</h2><div className="mc-arrival-signal" aria-hidden="true"/><button ref={button} className="mc-button" onClick={onFinish}>{t.skip}</button></div>;
}
