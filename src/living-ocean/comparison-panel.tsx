import { useEffect, useRef, useState } from 'react';
import type { MapPoint } from '../experiences/experience-dashboard';
import { OCEAN_ROOT } from './use-ocean';
import { sampleComparison, verifyComparisonCatalog, verifyComparisonMonth, type ComparisonCatalog, type ComparisonMonth } from './comparison';
import { drawComparisonChart } from './comparison-chart';
import './comparison.css';

const KEYS = Array.from({ length: 12 }, (_, i) => `2023-${String(i + 1).padStart(2, '0')}`);
export function OceanComparison({ point, month, onLoadMonth, available, ar }: {
  point: MapPoint | null; month: string; onLoadMonth: (month: string) => void; available: string[]; ar: boolean;
}) {
  const [open, setOpen] = useState(false), [attempt, setAttempt] = useState(0);
  const [catalog, setCatalog] = useState<ComparisonCatalog | null>(null), [data, setData] = useState<Map<string, ComparisonMonth>>(new Map());
  const [selected, setSelected] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null), toggle = useRef<HTMLButtonElement>(null);
  const location = point ?? { lon: -60, lat: 37 };
  const label = (key: string, short = false) => new Date(key + '-01T00:00:00Z').toLocaleDateString(ar ? 'ar' : 'en', { timeZone: 'UTC', month: short ? 'short' : 'long', ...(short ? {} : { year: 'numeric' }) });
  useEffect(() => {
    if (!open || data.size) return;
    const controller = new AbortController();
    const json = async (p: string) => { const r = await fetch(OCEAN_ROOT + 'comparison/' + p, { signal: controller.signal }); if (!r.ok) throw Error(p + ': HTTP ' + r.status); return r.json(); };
    setLoading(true); setError('');
    void (async () => {
      const c = verifyComparisonCatalog(await json('months.json')), ready = new Map<string, ComparisonMonth>();
      for (let i = 0; i < c.months.length; i += 3) {
        const batch = await Promise.all(c.months.slice(i, i + 3).map(async m => {
          try { return verifyComparisonMonth(m.month, c.grid, await json(encodeURIComponent(m.file))); }
          catch (e) { if (controller.signal.aborted) throw e; return null; }
        }));
        for (const item of batch) if (item) ready.set(item.month, item);
      }
      if (!ready.size) throw Error('No verified monthly OSCAR summaries available');
      if (!controller.signal.aborted) { setCatalog(c); setData(ready); setSelected(current => ready.has(current) ? current : ready.has(month) ? month : [...ready.keys()].sort()[0]); setLoading(false); }
    })().catch(e => { if (!controller.signal.aborted) { setError(String(e)); setLoading(false); } });
    return () => controller.abort();
  }, [open, attempt]);
  const values = KEYS.map(key => sampleComparison(data.get(key), location.lon, location.lat)?.speed ?? null);
  const base = sampleComparison(data.get(month), location.lon, location.lat), comparison = sampleComparison(data.get(selected), location.lon, location.lat);
  const supported = values.filter(Number.isFinite).length;
  const delta = base && comparison ? comparison.speed - base.speed : null;
  useEffect(() => { if (open && canvas.current && data.size) drawComparisonChart(canvas.current.getContext('2d')!, values, month, selected); }, [open, data, month, selected, location.lon, location.lat]);
  const number = (value: number | null | undefined) => Number.isFinite(value) ? value!.toFixed(3) + ' m/s' : '—';
  return <section className="ocean-comparison" onKeyDown={e => { if (e.key === 'Escape' && open) { setOpen(false); toggle.current?.focus(); } }}>
    <button ref={toggle} type="button" className="mc-button ocean-comparison-toggle" aria-controls="ocean-comparison-panel" aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? (ar ? 'إخفاء المقارنة' : 'Hide comparison') : (ar ? 'مقارنة المكان والزمن' : 'Ocean Space × Time Comparison')}</button>
    {open && <div id="ocean-comparison-panel" className="ocean-comparison-panel" aria-label="Compare ocean currents over time">
      <h2>{ar ? 'المكان × الزمن · موقع واحد' : 'Space × Time · one location'}</h2>
      <p className="comparison-position"><bdi dir="ltr">{Math.abs(location.lat).toFixed(1)}°{location.lat >= 0 ? 'N' : 'S'}, {Math.abs(location.lon).toFixed(1)}°{location.lon >= 0 ? 'E' : 'W'} · NASA OSCAR 2023</bdi>{!point && (ar ? ' · نقطة مرجعية في تيار الخليج؛ اختر موقعاً آخر على الخريطة للمقارنة' : ' · Gulf Stream reference point; select the map to compare another location')}</p>
      <p role="status">{error ? (ar ? 'تعذّر تحميل بيانات المقارنة' : 'Comparison data could not be loaded') : loading ? (ar ? 'تحميل الملخصات الشهرية الحقيقية…' : 'Loading real monthly OSCAR summaries…') : `${supported}/12 ${ar ? 'شهراً بأرصاد صالحة في هذا الموقع' : 'months have valid observations at this location'}`}{!loading && !error && !supported && (ar ? ' · لا بيانات صالحة؛ يابسة أو بيانات مفقودة' : ' · Empty / land or missing data')}</p>
      {error && <button type="button" className="mc-button" onClick={() => setAttempt(n => n + 1)}>{ar ? 'إعادة المحاولة' : 'Retry comparison'}</button>}
      <div className="comparison-key"><span>● {ar ? 'شهر الخريطة' : 'Current map month'}</span><span>○ {ar ? 'شهر المقارنة' : 'Comparison month'}</span></div>
      <canvas ref={canvas} className="comparison-chart" width={840} height={310} role="img" tabIndex={0} aria-label="Monthly mean surface-current speed in m/s. Click a month or use Left and Right arrow keys to compare." onClick={e => {
        const r = e.currentTarget.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 840;
        const index = Math.round(Math.max(0, Math.min(1, (x - 52) / (840 - 72))) * 11);
        if (data.has(KEYS[index])) setSelected(KEYS[index]);
      }} onKeyDown={e => {
        if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return; e.preventDefault();
        const keys = KEYS.filter(k => data.has(k)), index = keys.indexOf(selected);
        if (keys.length) setSelected(keys[Math.max(0, Math.min(keys.length - 1, index + (e.key === 'ArrowRight' ? 1 : -1)))]);
      }}/>
      <div className="comparison-months" aria-label="Choose comparison month">{KEYS.map(key => <button type="button" className="mc-button" key={key} data-month={key} aria-pressed={selected === key} aria-label={'Compare ' + label(key)} disabled={!data.has(key)} onClick={() => setSelected(key)}>{label(key, true)}</button>)}</div>
      <dl className="comparison-values" aria-live="polite"><div><dt>{ar ? 'شهر الخريطة' : 'Current map month'}</dt><dd data-testid="comparison-base">{month && label(month)} · {number(base?.speed)}</dd></div><div><dt>{ar ? 'شهر المقارنة' : 'Comparison month'}</dt><dd data-testid="comparison-selected">{selected && label(selected)} · {number(comparison?.speed)}</dd></div><div><dt>{ar ? 'الفرق: المقارنة ناقص الحالي' : 'Difference: comparison minus current'}</dt><dd data-testid="comparison-delta">{delta === null ? '—' : (delta >= 0 ? '+' : '') + number(delta)}</dd></div></dl>
      {comparison && <p className="comparison-coverage">{comparison.days}/{comparison.observationDays} {ar ? 'الحد الأدنى لعدد الأيام الصالحة عبر زوايا الاستيفاء الأربع · المتوسط شرقاً' : 'minimum valid-day count across the four interpolation corners · mean eastward'} {number(comparison.u)} · {ar ? 'المتوسط شمالاً' : 'mean northward'} {number(comparison.v)}</p>}
      {selected && selected !== month && available.includes(selected) && <button type="button" className="mc-button comparison-load" onClick={() => onLoadMonth(selected)}>{ar ? 'تحميل موسيقى الشهر المختار' : `Load ${label(selected)}'s full music`}</button>}
      <p>{ar ? 'متوسط السرعة الشهرية في هذا الموقع. يبقى المسار الصوتي إقليمياً ويعمل بصورة مستقلة.' : 'Monthly mean surface-current speed at this point. Select another map location for a geographic comparison. The soundtrack remains regional and plays separately.'}</p>
      <details><summary>{ar ? 'طريقة الحساب ومصدر البيانات' : 'Monthly statistic and source'}</summary><p>{catalog?.statistic}</p><p>{catalog?.missingRule}</p><p>{ar ? 'يستخدم الاستيفاء المكاني أربع زوايا صالحة من الشبكة. متوسط السرعة هو متوسط مقادير المتجهات اليومية، وليس مقدار المتجه المتوسط. تبقى الأرصاد المفقودة مفقودة.' : 'Spatial interpolation uses four valid grid corners. Mean speed is the mean of daily vector magnitudes; it is not the magnitude of the mean vector. Missing observations remain missing.'}</p><a href={OCEAN_ROOT + 'comparison/months.json'}>{ar ? 'فهرس المقارنة الأصلي من OSCAR' : 'Original OSCAR comparison catalog'}</a></details>
    </div>}
  </section>;
}
