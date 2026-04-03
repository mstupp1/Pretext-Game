// ── Lane — A single text stream lane in the game ──

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

  update(dt: number, playerX: number): void {
    if (this.stream) {
      this.stream.update(dt)
      this.stream.applyPlayerRepulsion(playerX, GAME_WIDTH)
    }

    // Animate ornament scroll for safe zones
    if (this.isSafeZone) {
      this.ornamentOffset += dt * 15
    }
  }

  render(ctx: CanvasRenderingContext2D, playerLane: number): void {
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

    // Render text stream
    if (this.stream) {
      const visible = this.stream.getVisibleChars(GAME_WIDTH)

      ctx.font = this.font
      ctx.textBaseline = 'middle'

      for (const { char: ch, screenX } of visible) {
        if (ch.alpha <= 0) continue

        const charCenterX = screenX + ch.width / 2
        const charCenterY = centerY + ch.dy

        if (ch.isCollected) {
          // Dissolving effect
          ctx.save()
          ctx.globalAlpha = ch.alpha
          ctx.translate(charCenterX, charCenterY)
          ctx.scale(ch.scale, ch.scale)
          ctx.fillStyle = COLORS.gold
          ctx.fillText(ch.char, -ch.width / 2, 0)
          ctx.restore()
        } else if (ch.isHighlighted) {
          // Highlighted collectible letter — subtle gold underline + tint
          ctx.save()

          // Small pill background
          const padding = 2
          const pillH = this.config.fontSize + 4
          const pillY = charCenterY - pillH / 2
          ctx.fillStyle = COLORS.goldFaint
          ctx.beginPath()
          ctx.roundRect(screenX - padding, pillY, ch.width + padding * 2, pillH, 3)
          ctx.fill()

          // Gold underline
          ctx.strokeStyle = COLORS.gold
          ctx.lineWidth = 1.5
          ctx.globalAlpha = 0.6
          ctx.beginPath()
          ctx.moveTo(screenX, charCenterY + pillH / 2 - 1)
          ctx.lineTo(screenX + ch.width, charCenterY + pillH / 2 - 1)
          ctx.stroke()

          // Letter
          ctx.globalAlpha = 1
          ctx.shadowColor = COLORS.goldGlow
          ctx.shadowBlur = 4
          ctx.fillStyle = COLORS.gold
          ctx.fillText(ch.char, screenX, charCenterY)
          ctx.restore()
        } else {
          // Normal text
          ctx.save()
          if (ch.dy !== 0) {
            ctx.translate(0, ch.dy)
          }
          ctx.globalAlpha = ch.alpha * 0.75
          ctx.fillStyle = COLORS.sepia
          ctx.fillText(ch.char, screenX, centerY)
          ctx.restore()
        }
      }
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

  // Find collectible character near player position
  findCollectibleNear(playerX: number): StreamChar | null {
    if (!this.stream) return null
    return this.stream.findCollectibleAt(playerX, GAME_WIDTH)
  }
}
