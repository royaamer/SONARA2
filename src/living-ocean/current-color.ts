// Same transfer function as the existing OSCAR tracer renderer.
export const currentPosition=(speed:number)=>Math.max(0,Math.min(1,speed/1.6));
export function currentColor(speed: number, brightness = 1) {
  const strength = currentPosition(speed);
  const alpha = Math.max(.12, Math.min(.87, (.43 + .21 * strength) * brightness));
  return `rgba(${Math.round(40 + 52 * strength)},${Math.round(187 + 49 * strength)},${Math.round(185 + 51 * strength)},${alpha})`;
}
