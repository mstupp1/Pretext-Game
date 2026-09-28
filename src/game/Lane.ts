// ── Lane — a line of flowing prose with catchable letter tiles ──
//
// Glyphs are measured once and laid out along a long looping strip. Tiles are
// (re)assigned just before a glyph scrolls into view, from a hash of
// (seed, lane, glyph, cycle), so the page never runs dry and seeded runs are
// reproducible frame-rate independently.

import { measureCharsInLine } from '../text/TextEngine'
import { hash01 } from '../core/rng'
import { view } from '../core/view'
import { CANVAS_FONTS, COLORS, GAME_WIDTH, BOARD_LEFT, BOARD_RIGHT, laneCenterY } from '../utils/constants'
import { curveY } from '../utils/curve'
import { damp, smoothstep } from '../utils/math'
import { tileArt, tileWidth, type TileKind } from './Tiles'

export type LaneFontStyle = 'light' | 'regular' | 'medium' | 'bold' | 'italic' | 'boldItalic'

export interface LaneOptions {
  index: number
  seed: number
  text: string
  fontSize: number
  style: LaneFontStyle
  speed: number
  direction: 1 | -1
}

export interface TileOdds {
  /** Base chance that an eligible letter becomes a tile. */
  rate: number
  blank: number
  DL: number
  TL: number
  DW: number
  TW: number
}

interface Glyph {
  ch: string
  x: number
  w: number
  letter: string | null
  tile: TileKind | null
  taken: boolean
  armed: boolean
  cycle: number
  scale: number
  lift: number
}

export interface TileRef {
  lane: Lane
  index: number
}

const PAD = 60 // off-screen margin (px) that is still simulated/rendered
const ENTRY = 90 // band just outside the view where tiles are re-rolled
const MIN_TILE_GAP = 4 // glyphs between tiles
const LETTER_WEIGHT: Record<string, number> = {
  E: 1.2, A: 1.3, I: 1.3, O: 1.3, U: 1.1,
  R: 1.05, S: 1.1, T: 0.8, L: 1.05, N: 1.0, D: 1.0,
  H: 0.7, C: 0.95, M: 0.95, P: 1.0, G: 1.0, B: 0.9, F: 0.85, W: 0.7, Y: 0.7,
  K: 0.7, V: 0.7, J: 0.45, X: 0.45, Q: 0.3, Z: 0.45,
}

const FONT_BUILDERS: Record<LaneFontStyle, (s: number) => string> = {
  light: CANVAS_FONTS.laneLight,
  regular: CANVAS_FONTS.laneRegular,
  medium: CANVAS_FONTS.laneMedium,
  bold: CANVAS_FONTS.laneBold,
  italic: CANVAS_FONTS.laneItalic,
  boldItalic: CANVAS_FONTS.laneBoldItalic,
}

function lowerBound(glyphs: Glyph[], x: number): number {
  let lo = 0
  let hi = glyphs.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (glyphs[mid].x < x) lo = mid + 1
    else hi = mid
  }
  return lo
}

export class Lane {
  readonly index: number
  readonly y: number
  readonly font: string
  readonly fontSize: number
  readonly tileH: number
  direction: 1 | -1
  speed: number
  private targetSpeed: number
  private offset = 0
  private glyphs: Glyph[] = []
  private total = 0
  private seed: number
  odds: TileOdds = { rate: 0.08, blank: 0.02, DL: 0.07, TL: 0.035, DW: 0.03, TW: 0.012 }

  /** Indices of glyphs currently on screen (rebuilt each update). */
  private visible: number[] = []
  private visibleX: number[] = []
  private visibleCount = 0

  constructor(opts: LaneOptions) {
    this.index = opts.index
    this.y = laneCenterY(opts.index)
    this.seed = opts.seed
    this.fontSize = opts.fontSize
    this.tileH = Math.round(opts.fontSize + 9)
    this.font = FONT_BUILDERS[opts.style](opts.fontSize)
    this.speed = opts.speed
    this.targetSpeed = opts.speed
    this.direction = opts.direction

    const measured = measureCharsInLine(opts.text, this.font)
    for (const m of measured) {
      const up = m.char.toUpperCase()
      this.glyphs.push({
        ch: m.char,
        x: m.x,
        w: m.width,
        letter: up >= 'A' && up <= 'Z' && up.length === 1 ? up : null,
        tile: null,
        taken: false,
        armed: false,
        cycle: 0,
        scale: 1,
        lift: 0,
      })
    }
    const last = measured[measured.length - 1]
    this.total = last ? last.x + last.width : GAME_WIDTH * 3
    this.offset = hash01(this.seed, this.index, 991) * this.total
  }

  setSpeed(speed: number, instant = false): void {
    this.targetSpeed = speed
    if (instant) this.speed = speed
  }

  rollAll(): void {
    for (let i = 0; i < this.glyphs.length; i++) this.roll(i)
  }

  private roll(i: number): void {
    const g = this.glyphs[i]
    g.tile = null
    g.taken = false
    g.scale = 1
    g.lift = 0
    g.cycle++
    if (!g.letter) return
    const n = this.glyphs.length
    for (let d = 1; d <= MIN_TILE_GAP; d++) {
      if (this.glyphs[(i + d) % n].tile || this.glyphs[(i - d + n) % n].tile) return
    }
    const chance = this.odds.rate * (LETTER_WEIGHT[g.letter] ?? 1)
    if (hash01(this.seed, this.index, i, g.cycle) >= chance) return
    const r = hash01(this.seed, this.index, i, g.cycle, 7)
    const o = this.odds
    let kind: TileKind = 'plain'
    let acc = o.blank
    if (r < acc) kind = 'blank'
    else if (r < (acc += o.TW)) kind = 'TW'
    else if (r < (acc += o.DW)) kind = 'DW'
    else if (r < (acc += o.TL)) kind = 'TL'
    else if (r < (acc += o.DL)) kind = 'DL'
    g.tile = kind
  }

  /** Stream coordinate of glyph i: 0 ↔ screen x = -PAD. */
  private streamPos(g: Glyph): number {
    let p = (g.x + this.offset) % this.total
    if (p < 0) p += this.total
    return p
  }

  /** Visit glyph indices whose stream position lies in [lo, hi). */
  private forRange(lo: number, hi: number, fn: (i: number) => void): void {
    const total = this.total
    let a = (lo - this.offset) % total
    if (a < 0) a += total
    const len = hi - lo
    const b = a + len
    const visit = (from: number, to: number) => {
      for (let i = lowerBound(this.glyphs, from); i < this.glyphs.length && this.glyphs[i].x < to; i++) fn(i)
    }
    if (b <= total) visit(a, b)
    else {
      visit(a, total)
      visit(0, b - total)
    }
  }

  update(dt: number, timeScale: number, cursorX: number, cursorY: number): void {
    this.speed += (this.targetSpeed - this.speed) * damp(2.5, dt)
    this.offset += this.speed * this.direction * dt * timeScale

    // Re-roll glyphs about to scroll in.
    const W = GAME_WIDTH + PAD * 2
    const [lo, hi] = this.direction > 0 ? [this.total - ENTRY, this.total] : [W, W + ENTRY]
    this.forRange(lo, hi, i => {
      if (this.glyphs[i].armed) {
        this.glyphs[i].armed = false
        this.roll(i)
      }
    })

    // Collect visible glyphs and apply the reading-lens effect near the cursor.
    this.visibleCount = 0
    const proximity = Math.max(0, 1 - Math.abs(cursorY - this.y) / 70)
    const k = damp(16, dt)
    this.forRange(0, W, i => {
      const g = this.glyphs[i]
      g.armed = true
      const sx = this.streamPos(g) - PAD
      const n = this.visibleCount++
      this.visible[n] = i
      this.visibleX[n] = sx
      let targetScale = 1
      let targetLift = 0
      if (proximity > 0) {
        const d = Math.abs(sx + g.w / 2 - cursorX)
        if (d < 130) {
          const t = smoothstep(1 - d / 130) * proximity
          targetScale = 1 + t * (g.tile ? 0.62 : 0.36)
          targetLift = -t * (g.tile ? 5 : 3)
        }
      }
      if (g.scale !== targetScale || g.lift !== targetLift) {
        g.scale += (targetScale - g.scale) * k
        g.lift += (targetLift - g.lift) * k
        if (Math.abs(g.scale - targetScale) < 0.002) g.scale = targetScale
        if (Math.abs(g.lift - targetLift) < 0.02) g.lift = targetLift
      }
    })
  }

  /** Prose text layer (under tiles). */
  renderText(ctx: CanvasRenderingContext2D, dim = 1): void {
    ctx.font = this.font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = COLORS.sepia
    const kk = view.k
    let lastAlpha = -1
    for (let n = 0; n < this.visibleCount; n++) {
      const g = this.glyphs[this.visible[n]]
      if (g.ch === ' ') continue
      if (g.tile && !g.taken) continue
      const cx = this.visibleX[n] + g.w / 2
      if (cx < BOARD_LEFT - 20 || cx > BOARD_RIGHT + 20) continue
      const lens = g.scale - 1
      let alpha = (g.taken ? 0.12 : 0.46 + Math.min(0.5, lens * 1.6)) * edgeFade(cx) * dim
      alpha = Math.round(alpha * 32) / 32
      if (alpha <= 0) continue
      if (alpha !== lastAlpha) {
        ctx.globalAlpha = alpha
        lastAlpha = alpha
      }
      const cy = this.y + curveY(cx) + g.lift
      if (g.scale > 1.004) {
        const s = g.scale * kk
        ctx.setTransform(s, 0, 0, s, cx * kk, cy * kk)
        ctx.fillText(g.ch, 0, 0)
        ctx.setTransform(kk, 0, 0, kk, 0, 0)
      } else {
        ctx.fillText(g.ch, cx, cy)
      }
    }
    ctx.globalAlpha = 1
  }

  /** Tile layer. */
  renderTiles(ctx: CanvasRenderingContext2D, dim = 1): void {
    for (let n = 0; n < this.visibleCount; n++) {
      const g = this.glyphs[this.visible[n]]
      if (!g.tile || g.taken) continue
      const cx = this.visibleX[n] + g.w / 2
      if (cx < BOARD_LEFT - 30 || cx > BOARD_RIGHT + 30) continue
      const fade = edgeFade(cx) * dim
      if (fade <= 0.01) continue
      ctx.globalAlpha = fade
      const cy = this.y + curveY(cx) + g.lift
      tileArt.draw(ctx, g.letter!, g.tile, this.tileH, cx, cy, g.scale * 0.92)
    }
    ctx.globalAlpha = 1
  }

  /** Nearest untaken tile whose centre is within `reach` of x. */
  findTile(x: number, reach: number): TileRef | null {
    let best: TileRef | null = null
    let bestD = reach
    for (let n = 0; n < this.visibleCount; n++) {
      const i = this.visible[n]
      const g = this.glyphs[i]
      if (!g.tile || g.taken) continue
      const cx = this.visibleX[n] + g.w / 2
      if (cx < BOARD_LEFT || cx > BOARD_RIGHT) continue
      const d = Math.abs(cx - x)
      if (d <= bestD) {
        bestD = d
        best = { lane: this, index: i }
      }
    }
    return best
  }

  /** Screen position of a tile, or null if it's gone/off screen. */
  tilePosition(index: number): { x: number; y: number; scale: number } | null {
    const g = this.glyphs[index]
    if (!g || !g.tile || g.taken) return null
    const sx = this.streamPos(g) - PAD
    const cx = sx + g.w / 2
    if (cx < BOARD_LEFT - 10 || cx > BOARD_RIGHT + 10) return null
    return { x: cx, y: this.y + curveY(cx) + g.lift, scale: g.scale * 0.92 }
  }

  tileInfo(index: number): { letter: string; kind: TileKind } | null {
    const g = this.glyphs[index]
    if (!g || !g.tile || g.taken || !g.letter) return null
    return { letter: g.letter, kind: g.tile }
  }

  take(index: number): void {
    const g = this.glyphs[index]
    if (g) g.taken = true
  }

  get tileWidthPx(): number {
    return tileWidth(this.tileH)
  }
}

export function edgeFade(x: number): number {
  const fadeW = 36
  if (x < BOARD_LEFT + fadeW) return Math.max(0, (x - BOARD_LEFT + 6) / (fadeW + 6))
  if (x > BOARD_RIGHT - fadeW) return Math.max(0, (BOARD_RIGHT + 6 - x) / (fadeW + 6))
  return 1
}
