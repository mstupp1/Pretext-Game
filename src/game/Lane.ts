// ── Lane — A single text stream lane in the game ──
// Enhanced with ambient typography, rotation, scaling, ripple waves, and lens effects

import { TextStream, type StreamChar } from '../text/TextStream'
import { COLORS, CANVAS_FONTS, GAME_WIDTH, LANE_HEIGHT, SAFE_ZONE_INDICES, ORNAMENTS, FLOURISHES } from '../utils/constants'
import { renderText } from '../text/TextEngine'

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
      ctx.fillRect(0, this.y, GAME_WIDTH, this.height)

      // Safe zone rules
      ctx.strokeStyle = COLORS.rule
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(30, this.y + 2)
      ctx.lineTo(GAME_WIDTH - 30, this.y + 2)
      ctx.moveTo(30, this.y + this.height - 2)
      ctx.lineTo(GAME_WIDTH - 30, this.y + this.height - 2)
      ctx.stroke()
    }

    // Subtle lane background
    if (this.index === playerLane) {
      ctx.fillStyle = 'rgba(184, 134, 11, 0.04)'
      ctx.fillRect(0, this.y, GAME_WIDTH, this.height)
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

        // Combine displacements: interactive + ambient
        const totalDx = ch.dx + shimmer + wordPulse
        const totalDy = ch.dy + undulation + rippleOffset

        const charCenterX = screenX + ch.width / 2 + totalDx
        const charCenterY = centerY + totalDy

        // Combined scale: interactive × ambient edge warp
        const totalScale = ch.scale * edgeScale
        
        const renderData = { ch, charCenterX, charCenterY, totalScale, inkAlpha }
        
        if (ch.isCollected || ch.isHighlighted) {
           topRenderChars.push(renderData)
        } else {
           normalRenderChars.push(renderData)
        }
      }

      // First Pass: Normal background text
      for (const { ch, charCenterX, charCenterY, totalScale, inkAlpha } of normalRenderChars) {
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
        
        ctx.globalAlpha = Math.min(1, ch.alpha * proximityAlpha * inkAlpha)
        
        ctx.font = this.font
        ctx.fillStyle = COLORS.sepia
        ctx.textAlign = 'center'
        ctx.fillText(ch.char, 0, 0)
        ctx.restore()
      }

      // Second Pass: Highlighted and Collected text
      for (const { ch, charCenterX, charCenterY, totalScale, inkAlpha } of topRenderChars) {
        if (ch.isCollected) {
          ctx.save()
          ctx.globalAlpha = ch.alpha
          ctx.translate(charCenterX, charCenterY)
          ctx.rotate(ch.rotation)
          ctx.scale(totalScale, totalScale)
          ctx.font = this.font
          ctx.fillStyle = COLORS.gold
          ctx.fillText(ch.char, -ch.width / 2, 0)
          ctx.restore()
        } else if (ch.isHighlighted) {
          ctx.save()
          ctx.translate(charCenterX, charCenterY)
          
          const isLifted = ch.scale > 1.05
          // High baseline (0.75) helps player search for letters across the board
          const proximityAlpha = isLifted ? 1.0 : Math.min(1, 0.75 + (ch.scale - 1) * 1.0)
          const baseAlpha = Math.min(1, ch.alpha * proximityAlpha)
          
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

          const padding = 3
          const pillH = this.config.fontSize + 6
          
          // Interpolate visual strength based on cursor proximity (scale 1.0 -> 2.5)
          const interactionStrength = Math.min(1, Math.max(0, (ch.scale - 1) / 1.5))
          
          // Background mask smoothly transitions from semi-transparent (0.4) to fully opaque (1.0)
          ctx.globalAlpha = Math.min(1, baseAlpha * (0.4 + interactionStrength * 0.6))
          ctx.fillStyle = COLORS.ivory
          ctx.beginPath()
          ctx.roundRect(-ch.width / 2 - padding, -pillH / 2, ch.width + padding * 2, pillH, 3)
          ctx.fill()

          // Gold tint smoothly increases in intensity
          ctx.fillStyle = `rgba(184, 134, 11, ${0.1 + interactionStrength * 0.25})`
          ctx.fill()

          ctx.shadowColor = 'transparent'

          // Gold underline smoothly transitions
          ctx.strokeStyle = COLORS.gold
          ctx.lineWidth = 1.5 + interactionStrength * 0.5 // slightly thicker at peak
          ctx.globalAlpha = Math.min(1, baseAlpha * (0.6 + interactionStrength * 0.4))
          ctx.beginPath()
          ctx.moveTo(-ch.width / 2 - 1, pillH / 2 - 1)
          ctx.lineTo(ch.width / 2 + 1, pillH / 2 - 1)
          ctx.stroke()

          // Text with glow
          ctx.globalAlpha = baseAlpha
          ctx.shadowColor = COLORS.gold
          ctx.shadowBlur = 6 + (ch.scale - 1) * 12
          ctx.font = this.font
          ctx.fillStyle = COLORS.gold
          ctx.textAlign = 'center'
          ctx.fillText(ch.char, 0, 0)
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
    ctx.moveTo(0, this.y + this.height)
    ctx.lineTo(GAME_WIDTH, this.y + this.height)
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
