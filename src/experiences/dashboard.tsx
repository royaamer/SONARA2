type ScientificIndicator = {
  label: string;
  value: string;
  direction?: 'ltr';
  id?: string;
  eventKey?: string;
};

export function ScientificHud({ label, indicators, language }: { label: string; indicators: ScientificIndicator[]; language: string }) {
  return <dl className="scientific-hud" aria-label={label} lang={language} dir={language==='ar'?'rtl':'ltr'}>
    {indicators.map(card => <div key={card.label} className="scientific-hud-indicator">
      <dt>{card.label}</dt>
      <dd id={card.id} dir={card.direction}><span key={card.eventKey} className={card.eventKey?'scientific-hud-event':undefined}>{card.value}</span></dd>
    </div>)}
  </dl>;
}
