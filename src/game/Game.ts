// ── Game — state machine, rules and input routing ──

import { audio } from '../audio/AudioManager'
import { Input, type Action, type PointerInfo } from '../core/input'
import { createRng, seedFromString, todayKey } from '../core/rng'
import { persist, save, type WordRecord } from '../core/storage'
import { ParticleSystem } from '../effects/ParticleSystem'
import { resolveWordPattern } from '../utils/dictionary'
import {
  COLORS, GAME_WIDTH, GRAB_REACH, LANE_COUNT, LANE_HEIGHT, LANE_Y_START, MAX_TIME, MIN_WORD_LENGTH,
  STARTING_TIME, chapterThreshold, isMarginLane, toRoman,
} from '../utils/constants'
import { clamp, damp } from '../utils/math'
import { Lane } from './Lane'
import { laneSpeed, planBoard, tileOdds } from './Levels'
import { Cursor } from './Player'
import { PowerLane, type PowerItem } from './PowerLane'
import { flowWindow, praise, scoreLetters, FLOW_LEVELS, type ScoreBreakdown } from './Scoring'
import { POWERS, type PowerKind, type TileKind } from './Tiles'
import { Tray, TRAY } from './Tray'
import { hitButton, type Button } from '../ui/widgets'
import { renderFrame } from '../ui/render'

export type GameState = 'title' | 'countdown' | 'playing' | 'paused' | 'ending' | 'gameover'
export type Mode = 'classic' | 'daily'
export type WordStatus = 'empty' | 'short' | 'checking' | 'valid' | 'invalid' | 'used'

export interface InkedWord {
  word: string
  score: number
  kinds: TileKind[]
  chapter: number
}

export interface Floater {
  text: string
  x: number
  y: number
  vy: number
  t: number
  life: number
  color: string
  size: number
  italic?: boolean
}

export interface Target {
  x: number
  y: number
  scale: number
  kind: TileKind | null
  power: PowerKind | null
}

interface Intent {
  lane: number
  tile: number | null
  power: PowerItem | null
  t: number
}

export interface RunSummary {
  score: number
  words: number
  bestWord: WordRecord | null
  longest: string
  chapter: number
  elapsed: number
  newBest: boolean
  newDailyBest: boolean
  mode: Mode
  date: string
}

const CHAPTER_SUBTITLES = [
  'The first page', 'The plot thickens', 'The page quickens', 'Rising action', 'A twist of phrase',
  'Purple prose', 'The climax nears', 'Stream of consciousness', 'The final act', 'Beyond the ending',
]

const HOP_REPEAT_DELAY = 0.24
const HOP_REPEAT_RATE = 0.1

export class Game {
  state: GameState = 'title'
  mode: Mode = 'classic'
  seed = 0
  time = 0 // wall clock for animation

  // Board
  board: (Lane | PowerLane)[] = []
  cursor = new Cursor()
  tray = new Tray()
  particles = new ParticleSystem()
  target: Target | null = null

  // Run
  score = 0
  displayScore = 0
  chapter = 1
  timeLeft = STARTING_TIME
  elapsed = 0
  words: InkedWord[] = []
  used = new Set<string>()
  flowLevel = 0
  flowTimer = 0
  slowTimer = 0
  lensCharges = 0
  timeScale = 1
  private powerTimer = 0
  private powerRng = createRng(1)

  // Word check
  status: WordStatus = 'empty'
  resolvedWord = ''
  preview: ScoreBreakdown | null = null
  private checkToken = 0
  private checkPromise: Promise<void> | null = null

  // Presentation
  floaters: Floater[] = []
  toast: { text: string; t: number; bad: boolean } | null = null
  banner: { title: string; sub: string; t: number } | null = null
  countdown = 3
  countdownTimer = 0
  endingT = 0
  shake = 0
  laneFlash = 0
  timerPulse = 0
  hint = ''
  private hintStage = 0
  summary: RunSummary | null = null
  private lastSecond = 0

  // UI
  buttons: Button[] = []
  hot: string | null = null
  focus = 0
  confirmQuit = false

  // Input
  input: Input
  private intent: Intent | null = null
  private grabBuffer = 0
  private hopHeld = 0
  private hopRepeat = 0

  constructor(public canvas: HTMLCanvasElement, public ctx: CanvasRenderingContext2D) {
    this.input = new Input(canvas)
    this.input.onAction = (a, repeat) => this.onAction(a, repeat)
    this.input.onPointerDown = p => this.onPointerDown(p)
    this.input.onPointerMove = p => this.onPointerMove(p)
    this.buildBoard(Math.floor(Math.random() * 1e9))

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.autoPause()
        audio.suspend()
      } else {
        audio.resume()
      }
    })
    window.addEventListener('blur', () => this.autoPause())
    audio.setMusic('title')
  }

  // ── Setup ──

  private buildBoard(seed: number): void {
    this.seed = seed
    const plan = planBoard(seed)
    this.board = []
    for (let i = 0; i < LANE_COUNT; i++) {
      if (isMarginLane(i)) {
        this.board[i] = new PowerLane(i, laneSpeed(i, 1, 0), i === 0 ? 1 : -1)
      }
    }
    for (const opts of plan.lanes) {
      const lane = new Lane(opts)
      lane.odds = tileOdds(1)
      lane.rollAll()
      this.board[opts.index] = lane
    }
    this.jitters = plan.lanes.map(l => l.jitter)
    this.powerRng = createRng(seed ^ 0x5bd1e995)
  }
  private jitters: number[] = []

  private applyChapter(instant: boolean): void {
    let n = 0
    for (let i = 0; i < LANE_COUNT; i++) {
      const lane = this.board[i]
      if (lane instanceof Lane) {
        lane.setSpeed(laneSpeed(i, this.chapter, this.jitters[n++] ?? 0), instant)
        lane.odds = tileOdds(this.chapter)
      } else {
        lane.setSpeed(laneSpeed(i, this.chapter, 0), instant)
      }
    }
  }

  start(mode: Mode): void {
    this.mode = mode
    const date = todayKey()
    this.buildBoard(mode === 'daily' ? seedFromString(`lexicon:${date}`) : Math.floor(Math.random() * 1e9))
    this.score = 0
    this.displayScore = 0
    this.chapter = 1
    this.timeLeft = STARTING_TIME
    this.elapsed = 0
    this.words = []
    this.used = new Set()
    this.flowLevel = 0
    this.flowTimer = 0
    this.slowTimer = 0
    this.lensCharges = 0
    this.timeScale = 1
    this.powerTimer = 9
    this.tray = new Tray()
    this.tray.setTexture(trayTexture)
    this.cursor.reset()
    this.particles.clear()
    this.floaters = []
    this.toast = null
    this.banner = null
    this.intent = null
    this.summary = null
    this.status = 'empty'
    this.preview = null
    this.hintStage = save.stats.tutorialDone ? 99 : 0
    this.lastSecond = STARTING_TIME
    this.applyChapter(true)
    this.state = 'countdown'
    this.countdown = 3
    this.countdownTimer = 0.62
    this.confirmQuit = false
    audio.play('pages1', 0.8)
    audio.countdown(3)
    audio.setMusic('game')
    audio.setDuck(1)
    void audio.startAmbience()
  }

  private toTitle(): void {
    this.state = 'title'
    this.focus = 0
    this.confirmQuit = false
    audio.play('pages2', 0.7)
    audio.setMusic('title')
    audio.setDuck(1)
    audio.stopAmbience()
    this.buildBoard(Math.floor(Math.random() * 1e9))
  }

  autoPause(): void {
    if (this.state === 'playing' || this.state === 'countdown') this.pause()
  }

  private pause(): void {
    if (this.state !== 'playing' && this.state !== 'countdown') return
    this.pausedFrom = this.state
    this.state = 'paused'
    this.focus = 0
    this.confirmQuit = false
    this.input.clearHeld()
    audio.setDuck(0.35)
    audio.play('menu', 0.6)
  }
  private pausedFrom: GameState = 'playing'

  private resume(): void {
    if (this.state !== 'paused') return
    this.state = this.pausedFrom
    audio.setDuck(1)
    audio.play('menu', 0.6)
  }

  // ── Word validation ──

  private refreshWord(): void {
    const token = ++this.checkToken
    const letters = this.tray.letters()
    const pattern = this.tray.pattern()
    this.preview = letters.length > 0 ? scoreLetters(letters, this.flowLevel, this.lensCharges > 0) : null
    this.resolvedWord = ''
    if (letters.length === 0) {
      this.status = 'empty'
      this.checkPromise = null
      return
    }
    if (letters.length < MIN_WORD_LENGTH) {
      this.status = 'short'
      this.checkPromise = null
      return
    }
    this.status = 'checking'
    this.checkPromise = resolveWordPattern(pattern, this.used).then(res => {
      if (token !== this.checkToken) return
      if (res.word) {
        this.status = 'valid'
        this.resolvedWord = res.word
      } else {
        this.status = res.blockedWord ? 'used' : 'invalid'
        this.resolvedWord = res.blockedWord ?? pattern
      }
    })
  }

  private async submit(): Promise<void> {
    if (this.state !== 'playing') return
    if (this.tray.length === 0) {
      this.say('Catch some letters first', true)
      audio.play('invalid', 0.5)
      return
    }
    if (this.status === 'short') {
      this.say('Words need at least 3 letters', true)
      this.tray.reject()
      audio.play('invalid', 0.6)
      return
    }
    if (this.status === 'checking' && this.checkPromise) {
      const token = this.checkToken
      await this.checkPromise
      if (token !== this.checkToken || this.state !== 'playing') return
    }
    if (this.status === 'valid') {
      this.inkWord()
      return
    }
    this.tray.reject()
    audio.play('invalid', 0.7)
    if (this.status === 'used') this.say(`${this.resolvedWord} is already inked`, true)
    else this.say('Not in the lexicon', true)
    if (this.flowLevel > 0) {
      this.flowLevel--
      this.flowTimer = flowWindow(this.flowLevel)
      this.floatAt('Flow broken', 740, 88, COLORS.red, 16, true)
    }
    this.refreshWord()
  }

  private inkWord(): void {
    const letters = this.tray.letters()
    const word = this.resolvedWord
    const lens = this.lensCharges > 0
    const b = scoreLetters(letters, this.flowLevel, lens)
    if (lens) this.lensCharges--
    this.score += b.total
    const before = this.timeLeft
    this.timeLeft = Math.min(MAX_TIME, this.timeLeft + b.timeBonus)
    const gained = Math.round(this.timeLeft - before)
    this.words.push({ word, score: b.total, kinds: letters.map(l => l.kind), chapter: this.chapter })
    this.used.add(word)

    // Presentation
    const cx = (this.tray.slotX(0) + this.tray.slotX(Math.max(0, letters.length - 1))) / 2
    this.tray.fillBlanks(word)
    this.tray.inkAway()
    const intensity = clamp(0.7 + b.total / 90, 0.7, 2)
    this.particles.explodeWord(word, cx, TRAY.tilesCenterY - 30, intensity)
    this.floatAt(`+${b.total}`, cx, TRAY.y - 24, COLORS.gold, 30 + Math.min(18, b.total / 10))
    const p = praise(word.length, b.total)
    if (p) this.floatAt(p, GAME_WIDTH / 2, 300, COLORS.espresso, 40, true, 1.6)
    if (gained > 0) {
      this.floatAt(`+${gained}s`, GAME_WIDTH / 2, 112, COLORS.green, 18)
      this.timerPulse = 1
    }
    this.shake = Math.min(1, b.total / 150)
    audio.score(b.total, word.length)

    // Flow rises after each word
    const prevFlow = this.flowLevel
    this.flowLevel = Math.min(FLOW_LEVELS.length - 1, this.flowLevel + 1)
    this.flowTimer = flowWindow(this.flowLevel)
    if (this.flowLevel > prevFlow && this.flowLevel >= 2) {
      this.floatAt(`Flow ×${FLOW_LEVELS[this.flowLevel]}`, 740, 88, COLORS.gold, 18, true)
    }

    if (this.hintStage < 99) {
      this.hintStage = 99
      save.stats.tutorialDone = true
      persist()
    }
    this.checkChapter()
    this.refreshWord()
  }

  private checkChapter(): void {
    let advanced = false
    while (this.score >= chapterThreshold(this.chapter)) {
      this.chapter++
      advanced = true
    }
    if (!advanced) return
    this.applyChapter(false)
    this.timeLeft = Math.min(MAX_TIME, this.timeLeft + 10)
    this.timerPulse = 1
    this.banner = {
      title: `Chapter ${toRoman(this.chapter)}`,
      sub: `${CHAPTER_SUBTITLES[(this.chapter - 1) % CHAPTER_SUBTITLES.length]} · +10s`,
      t: 0,
    }
    audio.play('chapter', 0.8)
    this.particles.fountain(GAME_WIDTH / 2, 330, 36)
  }

  // ── Grabbing ──

  private tryGrab(): boolean {
    const lane = this.board[this.cursor.lane]
    if (lane instanceof PowerLane) {
      const item = lane.find(this.cursor.x, GRAB_REACH)
      if (!item) return false
      this.collectPower(item, lane)
      return true
    }
    const ref = lane.findTile(this.cursor.x, GRAB_REACH)
    if (!ref) return false
    return this.grabTile(lane, ref.index)
  }

  private grabTile(lane: Lane, index: number): boolean {
    if (this.tray.full) {
      this.say('Tray is full — ink a word or remove a letter', true)
      audio.play('invalid', 0.5)
      this.tray.reject()
      return true
    }
    const pos = lane.tilePosition(index)
    const info = lane.tileInfo(index)
    if (!pos || !info) return false
    lane.take(index)
    this.tray.add(info.letter, info.kind, pos.x, pos.y, (pos.scale * lane.tileH) / TRAY.tileH)
    audio.grab(this.tray.length)
    this.particles.collectBurst('', pos.x, pos.y)
    this.laneFlash = 1
    this.grabBuffer = 0
    this.intent = null
    if (this.hintStage < 2) this.hintStage = 2
    this.refreshWord()
    return true
  }

  private collectPower(item: PowerItem, lane: PowerLane): void {
    item.taken = true
    const p = POWERS[item.kind]
    const y = lane.y
    this.particles.collectBurst('', item.x, y)
    this.intent = null
    this.grabBuffer = 0
    audio.play('chapter', 0.45, 1.25)
    switch (item.kind) {
      case 'time':
        this.timeLeft = Math.min(MAX_TIME, this.timeLeft + 8)
        this.timerPulse = 1
        this.floatAt('+8s', GAME_WIDTH / 2, 112, COLORS.green, 18)
        break
      case 'slow':
        this.slowTimer = 6
        break
      case 'flow':
        this.flowLevel = Math.min(FLOW_LEVELS.length - 1, this.flowLevel + 1)
        this.flowTimer = flowWindow(this.flowLevel)
        break
      case 'double':
        this.lensCharges = Math.min(2, this.lensCharges + 1)
        break
    }
    this.floatAt(`${p.name} · ${p.blurb}`, item.x, y - 26, p.color, 17, true)
    this.refreshWord()
  }

  private removeLast(): void {
    if (this.tray.length === 0) return
    this.tray.removeAt(this.tray.length - 1)
    audio.play('remove', 0.6)
    this.refreshWord()
  }

  private clearTray(): void {
    if (this.tray.length === 0) return
    this.tray.clear()
    audio.play('remove', 0.7, 0.85)
    this.refreshWord()
  }

  // ── Messages ──

  say(text: string, bad = false): void {
    this.toast = { text, t: 0, bad }
  }

  floatAt(text: string, x: number, y: number, color: string, size: number, italic = false, life = 1.1): void {
    this.floaters.push({ text, x, y, vy: -34, t: 0, life, color, size, italic })
  }

  // ── Input ──

  private onAction(a: Action, repeat: boolean): void {
    if (this.state === 'playing') {
      if (repeat && (a === 'up' || a === 'down' || a === 'grab' || a === 'submit')) return
      switch (a) {
        case 'up':
        case 'down':
          this.hop(a === 'up' ? -1 : 1)
          this.hopHeld = 0
          this.hopRepeat = 0
          break
        case 'grab':
          if (!this.tryGrab()) this.grabBuffer = 0.16
          break
        case 'submit':
          void this.submit()
          break
        case 'undo':
          this.removeLast()
          break
        case 'clear':
          this.clearTray()
          break
        case 'back':
        case 'pause':
          this.pause()
          break
      }
      return
    }
    if (this.state === 'countdown') {
      if (a === 'back' || a === 'pause') this.pause()
      return
    }
    if (this.state === 'ending') return
    // Menu screens
    if (a === 'back' || a === 'pause') {
      if (this.state === 'paused') {
        if (this.confirmQuit) {
          this.confirmQuit = false
          this.focus = 0
        } else this.resume()
      } else if (this.state === 'gameover') this.toTitle()
      return
    }
    const enabled = this.buttons.filter(b => b.enabled !== false)
    if (enabled.length === 0) return
    if (a === 'up' || a === 'left') {
      this.focus = (this.focus - 1 + enabled.length) % enabled.length
      this.hot = enabled[this.focus].id
      audio.play('menu', 0.45)
    } else if (a === 'down' || a === 'right') {
      this.focus = (this.focus + 1) % enabled.length
      this.hot = enabled[this.focus].id
      audio.play('menu', 0.45)
    } else if (a === 'submit' || a === 'grab') {
      if (repeat) return
      const b = enabled.find(x => x.id === this.hot) ?? enabled[0]
      this.press(b.id)
    }
  }

  private hop(delta: number): void {
    if (this.cursor.hop(delta)) {
      audio.move()
      this.intent = null
    }
  }

  private onPointerDown(p: PointerInfo): void {
    const b = this.buttons.find(x => x.enabled !== false && hitButton(x, p.x, p.y))
    if (b) {
      this.press(b.id)
      return
    }
    if (this.state !== 'playing') return
    const ti = this.tray.hitTile(p.x, p.y)
    if (ti >= 0) {
      this.tray.removeAt(ti)
      audio.play('remove', 0.6)
      this.refreshWord()
      return
    }
    const laneIdx = Math.floor((p.y - LANE_Y_START) / LANE_HEIGHT)
    if (laneIdx < 0 || laneIdx >= LANE_COUNT) return
    const lane = this.board[laneIdx]
    if (this.cursor.setLane(laneIdx)) audio.move()
    this.cursor.targetX = p.x
    const reach = p.kind === 'touch' ? 30 : 22
    if (lane instanceof Lane) {
      const ref = lane.findTile(p.x, reach)
      this.intent = ref ? { lane: laneIdx, tile: ref.index, power: null, t: 1.4 } : null
    } else {
      const item = lane.find(p.x, reach)
      this.intent = item ? { lane: laneIdx, tile: null, power: item, t: 1.4 } : null
    }
  }

  private onPointerMove(p: PointerInfo): void {
    const b = this.buttons.find(x => x.enabled !== false && hitButton(x, p.x, p.y))
    const id = b?.id ?? null
    if (id !== this.hot) {
      if (id && this.state !== 'playing') audio.play('menu', 0.3)
      if (id || this.state === 'playing') this.hot = id
      if (b) this.focus = Math.max(0, this.buttons.filter(x => x.enabled !== false).indexOf(b))
    }
    this.tray.hoverIndex = this.state === 'playing' ? this.tray.hitTile(p.x, p.y) : -1
    this.canvas.style.cursor = b || this.tray.hoverIndex >= 0 ? 'pointer' : 'default'
  }

  private press(id: string): void {
    switch (id) {
      case 'play': this.start('classic'); break
      case 'daily': this.start('daily'); break
      case 'again': audio.play('restart', 0.7); this.start(this.mode); break
      case 'menu': this.toTitle(); break
      case 'resume': this.resume(); break
      case 'restart': audio.play('restart', 0.7); this.start(this.mode); break
      case 'quit':
        if (this.confirmQuit) this.toTitle()
        else {
          this.confirmQuit = true
          audio.play('menu', 0.5)
        }
        break
      case 'cancel-quit': this.confirmQuit = false; this.focus = 0; break
      case 'music': audio.toggleMusic(); break
      case 'sfx': audio.toggleSfx(); audio.play('menu', 0.6); break
      case 'pause': this.pause(); break
      case 'ink': void this.submit(); break
      case 'undo': this.removeLast(); break
      case 'share': void this.share(); break
    }
  }

  private async share(): Promise<void> {
    const s = this.summary
    if (!s) return
    const best = s.bestWord ? `\nBest word: ${s.bestWord.word} (${s.bestWord.score})` : ''
    const title = s.mode === 'daily' ? `Lexicon Crossing · Daily Page ${s.date}` : 'Lexicon Crossing'
    const text = `${title}\n${s.score.toLocaleString()} pts · ${s.words} words · Chapter ${toRoman(s.chapter)}${best}`
    try {
      await navigator.clipboard.writeText(text)
      this.say('Result copied — share your page!')
      audio.play('camera', 0.6)
    } catch {
      this.say('Could not access the clipboard', true)
    }
  }

  // ── Update ──

  update(dt: number): void {
    this.time += dt
    audio.update(dt)
    this.particles.update(dt)
    this.updateFloaters(dt)
    this.shake = Math.max(0, this.shake - dt * 3)
    this.laneFlash = Math.max(0, this.laneFlash - dt * 4)
    this.timerPulse = Math.max(0, this.timerPulse - dt * 2)
    if (this.toast) {
      this.toast.t += dt
      if (this.toast.t > 2.2) this.toast = null
    }
    if (this.banner) {
      this.banner.t += dt
      if (this.banner.t > 2.6) this.banner = null
    }
    this.displayScore += (this.score - this.displayScore) * damp(8, dt)
    if (Math.abs(this.score - this.displayScore) < 0.5) this.displayScore = this.score

    switch (this.state) {
      case 'title':
      case 'gameover':
        this.updateBoard(dt, 0.55, false)
        break
      case 'paused':
        break
      case 'countdown':
        this.updateBoard(dt, 1, false)
        this.countdownTimer -= dt
        if (this.countdownTimer <= 0) {
          this.countdown--
          this.countdownTimer = 0.62
          audio.countdown(Math.max(0, this.countdown))
          if (this.countdown < 0) this.state = 'playing'
        }
        break
      case 'playing':
        this.updatePlaying(dt)
        break
      case 'ending':
        this.endingT += dt
        this.timeScale = Math.max(0, 1 - this.endingT / 1.2)
        this.updateBoard(dt, this.timeScale, false)
        this.tray.update(dt)
        if (this.endingT > 1.9) this.finish()
        break
    }
    this.buttons = this.layoutButtons()
    this.updateHint()
  }

  private updateBoard(dt: number, scale: number, withCursor: boolean): void {
    const cx = withCursor ? this.cursor.x : -999
    const cy = withCursor ? this.cursor.y : -999
    for (const lane of this.board) {
      if (lane instanceof Lane) lane.update(dt, scale, cx, cy)
      else lane.update(dt, scale)
    }
  }

  private updatePlaying(dt: number): void {
    this.elapsed += dt

    // Timer
    this.timeLeft -= dt
    const sec = Math.ceil(this.timeLeft)
    if (sec !== this.lastSecond) {
      if (sec === 10) audio.play('warn1', 0.7)
      else if (sec <= 5 && sec > 0) audio.chime(sec === 1 ? 660 : 880, 0.09, 0.2)
      this.lastSecond = sec
    }
    if (this.timeLeft <= 0) {
      this.timeLeft = 0
      this.state = 'ending'
      this.endingT = 0
      this.intent = null
      this.cursor.vx = 0
      audio.play('warn2', 0.8)
      audio.stopAmbience()
      return
    }

    // Flow decay
    if (this.flowLevel > 0) {
      this.flowTimer -= dt
      if (this.flowTimer <= 0) {
        this.flowLevel--
        this.flowTimer = this.flowLevel > 0 ? flowWindow(this.flowLevel) : 0
        this.refreshWord()
      }
    }

    // Power-ups
    this.slowTimer = Math.max(0, this.slowTimer - dt)
    const targetScale = this.slowTimer > 0 ? 0.45 : 1
    this.timeScale += (targetScale - this.timeScale) * damp(5, dt)
    this.powerTimer -= dt
    if (this.powerTimer <= 0) {
      this.spawnPower()
      this.powerTimer = 10 + this.powerRng() * 7
    }

    // Movement
    const axis = (this.input.isHeld('right') ? 1 : 0) - (this.input.isHeld('left') ? 1 : 0)
    const vertical = (this.input.isHeld('down') ? 1 : 0) - (this.input.isHeld('up') ? 1 : 0)
    if (vertical !== 0) {
      this.hopHeld += dt
      if (this.hopHeld > HOP_REPEAT_DELAY) {
        this.hopRepeat -= dt
        if (this.hopRepeat <= 0) {
          this.hop(vertical)
          this.hopRepeat = HOP_REPEAT_RATE
        }
      }
    } else {
      this.hopHeld = 0
    }

    // Pointer intent: chase the tapped tile and catch it.
    if (this.intent) {
      this.intent.t -= dt
      const lane = this.board[this.intent.lane]
      let tx: number | null = null
      if (lane instanceof Lane && this.intent.tile !== null) tx = lane.tilePosition(this.intent.tile)?.x ?? null
      else if (this.intent.power && !this.intent.power.taken) tx = this.intent.power.x
      if (tx === null || this.intent.t <= 0 || this.cursor.lane !== this.intent.lane) {
        this.intent = null
      } else {
        this.cursor.targetX = tx
        if (Math.abs(this.cursor.x - tx) < GRAB_REACH * 0.7) {
          if (lane instanceof Lane && this.intent.tile !== null) this.grabTile(lane, this.intent.tile)
          else if (lane instanceof PowerLane && this.intent.power) this.collectPower(this.intent.power, lane)
        }
      }
    }

    this.cursor.update(dt, axis)
    this.updateBoard(dt, this.timeScale, true)
    this.findTarget()

    if (this.grabBuffer > 0) {
      this.grabBuffer -= dt
      if (this.target) this.tryGrab()
    }

    this.tray.update(dt)
  }

  private spawnPower(): void {
    const r = this.powerRng()
    const kind: PowerKind = r < 0.36 ? 'time' : r < 0.6 ? 'slow' : r < 0.8 ? 'flow' : 'double'
    const lane = this.board[this.powerRng() < 0.5 ? 0 : LANE_COUNT - 1]
    if (lane instanceof PowerLane && lane.items.length < 2) lane.spawn(kind)
  }

  private findTarget(): void {
    const lane = this.board[this.cursor.lane]
    this.target = null
    if (lane instanceof Lane) {
      const ref = lane.findTile(this.cursor.x, GRAB_REACH)
      if (!ref) return
      const pos = lane.tilePosition(ref.index)
      const info = lane.tileInfo(ref.index)
      if (!pos || !info) return
      this.target = { x: pos.x, y: pos.y, scale: (pos.scale * lane.tileH) / 26, kind: info.kind, power: null }
    } else {
      const item = lane.find(this.cursor.x, GRAB_REACH)
      if (!item) return
      this.target = { x: item.x, y: lane.y, scale: 1.2, kind: null, power: item.kind }
    }
  }

  private updateFloaters(dt: number): void {
    for (const f of this.floaters) {
      f.t += dt
      f.y += f.vy * dt
      f.vy *= 1 - dt * 1.5
    }
    this.floaters = this.floaters.filter(f => f.t < f.life)
  }

  private updateHint(): void {
    if (this.state !== 'playing' || this.hintStage >= 99) {
      this.hint = ''
      return
    }
    const touch = this.input.lastDevice === 'touch'
    if (this.hintStage < 2) {
      if (this.target) this.hint = touch ? 'Tap a glowing tile to catch it' : 'Press Space to catch the tile'
      else this.hint = touch ? 'Tap a glowing tile to catch it' : 'Glide with ← → and hop lanes with ↑ ↓ onto a glowing tile'
      return
    }
    if (this.status === 'valid') this.hint = touch ? `Tap Ink to score “${this.resolvedWord}”` : `Press Enter to ink “${this.resolvedWord}”`
    else if (this.tray.length > 0) this.hint = touch ? 'Spell a word of 3+ letters · tap a tile in the tray to remove it' : 'Spell a word of 3+ letters · Backspace removes the last letter'
    else this.hint = 'Catch letters that spell a word'
  }

  private finish(): void {
    const stats = save.stats
    let best: WordRecord | null = null
    let longest = ''
    for (const w of this.words) {
      if (!best || w.score > best.score) best = { word: w.word, score: w.score }
      if (w.word.length > longest.length) longest = w.word
    }
    const newBest = this.score > stats.bestScore && this.score > 0
    stats.gamesPlayed++
    stats.wordsInked += this.words.length
    if (newBest) stats.bestScore = this.score
    if (best && (!stats.bestWord || best.score > stats.bestWord.score)) stats.bestWord = best
    if (longest.length > stats.longestWord.length) stats.longestWord = longest
    stats.bestChapter = Math.max(stats.bestChapter, this.chapter)
    const date = todayKey()
    let newDailyBest = false
    if (this.mode === 'daily') {
      const prev = save.daily?.date === date ? save.daily : null
      if (!prev || this.score > prev.score) {
        save.daily = { date, score: this.score, words: this.words.length, bestWord: best }
        newDailyBest = true
      }
    }
    persist()
    this.summary = {
      score: this.score,
      words: this.words.length,
      bestWord: best,
      longest,
      chapter: this.chapter,
      elapsed: this.elapsed,
      newBest,
      newDailyBest,
      mode: this.mode,
      date,
    }
    this.state = 'gameover'
    this.displayScore = 0
    this.focus = 0
    this.hot = null
    audio.applause(this.chapter)
    audio.setMusic('title')
    audio.play('pages2', 0.7)
    if (newBest) this.particles.fountain(225, 260, 40)
  }

  // ── Buttons per screen ──

  private layoutButtons(): Button[] {
    const b: Button[] = []
    if (this.state === 'title') {
      b.push({ id: 'play', x: 560, y: 346, w: 240, h: 46, label: 'Begin', icon: '', primary: true, hint: 'ENTER' })
      b.push({ id: 'daily', x: 560, y: 404, w: 240, h: 40, label: 'Daily Page', icon: '' })
      b.push({ id: 'music', x: 624, y: 462, w: 52, h: 36, label: '', icon: audio.musicOn ? '' : '' })
      b.push({ id: 'sfx', x: 684, y: 462, w: 52, h: 36, label: '', icon: audio.sfxOn ? '' : '' })
    } else if (this.state === 'paused') {
      if (this.confirmQuit) {
        b.push({ id: 'cancel-quit', x: 330, y: 330, w: 116, h: 42, label: 'Keep playing' })
        b.push({ id: 'quit', x: 456, y: 330, w: 116, h: 42, label: 'Quit', primary: true })
      } else {
        b.push({ id: 'resume', x: 350, y: 244, w: 200, h: 44, label: 'Resume', icon: '', primary: true })
        b.push({ id: 'restart', x: 350, y: 298, w: 200, h: 38, label: 'Restart' })
        b.push({ id: 'music', x: 350, y: 346, w: 96, h: 38, label: 'Music', icon: audio.musicOn ? '' : '' })
        b.push({ id: 'sfx', x: 454, y: 346, w: 96, h: 38, label: 'Sound', icon: audio.sfxOn ? '' : '' })
        b.push({ id: 'quit', x: 350, y: 394, w: 200, h: 38, label: 'Quit to title' })
      }
    } else if (this.state === 'gameover') {
      b.push({ id: 'again', x: 90, y: 516, w: 170, h: 46, label: 'Play again', primary: true, hint: 'ENTER' })
      if (this.summary?.mode === 'daily') b.push({ id: 'share', x: 270, y: 516, w: 110, h: 46, label: 'Share', icon: '' })
      b.push({ id: 'menu', x: this.summary?.mode === 'daily' ? 390 : 270, y: 516, w: this.summary?.mode === 'daily' ? 80 : 110, h: 46, label: 'Menu' })
    } else if (this.state === 'playing' || this.state === 'countdown') {
      b.push({ id: 'pause', x: 814, y: 30, w: 38, h: 34, label: '', icon: '' })
      if (this.state === 'playing') {
        b.push({ id: 'undo', x: 594, y: 572, w: 48, h: 34, label: '', icon: '', enabled: this.tray.length > 0 })
        b.push({ id: 'ink', x: 652, y: 572, w: 186, h: 34, label: 'Ink word', icon: '', primary: this.status === 'valid', enabled: this.tray.length > 0, hint: this.input.lastDevice === 'keyboard' ? 'ENTER' : undefined })
      }
    }
    // Keyboard focus follows `focus` on menu screens.
    if (this.state === 'title' || this.state === 'paused' || this.state === 'gameover') {
      const enabled = b.filter(x => x.enabled !== false)
      if (enabled.length) {
        this.focus = clamp(this.focus, 0, enabled.length - 1)
        if (this.input.lastDevice === 'keyboard' || !this.hot || !enabled.some(x => x.id === this.hot)) {
          this.hot = enabled[this.focus].id
        }
      }
    }
    return b
  }

  // ── Render ──

  render(): void {
    renderFrame(this, this.ctx)
  }

}

export const trayTexture = new Image()
