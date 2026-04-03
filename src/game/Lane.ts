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

    if (!this.isSafeZone) {
      this.stream = new TextStream(
        this.font,
        config.speed,
        config.direction,
        config.highlightRate,
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

    // Animate ornament scroll for safe zones
    if (this.isSafeZone) {
      this.ornamentOffset += dt * 15
    }
  }

  render(ctx: CanvasRenderingContext2D, playerLane: number, playerX: number): void {
    const centerY = this.y + this.height / 2

    if (this.isSafeZone) {
      this.renderSafeZone(ctx, centerY)
      return
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

        if (ch.isCollected) {
          // Dissolving — spiral upward with spin
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
          // Highlighted collectible — with scale and rotation
          ctx.save()
          ctx.translate(charCenterX, charCenterY)

          // Apply rotation and scale
          if (ch.rotation !== 0 || totalScale !== 1) {
            ctx.rotate(ch.rotation)
            ctx.scale(totalScale, totalScale)
          }

          // Pill background
          const padding = 2
          const pillH = this.config.fontSize + 4
          ctx.fillStyle = COLORS.goldFaint
          ctx.beginPath()
          ctx.roundRect(-ch.width / 2 - padding, -pillH / 2, ch.width + padding * 2, pillH, 3)
          ctx.fill()

          // Gold underline
          ctx.strokeStyle = COLORS.gold
          ctx.lineWidth = 1.5
          ctx.globalAlpha = 0.6
          ctx.beginPath()
          ctx.moveTo(-ch.width / 2, pillH / 2 - 1)
          ctx.lineTo(ch.width / 2, pillH / 2 - 1)
          ctx.stroke()

          // Letter
          ctx.globalAlpha = 1
          ctx.shadowColor = COLORS.goldGlow
          ctx.shadowBlur = 4 + (ch.scale - 1) * 10 // more glow when scaled up
          ctx.font = this.font
          ctx.fillStyle = COLORS.gold
          ctx.textAlign = 'center'
          ctx.fillText(ch.char, 0, 0)
          ctx.restore()
        } else {
          // ── Normal text — the showcase for ambient effects ──
          ctx.save()
          ctx.translate(charCenterX, charCenterY)

          // Interactive rotation + scale
          if (ch.rotation !== 0 || totalScale !== 1) {
            ctx.rotate(ch.rotation)
            ctx.scale(totalScale, totalScale)
          }

          // Alpha: combine interactive alpha, proximity brightening, and ink density
          const proximityAlpha = 0.55 + (ch.scale - 1) * 1.0
          ctx.globalAlpha = Math.min(1, ch.alpha * proximityAlpha * inkAlpha)
          ctx.font = this.font
          ctx.fillStyle = COLORS.sepia
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

  private renderSafeZone(ctx: CanvasRenderingContext2D, centerY: number): void {
    // Subtle background
    ctx.fillStyle = 'rgba(232, 224, 208, 0.3)'
    ctx.fillRect(0, this.y, GAME_WIDTH, this.height)

    // Ornamental divider
    const ornamentFont = CANVAS_FONTS.laneLight(14)
    ctx.font = ornamentFont
    ctx.fillStyle = COLORS.muted
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.globalAlpha = 0.5

    // Render repeating ornament pattern
    const pattern = this.index === 4
      ? FLOURISHES
      : ORNAMENTS

    const spacing = 40
    const startX = -(this.ornamentOffset % spacing)

    for (let x = startX; x < GAME_WIDTH + spacing; x += spacing) {
      const charIndex = Math.abs(Math.floor(x / spacing)) % pattern.length
      ctx.fillText(pattern[charIndex], x, centerY)
    }

    ctx.globalAlpha = 1
    ctx.textAlign = 'left'

    // Rules
    ctx.strokeStyle = COLORS.rule
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(30, this.y + 2)
    ctx.lineTo(GAME_WIDTH - 30, this.y + 2)
    ctx.moveTo(30, this.y + this.height - 2)
    ctx.lineTo(GAME_WIDTH - 30, this.y + this.height - 2)
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
