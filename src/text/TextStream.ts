// ── TextStream — Manages a scrolling text content for a lane ──
// Enhanced with ambient typography, ripple waves, magnetic rotation, and lens scaling

import { measureCharsInLine, type MeasuredChar } from './TextEngine'
import { getRandomPassage } from './passages'
import { ICONS } from '../utils/constants'

export function getPageCurvatureOffset(screenX: number, viewportWidth: number): number {
  const center = viewportWidth / 2
  const distFromCenter = screenX - center
  const normalizedDist = distFromCenter / center // -1 to 1

  // arch goes from 0 at the spine (normalizedDist=0) to 1 at the middle of the page (normalizedDist=0.5) to 0 at the edges
  const arch = Math.sin(Math.abs(normalizedDist) * Math.PI)
  
  // spineDip adds a sharp dip right at the center spine (y increases = downwards visually)
  const spineDip = Math.max(0, 1 - Math.abs(normalizedDist * 8)) * 6
  
  // Pages rise (negative y) by 5px at their peaks, and dip (positive y) at the spine
  return -arch * 5 + spineDip
}

export interface StreamChar {
  char: string
  x: number       // current world x position
  width: number
  isHighlighted: boolean  // collectible letter
  isCollected: boolean    // already taken
  originalIndex: number   // index in the full text
  isSpace: boolean        // is whitespace character
  wordIndex: number       // which word this char belongs to

  // Physics state for effects
  dy: number              // vertical displacement
  targetDy: number
  dx: number              // horizontal displacement
  targetDx: number
  scale: number           // current scale
  targetScale: number     // target scale (lens effect)
  alpha: number
  rotation: number        // current rotation in radians
  targetRotation: number  // target rotation (magnetic compass)

  // Ripple state
  ripplePhase: number     // phase offset for wave propagation
  rippleAmplitude: number // current wave amplitude

  // Ambient effect seeds (unique per-character, deterministic)
  seed: number            // random seed [0..1] for variation
  inkDensity: number      // simulated ink absorption [0.85..1.0]
}

export class TextStream {
  public chars: StreamChar[] = []
  public totalWidth: number = 0
  private scrollOffset: number = 0
  private font: string
  private speed: number
  private highlightRate: number
  private direction: 1 | -1

  // Global time accumulators for ambient effects
  private rippleTime: number = 0
  private globalTime: number = 0

  // Ambient effect parameters (set per-lane for variety)
  private undulationAmplitude: number
  private undulationFrequency: number
  private undulationPhaseOffset: number
  private shimmerIntensity: number
  private isIconStream: boolean

  constructor(font: string, speed: number, direction: 1 | -1, highlightRate: number, isIconStream: boolean = false) {
    this.font = font
    this.speed = speed
    this.direction = direction
    this.highlightRate = highlightRate
    this.isIconStream = isIconStream

    // Each lane gets slightly different ambient parameters
    const laneVariation = Math.random()
    this.undulationAmplitude = 1.5 + laneVariation * 2.0    // 1.5–3.5px vertical wave
    this.undulationFrequency = 0.8 + laneVariation * 0.6    // slightly different periods
    this.undulationPhaseOffset = laneVariation * Math.PI * 2 // phase variety
    this.shimmerIntensity = 0.3 + (speed / 100) * 0.5       // faster lanes shimmer more

    this.buildStream()
  }

  private buildStream(): void {
    // Combine multiple passages to create a long stream
    let text = ''
    
    if (this.isIconStream) {
      // Use all icons before repeating for maximum variety
      let pool: string[] = []
      for (let i = 0; i < 80; i++) {
        if (pool.length === 0) {
          pool = [...ICONS].sort(() => Math.random() - 0.5)
        }
        text += pool.pop() + '       '
      }
    } else {
      for (let i = 0; i < 4; i++) {
        text += getRandomPassage() + '     '
      }
    }

    const measured = measureCharsInLine(text, this.font)
    this.chars = []
    let totalW = 0

    // Decide which chars to highlight (letters only, weighted towards vowels/common consonants)
    const vowels = new Set('AEIOU')
    const commonConsonants = new Set('RSTLNDHC')

    // Track word boundaries
    let wordIndex = 0
    let inWord = false
    let highlightCooldown = 0

    for (let i = 0; i < measured.length; i++) {
      const mc = measured[i]
      const upper = mc.char.toUpperCase()
      const isLetter = /[A-Za-z]/.test(mc.char)
      const isSpace = /\s/.test(mc.char)

      // Track word boundaries
      if (isSpace) {
        if (inWord) wordIndex++
        inWord = false
      } else {
        inWord = true
      }

      let isHighlighted = false
      if (isLetter && highlightCooldown <= 0) {
        let chance = this.highlightRate
        if (vowels.has(upper)) chance *= 1.8
        else if (commonConsonants.has(upper)) chance *= 1.3
        
        isHighlighted = Math.random() < chance
        
        if (isHighlighted) {
          // Enforce a minimum gap between collectibles (e.g., 8 to 12 characters)
          highlightCooldown = 8 + Math.floor(Math.random() * 5)
        }
      }
      
      if (highlightCooldown > 0) {
        highlightCooldown--
      }

      // Per-character seeds for deterministic ambient variation
      const seed = this.pseudoRandom(i * 7919 + 1301)
      // Ink density: simulate paper absorption — some chars darker, some lighter
      const inkDensity = 0.82 + seed * 0.18

      this.chars.push({
        char: mc.char,
        x: mc.x,
        width: mc.width,
        isHighlighted,
        isCollected: false,
        originalIndex: i,
        isSpace,
        wordIndex,
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
        seed,
        inkDensity,
      })
      totalW = mc.x + mc.width
    }

    this.totalWidth = totalW
    // Start offset randomly so lanes don't all start aligned
    this.scrollOffset = Math.random() * totalW * 0.5
  }

  // Simple deterministic pseudo-random from seed
  private pseudoRandom(n: number): number {
    const x = Math.sin(n) * 43758.5453
    return x - Math.floor(x)
  }

  getScrollOffset(): number {
    return this.scrollOffset
  }

  update(dt: number): void {
    this.scrollOffset += this.speed * this.direction * dt
    this.rippleTime += dt
    this.globalTime += dt

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
        ch.rotation += dt * 8
      } else {
        // Spring physics for all properties
        const springRate = dt * 8
        const scaleRate = dt * 15 // Faster scale response so it doesn't lag behind
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
    const padding = 100 // Load further offscreen to prevent popping

    for (const ch of this.chars) {
      // Calculate base wrapped screen position to be nominally within [0, totalWidth)
      let screenX = (ch.x - offset) % this.totalWidth
      if (screenX < 0) screenX += this.totalWidth

      // Check the primary position and its immediate wrapped clones
      // This ensures characters smoothly enter/exit across screen boundaries without popping or gaps
      const positions = [
        screenX - this.totalWidth,
        screenX,
        screenX + this.totalWidth
      ]

      for (const px of positions) {
        if (px >= -ch.width - padding && px <= viewportWidth + padding) {
          visible.push({ char: ch, screenX: px })
        }
      }
    }

    return visible
  }

  // ── AMBIENT EFFECTS — Always active on all text ──

  // Get the sine-wave undulation offset for a character
  // Creates a gentle "floating on water" effect across the lane
  getUndulationOffset(ch: StreamChar, screenX: number): number {
    if (ch.isCollected) return 0
    // Spatial wave: flows across screen position for a traveling wave appearance
    const spatialPhase = screenX * 0.012
    // Temporal wave: oscillates over time
    const temporalPhase = this.globalTime * this.undulationFrequency + this.undulationPhaseOffset
    // Per-char variation adds organic irregularity
    const charVariation = ch.seed * 0.8
    return Math.sin(spatialPhase + temporalPhase + charVariation) * this.undulationAmplitude
  }

  // Get ink-density alpha variation for a character
  // Simulates uneven ink absorption: some chars slightly darker, some slightly lighter
  getInkAlpha(ch: StreamChar): number {
    if (ch.isHighlighted || ch.isCollected) return 1
    // Slow, subtle pulsing per character — like the ink is "breathing"
    const pulse = Math.sin(this.globalTime * 0.4 + ch.seed * Math.PI * 2) * 0.04
    return ch.inkDensity + pulse
  }

  // Get heat-shimmer horizontal displacement
  // Faster lanes shimmer more — makes the text feel like it's vibrating with velocity
  getShimmerOffset(ch: StreamChar): number {
    if (ch.isCollected) return 0
    // High-frequency, low-amplitude horizontal jitter
    const t = this.globalTime * 8 + ch.seed * 100
    const shimmer = (Math.sin(t) * 0.6 + Math.sin(t * 2.3) * 0.4) * this.shimmerIntensity
    return shimmer
  }

  // Get edge-based scale distortion
  // Characters near the viewport edges subtly compress, as if warped by a cylindrical lens
  getEdgeScale(screenX: number, viewportWidth: number): number {
    const edgeDistance = Math.min(screenX, viewportWidth - screenX)
    const edgeZone = 80 // pixels from edge where effect kicks in
    if (edgeDistance > edgeZone) return 1
    const t = Math.max(0, edgeDistance / edgeZone) // 0 at edge, 1 at boundary
    // Subtle horizontal squash at edges (0.92 to 1.0)
    return 0.92 + t * 0.08
  }

  // Get edge-based fade
  // Characters smoothly fade in/out as they enter/exit the screen
  getEdgeFade(screenX: number, viewportWidth: number): number {
    // Offset screenX to start fading slightly inside the viewport bounds
    const edgeDistance = Math.min(screenX + 20, viewportWidth - screenX + 20)
    const fadeZone = 40 // Fade duration in pixels
    if (edgeDistance > fadeZone) return 1
    const t = Math.max(0, edgeDistance / fadeZone)
    return t * t // Ease-in interpolation
  }

  // Get word-pulse spacing offset for spaces between words
  // Makes word gaps rhythmically expand/contract like breathing text
  getWordPulseOffset(ch: StreamChar): number {
    if (!ch.isSpace || ch.isCollected) return 0
    // Each word boundary pulses at a slightly different rate
    const pulse = Math.sin(this.globalTime * 1.2 + ch.wordIndex * 1.7) * 1.5
    return pulse
  }

  // Get the curve offset of the pages (middle falls into the spine, edges curve up and then down)
  getPageCurvatureOffset(screenX: number, viewportWidth: number): number {
    return getPageCurvatureOffset(screenX, viewportWidth)
  }

  // ── Enhanced effects system ──
  // "Coming off the page" — characters magnify dramatically and slow down
  // as they pass through the cursor's lens zone, like a portal to another dimension

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
        // ── PLAYER'S LANE: Portal/magnification effect ──
        // Characters feel like they're rising off a page under a magnifying glass

        const portalRadius = 180    // wide zone of influence
        const coreRadius = 60       // innermost zone — peak magnification
        const slowdownRadius = 140  // zone where speed dampening occurs

        // 1. MAGNIFICATION — dramatic scale-up, like coming off the page
        if (dist < portalRadius) {
          // Flatten the top of the curve so it peaks sooner and holds the peak
          const plateauRadius = 25
          const effectiveDist = Math.max(0, dist - plateauRadius)
          const effectivePortalRadius = portalRadius - plateauRadius

          const t = Math.max(0, 1 - effectiveDist / effectivePortalRadius)
          // Smooth bell curve
          const lensPower = t * t * (3 - 2 * t) // smoothstep
          // Up to 2.5x scale at dead center — dramatic "looming" feel
          ch.targetScale = 1 + lensPower * 1.5
        } else {
          ch.targetScale = 1
        }

        // 2. NO ROTATION — characters stay perfectly upright
        // This reinforces the "lifting toward the viewer" feel
        ch.targetRotation = 0

        // 3. SPEED DAMPENING — counteract scroll to simulate slower movement
        // Characters appear to slow down as they enter the lens, as if
        // they're traveling through a denser medium / different depth plane
        if (dist < slowdownRadius) {
          const t = 1 - dist / slowdownRadius
          const dampenPower = t * t // quadratic — strong at center
          // Push characters AGAINST their scroll direction
          // This creates the illusion they're moving slower through the lens
          const scrollDirection = this.direction
          const dampenForce = dampenPower * 25 // strength of the slowdown
          ch.targetDx = -scrollDirection * dampenForce
        } else {
          ch.targetDx = 0
        }

        // 4. GENTLE VERTICAL LIFT — characters rise slightly in the core
        // Like they're floating up off the page surface
        if (dist < coreRadius) {
          const t = 1 - dist / coreRadius
          const liftPower = t * t
          ch.targetDy = -liftPower * 6 // subtle upward float
        } else {
          ch.targetDy = 0
        }

      } else if (laneProximity > 0.2) {
        // ── ADJACENT LANES: Sympathetic lift ──
        // Nearby lanes feel the gravitational pull but more subtly
        const softRadius = 140
        if (dist < softRadius) {
          const t = (1 - dist / softRadius) * laneProximity
          const liftT = t * t * (3 - 2 * t) // smoothstep for smooth falloff
          // Gentle vertical sway toward player
          ch.targetDy = (playerY < laneY ? -1 : 1) * liftT * 8
          // No rotation — keep that clean upright feel
          ch.targetRotation = 0
          // Subtle sympathetic magnification
          ch.targetScale = 1 + liftT * 0.25
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
