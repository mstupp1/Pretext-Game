// ── Tiles — tile types, palette and cached sprite art ──

import { CANVAS_FONTS, FONTS, LETTER_VALUES } from '../utils/constants'

export type TileKind = 'plain' | 'DL' | 'TL' | 'DW' | 'TW' | 'blank'

export interface TilePalette {
  top: string
  bottom: string
  border: string
  depth: string
  text: string
  glow: string
  name: string
  tag: string
}

export const TILE_PALETTES: Record<TileKind, TilePalette> = {
  plain: { top: '#F8DC9C', bottom: '#E4AA4E', border: '#B67F27', depth: '#8F5F1C', text: '#3A2414', glow: 'rgba(228,170,78,0.55)', name: 'Letter', tag: '' },
  DL: { top: '#9CC8F0', bottom: '#4E8ED0', border: '#3A6FA8', depth: '#2A547F', text: '#FFFFFF', glow: 'rgba(78,142,208,0.55)', name: 'Double Letter', tag: '2L' },
  TL: { top: '#6CD6C8', bottom: '#1E9A8C', border: '#177C72', depth: '#0F5C55', text: '#FFFFFF', glow: 'rgba(30,154,140,0.55)', name: 'Triple Letter', tag: '3L' },
  DW: { top: '#F6958A', bottom: '#D8473A', border: '#B23A2E', depth: '#852A21', text: '#FFFFFF', glow: 'rgba(216,71,58,0.55)', name: 'Double Word', tag: '2W' },
  TW: { top: '#C08BD8', bottom: '#8140A5', border: '#6B3290', depth: '#4E2369', text: '#FFFFFF', glow: 'rgba(129,64,165,0.6)', name: 'Triple Word', tag: '3W' },
  blank: { top: '#FFFEFA', bottom: '#EFE6D3', border: '#C4A56C', depth: '#A88A55', text: '#B08E52', glow: 'rgba(196,165,108,0.55)', name: 'Blank · any letter', tag: '' },
}

export function letterValue(letter: string): number {
  return LETTER_VALUES[letter] ?? 0
}

export type PowerKind = 'time' | 'slow' | 'flow' | 'double'

export const POWERS: Record<PowerKind, { icon: string; color: string; name: string; blurb: string }> = {
  time: { icon: '', color: '#B8860B', name: 'Hourglass', blurb: '+8 seconds' },
  slow: { icon: '', color: '#3A6FA8', name: 'Bookmark', blurb: 'The page slows' },
  flow: { icon: '', color: '#3E7A2A', name: 'Quill', blurb: 'Flow rises' },
  double: { icon: '', color: '#6B3290', name: 'Lens', blurb: 'Next word ×2' },
}

/**
 * Draw a tile centred at (0, 0) in the current transform.
 * Width/height are logical px of the tile face (depth sits below).
 */
export function drawTileFace(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  letter: string,
  kind: TileKind,
  showValue: boolean,
  showTag: boolean,
): void {
  const p = TILE_PALETTES[kind]
  const r = Math.max(3, h * 0.16)
  const depth = Math.max(2, h * 0.09)
  const x = -w / 2
  const y = -h / 2

  // Soft contact shadow
  ctx.fillStyle = 'rgba(44, 24, 16, 0.16)'
  ctx.beginPath()
  ctx.roundRect(x + 0.5, y + depth + 1.5, w - 1, h, r)
  ctx.fill()

  // Depth
  ctx.fillStyle = p.depth
  ctx.beginPath()
  ctx.roundRect(x, y + depth, w, h, r)
  ctx.fill()

  // Face
  const grad = ctx.createLinearGradient(0, y, 0, y + h)
  grad.addColorStop(0, p.top)
  grad.addColorStop(1, p.bottom)
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()

  // Bevel highlight
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
  ctx.lineWidth = Math.max(0.75, h * 0.03)
  ctx.beginPath()
  ctx.roundRect(x + 1, y + 1, w - 2, h - 2, r - 1)
  ctx.stroke()
  ctx.strokeStyle = p.border
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.stroke()

  if (kind === 'blank') {
    ctx.setLineDash([2.5, 2.5])
    ctx.strokeStyle = p.border
    ctx.beginPath()
    ctx.roundRect(x + 3, y + 3, w - 6, h - 6, Math.max(2, r - 2))
    ctx.stroke()
    ctx.setLineDash([])
  }

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const glyph = kind === 'blank' ? (letter || '?') : letter
  ctx.font = CANVAS_FONTS.uiBold(Math.round(h * 0.66))
  // Letterpress: faint light edge under the ink
  const dark = p.text !== '#FFFFFF'
  ctx.fillStyle = dark ? 'rgba(255, 248, 230, 0.6)' : 'rgba(0, 0, 0, 0.22)'
  ctx.fillText(glyph, 0, h * 0.02 + 1)
  ctx.fillStyle = kind === 'blank' && letter ? '#8A6A34' : p.text
  ctx.fillText(glyph, 0, h * 0.02)

  if (showValue && kind !== 'blank') {
    const v = letterValue(letter)
    ctx.font = `800 ${Math.max(6, Math.round(h * 0.25))}px ${FONTS.display}`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = dark ? 'rgba(58, 36, 20, 0.8)' : 'rgba(255, 255, 255, 0.9)'
    ctx.fillText(String(v), w / 2 - h * 0.1, h / 2 - h * 0.08)
  }

  if (showTag && p.tag) {
    ctx.font = `800 ${Math.max(6, Math.round(h * 0.22))}px ${FONTS.display}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
    ctx.fillText(p.tag, x + h * 0.1, y + h * 0.06)
  }
}

interface Sprite {
  canvas: HTMLCanvasElement
  /** Logical size of the sprite canvas. */
  w: number
  h: number
}

/** Pre-renders tiles to offscreen canvases so lanes only issue drawImage calls. */
export class TileArt {
  private cache = new Map<string, Sprite>()
  private res = 1

  setResolution(k: number): void {
    // Sprites are drawn up to ~1.7x by the lens — bake that in so they stay sharp.
    const res = Math.min(6, Math.max(1, k * 1.75))
    if (Math.abs(res - this.res) > 0.01) {
      this.res = res
      this.cache.clear()
    }
  }

  get(letter: string, kind: TileKind, h: number, showValue = true, showTag = false): Sprite {
    const key = `${kind}|${letter}|${h}|${showValue ? 1 : 0}${showTag ? 1 : 0}`
    let sprite = this.cache.get(key)
    if (sprite) return sprite
    const w = tileWidth(h)
    const pad = 3
    const sw = w + pad * 2
    const sh = h + pad * 2 + h * 0.12 + 2
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(sw * this.res)
    canvas.height = Math.ceil(sh * this.res)
    const ctx = canvas.getContext('2d')!
    ctx.scale(this.res, this.res)
    ctx.translate(sw / 2, pad + h / 2)
    drawTileFace(ctx, w, h, letter, kind, showValue, showTag)
    sprite = { canvas, w: sw, h: sh }
    this.cache.set(key, sprite)
    return sprite
  }

  /** Draw a cached tile centred at (cx, cy) with a uniform scale. */
  draw(ctx: CanvasRenderingContext2D, letter: string, kind: TileKind, h: number, cx: number, cy: number, scale = 1, showValue = true, showTag = false): void {
    const s = this.get(letter, kind, h, showValue, showTag)
    const pad = 3
    const dw = s.w * scale
    const dh = s.h * scale
    ctx.drawImage(s.canvas, cx - dw / 2, cy - (pad + h / 2) * scale, dw, dh)
  }
}

export function tileWidth(h: number): number {
  return Math.round(h * 0.88)
}

export const tileArt = new TileArt()
