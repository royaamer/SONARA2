import boundaries from './ocean-boundaries.json';

export const OCEAN_UNAVAILABLE = 'Ocean region unavailable';
type Position = number[];
// Natural Earth 1:10m marine polygons. Retain rings/holes and split antimeridian
// polygons. Marginal seas without an explicit parent basin remain unclassified.
// A 0.05-degree buffer rejects generalized coastlines and ambiguous boundaries.
function ringContains(ring: Position[], lon: number, lat: number) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i], [a, b] = ring[j];
    if ((y > lat) !== (b > lat) && lon < (a - x) * (lat - y) / (b - y) + x) inside = !inside;
  }
  return inside;
}
function nearRing(ring: Position[], lon: number, lat: number) {
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i], [a, b] = ring[j];
    // +/-180 edges are dataset seams rather than geographic boundaries.
    if (Math.abs(x) > 179.99 && Math.abs(a) > 179.99) continue;
    const dx = a - x, dy = b - y;
    const t = Math.max(0, Math.min(1, ((lon - x) * dx + (lat - y) * dy) / (dx * dx + dy * dy || 1)));
    if (Math.hypot(lon - x - t * dx, lat - y - t * dy) <= .05) return true;
  }
  return false;
}
export function oceanName(lon: number, lat: number): string {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) >= 90) return OCEAN_UNAVAILABLE;
  // Natural Earth's seam is slightly inset from 180 degrees.
  const longitude = Math.abs(lon) > 179.999 ? Math.sign(lon) * 179.999 : lon;
  const matches = new Set<string>();
  for (const region of boundaries) {
    for (const rings of region.polygons) {
      if (ringContains(rings[0], longitude, lat) && !rings.slice(1).some(r => ringContains(r, longitude, lat))) {
        if (rings.some(r => nearRing(r, longitude, lat))) return OCEAN_UNAVAILABLE;
        matches.add(region.name);
      }
    }
  }
  return matches.size === 1 ? [...matches][0] : OCEAN_UNAVAILABLE;
}
