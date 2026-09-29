// ── Cursor — the reader's caret that glides across the page ──

import { BOARD_LEFT, BOARD_RIGHT, COLORS, LANE_COUNT, laneCenterY } from '../utils/constants'
import { curveY } from '../utils/curve'
import { clamp, damp, easeOutCubic } from '../utils/math'

const MAX_SPEED = 430
const POINTER_SPEED = 1100
const HOP_TIME = 0.1

export class Cursor {
  lane = Math.floor(LANE_COUNT / 2)
  x = (BOARD_LEFT + BOARD_RIGHT) / 2
  vx = 0
  /** Visual y (animated between lanes). */
  y = laneCenterY(this.lane)
  private hopFromY = this.y
  private hopT = 1
  private blink = 0
  private squash = 0
  /** Pointer-driven destination x (null when keyboard-driven). */
  targetX: number | null = null

  reset(): void {
    this.lane = Math.floor(LANE_COUNT / 2)
    this.x = (BOARD_LEFT + BOARD_RIGHT) / 2
    this.vx = 0
    this.y = laneCenterY(this.lane)
    this.hopT = 1
    this.targetX = null
  }

  hop(delta: number): boolean {
    return this.setLane(this.lane + delta)
  }

  setLane(lane: number): boolean {
    const next = clamp(lane, 0, LANE_COUNT - 1)
    if (next === this.lane) return false
    this.hopFromY = this.y
    this.hopT = 0
    this.lane = next
    this.squash = 1
    this.blink = 0
    return true
  }

  update(dt: number, axis: number): void {
    if (axis !== 0) this.targetX = null
    let targetV = axis * MAX_SPEED
    if (this.targetX !== null) {
      const d = this.targetX - this.x
      targetV = clamp(d * 14, -POINTER_SPEED, POINTER_SPEED)
      if (Math.abs(d) < 0.5) {
        this.x = this.targetX
        targetV = 0
      }
    }
    // Snappy acceleration, even snappier braking.
    const rate = targetV === 0 ? 30 : Math.sign(targetV) !== Math.sign(this.vx) ? 34 : 20
    this.vx += (targetV - this.vx) * damp(rate, dt)
    if (Math.abs(this.vx) < 1 && targetV === 0) this.vx = 0
    this.x = clamp(this.x + this.vx * dt, BOARD_LEFT + 8, BOARD_RIGHT - 8)

    const ty = laneCenterY(this.lane)
    if (this.hopT < 1) {
      this.hopT = Math.min(1, this.hopT + dt / HOP_TIME)
      this.y = this.hopFromY + (ty - this.hopFromY) * easeOutCubic(this.hopT)
    } else {
      this.y = ty
    }
    this.squash = Math.max(0, this.squash - dt * 7)
    this.blink += dt
  }

  render(ctx: CanvasRenderingContext2D, laneFlash: number): void {
    const cy = this.y + curveY(this.x)
    const moving = Math.abs(this.vx) > 20 || this.hopT < 1
    const on = moving || (this.blink % 1.06) < 0.7

    // Soft reading glow on the page
    const glow = ctx.createRadialGradient(this.x, cy, 2, this.x, cy, 40)
    glow.addColorStop(0, `rgba(212, 168, 67, ${0.22 + laneFlash * 0.2})`)
    glow.addColorStop(1, 'rgba(212, 168, 67, 0)')
    ctx.fillStyle = glow
    ctx.fillRect(this.x - 40, cy - 40, 80, 80)

    if (!on) return
    const stretch = 1 + this.squash * 0.25
    const h = 30 * stretch
    const w = 3.5 / Math.sqrt(stretch)
    const lean = clamp(this.vx / MAX_SPEED, -1, 1) * 0.12
    ctx.save()
    ctx.translate(this.x, cy)
    ctx.transform(1, 0, -lean, 1, 0, 0)
    ctx.fillStyle = COLORS.goldGlow
    ctx.beginPath()
    ctx.roundRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 3)
    ctx.fill()
    ctx.fillStyle = COLORS.espresso
    ctx.beginPath()
    ctx.roundRect(-w / 2, -h / 2, w, h, 1.5)
    ctx.fill()
    // Serifs — it's a typographic caret after all
    ctx.fillRect(-4, -h / 2, 8, 1.6)
    ctx.fillRect(-4, h / 2 - 1.6, 8, 1.6)
    ctx.restore()
  }
}
