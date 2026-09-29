// ── Page curvature — the gentle rise and spine dip of an open book ──

import { GAME_WIDTH } from './constants'

function computeOffset(screenX: number): number {
  const center = GAME_WIDTH / 2
  const n = (screenX - center) / center // -1..1
  const arch = Math.sin(Math.min(1, Math.abs(n)) * Math.PI)
  const spineDip = Math.max(0, 1 - Math.abs(n * 8)) * 6
  return -arch * 5 + spineDip
}

const LUT_PAD = 200
const LUT = new Float32Array(GAME_WIDTH + LUT_PAD * 2 + 1)
for (let i = 0; i < LUT.length; i++) LUT[i] = computeOffset(i - LUT_PAD)

/** Vertical offset (px) for a point at screenX so content follows the page curve. */
export function curveY(screenX: number): number {
  const i = (screenX + LUT_PAD) | 0
  if (i < 0) return LUT[0]
  if (i >= LUT.length) return LUT[LUT.length - 1]
  return LUT[i]
}
