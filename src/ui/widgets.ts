// ── Canvas UI widgets — buttons, panels, keycaps ──

import { CANVAS_FONTS, COLORS } from '../utils/constants'

export interface Button {
  id: string
  x: number
  y: number
  w: number
  h: number
  label: string
  icon?: string
  primary?: boolean
  enabled?: boolean
  hint?: string
}

export function hitButton(b: Button, x: number, y: number): boolean {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h
}

export function drawButton(ctx: CanvasRenderingContext2D, b: Button, hot: boolean, time = 0): void {
  const enabled = b.enabled !== false
  const r = Math.min(10, b.h / 2)
  ctx.save()
  ctx.globalAlpha = enabled ? 1 : 0.45
  const lift = hot && enabled ? 1.5 : 0
  // Shadow / depth
  ctx.fillStyle = b.primary ? '#7E5A12' : 'rgba(92, 64, 51, 0.28)'
  ctx.beginPath()
  ctx.roundRect(b.x, b.y + 3, b.w, b.h, r)
  ctx.fill()
  const y = b.y - lift
  if (b.primary) {
    const g = ctx.createLinearGradient(0, y, 0, y + b.h)
    g.addColorStop(0, hot ? '#E9C064' : '#DDB14F')
    g.addColorStop(1, hot ? '#C8912A' : '#B8860B')
    ctx.fillStyle = g
  } else {
    ctx.fillStyle = hot ? '#FFFDF7' : '#FAF6EC'
  }
  ctx.beginPath()
  ctx.roundRect(b.x, y, b.w, b.h, r)
  ctx.fill()
  ctx.strokeStyle = b.primary ? 'rgba(126, 90, 18, 0.9)' : hot ? 'rgba(184, 134, 11, 0.8)' : 'rgba(139, 115, 85, 0.45)'
  ctx.lineWidth = hot ? 1.5 : 1
  ctx.stroke()
  if (hot && enabled) {
    // Gentle shimmer to show focus
    const pulse = 0.5 + 0.5 * Math.sin(time * 5)
    ctx.strokeStyle = `rgba(212, 168, 67, ${0.25 + pulse * 0.3})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(b.x - 3, y - 3, b.w + 6, b.h + 6, r + 3)
    ctx.stroke()
  }

  const textColor = b.primary ? '#FFFBF0' : COLORS.espresso
  const size = Math.round(Math.min(22, b.h * 0.48))
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.font = CANVAS_FONTS.uiBold(size)
  const labelW = ctx.measureText(b.label).width
  // Reserve room on the right for a keyboard hint, if the button is wide enough.
  let hintW = 0
  if (b.hint) {
    ctx.font = CANVAS_FONTS.caps(10)
    hintW = ctx.measureText(b.hint).width + 14
    ctx.font = CANVAS_FONTS.uiBold(size)
    if (labelW + hintW * 2 + (b.icon ? size : 0) > b.w) hintW = -1
  }
  let cx = b.x + (b.w - Math.max(0, hintW)) / 2 + Math.max(0, hintW) / 4
  if (b.icon) {
    const iconSize = Math.round(size * 0.72)
    const gap = b.label ? 8 : 0
    const total = iconSize + gap + labelW
    const ix = cx - total / 2 + iconSize / 2
    ctx.font = CANVAS_FONTS.icons(iconSize)
    ctx.fillStyle = b.primary ? '#FFFBF0' : COLORS.gold
    ctx.fillText(b.icon, ix, y + b.h / 2 + 0.5)
    cx = ix + iconSize / 2 + gap + labelW / 2
    ctx.font = CANVAS_FONTS.uiBold(size)
  }
  ctx.fillStyle = textColor
  if (b.label) ctx.fillText(b.label, cx, y + b.h / 2 + 1)
  if (b.hint && hintW > 0) {
    ctx.font = CANVAS_FONTS.caps(10)
    ctx.fillStyle = b.primary ? 'rgba(255, 251, 240, 0.8)' : COLORS.muted
    ctx.textAlign = 'right'
    ctx.fillText(b.hint, b.x + b.w - 10, y + b.h / 2 + 1)
  }
  ctx.restore()
}

export function drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 14): void {
  ctx.save()
  ctx.fillStyle = 'rgba(44, 24, 16, 0.12)'
  ctx.beginPath()
  ctx.roundRect(x, y + 4, w, h, r)
  ctx.fill()
  ctx.fillStyle = '#FBF8F0'
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
  ctx.strokeStyle = 'rgba(184, 134, 11, 0.35)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.strokeStyle = 'rgba(184, 134, 11, 0.16)'
  ctx.beginPath()
  ctx.roundRect(x + 5, y + 5, w - 10, h - 10, Math.max(2, r - 5))
  ctx.stroke()
  ctx.restore()
}

export function drawKeycap(ctx: CanvasRenderingContext2D, label: string, cx: number, cy: number, minW = 24, icon = false): number {
  ctx.save()
  ctx.font = icon ? CANVAS_FONTS.icons(10) : CANVAS_FONTS.uiBold(13)
  const w = Math.max(minW, ctx.measureText(label).width + 12)
  const h = 22
  const x = cx - w / 2
  const y = cy - h / 2
  ctx.fillStyle = 'rgba(92, 64, 51, 0.25)'
  ctx.beginPath()
  ctx.roundRect(x, y + 2, w, h, 5)
  ctx.fill()
  ctx.fillStyle = '#FFFDF8'
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 5)
  ctx.fill()
  ctx.strokeStyle = 'rgba(139, 115, 85, 0.5)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = COLORS.sepia
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, cx, cy + 1)
  ctx.restore()
  return w
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  color: string,
  align: CanvasTextAlign = 'left',
  baseline: CanvasTextBaseline = 'middle',
): void {
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = baseline
  ctx.fillText(text, x, y)
}

export function drawFlourish(ctx: CanvasRenderingContext2D, cx: number, y: number, halfWidth: number, alpha = 1): void {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = 'rgba(184, 134, 11, 0.55)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(cx - halfWidth, y)
  ctx.lineTo(cx - 10, y)
  ctx.moveTo(cx + 10, y)
  ctx.lineTo(cx + halfWidth, y)
  ctx.stroke()
  ctx.fillStyle = COLORS.gold
  ctx.beginPath()
  ctx.moveTo(cx, y - 4)
  ctx.lineTo(cx + 4, y)
  ctx.lineTo(cx, y + 4)
  ctx.lineTo(cx - 4, y)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
