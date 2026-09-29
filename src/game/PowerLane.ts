// ── PowerLane — the page margins, where rare power-up medallions drift by ──

import { CANVAS_FONTS, BOARD_LEFT, BOARD_RIGHT, laneCenterY } from '../utils/constants'
import { curveY } from '../utils/curve'
import { damp } from '../utils/math'
import { POWERS, type PowerKind } from './Tiles'
import { edgeFade } from './Lane'

export interface PowerItem {
  kind: PowerKind
  x: number
  taken: boolean
  age: number
}

export class PowerLane {
  readonly index: number
  readonly y: number
  direction: 1 | -1
  speed: number
  private targetSpeed: number
  private ornamentOffset = 0
  items: PowerItem[] = []

  constructor(index: number, speed: number, direction: 1 | -1) {
    this.index = index
    this.y = laneCenterY(index)
    this.speed = speed
    this.targetSpeed = speed
    this.direction = direction
  }

  setSpeed(speed: number, instant = false): void {
    this.targetSpeed = speed
    if (instant) this.speed = speed
  }

  spawn(kind: PowerKind): void {
    const x = this.direction > 0 ? BOARD_LEFT - 40 : BOARD_RIGHT + 40
    this.items.push({ kind, x, taken: false, age: 0 })
  }

  update(dt: number, timeScale: number): void {
    this.speed += (this.targetSpeed - this.speed) * damp(2.5, dt)
    const dx = this.speed * this.direction * dt * timeScale
    this.ornamentOffset += dx
    for (const item of this.items) {
      item.x += dx
      item.age += dt
    }
    this.items = this.items.filter(i => !i.taken && i.x > BOARD_LEFT - 60 && i.x < BOARD_RIGHT + 60)
  }

  find(x: number, reach: number): PowerItem | null {
    let best: PowerItem | null = null
    let bestD = reach + 6 // medallions are a touch larger than tiles
    for (const item of this.items) {
      if (item.taken || item.x < BOARD_LEFT || item.x > BOARD_RIGHT) continue
      const d = Math.abs(item.x - x)
      if (d <= bestD) {
        bestD = d
        best = item
      }
    }
    return best
  }

  renderBase(ctx: CanvasRenderingContext2D, dim = 1): void {
    // A dotted leader line, drifting with the lane — hints that the margin moves.
    const spacing = 22
    let start = this.ornamentOffset % spacing
    if (start < 0) start += spacing
    ctx.fillStyle = 'rgba(139, 115, 85, 0.35)'
    ctx.globalAlpha = dim
    for (let x = start + BOARD_LEFT; x < BOARD_RIGHT; x += spacing) {
      const fade = edgeFade(x)
      if (fade <= 0) continue
      ctx.globalAlpha = fade * dim
      ctx.beginPath()
      ctx.arc(x, this.y + curveY(x), 1.1, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  renderItems(ctx: CanvasRenderingContext2D, time: number, focusX: number | null, dim = 1): void {
    for (const item of this.items) {
      if (item.taken) continue
      const fade = edgeFade(item.x) * dim
      if (fade <= 0.01) continue
      const p = POWERS[item.kind]
      const near = focusX === null ? 0 : Math.max(0, 1 - Math.abs(item.x - focusX) / 110)
      const bob = Math.sin(time * 3 + item.x * 0.02) * 1.5
      const cx = item.x
      const cy = this.y + curveY(cx) + bob - near * 3
      const r = 14 + near * 4
      ctx.globalAlpha = fade

      // Halo pulse
      const pulse = 0.5 + 0.5 * Math.sin(time * 4 + item.age * 2)
      ctx.fillStyle = p.color
      ctx.globalAlpha = fade * (0.1 + pulse * 0.1)
      ctx.beginPath()
      ctx.arc(cx, cy, r + 6 + pulse * 3, 0, Math.PI * 2)
      ctx.fill()

      ctx.globalAlpha = fade
      ctx.fillStyle = 'rgba(44, 24, 16, 0.15)'
      ctx.beginPath()
      ctx.arc(cx, cy + 2, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#FFFDF6'
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = p.color
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.font = CANVAS_FONTS.icons(Math.round(r * 0.95))
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = p.color
      ctx.fillText(p.icon, cx, cy + 0.5)
    }
    ctx.globalAlpha = 1
  }
}

