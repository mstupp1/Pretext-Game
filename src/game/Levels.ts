// ── Levels — Level configuration ──

import { type LaneConfig } from './Lane'
import { LANE_COUNT, SAFE_ZONE_INDICES } from '../utils/constants'

export interface LevelConfig {
  chapter: number
  timeLimit: number
  laneConfigs: LaneConfig[]
}

const FONT_STYLES = ['light', 'regular', 'medium', 'bold', 'italic', 'boldItalic'] as const

export function generateLevel(chapter: number): LevelConfig {
  const speedMultiplier = 1 + (chapter - 1) * 0.15
  const baseHighlightRate = Math.max(0.03, 0.08 - (chapter - 1) * 0.005)
  const timeLimit = Math.max(60, 90 - (chapter - 1) * 3)

  const laneConfigs: LaneConfig[] = []

  for (let i = 0; i < LANE_COUNT; i++) {
    if (SAFE_ZONE_INDICES.includes(i)) {
      // Safe zones now scroll horizontally with icons
      laneConfigs.push({
        index: i,
        speed: 25, // Steady decorative speed
        direction: i === 0 ? 1 : -1, // Alternate directions for variety
        fontSize: 18,
        fontStyle: 'regular',
        highlightRate: 0,
      })
      continue
    }

    // Alternate directions
    const direction: 1 | -1 = i % 2 === 0 ? 1 : -1

    // Vary speeds — middle lanes are faster
    const distFromCenter = Math.abs(i - LANE_COUNT / 2)
    const speedVariance = (LANE_COUNT / 2 - distFromCenter) / (LANE_COUNT / 2)
    const speed = (40 + speedVariance * 60 + Math.random() * 20) * speedMultiplier

    // Vary font sizes and styles
    const fontSizeBase = 16 + Math.floor(Math.random() * 6)
    const styleIndex = (i + chapter) % FONT_STYLES.length
    const fontStyle = FONT_STYLES[styleIndex]

    laneConfigs.push({
      index: i,
      speed,
      direction,
      fontSize: fontSizeBase,
      fontStyle,
      highlightRate: baseHighlightRate + Math.random() * 0.02,
    })
  }

  return { chapter, timeLimit, laneConfigs }
}
