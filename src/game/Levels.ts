// ── Levels — board generation and chapter difficulty ──

import { createRng } from '../core/rng'
import { PASSAGES } from '../text/passages'
import { LANE_COUNT, isMarginLane } from '../utils/constants'
import type { LaneFontStyle, LaneOptions, TileOdds } from './Lane'

const STYLES: LaneFontStyle[] = ['regular', 'italic', 'medium', 'light', 'boldItalic', 'regular', 'bold']
const BASE_SPEEDS = [0, 48, 64, 80, 92, 78, 60, 46, 0]

export function speedMultiplier(chapter: number): number {
  return Math.min(1.9, 1 + (chapter - 1) * 0.075)
}

export function laneSpeed(index: number, chapter: number, jitter: number): number {
  if (isMarginLane(index)) return (index === 0 ? 150 : 165) * Math.min(1.5, speedMultiplier(chapter))
  return (BASE_SPEEDS[index] + jitter) * speedMultiplier(chapter)
}

export function tileOdds(chapter: number): TileOdds {
  const c = chapter - 1
  return {
    rate: Math.max(0.065, 0.088 - c * 0.003),
    blank: 0.02,
    DL: 0.065 + c * 0.004,
    TL: 0.032 + c * 0.003,
    DW: 0.026 + c * 0.003,
    TW: 0.01 + c * 0.0018,
  }
}

export interface BoardPlan {
  lanes: (LaneOptions & { jitter: number })[]
}

export function planBoard(seed: number): BoardPlan {
  const rng = createRng(seed)
  const order = PASSAGES.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  let cursor = 0
  const lanes: BoardPlan['lanes'] = []
  const styleShift = Math.floor(rng() * STYLES.length)
  for (let i = 0; i < LANE_COUNT; i++) {
    if (isMarginLane(i)) continue
    const parts: string[] = []
    for (let p = 0; p < 5; p++) parts.push(PASSAGES[order[cursor++ % order.length]])
    const jitter = Math.round((rng() - 0.5) * 14)
    lanes.push({
      index: i,
      seed,
      text: parts.join('   ·   ') + '   ·   ',
      fontSize: 17 + Math.floor(rng() * 4),
      style: STYLES[(i + styleShift) % STYLES.length],
      speed: laneSpeed(i, 1, jitter),
      direction: i % 2 === 0 ? 1 : -1,
      jitter,
    })
  }
  return { lanes }
}
