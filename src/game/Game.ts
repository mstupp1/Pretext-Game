// ── Game — Core game state machine ──

import { Player } from './Player'
import { audioManager } from '../audio/AudioManager'
import { Lane, type LaneConfig } from './Lane'
import { scoreWord, type ScoreResult, getLetterValue } from './Scoring'
import { generateLevel, type LevelConfig } from './Levels'
import { ParticleSystem } from '../effects/ParticleSystem'
import { GAME_WIDTH, GAME_HEIGHT, LANE_COUNT, LANE_HEIGHT, LANE_Y_START, COLORS, CANVAS_FONTS, ROMAN_NUMERALS, MAX_COLLECTED_LETTERS, TIME_BONUS } from '../utils/constants'
import { renderText, measureTextWidth, renderCurvedText, measureCharsInLine } from '../text/TextEngine'
import { getPageCurvatureOffset } from '../text/TextStream'

export type GameState = 'title' | 'countdown' | 'playing' | 'paused' | 'gameover'

interface CollectedLetter {
  letter: string
  value: number
  // Animation
  floatingX: number
  floatingY: number
  animProgress: number
}

interface FeedbackMessage {
  text: string
  success: boolean
  timer: number
}

interface FloatingScore {
  x: number
  y: number
  text: string
  alpha: number
  dy: number
}

export class Game {
  public state: GameState = 'title'
  public canvas: HTMLCanvasElement
  public ctx: CanvasRenderingContext2D

  // Game objects
  public player: Player
  public lanes: Lane[] = []
  public level: LevelConfig

  // Game state
  public score: number = 0
  public chapter: number = 1
  public timeRemaining: number = 90
  public collectedLetters: CollectedLetter[] = []
  public wordsFound: string[] = []
  public usedWords: Set<string> = new Set()    // words used this run (no repeats)
  public feedback: FeedbackMessage | null = null
  public floatingScores: FloatingScore[] = []
  public highScores: number[] = []
  public particles: ParticleSystem = new ParticleSystem()

  // Input state
  private keys: Set<string> = new Set()
  private keyDebounce: Map<string, number> = new Map()

  // Title screen animation
  private titleTime: number = 0

  // Manage collecting cooldown
  private collectCooldown: number = 0
  private isSubmitting: boolean = false
  private pauseOptionIndex: number = 0

  // Countdown state
  private countdownValue: number = 3
  private countdownTimer: number = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!

    this.canvas.width = GAME_WIDTH
    this.canvas.height = GAME_HEIGHT

    this.player = new Player()
    this.level = generateLevel(1)
    this.loadHighScores()

    // Input handlers
    window.addEventListener('keydown', (e) => this.onKeyDown(e))
    window.addEventListener('keyup', (e) => this.onKeyUp(e))

    // Show UI bars on all screens (they stay visible as layout chrome)
    this.setHudContentVisible(false)
    this.updateUI()
    this.updateTrayUI()
    this.updateWordsUI()

    this.setupPauseMenu()

    audioManager.playTitleMusic()
  }

  private setupPauseMenu(): void {
    const musicOpt = document.getElementById('option-music')
    const sfxOpt = document.getElementById('option-sfx')

    if (musicOpt) {
      musicOpt.addEventListener('click', () => {
        const isMuted = audioManager.toggleMusic()
        audioManager.playMenuNav()
        const status = musicOpt.querySelector('.status')
        if (status) status.textContent = isMuted ? '[x]' : '[ ]'
        musicOpt.style.color = isMuted ? COLORS.muted : COLORS.espresso
      })
      musicOpt.addEventListener('mouseenter', () => audioManager.playMenuNav())
    }

    if (sfxOpt) {
      sfxOpt.addEventListener('click', () => {
        const isMuted = audioManager.toggleSfx()
        audioManager.playMenuNav()
        const status = sfxOpt.querySelector('.status')
        if (status) status.textContent = isMuted ? '[x]' : '[ ]'
        sfxOpt.style.color = isMuted ? COLORS.muted : COLORS.espresso
      })
      sfxOpt.addEventListener('mouseenter', () => audioManager.playMenuNav())
    }
  }

  private loadHighScores(): void {
    try {
      const stored = localStorage.getItem('lexicon-crossing-scores')
      if (stored) this.highScores = JSON.parse(stored)
    } catch { /* ignore */ }
  }

  private saveHighScore(score: number): void {
    this.highScores.push(score)
    this.highScores.sort((a, b) => b - a)
    this.highScores = this.highScores.slice(0, 5)
    try {
      localStorage.setItem('lexicon-crossing-scores', JSON.stringify(this.highScores))
    } catch { /* ignore */ }
  }

  // ── State transitions ──

  startGame(): void {
    if (this.state === 'title') {
      audioManager.playPagesFromTitle()
    } else if (this.state === 'gameover') {
      audioManager.playPagesFromGameOver()
    }
    audioManager.playGameMusic()
    this.state = 'countdown'
    this.countdownValue = 3
    this.countdownTimer = 1.0 // 1 second per number
    this.score = 0
    this.chapter = 1
    this.wordsFound = []
    this.usedWords = new Set()
    this.collectedLetters = []
    this.feedback = null
    this.floatingScores = []
    this.player = new Player()
    this.loadLevel(1)

    this.setHudContentVisible(true)
    this.updateUI()
    this.updateTrayUI()
    this.updateWordsUI()

    const gameoverOverlay = document.getElementById('gameover-overlay')
    if (gameoverOverlay) gameoverOverlay.style.display = 'none'
  }

  private beginPlaying(): void {
    this.state = 'playing'
    this.updateUI()
    this.updateTrayUI()
    this.updateWordsUI()
  }

  private loadLevel(chapter: number): void {
    this.chapter = chapter
    this.level = generateLevel(chapter)
    this.timeRemaining = this.level.timeLimit
    this.player.reset()
    this.buildLanes()
    this.updateUI()
  }

  private buildLanes(): void {
    this.lanes = []
    for (let i = 0; i < LANE_COUNT; i++) {
      const config = this.level.laneConfigs[i]
      const y = LANE_Y_START + i * LANE_HEIGHT
      this.lanes.push(new Lane(config, y))
    }
  }

  private gameOver(): void {
    audioManager.playApplause(this.chapter)
    audioManager.playTitleMusic()
    this.state = 'gameover'
    this.saveHighScore(this.score)
    this.setHudContentVisible(false)
    this.updateUI()
    this.updateTrayUI()
    this.updateWordsUI()

    const gameoverOverlay = document.getElementById('gameover-overlay')
    if (gameoverOverlay) gameoverOverlay.style.display = 'flex'
  }

  private returnToTitle(): void {
    this.state = 'title'
    this.titleTime = 0
    audioManager.playTitleMusic()
    this.setHudContentVisible(false)
    this.updateUI()

    const gameoverOverlay = document.getElementById('gameover-overlay')
    if (gameoverOverlay) gameoverOverlay.style.display = 'none'
  }

  private togglePause(): void {
    if (this.state === 'playing') {
      this.state = 'paused'
      this.pauseOptionIndex = 0
      this.updatePauseMenuHighlight()
      const pauseOverlay = document.getElementById('pause-overlay')
      if (pauseOverlay) pauseOverlay.style.display = 'flex'
    } else if (this.state === 'paused') {
      this.state = 'playing'
      const pauseOverlay = document.getElementById('pause-overlay')
      if (pauseOverlay) pauseOverlay.style.display = 'none'
    }
  }

  private updatePauseMenuHighlight(): void {
    const musicOpt = document.getElementById('option-music')
    const sfxOpt = document.getElementById('option-sfx')
    if (musicOpt) musicOpt.style.textDecoration = this.pauseOptionIndex === 0 ? 'underline' : 'none'
    if (sfxOpt) sfxOpt.style.textDecoration = this.pauseOptionIndex === 1 ? 'underline' : 'none'
  }

  // ── Input handling ──

  private onKeyDown(e: Event): void {
    const event = e as KeyboardEvent
    if (event.repeat) return

    this.keys.add(event.key)

    if (this.state === 'title') {
      if (event.key === ' ' || event.key === 'Enter') {
        e.preventDefault()
        this.startGame()
      }
      return
    }

    if (this.state === 'gameover') {
      if (event.key === ' ' || event.key === 'Enter') {
        e.preventDefault()
        this.startGame()
      } else if (event.key === 'Escape') {
        e.preventDefault()
        this.returnToTitle()
      }
      return
    }

    if (this.state === 'paused') {
      if (event.key === 'Escape') {
        e.preventDefault()
        this.togglePause()
      } else if (event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') {
        e.preventDefault()
        this.pauseOptionIndex = (this.pauseOptionIndex - 1 + 2) % 2
        audioManager.playMenuNav()
        this.updatePauseMenuHighlight()
      } else if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'S') {
        e.preventDefault()
        this.pauseOptionIndex = (this.pauseOptionIndex + 1) % 2
        audioManager.playMenuNav()
        this.updatePauseMenuHighlight()
      } else if (event.key === 'Enter' || event.key === ' ') {
        e.preventDefault()
        if (this.pauseOptionIndex === 0) {
          document.getElementById('option-music')?.click()
        } else {
          document.getElementById('option-sfx')?.click()
        }
      }
      return
    }

    if (this.state === 'playing') {
      switch (event.key) {
        case 'Escape':
          e.preventDefault()
          this.togglePause()
          break
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault()
          this.player.moveUp()
          audioManager.playMovement()
          break
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault()
          this.player.moveDown()
          audioManager.playMovement()
          break
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault()
          this.player.moveLeft()
          audioManager.playMovement()
          break
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault()
          this.player.moveRight()
          audioManager.playMovement()
          break
        case 'Enter':
          e.preventDefault()
          this.submitWord()
          break
        case 'Backspace':
          e.preventDefault()
          this.removeLastLetter()
          break
        case ' ':
          e.preventDefault()
          this.tryCollectLetter()
          break
      }
    }
  }

  private onKeyUp(e: Event): void {
    const event = e as KeyboardEvent
    this.keys.delete(event.key)
  }

  // ── Game actions ──

  private tryCollectLetter(): void {
    if (this.collectCooldown > 0) return
    if (this.collectedLetters.length >= MAX_COLLECTED_LETTERS) {
      this.showFeedback('Tray full — submit or clear first', false)
      return
    }

    const lane = this.lanes[this.player.laneIndex]
    if (!lane || lane.isSafeZone) return

    const collected = lane.findCollectibleNear(this.player.x)
    if (collected) {
      collected.isCollected = true
      const letter = collected.char.toUpperCase()
      this.collectedLetters.push({
        letter,
        value: getLetterValue(letter),
        floatingX: this.player.x,
        floatingY: this.player.y,
        animProgress: 0,
      })
      this.collectCooldown = 0.15
      this.updateTrayUI()
      audioManager.playSelectLetter()

      // Particle burst on collection
      this.particles.collectBurst(letter, this.player.x, this.player.y)

      // Trigger ripple wave on the lane
      lane.triggerRipple(this.player.x)
    }
  }

  async submitWord(): Promise<void> {
    if (this.state !== 'playing') return
    if (this.isSubmitting) return

    const allLetters = this.collectedLetters.map(l => l.letter)

    if (allLetters.length === 0) {
      this.showFeedback('Collect letters first', false)
      audioManager.playNoSubmit()
      return
    }

    // Check for duplicate word in this chapter
    const candidateWord = allLetters.join('').toUpperCase()
    if (this.usedWords.has(candidateWord)) {
      this.showFeedback(`"${candidateWord}" already used this run`, false)
      audioManager.playNoSubmit()
      return
    }

    this.isSubmitting = true
    this.showFeedback('Checking lexicon...', true)
    
    // Set a very long timer for the check so it doesn't disappear in the middle of a slow API call
    if (this.feedback) this.feedback.timer = 10

    const result = await scoreWord(allLetters)

    this.isSubmitting = false

    if (result.valid) {
      audioManager.playScore(result.totalScore)
      this.score += result.totalScore
      this.wordsFound.push(result.word)
      this.usedWords.add(result.word)

      // Clear all letters after successful submit
      this.collectedLetters = []

      this.showFeedback(`${result.word}: +${result.totalScore}  ${result.message}`, true)

      // ✨ TYPOGRAPHIC EXPLOSION — the big payoff!
      const intensity = Math.min(2, 0.8 + result.totalScore / 50)
      this.particles.explodeWord(result.word, GAME_WIDTH / 2, GAME_HEIGHT / 2, intensity)

      // Score text rises as particles
      this.particles.waveText(`+${result.totalScore}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60)

      this.updateWordsUI()
    } else {
      audioManager.playNoSubmit()
      this.showFeedback(result.message, false)
    }

    this.updateUI()
    this.updateTrayUI()
  }

  removeLastLetter(): void {
    if (this.collectedLetters.length > 0) {
      this.collectedLetters.pop()
      this.updateTrayUI()
    }
  }

  private showFeedback(text: string, success: boolean): void {
    this.feedback = { text, success, timer: 2.5 }
    const feedbackEl = document.getElementById('word-feedback')
    if (feedbackEl) {
      feedbackEl.textContent = text
      feedbackEl.className = success ? 'success' : 'error'
    }
  }

  // ── Update loop ──

  update(dt: number): void {
    if (this.state === 'title') {
      this.titleTime += dt
      return
    }

    if (this.state === 'countdown') {
      this.countdownTimer -= dt
      if (this.countdownTimer <= 0) {
        this.countdownValue--
        this.countdownTimer = 1.0
        if (this.countdownValue < 0) {
          this.beginPlaying()
          return
        }
      }
      
      // Update lanes during countdown for ambient background
      for (const lane of this.lanes) {
        lane.update(dt, -100, -100) // Dummy player pos to avoid effects
      }
      return
    }

    if (this.state !== 'playing') return

    // Timer
    const prevSec = Math.ceil(this.timeRemaining)
    this.timeRemaining -= dt
    const currSec = Math.ceil(this.timeRemaining)

    if (prevSec > currSec) {
      if (currSec > 0 && currSec % 30 === 0) {
        audioManager.playTimeWarning1()
      } else if (currSec === 15) {
        audioManager.playTimeWarning2()
      }
    }

    if (this.timeRemaining <= 0) {
      this.timeRemaining = 0
      this.gameOver()
      return
    }

    // Player
    this.player.update(dt)

    // Collect cooldown
    this.collectCooldown = Math.max(0, this.collectCooldown - dt)

    // Lanes — pass full player position for cross-lane effects
    for (const lane of this.lanes) {
      lane.update(dt, this.player.x, this.player.y)
    }

    // Check chapter threshold (easy progression: 75 points per chapter)
    const requiredScore = this.chapter * 75
    if (this.score >= requiredScore) {
      this.chapter++
      audioManager.playChapterUnlock()
      this.level = generateLevel(this.chapter)
      this.timeRemaining += this.level.timeLimit // Add chapter allotment to current time (reward for speed)
      this.buildLanes()
      this.showFeedback(`Chapter ${ROMAN_NUMERALS[Math.min(this.chapter - 1, ROMAN_NUMERALS.length - 1)]} — New chapter unlocked!`, true)
      // Celebration particles
      this.particles.waveText(`Chapter ${ROMAN_NUMERALS[Math.min(this.chapter - 1, ROMAN_NUMERALS.length - 1)]}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40)
    }

    // Collected letter animations
    for (const letter of this.collectedLetters) {
      letter.animProgress = Math.min(1, letter.animProgress + dt * 4)
    }

    // Floating scores
    this.floatingScores = this.floatingScores.filter(fs => {
      fs.y += fs.dy * dt
      fs.alpha -= dt * 0.8
      return fs.alpha > 0
    })

    // Particles
    this.particles.update(dt)

    // Feedback timer
    if (this.feedback) {
      this.feedback.timer -= dt
      if (this.feedback.timer <= 0) {
        this.feedback = null
        const feedbackEl = document.getElementById('word-feedback')
        if (feedbackEl) feedbackEl.textContent = ''
      }
    }

    this.updateUI()
  }

  // ── Render ──

  render(): void {
    const ctx = this.ctx

    // Clear with ivory
    ctx.fillStyle = COLORS.ivory
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    if (this.state === 'title') {
      this.renderTitle(ctx)
      return
    }

    if (this.state === 'countdown') {
      this.renderCountdown(ctx)
      return
    }

    if (this.state === 'gameover') {
      this.renderGameOver(ctx)
      return
    }

    // Draw subtle paper texture
    this.renderBackground(ctx)

    // Render lanes
    for (const lane of this.lanes) {
      lane.render(ctx, this.player.laneIndex, this.player.x)
    }

    // Render player
    this.player.render(ctx)

    // Render particles (on top of everything)
    this.particles.render(ctx)

    // Render floating scores
    for (const fs of this.floatingScores) {
      ctx.save()
      ctx.globalAlpha = fs.alpha
      ctx.font = CANVAS_FONTS.laneBold(18)
      ctx.fillStyle = COLORS.gold
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const offset = getPageCurvatureOffset(fs.x, GAME_WIDTH)
      ctx.fillText(fs.text, fs.x, fs.y + offset)
      ctx.restore()
    }

    ctx.textAlign = 'left'

    // Top/bottom boundaries
    this.renderBoundaryDecoration(ctx)
  }

  private renderBackground(ctx: CanvasRenderingContext2D): void {
    // Ruled lines across the entire page
    ctx.strokeStyle = 'rgba(44, 24, 16, 0.04)'
    ctx.lineWidth = 0.5
    const startY = 40
    const endY = GAME_HEIGHT - 40
    for (let y = startY; y <= endY; y += 22) {
      ctx.beginPath()
      for (let x = 0; x <= GAME_WIDTH; x += 10) {
        const offset = getPageCurvatureOffset(x, GAME_WIDTH)
        if (x === 0) ctx.moveTo(x, y + offset)
        else ctx.lineTo(x, y + offset)
      }
      ctx.stroke()
    }

    // Vignette
    const gradient = ctx.createRadialGradient(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 0.3,
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 0.7,
    )
    gradient.addColorStop(0, 'rgba(245, 241, 232, 0)')
    gradient.addColorStop(1, 'rgba(200, 190, 170, 0.15)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    
    // Book spine crease (center)
    const spineGradient = ctx.createLinearGradient(GAME_WIDTH / 2 - 40, 0, GAME_WIDTH / 2 + 40, 0)
    spineGradient.addColorStop(0, 'rgba(0, 0, 0, 0)')
    spineGradient.addColorStop(0.3, 'rgba(0, 0, 0, 0.05)')
    spineGradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.12)')
    spineGradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.05)')
    spineGradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = spineGradient
    ctx.fillRect(GAME_WIDTH / 2 - 40, 0, 80, GAME_HEIGHT)

    // Book page edges (left and right shadows)
    const edgeGradientLeft = ctx.createLinearGradient(0, 0, 30, 0)
    edgeGradientLeft.addColorStop(0, 'rgba(0, 0, 0, 0.06)')
    edgeGradientLeft.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = edgeGradientLeft
    ctx.fillRect(0, 0, 30, GAME_HEIGHT)

    const edgeGradientRight = ctx.createLinearGradient(GAME_WIDTH - 30, 0, GAME_WIDTH, 0)
    edgeGradientRight.addColorStop(0, 'rgba(0, 0, 0, 0)')
    edgeGradientRight.addColorStop(1, 'rgba(0, 0, 0, 0.06)')
    ctx.fillStyle = edgeGradientRight
    ctx.fillRect(GAME_WIDTH - 30, 0, 30, GAME_HEIGHT)
  }

  private renderBoundaryDecoration(ctx: CanvasRenderingContext2D): void {
    // Top decorative line
    ctx.strokeStyle = COLORS.rule
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 30; x <= GAME_WIDTH - 30; x += 10) {
      const offset = getPageCurvatureOffset(x, GAME_WIDTH)
      if (x === 30) ctx.moveTo(x, LANE_Y_START + offset)
      else ctx.lineTo(x, LANE_Y_START + offset)
    }
    ctx.stroke()

    // Bottom decorative line
    const bottomY = LANE_Y_START + LANE_COUNT * LANE_HEIGHT
    ctx.beginPath()
    for (let x = 30; x <= GAME_WIDTH - 30; x += 10) {
      const offset = getPageCurvatureOffset(x, GAME_WIDTH)
      if (x === 30) ctx.moveTo(x, bottomY + offset)
      else ctx.lineTo(x, bottomY + offset)
    }
    ctx.stroke()
  }

  // Ease-out cubic for smooth entrance deceleration
  private titleEaseOut(t: number): number {
    const c = Math.min(1, Math.max(0, t))
    return 1 - Math.pow(1 - c, 3)
  }

  // Compute entrance animation values: { alpha, slideY } for an element
  // delay = seconds before this element starts animating, duration = animation length
  private titleEntrance(delay: number, duration: number = 1.5): { alpha: number; slideY: number } {
    const elapsed = this.titleTime - delay
    if (elapsed <= 0) return { alpha: 0, slideY: 30 }
    const t = this.titleEaseOut(elapsed / duration)
    return { alpha: t, slideY: 30 * (1 - t) }
  }

  private renderTitle(ctx: CanvasRenderingContext2D): void {
    // Use the standard book background (texture, spine, etc.)
    this.renderBackground(ctx)

    const centerX = GAME_WIDTH * 0.75 // Center of the right-hand page
    const getOffset = (x: number) => getPageCurvatureOffset(x, GAME_WIDTH)

    const titleY = GAME_HEIGHT * 0.32

    // ── Section 1: Title & Subtitle (delay: 0.0s, duration: 1.5s) ──
    const sec1 = this.titleEntrance(0.0, 1.5)
    if (sec1.alpha > 0) {
      ctx.save()
      ctx.globalAlpha = sec1.alpha
      ctx.translate(0, sec1.slideY)

      // Title - Animated character by character
      const titleText = 'Lexicon Crossing'
      const titleFont = CANVAS_FONTS.title(52)
      const titleChars = measureCharsInLine(titleText, titleFont)

      let titleWidth = 0
      for (const ch of titleChars) titleWidth += ch.width
      const startX = centerX - titleWidth / 2

      ctx.font = titleFont
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'center'

      // Time variables for effects
      const waveSpeed = 1.5
      const shimmerDuration = 2.0 // seconds to sweep
      const shimmerCycle = 4.0    // total cycle time
      const shimmerTime = this.titleTime % shimmerCycle
      const shimmerProgress = shimmerTime / shimmerDuration
      // Move from -100 to titleWidth + 100 to ensure full fade in/out
      const shimmerPos = shimmerProgress * (titleWidth + 200) - 100

      for (let i = 0; i < titleChars.length; i++) {
        const ch = titleChars[i]
        const charX = startX + ch.x + ch.width / 2

        // 1. Sine wave oscillation
        const wave = Math.sin(this.titleTime * waveSpeed + i * 0.4) * 3.0

        // Use getOffset(charX) to curve it along the spine correctly
        const charY = titleY + getOffset(charX) + wave

        // 2. Shimmer blend
        const dist = Math.abs((ch.x + ch.width / 2) - shimmerPos)
        // Shimmer affects chars within a ~40px radius
        const blend = Math.max(0, 1 - dist / 40)

        // Draw base text (espresso)
        ctx.fillStyle = COLORS.espresso
        ctx.fillText(ch.char, charX, charY)

        // Draw shimmer highlight (goldLight) over top if applicable
        if (blend > 0) {
          ctx.save()
          ctx.globalAlpha = sec1.alpha * blend * 0.85
          ctx.fillStyle = COLORS.goldLight
          ctx.fillText(ch.char, charX, charY)
          ctx.restore()
        }
      }
      ctx.textAlign = 'left' // Reset

      renderText(ctx, 'A   TYPOGRAPHIC   SCRAMBLE', centerX, titleY + 48 + getOffset(centerX),
        CANVAS_FONTS.uiSmallCaps(12), COLORS.muted, 'center')
      ctx.restore()
    }

    // ── Section 2: Ornament, Instructions, Keyboard Layout (delay: 1.2s, duration: 1.5s) ──
    const sec2 = this.titleEntrance(1.2, 1.5)
    if (sec2.alpha > 0) {
      ctx.save()
      ctx.globalAlpha = sec2.alpha
      ctx.translate(0, sec2.slideY)

      // Ornament
      renderText(ctx, '✦', centerX, titleY + 85 + getOffset(centerX),
        CANVAS_FONTS.laneRegular(20), COLORS.gold, 'center')

      // Instructions
      const instrY = titleY + 115
      const instrFont = CANVAS_FONTS.laneItalic(14)
      const lines = [
        'Navigate through streams of flowing prose.',
        'Collect letters and spell words for points.',
        'Score points to reach new chapters.',
      ]

      for (let i = 0; i < lines.length; i++) {
        renderText(ctx, lines[i], centerX, instrY + i * 24 + getOffset(centerX), instrFont, COLORS.sepia, 'center')
      }

      // Keyboard Layout
      const keysY = instrY + 112
      const colSpacing = 22
      const rowSpacing = 22
      const keySize = 22

      // ── WASD ──
      const wasdX = centerX - 85
      this.renderKey(ctx, 'W', wasdX, keysY - rowSpacing, keySize, keySize)
      this.renderKey(ctx, 'A', wasdX - colSpacing, keysY, keySize, keySize)
      this.renderKey(ctx, 'S', wasdX, keysY, keySize, keySize)
      this.renderKey(ctx, 'D', wasdX + colSpacing, keysY, keySize, keySize)
      renderText(ctx, 'MOVE', wasdX, keysY + 25, CANVAS_FONTS.uiSmallCaps(7.5), COLORS.muted, 'center')

      // ── Arrows ──
      const arrowsX = centerX + 85
      this.renderKey(ctx, '↑', arrowsX, keysY - rowSpacing, keySize, keySize)
      this.renderKey(ctx, '←', arrowsX - colSpacing, keysY, keySize, keySize)
      this.renderKey(ctx, '↓', arrowsX, keysY, keySize, keySize)
      this.renderKey(ctx, '→', arrowsX + colSpacing, keysY, keySize, keySize)
      renderText(ctx, 'OR', centerX, keysY, CANVAS_FONTS.uiSmallCaps(8), COLORS.muted, 'center')
      renderText(ctx, 'MOVE', arrowsX, keysY + 25, CANVAS_FONTS.uiSmallCaps(7.5), COLORS.muted, 'center')

      // ── Actions ──
      const actionY = keysY + 60
      const actionSpacing = 88

      const spaceX = centerX - actionSpacing
      this.renderKey(ctx, 'Space', spaceX, actionY, 52, 20)
      renderText(ctx, 'COLLECT', spaceX, actionY + 20, CANVAS_FONTS.uiSmallCaps(7.5), COLORS.muted, 'center')

      const backX = centerX
      this.renderKey(ctx, 'Bksp', backX, actionY, 52, 20)
      renderText(ctx, 'UNDO', backX, actionY + 20, CANVAS_FONTS.uiSmallCaps(7.5), COLORS.muted, 'center')

      const enterX = centerX + actionSpacing
      this.renderKey(ctx, 'Enter', enterX, actionY, 52, 20)
      renderText(ctx, 'SUBMIT', enterX, actionY + 20, CANVAS_FONTS.uiSmallCaps(7.5), COLORS.muted, 'center')

      ctx.restore()
    }

    // ── Section 3: Prompt (delay: 2.7s, duration: 1.2s, then breathing) ──
    const sec3 = this.titleEntrance(2.7, 1.2)
    if (sec3.alpha > 0) {
      const breathe = Math.sin(this.titleTime * 2.5) * 0.3 + 0.7
      ctx.save()
      ctx.globalAlpha = sec3.alpha * breathe
      renderText(ctx, 'Press SPACE or ENTER to begin', centerX, GAME_HEIGHT - 85 + getOffset(centerX) + sec3.slideY,
        CANVAS_FONTS.laneItalic(15), COLORS.sepia, 'center')
      ctx.restore()
    }

    // ── Credits (static, always visible) ──
    renderText(ctx, 'Created by Myles Stupp', centerX, GAME_HEIGHT - 45 + getOffset(centerX),
      CANVAS_FONTS.uiSmallCaps(10), COLORS.muted, 'center')
    renderText(ctx, 'Powered by Pretext — chenglou/pretext', centerX, GAME_HEIGHT - 30 + getOffset(centerX),
      CANVAS_FONTS.uiSmallCaps(10), COLORS.muted, 'center')
  }

  private renderKey(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, width: number = 26, height: number = 26): void {
    const borderRadius = 4
    const visualDepth = 3

    ctx.save()
    ctx.translate(x, y)
    
    // ── 0. Floating Shadow (on the page below) ──
    ctx.shadowColor = 'rgba(0, 0, 0, 0.12)'
    ctx.shadowBlur = 10
    ctx.shadowOffsetY = 6
    ctx.beginPath()
    if (ctx.roundRect) {
      ctx.roundRect(-width / 2, -height / 2, width, height, borderRadius)
    } else {
      ctx.rect(-width / 2, -height / 2, width, height)
    }
    ctx.fill()
    
    // Reset shadow for the key itself to keep it crisp
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0

    // ── 1. Key Base (Side/Depth) ──
    ctx.fillStyle = '#C0A070' // Darker parchment/gold for the depth
    ctx.beginPath()
    if (ctx.roundRect) {
      ctx.roundRect(-width / 2, -height / 2 + visualDepth, width, height, borderRadius)
    } else {
      ctx.rect(-width / 2, -height / 2 + visualDepth, width, height)
    }
    ctx.fill()

    // ── 2. Key Top Face ──
    ctx.fillStyle = COLORS.cream
    ctx.beginPath()
    if (ctx.roundRect) {
      ctx.roundRect(-width / 2, -height / 2, width, height, borderRadius)
    } else {
      ctx.rect(-width / 2, -height / 2, width, height)
    }
    ctx.fill()

    // ── 3. Border (Premium touch) ──
    ctx.strokeStyle = COLORS.gold
    ctx.lineWidth = 1
    ctx.stroke()

    // ── 4. Key Label ──
    const isSmall = label.length > 2
    const fontSize = isSmall ? 8 : 11
    ctx.fillStyle = COLORS.espresso
    ctx.font = CANVAS_FONTS.uiSmallCaps(fontSize)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // Nudge label up slightly for better ergonomics on top face
    ctx.fillText(label.toUpperCase(), 0, -1)

    ctx.restore()
  }

  private renderGameOver(ctx: CanvasRenderingContext2D): void {
    // Use the standard book background
    this.renderBackground(ctx)

    const centerX = GAME_WIDTH * 0.75
    const getOffset = (x: number) => getPageCurvatureOffset(x, GAME_WIDTH)
    const centerY = GAME_HEIGHT * 0.25

    renderText(ctx, 'Finis', centerX, centerY + getOffset(centerX),
      CANVAS_FONTS.title(48), COLORS.espresso, 'center')

    renderText(ctx, `Chapter ${ROMAN_NUMERALS[Math.min(this.chapter - 1, 9)]} reached`, centerX, centerY + 45 + getOffset(centerX),
      CANVAS_FONTS.laneItalic(16), COLORS.sepia, 'center')

    // Final score
    renderText(ctx, String(this.score), centerX, centerY + 100 + getOffset(centerX),
      CANVAS_FONTS.laneLight(56), COLORS.gold, 'center')

    renderText(ctx, 'POINTS', centerX, centerY + 130 + getOffset(centerX),
      CANVAS_FONTS.uiSmallCaps(10), COLORS.muted, 'center')

    // Words found
    if (this.wordsFound.length > 0) {
      renderText(ctx, `${this.wordsFound.length} word${this.wordsFound.length !== 1 ? 's' : ''} composed`, centerX, centerY + 165 + getOffset(centerX),
        CANVAS_FONTS.laneItalic(14), COLORS.sepia, 'center')

      // Show words in a flowing line
      const wordStr = this.wordsFound.slice(-8).join('  ·  ')
      renderText(ctx, wordStr, centerX, centerY + 190 + getOffset(centerX),
        CANVAS_FONTS.laneItalic(13), COLORS.muted, 'center')
    }

    // High scores
    if (this.highScores.length > 0) {
      const hsY = centerY + 240
      renderText(ctx, 'HIGH SCORES', centerX, hsY + getOffset(centerX),
        CANVAS_FONTS.uiSmallCaps(10), COLORS.muted, 'center')

      ctx.strokeStyle = COLORS.rule
      ctx.lineWidth = 0.5
      ctx.beginPath()
      // Bottom border of HIGH SCORES title needs curving too
      for (let x = centerX - 60; x <= centerX + 60; x += 10) {
          const offset = getOffset(x)
          if (x === centerX - 60) ctx.moveTo(x, hsY + 12 + offset)
          else ctx.lineTo(x, hsY + 12 + offset)
      }
      ctx.stroke()

      for (let i = 0; i < Math.min(5, this.highScores.length); i++) {
        const isNew = this.highScores[i] === this.score && i === this.highScores.indexOf(this.score)
        const color = isNew ? COLORS.gold : COLORS.sepia
        renderText(ctx, `${i + 1}.  ${this.highScores[i]}`, centerX, hsY + 30 + i * 25 + getOffset(centerX),
          CANVAS_FONTS.laneRegular(18), color, 'center')
      }
    }

    // Restart prompt
    const breathe = Math.sin(Date.now() * 0.0025) * 0.3 + 0.7
    ctx.save()
    ctx.globalAlpha = breathe
    renderCurvedText(ctx, 'Press SPACE or ENTER to play again', centerX, GAME_HEIGHT - 60,
      CANVAS_FONTS.laneItalic(15), COLORS.sepia, getOffset, 'center')
    ctx.restore()

    // Return to Main Menu instruction
    renderCurvedText(ctx, 'Press ESC to return to Main Menu', centerX, GAME_HEIGHT - 25,
      CANVAS_FONTS.laneItalic(12), COLORS.muted, getOffset, 'center')
  }

  private renderCountdown(ctx: CanvasRenderingContext2D): void {
    // Backdrop - ivory with background lanes visible
    ctx.fillStyle = COLORS.ivory
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    this.renderBackground(ctx)
    for (const lane of this.lanes) {
      lane.render(ctx, -1, -100)
    }

    // Center ornament / vignette
    const gradient = ctx.createRadialGradient(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, 50,
      GAME_WIDTH / 2, GAME_HEIGHT / 2, 300
    )
    gradient.addColorStop(0, 'rgba(245, 241, 232, 0)')
    gradient.addColorStop(1, 'rgba(245, 241, 232, 0.4)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    // Countdown Text
    ctx.save()
    const centerX = GAME_WIDTH / 2
    const centerY = GAME_HEIGHT / 2
    const offset = getPageCurvatureOffset(centerX, GAME_WIDTH)
    ctx.translate(centerX, centerY + offset)
    
    // Smooth scaling / fading based on timer (1.0 -> 0.0)
    const scale = 0.5 + Math.pow(this.countdownTimer, 0.5) * 2.5
    const alpha = Math.min(1, this.countdownTimer * 2.5)

    ctx.scale(scale, scale)
    ctx.globalAlpha = alpha

    const text = this.countdownValue === 0 ? 'GO' : String(this.countdownValue)
    const font = this.countdownValue === 0 ? CANVAS_FONTS.uiSmallCaps(32) : CANVAS_FONTS.title(64)
    const color = this.countdownValue === 0 ? COLORS.gold : COLORS.espresso

    renderCurvedText(ctx, text, 0, 0, font, color, (x) => getPageCurvatureOffset(x, GAME_WIDTH), 'center')
    
    ctx.restore()
  }

  // ── DOM UI updates ──

  /** Hide/show only the text content inside the HUD (chapter, score, timer, progress bar)
   *  while keeping the HUD bar itself visible as layout chrome. */
  private setHudContentVisible(visible: boolean): void {
    const ids = ['hud-left', 'hud-center', 'hud-right', 'score-progress-bar']
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) el.style.visibility = visible ? 'visible' : 'hidden'
    }
  }

  private updateUI(): void {
    const scoreEl = document.getElementById('score-value')
    const levelEl = document.getElementById('level-value')
    const timerEl = document.getElementById('timer-value')
    const nextEl = document.getElementById('next-chapter-value')
    const progressFillEl = document.getElementById('score-progress-fill')

    const nextTarget = this.chapter * 75

    if (scoreEl) scoreEl.textContent = String(this.score)
    if (levelEl) levelEl.textContent = ROMAN_NUMERALS[Math.min(this.chapter - 1, 9)]
    if (nextEl) nextEl.textContent = String(nextTarget)
    
    if (progressFillEl) {
      const progress = Math.min(100, (this.score / nextTarget) * 100)
      progressFillEl.style.width = `${progress}%`
    }

    if (timerEl) {
      const mins = Math.floor(this.timeRemaining / 60)
      const secs = Math.floor(this.timeRemaining % 60)
      timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`
      timerEl.className = this.timeRemaining <= 15 ? 'urgent' : ''
    }
  }

  updateTrayUI(): void {
    const wordDisplay = document.getElementById('current-word')
    if (!wordDisplay) return

    wordDisplay.innerHTML = ''
    if (this.collectedLetters.length === 0) {
      wordDisplay.classList.add('empty')
    } else {
      wordDisplay.classList.remove('empty')
      for (const letter of this.collectedLetters) {
        const tile = document.createElement('div')
        tile.className = 'tray-tile'
        tile.innerHTML = `${letter.letter}<span class="tile-points">${letter.value}</span>`
        wordDisplay.appendChild(tile)
      }
    }
  }

  public updateWordsUI(): void {
    const wordsEl = document.getElementById('completed-words-list')
    if (!wordsEl) return

    const renderWords = (startIndex: number) => {
      wordsEl.innerHTML = ''
      
      const hiddenCount = startIndex
      if (hiddenCount > 0) {
        const moreIndicator = document.createElement('div')
        moreIndicator.className = 'more-words-indicator'
        moreIndicator.textContent = `+${hiddenCount} more`
        wordsEl.appendChild(moreIndicator)
      }
      
      for (let i = Math.max(0, startIndex); i < this.wordsFound.length; i++) {
        const word = this.wordsFound[i]
        const wordContainer = document.createElement('div')
        wordContainer.className = 'completed-word'
        
        for (let j = 0; j < word.length; j++) {
          const char = word[j].toUpperCase()
          const value = getLetterValue(char)
          const tile = document.createElement('div')
          tile.className = 'tray-tile'
          tile.innerHTML = `${char}<span class="tile-points">${value}</span>`
          wordContainer.appendChild(tile)
        }
        
        wordsEl.appendChild(wordContainer)
      }
    }

    let startIndex = 0
    renderWords(startIndex)

    while (wordsEl.scrollWidth > wordsEl.clientWidth && startIndex < this.wordsFound.length - 1) {
      startIndex++
      renderWords(startIndex)
    }
  }
}
