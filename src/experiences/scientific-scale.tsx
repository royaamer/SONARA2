import type { ReactNode } from 'react';
export function ScientificScale({ title, gradient, ticks, children, measurement }: {
    measurement: {
        value: number | null;
        unit: string;
        position: number;
        color: string;
        label: string;
        minimum?: number;
        maximum?: number;
    };
    title: string;
    gradient: string;
    ticks: string[];
    children: ReactNode;
}) {
    const valid = measurement.value !== null && Number.isFinite(measurement.value);
    const saturated = valid && ((measurement.minimum !== undefined && measurement.value! < measurement.minimum) || (measurement.maximum !== undefined && measurement.value! > measurement.maximum));
    const readout = valid ? measurement.value!.toFixed(3) + ' ' + measurement.unit + (saturated ? ' / Scale saturated' : '') : 'No data';
    return <section className="scientific-scale" aria-label={title}>
    <h2>{title}</h2>
    <output className="scientific-scale-value" aria-live="off" aria-label={measurement.label + '. ' + readout}>{measurement.label} / {readout}</output>
    <div className="scientific-scale-track" dir="ltr">
      <div className="scientific-scale-indicator" aria-hidden="true">{valid && <span data-value={measurement.value} data-saturated={saturated} style={{left: Math.max(0, Math.min(1, measurement.position)) * 100 + '%'}}>{"\u25bc"}</span>}</div>
      <div className="scientific-scale-ramp" style={{background: gradient}} aria-hidden="true"/>
    </div>
    <div className="scientific-scale-ticks" dir="ltr">{ticks.map(tick => <span key={tick}>{tick}</span>)}</div>
    <div className="scientific-scale-description">{children}</div>
  </section>;
}
