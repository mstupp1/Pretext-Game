// ── TextEngine — Pretext integration for text measurement & canvas rendering ──

import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext'
import type { PreparedTextWithSegments } from '@chenglou/pretext'

export interface MeasuredChar {
  char: string
  x: number
  width: number
}

export interface MeasuredLine {
  text: string
  width: number
  chars: MeasuredChar[]
}

// Cache for prepared text to avoid re-measuring
const prepareCache = new Map<string, PreparedTextWithSegments>()

function getCacheKey(text: string, font: string): string {
  return `${font}|||${text}`
}

export function prepareText(text: string, font: string): PreparedTextWithSegments {
  const key = getCacheKey(text, font)
  let prepared = prepareCache.get(key)
  if (!prepared) {
    prepared = prepareWithSegments(text, font)
    prepareCache.set(key, prepared)
    // Keep cache bounded
    if (prepareCache.size > 500) {
      const firstKey = prepareCache.keys().next().value
      if (firstKey) prepareCache.delete(firstKey)
    }
  }
  return prepared
}

export function measureLines(text: string, font: string, maxWidth: number, lineHeight: number): MeasuredLine[] {
  const prepared = prepareText(text, font)
  const { lines } = layoutWithLines(prepared, maxWidth, lineHeight)

  return lines.map(line => {
    const chars = measureCharsInLine(line.text, font)
    return {
      text: line.text,
      width: line.width,
      chars,
    }
  })
}

// Measure individual character widths using Pretext
// This is used for per-character rendering and physics
export function measureCharsInLine(text: string, font: string): MeasuredChar[] {
  const chars: MeasuredChar[] = []
  let x = 0

  // Measure each character individually for precise positioning
  // We use a canvas measureText for single chars (fast enough for our use case)
  const canvas = getSharedCanvas()
  canvas.font = font

  for (const char of text) {
    const width = canvas.measureText(char).width
    chars.push({ char, x, width })
    x += width
  }

  return chars
}

// Measure a single string's width
export function measureTextWidth(text: string, font: string): number {
  const canvas = getSharedCanvas()
  canvas.font = font
  return canvas.measureText(text).width
}

// Shared offscreen canvas context for measurements
let sharedCtx: CanvasRenderingContext2D | null = null

function getSharedCanvas(): CanvasRenderingContext2D {
  if (!sharedCtx) {
    const c = document.createElement('canvas')
    c.width = 1
    c.height = 1
    sharedCtx = c.getContext('2d')!
  }
  return sharedCtx
}

// Render a line of text character-by-character with optional per-char transforms
export function renderTextLine(
  ctx: CanvasRenderingContext2D,
  chars: MeasuredChar[],
  baseX: number,
  baseY: number,
  font: string,
  color: string,
  transforms?: Map<number, { dx: number; dy: number; scale: number; alpha: number }>,
): void {
  ctx.font = font
  ctx.textBaseline = 'middle'

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    const transform = transforms?.get(i)

    if (transform) {
      ctx.save()
      const cx = baseX + ch.x + ch.width / 2
      const cy = baseY
      ctx.translate(cx + transform.dx, cy + transform.dy)
      ctx.scale(transform.scale, transform.scale)
      ctx.globalAlpha = transform.alpha
      ctx.fillStyle = color
      ctx.fillText(ch.char, -ch.width / 2, 0)
      ctx.restore()
    } else {
      ctx.fillStyle = color
      ctx.fillText(ch.char, baseX + ch.x, baseY)
    }
  }
}

// Render a string simply (no per-char effects)
export function renderText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  color: string,
  align: CanvasTextAlign = 'left',
): void {
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y)
  ctx.textAlign = 'left' // reset
}

export function clearPrepareCache(): void {
  prepareCache.clear()
}
