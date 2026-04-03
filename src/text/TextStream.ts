// ── TextStream — Manages a scrolling text content for a lane ──

import { measureCharsInLine, type MeasuredChar } from './TextEngine'
import { getRandomPassage } from './passages'

export interface StreamChar {
  char: string
  x: number       // current world x position
  width: number
  isHighlighted: boolean  // collectible letter
  isCollected: boolean    // already taken
  originalIndex: number   // index in the full text
  // Physics state for effects
  dy: number
  targetDy: number
  scale: number
  alpha: number
  rotation: number
}

export class TextStream {
  public chars: StreamChar[] = []
  public totalWidth: number = 0
  private scrollOffset: number = 0
  private font: string
  private speed: number
  private highlightRate: number
  private direction: 1 | -1

  constructor(font: string, speed: number, direction: 1 | -1, highlightRate: number) {
    this.font = font
    this.speed = speed
    this.direction = direction
    this.highlightRate = highlightRate
    this.buildStream()
  }

  private buildStream(): void {
    // Combine multiple passages to create a long stream
    let text = ''
    for (let i = 0; i < 4; i++) {
      text += getRandomPassage() + '     '
    }

    const measured = measureCharsInLine(text, this.font)
    this.chars = []
    let totalW = 0

    // Decide which chars to highlight (letters only, weighted towards vowels/common consonants)
    const vowels = new Set('AEIOU')
    const commonConsonants = new Set('RSTLNDHC')

    for (let i = 0; i < measured.length; i++) {
      const mc = measured[i]
      const upper = mc.char.toUpperCase()
      const isLetter = /[A-Za-z]/.test(mc.char)

      let isHighlighted = false
      if (isLetter) {
        // Vowels have higher highlight chance
        let chance = this.highlightRate
        if (vowels.has(upper)) chance *= 1.8
        else if (commonConsonants.has(upper)) chance *= 1.3
        isHighlighted = Math.random() < chance
      }

      this.chars.push({
        char: mc.char,
        x: mc.x,
        width: mc.width,
        isHighlighted,
        isCollected: false,
        originalIndex: i,
        dy: 0,
        targetDy: 0,
        scale: 1,
        alpha: 1,
        rotation: 0,
      })
      totalW = mc.x + mc.width
    }

    this.totalWidth = totalW
    // Start offset randomly so lanes don't all start aligned
    this.scrollOffset = Math.random() * totalW * 0.5
  }

  getScrollOffset(): number {
    return this.scrollOffset
  }

  update(dt: number): void {
    this.scrollOffset += this.speed * this.direction * dt

    // Wrap around
    if (this.direction > 0 && this.scrollOffset > this.totalWidth) {
      this.scrollOffset -= this.totalWidth
    } else if (this.direction < 0 && this.scrollOffset < -this.totalWidth) {
      this.scrollOffset += this.totalWidth
    }

    // Update character physics
    for (const ch of this.chars) {
      if (ch.isCollected) {
        ch.alpha = Math.max(0, ch.alpha - dt * 3)
        ch.scale = Math.max(0, ch.scale - dt * 2)
        ch.dy += dt * -80  // float upward
      } else {
        // Spring back to baseline
        ch.dy += (ch.targetDy - ch.dy) * Math.min(1, dt * 8)
        ch.scale += (1 - ch.scale) * Math.min(1, dt * 6)
        ch.alpha += (1 - ch.alpha) * Math.min(1, dt * 5)
      }
    }
  }

  // Get visible characters within a viewport
  getVisibleChars(viewportWidth: number): { char: StreamChar; screenX: number }[] {
    const visible: { char: StreamChar; screenX: number }[] = []
    const offset = this.scrollOffset

    for (const ch of this.chars) {
      // Calculate screen position (with wrapping)
      let screenX = ch.x - offset
      // Wrap for continuous scroll
      while (screenX < -ch.width) screenX += this.totalWidth
      while (screenX > this.totalWidth) screenX -= this.totalWidth

      if (screenX >= -ch.width && screenX <= viewportWidth + ch.width) {
        visible.push({ char: ch, screenX })
      }
    }

    return visible
  }

  // Apply repulsion from player position
  applyPlayerRepulsion(playerX: number, laneWidth: number, radius: number = 60): void {
    const visible = this.getVisibleChars(laneWidth)
    for (const { char: ch, screenX } of visible) {
      const dx = screenX + ch.width / 2 - playerX
      const dist = Math.abs(dx)
      if (dist < radius && !ch.isCollected) {
        const force = (1 - dist / radius) * 12
        ch.targetDy = dx > 0 ? force : -force
      } else {
        ch.targetDy = 0
      }
    }
  }

  // Find the highlighted char closest to a point
  findCollectibleAt(screenX: number, laneWidth: number, radius: number = 40): StreamChar | null {
    const visible = this.getVisibleChars(laneWidth)
    let closest: StreamChar | null = null
    let closestDist = Infinity

    for (const { char: ch, screenX: cx } of visible) {
      if (!ch.isHighlighted || ch.isCollected) continue
      const dist = Math.abs(cx + ch.width / 2 - screenX)
      if (dist < radius && dist < closestDist) {
        closest = ch
        closestDist = dist
      }
    }

    return closest
  }

  getFont(): string {
    return this.font
  }

  getSpeed(): number {
    return this.speed
  }

  getDirection(): 1 | -1 {
    return this.direction
  }
}
