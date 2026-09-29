export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const smoothstep = (t: number): number => {
  const c = clamp(t, 0, 1)
  return c * c * (3 - 2 * c)
}
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp(t, 0, 1), 3)
export const easeInOutCubic = (t: number): number => {
  const c = clamp(t, 0, 1)
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2
}
export const easeOutBack = (t: number): number => {
  const c = clamp(t, 0, 1)
  const s = 1.70158
  return 1 + (s + 1) * Math.pow(c - 1, 3) + s * Math.pow(c - 1, 2)
}
/** Frame-rate independent exponential approach factor. */
export const damp = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt)
