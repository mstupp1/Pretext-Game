// ── TextStream — Manages a scrolling text content for a lane ──
// Enhanced with ambient typography, ripple waves, magnetic rotation, and lens scaling

import { measureCharsInLine, type MeasuredChar } from './TextEngine'
import { getRandomPassage } from './passages'
import { ICONS, LETTER_VALUES, MultiplierType, POWER_UP_ICONS, PowerUpType } from '../utils/constants'

const MULTIPLIER_SPAWN_RATE = 0.018
const SHINY_SPAWN_RATE = 0.05
const POWER_UP_SPAWN_RATE = 0.0018
const BLANK_TILE_SPAWN_RATE = 0.0016
const BLANK_WORD_MULTIPLIER_RATE = 0.28
const MULTIPLIER_WEIGHTS: Array<{
  type: Exclude<MultiplierType, 'None'>
  weight: number
  cooldown: number
  wordMultiplierCooldown?: number
}> = [
  { type: 'DoubleLetter', weight: 0.357, cooldown: 1 },
  { type: 'DoubleWord', weight: 0.286, cooldown: 2, wordMultiplierCooldown: 10 },
  { type: 'TripleLetter', weight: 0.214, cooldown: 2 },
  { type: 'TripleWord', weight: 0.143, cooldown: 2, wordMultiplierCooldown: 12 },
]
const POWER_UP_WEIGHTS: Array<{
  type: Exclude<PowerUpType, 'None'>
  weight: number
  cooldown: number
}> = [
  { type: 'Wisdom', weight: 0.5, cooldown: 180 },
  { type: 'Knowledge', weight: 0.5, cooldown: 220 },
]
const BLANK_WORD_MULTIPLIER_WEIGHTS: Array<{
  type: Extract<MultiplierType, 'DoubleWord' | 'TripleWord'>
  weight: number
  cooldown: number
  wordMultiplierCooldown: number
}> = [
  { type: 'DoubleWord', weight: 0.72, cooldown: 2, wordMultiplierCooldown: 10 },
  { type: 'TripleWord', weight: 0.28, cooldown: 2, wordMultiplierCooldown: 12 },
]
type ActiveMultiplierType = Exclude<MultiplierType, 'None'>
type ActivePowerUpType = Exclude<PowerUpType, 'None'>
type StreamKind = 'text' | 'icon' | 'powerup'

const ACTIVE_MULTIPLIER_TYPES = MULTIPLIER_WEIGHTS.map(({ type }) => type)
const ACTIVE_POWER_UP_TYPES = POWER_UP_WEIGHTS.map(({ type }) => type)
const MIN_HIGHLIGHT_GAP = 6
const REBALANCE_INTERVAL = 0.25
const MIN_BLANK_TARGET_COUNT = 1

function createEmptyMultiplierCounts(): Record<ActiveMultiplierType, number> {
  return {
    DoubleLetter: 0,
    TripleLetter: 0,
    DoubleWord: 0,
    TripleWord: 0,
  }
}

function hasNearbyPowerUp(types: PowerUpType[], index: number, radius: number): boolean {
  const start = Math.max(0, index - radius)
  const end = Math.min(types.length - 1, index + radius)

  for (let i = start; i <= end; i++) {
    if (i !== index && types[i] !== 'None') return true
  }

  return false
}

function getRandomShinyBonus(letter: string): number {
  const maxBonus = Math.max(1, LETTER_VALUES[letter.toUpperCase()] ?? 1)
  const totalWeight = (maxBonus * (maxBonus + 1)) / 2
  let pick = Math.random() * totalWeight

  for (let bonus = 1; bonus <= maxBonus; bonus++) {
    pick -= maxBonus - bonus + 1
    if (pick <= 0) return bonus
  }

  return 1
}

function rollBlankWordMultiplier(): {
  multiplierType: Extract<MultiplierType, 'DoubleWord' | 'TripleWord'> | 'None'
  cooldown: number
  wordMultiplierCooldown: number
} {
  if (Math.random() >= BLANK_WORD_MULTIPLIER_RATE) {
    return { multiplierType: 'None', cooldown: 0, wordMultiplierCooldown: 0 }
  }

  const totalWeight = BLANK_WORD_MULTIPLIER_WEIGHTS.reduce((sum, option) => sum + option.weight, 0)
  let pick = Math.random() * totalWeight

  for (const option of BLANK_WORD_MULTIPLIER_WEIGHTS) {
    pick -= option.weight
    if (pick <= 0) {
      return {
        multiplierType: option.type,
        cooldown: option.cooldown,
        wordMultiplierCooldown: option.wordMultiplierCooldown,
      }
    }
  }

  const fallback = BLANK_WORD_MULTIPLIER_WEIGHTS[0]
  return {
    multiplierType: fallback.type,
    cooldown: fallback.cooldown,
    wordMultiplierCooldown: fallback.wordMultiplierCooldown,
  }
}

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
  isBlank: boolean
  multiplierType: MultiplierType
  powerUpType: PowerUpType
  isShiny: boolean
  shinyBonus: number
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
  private motionScale: number = 1
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
  private streamKind: StreamKind
  private targetHighlightCount: number = 0
  private targetBlankCount: number = 0
  private targetShinyCount: number = 0
  private multiplierTargets: Record<ActiveMultiplierType, number> = createEmptyMultiplierCounts()
  private rebalanceTimer: number = REBALANCE_INTERVAL
  private visibleCharsCache: {
    viewportWidth: number
    scrollOffset: number
    totalWidth: number
    visible: { char: StreamChar; screenX: number }[]
  } | null = null

  constructor(font: string, speed: number, direction: 1 | -1, highlightRate: number, streamKind: StreamKind = 'text') {
    this.font = font
    this.speed = speed
    this.direction = direction
    this.highlightRate = highlightRate
    this.streamKind = streamKind

    // Each lane gets slightly different ambient parameters
    const laneVariation = Math.random()
    this.undulationAmplitude = 1.5 + laneVariation * 2.0    // 1.5–3.5px vertical wave
    this.undulationFrequency = 0.8 + laneVariation * 0.6    // slightly different periods
    this.undulationPhaseOffset = laneVariation * Math.PI * 2 // phase variety
    this.shimmerIntensity = 0.3 + (speed / 100) * 0.5       // faster lanes shimmer more

    this.buildStream()
  }

  public setSpeed(speed: number): void {
    this.speed = speed
    this.shimmerIntensity = 0.3 + (speed / 100) * 0.5
  }

  public setMotionScale(scale: number): void {
    this.motionScale = Math.max(0, Math.min(1, scale))
  }

  public setDirection(direction: 1 | -1): void {
    this.direction = direction
  }

  public setHighlightRate(rate: number): void {
    this.highlightRate = rate
  }

  public rebuild(font: string = this.font, highlightRate: number = this.highlightRate): void {
    const scrollRatio = this.totalWidth > 0
      ? ((this.scrollOffset % this.totalWidth) + this.totalWidth) % this.totalWidth / this.totalWidth
      : 0

    this.font = font
    this.highlightRate = highlightRate
    this.buildStream(scrollRatio)
  }

  private buildStream(scrollRatio?: number): void {
    // Combine multiple passages to create a long stream
    let text = ''
    let powerUpChars: string[] = []
    let powerUpTypes: PowerUpType[] = []
    
    if (this.streamKind === 'icon') {
      // Use all icons before repeating for maximum variety
      let pool: string[] = []
      for (let i = 0; i < 80; i++) {
        if (pool.length === 0) {
          pool = [...ICONS].sort(() => Math.random() - 0.5)
        }
        text += pool.pop() + '       '
      }
    } else if (this.streamKind === 'powerup') {
      const sequenceLength = 1200
      let cooldown = 120 + Math.floor(Math.random() * 80)

      for (let i = 0; i < sequenceLength; i++) {
        if (cooldown <= 0 && Math.random() < POWER_UP_SPAWN_RATE) {
          const totalWeight = POWER_UP_WEIGHTS.reduce((sum, option) => sum + option.weight, 0)
          let pick = Math.random() * totalWeight
          let selected: Exclude<PowerUpType, 'None'> = 'Wisdom'

          for (const option of POWER_UP_WEIGHTS) {
            pick -= option.weight
            if (pick <= 0) {
              selected = option.type
              cooldown = option.cooldown + Math.floor(Math.random() * 90)
              break
            }
          }

          powerUpChars.push(POWER_UP_ICONS[selected])
          powerUpTypes.push(selected)
          continue
        }

        powerUpChars.push(' ')
        powerUpTypes.push('None')
        if (cooldown > 0) cooldown--
      }

      this.ensureMinimumPowerUpPresence(powerUpChars, powerUpTypes)
      text = powerUpChars.join('')
    } else {
      for (let i = 0; i < 4; i++) {
        text += getRandomPassage() + '     '
      }
    }

    const measured = measureCharsInLine(text, this.font)
    this.chars = []
    this.targetHighlightCount = 0
    this.targetBlankCount = 0
    this.targetShinyCount = 0
    this.multiplierTargets = createEmptyMultiplierCounts()
    this.rebalanceTimer = REBALANCE_INTERVAL
    let totalW = 0

    // Decide which chars to highlight (letters only, weighted towards vowels/common consonants)
    const vowels = new Set('AEIOU')
    const commonConsonants = new Set('RSTLNDHC')

    // Track word boundaries
    let wordIndex = 0
    let inWord = false
    let highlightCooldown = 0
    let multiplierCooldown = 0
    let wordMultiplierCooldown = 0
    let shinyCooldown = 0

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
      let isBlank = false
      let multiplierType: MultiplierType = 'None'
      let powerUpType: PowerUpType = 'None'
      let isShiny = false
      let shinyBonus = 0

      if (this.streamKind === 'powerup') {
        powerUpType = powerUpTypes[i] ?? 'None'
        isHighlighted = powerUpType !== 'None'
      } else if (isLetter && highlightCooldown <= 0) {
        if (Math.random() < BLANK_TILE_SPAWN_RATE) {
          isBlank = true
          isHighlighted = true
          this.targetBlankCount++

          if (wordMultiplierCooldown <= 0) {
            const blankMultiplier = rollBlankWordMultiplier()
            multiplierType = blankMultiplier.multiplierType
            if (multiplierType !== 'None') {
              multiplierCooldown = blankMultiplier.cooldown
              wordMultiplierCooldown = blankMultiplier.wordMultiplierCooldown
            }
          }
        } else if (multiplierCooldown <= 0 && Math.random() < MULTIPLIER_SPAWN_RATE) {
          const availableMultipliers = MULTIPLIER_WEIGHTS.filter(option =>
            option.wordMultiplierCooldown === undefined || wordMultiplierCooldown <= 0
          )
          const totalWeight = availableMultipliers.reduce((sum, option) => sum + option.weight, 0)
          let pick = Math.random() * totalWeight

          for (const option of availableMultipliers) {
            pick -= option.weight
            if (pick <= 0) {
              multiplierType = option.type
              multiplierCooldown = option.cooldown
              if (option.wordMultiplierCooldown !== undefined) {
                wordMultiplierCooldown = option.wordMultiplierCooldown
              }
              break
            }
          }

          isHighlighted = multiplierType !== 'None'
        } else {
          let chance = this.highlightRate
          if (vowels.has(upper)) chance *= 1.8
          else if (commonConsonants.has(upper)) chance *= 1.3

          isHighlighted = Math.random() < chance
        }

        if (isHighlighted) {
          this.targetHighlightCount++
          if (multiplierType !== 'None') {
            this.multiplierTargets[multiplierType]++
          }
          if (!isBlank && shinyCooldown <= 0 && Math.random() < SHINY_SPAWN_RATE) {
            isShiny = true
            shinyBonus = getRandomShinyBonus(mc.char)
            this.targetShinyCount++
            shinyCooldown = 56 + Math.floor(Math.random() * 22)
          }
          // Enforce a minimum gap between collectibles (e.g., 8 to 12 characters)
          highlightCooldown = 8 + Math.floor(Math.random() * 5)
          if (multiplierType === 'None' && multiplierCooldown > 0) {
            multiplierCooldown--
          }
          if (wordMultiplierCooldown > 0) {
            wordMultiplierCooldown--
          }
        }
      }

      if (highlightCooldown > 0) {
        highlightCooldown--
      }
      if (shinyCooldown > 0) {
        shinyCooldown--
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
        isBlank,
        multiplierType,
        powerUpType,
        isShiny,
        shinyBonus,
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

    if (this.streamKind === 'text' && this.targetBlankCount < MIN_BLANK_TARGET_COUNT) {
      this.ensureMinimumBlankTargets()
    }

    this.totalWidth = totalW
    // Start offset randomly so lanes don't all start aligned
    this.scrollOffset = scrollRatio === undefined
      ? Math.random() * totalW * 0.5
      : Math.max(0, Math.min(1, scrollRatio)) * totalW
    this.visibleCharsCache = null
  }

  // Simple deterministic pseudo-random from seed
  private pseudoRandom(n: number): number {
    const x = Math.sin(n) * 43758.5453
    return x - Math.floor(x)
  }

  getScrollOffset(): number {
    return this.scrollOffset
  }

  update(dt: number, viewportWidth?: number): void {
    this.scrollOffset += this.speed * this.motionScale * this.direction * dt
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

    if (this.streamKind === 'text' && viewportWidth !== undefined) {
      this.rebalanceTimer -= dt
      if (this.rebalanceTimer <= 0) {
        this.rebalanceTimer = REBALANCE_INTERVAL
        this.rebalanceCollectibles(viewportWidth)
      }
    } else if (this.streamKind === 'powerup' && viewportWidth !== undefined) {
      this.recycleCollectedPowerUps(viewportWidth)
    }
  }

  // Get visible characters within a viewport
  getVisibleChars(viewportWidth: number): { char: StreamChar; screenX: number }[] {
    const cached = this.visibleCharsCache
    if (
      cached &&
      cached.viewportWidth === viewportWidth &&
      cached.scrollOffset === this.scrollOffset &&
      cached.totalWidth === this.totalWidth
    ) {
      return cached.visible
    }

    const visible: { char: StreamChar; screenX: number }[] = []
    const offset = this.scrollOffset
    const padding = 100 // Load further offscreen to prevent popping

    for (const ch of this.chars) {
      // Calculate base wrapped screen position to be nominally within [0, totalWidth)
      let screenX = (ch.x - offset) % this.totalWidth
      if (screenX < 0) screenX += this.totalWidth

      // Check the primary position and its immediate wrapped clones
      // This ensures characters smoothly enter/exit across screen boundaries without popping or gaps
      const leftCloneX = screenX - this.totalWidth
      if (leftCloneX >= -ch.width - padding && leftCloneX <= viewportWidth + padding) {
        visible.push({ char: ch, screenX: leftCloneX })
      }

      if (screenX >= -ch.width - padding && screenX <= viewportWidth + padding) {
        visible.push({ char: ch, screenX })
      }

      const rightCloneX = screenX + this.totalWidth
      if (rightCloneX >= -ch.width - padding && rightCloneX <= viewportWidth + padding) {
        visible.push({ char: ch, screenX: rightCloneX })
      }
    }

    this.visibleCharsCache = {
      viewportWidth,
      scrollOffset: this.scrollOffset,
      totalWidth: this.totalWidth,
      visible,
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
    return shimmer * this.motionScale
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

  resetPlayerEffects(): void {
    for (const ch of this.chars) {
      if (ch.isCollected) continue
      ch.targetDy = 0
      ch.targetDx = 0
      ch.targetRotation = 0
      ch.targetScale = 1
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

  private rebalanceCollectibles(viewportWidth: number): void {
    let activeHighlightCount = 0
    let activeBlankCount = 0
    let activeShinyCount = 0
    const activeMultiplierCounts = createEmptyMultiplierCounts()

    for (const ch of this.chars) {
      if (ch.isCollected || !ch.isHighlighted) continue
      activeHighlightCount++
      if (ch.isBlank) {
        activeBlankCount++
      }
      if (ch.isShiny) {
        activeShinyCount++
      }
      if (ch.multiplierType !== 'None') {
        activeMultiplierCounts[ch.multiplierType]++
      }
    }

    const hasMultiplierDeficit = ACTIVE_MULTIPLIER_TYPES.some(
      type => activeMultiplierCounts[type] < this.multiplierTargets[type]
    )

    const hasShinyDeficit = activeShinyCount < this.targetShinyCount
    const hasBlankDeficit = activeBlankCount < this.targetBlankCount

    if (!hasMultiplierDeficit && !hasShinyDeficit && !hasBlankDeficit && activeHighlightCount >= this.targetHighlightCount) {
      return
    }

    const visibleChars = new Set(this.getVisibleChars(viewportWidth).map(({ char }) => char))
    const activeHighlightIndices = this.chars
      .filter(ch => ch.isHighlighted && !ch.isCollected)
      .map(ch => ch.originalIndex)

    for (const type of ACTIVE_MULTIPLIER_TYPES) {
      while (activeMultiplierCounts[type] < this.multiplierTargets[type]) {
        const candidate = this.findReplacementCandidate(visibleChars, activeHighlightIndices, true, type)
        if (!candidate) break

        const wasHighlighted = candidate.isHighlighted
        candidate.isHighlighted = true
        candidate.multiplierType = type

        if (!wasHighlighted) activeHighlightCount++
        activeMultiplierCounts[type]++
        activeHighlightIndices.push(candidate.originalIndex)
      }
    }

    while (activeShinyCount < this.targetShinyCount) {
      const candidate = this.findShinyReplacementCandidate(visibleChars, activeHighlightIndices)
      if (!candidate) break

      if (!candidate.isHighlighted) {
        candidate.isHighlighted = true
        activeHighlightCount++
        activeHighlightIndices.push(candidate.originalIndex)
      }

      candidate.isShiny = true
      candidate.shinyBonus = getRandomShinyBonus(candidate.char)
      activeShinyCount++
    }

    while (activeBlankCount < this.targetBlankCount) {
      const candidate = this.findBlankReplacementCandidate(visibleChars, activeHighlightIndices)
      if (!candidate) break

      const wasHighlighted = candidate.isHighlighted
      candidate.isHighlighted = true
      candidate.isBlank = true
      candidate.isShiny = false
      candidate.shinyBonus = 0
      candidate.multiplierType = 'None'

      if (!wasHighlighted) {
        activeHighlightCount++
        activeHighlightIndices.push(candidate.originalIndex)
      }
      activeBlankCount++
    }

    while (activeHighlightCount < this.targetHighlightCount) {
      const candidate = this.findReplacementCandidate(visibleChars, activeHighlightIndices, false)
      if (!candidate) break

      candidate.isHighlighted = true
      candidate.multiplierType = 'None'
      activeHighlightCount++
      activeHighlightIndices.push(candidate.originalIndex)
    }
  }

  private ensureMinimumPowerUpPresence(powerUpChars: string[], powerUpTypes: PowerUpType[]): void {
    for (const type of ACTIVE_POWER_UP_TYPES) {
      if (powerUpTypes.includes(type)) continue

      const spacedCandidates: number[] = []
      const fallbackCandidates: number[] = []

      for (let i = 0; i < powerUpTypes.length; i++) {
        if (powerUpTypes[i] !== 'None') continue
        fallbackCandidates.push(i)
        if (!hasNearbyPowerUp(powerUpTypes, i, MIN_HIGHLIGHT_GAP * 2)) {
          spacedCandidates.push(i)
        }
      }

      const pool = spacedCandidates.length > 0 ? spacedCandidates : fallbackCandidates
      if (pool.length === 0) return

      const chosenIndex = pool[Math.floor(Math.random() * pool.length)]
      powerUpTypes[chosenIndex] = type
      powerUpChars[chosenIndex] = POWER_UP_ICONS[type]
    }
  }

  private ensureMinimumBlankTargets(): void {
    while (this.targetBlankCount < MIN_BLANK_TARGET_COUNT) {
      const activeHighlightIndices = this.chars
        .filter(ch => ch.isHighlighted)
        .map(ch => ch.originalIndex)
      const candidate = this.findBlankReplacementCandidate(new Set<StreamChar>(), activeHighlightIndices)
      if (!candidate) break

      if (!candidate.isHighlighted) {
        candidate.isHighlighted = true
        this.targetHighlightCount++
      }
      candidate.isBlank = true
      candidate.isShiny = false
      candidate.shinyBonus = 0
      candidate.multiplierType = 'None'
      this.targetBlankCount++
    }
  }

  private recycleCollectedPowerUps(viewportWidth: number): void {
    const visibleChars = new Set(this.getVisibleChars(viewportWidth).map(({ char }) => char))

    for (const ch of this.chars) {
      if (ch.powerUpType === 'None' || !ch.isCollected) continue
      if (visibleChars.has(ch) || ch.alpha > 0.02) continue

      ch.isCollected = false
      ch.alpha = 1
      ch.scale = 1
      ch.targetScale = 1
      ch.dy = 0
      ch.targetDy = 0
      ch.dx = 0
      ch.targetDx = 0
      ch.rotation = 0
      ch.targetRotation = 0
      ch.rippleAmplitude = 0
      ch.ripplePhase = 0
    }
  }

  private findBlankReplacementCandidate(
    visibleChars: Set<StreamChar>,
    activeHighlightIndices: number[],
  ): StreamChar | null {
    const promotedHighlights: StreamChar[] = []
    const freshHighlights: StreamChar[] = []

    for (const ch of this.chars) {
      if (!/[A-Za-z]/.test(ch.char) || ch.isCollected || ch.isBlank || ch.multiplierType !== 'None' || ch.isShiny) continue
      if (visibleChars.has(ch)) continue

      if (ch.isHighlighted) {
        promotedHighlights.push(ch)
        continue
      }

      if (this.hasHighlightConflict(ch.originalIndex, activeHighlightIndices)) continue
      freshHighlights.push(ch)
    }

    const pool = promotedHighlights.length > 0 ? promotedHighlights : freshHighlights
    if (pool.length === 0) return null
    return pool[Math.floor(Math.random() * pool.length)]
  }

  private findShinyReplacementCandidate(
    visibleChars: Set<StreamChar>,
    activeHighlightIndices: number[],
  ): StreamChar | null {
    const highlightedMultiplierCandidates: StreamChar[] = []
    const highlightedRegularCandidates: StreamChar[] = []
    const freshCandidates: StreamChar[] = []

    for (const ch of this.chars) {
      if (!/[A-Za-z]/.test(ch.char) || ch.isCollected || ch.isShiny || ch.isBlank) continue
      if (visibleChars.has(ch)) continue

      if (ch.isHighlighted) {
        if (ch.multiplierType !== 'None') highlightedMultiplierCandidates.push(ch)
        else highlightedRegularCandidates.push(ch)
        continue
      }

      if (this.hasHighlightConflict(ch.originalIndex, activeHighlightIndices)) continue
      freshCandidates.push(ch)
    }

    const pool = highlightedMultiplierCandidates.length > 0
      ? highlightedMultiplierCandidates
      : highlightedRegularCandidates.length > 0
        ? highlightedRegularCandidates
        : freshCandidates

    if (pool.length === 0) return null
    return pool[Math.floor(Math.random() * pool.length)]
  }

  private findReplacementCandidate(
    visibleChars: Set<StreamChar>,
    activeHighlightIndices: number[],
    allowExistingHighlights: boolean,
    requiredMultiplierType?: ActiveMultiplierType,
  ): StreamChar | null {
    const promotedHighlights: StreamChar[] = []
    const freshHighlights: StreamChar[] = []

    for (const ch of this.chars) {
      if (!/[A-Za-z]/.test(ch.char) || ch.isCollected || ch.multiplierType !== 'None') continue
      if (visibleChars.has(ch) || this.hasHighlightConflict(ch.originalIndex, activeHighlightIndices)) continue
      if (ch.isBlank && requiredMultiplierType && requiredMultiplierType !== 'DoubleWord' && requiredMultiplierType !== 'TripleWord') {
        continue
      }

      if (ch.isHighlighted) {
        if (allowExistingHighlights) promotedHighlights.push(ch)
        continue
      }

      freshHighlights.push(ch)
    }

    const pool = promotedHighlights.length > 0 ? promotedHighlights : freshHighlights
    if (pool.length === 0) return null
    return pool[Math.floor(Math.random() * pool.length)]
  }

  private hasHighlightConflict(index: number, activeHighlightIndices: number[]): boolean {
    const totalChars = this.chars.length

    for (const activeIndex of activeHighlightIndices) {
      const directDistance = Math.abs(activeIndex - index)
      const wrappedDistance = totalChars - directDistance
      if (Math.min(directDistance, wrappedDistance) <= MIN_HIGHLIGHT_GAP) {
        return true
      }
    }

    return false
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
