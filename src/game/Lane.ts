// ── Lane — A single text stream lane in the game ──
// Enhanced with ambient typography, rotation, scaling, ripple waves, and lens effects

import { TextStream, type StreamChar, getPageCurvatureOffset } from '../text/TextStream'
import { COLORS, CANVAS_FONTS, FONTS, GAME_WIDTH, LANE_HEIGHT, REGULAR_TILE_STYLE, SAFE_ZONE_INDICES, ORNAMENTS, FLOURISHES } from '../utils/constants'
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
  private safeZoneFillPath: Path2D | null = null
  private safeZoneRulePath: Path2D | null = null
  private playerLaneFillPath: Path2D | null = null
  private separatorPath: Path2D
  private pointsFont: string
  private tileShineGradientCache: Map<string, CanvasGradient> = new Map()
  private effectsActive: boolean = false

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

  update(dt: number, playerX: number, playerY: number): void {
    if (this.stream) {
      this.stream.update(dt)
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

    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.font = this.font

    for (const { char: ch, screenX } of visible) {
      if (ch.alpha <= 0 || (!ch.isCollected && !ch.isHighlighted)) continue
      const isFocused = !ch.isCollected && ch.scale > 1.42
      if (focusedOnly !== isFocused) continue
      this.renderTopChar(ctx, ch, screenX, centerY)
    }

    ctx.textAlign = 'left'
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

  private renderTopChar(ctx: CanvasRenderingContext2D, ch: StreamChar, screenX: number, centerY: number): void {
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

    if (ch.scale > 1.1) {
      ctx.shadowColor = COLORS.shadow
      ctx.shadowBlur = 4 + (ch.scale - 1) * 10
      ctx.shadowOffsetY = 2 + (ch.scale - 1) * 4
    }

    const colorAlpha = isFocused ? 1 : baseAlpha
    const colors = this.getHighlightColors(ch.multiplierType, colorAlpha, bgAlpha, colorT, textT, borderT)

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

    ctx.font = this.font
    const textContrastBoost = Math.max(0, 1 - Math.abs(colorT - 0.5) / 0.5)
    const charIsLight = colors.charColor === COLORS.ivory || colorT > 0.62
    const underlayAlpha = (0.08 + textContrastBoost * 0.14) * baseAlpha
    if (underlayAlpha > 0.01) {
      ctx.fillStyle = charIsLight
        ? `rgba(92, 64, 51, ${underlayAlpha})`
        : `rgba(245, 241, 232, ${underlayAlpha * 0.8})`
      ctx.fillText(ch.char, 0, 0)
    }
    ctx.fillStyle = colors.charColor
    ctx.fillText(ch.char, 0, -1)

    const points = getLetterValue(ch.char)
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
      ctx.fillStyle = colors.charColor
      ctx.fillText(String(points), tileW / 2 - 3, tileH / 2 - 2)
    }

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
