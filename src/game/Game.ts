// ── Game — Core game state machine ──

import { Player } from './Player'
import { Lane, type LaneConfig } from './Lane'
import { scoreWord, type ScoreResult, getLetterValue } from './Scoring'
import { generateLevel, type LevelConfig } from './Levels'
import { ParticleSystem } from '../effects/ParticleSystem'
import { GAME_WIDTH, GAME_HEIGHT, LANE_COUNT, LANE_HEIGHT, LANE_Y_START, COLORS, CANVAS_FONTS, ROMAN_NUMERALS, MAX_COLLECTED_LETTERS, TIME_BONUS } from '../utils/constants'
import { renderText, measureTextWidth } from '../text/TextEngine'

export type GameState = 'title' | 'playing' | 'gameover'

interface CollectedLetter {
  letter: string
  value: number
  selected: boolean
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

    // Button handlers
    document.getElementById('submit-word')?.addEventListener('click', () => this.submitWord())
    document.getElementById('clear-word')?.addEventListener('click', () => this.clearSelection())

    // Hide UI initially (title screen)
    this.toggleUI(false)
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
    this.state = 'playing'
    this.score = 0
    this.chapter = 1
    this.wordsFound = []
    this.collectedLetters = []
    this.feedback = null
    this.floatingScores = []
    this.player = new Player()
    this.loadLevel(1)
    this.toggleUI(true)
    this.updateUI()
    this.updateTrayUI()
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
    this.state = 'gameover'
    this.saveHighScore(this.score)
    this.toggleUI(false)
    this.updateUI()
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
      }
      return
    }

    if (this.state === 'playing') {
      switch (event.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault()
          this.player.moveUp()
          break
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault()
          this.player.moveDown()
          break
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault()
          this.player.moveLeft()
          break
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault()
          this.player.moveRight()
          break
        case 'Enter':
          e.preventDefault()
          this.submitWord()
          break
        case 'Backspace':
          e.preventDefault()
          this.clearSelection()
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
        selected: true,
        floatingX: this.player.x,
        floatingY: this.player.y,
        animProgress: 0,
      })
      this.collectCooldown = 0.15
      this.updateTrayUI()

      // Particle burst on collection
      this.particles.collectBurst(letter, this.player.x, this.player.y)

      // Trigger ripple wave on the lane
      lane.triggerRipple(this.player.x)
    }
  }

  submitWord(): void {
    if (this.state !== 'playing') return

    const selectedLetters = this.collectedLetters
      .filter(l => l.selected)
      .map(l => l.letter)

    if (selectedLetters.length === 0) {
      this.showFeedback('Select letters first', false)
      return
    }

    const result = scoreWord(selectedLetters)

    if (result.valid) {
      this.score += result.totalScore
      this.wordsFound.push(result.word)

      // Remove used letters
      this.collectedLetters = this.collectedLetters.filter(l => !l.selected)

      this.showFeedback(`${result.word}: +${result.totalScore}  ${result.message}`, true)

      // ✨ TYPOGRAPHIC EXPLOSION — the big payoff!
      const intensity = Math.min(2, 0.8 + result.totalScore / 50)
      this.particles.explodeWord(result.word, GAME_WIDTH / 2, GAME_HEIGHT / 2, intensity)

      // Score text rises as particles
      this.particles.waveText(`+${result.totalScore}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60)
    } else {
      this.showFeedback(result.message, false)
    }

    this.updateUI()
    this.updateTrayUI()
  }

  clearSelection(): void {
    // If some are selected, deselect all. If none selected, remove last letter.
    const hasSelection = this.collectedLetters.some(l => l.selected)
    if (hasSelection) {
      this.collectedLetters.forEach(l => l.selected = false)
    } else if (this.collectedLetters.length > 0) {
      this.collectedLetters.pop()
    }
    this.updateTrayUI()
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

    if (this.state !== 'playing') return

    // Timer
    this.timeRemaining -= dt
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

    // Check if player crossed
    if (this.player.hasReachedTop()) {
      this.timeRemaining = Math.min(this.timeRemaining + TIME_BONUS, this.level.timeLimit)
      this.score += 50  // crossing bonus
      this.showFeedback(`Crossed! +50 points, +${TIME_BONUS}s`, true)
      this.loadLevel(this.chapter + 1)
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
      ctx.fillText(fs.text, fs.x, fs.y)
      ctx.restore()
    }

    ctx.textAlign = 'left'

    // Top/bottom boundaries
    this.renderBoundaryDecoration(ctx)
  }

  private renderBackground(ctx: CanvasRenderingContext2D): void {
    // Subtle ruled lines
    ctx.strokeStyle = 'rgba(44, 24, 16, 0.03)'
    ctx.lineWidth = 0.5
    for (let y = LANE_Y_START; y < GAME_HEIGHT - 60; y += 28) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(GAME_WIDTH, y)
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
  }

  private renderBoundaryDecoration(ctx: CanvasRenderingContext2D): void {
    // Top decorative line
    ctx.strokeStyle = COLORS.rule
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(30, LANE_Y_START - 5)
    ctx.lineTo(GAME_WIDTH - 30, LANE_Y_START - 5)
    ctx.stroke()

    // Bottom decorative line
    const bottomY = LANE_Y_START + LANE_COUNT * LANE_HEIGHT + 5
    ctx.beginPath()
    ctx.moveTo(30, bottomY)
    ctx.lineTo(GAME_WIDTH - 30, bottomY)
    ctx.stroke()

    // "GOAL" label at top
    renderText(ctx, '— GOAL —', GAME_WIDTH / 2, LANE_Y_START - 18,
      CANVAS_FONTS.uiSmallCaps(10), COLORS.muted, 'center')

    // Start label at bottom
    renderText(ctx, '— START —', GAME_WIDTH / 2, bottomY + 16,
      CANVAS_FONTS.uiSmallCaps(10), COLORS.muted, 'center')
  }

  private renderTitle(ctx: CanvasRenderingContext2D): void {
    // Animated background — flowing text streams
    ctx.fillStyle = COLORS.ivory
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    // Decorative background text (faint passage)
    ctx.save()
    ctx.globalAlpha = 0.06
    ctx.font = CANVAS_FONTS.laneItalic(42)
    ctx.fillStyle = COLORS.espresso

    const text = 'It is a truth universally acknowledged that a single man in possession of a good fortune must be in want of a wife '
    const offset = (this.titleTime * 20) % 1200
    for (let y = 60; y < GAME_HEIGHT; y += 55) {
      const dir = y % 110 === 60 ? 1 : -1
      ctx.fillText(text, -offset * dir + (dir > 0 ? -600 : 0), y)
    }
    ctx.restore()

    // Vignette overlay
    const gradient = ctx.createRadialGradient(
      GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, 80,
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 0.6,
    )
    gradient.addColorStop(0, 'rgba(245, 241, 232, 0.95)')
    gradient.addColorStop(1, 'rgba(245, 241, 232, 0.7)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    // Title
    const titleY = GAME_HEIGHT * 0.32
    renderText(ctx, 'Lexicon Crossing', GAME_WIDTH / 2, titleY,
      CANVAS_FONTS.title(52), COLORS.espresso, 'center')

    // Subtitle
    renderText(ctx, 'A   TYPOGRAPHIC   FROGGER', GAME_WIDTH / 2, titleY + 48,
      CANVAS_FONTS.uiSmallCaps(12), COLORS.muted, 'center')

    // Ornament
    renderText(ctx, '❧  ✦  ❧', GAME_WIDTH / 2, titleY + 85,
      CANVAS_FONTS.laneRegular(16), COLORS.gold, 'center')

    // Instructions
    const instrY = titleY + 130
    const instrFont = CANVAS_FONTS.laneItalic(15)
    const lines = [
      'Navigate through streams of flowing prose.',
      'Collect highlighted letters to spell words.',
      'Cross to the other side before time expires.',
      '',
      '↑ ↓ ← →  or  W A S D  to move',
      'SPACE  to collect  ·  ENTER  to submit word',
    ]

    for (let i = 0; i < lines.length; i++) {
      const color = i >= 4 ? COLORS.muted : COLORS.sepia
      const font = i >= 4 ? CANVAS_FONTS.uiSmallCaps(12) : instrFont
      renderText(ctx, lines[i], GAME_WIDTH / 2, instrY + i * 26, font, color, 'center')
    }

    // Prompt
    const breathe = Math.sin(this.titleTime * 2.5) * 0.3 + 0.7
    ctx.globalAlpha = breathe
    renderText(ctx, 'Press SPACE or ENTER to begin', GAME_WIDTH / 2, GAME_HEIGHT - 80,
      CANVAS_FONTS.laneItalic(16), COLORS.sepia, 'center')
    ctx.globalAlpha = 1

    // Pretext credit
    renderText(ctx, 'Powered by Pretext — chenglou/pretext', GAME_WIDTH / 2, GAME_HEIGHT - 30,
      CANVAS_FONTS.uiSmallCaps(10), COLORS.muted, 'center')
  }

  private renderGameOver(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = COLORS.ivory
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    const centerY = GAME_HEIGHT * 0.25

    // Ornament
    renderText(ctx, '✦', GAME_WIDTH / 2, centerY - 30,
      CANVAS_FONTS.laneRegular(20), COLORS.gold, 'center')

    renderText(ctx, 'Finis', GAME_WIDTH / 2, centerY,
      CANVAS_FONTS.title(48), COLORS.espresso, 'center')

    renderText(ctx, `Chapter ${ROMAN_NUMERALS[Math.min(this.chapter - 1, 9)]} reached`, GAME_WIDTH / 2, centerY + 45,
      CANVAS_FONTS.laneItalic(16), COLORS.sepia, 'center')

    // Final score
    renderText(ctx, String(this.score), GAME_WIDTH / 2, centerY + 100,
      CANVAS_FONTS.laneLight(56), COLORS.gold, 'center')

    renderText(ctx, 'POINTS', GAME_WIDTH / 2, centerY + 130,
      CANVAS_FONTS.uiSmallCaps(10), COLORS.muted, 'center')

    // Words found
    if (this.wordsFound.length > 0) {
      renderText(ctx, `${this.wordsFound.length} word${this.wordsFound.length !== 1 ? 's' : ''} composed`, GAME_WIDTH / 2, centerY + 165,
        CANVAS_FONTS.laneItalic(14), COLORS.sepia, 'center')

      // Show words in a flowing line
      const wordStr = this.wordsFound.slice(-8).join('  ·  ')
      renderText(ctx, wordStr, GAME_WIDTH / 2, centerY + 190,
        CANVAS_FONTS.laneItalic(13), COLORS.muted, 'center')
    }

    // High scores
    if (this.highScores.length > 0) {
      const hsY = centerY + 240
      renderText(ctx, 'HIGH SCORES', GAME_WIDTH / 2, hsY,
        CANVAS_FONTS.uiSmallCaps(10), COLORS.muted, 'center')

      ctx.strokeStyle = COLORS.rule
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(GAME_WIDTH / 2 - 60, hsY + 12)
      ctx.lineTo(GAME_WIDTH / 2 + 60, hsY + 12)
      ctx.stroke()

      for (let i = 0; i < Math.min(5, this.highScores.length); i++) {
        const isNew = this.highScores[i] === this.score && i === this.highScores.indexOf(this.score)
        const color = isNew ? COLORS.gold : COLORS.sepia
        renderText(ctx, `${i + 1}.  ${this.highScores[i]}`, GAME_WIDTH / 2, hsY + 30 + i * 25,
          CANVAS_FONTS.laneRegular(18), color, 'center')
      }
    }

    // Restart prompt
    const breathe = Math.sin(Date.now() * 0.0025) * 0.3 + 0.7
    ctx.globalAlpha = breathe
    renderText(ctx, 'Press SPACE or ENTER to play again', GAME_WIDTH / 2, GAME_HEIGHT - 60,
      CANVAS_FONTS.laneItalic(15), COLORS.sepia, 'center')
    ctx.globalAlpha = 1
  }

  // ── DOM UI updates ──

  private toggleUI(visible: boolean): void {
    const hud = document.getElementById('hud')
    const tray = document.getElementById('word-tray')
    if (hud) hud.style.display = visible ? 'flex' : 'none'
    if (tray) tray.style.display = visible ? 'flex' : 'none'
  }

  private updateUI(): void {
    const scoreEl = document.getElementById('score-value')
    const levelEl = document.getElementById('level-value')
    const timerEl = document.getElementById('timer-value')

    if (scoreEl) scoreEl.textContent = String(this.score)
    if (levelEl) levelEl.textContent = ROMAN_NUMERALS[Math.min(this.chapter - 1, 9)]

    if (timerEl) {
      const mins = Math.floor(this.timeRemaining / 60)
      const secs = Math.floor(this.timeRemaining % 60)
      timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`
      timerEl.className = this.timeRemaining <= 15 ? 'urgent' : ''
    }
  }

  updateTrayUI(): void {
    const trayEl = document.getElementById('tray-letters')
    if (!trayEl) return

    trayEl.innerHTML = ''
    for (let i = 0; i < this.collectedLetters.length; i++) {
      const letter = this.collectedLetters[i]
      const tile = document.createElement('div')
      tile.className = `tray-tile${letter.selected ? ' selected' : ''}`
      tile.innerHTML = `${letter.letter}<span class="tile-points">${letter.value}</span>`
      tile.addEventListener('click', () => {
        letter.selected = !letter.selected
        this.updateTrayUI()
      })
      trayEl.appendChild(tile)
    }
  }
}
