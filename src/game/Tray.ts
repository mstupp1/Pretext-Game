// ── Tray — the letters you are holding, with flight-in / flight-out animation ──

import { CANVAS_FONTS, COLORS, MAX_TRAY } from '../utils/constants'
import { clamp, damp, easeOutBack, easeOutCubic } from '../utils/math'
import { tileArt, type TileKind } from './Tiles'
import type { TrayLetter } from './Scoring'

export const TRAY = {
  x: 48,
  y: 526,
  w: 804,
  h: 88,
  tileH: 42,
  slot: 44,
  tilesCenterX: 330,
  tilesCenterY: 566,
}

interface HeldTile extends TrayLetter {
  id: number
  x: number
  y: number
  fromX: number
  fromY: number
  fromScale: number
  t: number
  hover: number
}

interface LeavingTile {
  letter: string
  kind: TileKind
  x: number
  y: number
  vx: number
  vy: number
  t: number
  delay: number
  mode: 'drop' | 'ink'
  rot: number
}

let nextId = 1

export class Tray {
  tiles: HeldTile[] = []
  private leaving: LeavingTile[] = []
  private shake = 0
  private glow = 0
  hoverIndex = -1
  private texture: HTMLImageElement | null = null

  setTexture(img: HTMLImageElement): void {
    this.texture = img
  }

  get length(): number {
    return this.tiles.length
  }

  get full(): boolean {
    return this.tiles.length >= MAX_TRAY
  }

  letters(): TrayLetter[] {
    return this.tiles.map(t => ({ letter: t.letter, kind: t.kind }))
  }

  /** '?' for blanks — the pattern the dictionary resolves. */
  pattern(): string {
    return this.tiles.map(t => (t.kind === 'blank' ? '?' : t.letter)).join('')
  }

  slotX(i: number): number {
    return TRAY.tilesCenterX + (i - (MAX_TRAY - 1) / 2) * TRAY.slot
  }

  add(letter: string, kind: TileKind, fromX: number, fromY: number, fromScale: number): void {
    this.tiles.push({
      id: nextId++,
      letter: kind === 'blank' ? '' : letter,
      kind,
      x: fromX,
      y: fromY,
      fromX,
      fromY,
      fromScale,
      t: 0,
      hover: 0,
    })
  }

  removeAt(i: number): void {
    const [t] = this.tiles.splice(i, 1)
    if (!t) return
    this.leaving.push({ letter: t.letter, kind: t.kind, x: t.x, y: t.y, vx: (Math.random() - 0.5) * 60, vy: -90, t: 0, delay: 0, mode: 'drop', rot: (Math.random() - 0.5) * 3 })
  }

  clear(): void {
    for (let i = this.tiles.length - 1; i >= 0; i--) this.removeAt(i)
  }

  /** Letters rise off the tray and dissolve into ink — used on a successful word. */
  inkAway(): void {
    this.tiles.forEach((t, i) => {
      this.leaving.push({ letter: t.letter, kind: t.kind, x: t.x, y: t.y, vx: 0, vy: -260, t: 0, delay: i * 0.035, mode: 'ink', rot: 0 })
    })
    this.tiles = []
    this.glow = 1
  }

  /** Fill blank tiles with the letters of the resolved word. */
  fillBlanks(word: string): void {
    this.tiles.forEach((t, i) => {
      if (t.kind === 'blank') t.letter = word[i] ?? ''
    })
  }

  reject(): void {
    this.shake = 1
  }

  update(dt: number): void {
    this.tiles.forEach((t, i) => {
      t.t = Math.min(1, t.t + dt / 0.28)
      const tx = this.slotX(i)
      const ty = TRAY.tilesCenterY
      if (t.t < 1) {
        // Arc from the lane to the tray.
        const e = easeOutCubic(t.t)
        t.x = t.fromX + (tx - t.fromX) * e
        t.y = t.fromY + (ty - t.fromY) * e - Math.sin(e * Math.PI) * 40
      } else {
        t.x += (tx - t.x) * damp(18, dt)
        t.y += (ty - t.y) * damp(18, dt)
      }
      t.hover += ((i === this.hoverIndex ? 1 : 0) - t.hover) * damp(20, dt)
    })
    for (const l of this.leaving) {
      if (l.delay > 0) {
        l.delay -= dt
        continue
      }
      l.t += dt
      l.vy += (l.mode === 'drop' ? 700 : -200) * dt
      l.x += l.vx * dt
      l.y += l.vy * dt
    }
    this.leaving = this.leaving.filter(l => l.t < (l.mode === 'drop' ? 0.5 : 0.55))
    this.shake = Math.max(0, this.shake - dt * 2.6)
    this.glow = Math.max(0, this.glow - dt * 1.8)
  }

  hitTile(x: number, y: number): number {
    for (let i = this.tiles.length - 1; i >= 0; i--) {
      const t = this.tiles[i]
      if (Math.abs(x - t.x) < TRAY.slot / 2 && Math.abs(y - t.y) < TRAY.tileH / 2 + 4) return i
    }
    return -1
  }

  renderPanel(ctx: CanvasRenderingContext2D, valid: boolean, time: number): void {
    const { x, y, w, h } = TRAY
    ctx.save()
    // Shadow
    ctx.fillStyle = 'rgba(44, 24, 16, 0.14)'
    ctx.beginPath()
    ctx.roundRect(x, y + 5, w, h, 16)
    ctx.fill()
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, 16)
    ctx.clip()
    if (this.texture?.complete && this.texture.naturalWidth > 0) {
      ctx.drawImage(this.texture, x, y - 60, w, w * (this.texture.naturalHeight / this.texture.naturalWidth))
      ctx.fillStyle = 'rgba(245, 232, 210, 0.25)'
      ctx.fillRect(x, y, w, h)
    } else {
      ctx.fillStyle = '#B8895A'
      ctx.fillRect(x, y, w, h)
    }
    // Inner groove for the tiles
    const gx = TRAY.tilesCenterX - (MAX_TRAY * TRAY.slot) / 2 - 8
    const gw = MAX_TRAY * TRAY.slot + 16
    ctx.fillStyle = 'rgba(52, 30, 16, 0.28)'
    ctx.beginPath()
    ctx.roundRect(gx, y + 12, gw, h - 24, 10)
    ctx.fill()
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)'
    ctx.fillRect(gx + 4, y + 12, gw - 8, 3)
    ctx.restore()

    // Valid-word glow around the groove
    const g = valid ? 0.5 + 0.5 * Math.sin(time * 5) : 0
    if (valid || this.glow > 0) {
      ctx.save()
      ctx.strokeStyle = `rgba(240, 201, 108, ${Math.max(this.glow, 0.45 + g * 0.4)})`
      ctx.lineWidth = 2.5
      ctx.shadowColor = 'rgba(240, 201, 108, 0.8)'
      ctx.shadowBlur = 10
      ctx.beginPath()
      ctx.roundRect(gx - 1, y + 11, gw + 2, h - 22, 11)
      ctx.stroke()
      ctx.restore()
    }

    // Empty slot marks
    ctx.fillStyle = 'rgba(255, 240, 215, 0.12)'
    for (let i = this.tiles.length; i < MAX_TRAY; i++) {
      ctx.beginPath()
      ctx.arc(this.slotX(i), TRAY.tilesCenterY, 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  renderTiles(ctx: CanvasRenderingContext2D): void {
    const shakeX = this.shake > 0 ? Math.sin(this.shake * 38) * 7 * this.shake : 0
    for (const t of this.tiles) {
      const scale = t.t < 1 ? t.fromScale + (1 - t.fromScale) * easeOutBack(t.t) : 1 + t.hover * 0.08
      tileArt.draw(ctx, t.letter, t.kind, TRAY.tileH, t.x + shakeX, t.y - t.hover * 4, scale, true, true)
      if (t.hover > 0.05) {
        ctx.save()
        ctx.globalAlpha = t.hover
        ctx.font = CANVAS_FONTS.icons(9)
        ctx.fillStyle = COLORS.red
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('', t.x + shakeX, t.y - TRAY.tileH / 2 - 12)
        ctx.restore()
      }
    }
    for (const l of this.leaving) {
      if (l.delay > 0) {
        tileArt.draw(ctx, l.letter, l.kind, TRAY.tileH, l.x, l.y, 1, true, true)
        continue
      }
      const life = clamp(l.t / (l.mode === 'drop' ? 0.5 : 0.55), 0, 1)
      ctx.globalAlpha = 1 - life
      const s = l.mode === 'ink' ? 1 + life * 0.4 : 1 - life * 0.3
      ctx.save()
      ctx.translate(l.x, l.y)
      ctx.rotate(l.rot * life)
      tileArt.draw(ctx, l.letter, l.kind, TRAY.tileH, 0, 0, s, true, true)
      ctx.restore()
      ctx.globalAlpha = 1
    }
  }
}
