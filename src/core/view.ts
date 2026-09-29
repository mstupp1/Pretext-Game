// ── View — shared render scale (logical px → backing px) ──

export const view = {
  /** Backing-store pixels per logical pixel. */
  k: 1,
  reducedMotion: typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
}

/** Reset the context transform to the base logical space. */
export function resetTransform(ctx: CanvasRenderingContext2D): void {
  ctx.setTransform(view.k, 0, 0, view.k, 0, 0)
}
