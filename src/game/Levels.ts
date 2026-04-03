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
  const timeLimit = 90 + (chapter - 1) * 30 // More time as chapters get harder

  const laneConfigs: LaneConfig[] = []

  for (let i = 0; i < LANE_COUNT; i++) {
    if (SAFE_ZONE_INDICES.includes(i)) {
      // Safe zones now scroll horizontally with icons - slightly different speeds for top/bottom
      const safeSpeed = i === 0 ? 22 : 28
      laneConfigs.push({
        index: i,
        speed: safeSpeed, 
        direction: i === 0 ? 1 : -1, // Alternate directions for variety
        fontSize: 18,
        fontStyle: 'regular',
        highlightRate: 0,
      })
      continue
    }

    // Alternate directions
    const direction: 1 | -1 = i % 2 === 0 ? 1 : -1

    // Vary speeds — middle lanes are faster, but add a guaranteed lane-specific offset 
    // so that every lane is distinctly different even at the same distance from center
    const distFromCenter = Math.abs(i - LANE_COUNT / 2)
    const speedVariance = (LANE_COUNT / 2 - distFromCenter) / (LANE_COUNT / 2)
    
    // Base speed + curve + per-lane jitter + small random factor
    const laneOffset = i * 2.5 
    const speed = (45 + speedVariance * 55 + laneOffset + Math.random() * 10) * speedMultiplier

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
