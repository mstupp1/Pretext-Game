// ── Game — Core game state machine ──

import { Player } from './Player'
import { audioManager } from '../audio/AudioManager'
import { Lane, type LaneConfig } from './Lane'
import { scoreWord, type ScoreResult, getLetterValue, type ScoredLetter, type ScorePreview, getScorePreview } from './Scoring'
import { generateLevel, getLevelAmbiencePlaybackRate, type LevelConfig } from './Levels'
import { ParticleSystem } from '../effects/ParticleSystem'
import { GAME_WIDTH, GAME_HEIGHT, LANE_COUNT, LANE_HEIGHT, LANE_Y_START, COLORS, CANVAS_FONTS, REGULAR_TILE_STYLE, ROMAN_NUMERALS, MAX_COLLECTED_LETTERS, TIME_BONUS, STARTING_TIME } from '../utils/constants'
import { renderText, measureTextWidth, renderCurvedText, measureCharsInLine } from '../text/TextEngine'
import { getPageCurvatureOffset } from '../text/TextStream'

import { MultiplierType } from '../utils/constants'

export type GameState = 'title' | 'countdown' | 'playing' | 'paused' | 'gameover'

interface CollectedLetter {
  letter: string
  value: number
  multiplierType: MultiplierType
  // Animation
  floatingX: number
  floatingY: number
  animProgress: number
}

interface RemovedTrayLetter {
  letter: CollectedLetter
  x: number
  y: number
  progress: number
}

interface FeedbackMessage {
  text: string
  success: boolean
  timer: number
  duration: number
}

interface FloatingScore {
  x: number
  y: number
  text: string
  alpha: number
  dy: number
}

type PauseConfirmAction = 'restart' | 'quit' | null

interface HudElements {
  bookStats: HTMLElement | null
  multiplierLegend: HTMLElement | null
  scoreValue: HTMLElement | null
  levelValue: HTMLElement | null
  timerValue: HTMLElement | null
  nextChapterValue: HTMLElement | null
  scoreProgressFill: HTMLElement | null
  completedWordsContainer: HTMLElement | null
  completedWordsList: HTMLElement | null
}

interface RenderAssets {
  backgroundRulePaths: Path2D[]
  boundaryTopPath: Path2D
  boundaryBottomPath: Path2D
  vignetteGradient: CanvasGradient
  spineGradient: CanvasGradient
  edgeGradientLeft: CanvasGradient
  edgeGradientRight: CanvasGradient
  edgeGradientBottom: CanvasGradient
}

interface GameOverLedgerEntry {
  letters: ScoredLetter[]
  score: number
}

interface GameOverLedgerPlacement {
  entry: GameOverLedgerEntry
  x: number
  y: number
  width: number
}

export class Game {
  private static readonly TITLE_INTRO_DURATION = 0.85
  private static readonly FINAL_CHAPTER = ROMAN_NUMERALS.length
  private static readonly EPILOGUE_CHAPTER = Game.FINAL_CHAPTER + 1
  private static readonly TOP_PANEL_INSET = 38
  private static readonly TOP_PANEL_Y = 24
  private static readonly TRAY_BOTTOM_OFFSET = 26
  private static readonly TRAY_PREVIEW_HEIGHT = 24
  private static readonly TRAY_PREVIEW_GAP = 10
  private static readonly TITLE_FOOTER_LIFT = 18
  private static readonly GAME_OVER_FOOTER_LIFT = 24
  private static readonly TITLE_PROMPT_DROP = 8
  private static readonly GAME_OVER_HIGH_SCORES_LIFT = 16

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
  public timeRemaining: number = STARTING_TIME
  public collectedLetters: CollectedLetter[] = []
  public removedTrayLetters: RemovedTrayLetter[] = []
  public wordsFound: ScoredLetter[][] = []
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
  private titleIntroTime: number = 0
  private hasPlayedTitleIntro: boolean = false

  // Manage collecting cooldown
  private collectCooldown: number = 0
  private isSubmitting: boolean = false
  private pauseOptionIndex: number = 0
  private pauseConfirmAction: PauseConfirmAction = null
  private pauseConfirmIndex: number = 0
  private hud: HudElements
  private renderAssets: RenderAssets
  private trayTexture: HTMLImageElement | null
  private lastHudScore: string | null = null
  private lastHudLevel: string | null = null
  private lastHudTimer: string | null = null
  private lastHudNextTarget: string | null = null
  private lastHudProgressWidth: string | null = null
  private lastHudTimerUrgent: boolean | null = null
  private hudContentVisible: boolean | null = null
  private completedWordsVisible: boolean | null = null
  private gameOverWordPage: number = 0

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
    this.hud = this.getHudElements()
    this.renderAssets = this.createRenderAssets()
    this.trayTexture = this.loadTrayTexture()
    this.loadHighScores()

    // Input handlers
    window.addEventListener('keydown', (e) => this.onKeyDown(e))
    window.addEventListener('keyup', (e) => this.onKeyUp(e))

    // Show UI bars on all screens (they stay visible as layout chrome)
    this.setHudContentVisible(false)
    this.updateUI()
    this.updateWordsUI()

    this.setupPauseMenu()

    audioManager.playTitleMusic()
  }

  private setupPauseMenu(): void {
    const resumeOpt = document.getElementById('option-resume')
    const restartOpt = document.getElementById('option-restart')
    const quitOpt = document.getElementById('option-quit')
    const musicOpt = document.getElementById('option-music')
    const sfxOpt = document.getElementById('option-sfx')
    const debugPointsOpt = document.getElementById('option-debug-points')
    const confirmNoOpt = document.getElementById('pause-confirm-no')
    const confirmYesOpt = document.getElementById('pause-confirm-yes')

    if (resumeOpt) {
      resumeOpt.addEventListener('click', () => {
        audioManager.playMenuNav()
        this.resumeFromPause()
      })
      resumeOpt.addEventListener('mouseenter', () => this.selectPauseOption('option-resume'))
    }

    if (restartOpt) {
      restartOpt.addEventListener('click', () => {
        audioManager.playMenuNav()
        this.openPauseConfirmation('restart')
      })
      restartOpt.addEventListener('mouseenter', () => this.selectPauseOption('option-restart'))
    }

    if (quitOpt) {
      quitOpt.addEventListener('click', () => {
        audioManager.playMenuNav()
        this.openPauseConfirmation('quit')
      })
      quitOpt.addEventListener('mouseenter', () => this.selectPauseOption('option-quit'))
    }

    if (musicOpt) {
      musicOpt.addEventListener('click', () => {
        const isMuted = audioManager.toggleMusic()
        audioManager.playMenuNav()
        this.setPauseToggleStatus(musicOpt, isMuted)
      })
      musicOpt.addEventListener('mouseenter', () => this.selectPauseOption('option-music'))
    }

    if (sfxOpt) {
      sfxOpt.addEventListener('click', () => {
        const isMuted = audioManager.toggleSfx()
        audioManager.playMenuNav()
        this.setPauseToggleStatus(sfxOpt, isMuted)
      })
      sfxOpt.addEventListener('mouseenter', () => this.selectPauseOption('option-sfx'))
    }

    if (debugPointsOpt) {
      debugPointsOpt.addEventListener('click', () => {
        audioManager.playMenuNav()
        const nextTarget = this.getRequiredScore()
        if (nextTarget === null) return
        const pointsNeeded = nextTarget - this.score
        if (pointsNeeded > 0) {
          this.score += pointsNeeded
          this.checkChapterProgression()
        }
      })
      debugPointsOpt.addEventListener('mouseenter', () => this.selectPauseOption('option-debug-points'))
    }

    if (confirmNoOpt) {
      confirmNoOpt.addEventListener('click', () => {
        audioManager.playMenuNav()
        this.closePauseConfirmation()
      })
      confirmNoOpt.addEventListener('mouseenter', () => this.selectPauseConfirmOption(0))
    }

    if (confirmYesOpt) {
      confirmYesOpt.addEventListener('click', () => {
        audioManager.playMenuNav()
        this.confirmPauseAction()
      })
      confirmYesOpt.addEventListener('mouseenter', () => this.selectPauseConfirmOption(1))
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
    audioManager.fadeOutTitleMusic()
    this.hidePauseOverlay()
    this.state = 'countdown'
    this.countdownValue = 3
    this.countdownTimer = 1.0 // 1 second per number
    audioManager.playCountdown(3)
    this.collectCooldown = 0
    this.isSubmitting = false
    this.pauseOptionIndex = 0
    this.pauseConfirmAction = null
    this.pauseConfirmIndex = 0
    this.score = 0
    this.chapter = 1
    this.wordsFound = []
    this.usedWords = new Set()
    this.collectedLetters = []
    this.removedTrayLetters = []
    this.feedback = null
    this.floatingScores = []
    this.particles.clear()
    this.gameOverWordPage = 0
    this.player = new Player()
    this.loadLevel(1)
    audioManager.playGameAmbience()

    this.setHudContentVisible(true)
    this.updateUI()
    this.updateWordsUI()

    const gameoverOverlay = document.getElementById('gameover-overlay')
    if (gameoverOverlay) gameoverOverlay.style.display = 'none'
  }

  private beginPlaying(): void {
    audioManager.playGameMusic()
    this.state = 'playing'
    this.updateUI()
    this.updateWordsUI()
  }

  private getChapterLabel(chapter: number = this.chapter): string {
    if (chapter >= Game.EPILOGUE_CHAPTER) return 'Epilogue'
    return ROMAN_NUMERALS[Math.min(chapter - 1, Game.FINAL_CHAPTER - 1)]
  }

  private getChapterTitle(chapter: number = this.chapter): string {
    if (chapter >= Game.EPILOGUE_CHAPTER) return 'Epilogue'
    return `Chapter ${this.getChapterLabel(chapter)}`
  }

  private getRequiredScore(chapter: number = this.chapter): number | null {
    if (chapter >= Game.EPILOGUE_CHAPTER) return null
    return 25 * chapter * (chapter + 3)
  }

  private loadLevel(chapter: number): void {
    this.chapter = chapter
    this.level = generateLevel(chapter)
    this.timeRemaining = chapter === 1 ? STARTING_TIME : this.level.timeLimit
    this.player.reset()
    this.buildLanes()
    audioManager.setGameAmbiencePlaybackRate(getLevelAmbiencePlaybackRate(this.level))
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
    audioManager.restartTitleMusic()
    this.state = 'gameover'
    this.gameOverWordPage = 0
    this.saveHighScore(this.score)
    this.setHudContentVisible(false)
    this.updateUI()
    this.updateWordsUI()

    const gameoverOverlay = document.getElementById('gameover-overlay')
    if (gameoverOverlay) gameoverOverlay.style.display = 'flex'
  }

  private returnToTitle(): void {
    this.hidePauseOverlay()
    const previousState = this.state
    this.state = 'title'
    this.titleTime = 0
    this.titleIntroTime = 0
    this.pauseOptionIndex = 0
    this.pauseConfirmAction = null
    this.pauseConfirmIndex = 0
    this.collectCooldown = 0
    this.isSubmitting = false
    this.collectedLetters = []
    this.removedTrayLetters = []
    this.wordsFound = []
    this.usedWords = new Set()
    this.feedback = null
    this.floatingScores = []
    this.particles.clear()
    this.gameOverWordPage = 0
    if (previousState === 'gameover') {
      audioManager.playTitleMusic()
    } else {
      audioManager.restartTitleMusic()
    }
    this.setHudContentVisible(false)
    this.updateUI()
    this.updateWordsUI()

    const gameoverOverlay = document.getElementById('gameover-overlay')
    if (gameoverOverlay) gameoverOverlay.style.display = 'none'
  }

  private togglePause(): void {
    if (this.state === 'playing') {
      audioManager.playPause()
      audioManager.pauseGameAmbience()
      this.state = 'paused'
      this.pauseOptionIndex = 0
      this.pauseConfirmAction = null
      this.pauseConfirmIndex = 0
      this.refreshPauseMenu()
      this.showPauseOverlay()
    } else if (this.state === 'paused') {
      this.resumeFromPause()
    }
  }

  private updatePauseMenuHighlight(): void {
    if (this.pauseConfirmAction !== null) return

    this.getPauseOptions().forEach((option, index) => {
      option.classList.toggle('is-selected', this.pauseOptionIndex === index)
    })
  }

  private getPauseOptions(): HTMLElement[] {
    const optionIds = [
      'option-resume',
      'option-restart',
      'option-quit',
      'option-music',
      'option-sfx',
      'option-debug-points',
    ]

    return optionIds
      .map((id) => document.getElementById(id))
      .filter((option): option is HTMLElement => option !== null)
  }

  private selectPauseOption(optionId: string): void {
    const options = this.getPauseOptions()
    const nextIndex = options.findIndex((option) => option.id === optionId)
    if (nextIndex === -1) return

    if (this.pauseOptionIndex !== nextIndex) {
      audioManager.playMenuNav()
    }

    this.pauseOptionIndex = nextIndex
    this.updatePauseMenuHighlight()
  }

  private activatePauseOption(): void {
    const option = this.getPauseOptions()[this.pauseOptionIndex]
    option?.click()
  }

  private getPauseConfirmOptions(): HTMLElement[] {
    const optionIds = ['pause-confirm-no', 'pause-confirm-yes']

    return optionIds
      .map((id) => document.getElementById(id))
      .filter((option): option is HTMLElement => option !== null)
  }

  private updatePauseConfirmHighlight(): void {
    this.getPauseConfirmOptions().forEach((option, index) => {
      option.classList.toggle('is-selected', this.pauseConfirmIndex === index)
    })
  }

  private selectPauseConfirmOption(index: number): void {
    const options = this.getPauseConfirmOptions()
    if (index < 0 || index >= options.length) return

    if (this.pauseConfirmIndex !== index) {
      audioManager.playMenuNav()
    }

    this.pauseConfirmIndex = index
    this.updatePauseConfirmHighlight()
  }

  private openPauseConfirmation(action: Exclude<PauseConfirmAction, null>): void {
    this.pauseConfirmAction = action
    this.pauseConfirmIndex = 0

    const confirmOverlay = document.getElementById('pause-confirm')
    const confirmTitle = document.getElementById('pause-confirm-title')
    const confirmMessage = document.getElementById('pause-confirm-message')
    const confirmYes = document.getElementById('pause-confirm-yes')

    if (confirmTitle) confirmTitle.textContent = 'Are you sure?'

    if (confirmMessage) {
      confirmMessage.textContent = action === 'restart'
        ? 'Restart the current run? Your collected letters and score will be lost.'
        : 'Quit to the title screen? Your current run will be lost.'
    }

    if (confirmYes) {
      confirmYes.textContent = action === 'restart' ? 'Yes, Restart' : 'Yes, Quit'
    }

    if (confirmOverlay) confirmOverlay.style.display = 'flex'
    this.updatePauseConfirmHighlight()
  }

  private closePauseConfirmation(): void {
    this.pauseConfirmAction = null
    this.pauseConfirmIndex = 0

    const confirmOverlay = document.getElementById('pause-confirm')
    if (confirmOverlay) confirmOverlay.style.display = 'none'

    this.getPauseConfirmOptions().forEach((option) => option.classList.remove('is-selected'))
    this.updatePauseMenuHighlight()
  }

  private confirmPauseAction(): void {
    const action = this.pauseConfirmAction
    this.closePauseConfirmation()

    if (action === 'restart') {
      audioManager.playRestart()
      this.startGame()
    } else if (action === 'quit') {
      this.returnToTitle()
    }
  }

  private activatePauseConfirmOption(): void {
    const option = this.getPauseConfirmOptions()[this.pauseConfirmIndex]
    option?.click()
  }

  private setPauseToggleStatus(option: HTMLElement, isMuted: boolean): void {
    const toggleLabel = option.querySelector('.toggle-label')
    if (toggleLabel) toggleLabel.textContent = isMuted ? 'Off' : 'On'

    option.classList.toggle('is-toggle-off', isMuted)
    option.setAttribute('aria-pressed', String(!isMuted))
  }

  private refreshPauseMenu(): void {
    const pauseChapter = document.getElementById('pause-chapter')
    if (pauseChapter) {
      pauseChapter.textContent = this.getChapterTitle()
    }

    const musicOpt = document.getElementById('option-music')
    const sfxOpt = document.getElementById('option-sfx')
    if (musicOpt) this.setPauseToggleStatus(musicOpt, audioManager.getMusicMuted())
    if (sfxOpt) this.setPauseToggleStatus(sfxOpt, audioManager.getSfxMuted())

    this.updatePauseMenuHighlight()
    this.updatePauseConfirmHighlight()
  }

  private showPauseOverlay(): void {
    const pauseOverlay = document.getElementById('pause-overlay')
    if (pauseOverlay) pauseOverlay.style.display = 'flex'
  }

  private hidePauseOverlay(): void {
    const pauseOverlay = document.getElementById('pause-overlay')
    if (pauseOverlay) pauseOverlay.style.display = 'none'
    this.closePauseConfirmation()
  }

  private resumeFromPause(): void {
    this.state = 'playing'
    this.hidePauseOverlay()
    audioManager.resumeGameAmbience()
  }

  // ── Input handling ──

  private onKeyDown(e: Event): void {
    const event = e as KeyboardEvent
    if (event.repeat) return

    this.keys.add(event.key)

    if (this.state === 'title') {
      if (event.key === 'Enter') {
        e.preventDefault()
        this.startGame()
      }
      return
    }

    if (this.state === 'gameover') {
      if (
        event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A'
      ) {
        e.preventDefault()
        this.changeGameOverWordPage(-1)
      } else if (
        event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D'
      ) {
        e.preventDefault()
        this.changeGameOverWordPage(1)
      } else if (event.key === 'Enter') {
        e.preventDefault()
        this.startGame()
      } else if (event.key === 'Escape') {
        e.preventDefault()
        this.returnToTitle()
      }
      return
    }

    if (this.state === 'paused') {
      if (this.pauseConfirmAction !== null) {
        if (event.key === 'Escape') {
          e.preventDefault()
          audioManager.playMenuNav()
          this.closePauseConfirmation()
        } else if (
          event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A' ||
          event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W'
        ) {
          e.preventDefault()
          const optionCount = this.getPauseConfirmOptions().length
          if (optionCount === 0) return
          this.pauseConfirmIndex = (this.pauseConfirmIndex - 1 + optionCount) % optionCount
          audioManager.playMenuNav()
          this.updatePauseConfirmHighlight()
        } else if (
          event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D' ||
          event.key === 'ArrowDown' || event.key === 's' || event.key === 'S'
        ) {
          e.preventDefault()
          const optionCount = this.getPauseConfirmOptions().length
          if (optionCount === 0) return
          this.pauseConfirmIndex = (this.pauseConfirmIndex + 1) % optionCount
          audioManager.playMenuNav()
          this.updatePauseConfirmHighlight()
        } else if (event.key === 'Enter' || event.key === ' ') {
          e.preventDefault()
          this.activatePauseConfirmOption()
        }
        return
      }

      if (event.key === 'Escape') {
        e.preventDefault()
        this.togglePause()
      } else if (event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') {
        e.preventDefault()
        const optionCount = this.getPauseOptions().length
        if (optionCount === 0) return
        this.pauseOptionIndex = (this.pauseOptionIndex - 1 + optionCount) % optionCount
        audioManager.playMenuNav()
        this.updatePauseMenuHighlight()
      } else if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'S') {
        e.preventDefault()
        const optionCount = this.getPauseOptions().length
        if (optionCount === 0) return
        this.pauseOptionIndex = (this.pauseOptionIndex + 1) % optionCount
        audioManager.playMenuNav()
        this.updatePauseMenuHighlight()
      } else if (event.key === 'Enter' || event.key === ' ') {
        e.preventDefault()
        this.activatePauseOption()
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
        multiplierType: collected.multiplierType,
        floatingX: this.player.x,
        floatingY: this.player.y,
        animProgress: 0,
      })
      this.collectCooldown = 0.15
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

    const allLetters = this.collectedLetters.map(l => ({ letter: l.letter, multiplierType: l.multiplierType }))

    if (allLetters.length === 0) {
      this.showFeedback('Collect letters first', false)
      audioManager.playNoSubmit()
      return
    }

    // Check for duplicate word in this chapter
    const candidateWord = allLetters.map(l => l.letter).join('').toUpperCase()
    if (this.usedWords.has(candidateWord)) {
      this.showFeedback(`"${candidateWord}" already used this run`, false)
      audioManager.playNoSubmit()
      return
    }

    this.isSubmitting = true
    this.showFeedback('Checking lexicon...', true)

    // Set a very long timer for the check so it doesn't disappear in the middle of a slow API call
    if (this.feedback) {
      this.feedback.timer = 10
      this.feedback.duration = 10
    }

    const result = await scoreWord(allLetters)

    this.isSubmitting = false

    if (result.valid) {
      audioManager.playScore(result.totalScore)
      this.score += result.totalScore
      this.wordsFound.push(allLetters)
      this.usedWords.add(result.word)

      const timeBonus = getScorePreview(allLetters).timeBonus

      this.timeRemaining += timeBonus

      // Clear all letters after successful submit
      this.collectedLetters = []
      this.removedTrayLetters = []

      const timeMsg = timeBonus > 0 ? ` (+${timeBonus}s)` : ''
      this.showFeedback(`${result.word}: +${result.totalScore}${timeMsg}  ${result.message}`, true)

      // ✨ TYPOGRAPHIC EXPLOSION — the big payoff!
      const intensity = Math.min(2, 0.8 + result.totalScore / 50)
      this.particles.explodeWord(result.word, GAME_WIDTH / 2, GAME_HEIGHT / 2, intensity)

      // Score text rises as particles
      this.particles.waveText(`+${result.totalScore}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60)
      if (timeBonus > 0) {
        this.particles.waveText(`+${timeBonus}s`, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40)
      }

      this.updateWordsUI()
    } else {
      audioManager.playNoSubmit()
      this.showFeedback(result.message, false)
    }

    this.updateUI()
  }

  removeLastLetter(): void {
    if (this.collectedLetters.length > 0) {
      const removedIndex = this.collectedLetters.length - 1
      const removed = this.collectedLetters.pop()
      if (removed) {
        const position = this.getTrayTileCenter(removedIndex, removedIndex + 1)
        const settled = this.titleEaseOut(removed.animProgress)
        const startY = removed.floatingY + getPageCurvatureOffset(removed.floatingX, GAME_WIDTH)
        this.removedTrayLetters.push({
          letter: removed,
          x: removed.floatingX + (position.x - removed.floatingX) * settled,
          y: startY + (position.y - startY) * settled,
          progress: 0,
        })
      }
      audioManager.playBackspace()
    }
  }

  private showFeedback(text: string, success: boolean): void {
    this.feedback = { text, success, timer: 2.5, duration: 2.5 }
  }

  // ── Update loop ──

  public checkChapterProgression(): void {
    const previousChapter = this.chapter
    let nextChapter = this.chapter
    let bonusTime = 0
    let nextRequiredScore = this.getRequiredScore(nextChapter)

    while (nextRequiredScore !== null && this.score >= nextRequiredScore) {
      nextChapter++
      bonusTime += generateLevel(nextChapter).timeLimit
      nextRequiredScore = this.getRequiredScore(nextChapter)
    }

    if (nextChapter > previousChapter) {
      this.chapter = nextChapter
      audioManager.playChapterUnlock()
      this.level = generateLevel(this.chapter)
      this.timeRemaining += bonusTime // Add each unlocked chapter's allotment to current time

      // Update existing lanes with new configs rather than replacing them
      for (let i = 0; i < LANE_COUNT; i++) {
        if (this.lanes[i]) {
          this.lanes[i].updateConfig(this.level.laneConfigs[i])
        }
      }

      audioManager.setGameAmbiencePlaybackRate(getLevelAmbiencePlaybackRate(this.level))

      // Only show the furthest unlocked chapter banner.
      this.particles.waveText(this.getChapterTitle(), GAME_WIDTH / 2, 104)
      this.updateUI()

      const pauseChapter = document.getElementById('pause-chapter')
      if (pauseChapter) pauseChapter.textContent = this.getChapterTitle()
    }
  }

  update(dt: number): void {
    this.syncHudVisibility()

    if (this.state === 'title') {
      if (!this.hasPlayedTitleIntro) {
        this.titleIntroTime = Math.min(Game.TITLE_INTRO_DURATION, this.titleIntroTime + dt)
        if (this.titleIntroTime >= Game.TITLE_INTRO_DURATION) {
          this.hasPlayedTitleIntro = true
        }
        return
      }
      this.titleTime += dt
      return
    }

    if (this.state === 'countdown') {
      this.countdownTimer -= dt
      if (this.countdownTimer <= 0) {
        this.countdownValue--
        this.countdownTimer = 1.0
        if (this.countdownValue >= 0) {
          audioManager.playCountdown(this.countdownValue as 2 | 1 | 0)
        }
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

    this.checkChapterProgression()

    // Collected letter animations
    for (const letter of this.collectedLetters) {
      letter.animProgress = Math.min(1, letter.animProgress + dt * 4)
    }
    this.removedTrayLetters = this.removedTrayLetters.filter((letter) => {
      letter.progress = Math.min(1, letter.progress + dt * 4.5)
      return letter.progress < 1
    })

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
      }
    }

    this.updateUI()
  }

  // ── Render ──

  render(): void {
    this.syncHudVisibility()

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
      this.renderCanvasTray(ctx)
      return
    }

    if (this.state === 'gameover') {
      this.renderGameOver(ctx)
      return
    }

    // Draw subtle paper texture
    this.renderBackground(ctx)
    this.renderBookTopPanels(ctx)

    // Render lane backgrounds and ordinary text first.
    for (const lane of this.lanes) {
      lane.renderBase(ctx, this.player.laneIndex, this.player.x)
    }

    // Render highlighted/focused lane tiles globally on top of every lane.
    for (const lane of this.lanes) {
      lane.renderTopLayer(ctx)
    }
    for (const lane of this.lanes) {
      lane.renderFocusedTopLayer(ctx)
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
    this.renderCanvasTray(ctx)
  }

  private renderBackground(ctx: CanvasRenderingContext2D): void {
    // Ruled lines across the entire page
    ctx.strokeStyle = 'rgba(44, 24, 16, 0.04)'
    ctx.lineWidth = 0.5
    for (const path of this.renderAssets.backgroundRulePaths) {
      ctx.stroke(path)
    }

    // Vignette
    ctx.fillStyle = this.renderAssets.vignetteGradient
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    
    // Book spine crease (center)
    ctx.fillStyle = this.renderAssets.spineGradient
    ctx.fillRect(GAME_WIDTH / 2 - 40, 0, 80, GAME_HEIGHT)

    // Book page edges (left and right shadows)
    ctx.fillStyle = this.renderAssets.edgeGradientLeft
    ctx.fillRect(0, 0, 30, GAME_HEIGHT)

    ctx.fillStyle = this.renderAssets.edgeGradientRight
    ctx.fillRect(GAME_WIDTH - 30, 0, 30, GAME_HEIGHT)

    ctx.fillStyle = this.renderAssets.edgeGradientBottom
    ctx.fillRect(0, GAME_HEIGHT - 78, GAME_WIDTH, 78)
  }

  private renderBoundaryDecoration(ctx: CanvasRenderingContext2D): void {
    // Top decorative line
    ctx.strokeStyle = COLORS.rule
    ctx.lineWidth = 1
    ctx.stroke(this.renderAssets.boundaryTopPath)

    // Bottom decorative line
    ctx.stroke(this.renderAssets.boundaryBottomPath)
  }

  private renderCanvasTray(ctx: CanvasRenderingContext2D): void {
    const {
      tileWidth,
      tileHeight,
      tileGap,
      trayHeight,
      trayY,
      innerWidth,
      trayWidth,
      trayX,
      innerX,
      innerY,
      innerHeight,
      lipHeight,
    } = this.getTrayMetrics()
    const trayPath = this.createRoundedRectPath(trayX, trayY, trayWidth, trayHeight, 14)
    const innerPath = this.createRoundedRectPath(innerX, innerY, innerWidth, innerHeight, 10)
    const lipPath = this.createRoundedRectPath(innerX + 18, innerY + innerHeight - lipHeight - 4, innerWidth - 36, lipHeight, 8)
    const selectedPreview = this.collectedLetters.length > 0
      ? getScorePreview(this.collectedLetters.map(({ letter, multiplierType }) => ({ letter, multiplierType })))
      : null

    ctx.save()
    if (this.state === 'countdown') {
      ctx.globalAlpha = 0.38
    }

    ctx.save()
    ctx.shadowColor = 'rgba(52, 34, 22, 0.2)'
    ctx.shadowBlur = 18
    ctx.shadowOffsetY = 8
    ctx.fillStyle = 'rgba(92, 64, 51, 0.08)'
    ctx.fill(trayPath)
    ctx.restore()

    const trayGradient = ctx.createLinearGradient(trayX, trayY, trayX, trayY + trayHeight)
    trayGradient.addColorStop(0, 'rgba(212, 184, 156, 0.97)')
    trayGradient.addColorStop(0.42, 'rgba(188, 156, 126, 0.98)')
    trayGradient.addColorStop(1, 'rgba(150, 116, 85, 0.98)')
    ctx.fillStyle = trayGradient
    ctx.fill(trayPath)

    ctx.save()
    ctx.clip(trayPath)
    if (this.trayTexture?.complete && this.trayTexture.naturalWidth > 0) {
      ctx.globalAlpha = 0.22
      ctx.globalCompositeOperation = 'multiply'
      this.drawImageCover(ctx, this.trayTexture, trayX, trayY, trayWidth, trayHeight, 0.42)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 0.12
      this.drawImageCover(ctx, this.trayTexture, trayX, trayY, trayWidth, trayHeight, 0.54)
    }

    const trayHighlight = ctx.createLinearGradient(trayX, trayY, trayX, trayY + trayHeight)
    trayHighlight.addColorStop(0, 'rgba(255, 251, 242, 0.52)')
    trayHighlight.addColorStop(0.24, 'rgba(255, 251, 242, 0.28)')
    trayHighlight.addColorStop(1, 'rgba(47, 26, 12, 0.035)')
    ctx.fillStyle = trayHighlight
    ctx.fillRect(trayX, trayY, trayWidth, trayHeight)
    ctx.restore()

    ctx.strokeStyle = 'rgba(129, 95, 67, 0.62)'
    ctx.lineWidth = 1
    ctx.stroke(trayPath)

    const innerGradient = ctx.createLinearGradient(innerX, innerY, innerX, innerY + innerHeight)
    innerGradient.addColorStop(0, 'rgba(196, 164, 133, 0.72)')
    innerGradient.addColorStop(0.3, 'rgba(166, 132, 101, 0.58)')
    innerGradient.addColorStop(1, 'rgba(122, 90, 63, 0.66)')
    ctx.fillStyle = innerGradient
    ctx.fill(innerPath)

    ctx.save()
    ctx.clip(innerPath)
    if (this.trayTexture?.complete && this.trayTexture.naturalWidth > 0) {
      ctx.globalAlpha = 0.1
      ctx.globalCompositeOperation = 'multiply'
      this.drawImageCover(ctx, this.trayTexture, innerX, innerY, innerWidth, innerHeight, 0.5)
      ctx.globalCompositeOperation = 'source-over'
    }
    const innerHighlight = ctx.createLinearGradient(innerX, innerY, innerX, innerY + innerHeight)
    innerHighlight.addColorStop(0, 'rgba(255, 252, 245, 0.3)')
    innerHighlight.addColorStop(1, 'rgba(68, 42, 23, 0.02)')
    ctx.fillStyle = innerHighlight
    ctx.fillRect(innerX, innerY, innerWidth, innerHeight)
    ctx.restore()

    ctx.strokeStyle = 'rgba(130, 96, 69, 0.5)'
    ctx.stroke(innerPath)

    const lipGradient = ctx.createLinearGradient(innerX, innerY + innerHeight - lipHeight, innerX, innerY + innerHeight)
    lipGradient.addColorStop(0, 'rgba(160, 126, 95, 0.96)')
    lipGradient.addColorStop(1, 'rgba(112, 79, 52, 0.99)')
    ctx.fillStyle = lipGradient
    ctx.fill(lipPath)
    ctx.strokeStyle = 'rgba(255, 231, 194, 0.08)'
    ctx.stroke(lipPath)

    const tileBottomY = innerY + innerHeight - lipHeight - 2
    const totalLettersWidth = this.collectedLetters.length > 0
      ? this.collectedLetters.length * tileWidth + (this.collectedLetters.length - 1) * tileGap
      : 0
    const startX = innerX + (innerWidth - totalLettersWidth) / 2

    this.collectedLetters.forEach((letter, index) => {
      const targetX = startX + index * (tileWidth + tileGap) + tileWidth / 2
      const targetY = tileBottomY - tileHeight / 2
      const t = this.titleEaseOut(letter.animProgress)
      const startY = letter.floatingY + getPageCurvatureOffset(letter.floatingX, GAME_WIDTH)
      const x = letter.floatingX + (targetX - letter.floatingX) * t
      const y = startY + (targetY - startY) * t
      const scale = 0.74 + 0.26 * t
      this.renderCanvasTrayTile(ctx, letter, x, y, tileWidth, tileHeight, scale)
    })

    this.removedTrayLetters.forEach((letter) => {
      const t = this.titleEaseOut(letter.progress)
      const driftY = letter.y - t * 14
      const alpha = 1 - t
      const scale = 1 - t * 0.03
      this.renderCanvasTrayTile(ctx, letter.letter, letter.x, driftY, tileWidth, tileHeight, scale, alpha)
    })

    if (selectedPreview) {
      this.renderSelectedTrayPreview(ctx, trayY, selectedPreview)
    }

    if (this.feedback && (this.state === 'countdown' || this.state === 'playing' || this.state === 'paused')) {
      const progress = 1 - Math.max(0, this.feedback.timer) / Math.max(this.feedback.duration, 0.001)
      const fade = 1 - Math.min(1, progress / 0.8)
      const selectedPreviewTop = trayY - Game.TRAY_PREVIEW_HEIGHT - Game.TRAY_PREVIEW_GAP
      const baseY = selectedPreview ? selectedPreviewTop - 12 : trayY - 8
      const rise = this.feedback.success ? progress * 18 : progress * 8
      ctx.save()
      ctx.globalAlpha = fade
      ctx.font = CANVAS_FONTS.ui(13)
      ctx.fillStyle = this.feedback.success ? COLORS.green : COLORS.red
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(this.feedback.text, GAME_WIDTH / 2, baseY - rise)
      ctx.restore()
    }

    ctx.restore()
  }

  private renderCanvasTrayTile(
    ctx: CanvasRenderingContext2D,
    letter: CollectedLetter,
    centerX: number,
    centerY: number,
    width: number,
    height: number,
    scale: number,
    alpha: number = 1,
  ): void {
    const { fill, border, text } = this.getTrayTilePalette(letter.multiplierType)
    const x = centerX - width / 2
    const y = centerY - height / 2
    const tilePath = this.createRoundedRectPath(x, y, width, height, 5)

    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(centerX, centerY)
    ctx.scale(scale, scale)
    ctx.translate(-centerX, -centerY)

    const contactShadow = ctx.createRadialGradient(
      centerX,
      y + height + 1,
      width * 0.12,
      centerX,
      y + height + 1,
      width * 0.56,
    )
    contactShadow.addColorStop(0, 'rgba(44, 24, 16, 0.1)')
    contactShadow.addColorStop(0.55, 'rgba(44, 24, 16, 0.04)')
    contactShadow.addColorStop(1, 'rgba(44, 24, 16, 0)')
    ctx.fillStyle = contactShadow
    ctx.beginPath()
    ctx.ellipse(centerX, y + height + 1, width * 0.46, height * 0.08, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.shadowColor = 'rgba(44, 24, 16, 0.28)'
    ctx.shadowBlur = 16
    ctx.shadowOffsetY = 6
    ctx.fillStyle = fill
    ctx.fill(tilePath)

    ctx.shadowColor = 'transparent'
    ctx.save()
    ctx.clip(tilePath)
    if (this.trayTexture?.complete && this.trayTexture.naturalWidth > 0) {
      ctx.globalAlpha = 0.08
      ctx.globalCompositeOperation = 'multiply'
      this.drawImageCover(ctx, this.trayTexture, x, y, width, height, 0.68)
      ctx.globalCompositeOperation = 'source-over'
    }

    const grain = ctx.createLinearGradient(x, y, x + width, y)
    grain.addColorStop(0, 'rgba(90, 58, 28, 0.04)')
    grain.addColorStop(0.18, 'rgba(255, 240, 205, 0.02)')
    grain.addColorStop(0.4, 'rgba(110, 70, 34, 0.05)')
    grain.addColorStop(0.68, 'rgba(255, 246, 220, 0.02)')
    grain.addColorStop(1, 'rgba(84, 52, 24, 0.04)')
    ctx.fillStyle = grain
    ctx.fillRect(x, y, width, height)

    const plasticBase = ctx.createLinearGradient(x, y, x, y + height)
    plasticBase.addColorStop(0, 'rgba(255, 255, 255, 0.14)')
    plasticBase.addColorStop(0.22, 'rgba(255, 255, 255, 0.04)')
    plasticBase.addColorStop(0.55, 'rgba(255, 255, 255, 0)')
    plasticBase.addColorStop(1, 'rgba(92, 64, 51, 0.08)')
    ctx.fillStyle = plasticBase
    ctx.fill(tilePath)

    const highlight = ctx.createLinearGradient(x, y, x, y + height)
    highlight.addColorStop(0, 'rgba(255, 252, 244, 0.52)')
    highlight.addColorStop(0.22, 'rgba(255, 252, 244, 0.22)')
    highlight.addColorStop(0.52, 'rgba(255, 252, 244, 0.04)')
    highlight.addColorStop(1, 'rgba(0, 0, 0, 0.1)')
    ctx.fillStyle = highlight
    ctx.fill(tilePath)

    const sheen = ctx.createLinearGradient(x, y + 2, x, y + height * 0.68)
    sheen.addColorStop(0, 'rgba(255, 255, 255, 0.52)')
    sheen.addColorStop(0.18, 'rgba(255, 255, 255, 0.28)')
    sheen.addColorStop(0.42, 'rgba(255, 255, 255, 0.09)')
    sheen.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = sheen
    ctx.fillRect(x + 2, y + 2, width - 4, height * 0.62)

    const glossBand = ctx.createLinearGradient(x, y, x + width, y + height)
    glossBand.addColorStop(0.18, 'rgba(255, 255, 255, 0)')
    glossBand.addColorStop(0.42, 'rgba(255, 255, 255, 0.24)')
    glossBand.addColorStop(0.56, 'rgba(255, 255, 255, 0.08)')
    glossBand.addColorStop(0.72, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = glossBand
    ctx.beginPath()
    ctx.moveTo(x + width * 0.14, y + height * 0.16)
    ctx.lineTo(x + width * 0.62, y + height * 0.08)
    ctx.lineTo(x + width * 0.78, y + height * 0.32)
    ctx.lineTo(x + width * 0.28, y + height * 0.38)
    ctx.closePath()
    ctx.fill()

    const gloss = ctx.createRadialGradient(
      x + width * 0.72,
      y + height * 0.24,
      0,
      x + width * 0.72,
      y + height * 0.24,
      width * 0.26,
    )
    gloss.addColorStop(0, 'rgba(255, 255, 255, 0.72)')
    gloss.addColorStop(0.38, 'rgba(255, 255, 255, 0.3)')
    gloss.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = gloss
    ctx.beginPath()
    ctx.ellipse(x + width * 0.72, y + height * 0.24, width * 0.22, height * 0.14, -0.35, 0, Math.PI * 2)
    ctx.fill()

    const glossHotspot = ctx.createRadialGradient(
      x + width * 0.74,
      y + height * 0.2,
      0,
      x + width * 0.74,
      y + height * 0.2,
      width * 0.1,
    )
    glossHotspot.addColorStop(0, 'rgba(255, 255, 255, 0.86)')
    glossHotspot.addColorStop(0.45, 'rgba(255, 255, 255, 0.28)')
    glossHotspot.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = glossHotspot
    ctx.beginPath()
    ctx.ellipse(x + width * 0.74, y + height * 0.2, width * 0.08, height * 0.06, -0.35, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    ctx.strokeStyle = border
    ctx.lineWidth = 1
    ctx.stroke(tilePath)

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.14)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(x + 3, y + height - 2)
    ctx.lineTo(x + width - 3, y + height - 2)
    ctx.stroke()

    ctx.fillStyle = text
    ctx.font = '800 30px "Cormorant Garamond", "Palatino Linotype", Palatino, Georgia, serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(letter.letter, centerX, centerY - 1)

    ctx.fillStyle = COLORS.ivory
    ctx.font = '700 14px Georgia, "Times New Roman", serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.fillText(String(letter.value), x + width - 4, y + height - 6)

    ctx.restore()
  }

  private getTrayMetrics(): {
    tileWidth: number
    tileHeight: number
    tileGap: number
    trayHeight: number
    trayY: number
    innerWidth: number
    trayWidth: number
    trayX: number
    innerX: number
    innerY: number
    innerHeight: number
    lipHeight: number
  } {
    const slotCapacity = MAX_COLLECTED_LETTERS
    const tileWidth = 52
    const tileHeight = 52
    const tileGap = 6
    const innerPaddingX = 32
    const traySideMargin = 18
    const trayHeight = 88
    const trayY = GAME_HEIGHT - trayHeight - Game.TRAY_BOTTOM_OFFSET
    const innerWidth = slotCapacity * tileWidth + (slotCapacity - 1) * tileGap + innerPaddingX * 2
    const trayWidth = innerWidth + traySideMargin * 2
    const trayX = (GAME_WIDTH - trayWidth) / 2
    const innerX = trayX + traySideMargin
    const innerY = trayY + 10
    const innerHeight = trayHeight - 22
    const lipHeight = 10

    return {
      tileWidth,
      tileHeight,
      tileGap,
      trayHeight,
      trayY,
      innerWidth,
      trayWidth,
      trayX,
      innerX,
      innerY,
      innerHeight,
      lipHeight,
    }
  }

  private getTrayTileCenter(index: number, totalLetters: number): { x: number; y: number } {
    const { tileWidth, tileHeight, tileGap, innerX, innerY, innerWidth, innerHeight, lipHeight } = this.getTrayMetrics()
    const tileBottomY = innerY + innerHeight - lipHeight - 2
    const totalLettersWidth = totalLetters > 0
      ? totalLetters * tileWidth + (totalLetters - 1) * tileGap
      : 0
    const startX = innerX + (innerWidth - totalLettersWidth) / 2

    return {
      x: startX + index * (tileWidth + tileGap) + tileWidth / 2,
      y: tileBottomY - tileHeight / 2,
    }
  }

  private getTrayTilePalette(multiplierType: MultiplierType): { fill: string; border: string; text: string } {
    switch (multiplierType) {
      case 'DoubleLetter':
        return { fill: COLORS.dlLight, border: '#3F6BA8', text: '#FFFFFF' }
      case 'TripleLetter':
        return { fill: COLORS.tlBlue, border: '#177C72', text: COLORS.ivory }
      case 'DoubleWord':
        return { fill: COLORS.dwCoral, border: '#B83D2F', text: '#FFFFFF' }
      case 'TripleWord':
        return { fill: COLORS.twPurple, border: '#732D91', text: COLORS.ivory }
      default:
        return { fill: REGULAR_TILE_STYLE.fill, border: REGULAR_TILE_STYLE.border, text: COLORS.ivory }
    }
  }

  private getScorePreviewMultiplierStyle(multiplier: number): {
    fill: string
    border: string
    text: string
    glow: string
  } {
    if (multiplier >= 12) {
      return {
        fill: '#B76823',
        border: '#D18B46',
        text: COLORS.ivory,
        glow: 'rgba(183, 104, 35, 0.42)',
      }
    }
    if (multiplier >= 9) {
      return {
        fill: '#B28E2C',
        border: '#D1B159',
        text: COLORS.espresso,
        glow: 'rgba(178, 142, 44, 0.34)',
      }
    }
    if (multiplier >= 8) {
      return {
        fill: '#56742E',
        border: '#7E9B55',
        text: COLORS.ivory,
        glow: 'rgba(86, 116, 46, 0.34)',
      }
    }
    if (multiplier >= 6) {
      return {
        fill: '#2E8793',
        border: '#5DB1BC',
        text: COLORS.ivory,
        glow: 'rgba(46, 135, 147, 0.34)',
      }
    }
    if (multiplier >= 4) {
      return {
        fill: '#456E9F',
        border: '#7DA0C8',
        text: COLORS.ivory,
        glow: 'rgba(69, 110, 159, 0.34)',
      }
    }
    if (multiplier >= 3) {
      return {
        fill: '#73528E',
        border: '#9C7AB8',
        text: COLORS.ivory,
        glow: 'rgba(115, 82, 142, 0.34)',
      }
    }
    if (multiplier >= 2) {
      return {
        fill: '#9A4637',
        border: '#BF6F60',
        text: COLORS.ivory,
        glow: 'rgba(154, 70, 55, 0.34)',
      }
    }
    return {
      fill: 'rgba(92, 64, 51, 0.12)',
      border: 'rgba(92, 64, 51, 0.18)',
      text: COLORS.sepia,
      glow: 'rgba(92, 64, 51, 0)',
    }
  }

  private getPreviewMultiplierTier(multiplier: number): number {
    if (multiplier >= 12) return 6
    if (multiplier >= 9) return 5
    if (multiplier >= 8) return 4
    if (multiplier >= 6) return 3
    if (multiplier >= 4) return 2
    if (multiplier >= 3) return 1
    if (multiplier >= 2) return 0.5
    return 0
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
      renderText(ctx, 'Press ENTER to begin', centerX, GAME_HEIGHT - 85 - Game.TITLE_FOOTER_LIFT + Game.TITLE_PROMPT_DROP + getOffset(centerX) + sec3.slideY,
        CANVAS_FONTS.laneItalic(15), COLORS.sepia, 'center')
      ctx.restore()
    }

    // ── Credits (static, always visible) ──
    renderText(ctx, 'Created by Myles Stupp', centerX, GAME_HEIGHT - 45 - Game.TITLE_FOOTER_LIFT + getOffset(centerX),
      CANVAS_FONTS.uiSmallCaps(10), COLORS.muted, 'center')
    renderText(ctx, 'Powered by Pretext — chenglou/pretext', centerX, GAME_HEIGHT - 30 - Game.TITLE_FOOTER_LIFT + getOffset(centerX),
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
    this.renderGameOverWordLedger(ctx)

    const centerX = GAME_WIDTH * 0.75
    const getOffset = (x: number) => getPageCurvatureOffset(x, GAME_WIDTH)
    const centerY = GAME_HEIGHT * 0.22

    renderText(ctx, 'Finis', centerX, centerY + getOffset(centerX),
      CANVAS_FONTS.title(48), COLORS.espresso, 'center')

    renderText(ctx, `${this.getChapterTitle()} reached`, centerX, centerY + 45 + getOffset(centerX),
      CANVAS_FONTS.laneItalic(16), COLORS.sepia, 'center')

    // Final score
    renderText(ctx, String(this.score), centerX, centerY + 94 + getOffset(centerX),
      CANVAS_FONTS.laneLight(56), COLORS.gold, 'center')

    renderText(ctx, 'POINTS', centerX, centerY + 124 + getOffset(centerX),
      CANVAS_FONTS.uiSmallCaps(10), COLORS.muted, 'center')

    // High scores
    if (this.highScores.length > 0) {
      const hsY = centerY + 176 - Game.GAME_OVER_HIGH_SCORES_LIFT
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
    renderCurvedText(ctx, 'Press ENTER to play again', centerX, GAME_HEIGHT - 84 - Game.GAME_OVER_FOOTER_LIFT,
      CANVAS_FONTS.laneItalic(15), COLORS.sepia, getOffset, 'center')
    ctx.restore()

    // Return to Main Menu instruction
    renderCurvedText(ctx, 'Press ESC to return to Main Menu', centerX, GAME_HEIGHT - 50 - Game.GAME_OVER_FOOTER_LIFT,
      CANVAS_FONTS.laneItalic(12), COLORS.muted, getOffset, 'center')
  }

  private renderGameOverWordLedger(ctx: CanvasRenderingContext2D): void {
    const pageLeft = 58
    const pageRight = GAME_WIDTH / 2 - 54
    const pageCenterX = (pageLeft + pageRight) / 2
    const titleY = 74
    const listTopY = 144
    const listBottomY = GAME_HEIGHT - 96
    const getOffset = (x: number) => getPageCurvatureOffset(x, GAME_WIDTH)
    const ledgerPages = this.getGameOverLedgerPages(pageLeft, pageRight, listTopY, listBottomY)
    const totalPages = ledgerPages.length
    const currentPage = Math.max(0, Math.min(this.gameOverWordPage, totalPages - 1))
    const visibleEntries = ledgerPages[currentPage] ?? []
    const totalWords = this.wordsFound.length

    const countLabel = `${totalWords} word${totalWords === 1 ? '' : 's'} composed`
    renderText(ctx, countLabel, pageCenterX, titleY + getOffset(pageCenterX),
      CANVAS_FONTS.laneItalic(13), COLORS.sepia, 'center')
    renderText(ctx, 'Words Scored', pageCenterX, titleY + 28 + getOffset(pageCenterX),
      CANVAS_FONTS.title(30), COLORS.espresso, 'center')

    ctx.strokeStyle = COLORS.rule
    ctx.lineWidth = 0.5
    ctx.beginPath()
    for (let x = pageCenterX - 86; x <= pageCenterX + 86; x += 10) {
      const offset = getOffset(x)
      if (x === pageCenterX - 86) ctx.moveTo(x, titleY + 50 + offset)
      else ctx.lineTo(x, titleY + 50 + offset)
    }
    ctx.stroke()

    if (totalWords === 0) {
      renderText(ctx, 'Compose a word to have it archived here.', pageCenterX, listTopY + 18 + getOffset(pageCenterX),
        CANVAS_FONTS.laneItalic(14), COLORS.sepia, 'center')
      return
    }

    const tileSize = 20
    const tileGap = 2
    const scoreGap = 6
    const scoreFont = CANVAS_FONTS.laneBold(14)
    for (const placement of visibleEntries) {
      const { entry, x, y, width } = placement
      const centerY = y + getOffset(x + width * 0.5)
      const scoreText = `${entry.score}`
      const scoreWidth = measureTextWidth(scoreText, scoreFont)
      const maxTileAreaWidth = Math.max(28, width - scoreWidth - scoreGap)
      const maxTiles = Math.max(1, Math.floor((maxTileAreaWidth + tileGap) / (tileSize + tileGap)))
      const lettersToRender = entry.letters.slice(0, maxTiles)
      const wordWidth = lettersToRender.length * tileSize + Math.max(0, lettersToRender.length - 1) * tileGap

      for (let letterIndex = 0; letterIndex < lettersToRender.length; letterIndex++) {
        const tileX = x + tileSize / 2 + letterIndex * (tileSize + tileGap)
        this.renderWordLedgerTile(
          ctx,
          {
            letter: lettersToRender[letterIndex].letter.toUpperCase(),
            value: getLetterValue(lettersToRender[letterIndex].letter),
            multiplierType: lettersToRender[letterIndex].multiplierType,
            floatingX: 0,
            floatingY: 0,
            animProgress: 1,
          },
          tileX,
          centerY,
          tileSize,
          tileSize,
        )
      }

      renderText(ctx, scoreText, x + wordWidth + scoreGap + scoreWidth, centerY + 1, scoreFont, COLORS.sepia, 'right')
    }

    if (totalPages > 1) {
      const pageLabel = `Page ${currentPage + 1} of ${totalPages}`
      renderText(ctx, pageLabel, pageCenterX, listBottomY + 22 + getOffset(pageCenterX),
        CANVAS_FONTS.uiSmallCaps(9), COLORS.muted, 'center')
      renderText(ctx, 'Use \u2190 and \u2192 to turn pages', pageCenterX, listBottomY + 40 + getOffset(pageCenterX),
        CANVAS_FONTS.laneItalic(11), COLORS.sepia, 'center')
    }
  }

  private getGameOverLedgerPages(
    pageLeft: number,
    pageRight: number,
    listTopY: number,
    listBottomY: number,
  ): GameOverLedgerPlacement[][] {
    const entries: GameOverLedgerEntry[] = this.wordsFound.map((letters) => {
      const preview = getScorePreview(letters)
      return {
        letters,
        score: preview.totalScore,
      }
    })

    if (entries.length === 0) return [[]]

    const tileSize = 20
    const tileGap = 2
    const wordGap = 12
    const scoreGap = 6
    const scoreFont = CANVAS_FONTS.laneBold(14)
    const rowHeight = 32
    const pages: GameOverLedgerPlacement[][] = [[]]
    let pageIndex = 0
    let row = 0
    let cursorX = pageLeft

    for (const entry of entries) {
      const scoreWidth = measureTextWidth(String(entry.score), scoreFont)
      const tilesWidth = entry.letters.length * tileSize + Math.max(0, entry.letters.length - 1) * tileGap
      const entryWidth = tilesWidth + scoreGap + scoreWidth

      if (cursorX > pageLeft && cursorX + entryWidth > pageRight) {
        row++
        cursorX = pageLeft
      }

      const y = listTopY + row * rowHeight
      if (y + rowHeight > listBottomY) {
        pageIndex++
        pages.push([])
        row = 0
        cursorX = pageLeft
      }

      pages[pageIndex].push({
        entry,
        x: cursorX,
        y: listTopY + row * rowHeight,
        width: entryWidth,
      })
      cursorX += entryWidth + wordGap
    }

    return pages
  }

  private changeGameOverWordPage(direction: number): void {
    const totalPages = this.getGameOverLedgerPages(58, GAME_WIDTH / 2 - 54, 144, GAME_HEIGHT - 96).length
    if (totalPages <= 1) return

    const nextPage = Math.max(0, Math.min(totalPages - 1, this.gameOverWordPage + direction))
    if (nextPage === this.gameOverWordPage) return

    this.gameOverWordPage = nextPage
    audioManager.playPagesFromGameOver()
  }

  private renderWordLedgerTile(
    ctx: CanvasRenderingContext2D,
    letter: CollectedLetter,
    centerX: number,
    centerY: number,
    width: number,
    height: number,
  ): void {
    const { fill, border, text } = this.getTrayTilePalette(letter.multiplierType)
    const x = centerX - width / 2
    const y = centerY - height / 2
    const tilePath = this.createRoundedRectPath(x, y, width, height, 2)

    ctx.save()

    ctx.shadowColor = 'rgba(44, 24, 16, 0.16)'
    ctx.shadowBlur = 3
    ctx.shadowOffsetY = 1
    ctx.fillStyle = fill
    ctx.fill(tilePath)

    ctx.shadowColor = 'transparent'
    ctx.save()
    ctx.clip(tilePath)

    const highlight = ctx.createLinearGradient(x, y, x, y + height)
    highlight.addColorStop(0, 'rgba(255, 252, 244, 0.34)')
    highlight.addColorStop(0.32, 'rgba(255, 252, 244, 0.1)')
    highlight.addColorStop(1, 'rgba(0, 0, 0, 0.08)')
    ctx.fillStyle = highlight
    ctx.fill(tilePath)

    ctx.restore()

    ctx.strokeStyle = border
    ctx.lineWidth = 1
    ctx.stroke(tilePath)

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.14)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x + 2, y + height - 1)
    ctx.lineTo(x + width - 2, y + height - 1)
    ctx.stroke()

    ctx.fillStyle = text
    ctx.font = '700 14px "Cormorant Garamond", "Palatino Linotype", Palatino, Georgia, serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(letter.letter, x + width / 2, y + height / 2)

    ctx.fillStyle = COLORS.ivory
    ctx.font = '800 7px Georgia, "Times New Roman", serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.fillText(String(letter.value), x + width - 2, y + height - 2)

    ctx.restore()
  }

  private renderCountdown(ctx: CanvasRenderingContext2D): void {
    // Backdrop - ivory with background lanes visible
    ctx.fillStyle = COLORS.ivory
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    this.renderBackground(ctx)
    this.renderBookTopPanels(ctx)
    for (const lane of this.lanes) {
      lane.renderBase(ctx, -1, -100)
    }
    for (const lane of this.lanes) {
      lane.renderTopLayer(ctx)
    }
    for (const lane of this.lanes) {
      lane.renderFocusedTopLayer(ctx)
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

  private renderBookTopPanels(ctx: CanvasRenderingContext2D): void {
    this.renderStatsPanel(ctx, Game.TOP_PANEL_INSET, Game.TOP_PANEL_Y, 220, 90)
    this.renderLegendPanel(ctx, GAME_WIDTH - 236 - Game.TOP_PANEL_INSET, Game.TOP_PANEL_Y, 236, 58)
  }

  private renderStatsPanel(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
    this.drawPagePanel(ctx, x, y, width, height, () => {
      const left = -width / 2 + 15
      const right = width / 2 - 15
      const progressLeft = left + 2
      const progressWidth = width - 34
      const chapterText = this.getChapterLabel()
      const mins = Math.floor(this.timeRemaining / 60)
      const secs = Math.floor(this.timeRemaining % 60)
      const timerText = `${mins}:${secs.toString().padStart(2, '0')}`
      const nextTarget = this.getRequiredScore()
      const scoreText = String(this.score)
      const targetText = nextTarget === null ? null : `/ ${nextTarget}`

      renderText(ctx, 'CHAPTER', left, 14, CANVAS_FONTS.uiSmallCaps(8), COLORS.muted)
      renderText(ctx, 'TIME', right, 14, CANVAS_FONTS.uiSmallCaps(8), COLORS.muted, 'right')
      renderText(ctx, chapterText, left, 32, CANVAS_FONTS.title(22), COLORS.espresso)
      renderText(ctx, timerText, right, 32, CANVAS_FONTS.laneRegular(20), this.timeRemaining <= 15 ? COLORS.red : COLORS.espresso, 'right')

      ctx.strokeStyle = 'rgba(44, 24, 16, 0.08)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(left, 44)
      ctx.lineTo(right, 44)
      ctx.stroke()

      renderText(ctx, 'SCORE', left, 55, CANVAS_FONTS.uiSmallCaps(8), COLORS.muted)
      renderText(ctx, scoreText, left, 67, CANVAS_FONTS.laneMedium(18), COLORS.espresso)
      if (targetText) {
        const scoreWidth = measureTextWidth(scoreText, CANVAS_FONTS.laneMedium(18))
        renderText(ctx, targetText, left + scoreWidth + 7, 67, CANVAS_FONTS.laneRegular(12), COLORS.gold)
      } else {
        renderText(ctx, 'No further threshold', right, 67, CANVAS_FONTS.laneItalic(12), COLORS.gold, 'right')
      }

      ctx.save()
      ctx.beginPath()
      ctx.roundRect(progressLeft, 80, progressWidth, 2, 999)
      ctx.fillStyle = 'rgba(44, 24, 16, 0.12)'
      ctx.fill()
      if (nextTarget !== null) {
        ctx.beginPath()
        ctx.roundRect(progressLeft, 80, progressWidth * Math.min(1, this.score / nextTarget), 2, 999)
        ctx.fillStyle = COLORS.gold
        ctx.fill()
      }
      ctx.restore()
    })
  }

  private renderLegendPanel(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
    const items = [
      { label: 'Double Letter', color: COLORS.dlLight, border: '#3F6BA8', x: -width / 2 + 16, y: 18 },
      { label: 'Triple Letter', color: COLORS.tlBlue, border: '#177C72', x: -width / 2 + 126, y: 18 },
      { label: 'Double Word', color: COLORS.dwCoral, border: '#B83D2F', x: -width / 2 + 16, y: 38 },
      { label: 'Triple Word', color: COLORS.twPurple, border: '#732D91', x: -width / 2 + 126, y: 38 },
    ] as const

    this.drawPagePanel(ctx, x, y, width, height, () => {
      for (const item of items) {
        ctx.beginPath()
        ctx.roundRect(item.x, item.y - 7, 12, 12, 2)
        ctx.fillStyle = item.color
        ctx.fill()
        ctx.strokeStyle = item.border
        ctx.lineWidth = 1
        ctx.stroke()

        renderText(ctx, item.label, item.x + 18, item.y, CANVAS_FONTS.laneItalic(12), COLORS.muted)
      }
    })
  }

  private renderSelectedTrayPreview(ctx: CanvasRenderingContext2D, trayY: number, preview: ScorePreview): void {
    const hasMultiplierBadge = preview.wordMultiplier > 1
    const height = Game.TRAY_PREVIEW_HEIGHT
    const hasTimeBonus = preview.timeBonus > 0
    const multiplierStyle = this.getScorePreviewMultiplierStyle(preview.wordMultiplier)
    const multiplierTier = this.getPreviewMultiplierTier(preview.wordMultiplier)
    const pulse = multiplierTier > 0
      ? Math.sin(Date.now() * (0.0038 + multiplierTier * 0.00022))
      : 0
    const badgeScale = 1 + multiplierTier * 0.022 + pulse * (0.01 + multiplierTier * 0.003)
    const trayValueFont = '700 14px Georgia, "Times New Roman", serif'
    const operatorFont = CANVAS_FONTS.laneMedium(12)
    const summaryValueFont = '700 16px Georgia, "Times New Roman", serif'
    const summaryLabelFont = CANVAS_FONTS.laneMedium(13)
    const timeFont = '700 15px Georgia, "Times New Roman", serif'
    const badgeFont = '700 10px Georgia, "Times New Roman", serif'
    const badgeWidth = hasMultiplierBadge
      ? Math.max(28, measureTextWidth(`×${preview.wordMultiplier}`, badgeFont) + 8)
      : 0
    const hasLengthBonus = preview.lengthBonus > 0
    const baseText = String(preview.letterScore)
    const plusGlyph = '+'
    const openParen = '('
    const closeParen = ')'
    const bonusValueText = String(preview.lengthBonus)
    const openParenWidth = hasLengthBonus ? measureTextWidth(openParen, operatorFont) : 0
    const closeParenWidth = hasLengthBonus ? measureTextWidth(closeParen, operatorFont) : 0
    const baseWidth = measureTextWidth(baseText, trayValueFont)
    const plusWidth = measureTextWidth(plusGlyph, operatorFont)
    const bonusWidth = hasLengthBonus ? measureTextWidth(bonusValueText, trayValueFont) : 0
    const formulaGroupWidth = (hasLengthBonus ? openParenWidth + 4 : 0)
      + baseWidth
      + (hasLengthBonus ? 7 + plusWidth + 7 + bonusWidth + 4 + closeParenWidth : 0)
      + (hasMultiplierBadge ? 14 + badgeWidth : 0)
    const pointsValueWidth = measureTextWidth(String(preview.totalScore), summaryValueFont)
    const pointsLabelGap = 2
    const pointsTrailingGap = 10
    const pointsLabelWidth = measureTextWidth('pts', summaryLabelFont)
    const pointsWidth = pointsValueWidth + pointsLabelGap + pointsLabelWidth + pointsTrailingGap
    const timeText = hasTimeBonus ? `+${preview.timeBonus}s` : ''
    const timeWidth = hasTimeBonus ? measureTextWidth(timeText, timeFont) : 0
    const summaryDividerGap = hasTimeBonus ? 12 : 0
    const summaryGap = hasTimeBonus ? summaryDividerGap * 2 : 0
    const summaryBlockWidth = hasTimeBonus ? pointsWidth + summaryGap + timeWidth : pointsWidth
    const leftPadding = 18
    const rightPadding = 18
    const formulaToEqualsGap = 8
    const equalsToSummaryGap = 8
    const summaryPadding = 8
    const equalsFont = CANVAS_FONTS.laneMedium(13)
    const equalsText = '='
    const equalsWidth = measureTextWidth(equalsText, equalsFont)
    const summarySectionWidth = summaryBlockWidth + summaryPadding * 2
    const width = Math.ceil(
      leftPadding
      + formulaGroupWidth
      + formulaToEqualsGap
      + equalsWidth
      + equalsToSummaryGap
      + summarySectionWidth
      + rightPadding
    )
    const x = (GAME_WIDTH - width) / 2
    const y = trayY - height - Game.TRAY_PREVIEW_GAP
    const path = this.createRoundedRectPath(x, y, width, height, 12)
    const formulaX = x + leftPadding
    const formulaCenterY = y + height / 2 + 0.5
    const badgeCenterX = formulaX
      + baseWidth
      + (hasLengthBonus ? 7 + plusWidth + 7 + bonusWidth + 4 + closeParenWidth : 0)
      + 14
      + badgeWidth / 2
    const badgeX = badgeCenterX - badgeWidth / 2
    const badgeY = y + 4
    const badgeHeight = height - 8
    const equalsCenterX = formulaX + formulaGroupWidth + formulaToEqualsGap + equalsWidth / 2
    const summaryLeft = equalsCenterX + equalsWidth / 2 + equalsToSummaryGap + summaryPadding
    const pointsCenterX = hasTimeBonus ? summaryLeft + pointsWidth / 2 : summaryLeft + summaryBlockWidth / 2
    const timeCenterX = summaryLeft + pointsWidth + summaryGap + timeWidth / 2

    ctx.save()
    ctx.fillStyle = 'rgba(245, 241, 232, 0.88)'
    ctx.shadowColor = multiplierTier > 0 ? 'rgba(92, 64, 51, 0.12)' : 'rgba(92, 64, 51, 0.08)'
    ctx.shadowBlur = multiplierTier > 0 ? 12 : 10
    ctx.shadowOffsetY = 2
    ctx.fill(path)
    ctx.restore()

    const panelGradient = ctx.createLinearGradient(x, y, x, y + height)
    panelGradient.addColorStop(0, 'rgba(250, 246, 238, 0.92)')
    panelGradient.addColorStop(0.55, 'rgba(245, 241, 232, 0.88)')
    panelGradient.addColorStop(1, 'rgba(233, 225, 210, 0.9)')
    ctx.fillStyle = panelGradient
    ctx.fill(path)
    ctx.strokeStyle = 'rgba(92, 64, 51, 0.14)'
    ctx.lineWidth = 1
    ctx.stroke(path)

    if (hasLengthBonus) {
      renderText(ctx, openParen, formulaX, formulaCenterY, operatorFont, COLORS.muted)
      renderText(ctx, baseText, formulaX + openParenWidth + 4, formulaCenterY, trayValueFont, COLORS.espresso)
      renderText(ctx, plusGlyph, formulaX + openParenWidth + 4 + baseWidth + 7, formulaCenterY, operatorFont, COLORS.muted)
      renderText(
        ctx,
        bonusValueText,
        formulaX + openParenWidth + 4 + baseWidth + 7 + plusWidth + 7,
        formulaCenterY,
        trayValueFont,
        COLORS.green,
      )
      renderText(
        ctx,
        closeParen,
        formulaX + openParenWidth + 4 + baseWidth + 7 + plusWidth + 7 + bonusWidth + 4,
        formulaCenterY,
        operatorFont,
        COLORS.muted,
      )
    } else {
      renderText(ctx, baseText, formulaX, formulaCenterY, trayValueFont, COLORS.espresso)
    }

    if (hasMultiplierBadge) {
      ctx.save()
      ctx.translate(badgeCenterX, badgeY + badgeHeight / 2)
      ctx.scale(badgeScale, badgeScale)
      ctx.translate(-badgeCenterX, -(badgeY + badgeHeight / 2))

      const badgePath = this.createRoundedRectPath(badgeX, badgeY, badgeWidth, badgeHeight, 10)
      const badgeGradient = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + badgeHeight)
      badgeGradient.addColorStop(0, multiplierStyle.fill)
      badgeGradient.addColorStop(0.16, multiplierStyle.fill)
      badgeGradient.addColorStop(1, multiplierStyle.fill)
      ctx.shadowColor = multiplierStyle.glow
      ctx.shadowBlur = multiplierTier > 0 ? 12 + multiplierTier * 3 : 0
      ctx.shadowOffsetY = 0
      ctx.fillStyle = badgeGradient
      ctx.fill(badgePath)
      ctx.shadowColor = 'transparent'
      ctx.strokeStyle = multiplierStyle.border
      ctx.lineWidth = 1
      ctx.stroke(badgePath)
      renderText(
        ctx,
        `×${preview.wordMultiplier}`,
        badgeCenterX,
        badgeY + badgeHeight / 2,
        badgeFont,
        multiplierStyle.text,
        'center',
      )
      ctx.restore()
    }

    renderText(ctx, equalsText, equalsCenterX, formulaCenterY, equalsFont, COLORS.muted, 'center')
    renderText(ctx, String(preview.totalScore), pointsCenterX - pointsLabelWidth / 2, formulaCenterY, summaryValueFont, COLORS.espresso, 'center')
    renderText(ctx, 'pts', pointsCenterX + pointsValueWidth / 2 + pointsLabelGap - 1, formulaCenterY, summaryLabelFont, COLORS.espresso)

    if (hasTimeBonus) {
      const summaryDividerX = summaryLeft + pointsWidth + summaryDividerGap
      ctx.beginPath()
      ctx.moveTo(summaryDividerX, y + 5)
      ctx.lineTo(summaryDividerX, y + height - 5)
      ctx.stroke()
      renderText(ctx, timeText, timeCenterX, formulaCenterY, timeFont, COLORS.gold, 'center')
    }
  }

  private drawPagePanel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    drawContents: () => void,
  ): void {
    ctx.save()
    ctx.translate(x + width / 2, y)

    ctx.save()
    ctx.beginPath()
    ctx.roundRect(-width / 2, 0, width, height, 14)
    ctx.fillStyle = 'rgba(245, 241, 232, 0.84)'
    ctx.shadowColor = 'rgba(92, 64, 51, 0.08)'
    ctx.shadowBlur = 14
    ctx.shadowOffsetY = 3
    ctx.fill()
    ctx.restore()

    ctx.beginPath()
    ctx.roundRect(-width / 2, 0, width, height, 14)
    ctx.fillStyle = 'rgba(245, 241, 232, 0.74)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(92, 64, 51, 0.14)'
    ctx.lineWidth = 1
    ctx.stroke()

    drawContents()
    ctx.restore()
  }

  // ── DOM UI updates ──

  /** Hide/show the book-top stat block and multiplier legend. */
  private setHudContentVisible(visible: boolean): void {
    if (this.hudContentVisible === visible) return

    const visibility = visible ? 'visible' : 'hidden'
    const opacity = visible ? '1' : '0'
    if (this.hud.bookStats) {
      this.hud.bookStats.style.visibility = visibility
      this.hud.bookStats.style.opacity = opacity
    }
    if (this.hud.multiplierLegend) {
      this.hud.multiplierLegend.style.visibility = visibility
      this.hud.multiplierLegend.style.opacity = opacity
    }
    this.hudContentVisible = visible
  }

  private setCompletedWordsVisible(visible: boolean): void {
    if (this.completedWordsVisible === visible) return

    if (this.hud.completedWordsContainer) {
      this.hud.completedWordsContainer.style.visibility = visible ? 'visible' : 'hidden'
      this.hud.completedWordsContainer.style.opacity = visible ? '1' : '0'
      this.hud.completedWordsContainer.style.pointerEvents = visible ? 'auto' : 'none'
    }

    this.completedWordsVisible = visible
  }

  private syncHudVisibility(): void {
    const shouldShowHud = this.state === 'countdown' || this.state === 'playing' || this.state === 'paused'
    this.setHudContentVisible(shouldShowHud)
    this.setCompletedWordsVisible(this.state !== 'gameover')
  }

  private updateUI(): void {
    const nextTarget = this.getRequiredScore()
    const scoreText = String(this.score)
    const levelText = this.getChapterLabel()
    const nextTargetText = nextTarget === null ? 'Epilogue' : String(nextTarget)
    const progressWidth = nextTarget === null
      ? '0%'
      : `${Math.min(100, (this.score / nextTarget) * 100)}%`
    const mins = Math.floor(this.timeRemaining / 60)
    const secs = Math.floor(this.timeRemaining % 60)
    const timerText = `${mins}:${secs.toString().padStart(2, '0')}`
    const isTimerUrgent = this.timeRemaining <= 15

    if (this.hud.scoreValue && this.lastHudScore !== scoreText) {
      this.hud.scoreValue.textContent = scoreText
      this.lastHudScore = scoreText
    }

    if (this.hud.levelValue && this.lastHudLevel !== levelText) {
      this.hud.levelValue.textContent = levelText
      this.lastHudLevel = levelText
    }

    if (this.hud.nextChapterValue && this.lastHudNextTarget !== nextTargetText) {
      this.hud.nextChapterValue.textContent = nextTargetText
      this.lastHudNextTarget = nextTargetText
    }

    if (this.hud.scoreProgressFill && this.lastHudProgressWidth !== progressWidth) {
      this.hud.scoreProgressFill.style.width = progressWidth
      this.lastHudProgressWidth = progressWidth
    }

    if (this.hud.timerValue) {
      if (this.lastHudTimer !== timerText) {
        this.hud.timerValue.textContent = timerText
        this.lastHudTimer = timerText
      }

      if (this.lastHudTimerUrgent !== isTimerUrgent) {
        this.hud.timerValue.className = isTimerUrgent ? 'urgent' : ''
        this.lastHudTimerUrgent = isTimerUrgent
      }
    }
  }

  public updateWordsUI(): void {
    const wordsEl = this.hud.completedWordsList
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
          const char = word[j].letter.toUpperCase()
          const value = getLetterValue(char)
          const tile = document.createElement('div')
          tile.className = 'tray-tile'
          if (word[j].multiplierType && word[j].multiplierType !== 'None') {
            tile.classList.add(`multiplier-${word[j].multiplierType}`)
          }
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

  private getHudElements(): HudElements {
    return {
      bookStats: null,
      multiplierLegend: null,
      scoreValue: null,
      levelValue: null,
      timerValue: null,
      nextChapterValue: null,
      scoreProgressFill: null,
      completedWordsContainer: document.getElementById('completed-words-container'),
      completedWordsList: document.getElementById('completed-words-list'),
    }
  }

  private loadTrayTexture(): HTMLImageElement {
    const image = new Image()
    image.src = `${import.meta.env.BASE_URL}images/traytexture_1.png`
    return image
  }

  private drawImageCover(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    x: number,
    y: number,
    width: number,
    height: number,
    focusY: number,
  ): void {
    const sourceWidth = image.naturalWidth
    const sourceHeight = image.naturalHeight
    if (sourceWidth === 0 || sourceHeight === 0) return

    const sourceRatio = sourceWidth / sourceHeight
    const targetRatio = width / height

    let sx = 0
    let sy = 0
    let sw = sourceWidth
    let sh = sourceHeight

    if (sourceRatio > targetRatio) {
      sw = sourceHeight * targetRatio
      sx = (sourceWidth - sw) / 2
    } else {
      sh = sourceWidth / targetRatio
      sy = Math.max(0, Math.min(sourceHeight - sh, (sourceHeight - sh) * focusY))
    }

    ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height)
  }

  private createRenderAssets(): RenderAssets {
    const backgroundRulePaths: Path2D[] = []
    for (let y = 40; y <= GAME_HEIGHT - 40; y += 22) {
      backgroundRulePaths.push(this.createCurvedLinePath(0, GAME_WIDTH, y))
    }

    const vignetteGradient = this.ctx.createRadialGradient(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 0.3,
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 0.7,
    )
    vignetteGradient.addColorStop(0, 'rgba(245, 241, 232, 0)')
    vignetteGradient.addColorStop(1, 'rgba(200, 190, 170, 0.15)')

    const spineGradient = this.ctx.createLinearGradient(GAME_WIDTH / 2 - 40, 0, GAME_WIDTH / 2 + 40, 0)
    spineGradient.addColorStop(0, 'rgba(0, 0, 0, 0)')
    spineGradient.addColorStop(0.3, 'rgba(0, 0, 0, 0.05)')
    spineGradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.12)')
    spineGradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.05)')
    spineGradient.addColorStop(1, 'rgba(0, 0, 0, 0)')

    const edgeGradientLeft = this.ctx.createLinearGradient(0, 0, 85, 0)
    edgeGradientLeft.addColorStop(0, 'rgba(44, 24, 16, 0.18)')
    edgeGradientLeft.addColorStop(0.08, 'rgba(44, 24, 16, 0.08)')
    edgeGradientLeft.addColorStop(0.12, 'rgba(44, 24, 16, 0.15)')
    edgeGradientLeft.addColorStop(0.18, 'rgba(44, 24, 16, 0.06)')
    edgeGradientLeft.addColorStop(0.28, 'rgba(44, 24, 16, 0.1)')
    edgeGradientLeft.addColorStop(0.36, 'rgba(44, 24, 16, 0.045)')
    edgeGradientLeft.addColorStop(0.56, 'rgba(44, 24, 16, 0.03)')
    edgeGradientLeft.addColorStop(1, 'rgba(44, 24, 16, 0)')

    const edgeGradientRight = this.ctx.createLinearGradient(GAME_WIDTH - 85, 0, GAME_WIDTH, 0)
    edgeGradientRight.addColorStop(0, 'rgba(44, 24, 16, 0)')
    edgeGradientRight.addColorStop(0.44, 'rgba(44, 24, 16, 0.03)')
    edgeGradientRight.addColorStop(0.64, 'rgba(44, 24, 16, 0.045)')
    edgeGradientRight.addColorStop(0.72, 'rgba(44, 24, 16, 0.1)')
    edgeGradientRight.addColorStop(0.82, 'rgba(44, 24, 16, 0.06)')
    edgeGradientRight.addColorStop(0.88, 'rgba(44, 24, 16, 0.15)')
    edgeGradientRight.addColorStop(0.92, 'rgba(44, 24, 16, 0.08)')
    edgeGradientRight.addColorStop(1, 'rgba(44, 24, 16, 0.18)')

    const edgeGradientBottom = this.ctx.createLinearGradient(0, GAME_HEIGHT - 78, 0, GAME_HEIGHT)
    edgeGradientBottom.addColorStop(0, 'rgba(44, 24, 16, 0)')
    edgeGradientBottom.addColorStop(0.42, 'rgba(44, 24, 16, 0.03)')
    edgeGradientBottom.addColorStop(0.62, 'rgba(44, 24, 16, 0.05)')
    edgeGradientBottom.addColorStop(0.72, 'rgba(44, 24, 16, 0.11)')
    edgeGradientBottom.addColorStop(0.8, 'rgba(44, 24, 16, 0.05)')
    edgeGradientBottom.addColorStop(0.9, 'rgba(44, 24, 16, 0.14)')
    edgeGradientBottom.addColorStop(0.95, 'rgba(44, 24, 16, 0.08)')
    edgeGradientBottom.addColorStop(1, 'rgba(44, 24, 16, 0.18)')

    return {
      backgroundRulePaths,
      boundaryTopPath: this.createCurvedLinePath(30, GAME_WIDTH - 30, LANE_Y_START),
      boundaryBottomPath: this.createCurvedLinePath(30, GAME_WIDTH - 30, LANE_Y_START + LANE_COUNT * LANE_HEIGHT),
      vignetteGradient,
      spineGradient,
      edgeGradientLeft,
      edgeGradientRight,
      edgeGradientBottom,
    }
  }

  private createCurvedLinePath(startX: number, endX: number, y: number): Path2D {
    const path = new Path2D()
    for (let x = startX; x <= endX; x += 10) {
      const offset = getPageCurvatureOffset(x, GAME_WIDTH)
      if (x === startX) path.moveTo(x, y + offset)
      else path.lineTo(x, y + offset)
    }
    return path
  }

  private createRoundedRectPath(x: number, y: number, width: number, height: number, radius: number): Path2D {
    const r = Math.min(radius, width / 2, height / 2)
    const path = new Path2D()
    path.moveTo(x + r, y)
    path.lineTo(x + width - r, y)
    path.quadraticCurveTo(x + width, y, x + width, y + r)
    path.lineTo(x + width, y + height - r)
    path.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
    path.lineTo(x + r, y + height)
    path.quadraticCurveTo(x, y + height, x, y + height - r)
    path.lineTo(x, y + r)
    path.quadraticCurveTo(x, y, x + r, y)
    path.closePath()
    return path
  }
}
