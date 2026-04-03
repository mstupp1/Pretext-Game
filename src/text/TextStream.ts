// ── TextStream — Manages a scrolling text content for a lane ──
// Enhanced with ripple waves, magnetic rotation, and lens scaling

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
  dy: number              // vertical displacement
  targetDy: number
  dx: number              // horizontal displacement (for ripple)
  targetDx: number
  scale: number           // current scale
  targetScale: number     // target scale (lens effect)
  alpha: number
  rotation: number        // current rotation in radians
  targetRotation: number  // target rotation (magnetic compass)
  // Ripple state
  ripplePhase: number     // phase offset for wave propagation
  rippleAmplitude: number // current wave amplitude
}

export class TextStream {
  public chars: StreamChar[] = []
  public totalWidth: number = 0
  private scrollOffset: number = 0
  private font: string
  private speed: number
  private highlightRate: number
  private direction: 1 | -1

  // Global ripple state — propagating wave from player interactions
  private rippleTime: number = 0

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
        dx: 0,
        targetDx: 0,
        scale: 1,
        targetScale: 1,
        alpha: 1,
        rotation: 0,
        targetRotation: 0,
        ripplePhase: 0,
        rippleAmplitude: 0,
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
    this.rippleTime += dt

    // Wrap around
    if (this.direction > 0 && this.scrollOffset > this.totalWidth) {
      this.scrollOffset -= this.totalWidth
    } else if (this.direction < 0 && this.scrollOffset < -this.totalWidth) {
      this.scrollOffset += this.totalWidth
    }

    // Update character physics
    for (const ch of this.chars) {
      if (ch.isCollected) {
        // Collected: spiral upward and dissolve
        ch.alpha = Math.max(0, ch.alpha - dt * 3)
        ch.scale = Math.max(0, ch.scale - dt * 2)
        ch.dy += dt * -80
        ch.rotation += dt * 8  // spin as it dissolves
      } else {
        // Spring physics for all properties
        const springRate = dt * 8
        const scaleRate = dt * 5
        const rotRate = dt * 6

        ch.dy += (ch.targetDy - ch.dy) * Math.min(1, springRate)
        ch.dx += (ch.targetDx - ch.dx) * Math.min(1, springRate)
        ch.scale += (ch.targetScale - ch.scale) * Math.min(1, scaleRate)
        ch.rotation += (ch.targetRotation - ch.rotation) * Math.min(1, rotRate)
        ch.alpha += (1 - ch.alpha) * Math.min(1, dt * 5)

        // Ripple wave decay
        ch.rippleAmplitude *= Math.max(0, 1 - dt * 3)
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

  // ── Enhanced effects system ──

  // Apply all proximity effects from player position
  applyPlayerEffects(playerX: number, playerY: number, laneY: number, laneWidth: number, isPlayerLane: boolean): void {
    const visible = this.getVisibleChars(laneWidth)
    const distToLane = Math.abs(playerY - laneY)
    const laneProximity = Math.max(0, 1 - distToLane / 200) // 0..1, how close player is vertically

    for (const { char: ch, screenX } of visible) {
      if (ch.isCollected) continue

      const charCenter = screenX + ch.width / 2
      const dx = charCenter - playerX
      const dist = Math.abs(dx)

      if (isPlayerLane) {
        // ── PLAYER'S LANE: Full effects ──

        const repulsionRadius = 80
        const lensRadius = 150
        const rotationRadius = 120

        // 1. REPULSION — push characters apart (vertical + horizontal)
        if (dist < repulsionRadius) {
          const force = (1 - dist / repulsionRadius)
          const pushForce = force * force // quadratic for snappier feel
          ch.targetDy = dx > 0 ? pushForce * 16 : -pushForce * 16
          ch.targetDx = (dx > 0 ? 1 : -1) * pushForce * 8
        } else {
          ch.targetDy = 0
          ch.targetDx = 0
        }

        // 2. LENS EFFECT — scale up near cursor like a magnifying glass
        if (dist < lensRadius) {
          const t = 1 - dist / lensRadius
          // Smooth bell curve for natural lens feel
          const lensPower = t * t * (3 - 2 * t) // smoothstep
          ch.targetScale = 1 + lensPower * 0.4 // up to 1.4x scale
        } else {
          ch.targetScale = 1
        }

        // 3. MAGNETIC ROTATION — characters rotate to "look at" the cursor
        if (dist < rotationRadius) {
          const angle = Math.atan2(laneY - playerY, dx)
          const t = 1 - dist / rotationRadius
          ch.targetRotation = angle * t * 0.35 // subtle lean
        } else {
          ch.targetRotation = 0
        }
      } else if (laneProximity > 0.2) {
        // ── ADJACENT LANES: Subtle gravitational pull ──
        const softRadius = 120
        if (dist < softRadius) {
          const t = (1 - dist / softRadius) * laneProximity
          // Gentle vertical sway toward player
          ch.targetDy = (playerY < laneY ? -1 : 1) * t * 6
          // Very subtle lean
          ch.targetRotation = (dx > 0 ? 0.05 : -0.05) * t
          ch.targetScale = 1 + t * 0.1
          ch.targetDx = 0
        } else {
          ch.targetDy = 0
          ch.targetDx = 0
          ch.targetRotation = 0
          ch.targetScale = 1
        }
      } else {
        // Far away — reset
        ch.targetDy = 0
        ch.targetDx = 0
        ch.targetRotation = 0
        ch.targetScale = 1
      }
    }
  }

  // Trigger a ripple wave at a specific screen position (e.g., on letter collection)
  triggerRipple(screenX: number, laneWidth: number, amplitude: number = 8): void {
    const visible = this.getVisibleChars(laneWidth)
    for (const { char: ch, screenX: cx } of visible) {
      const dist = Math.abs(cx + ch.width / 2 - screenX)
      // Phase increases with distance — creates an outward-propagating wave
      ch.ripplePhase = dist * 0.05
      ch.rippleAmplitude = amplitude * Math.max(0, 1 - dist / 400)
    }
  }

  // Get the current ripple displacement for a character
  getRippleOffset(ch: StreamChar): number {
    if (ch.rippleAmplitude < 0.1) return 0
    return Math.sin(this.rippleTime * 12 - ch.ripplePhase) * ch.rippleAmplitude
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
