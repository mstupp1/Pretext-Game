// ── Lane — A single text stream lane in the game ──
// Enhanced with ambient typography, rotation, scaling, ripple waves, and lens effects

import { TextStream, type StreamChar, getPageCurvatureOffset } from '../text/TextStream'
import { COLORS, CANVAS_FONTS, FONTS, GAME_WIDTH, LANE_HEIGHT, SAFE_ZONE_INDICES, ORNAMENTS, FLOURISHES } from '../utils/constants'
import { renderText } from '../text/TextEngine'
import { getLetterValue } from './Scoring'

export interface LaneConfig {
  index: number
  speed: number
  direction: 1 | -1
  fontSize: number
  fontStyle: 'light' | 'regular' | 'medium' | 'bold' | 'italic' | 'boldItalic'
  highlightRate: number
}

export class Lane {
  public index: number
  public stream: TextStream | null = null
  public y: number
  public height: number = LANE_HEIGHT
  public isSafeZone: boolean

  private config: LaneConfig
  private ornamentOffset: number = 0
  private font: string

  constructor(config: LaneConfig, yPosition: number) {
    this.config = config
    this.index = config.index
    this.y = yPosition
    this.isSafeZone = SAFE_ZONE_INDICES.includes(config.index)

    if (this.isSafeZone) {
      // Safe zones are now continuously scrolling icon streams
      this.font = CANVAS_FONTS.icons(18)
      this.stream = new TextStream(
        this.font,
        config.speed, // Scroll at the specified decorative speed
        config.direction,
        0, // No highlight/collectibles
        true // isIconStream
      )
    } else {
      // Build the canvas font string
      const fontBuilder = {
        light: CANVAS_FONTS.laneLight,
        regular: CANVAS_FONTS.laneRegular,
        medium: CANVAS_FONTS.laneMedium,
        bold: CANVAS_FONTS.laneBold,
        italic: CANVAS_FONTS.laneItalic,
        boldItalic: CANVAS_FONTS.laneBoldItalic,
      }[config.fontStyle]

      this.font = fontBuilder(config.fontSize)

      this.stream = new TextStream(
        this.font,
        config.speed,
        config.direction,
        config.highlightRate,
        false
      )
    }
  }

  update(dt: number, playerX: number, playerY: number): void {
    if (this.stream) {
      this.stream.update(dt)
      // Use the enhanced effects system — pass full player position
      const isPlayerLane = Math.abs(playerY - (this.y + this.height / 2)) < this.height / 2
      this.stream.applyPlayerEffects(playerX, playerY, this.y + this.height / 2, GAME_WIDTH, isPlayerLane)
    }
  }

  render(ctx: CanvasRenderingContext2D, playerLane: number, playerX: number): void {
    const centerY = this.y + this.height / 2

    if (this.isSafeZone) {
      // Subtle background for safe zones
      ctx.fillStyle = 'rgba(232, 224, 208, 0.3)'
      ctx.beginPath()
      for (let x = 0; x <= GAME_WIDTH; x += 10) {
        const offset = getPageCurvatureOffset(x, GAME_WIDTH)
        if (x === 0) ctx.moveTo(x, this.y + offset)
        else ctx.lineTo(x, this.y + offset)
      }
      for (let x = GAME_WIDTH; x >= 0; x -= 10) {
        const offset = getPageCurvatureOffset(x, GAME_WIDTH)
        ctx.lineTo(x, this.y + this.height + offset)
      }
      ctx.closePath()
      ctx.fill()

      // Safe zone rules
      ctx.strokeStyle = COLORS.rule
      ctx.lineWidth = 0.5
      ctx.beginPath()
      for (let x = 30; x <= GAME_WIDTH - 30; x += 10) {
        const offset = getPageCurvatureOffset(x, GAME_WIDTH)
        if (x === 30) ctx.moveTo(x, this.y + 2 + offset)
        else ctx.lineTo(x, this.y + 2 + offset)
      }
      for (let x = 30; x <= GAME_WIDTH - 30; x += 10) {
        const offset = getPageCurvatureOffset(x, GAME_WIDTH)
        if (x === 30) ctx.moveTo(x, this.y + this.height - 2 + offset)
        else ctx.lineTo(x, this.y + this.height - 2 + offset)
      }
      ctx.stroke()
    }

    // Subtle lane background
    if (this.index === playerLane) {
      ctx.fillStyle = 'rgba(184, 134, 11, 0.04)'
      ctx.beginPath()
      for (let x = 0; x <= GAME_WIDTH; x += 10) {
        const offset = getPageCurvatureOffset(x, GAME_WIDTH)
        if (x === 0) ctx.moveTo(x, this.y + offset)
        else ctx.lineTo(x, this.y + offset)
      }
      for (let x = GAME_WIDTH; x >= 0; x -= 10) {
        const offset = getPageCurvatureOffset(x, GAME_WIDTH)
        ctx.lineTo(x, this.y + this.height + offset)
      }
      ctx.closePath()
      ctx.fill()
    }

    // Render text stream with full effects
    if (this.stream) {
      const visible = this.stream.getVisibleChars(GAME_WIDTH)

      ctx.textBaseline = 'middle'

      const normalRenderChars: any[] = []
      const topRenderChars: any[] = []

      for (const { char: ch, screenX } of visible) {
        if (ch.alpha <= 0) continue

        // ── Compute all ambient offsets ──
        const undulation = this.stream.getUndulationOffset(ch, screenX)
        const shimmer = this.stream.getShimmerOffset(ch)
        const wordPulse = this.stream.getWordPulseOffset(ch)
        const edgeScale = this.stream.getEdgeScale(screenX, GAME_WIDTH)
        const inkAlpha = this.stream.getInkAlpha(ch)
        const rippleOffset = this.stream.getRippleOffset(ch)
        const pageCurvature = this.stream.getPageCurvatureOffset(screenX, GAME_WIDTH)

        // Combine displacements: interactive + ambient
        const totalDx = ch.dx + shimmer + wordPulse
        const totalDy = ch.dy + undulation + rippleOffset + pageCurvature

        const charCenterX = screenX + ch.width / 2 + totalDx
        const charCenterY = centerY + totalDy

        // Combined scale: interactive × ambient edge warp
        const totalScale = ch.scale * edgeScale
        const edgeFade = this.stream.getEdgeFade(screenX, GAME_WIDTH)
        
        const renderData = { ch, charCenterX, charCenterY, totalScale, inkAlpha, edgeFade }
        
        if (ch.isCollected || ch.isHighlighted) {
           topRenderChars.push(renderData)
        } else {
           normalRenderChars.push(renderData)
        }
      }

      // First Pass: Normal background text
      for (const { ch, charCenterX, charCenterY, totalScale, inkAlpha, edgeFade } of normalRenderChars) {
        ctx.save()
        ctx.translate(charCenterX, charCenterY)

        if (ch.rotation !== 0 || totalScale !== 1) {
          ctx.rotate(ch.rotation)
          ctx.scale(totalScale, totalScale)
        }

        if (ch.scale > 1.05) {
          const depth = (ch.scale - 1) * 15
          ctx.shadowColor = COLORS.shadow
          ctx.shadowBlur = depth * 1.5
          ctx.shadowOffsetX = 0
          ctx.shadowOffsetY = depth
        }

        const isLifted = ch.scale > 1.05
        const proximityAlpha = isLifted ? 1.0 : (0.55 + (ch.scale - 1) * 1.0)
        
        ctx.globalAlpha = Math.min(1, ch.alpha * proximityAlpha * inkAlpha * edgeFade)
        
        ctx.font = this.font
        ctx.fillStyle = COLORS.sepia
        ctx.textAlign = 'center'
        ctx.fillText(ch.char, 0, 0)
        ctx.restore()
      }

      // Second Pass: Highlighted and Collected text
      for (const { ch, charCenterX, charCenterY, totalScale, inkAlpha, edgeFade } of topRenderChars) {
        if (ch.isCollected) {
          ctx.save()
          ctx.globalAlpha = ch.alpha * edgeFade
          ctx.translate(charCenterX, charCenterY)
          ctx.rotate(ch.rotation)
          ctx.scale(totalScale, totalScale)
          ctx.font = this.font

          let footprintColor: string = COLORS.gold
          if (ch.multiplierType === 'DoubleLetter') footprintColor = COLORS.dlLight
          else if (ch.multiplierType === 'TripleLetter') footprintColor = COLORS.tlBlue
          else if (ch.multiplierType === 'DoubleWord') footprintColor = COLORS.dwCoral
          else if (ch.multiplierType === 'TripleWord') footprintColor = COLORS.twRed

          ctx.fillStyle = footprintColor
          ctx.fillText(ch.char, -ch.width / 2, 0)
          ctx.restore()
        } else if (ch.isHighlighted) {
          ctx.save()
          ctx.translate(charCenterX, charCenterY)
          
          const isLifted = ch.scale > 1.05
          const proximityAlpha = isLifted ? 1.0 : Math.min(1, 0.75 + (ch.scale - 1) * 1.0)
          const baseAlpha = Math.min(1, ch.alpha * proximityAlpha) * edgeFade
          
          ctx.globalAlpha = baseAlpha

          if (ch.rotation !== 0 || totalScale !== 1) {
            ctx.rotate(ch.rotation)
            ctx.scale(totalScale, totalScale)
          }

          if (ch.scale > 1.05) {
            const depth = (ch.scale - 1) * 15
            ctx.shadowColor = COLORS.shadow
            ctx.shadowBlur = depth * 1.5
            ctx.shadowOffsetX = 0
            ctx.shadowOffsetY = depth
          }

          // Compute tile dimensions
          const interactionStrength = Math.min(1, Math.max(0, (ch.scale - 1) / 1.5))
          const padding = 4 + interactionStrength * 2
          const tileW = ch.width + padding * 2
          const tileH = this.config.fontSize + padding * 2
          const borderRadius = 4
          
          // 1. Draw Tile Shadow
          if (ch.scale > 1.1) {
            ctx.shadowColor = COLORS.shadow
            ctx.shadowBlur = 4 + (ch.scale - 1) * 10
            ctx.shadowOffsetY = 2 + (ch.scale - 1) * 4
          }
          
          // 2. Draw Tile Background
          // transition background from faint gold to solid gold based on focus
          const bgAlpha = Math.min(1, 0.4 + interactionStrength * 0.6)
          let baseColor = `rgba(184, 134, 11, ${bgAlpha * baseAlpha})`
          let borderColor = `rgba(154, 114, 9, ${baseAlpha})` // #9A7209
          let depthColor = 'rgba(100, 70, 20, 0.4)'

          const colorT = Math.min(1, Math.max(0, interactionStrength * 1.2))
          // Interpolate standard gold to ivory for regular tiles
          const r = Math.round(184 + colorT * (245 - 184))
          const g = Math.round(134 + colorT * (241 - 134))
          const b = Math.round(11 + colorT * (232 - 11))
          let charColor = `rgb(${r}, ${g}, ${b})`

          if (ch.multiplierType === 'DoubleLetter') {
            baseColor = `rgba(160, 196, 255, ${bgAlpha * baseAlpha})` // dlLight
            borderColor = `rgba(122, 162, 221, ${baseAlpha})`
            depthColor = 'rgba(100, 140, 200, 0.4)'
            charColor = `rgba(44, 24, 16, ${colorT})`
          } else if (ch.multiplierType === 'TripleLetter') {
            baseColor = `rgba(74, 144, 226, ${bgAlpha * baseAlpha})` // tlBlue
            borderColor = `rgba(53, 122, 189, ${baseAlpha})`
            depthColor = 'rgba(50, 100, 180, 0.4)'
            charColor = `rgba(245, 241, 232, ${colorT})`
          } else if (ch.multiplierType === 'DoubleWord') {
            baseColor = `rgba(255, 154, 162, ${bgAlpha * baseAlpha})` // dwCoral
            borderColor = `rgba(221, 120, 128, ${baseAlpha})`
            depthColor = 'rgba(200, 100, 110, 0.4)'
            charColor = `rgba(44, 24, 16, ${colorT})`
          } else if (ch.multiplierType === 'TripleWord') {
            baseColor = `rgba(208, 0, 0, ${bgAlpha * baseAlpha})` // twRed
            borderColor = `rgba(158, 0, 0, ${baseAlpha})`
            depthColor = 'rgba(150, 0, 0, 0.4)'
            charColor = `rgba(245, 241, 232, ${colorT})`
          }

          ctx.fillStyle = baseColor
          ctx.beginPath()
          ctx.roundRect(-tileW / 2, -tileH / 2, tileW, tileH, borderRadius)
          ctx.fill()

          // 3. Draw Tile Border (3D effect)
          ctx.shadowBlur = 0
          ctx.shadowOffsetY = 0

          // Bottom "depth" part of the tile — consistent 3px depth regardless of scale
          const visualDepth = 3
          const depth = visualDepth / totalScale
          ctx.fillStyle = depthColor
          ctx.beginPath()
          ctx.roundRect(-tileW / 2, tileH / 2 - depth, tileW, depth, [0, 0, borderRadius, borderRadius])
          ctx.fill()

          ctx.strokeStyle = borderColor
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.roundRect(-tileW / 2, -tileH / 2, tileW, tileH, borderRadius)
          ctx.stroke()

          // 4. Draw Tile Surface Shine (Subtle)
          const shineGradient = ctx.createLinearGradient(-tileW/2, -tileH/2, tileW/2, tileH/2)
          shineGradient.addColorStop(0, 'rgba(255, 255, 255, 0.15)')
          shineGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0)')
          shineGradient.addColorStop(1, 'rgba(0, 0, 0, 0.05)')
          ctx.fillStyle = shineGradient
          ctx.fill()

          // 5. Draw the main Character
          ctx.font = this.font
          ctx.fillStyle = charColor
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(ch.char, 0, -1) // nudge up slightly for 3D feel

          // 6. Draw the Point Value (Bottom-Right)
          const points = getLetterValue(ch.char)
          if (points > 0) {
            const pointsFontSize = Math.max(9, this.config.fontSize * 0.4)
            ctx.font = `800 ${pointsFontSize}px ${FONTS.ui}`
            ctx.textAlign = 'right'
            ctx.textBaseline = 'bottom'
            // Points fade in with focus
            ctx.globalAlpha = baseAlpha * Math.min(1, interactionStrength * 2)
            ctx.fillStyle = charColor
            ctx.fillText(String(points), tileW / 2 - 3, tileH / 2 - 2)
          }

          ctx.restore()
        }
      }

      // Reset text align
      ctx.textAlign = 'left'
    }

    // Lane separator (thin rule)
    ctx.strokeStyle = COLORS.rule
    ctx.lineWidth = 0.5
    ctx.beginPath()
    for (let x = 0; x <= GAME_WIDTH; x += 10) {
      const offset = getPageCurvatureOffset(x, GAME_WIDTH)
      if (x === 0) ctx.moveTo(x, this.y + this.height + offset)
      else ctx.lineTo(x, this.y + this.height + offset)
    }
    ctx.stroke()
  }


  // Trigger ripple on this lane
  triggerRipple(playerX: number): void {
    if (this.stream) {
      this.stream.triggerRipple(playerX, GAME_WIDTH)
    }
  }

  // Find collectible character near player position
  findCollectibleNear(playerX: number): StreamChar | null {
    if (!this.stream) return null
    return this.stream.findCollectibleAt(playerX, GAME_WIDTH)
  }
}
