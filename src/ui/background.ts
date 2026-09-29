// ── Background — the open page, pre-rendered once per resolution ──

import { view } from '../core/view'
import { createRng } from '../core/rng'
import { GAME_HEIGHT, GAME_WIDTH, LANE_COUNT, LANE_HEIGHT, LANE_Y_START, BOARD_LEFT, BOARD_RIGHT, isMarginLane } from '../utils/constants'
import { curveY } from '../utils/curve'

let cache: HTMLCanvasElement | null = null
let cacheK = 0

function curvedLine(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number): void {
  ctx.beginPath()
  for (let x = x0; x <= x1; x += 6) {
    const cy = y + curveY(x)
    if (x === x0) ctx.moveTo(x, cy)
    else ctx.lineTo(x, cy)
  }
  ctx.stroke()
}

export function curvedBand(ctx: CanvasRenderingContext2D, x0: number, x1: number, top: number, bottom: number): void {
  ctx.beginPath()
  for (let x = x0; x <= x1; x += 10) ctx.lineTo(x, top + curveY(x))
  for (let x = x1; x >= x0; x -= 10) ctx.lineTo(x, bottom + curveY(x))
  ctx.closePath()
}

function build(): HTMLCanvasElement {
  const k = view.k
  const c = document.createElement('canvas')
  c.width = Math.ceil(GAME_WIDTH * k)
  c.height = Math.ceil(GAME_HEIGHT * k)
  const ctx = c.getContext('2d')!
  ctx.scale(k, k)

  // Paper
  const paper = ctx.createRadialGradient(GAME_WIDTH / 2, GAME_HEIGHT * 0.45, 80, GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 0.7)
  paper.addColorStop(0, '#F8F4EB')
  paper.addColorStop(1, '#EEE6D6')
  ctx.fillStyle = paper
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

  // Paper grain
  const rng = createRng(7)
  for (let i = 0; i < 5000; i++) {
    const x = rng() * GAME_WIDTH
    const y = rng() * GAME_HEIGHT
    ctx.fillStyle = rng() < 0.5 ? 'rgba(92, 64, 51, 0.035)' : 'rgba(255, 255, 255, 0.05)'
    ctx.fillRect(x, y, 1 + rng(), 1 + rng())
  }

  // Faint ruled lines
  ctx.strokeStyle = 'rgba(44, 24, 16, 0.035)'
  ctx.lineWidth = 0.6
  for (let y = 20; y < GAME_HEIGHT; y += 22) curvedLine(ctx, 0, GAME_WIDTH, y)

  // Margin lanes: a faint tint
  for (let i = 0; i < LANE_COUNT; i++) {
    if (!isMarginLane(i)) continue
    const top = LANE_Y_START + i * LANE_HEIGHT
    ctx.fillStyle = 'rgba(214, 196, 164, 0.18)'
    curvedBand(ctx, BOARD_LEFT - 8, BOARD_RIGHT + 8, top + 3, top + LANE_HEIGHT - 3)
    ctx.fill()
  }

  // Lane separators
  ctx.strokeStyle = 'rgba(44, 24, 16, 0.09)'
  ctx.lineWidth = 0.7
  for (let i = 0; i <= LANE_COUNT; i++) {
    curvedLine(ctx, BOARD_LEFT - 8, BOARD_RIGHT + 8, LANE_Y_START + i * LANE_HEIGHT)
  }

  // HUD rule
  ctx.strokeStyle = 'rgba(184, 134, 11, 0.28)'
  ctx.lineWidth = 1
  curvedLine(ctx, 60, GAME_WIDTH / 2 - 60, 104)
  curvedLine(ctx, GAME_WIDTH / 2 + 60, GAME_WIDTH - 60, 104)

  // Spine shading
  const spine = ctx.createLinearGradient(GAME_WIDTH / 2 - 60, 0, GAME_WIDTH / 2 + 60, 0)
  spine.addColorStop(0, 'rgba(92, 64, 51, 0)')
  spine.addColorStop(0.42, 'rgba(92, 64, 51, 0.07)')
  spine.addColorStop(0.5, 'rgba(60, 40, 30, 0.16)')
  spine.addColorStop(0.58, 'rgba(92, 64, 51, 0.07)')
  spine.addColorStop(1, 'rgba(92, 64, 51, 0)')
  ctx.fillStyle = spine
  ctx.fillRect(GAME_WIDTH / 2 - 60, 0, 120, GAME_HEIGHT)

  // Page edges
  const left = ctx.createLinearGradient(0, 0, 44, 0)
  left.addColorStop(0, 'rgba(92, 64, 51, 0.16)')
  left.addColorStop(1, 'rgba(92, 64, 51, 0)')
  ctx.fillStyle = left
  ctx.fillRect(0, 0, 44, GAME_HEIGHT)
  const right = ctx.createLinearGradient(GAME_WIDTH, 0, GAME_WIDTH - 44, 0)
  right.addColorStop(0, 'rgba(92, 64, 51, 0.16)')
  right.addColorStop(1, 'rgba(92, 64, 51, 0)')
  ctx.fillStyle = right
  ctx.fillRect(GAME_WIDTH - 44, 0, 44, GAME_HEIGHT)
  const vignette = ctx.createRadialGradient(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_HEIGHT * 0.45, GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 0.62)
  vignette.addColorStop(0, 'rgba(92, 64, 51, 0)')
  vignette.addColorStop(1, 'rgba(92, 64, 51, 0.1)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
  return c
}

export function drawBackground(ctx: CanvasRenderingContext2D): void {
  if (!cache || cacheK !== view.k) {
    cache = build()
    cacheK = view.k
  }
  ctx.drawImage(cache, 0, 0, GAME_WIDTH, GAME_HEIGHT)
}

// The open-book silhouette (logical px). Everything outside it is erased each frame
// with one pre-rendered mask — far cheaper than a CSS clip-path on a live canvas.
const PAGE_PATH = 'M 26 606 L 26 34 Q 26 16 40 16 Q 138 13 245 14 Q 350 19 450 26 Q 550 19 655 14 Q 762 13 860 16 Q 874 16 874 34 L 874 606 Q 874 624 860 624 Q 762 622 655 621 Q 550 624 450 628 Q 350 624 245 621 Q 138 622 40 624 Q 26 624 26 606 Z'

let mask: HTMLCanvasElement | null = null
let maskK = 0

export function eraseOutsidePage(ctx: CanvasRenderingContext2D): void {
  if (!mask || maskK !== view.k) {
    const k = view.k
    mask = document.createElement('canvas')
    mask.width = Math.ceil(GAME_WIDTH * k)
    mask.height = Math.ceil(GAME_HEIGHT * k)
    const m = mask.getContext('2d')!
    m.scale(k, k)
    m.fillStyle = '#000'
    m.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    m.globalCompositeOperation = 'destination-out'
    m.fill(new Path2D(PAGE_PATH))
    maskK = k
  }
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.drawImage(mask, 0, 0, GAME_WIDTH, GAME_HEIGHT)
  ctx.restore()
}
