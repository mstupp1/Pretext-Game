// ── Renderer — draws every screen of the game onto the canvas ──

import type { Game } from '../game/Game'
import { Lane } from '../game/Lane'
import { PowerLane } from '../game/PowerLane'
import { flowWindow, FLOW_LEVELS } from '../game/Scoring'
import { POWERS, TILE_PALETTES, tileArt, type TileKind } from '../game/Tiles'
import { TRAY } from '../game/Tray'
import { view, resetTransform } from '../core/view'
import { save } from '../core/storage'
import { todayKey } from '../core/rng'
import { measureLines } from '../text/TextEngine'
import {
  BOARD_LEFT, BOARD_RIGHT, CANVAS_FONTS, COLORS, GAME_HEIGHT, GAME_WIDTH, LANE_HEIGHT, LANE_Y_START,
  chapterThreshold, toRoman,
} from '../utils/constants'
import { curveY } from '../utils/curve'
import { clamp, easeOutBack, easeOutCubic } from '../utils/math'
import { drawBackground, curvedBand, eraseOutsidePage } from './background'
import { drawButton, drawFlourish, drawKeycap, drawPanel, drawText, type Button } from './widgets'

export function renderFrame(g: Game, ctx: CanvasRenderingContext2D): void {
  resetTransform(ctx)
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
  drawBackground(ctx)

  const shake = view.reducedMotion ? 0 : g.shake
  if (shake > 0) {
    const s = shake * 3
    ctx.translate(Math.sin(g.time * 80) * s, Math.cos(g.time * 67) * s * 0.6)
  }

  switch (g.state) {
    case 'title':
      renderBoard(g, ctx, 0.2, false)
      renderTitle(g, ctx)
      break
    case 'gameover':
      renderBoard(g, ctx, 0.1, false)
      renderGameOver(g, ctx)
      break
    default:
      renderBoard(g, ctx, 1, g.state === 'playing' || g.state === 'paused')
      renderHud(g, ctx)
      renderTray(g, ctx)
      break
  }

  g.particles.render(ctx)
  renderFloaters(g, ctx)
  renderMessage(g, ctx)
  renderBanner(g, ctx)
  if (g.state === 'countdown') renderCountdown(g, ctx)
  if (g.state === 'ending') renderEnding(g, ctx)
  if (g.state === 'paused') renderPause(g, ctx)
  resetTransform(ctx)
  eraseOutsidePage(ctx)
}

// ── Board ──

function renderBoard(g: Game, ctx: CanvasRenderingContext2D, dim: number, active: boolean): void {
  if (active) {
    const top = LANE_Y_START + g.cursor.lane * LANE_HEIGHT
    ctx.fillStyle = `rgba(212, 168, 67, ${0.08 + g.laneFlash * 0.08})`
    curvedBand(ctx, BOARD_LEFT - 8, BOARD_RIGHT + 8, top + 1, top + LANE_HEIGHT - 1)
    ctx.fill()
  }
  for (const lane of g.board) {
    if (lane instanceof PowerLane) lane.renderBase(ctx, dim)
    else lane.renderText(ctx, dim)
  }
  for (const lane of g.board) {
    if (lane instanceof Lane) lane.renderTiles(ctx, dim)
    else lane.renderItems(ctx, g.time, active && g.cursor.lane === lane.index ? g.cursor.x : null, dim)
  }
  if (active) {
    renderTarget(g, ctx)
    g.cursor.render(ctx, g.laneFlash)
  }
}

function renderTarget(g: Game, ctx: CanvasRenderingContext2D): void {
  const t = g.target
  if (!t) return
  const pulse = 0.5 + 0.5 * Math.sin(g.time * 9)
  const halfH = 13 * t.scale + 5 + pulse * 1.5
  const halfW = t.power ? halfH : halfH * 0.9
  const color = t.power ? POWERS[t.power].color : t.kind && t.kind !== 'plain' ? TILE_PALETTES[t.kind].border : COLORS.gold
  const len = 6
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const x = t.x + sx * halfW
    const y = t.y + sy * halfH
    ctx.moveTo(x, y - sy * len)
    ctx.lineTo(x, y)
    ctx.lineTo(x - sx * len, y)
  }
  ctx.stroke()
  ctx.lineCap = 'butt'

  const label = t.power ? `${POWERS[t.power].name} · ${POWERS[t.power].blurb}` : t.kind && t.kind !== 'plain' ? TILE_PALETTES[t.kind].name : ''
  if (label) pill(ctx, label, t.x, t.y - halfH - 13, 11, color, '#FFFDF7')
}

function pill(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, size: number, bg: string, fg: string, alpha = 1): void {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.font = CANVAS_FONTS.caps(size)
  const w = ctx.measureText(text).width + size * 1.6
  const h = size + 9
  const x = clamp(cx - w / 2, 40, GAME_WIDTH - 40 - w)
  ctx.fillStyle = bg
  ctx.beginPath()
  ctx.roundRect(x, cy - h / 2, w, h, h / 2)
  ctx.fill()
  ctx.fillStyle = fg
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + w / 2, cy + 1)
  ctx.restore()
}

// ── HUD ──

function renderHud(g: Game, ctx: CanvasRenderingContext2D): void {
  // Score (left page)
  drawText(ctx, g.mode === 'daily' ? 'SCORE · DAILY PAGE' : 'SCORE', 64, 36, CANVAS_FONTS.caps(11), COLORS.muted)
  drawText(ctx, Math.round(g.displayScore).toLocaleString(), 62, 67, CANVAS_FONTS.uiBold(34), COLORS.espresso)

  const prev = g.chapter > 1 ? chapterThreshold(g.chapter - 1) : 0
  const next = chapterThreshold(g.chapter)
  const progress = clamp((g.displayScore - prev) / (next - prev), 0, 1)
  drawText(ctx, `Chapter ${toRoman(g.chapter)}`, 382, 38, CANVAS_FONTS.laneItalic(18), COLORS.sepia, 'right')
  drawText(ctx, `NEXT ${next.toLocaleString()}`, 382, 70, CANVAS_FONTS.caps(10), COLORS.muted, 'right')
  bar(ctx, 64, 88, 318, 5, progress, COLORS.gold)

  // Timer (spine)
  renderTimer(g, ctx, GAME_WIDTH / 2, 58)

  // Flow (right page)
  const level = g.flowLevel
  const mult = FLOW_LEVELS[level]
  drawText(ctx, 'FLOW', 520, 36, CANVAS_FONTS.caps(11), COLORS.muted)
  const multColor = level >= 4 ? '#B23A2E' : level >= 2 ? COLORS.gold : COLORS.espresso
  drawText(ctx, `×${mult}`, 518, 67, CANVAS_FONTS.uiBold(34), multColor)
  for (let i = 1; i < FLOW_LEVELS.length; i++) {
    ctx.fillStyle = i <= level ? COLORS.gold : 'rgba(139, 115, 85, 0.25)'
    ctx.beginPath()
    ctx.arc(600 + i * 12, 62, i <= level ? 4 : 3, 0, Math.PI * 2)
    ctx.fill()
  }
  const flowFrac = level > 0 ? clamp(g.flowTimer / flowWindow(level), 0, 1) : 0
  const urgent = level > 0 && g.flowTimer < 2.5
  const flicker = urgent ? 0.55 + 0.45 * Math.sin(g.time * 14) : 1
  ctx.globalAlpha = flicker
  bar(ctx, 520, 88, 280, 5, flowFrac, urgent ? '#B23A2E' : '#C9922E')
  ctx.globalAlpha = 1
  if (level === 0) drawText(ctx, 'ink words quickly to build flow', 610, 36, CANVAS_FONTS.laneItalic(13), COLORS.faint)

  // Active powers
  let px = 790
  if (g.lensCharges > 0) {
    powerBadge(ctx, px, 58, POWERS.double.icon, POWERS.double.color, `×2${g.lensCharges > 1 ? ' ×' + g.lensCharges : ''}`)
    px -= 58
  }
  if (g.slowTimer > 0) {
    powerBadge(ctx, px, 58, POWERS.slow.icon, POWERS.slow.color, `${Math.ceil(g.slowTimer)}s`)
  }

  for (const b of g.buttons) if (b.id === 'pause') drawButton(ctx, b, g.hot === b.id, g.time)
}

function powerBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, icon: string, color: string, text: string): void {
  ctx.fillStyle = '#FFFDF6'
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(cx - 26, cy - 13, 52, 26, 13)
  ctx.fill()
  ctx.stroke()
  drawText(ctx, icon, cx - 12, cy + 1, CANVAS_FONTS.icons(11), color, 'center')
  drawText(ctx, text, cx + 8, cy + 1, CANVAS_FONTS.uiBold(13), color, 'center')
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, color: string): void {
  ctx.fillStyle = 'rgba(139, 115, 85, 0.18)'
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, h / 2)
  ctx.fill()
  if (frac > 0.001) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.roundRect(x, y, Math.max(h, w * frac), h, h / 2)
    ctx.fill()
  }
}

function renderTimer(g: Game, ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  const t = g.timeLeft
  const low = t <= 10
  const pulse = low ? 0.5 + 0.5 * Math.sin(g.time * (t <= 5 ? 14 : 8)) : 0
  const pop = 1 + easeOutCubic(g.timerPulse) * 0.12 + pulse * 0.04
  const r = 34 * pop
  ctx.save()
  ctx.fillStyle = 'rgba(44, 24, 16, 0.1)'
  ctx.beginPath()
  ctx.arc(cx, cy + 3, r + 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#FFFDF7'
  ctx.beginPath()
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(184, 134, 11, 0.25)'
  ctx.lineWidth = 1
  ctx.stroke()
  // Track
  ctx.lineWidth = 5
  ctx.strokeStyle = 'rgba(139, 115, 85, 0.15)'
  ctx.beginPath()
  ctx.arc(cx, cy, r - 3, 0, Math.PI * 2)
  ctx.stroke()
  // Remaining
  const frac = clamp(t / 60, 0, 1)
  ctx.strokeStyle = low ? `rgb(${178 + pulse * 40}, 58, 46)` : g.timerPulse > 0 ? COLORS.green : COLORS.gold
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(cx, cy, r - 3, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2)
  ctx.stroke()
  if (t > 60) {
    // Overflow ring for banked time beyond a minute.
    ctx.lineWidth = 2
    ctx.strokeStyle = COLORS.green
    ctx.beginPath()
    ctx.arc(cx, cy, r + 1.5, -Math.PI / 2, -Math.PI / 2 + clamp((t - 60) / 39, 0, 1) * Math.PI * 2)
    ctx.stroke()
  }
  ctx.lineCap = 'butt'
  drawText(ctx, String(Math.ceil(t)), cx, cy - 2, CANVAS_FONTS.uiBold(Math.round(26 * pop)), low ? '#A8321E' : COLORS.espresso, 'center')
  drawText(ctx, 'SEC', cx, cy + 17, CANVAS_FONTS.caps(9), COLORS.muted, 'center')
  ctx.restore()
}

// ── Tray ──

function renderTray(g: Game, ctx: CanvasRenderingContext2D): void {
  g.tray.renderPanel(ctx, g.status === 'valid', g.time)
  g.tray.renderTiles(ctx)

  const x = 594
  const right = 838
  const p = g.preview
  let status = ''
  let color: string = COLORS.muted
  let italic = true
  switch (g.status) {
    case 'empty': status = 'Catch letters to fill your tray'; break
    case 'short': status = 'A word needs 3+ letters'; break
    case 'checking': status = 'Consulting the lexicon…'; break
    case 'valid': status = g.resolvedWord; color = COLORS.espresso; italic = false; break
    case 'invalid': status = 'Not in the lexicon'; color = '#A8321E'; break
    case 'used': status = 'Already inked this run'; color = '#A8321E'; break
  }
  ctx.save()
  // Readable ink on the wood
  ctx.fillStyle = 'rgba(251, 247, 238, 0.86)'
  ctx.beginPath()
  ctx.roundRect(x - 6, TRAY.y + 8, right - x + 12, 34, 8)
  ctx.fill()
  drawText(ctx, status, x + 2, TRAY.y + 20, italic ? CANVAS_FONTS.laneItalic(15) : CANVAS_FONTS.uiBold(16), color)
  if (p && g.status !== 'empty') {
    const value = g.status === 'valid' ? `+${p.total}` : `${p.total}`
    drawText(ctx, value, right, TRAY.y + 22, CANVAS_FONTS.uiBold(g.status === 'valid' ? 22 : 16), g.status === 'valid' ? COLORS.gold : COLORS.faint, 'right')
    const parts = [`${p.letters}${p.lengthBonus ? ` + ${p.lengthBonus}` : ''}`]
    if (p.wordMultiplier > 1) parts.push(`×${p.wordMultiplier} word`)
    if (p.flow > 1) parts.push(`×${p.flow} flow`)
    if (p.lens > 1) parts.push('×2 lens')
    parts.push(`+${p.timeBonus}s`)
    drawText(ctx, parts.join('  ·  '), x + 2, TRAY.y + 35, CANVAS_FONTS.caps(9.5), COLORS.muted)
  }
  ctx.restore()
  for (const b of g.buttons) if (b.id === 'ink' || b.id === 'undo') drawButton(ctx, b, g.hot === b.id, g.time)
}

// ── Messages & effects ──

function renderFloaters(g: Game, ctx: CanvasRenderingContext2D): void {
  for (const f of g.floaters) {
    const life = f.t / f.life
    const alpha = life < 0.15 ? life / 0.15 : 1 - Math.max(0, (life - 0.6) / 0.4)
    const s = 0.8 + easeOutBack(Math.min(1, f.t / 0.25)) * 0.2
    ctx.save()
    ctx.globalAlpha = clamp(alpha, 0, 1)
    ctx.translate(f.x, f.y + curveY(f.x) * 0.3)
    ctx.scale(s, s)
    ctx.font = f.italic ? CANVAS_FONTS.laneBoldItalic(f.size) : CANVAS_FONTS.uiBold(f.size)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.lineWidth = Math.max(3, f.size * 0.16)
    ctx.strokeStyle = 'rgba(248, 244, 235, 0.92)'
    ctx.strokeText(f.text, 0, 0)
    ctx.fillStyle = f.color
    ctx.fillText(f.text, 0, 0)
    ctx.restore()
  }
}

function renderMessage(g: Game, ctx: CanvasRenderingContext2D): void {
  if (g.state !== 'playing' && g.state !== 'gameover' && g.state !== 'countdown') return
  const y = g.state === 'gameover' ? 600 : TRAY.y - 12
  const cx = g.state === 'gameover' ? 225 : TRAY.tilesCenterX
  if (g.toast) {
    const t = g.toast.t
    const a = Math.min(1, t / 0.12) * (1 - Math.max(0, (t - 1.8) / 0.4))
    const lift = (1 - easeOutCubic(Math.min(1, t / 0.2))) * 6
    pill(ctx, g.toast.text, cx, y + lift, 12, g.toast.bad ? '#A8321E' : COLORS.green, '#FFFDF7', a)
  } else if (g.hint) {
    const a = 0.75 + 0.25 * Math.sin(g.time * 3)
    pill(ctx, g.hint, cx, y, 12, 'rgba(44, 24, 16, 0.82)', '#F8E7BF', a)
  }
}

function renderBanner(g: Game, ctx: CanvasRenderingContext2D): void {
  const b = g.banner
  if (!b) return
  const a = Math.min(1, b.t / 0.3) * (1 - Math.max(0, (b.t - 2.1) / 0.5))
  const y = 300
  ctx.save()
  ctx.globalAlpha = a * 0.9
  const band = ctx.createLinearGradient(0, 0, GAME_WIDTH, 0)
  band.addColorStop(0, 'rgba(248, 244, 235, 0)')
  band.addColorStop(0.25, 'rgba(248, 244, 235, 0.95)')
  band.addColorStop(0.75, 'rgba(248, 244, 235, 0.95)')
  band.addColorStop(1, 'rgba(248, 244, 235, 0)')
  ctx.fillStyle = band
  ctx.fillRect(0, y - 52, GAME_WIDTH, 104)
  ctx.globalAlpha = a
  const s = 0.9 + easeOutBack(Math.min(1, b.t / 0.45)) * 0.1
  ctx.translate(GAME_WIDTH / 2, y)
  ctx.scale(s, s)
  drawText(ctx, b.title, 0, -10, CANVAS_FONTS.title(48), COLORS.espresso, 'center')
  drawFlourish(ctx, 0, 22, 140)
  drawText(ctx, b.sub.toUpperCase(), 0, 40, CANVAS_FONTS.caps(12), COLORS.gold, 'center')
  ctx.restore()
}

function renderCountdown(g: Game, ctx: CanvasRenderingContext2D): void {
  const phase = 1 - g.countdownTimer / 0.62
  const label = g.countdown > 0 ? String(g.countdown) : 'Begin!'
  const s = 0.6 + easeOutBack(Math.min(1, phase * 2.2)) * 0.4
  const a = 1 - Math.max(0, (phase - 0.7) / 0.3)
  ctx.save()
  ctx.globalAlpha = 0.55
  ctx.fillStyle = 'rgba(248, 244, 235, 0.8)'
  ctx.beginPath()
  ctx.arc(GAME_WIDTH / 2, 312, 76, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = a
  ctx.translate(GAME_WIDTH / 2, 312)
  ctx.scale(s, s)
  ctx.lineWidth = 6
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(248, 244, 235, 0.95)'
  ctx.font = CANVAS_FONTS.title(g.countdown > 0 ? 120 : 76)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.strokeText(label, 0, 0)
  ctx.fillStyle = COLORS.espresso
  ctx.fillText(label, 0, 0)
  ctx.restore()
}

function renderEnding(g: Game, ctx: CanvasRenderingContext2D): void {
  const t = g.endingT
  ctx.save()
  ctx.globalAlpha = Math.min(0.7, t * 0.6)
  ctx.fillStyle = '#F5F1E8'
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
  ctx.globalAlpha = Math.min(1, t / 0.3)
  const s = 0.85 + easeOutBack(Math.min(1, t / 0.5)) * 0.15
  ctx.translate(GAME_WIDTH / 2, 300)
  ctx.scale(s, s)
  drawText(ctx, 'THE INK RUNS DRY', 0, -46, CANVAS_FONTS.caps(13), COLORS.muted, 'center')
  drawText(ctx, 'Time!', 0, 6, CANVAS_FONTS.title(84), COLORS.espresso, 'center')
  drawFlourish(ctx, 0, 60, 120)
  ctx.restore()
}

// ── Pause ──

function renderPause(g: Game, ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(245, 241, 232, 0.78)'
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
  if (g.confirmQuit) {
    drawPanel(ctx, 300, 220, 300, 180)
    drawText(ctx, 'Quit this run?', GAME_WIDTH / 2, 262, CANVAS_FONTS.title(34), COLORS.espresso, 'center')
    drawText(ctx, 'Your page will not be scored.', GAME_WIDTH / 2, 298, CANVAS_FONTS.laneItalic(16), COLORS.sepia, 'center')
  } else {
    drawPanel(ctx, 310, 150, 280, 350)
    drawText(ctx, 'Paused', GAME_WIDTH / 2, 190, CANVAS_FONTS.title(42), COLORS.espresso, 'center')
    drawText(ctx, `CHAPTER ${toRoman(g.chapter)}  ·  ${g.score.toLocaleString()} PTS`, GAME_WIDTH / 2, 222, CANVAS_FONTS.caps(11), COLORS.muted, 'center')
    // Tile legend
    const kinds: TileKind[] = ['DL', 'TL', 'DW', 'TW', 'blank']
    kinds.forEach((k, i) => {
      const x = 356 + i * 47
      tileArt.draw(ctx, k === 'blank' ? '' : 'A', k, 22, x, 456, 1, false, false)
      drawText(ctx, TILE_PALETTES[k].tag || 'WILD', x, 479, CANVAS_FONTS.caps(9), COLORS.muted, 'center')
    })
  }
  for (const b of g.buttons) drawButton(ctx, b, g.hot === b.id, g.time)
}

// ── Title ──

let helpLines: string[] | null = null

function renderTitle(g: Game, ctx: CanvasRenderingContext2D): void {
  const intro = clamp(g.time / 1.2, 0, 1)
  const a = easeOutCubic(intro)

  // Soft veil so the drifting prose reads as texture.
  ctx.fillStyle = 'rgba(248, 244, 235, 0.55)'
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

  ctx.save()
  ctx.globalAlpha = a
  // Right page — title & menu
  const cx = 680
  drawText(ctx, 'Lexicon', cx, 170 + (1 - a) * 10, CANVAS_FONTS.title(76), COLORS.espresso, 'center')
  drawText(ctx, 'Crossing', cx, 238 + (1 - a) * 14, CANVAS_FONTS.title(76), COLORS.gold, 'center')
  drawFlourish(ctx, cx, 286, 110)
  drawText(ctx, 'A TYPOGRAPHIC WORD CHASE', cx, 310, CANVAS_FONTS.caps(12), COLORS.muted, 'center')

  const s = save.stats
  const today = save.daily?.date === todayKey() ? save.daily : null
  const recs: string[] = []
  if (s.bestScore > 0) recs.push(`Best ${s.bestScore.toLocaleString()}`)
  if (today) recs.push(`Today's page ${today.score.toLocaleString()}`)
  if (s.bestWord) recs.push(`Finest word ${s.bestWord.word}`)
  if (recs.length) drawText(ctx, recs.join('  ·  '), cx, 530, CANVAS_FONTS.laneItalic(15), COLORS.sepia, 'center')
  drawText(ctx, 'Created by Myles Stupp  ·  Set in Cormorant  ·  Powered by Pretext', cx, 590, CANVAS_FONTS.laneItalic(12), COLORS.faint, 'center')
  ctx.restore()

  // Left page — how to play
  ctx.save()
  ctx.globalAlpha = easeOutCubic(clamp((g.time - 0.3) / 1, 0, 1))
  const lx = 90
  drawText(ctx, 'HOW TO PLAY', 240, 86, CANVAS_FONTS.caps(12), COLORS.gold, 'center')
  drawFlourish(ctx, 240, 104, 100)

  let y = 140
  let kx = drawKeycap(ctx, '←', lx + 12, y) + lx + 4
  kx += drawKeycap(ctx, '→', kx + 12, y) + 8
  drawText(ctx, 'glide', kx, y + 1, CANVAS_FONTS.laneItalic(16), COLORS.sepia)
  kx = lx + 150
  kx += drawKeycap(ctx, '↑', kx + 12, y) + 4
  kx += drawKeycap(ctx, '↓', kx + 12, y) + 8
  drawText(ctx, 'hop lanes', kx, y + 1, CANVAS_FONTS.laneItalic(16), COLORS.sepia)
  y += 36
  kx = lx + drawKeycap(ctx, 'Space', lx + 28, y, 56) + 8
  drawText(ctx, 'catch the glowing tile', kx, y + 1, CANVAS_FONTS.laneItalic(16), COLORS.sepia)
  y += 36
  kx = lx + drawKeycap(ctx, 'Enter', lx + 26, y, 52) + 8
  drawText(ctx, 'ink your word', kx, y + 1, CANVAS_FONTS.laneItalic(16), COLORS.sepia)
  kx = lx + 190
  kx += drawKeycap(ctx, '⌫', kx + 14, y, 28) + 8
  drawText(ctx, 'undo', kx, y + 1, CANVAS_FONTS.laneItalic(16), COLORS.sepia)

  // Rules paragraph, wrapped with Pretext.
  const font = CANVAS_FONTS.laneRegular(16)
  if (!helpLines) {
    helpLines = measureLines(
      'Words of three or more letters score their tile values plus a length bonus, and longer words buy more time. Ink words back to back to build Flow — up to ×3 — before it fades. Tap or click tiles if you prefer a pointer.',
      font, 320, 21,
    ).map(l => l.text)
  }
  y += 32
  for (const line of helpLines) {
    drawText(ctx, line, lx, y, font, COLORS.sepia)
    y += 21
  }

  // Tile legend
  y += 22
  const kinds: TileKind[] = ['plain', 'DL', 'TL', 'DW', 'TW', 'blank']
  const labels = ['letter', '2× letter', '3× letter', '2× word', '3× word', 'wild']
  kinds.forEach((k, i) => {
    const x = lx + 14 + i * 58
    tileArt.draw(ctx, k === 'blank' ? '' : 'EARTHS'[i], k, 28, x, y + 6, 1, k !== 'blank', false)
    drawText(ctx, labels[i], x, y + 34, CANVAS_FONTS.caps(9), COLORS.muted, 'center')
  })

  // Power-ups
  y += 78
  const kinds2 = ['time', 'slow', 'flow', 'double'] as const
  drawText(ctx, 'MARGIN POWERS', lx, y - 20, CANVAS_FONTS.caps(10), COLORS.muted)
  kinds2.forEach((k, i) => {
    const p = POWERS[k]
    const x = lx + (i % 2) * 170
    const yy = y + Math.floor(i / 2) * 28
    ctx.fillStyle = '#FFFDF6'
    ctx.strokeStyle = p.color
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(x + 10, yy, 10, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    drawText(ctx, p.icon, x + 10, yy + 0.5, CANVAS_FONTS.icons(10), p.color, 'center')
    drawText(ctx, p.blurb, x + 27, yy + 1, CANVAS_FONTS.laneItalic(15), COLORS.sepia)
  })
  ctx.restore()

  ctx.save()
  ctx.globalAlpha = a
  for (const b of g.buttons) drawButton(ctx, b, g.hot === b.id, g.time)
  ctx.restore()
}

// ── Game over ──

function renderGameOver(g: Game, ctx: CanvasRenderingContext2D): void {
  const s = g.summary
  if (!s) return
  ctx.fillStyle = 'rgba(248, 244, 235, 0.72)'
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
  const lx = 225
  drawText(ctx, s.mode === 'daily' ? `DAILY PAGE · ${s.date}` : 'THE PAGE IS INKED', lx, 70, CANVAS_FONTS.caps(12), COLORS.muted, 'center')
  drawText(ctx, 'Finis', lx, 116, CANVAS_FONTS.title(56), COLORS.espresso, 'center')
  drawFlourish(ctx, lx, 152, 110)

  // Score counts up for drama.
  const shown = Math.round(g.displayScore)
  drawText(ctx, shown.toLocaleString(), lx, 206, CANVAS_FONTS.uiBold(64), COLORS.espresso, 'center')
  drawText(ctx, 'POINTS', lx, 246, CANVAS_FONTS.caps(11), COLORS.muted, 'center')
  if (s.newBest || s.newDailyBest) {
    const pulse = 0.85 + 0.15 * Math.sin(g.time * 4)
    ctx.globalAlpha = pulse
    pill(ctx, s.newBest ? '✦  New personal best  ✦' : "✦  Today's best  ✦", lx, 276, 12, COLORS.gold, '#FFFBF0')
    ctx.globalAlpha = 1
  }

  const rows: [string, string][] = [
    ['Words inked', String(s.words)],
    ['Finest word', s.bestWord ? `${s.bestWord.word} · ${s.bestWord.score}` : '—'],
    ['Longest word', s.longest || '—'],
    ['Chapter reached', toRoman(s.chapter)],
    ['Time on the page', formatTime(s.elapsed)],
    ['Personal best', save.stats.bestScore.toLocaleString()],
  ]
  let y = 316
  for (const [k, v] of rows) {
    drawText(ctx, k, 90, y, CANVAS_FONTS.laneItalic(17), COLORS.sepia)
    drawText(ctx, v, 360, y, CANVAS_FONTS.uiBold(17), COLORS.espresso, 'right')
    ctx.fillStyle = 'rgba(139, 115, 85, 0.35)'
    ctx.font = CANVAS_FONTS.laneItalic(17)
    const from = 96 + ctx.measureText(k).width
    ctx.font = CANVAS_FONTS.uiBold(17)
    const to = 354 - ctx.measureText(v).width
    for (let x = from + 4; x < to - 2; x += 6) ctx.fillRect(x, y + 5, 1.2, 1.2)
    y += 30
  }
  for (const b of g.buttons) drawButton(ctx, b, g.hot === b.id, g.time)

  // Right page — ledger
  const rx = 675
  drawText(ctx, 'LEDGER', rx, 70, CANVAS_FONTS.caps(12), COLORS.gold, 'center')
  drawFlourish(ctx, rx, 88, 110)
  const sorted = [...g.words].sort((a, b) => b.score - a.score)
  if (sorted.length === 0) {
    drawText(ctx, 'No words were inked this time.', rx, 200, CANVAS_FONTS.laneItalic(18), COLORS.sepia, 'center')
    drawText(ctx, 'Catch tiles, spell, and press Enter.', rx, 226, CANVAS_FONTS.laneItalic(16), COLORS.muted, 'center')
    return
  }
  const best = sorted[0]
  const th = best.word.length > 8 ? 26 : 32
  const step = th * 0.98
  const startX = rx - ((best.word.length - 1) * step) / 2
  for (let i = 0; i < best.word.length; i++) {
    const bob = Math.sin(g.time * 2.4 + i * 0.5) * 1.5
    tileArt.draw(ctx, best.word[i], best.kinds[i] === 'blank' ? 'blank' : best.kinds[i] ?? 'plain', th, startX + i * step, 132 + bob, 1, true, false)
  }
  drawText(ctx, `${best.score} points`, rx, 170, CANVAS_FONTS.laneItalic(15), COLORS.gold, 'center')

  const maxRows = 14
  y = 204
  sorted.slice(0, maxRows).forEach((w, i) => {
    const col = i === 0 ? COLORS.gold : COLORS.espresso
    drawText(ctx, `${i + 1}.`, 520, y, CANVAS_FONTS.laneItalic(14), COLORS.faint, 'right')
    drawText(ctx, w.word, 530, y, CANVAS_FONTS.caps(15), col)
    drawText(ctx, String(w.score), 830, y, CANVAS_FONTS.uiBold(15), col, 'right')
    ctx.font = CANVAS_FONTS.caps(15)
    const from = 536 + ctx.measureText(w.word).width
    ctx.fillStyle = 'rgba(139, 115, 85, 0.3)'
    for (let x = from + 4; x < 800; x += 6) ctx.fillRect(x, y + 4, 1.1, 1.1)
    y += 26
  })
  if (sorted.length > maxRows) {
    drawText(ctx, `…and ${sorted.length - maxRows} more`, rx, y + 4, CANVAS_FONTS.laneItalic(14), COLORS.muted, 'center')
  }
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export type { Button }
