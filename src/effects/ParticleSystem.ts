// ── ParticleSystem — Typographic particle effects ──
// Creates firework-like explosions where each particle is a character

import { COLORS, CANVAS_FONTS, GAME_WIDTH, GAME_HEIGHT } from '../utils/constants'
import { measureCharsInLine } from '../text/TextEngine'

export interface TypoParticle {
  char: string
  x: number
  y: number
  vx: number
  vy: number
  rotation: number
  rotationSpeed: number
  scale: number
  alpha: number
  color: string
  font: string
  width: number
  life: number     // 0..1, decreasing
  gravity: number
  friction: number
}

// Pre-computed character palette for particle effects
const PARTICLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*'.split('')
const PARTICLE_GLYPHS = '❧✦※❦⁂☙✿◆◇○●□■△▲▽▼♦♠♣♥'.split('')

// Color palettes for different effects
const GOLD_PALETTE = [
  '#B8860B', '#D4A843', '#C9A84C', '#E8C97A',
  '#8B7355', '#A0884B', '#CFAB3E', '#F0D87A',
]

const INK_PALETTE = [
  '#2C1810', '#3D2B1F', '#5C4033', '#8B7355',
  '#4A3728', '#6B5344', '#7B6B5A', '#A08B6A',
]

const FIRE_PALETTE = [
  '#FF6B35', '#F7C548', '#E8A33D', '#D4522E',
  '#B8860B', '#C9A84C', '#FF8C42', '#FFB84D',
]

export class ParticleSystem {
  private particles: TypoParticle[] = []
  private maxParticles: number = 500

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]

      // Physics
      p.vy += p.gravity * dt
      p.vx *= (1 - p.friction * dt)
      p.vy *= (1 - p.friction * dt * 0.5)

      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rotation += p.rotationSpeed * dt

      // Life decay
      p.life -= dt * 0.8
      p.alpha = Math.max(0, p.life)
      p.scale = Math.max(0, 0.3 + p.life * 0.7)

      // Remove dead particles
      if (p.life <= 0 || p.y > GAME_HEIGHT + 50) {
        this.particles.splice(i, 1)
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      if (p.alpha <= 0.01) continue

      ctx.save()
      ctx.globalAlpha = p.alpha
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rotation)
      ctx.scale(p.scale, p.scale)
      ctx.font = p.font
      ctx.fillStyle = p.color
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'center'
      ctx.fillText(p.char, 0, 0)
      ctx.restore()
    }
  }

  get particleCount(): number {
    return this.particles.length
  }

  // ── EXPLOSION: Burst of characters flying outward ──

  explodeWord(word: string, x: number, y: number, intensity: number = 1): void {
    const letters = word.split('')

    // Main word letters — big, dramatic
    for (let i = 0; i < letters.length; i++) {
      const angle = (i / letters.length) * Math.PI * 2 + Math.random() * 0.5
      const speed = (150 + Math.random() * 250) * intensity

      this.addParticle({
        char: letters[i],
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 100 * intensity,
        rotation: 0,
        rotationSpeed: (Math.random() - 0.5) * 12,
        scale: 1.5 + Math.random() * 0.5,
        alpha: 1,
        color: GOLD_PALETTE[Math.floor(Math.random() * GOLD_PALETTE.length)],
        font: CANVAS_FONTS.laneBold(24 + Math.random() * 12),
        width: 12,
        life: 1.5 + Math.random() * 0.5,
        gravity: 180,
        friction: 1.2,
      })
    }

    // Secondary burst — random characters as confetti
    const confettiCount = Math.floor(20 + word.length * 5) * intensity
    for (let i = 0; i < confettiCount; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = (80 + Math.random() * 300) * intensity
      const isGlyph = Math.random() < 0.3
      const ch = isGlyph
        ? PARTICLE_GLYPHS[Math.floor(Math.random() * PARTICLE_GLYPHS.length)]
        : PARTICLE_CHARS[Math.floor(Math.random() * PARTICLE_CHARS.length)]

      this.addParticle({
        char: ch,
        x: x + (Math.random() - 0.5) * 40,
        y: y + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80,
        rotation: Math.random() * Math.PI,
        rotationSpeed: (Math.random() - 0.5) * 15,
        scale: 0.3 + Math.random() * 0.8,
        alpha: 0.8,
        color: GOLD_PALETTE[Math.floor(Math.random() * GOLD_PALETTE.length)],
        font: CANVAS_FONTS.laneLight(8 + Math.random() * 16),
        width: 8,
        life: 0.8 + Math.random() * 1,
        gravity: 200 + Math.random() * 100,
        friction: 2,
      })
    }
  }

  // ── FOUNTAIN: Characters cascade upward like a geyser ──

  fountain(x: number, y: number, count: number = 30): void {
    for (let i = 0; i < count; i++) {
      const ch = PARTICLE_GLYPHS[Math.floor(Math.random() * PARTICLE_GLYPHS.length)]
      const spreadX = (Math.random() - 0.5) * 60
      const speedY = -(200 + Math.random() * 300)
      const delay = i * 0.02 // stagger

      this.addParticle({
        char: ch,
        x: x + spreadX,
        y: y + delay * 100,
        vx: spreadX * 2,
        vy: speedY,
        rotation: 0,
        rotationSpeed: (Math.random() - 0.5) * 8,
        scale: 0.5 + Math.random() * 1,
        alpha: 1,
        color: FIRE_PALETTE[Math.floor(Math.random() * FIRE_PALETTE.length)],
        font: CANVAS_FONTS.laneRegular(10 + Math.random() * 20),
        width: 10,
        life: 1 + Math.random() * 0.8,
        gravity: 350,
        friction: 1.5,
      })
    }
  }

  // ── SHATTER: Text breaks apart from a point, pieces scatter ──

  shatterText(text: string, x: number, y: number, font: string): void {
    const chars = measureCharsInLine(text, font)

    // Center the text
    const totalWidth = chars.length > 0 ? chars[chars.length - 1].x + chars[chars.length - 1].width : 0
    const offsetX = x - totalWidth / 2

    for (const mc of chars) {
      if (mc.char.trim() === '') continue

      const charX = offsetX + mc.x + mc.width / 2
      const dx = charX - x
      const dy = y - y // all same Y
      const angle = Math.atan2(dy - 0.5, dx) + (Math.random() - 0.5) * 0.8
      const speed = 80 + Math.random() * 200 + Math.abs(dx) * 1.5

      this.addParticle({
        char: mc.char,
        x: charX,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 120,
        rotation: 0,
        rotationSpeed: (Math.random() - 0.5) * 10,
        scale: 1,
        alpha: 1,
        color: INK_PALETTE[Math.floor(Math.random() * INK_PALETTE.length)],
        font,
        width: mc.width,
        life: 1.5 + Math.random() * 1,
        gravity: 250,
        friction: 1.5,
      })
    }
  }

  // ── COLLECT BURST: Small burst when picking up a letter ──

  collectBurst(char: string, x: number, y: number): void {
    // The collected letter itself — floats upward
    this.addParticle({
      char,
      x,
      y,
      vx: 0,
      vy: -120,
      rotation: 0,
      rotationSpeed: 0,
      scale: 2,
      alpha: 1,
      color: COLORS.gold,
      font: CANVAS_FONTS.laneBold(28),
      width: 15,
      life: 0.8,
      gravity: -30,
      friction: 3,
    })

    // Small sparkle burst around it
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2
      const speed = 60 + Math.random() * 80
      const glyphs = ['·', '✦', '✧', '⋆', '•', '∗']
      const ch = glyphs[Math.floor(Math.random() * glyphs.length)]

      this.addParticle({
        char: ch,
        x: x + Math.cos(angle) * 5,
        y: y + Math.sin(angle) * 5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rotation: 0,
        rotationSpeed: (Math.random() - 0.5) * 6,
        scale: 0.6 + Math.random() * 0.4,
        alpha: 0.9,
        color: GOLD_PALETTE[Math.floor(Math.random() * GOLD_PALETTE.length)],
        font: CANVAS_FONTS.laneLight(8 + Math.random() * 10),
        width: 6,
        life: 0.4 + Math.random() * 0.3,
        gravity: 0,
        friction: 5,
      })
    }
  }

  // ── WAVE TEXT: Characters form text that waves then disperses ──

  waveText(text: string, x: number, y: number, color: string = COLORS.gold): void {
    const font = CANVAS_FONTS.laneBold(32)
    const chars = measureCharsInLine(text, font)
    const totalWidth = chars.length > 0 ? chars[chars.length - 1].x + chars[chars.length - 1].width : 0
    const offsetX = x - totalWidth / 2

    for (let i = 0; i < chars.length; i++) {
      const mc = chars[i]
      if (mc.char.trim() === '') continue

      const charX = offsetX + mc.x + mc.width / 2
      // Stagger upward motion
      const delay = i * 0.05

      this.addParticle({
        char: mc.char,
        x: charX,
        y: y + 10,
        vx: (Math.random() - 0.5) * 20,
        vy: -40 - Math.random() * 30,
        rotation: 0,
        rotationSpeed: 0,
        scale: 1.2,
        alpha: 1,
        color,
        font,
        width: mc.width,
        life: 1.8 + delay,
        gravity: 5,
        friction: 2,
      })
    }
  }

  private addParticle(p: TypoParticle): void {
    if (this.particles.length < this.maxParticles) {
      this.particles.push(p)
    }
  }

  clear(): void {
    this.particles = []
  }
}
