// ── Player — The typographic cursor entity ──

import {
  GAME_WIDTH,
  PLAYER_SIZE,
  LANE_COUNT,
  LANE_HEIGHT,
  LANE_Y_START,
  SAFE_ZONE_INDICES,
  COLORS,
  PLAYER_GRID_MAX_OFFSET,
  getPlayerGridX,
} from '../utils/constants'
import { getPageCurvatureOffset } from '../text/TextStream'
export class Player {
  public x: number
  public y: number
  public targetX: number
  public targetY: number
  public laneIndex: number
  public lives: number = 3
  public isMoving: boolean = false
  private columnOffset: number = 0

  // Visual state
  private blinkTimer: number = 0
  private blinkOn: boolean = true
  private trailPositions: { x: number; y: number; alpha: number }[] = []
  private trailPool: { x: number; y: number; alpha: number }[] = []

  constructor() {
    // Start at middle row
    this.laneIndex = Math.floor(LANE_COUNT / 2)
    this.columnOffset = 0
    this.x = getPlayerGridX(this.columnOffset)
    this.y = this.laneToY(this.laneIndex)
    this.targetX = this.x
    this.targetY = this.y
  }

  reset(): void {
    this.laneIndex = Math.floor(LANE_COUNT / 2)
    this.columnOffset = 0
    this.x = getPlayerGridX(this.columnOffset)
    this.y = this.laneToY(this.laneIndex)
    this.targetX = this.x
    this.targetY = this.y
    this.trailPositions = []
    this.trailPool = []
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
    if (this.columnOffset > -PLAYER_GRID_MAX_OFFSET) {
      this.columnOffset--
      this.targetX = getPlayerGridX(this.columnOffset)
    }
  }

  moveRight(): void {
    if (this.columnOffset < PLAYER_GRID_MAX_OFFSET) {
      this.columnOffset++
      this.targetX = getPlayerGridX(this.columnOffset)
    }
  }

  private drawCursor(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const cursorWidth = 6
    const cursorHeight = PLAYER_SIZE - 2
    ctx.beginPath()
    ctx.roundRect(x - cursorWidth / 2, y - cursorHeight / 2, cursorWidth, cursorHeight, 2)
    ctx.fill()
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
      const trail = this.trailPool.pop() ?? { x: 0, y: 0, alpha: 0 }
      trail.x = this.x
      trail.y = this.y
      trail.alpha = 0.4
      this.trailPositions.push(trail)

      if (this.trailPositions.length > 8) {
        const removed = this.trailPositions.shift()
        if (removed) this.trailPool.push(removed)
      }
    }
    let writeIndex = 0
    for (let i = 0; i < this.trailPositions.length; i++) {
      const t = this.trailPositions[i]
      t.alpha -= dt * 1.5
      if (t.alpha > 0) {
        this.trailPositions[writeIndex] = t
        writeIndex++
      } else {
        this.trailPool.push(t)
      }
    }
    this.trailPositions.length = writeIndex
  }

  render(ctx: CanvasRenderingContext2D): void {
    // Trail
    for (const trail of this.trailPositions) {
      ctx.globalAlpha = trail.alpha * 0.3
      ctx.fillStyle = COLORS.gold
      const offset = getPageCurvatureOffset(trail.x, GAME_WIDTH)
      this.drawCursor(ctx, trail.x, trail.y + offset)
    }
    ctx.globalAlpha = 1

    // Player cursor
    if (this.blinkOn || this.isMoving) {
      const offset = getPageCurvatureOffset(this.x, GAME_WIDTH)
      // Glow
      ctx.save()
      ctx.shadowColor = COLORS.goldGlow
      ctx.shadowBlur = 12
      ctx.fillStyle = COLORS.gold
      this.drawCursor(ctx, this.x, this.y + offset)
      ctx.restore()

      // Solid
      ctx.fillStyle = COLORS.espresso
      this.drawCursor(ctx, this.x, this.y + offset)
    }
  }

  // Check if player has reached the top (crossed all lanes)
  hasReachedTop(): boolean {
    return this.laneIndex === 0 && Math.abs(this.y - this.targetY) < 2
  }
}
