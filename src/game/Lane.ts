// ── Lane — A single text stream lane in the game ──
// Enhanced with ambient typography, rotation, scaling, ripple waves, and lens effects

import { TextStream, type StreamChar, getPageCurvatureOffset } from '../text/TextStream'
import { COLORS, CANVAS_FONTS, FONTS, GAME_WIDTH, LANE_HEIGHT, REGULAR_TILE_STYLE, SAFE_ZONE_INDICES, ORNAMENTS, FLOURISHES, PowerUpType } from '../utils/constants'
import { measureTextWidth, renderText } from '../text/TextEngine'
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
  private safeZoneFillPath: Path2D | null = null
  private safeZoneRulePath: Path2D | null = null
  private playerLaneFillPath: Path2D | null = null
  private separatorPath: Path2D
  private pointsFont: string
  private tileShineGradientCache: Map<string, CanvasGradient> = new Map()
  private effectsActive: boolean = false
  private resolveLetterValue: (letter: string) => number = getLetterValue

  constructor(config: LaneConfig, yPosition: number) {
    this.config = config
    this.index = config.index
    this.y = yPosition
    this.isSafeZone = SAFE_ZONE_INDICES.includes(config.index)
    this.separatorPath = this.createCurvedLinePath(0, GAME_WIDTH, this.y + this.height)
    this.playerLaneFillPath = this.createCurvedFillPath(0, GAME_WIDTH, this.y, this.y + this.height)
    this.pointsFont = this.buildPointsFont(config.fontSize)
    if (this.isSafeZone) {
      this.safeZoneFillPath = this.createCurvedFillPath(0, GAME_WIDTH, this.y, this.y + this.height)
      this.safeZoneRulePath = this.createSafeZoneRulePath()
    }

    if (this.isSafeZone) {
      // Safe zones are now continuously scrolling icon streams
      this.font = CANVAS_FONTS.icons(18)
      this.stream = new TextStream(
        this.font,
        config.speed, // Scroll at the specified decorative speed
        config.direction,
        0, // No highlight/collectibles
        'powerup'
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
        'text'
      )
    }
  }

  updateConfig(newConfig: LaneConfig): void {
    if (this.stream) {
      this.stream.setSpeed(newConfig.speed)
      this.stream.setDirection(newConfig.direction)
      this.stream.setHighlightRate(newConfig.highlightRate)

      if (this.isSafeZone) {
        this.config = {
          ...this.config,
          speed: newConfig.speed,
          direction: newConfig.direction,
          highlightRate: newConfig.highlightRate,
        }
        return
      }
    }

    // Preserve the existing measured typography during chapter transitions so
    // the stream contents and scroll positions continue uninterrupted.
    this.config = {
      ...this.config,
      speed: newConfig.speed,
      direction: newConfig.direction,
      highlightRate: newConfig.highlightRate,
    }
  }

  setMotionScale(scale: number): void {
    this.stream?.setMotionScale(scale)
  }

  setLetterValueResolver(resolver: (letter: string) => number): void {
    this.resolveLetterValue = resolver
  }

  update(dt: number, playerX: number, playerY: number): void {
    if (this.stream) {
      this.stream.update(dt, GAME_WIDTH)
      const laneCenterY = this.y + this.height / 2
      const distToLane = Math.abs(playerY - laneCenterY)
      const isPlayerLane = distToLane < this.height / 2
      const laneProximity = Math.max(0, 1 - distToLane / 200)
      const shouldApplyEffects = isPlayerLane || laneProximity > 0.2

      if (shouldApplyEffects) {
        this.effectsActive = true
        this.stream.applyPlayerEffects(playerX, playerY, laneCenterY, GAME_WIDTH, isPlayerLane)
      } else if (this.effectsActive) {
        this.effectsActive = false
        this.stream.resetPlayerEffects()
      }
    }
  }

  renderBase(ctx: CanvasRenderingContext2D, playerLane: number, playerX: number): void {
    const centerY = this.y + this.height / 2

    if (this.isSafeZone) {
      // Subtle background for safe zones
      ctx.fillStyle = 'rgba(232, 224, 208, 0.3)'
      if (this.safeZoneFillPath) ctx.fill(this.safeZoneFillPath)

      // Safe zone rules
      ctx.strokeStyle = COLORS.rule
      ctx.lineWidth = 0.5
      if (this.safeZoneRulePath) ctx.stroke(this.safeZoneRulePath)
    }

    // Subtle lane background
    if (this.index === playerLane) {
      ctx.fillStyle = 'rgba(184, 134, 11, 0.04)'
      if (this.playerLaneFillPath) ctx.fill(this.playerLaneFillPath)
    }

    // Lane separator should sit behind lifted/focused letters.
    ctx.strokeStyle = COLORS.rule
    ctx.lineWidth = 0.5
    ctx.stroke(this.separatorPath)

    // Render text stream with full effects
    if (this.stream) {
      const visible = this.stream.getVisibleChars(GAME_WIDTH)

      ctx.textBaseline = 'middle'
      ctx.textAlign = 'center'
      ctx.font = this.font

      for (const { char: ch, screenX } of visible) {
        if (ch.alpha <= 0 || ch.isCollected || ch.isHighlighted) continue
        this.renderNormalChar(ctx, ch, screenX, centerY)
      }

      // Reset text align
      ctx.textAlign = 'left'
    }
  }

  renderTopLayer(ctx: CanvasRenderingContext2D): void {
    this.renderTopLayerByFocus(ctx, false)
  }

  renderFocusedTopLayer(ctx: CanvasRenderingContext2D): void {
    this.renderTopLayerByFocus(ctx, true)
  }

  private renderTopLayerByFocus(ctx: CanvasRenderingContext2D, focusedOnly: boolean): void {
    if (!this.stream) return

    const centerY = this.y + this.height / 2
    const visible = this.stream.getVisibleChars(GAME_WIDTH)
    const currentTimeMs = performance.now()

    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.font = this.font

    for (const { char: ch, screenX } of visible) {
      if (ch.alpha <= 0 || (!ch.isCollected && !ch.isHighlighted)) continue
      const isFocused = !ch.isCollected && ch.scale > 1.42
      if (focusedOnly !== isFocused) continue
      this.renderTopChar(ctx, ch, screenX, centerY, currentTimeMs)
    }

    ctx.textAlign = 'left'
  }


  // Trigger ripple on this lane
  triggerRipple(playerX: number, amplitude?: number): void {
    if (this.stream) {
      this.stream.triggerRipple(playerX, GAME_WIDTH, amplitude)
    }
  }

  // Find collectible character near player position
  findCollectibleNear(playerX: number): StreamChar | null {
    if (!this.stream) return null
    return this.stream.findCollectibleAt(playerX, GAME_WIDTH)
  }

  private createCurvedLinePath(startX: number, endX: number, y: number): Path2D {
    const path = new Path2D()
    for (let x = startX; x <= endX; x += 10) {
      const offset = getPageCurvatureOffset(x, GAME_WIDTH)
      if (x === startX) path.moveTo(x, y + offset)
      else path.lineTo(x, y + offset)
    }
    return path
  }

  private createCurvedFillPath(startX: number, endX: number, topY: number, bottomY: number): Path2D {
    const path = new Path2D()
    for (let x = startX; x <= endX; x += 10) {
      const offset = getPageCurvatureOffset(x, GAME_WIDTH)
      if (x === startX) path.moveTo(x, topY + offset)
      else path.lineTo(x, topY + offset)
    }
    for (let x = endX; x >= startX; x -= 10) {
      const offset = getPageCurvatureOffset(x, GAME_WIDTH)
      path.lineTo(x, bottomY + offset)
    }
    path.closePath()
    return path
  }

  private createSafeZoneRulePath(): Path2D {
    const path = new Path2D()
    path.addPath(this.createCurvedLinePath(30, GAME_WIDTH - 30, this.y + 2))
    path.addPath(this.createCurvedLinePath(30, GAME_WIDTH - 30, this.y + this.height - 2))
    return path
  }

  private renderNormalChar(ctx: CanvasRenderingContext2D, ch: StreamChar, screenX: number, centerY: number): void {
    if (!this.stream) return

    const undulation = this.stream.getUndulationOffset(ch, screenX)
    const shimmer = this.stream.getShimmerOffset(ch)
    const wordPulse = this.stream.getWordPulseOffset(ch)
    const rippleOffset = this.stream.getRippleOffset(ch)
    const pageCurvature = this.stream.getPageCurvatureOffset(screenX, GAME_WIDTH)
    const edgeScale = this.stream.getEdgeScale(screenX, GAME_WIDTH)
    const inkAlpha = this.stream.getInkAlpha(ch)
    const edgeFade = this.stream.getEdgeFade(screenX, GAME_WIDTH)
    const totalScale = ch.scale * edgeScale
    const charCenterX = screenX + ch.width / 2 + ch.dx + shimmer + wordPulse
    const charCenterY = centerY + ch.dy + undulation + rippleOffset + pageCurvature

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
    ctx.fillStyle = this.getNormalTextColor(ch)
    ctx.fillText(ch.char, 0, 0)
    ctx.restore()
  }

  private renderTopChar(
    ctx: CanvasRenderingContext2D,
    ch: StreamChar,
    screenX: number,
    centerY: number,
    currentTimeMs: number,
  ): void {
    if (!this.stream) return

    const undulation = this.stream.getUndulationOffset(ch, screenX)
    const shimmer = this.stream.getShimmerOffset(ch)
    const wordPulse = this.stream.getWordPulseOffset(ch)
    const rippleOffset = this.stream.getRippleOffset(ch)
    const pageCurvature = this.stream.getPageCurvatureOffset(screenX, GAME_WIDTH)
    const edgeScale = this.stream.getEdgeScale(screenX, GAME_WIDTH)
    const edgeFade = this.stream.getEdgeFade(screenX, GAME_WIDTH)
    const totalScale = ch.scale * edgeScale
    const charCenterX = screenX + ch.width / 2 + ch.dx + shimmer + wordPulse
    const charCenterY = centerY + ch.dy + undulation + rippleOffset + pageCurvature

    if (ch.isCollected) {
      ctx.save()
      ctx.globalAlpha = ch.alpha * edgeFade
      ctx.translate(charCenterX, charCenterY)
      ctx.rotate(ch.rotation)
      ctx.scale(totalScale, totalScale)
      ctx.fillStyle = this.getCollectedTextColor(ch)
      ctx.fillText(ch.char, -ch.width / 2, 0)
      ctx.restore()
      return
    }

    if (ch.powerUpType !== 'None') {
      this.renderPowerUpChar(ctx, ch, charCenterX, charCenterY, totalScale, edgeFade)
      return
    }

    ctx.save()
    ctx.translate(charCenterX, charCenterY)

    const isLifted = ch.scale > 1.05
    const isFocused = ch.scale > 1.42
    const proximityAlpha = isLifted ? 1.0 : Math.min(1, 0.75 + (ch.scale - 1) * 1.0)
    const baseAlpha = (isFocused ? 1 : Math.min(1, ch.alpha * proximityAlpha)) * edgeFade
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

    const interactionStrength = Math.min(1, Math.max(0, (ch.scale - 1) / 1.5))
    const padding = 4 + interactionStrength * 2
    const tileW = ch.width + padding * 2
    const tileH = this.config.fontSize + padding * 2
    const borderRadius = 4
    const bgAlpha = isFocused ? 1 : Math.min(1, 0.4 + interactionStrength * 0.6)
    const colorT = Math.min(1, Math.max(0, interactionStrength * 1.2))
    const textT = isFocused ? 1 : Math.min(1, Math.max(0, (interactionStrength + 0.14) / 0.78))
    const borderT = isFocused ? 1 : Math.min(1, Math.max(0, (interactionStrength - 0.06) / 0.92))
    const shinyBeat = ch.isShiny
      ? ((currentTimeMs * 0.00235 + ch.seed * 0.9) % 1)
      : 0
    const shinyPulse = ch.isShiny
      ? Math.max(
          0,
          1 - Math.abs(shinyBeat - 0.16) / 0.1,
          1 - Math.abs(shinyBeat - 0.3) / 0.08,
        )
      : 0

    if (ch.scale > 1.1) {
      ctx.shadowColor = COLORS.shadow
      ctx.shadowBlur = 4 + (ch.scale - 1) * 10
      ctx.shadowOffsetY = 2 + (ch.scale - 1) * 4
    }

    const colorAlpha = isFocused ? 1 : baseAlpha
    const colors = this.getHighlightColors(ch.multiplierType, colorAlpha, bgAlpha, colorT, textT, borderT)
    const shinyAccent = this.getShinyAccentStyle(ch.multiplierType)
    const displayChar = ch.isBlank ? '' : ch.char

    if (ch.isShiny) {
      const haloAlpha = baseAlpha * (0.22 + shinyPulse * 0.28 + (1 - interactionStrength) * 0.15)
      const halo = ctx.createRadialGradient(0, 0, tileW * 0.12, 0, 0, Math.max(tileW, tileH) * 0.98)
      halo.addColorStop(0, `rgba(${shinyAccent.glow[0]}, ${shinyAccent.glow[1]}, ${shinyAccent.glow[2]}, ${haloAlpha})`)
      halo.addColorStop(0.58, `rgba(${shinyAccent.glow[0]}, ${shinyAccent.glow[1]}, ${shinyAccent.glow[2]}, ${haloAlpha * 0.68})`)
      halo.addColorStop(1, `rgba(${shinyAccent.glow[0]}, ${shinyAccent.glow[1]}, ${shinyAccent.glow[2]}, 0)`)
      ctx.fillStyle = halo
      ctx.beginPath()
      ctx.ellipse(0, 0, tileW * 0.72, tileH * 0.78, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.fillStyle = colors.baseColor
    ctx.beginPath()
    ctx.roundRect(-tileW / 2, -tileH / 2, tileW, tileH, borderRadius)
    ctx.fill()

    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0

    const visualDepth = 3
    const depth = visualDepth / totalScale
    ctx.fillStyle = colors.depthColor
    ctx.beginPath()
    ctx.roundRect(-tileW / 2, tileH / 2 - depth, tileW, depth, [0, 0, borderRadius, borderRadius])
    ctx.fill()

    ctx.strokeStyle = colors.borderColor
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(-tileW / 2, -tileH / 2, tileW, tileH, borderRadius)
    ctx.stroke()

    ctx.fillStyle = this.getTileShineGradient(ctx, tileW, tileH)
    ctx.fill()

    if (ch.isShiny) {
      const shimmerPhase = (currentTimeMs * 0.0016 + ch.seed * 5.3) % 1
      const shimmerX = -tileW + shimmerPhase * tileW * 2
      const shimmer = ctx.createLinearGradient(shimmerX - tileW * 0.24, -tileH / 2, shimmerX + tileW * 0.1, tileH / 2)
      shimmer.addColorStop(0, 'rgba(255, 255, 255, 0)')
      shimmer.addColorStop(0.38, `rgba(${shinyAccent.bright[0]}, ${shinyAccent.bright[1]}, ${shinyAccent.bright[2]}, ${baseAlpha * 0.38})`)
      shimmer.addColorStop(0.55, `rgba(${shinyAccent.glow[0]}, ${shinyAccent.glow[1]}, ${shinyAccent.glow[2]}, ${baseAlpha * 0.22})`)
      shimmer.addColorStop(0.72, 'rgba(255, 255, 255, 0)')
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(-tileW / 2, -tileH / 2, tileW, tileH, borderRadius)
      ctx.clip()
      ctx.globalCompositeOperation = 'screen'
      ctx.fillStyle = shimmer
      ctx.fillRect(-tileW / 2 - 6, -tileH / 2 - 6, tileW + 12, tileH + 12)
      ctx.restore()

      if (!isFocused) {
        ctx.strokeStyle = `rgba(${shinyAccent.bright[0]}, ${shinyAccent.bright[1]}, ${shinyAccent.bright[2]}, ${0.24 + shinyPulse * 0.48})`
        ctx.lineWidth = 1.1 + shinyPulse * 0.7
        ctx.beginPath()
        ctx.roundRect(
          -tileW / 2 - 1.5,
          -tileH / 2 - 1.5,
          tileW + 3,
          tileH + 3,
          Math.max(3, borderRadius + 1),
        )
        ctx.stroke()

        ctx.strokeStyle = `rgba(${shinyAccent.glow[0]}, ${shinyAccent.glow[1]}, ${shinyAccent.glow[2]}, ${0.12 + shinyPulse * 0.3})`
        ctx.lineWidth = 1 + shinyPulse * 0.45
        ctx.beginPath()
        ctx.roundRect(
          -tileW / 2 - 3.25,
          -tileH / 2 - 3.25,
          tileW + 6.5,
          tileH + 6.5,
          Math.max(4, borderRadius + 2),
        )
        ctx.stroke()
      }
    }

    ctx.font = this.font
    const textContrastBoost = Math.max(0, 1 - Math.abs(colorT - 0.5) / 0.5)
    const charIsLight = colors.charColor === COLORS.ivory || colorT > 0.62
    const underlayAlpha = (0.08 + textContrastBoost * 0.14) * baseAlpha
    if (displayChar && underlayAlpha > 0.01) {
      ctx.fillStyle = charIsLight
        ? `rgba(92, 64, 51, ${underlayAlpha})`
        : `rgba(245, 241, 232, ${underlayAlpha * 0.8})`
      ctx.fillText(displayChar, 0, 0)
    }
    ctx.fillStyle = colors.charColor
    if (displayChar) {
      ctx.fillText(displayChar, 0, -1)
    }

    const points = ch.isBlank ? 0 : this.resolveLetterValue(ch.char)
    const isBoostedValue = points > getLetterValue(ch.char)
    if (points > 0) {
      ctx.font = this.pointsFont
      ctx.textAlign = 'right'
      ctx.textBaseline = 'bottom'
      ctx.globalAlpha = baseAlpha * Math.min(1, interactionStrength * 2)
      if (underlayAlpha > 0.01) {
        ctx.fillStyle = charIsLight
          ? `rgba(92, 64, 51, ${underlayAlpha})`
          : `rgba(245, 241, 232, ${underlayAlpha * 0.8})`
        ctx.fillText(String(points), tileW / 2 - 3, tileH / 2 - 1)
      }
      if (isBoostedValue) {
        ctx.shadowColor = COLORS.boostGreenGlow
        ctx.shadowBlur = 8
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 0
      }
      ctx.fillStyle = isBoostedValue ? COLORS.boostGreen : colors.charColor
      ctx.fillText(String(points), tileW / 2 - 3, tileH / 2 - 2)
      if (isBoostedValue) {
        ctx.shadowBlur = 0
      }
    }

    if (ch.isShiny) {
      const badgeText = `+${ch.shinyBonus}`
      const badgeFont = '700 9px Georgia, "Times New Roman", serif'
      ctx.font = badgeFont
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const badgeWidth = Math.max(20, measureTextWidth(badgeText, badgeFont) + 8)
      const badgeHeight = 10
      const badgeX = -badgeWidth / 2
      const badgeY = -tileH / 2 - 7
      const badgeCenterX = 0
      const badgeCenterY = badgeY + badgeHeight / 2
      ctx.globalAlpha = baseAlpha
      ctx.fillStyle = `rgba(${shinyAccent.badgeFill[0]}, ${shinyAccent.badgeFill[1]}, ${shinyAccent.badgeFill[2]}, ${0.94 + shinyPulse * 0.04})`
      ctx.beginPath()
      ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 999)
      ctx.fill()
      ctx.strokeStyle = `rgba(${shinyAccent.border[0]}, ${shinyAccent.border[1]}, ${shinyAccent.border[2]}, ${0.72 + shinyPulse * 0.18})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 999)
      ctx.stroke()
      if (underlayAlpha > 0.01) {
        ctx.fillStyle = charIsLight
          ? `rgba(92, 64, 51, ${underlayAlpha})`
          : `rgba(245, 241, 232, ${underlayAlpha * 0.8})`
        ctx.fillText(badgeText, badgeCenterX, badgeCenterY + 1)
      }
      ctx.fillStyle = colors.charColor
      ctx.fillText(badgeText, badgeCenterX, badgeCenterY)
    }

    ctx.restore()
  }

  private renderPowerUpChar(
    ctx: CanvasRenderingContext2D,
    ch: StreamChar,
    charCenterX: number,
    charCenterY: number,
    totalScale: number,
    edgeFade: number,
  ): void {
    ctx.save()
    ctx.translate(charCenterX, charCenterY)

    const interactionStrength = Math.min(1, Math.max(0, (ch.scale - 1) / 1.5))
    const baseAlpha = Math.min(1, ch.alpha * (0.84 + interactionStrength * 0.3)) * edgeFade
    const radius = 13 + interactionStrength * 2.4
    const glowRadius = radius + 7 + interactionStrength * 3
    const ringColor = this.getPowerUpRingColor(ch.powerUpType)

    ctx.globalAlpha = baseAlpha

    if (ch.rotation !== 0 || totalScale !== 1) {
      ctx.rotate(ch.rotation)
      ctx.scale(totalScale, totalScale)
    }

    if (ch.scale > 1.05) {
      ctx.shadowColor = COLORS.shadow
      ctx.shadowBlur = 8 + (ch.scale - 1) * 12
      ctx.shadowOffsetY = 2 + (ch.scale - 1) * 3
    }

    const halo = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, glowRadius)
    halo.addColorStop(0, `rgba(240, 201, 108, ${0.16 + interactionStrength * 0.18})`)
    halo.addColorStop(0.65, `rgba(240, 201, 108, ${0.08 + interactionStrength * 0.12})`)
    halo.addColorStop(1, 'rgba(240, 201, 108, 0)')
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(0, 0, glowRadius, 0, Math.PI * 2)
    ctx.fill()

    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0

    const medallion = ctx.createRadialGradient(-radius * 0.25, -radius * 0.35, radius * 0.12, 0, 0, radius * 1.1)
    medallion.addColorStop(0, 'rgba(255, 254, 250, 0.98)')
    medallion.addColorStop(0.68, 'rgba(245, 241, 232, 0.96)')
    medallion.addColorStop(1, 'rgba(232, 224, 208, 0.94)')
    ctx.fillStyle = medallion
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = `rgba(${ringColor[0]}, ${ringColor[1]}, ${ringColor[2]}, ${0.45 + interactionStrength * 0.35})`
    ctx.lineWidth = 1.7
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.stroke()

    ctx.strokeStyle = `rgba(92, 64, 51, ${0.14 + interactionStrength * 0.15})`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(0, 0, radius - 2.2, 0, Math.PI * 2)
    ctx.stroke()

    ctx.font = this.font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = COLORS.safeZoneInk
    ctx.fillText(ch.char, 0, 0)
    ctx.restore()
  }

  private getNormalTextColor(ch: StreamChar): string {
    if (this.isSafeZone) return COLORS.safeZoneInk
    if (ch.multiplierType === 'DoubleLetter' || ch.multiplierType === 'DoubleWord') return 'rgb(255, 255, 255)'
    if (ch.multiplierType === 'TripleLetter') return 'rgb(23, 124, 114)'
    if (ch.multiplierType === 'TripleWord') return 'rgb(115, 45, 145)'
    return COLORS.sepia
  }

  private getCollectedTextColor(ch: StreamChar): string {
    if (ch.multiplierType === 'DoubleLetter') return COLORS.dlLight
    if (ch.multiplierType === 'TripleLetter') return COLORS.tlBlue
    if (ch.multiplierType === 'DoubleWord') return COLORS.dwCoral
    if (ch.multiplierType === 'TripleWord') return COLORS.twPurple
    return COLORS.tileGold
  }

  private getShinyAccentStyle(multiplierType: StreamChar['multiplierType']): {
    glow: [number, number, number]
    bright: [number, number, number]
    border: [number, number, number]
    badgeFill: [number, number, number]
  } {
    switch (multiplierType) {
      case 'DoubleLetter':
        return { glow: [91, 155, 213], bright: [228, 242, 255], border: [141, 188, 233], badgeFill: [202, 226, 249] }
      case 'TripleLetter':
        return { glow: [34, 166, 153], bright: [222, 249, 244], border: [107, 230, 217], badgeFill: [184, 232, 226] }
      case 'DoubleWord':
        return { glow: [231, 76, 60], bright: [255, 233, 228], border: [241, 154, 142], badgeFill: [248, 200, 191] }
      case 'TripleWord':
        return { glow: [142, 68, 173], bright: [244, 231, 251], border: [200, 157, 226], badgeFill: [223, 193, 237] }
      default:
        return { glow: [240, 201, 108], bright: [250, 242, 220], border: [214, 164, 66], badgeFill: [238, 212, 140] }
    }
  }

  private getPowerUpRingColor(powerUpType: PowerUpType): [number, number, number] {
    if (powerUpType === 'Wisdom') return [184, 134, 11]
    if (powerUpType === 'Knowledge') return [201, 133, 31]
    return [184, 134, 11]
  }

  private getHighlightColors(multiplierType: StreamChar['multiplierType'], baseAlpha: number, bgAlpha: number, colorT: number, textT: number, borderT: number): {
    baseColor: string
    borderColor: string
    depthColor: string
    charColor: string
  } {
    let baseColor: string = `rgba(${REGULAR_TILE_STYLE.fillRgb[0]}, ${REGULAR_TILE_STYLE.fillRgb[1]}, ${REGULAR_TILE_STYLE.fillRgb[2]}, ${bgAlpha * baseAlpha})`
    let borderColor: string = `rgba(${REGULAR_TILE_STYLE.borderRgb[0]}, ${REGULAR_TILE_STYLE.borderRgb[1]}, ${REGULAR_TILE_STYLE.borderRgb[2]}, ${baseAlpha * (0.35 + borderT * 0.65)})`
    let depthColor: string = REGULAR_TILE_STYLE.depth
    let startR: number = REGULAR_TILE_STYLE.darkTextRgb[0]
    let startG: number = REGULAR_TILE_STYLE.darkTextRgb[1]
    let startB: number = REGULAR_TILE_STYLE.darkTextRgb[2]
    let endR: number = REGULAR_TILE_STYLE.lightTextRgb[0]
    let endG: number = REGULAR_TILE_STYLE.lightTextRgb[1]
    let endB: number = REGULAR_TILE_STYLE.lightTextRgb[2]

    if (multiplierType === 'DoubleLetter') {
      baseColor = `rgba(91, 155, 213, ${bgAlpha * baseAlpha})`
      borderColor = `rgba(63, 107, 168, ${baseAlpha * (0.35 + borderT * 0.65)})`
      depthColor = 'rgba(50, 85, 140, 0.4)'
      startR = 63
      startG = 107
      startB = 168
      endR = 255
      endG = 255
      endB = 255
    } else if (multiplierType === 'TripleLetter') {
      baseColor = `rgba(34, 166, 153, ${bgAlpha * baseAlpha})`
      borderColor = `rgba(23, 124, 114, ${baseAlpha * (0.35 + borderT * 0.65)})`
      depthColor = 'rgba(20, 100, 95, 0.4)'
      startR = 23
      startG = 124
      startB = 114
      endR = 245
      endG = 241
      endB = 232
    } else if (multiplierType === 'DoubleWord') {
      baseColor = `rgba(231, 76, 60, ${bgAlpha * baseAlpha})`
      borderColor = `rgba(184, 61, 47, ${baseAlpha * (0.35 + borderT * 0.65)})`
      depthColor = 'rgba(150, 50, 40, 0.4)'
      startR = 184
      startG = 61
      startB = 47
      endR = 255
      endG = 255
      endB = 255
    } else if (multiplierType === 'TripleWord') {
      baseColor = `rgba(142, 68, 173, ${bgAlpha * baseAlpha})`
      borderColor = `rgba(115, 45, 145, ${baseAlpha * (0.35 + borderT * 0.65)})`
      depthColor = 'rgba(90, 30, 120, 0.4)'
      startR = 115
      startG = 45
      startB = 145
      endR = 245
      endG = 241
      endB = 232
    }

    const r = Math.round(startR + (endR - startR) * textT)
    const g = Math.round(startG + (endG - startG) * textT)
    const b = Math.round(startB + (endB - startB) * textT)

    return {
      baseColor,
      borderColor,
      depthColor,
      charColor: `rgb(${r}, ${g}, ${b})`,
    }
  }

  private getTileShineGradient(ctx: CanvasRenderingContext2D, tileW: number, tileH: number): CanvasGradient {
    const roundedW = Math.max(1, Math.round(tileW))
    const roundedH = Math.max(1, Math.round(tileH))
    const key = `${roundedW}x${roundedH}`
    const cached = this.tileShineGradientCache.get(key)
    if (cached) return cached

    const gradient = ctx.createLinearGradient(-roundedW / 2, -roundedH / 2, roundedW / 2, roundedH / 2)
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.15)')
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0)')
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.05)')
    this.tileShineGradientCache.set(key, gradient)
    return gradient
  }

  private buildPointsFont(fontSize: number): string {
    return `800 ${Math.max(8, fontSize * 0.32)}px Georgia, "Times New Roman", serif`
  }
}
