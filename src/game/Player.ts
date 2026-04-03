// ── Player — The typographic cursor entity ──

import { GAME_WIDTH, GAME_HEIGHT, PLAYER_SIZE, PLAYER_SPEED, LANE_COUNT, LANE_HEIGHT, LANE_Y_START, SAFE_ZONE_INDICES, COLORS, CANVAS_FONTS } from '../utils/constants'

export class Player {
  public x: number
  public y: number
  public targetX: number
  public targetY: number
  public laneIndex: number
  public lives: number = 3
  public isMoving: boolean = false

  // Visual state
  private blinkTimer: number = 0
  private blinkOn: boolean = true
  private trailPositions: { x: number; y: number; alpha: number }[] = []

  constructor() {
    // Start at bottom safe zone
    this.laneIndex = LANE_COUNT - 1
    this.x = GAME_WIDTH / 2
    this.y = this.laneToY(this.laneIndex)
    this.targetX = this.x
    this.targetY = this.y
  }

  reset(): void {
    this.laneIndex = LANE_COUNT - 1
    this.x = GAME_WIDTH / 2
    this.y = this.laneToY(this.laneIndex)
    this.targetX = this.x
    this.targetY = this.y
    this.trailPositions = []
  }

  laneToY(lane: number): number {
    return LANE_Y_START + lane * LANE_HEIGHT + LANE_HEIGHT / 2
  }

  moveUp(): void {
    if (this.laneIndex > 0) {
      this.laneIndex--
      this.targetY = this.laneToY(this.laneIndex)
    }
  }

  moveDown(): void {
    if (this.laneIndex < LANE_COUNT - 1) {
      this.laneIndex++
      this.targetY = this.laneToY(this.laneIndex)
    }
  }

  moveLeft(): void {
    this.targetX = Math.max(PLAYER_SIZE, this.targetX - LANE_HEIGHT)
  }

  moveRight(): void {
    this.targetX = Math.min(GAME_WIDTH - PLAYER_SIZE, this.targetX + LANE_HEIGHT)
  }

  isInSafeZone(): boolean {
    return SAFE_ZONE_INDICES.includes(this.laneIndex)
  }

  update(dt: number): void {
    // Smooth movement
    const lerpSpeed = 12 * dt
    this.x += (this.targetX - this.x) * Math.min(1, lerpSpeed)
    this.y += (this.targetY - this.y) * Math.min(1, lerpSpeed)

    this.isMoving = Math.abs(this.targetX - this.x) > 1 || Math.abs(this.targetY - this.y) > 1

    // Blink cursor
    this.blinkTimer += dt
    if (this.blinkTimer > 0.53) {
      this.blinkTimer = 0
      this.blinkOn = !this.blinkOn
    }

    // Trail management
    if (this.isMoving) {
      this.trailPositions.push({ x: this.x, y: this.y, alpha: 0.4 })
      if (this.trailPositions.length > 8) this.trailPositions.shift()
    }
    this.trailPositions = this.trailPositions.filter(t => {
      t.alpha -= dt * 1.5
      return t.alpha > 0
    })
  }

  render(ctx: CanvasRenderingContext2D): void {
    // Trail
    for (const trail of this.trailPositions) {
      ctx.globalAlpha = trail.alpha * 0.3
      ctx.font = CANVAS_FONTS.laneBold(PLAYER_SIZE)
      ctx.fillStyle = COLORS.gold
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'center'
      ctx.fillText('▎', trail.x, trail.y)
    }
    ctx.globalAlpha = 1

    // Player cursor
    if (this.blinkOn || this.isMoving) {
      // Glow
      ctx.save()
      ctx.shadowColor = COLORS.goldGlow
      ctx.shadowBlur = 12
      ctx.font = CANVAS_FONTS.laneBold(PLAYER_SIZE)
      ctx.fillStyle = COLORS.gold
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'center'
      ctx.fillText('▎', this.x, this.y)
      ctx.restore()

      // Solid
      ctx.font = CANVAS_FONTS.laneBold(PLAYER_SIZE)
      ctx.fillStyle = COLORS.espresso
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'center'
      ctx.fillText('▎', this.x, this.y)
    }

    ctx.textAlign = 'left'
  }

  // Check if player has reached the top (crossed all lanes)
  hasReachedTop(): boolean {
    return this.laneIndex === 0 && Math.abs(this.y - this.targetY) < 2
  }
}
