import { useEffect, useRef, type KeyboardEvent } from 'react';
import { DIALOGS, EXP_COPY, EXPERIENCES, UI, fmtLat, fmtLon, type DialogKind, type Experience, type ExperienceId, type Lang } from './content';
import type { Waypoint } from '../Globe';

type T = (typeof UI)['en'] | (typeof UI)['ar'];

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7.5 9.5a12 12 0 0 0 0 13M24.5 9.5a12 12 0 0 1 0 13" fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".7" />
      <path d="M3.5 6a17 17 0 0 0 0 20M28.5 6a17 17 0 0 1 0 20" fill="none" stroke="currentColor" strokeWidth="1" opacity=".4" />
    </svg>
  );
}

export function ObservatoryHeader({ t, lang, onLang, onOpen }: {
  t: T; lang: Lang; onLang: () => void; onOpen: (k: DialogKind) => void;
}) {
  return (
    <header className="ob-header">
      <a className="ob-brand" href="#top" aria-label="SONARA" data-testid="link-home">
        <BrandMark />
        <span className="ob-brand-word" data-brand-word="">SON<span>ARA</span></span>
        <span className="ob-brand-tag rv rv-1">{t.brandTag}</span>
      </a>
      <nav className="ob-nav rv rv-1" aria-label={t.navLabel}>
        <button type="button" onClick={() => onOpen('about')} aria-haspopup="dialog" data-testid="nav-about">{t.nav.about}</button>
        <button type="button" onClick={() => onOpen('access')} aria-haspopup="dialog" data-testid="nav-accessibility">{t.nav.access}</button>
      </nav>
      <div className="ob-tools rv rv-2">
        <button type="button" className="ob-lang" onClick={onLang} aria-label={t.langSwitch} data-testid="button-language">
          <span aria-hidden="true" className={lang === 'en' ? 'on' : ''}>EN</span>
          <span aria-hidden="true" className="ob-lang-sep">/</span>
          <span aria-hidden="true" className={lang === 'ar' ? 'on' : ''} lang="ar">ع</span>
        </button>
      </div>
    </header>
  );
}

function ExperienceGlyph({ id }: { id: ExperienceId }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' as const };
  return (
    <svg className="exp-glyph" viewBox="0 0 40 16" aria-hidden="true">
      {id === 'ocean' && <><path {...p} d="M1 9c4-5 7-5 10 0s7 5 10 0 7-5 10 0 5 3 8 1" /><path {...p} opacity=".45" d="M1 13c4-3 7-3 10 0s7 3 10 0 7-3 10 0" /></>}
      {id === 'forest' && [4, 9, 14, 19, 24, 29, 34].map((x, i) => <line key={x} {...p} x1={x} x2={x} y1={15} y2={15 - [6, 11, 8, 13, 9, 12, 5][i]} />)}
      {id === 'sky' && <path {...p} d="M1 10h9l3-8 4 13 3-9 2 4h17" />}
      {id === 'ice' && <><path {...p} d="M1 6h38" /><path {...p} opacity=".7" d="M5 10h30" /><path {...p} opacity=".4" d="M11 14h18" /></>}
    </svg>
  );
}

export function ExperienceNavigator({ t, lang, activeId, onSelect, listRef }: {
  t: T; lang: Lang; activeId: ExperienceId | null; onSelect: (e: Experience) => void; listRef: React.RefObject<HTMLDivElement | null>;
}) {
  const copy = EXP_COPY[lang];
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const btns = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button.exp-item'));
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    const rtl = lang === 'ar';
    let n = i;
    if (e.key === 'ArrowDown' || e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) n = i + 1;
    if (e.key === 'ArrowUp' || e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) n = i - 1;
    if (e.key === 'Home') n = 0;
    if (e.key === 'End') n = btns.length - 1;
    e.preventDefault();
    btns[(n + btns.length) % btns.length]?.focus();
  };
  return (
    <section className="exp-nav" aria-labelledby="exp-nav-title" id="experiences">
      <div className="exp-nav-head">
        <h2 id="exp-nav-title" tabIndex={-1}>{t.navigator}</h2>
        <span className="tag-preview">{t.preview}</span>
      </div>
      <div className="exp-list" role="group" aria-labelledby="exp-nav-title" aria-describedby="exp-note" onKeyDown={onKey} ref={listRef}>
        {EXPERIENCES.map((e) => {
          const c = copy[e.id];
          const on = activeId === e.id;
          return (
            <button key={e.id} type="button" className="exp-item" aria-pressed={on} onClick={() => onSelect(e)} data-testid={`button-experience-${e.id}`}>
              <span className="exp-index">{e.index}</span>
              <span className="exp-text">
                <span className="exp-name">{c.name}</span>
                <span className="exp-cat">{c.category}</span>
              </span>
              <ExperienceGlyph id={e.id} />
            </button>
          );
        })}
      </div>
      <p id="exp-note" className="exp-note">{t.previewNote}</p>
    </section>
  );
}

export function GeographicReadout({ t, lang, place }: { t: T; lang: Lang; place: Waypoint | null }) {
  return (
    <dl className="geo-readout" data-testid="text-coordinates">
      <div><dt>{t.lat}</dt><dd>{place ? fmtLat(place.lat, lang) : '—'}</dd></div>
      <div><dt>{t.lon}</dt><dd>{place ? fmtLon(place.lon, lang) : '—'}</dd></div>
    </dl>
  );
}

export function ScienceContextPanel({ t, lang, experience, place, expanded, onToggle, onListen, onClear }: {
  t: T; lang: Lang; experience: Experience | null; place: Waypoint | null; expanded: boolean;
  onToggle: () => void; onListen: () => void; onClear: () => void;
}) {
  const c = experience ? EXP_COPY[lang][experience.id] : null;
  const key = `${experience?.id ?? place?.id ?? 'idle'}-${place?.lat ?? ''}-${lang}`;
  if (!place) return null;
  return (
    <aside className="sci-panel" aria-label={t.experience} data-testid="panel-location">
      <div className="sci-inner" key={key}>
        {!place ? (
          <>
            <p className="sci-kicker">{t.experience}</p>
            <h2 className="sci-title">{t.panelIdle}</h2>
            <p className="sci-body">{t.panelIdleBody}</p>
          </>
        ) : !c || !experience ? (
          <>
            <p className="sci-kicker">{t.mapPoint}</p>
            <GeographicReadout t={t} lang={lang} place={place} />
            <p className="sci-body">{t.mapPointBody}</p>
            <div className="sci-actions"><button type="button" className="btn-text" onClick={onClear} data-testid="button-clear-selection">{t.clear}</button></div>
          </>
        ) : (
          <>
            <p className="sci-kicker"><span>{experience.index}</span> {t.experience} <span className="tag-preview">{t.preview}</span></p>
            <h2 className="sci-title">{c.name}</h2>
            <dl className="sci-grid">
              <div><dt>{t.variable}</dt><dd>{c.category}</dd></div>
              <div><dt>{t.region}</dt><dd>{c.place} · {c.region}</dd></div>
              <div><dt>{t.status}</dt><dd>{t.statusValue}</dd></div>
            </dl>
            <GeographicReadout t={t} lang={lang} place={place} />
            <div className="sci-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={onListen} data-testid="button-panel-listen">{t.listen}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onToggle} aria-expanded={expanded} aria-controls="sci-details" data-testid="button-details">{expanded ? t.hideDetails : t.details}</button>
            </div>
            {expanded && (
              <div className="sci-details" id="sci-details">
                <p className="sci-body">{c.summary}</p>
                <p className="sci-body muted">{c.why}</p>
                <h3>{t.audio}</h3>
                <p className="sci-body">{c.listen}</p>
                <h3>{t.sources}</h3>
                <ul>
                  {experience.sources.map((s) => (
                    <li key={s.href}><a href={s.href} target="_blank" rel="noreferrer" data-testid={`link-source-${experience.id}`}>{s.label}</a></li>
                  ))}
                </ul>
              </div>
            )}
            <button type="button" className="btn-text" onClick={onClear} data-testid="button-clear-selection">{t.clear}</button>
          </>
        )}
      </div>
    </aside>
  );
}

export function InfoDialog({ kind, lang, t, onClose }: { kind: DialogKind | null; lang: Lang; t: T; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (kind && !d.open) d.showModal();
    if (!kind && d.open) d.close();
  }, [kind]);
  const content = kind ? DIALOGS[lang][kind] : null;
  return (
    <dialog ref={ref} className="ob-dialog" aria-labelledby="dlg-title" onClose={() => closeRef.current()} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} data-testid={`dialog-${kind ?? 'none'}`}>
      {content && (
        <div className="dlg-inner">
          <div className="dlg-head">
            <p className="sci-kicker">{content.kicker}</p>
            <button type="button" className="dlg-close" onClick={onClose} aria-label={t.close} data-testid="button-dialog-close">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.4" /></svg>
            </button>
          </div>
          <h2 id="dlg-title">{content.title}</h2>
          <div className="dlg-blocks">
            {content.blocks.map((b, i) => (
              <section key={b.h}><span className="dlg-n">{String(i + 1).padStart(2, '0')}</span><h3>{b.h}</h3><p>{b.p}</p></section>
            ))}
          </div>
        </div>
      )}
    </dialog>
  );
}
