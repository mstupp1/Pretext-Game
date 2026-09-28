// ── AudioManager — low-latency SFX via Web Audio, streamed music with crossfades ──

import { save, persist } from '../core/storage'

type SfxName =
  | 'grab' | 'remove' | 'invalid' | 'move' | 'menu' | 'pages1' | 'pages2' | 'chapter'
  | 'score1' | 'score2' | 'score3' | 'warn1' | 'warn2' | 'count3' | 'count2' | 'count1' | 'go'
  | 'restart' | 'camera' | 'applause1' | 'applause2' | 'applause3' | 'applause4' | 'applause5'
  | 'ambience'

const SFX_FILES: Record<SfxName, string> = {
  grab: 'sfx/selectletter_1.wav',
  remove: 'sfx/backspace_1.wav',
  invalid: 'sfx/nosubmit_1.wav',
  move: 'sfx/movement_1.wav',
  menu: 'sfx/menus_1.wav',
  pages1: 'sfx/pages_1.wav',
  pages2: 'sfx/pages_2.wav',
  chapter: 'sfx/chapter_1.wav',
  score1: 'sfx/score_1.wav',
  score2: 'sfx/score_2.wav',
  score3: 'sfx/score_3.wav',
  warn1: 'sfx/timewarning_1.wav',
  warn2: 'sfx/timewarning_2.wav',
  count3: 'sfx/countdown_3.wav',
  count2: 'sfx/countdown_2.wav',
  count1: 'sfx/countdown_1.wav',
  go: 'sfx/countdown_go.wav',
  restart: 'sfx/restart_1.wav',
  camera: 'sfx/camera_1.wav',
  applause1: 'sfx/applause_1.wav',
  applause2: 'sfx/applause_2.wav',
  applause3: 'sfx/applause_3.wav',
  applause4: 'sfx/applause_4.wav',
  applause5: 'sfx/applause_5.wav',
  ambience: 'sfx/Ambiance_2.mp3',
}

const GAME_TRACKS = Array.from({ length: 10 }, (_, i) => `music/Game_${i + 1}.mp3`)
const MUSIC_VOLUME = 0.42
const FADE_RATE = 1.6 // volume units per second

type MusicMode = 'title' | 'game' | 'none'

export class AudioManager {
  private ctx: AudioContext | null = null
  private sfxGain: GainNode | null = null
  private ambienceGain: GainNode | null = null
  private ambienceSource: AudioBufferSourceNode | null = null
  private buffers = new Map<SfxName, AudioBuffer>()
  private loading = new Map<SfxName, Promise<AudioBuffer | null>>()
  private lastPlayed = new Map<SfxName, number>()

  private titleTrack: HTMLAudioElement
  private gameTrack: HTMLAudioElement | null = null
  private trackOrder: string[] = []
  private musicMode: MusicMode = 'none'
  private duck = 1
  private unlocked = false

  constructor() {
    this.titleTrack = this.createTrack('music/Title_1.mp3')
    this.titleTrack.loop = true
    this.shuffleTracks()

    const unlock = () => {
      this.unlock()
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
  }

  get musicOn(): boolean { return save.settings.music }
  get sfxOn(): boolean { return save.settings.sfx }

  toggleMusic(): boolean {
    save.settings.music = !save.settings.music
    persist()
    if (!save.settings.music) {
      this.titleTrack.pause()
      this.gameTrack?.pause()
    } else {
      this.setMusic(this.musicMode, true)
    }
    return save.settings.music
  }

  toggleSfx(): boolean {
    save.settings.sfx = !save.settings.sfx
    persist()
    if (this.sfxGain && this.ctx) this.sfxGain.gain.setTargetAtTime(save.settings.sfx ? 1 : 0, this.ctx.currentTime, 0.02)
    return save.settings.sfx
  }

  private unlock(): void {
    if (this.unlocked) return
    this.unlocked = true
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctor({ latencyHint: 'interactive' })
      this.sfxGain = this.ctx.createGain()
      this.sfxGain.gain.value = save.settings.sfx ? 1 : 0
      this.sfxGain.connect(this.ctx.destination)
      this.ambienceGain = this.ctx.createGain()
      this.ambienceGain.gain.value = 0
      this.ambienceGain.connect(this.sfxGain)
      void this.ctx.resume()
    } catch {
      this.ctx = null
    }
    // Warm the cache with the sounds used every few seconds.
    for (const name of ['grab', 'remove', 'invalid', 'move', 'menu', 'score1', 'score2', 'score3', 'count3', 'count2', 'count1', 'go', 'pages1'] as SfxName[]) {
      void this.load(name)
    }
    this.setMusic(this.musicMode, true)
  }

  private createTrack(path: string): HTMLAudioElement {
    const audio = new Audio(`${import.meta.env.BASE_URL}${path}`)
    audio.preload = 'none'
    audio.volume = 0
    return audio
  }

  private shuffleTracks(): void {
    this.trackOrder = [...GAME_TRACKS]
    for (let i = this.trackOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[this.trackOrder[i], this.trackOrder[j]] = [this.trackOrder[j], this.trackOrder[i]]
    }
  }

  private nextGameTrack(): HTMLAudioElement {
    if (this.trackOrder.length === 0) this.shuffleTracks()
    const track = this.createTrack(this.trackOrder.pop()!)
    track.addEventListener('ended', () => {
      if (this.gameTrack === track) {
        this.gameTrack = this.nextGameTrack()
        if (this.musicMode === 'game') this.safePlay(this.gameTrack)
      }
    })
    return track
  }

  private safePlay(audio: HTMLAudioElement): void {
    if (!this.unlocked || !save.settings.music) return
    audio.play().catch(() => undefined)
  }

  setMusic(mode: MusicMode, force = false): void {
    if (mode === this.musicMode && !force) return
    this.musicMode = mode
    if (mode === 'title') {
      this.safePlay(this.titleTrack)
    } else if (mode === 'game') {
      if (!this.gameTrack) this.gameTrack = this.nextGameTrack()
      this.safePlay(this.gameTrack)
    }
  }

  /** Lower music while paused / on overlays (0..1). */
  setDuck(amount: number): void {
    this.duck = amount
  }

  /** Called every frame: smooth music crossfades and ambience level. */
  update(dt: number): void {
    const step = FADE_RATE * dt * MUSIC_VOLUME
    const titleTarget = this.musicMode === 'title' ? MUSIC_VOLUME * this.duck : 0
    const gameTarget = this.musicMode === 'game' ? MUSIC_VOLUME * this.duck : 0
    this.fadeTrack(this.titleTrack, titleTarget, step)
    if (this.gameTrack) this.fadeTrack(this.gameTrack, gameTarget, step)
  }

  private fadeTrack(track: HTMLAudioElement, target: number, step: number): void {
    const v = track.volume
    if (Math.abs(v - target) > 0.0005) {
      track.volume = Math.min(1, Math.max(0, v < target ? Math.min(target, v + step) : Math.max(target, v - step)))
    }
    if (track.volume <= 0.001 && target === 0 && !track.paused) track.pause()
  }

  private load(name: SfxName): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(name)
    if (cached) return Promise.resolve(cached)
    const pending = this.loading.get(name)
    if (pending) return pending
    const ctx = this.ctx
    if (!ctx) return Promise.resolve(null)
    const promise = fetch(`${import.meta.env.BASE_URL}${SFX_FILES[name]}`)
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then(data => ctx.decodeAudioData(data))
      .then(buffer => {
        this.buffers.set(name, buffer)
        return buffer
      })
      .catch(() => null)
    this.loading.set(name, promise)
    return promise
  }

  play(name: SfxName, volume = 1, rate = 1, minGapMs = 30): void {
    if (!this.ctx || !this.sfxGain || !save.settings.sfx) return
    const now = performance.now()
    if (now - (this.lastPlayed.get(name) ?? -1e9) < minGapMs) return
    this.lastPlayed.set(name, now)
    const buffer = this.buffers.get(name)
    if (!buffer) {
      void this.load(name)
      return
    }
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.playbackRate.value = rate
    const gain = this.ctx.createGain()
    gain.gain.value = volume
    src.connect(gain).connect(this.sfxGain)
    src.start()
  }

  /** A soft synthesized bell — used for score ticks and the final countdown. */
  chime(freq: number, volume = 0.12, duration = 0.35): void {
    if (!this.ctx || !this.sfxGain || !save.settings.sfx) return
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const osc2 = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sine'
    osc2.type = 'triangle'
    osc.frequency.value = freq
    osc2.frequency.value = freq * 2
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    const g2 = this.ctx.createGain()
    g2.gain.value = 0.25
    osc.connect(gain)
    osc2.connect(g2).connect(gain)
    gain.connect(this.sfxGain)
    osc.start(t)
    osc2.start(t)
    osc.stop(t + duration + 0.05)
    osc2.stop(t + duration + 0.05)
  }

  // ── Semantic helpers ──

  grab(trayLength: number): void {
    // Each successive letter rises a little in pitch — a satisfying build-up.
    this.play('grab', 0.75, 1 + Math.min(trayLength, 10) * 0.045, 0)
  }

  move(): void {
    this.play('move', 0.35, 0.95 + Math.random() * 0.1, 40)
  }

  score(total: number, letters: number): void {
    const name: SfxName = total >= 120 ? 'score3' : total >= 40 ? 'score2' : 'score1'
    this.play(name, 0.8)
    // Rising arpeggio, one note per letter.
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760]
    for (let i = 0; i < Math.min(letters, scale.length); i++) {
      window.setTimeout(() => this.chime(scale[i], 0.07, 0.3), i * 55)
    }
  }

  countdown(value: number): void {
    const map: Record<number, SfxName> = { 3: 'count3', 2: 'count2', 1: 'count1', 0: 'go' }
    this.play(map[value] ?? 'go', 0.8)
  }

  applause(chapter: number): void {
    const idx = Math.max(1, Math.min(5, chapter))
    this.play(`applause${idx}` as SfxName, 0.7)
  }

  async startAmbience(): Promise<void> {
    if (!this.ctx || !this.ambienceGain) return
    const buffer = await this.load('ambience')
    if (!buffer || !this.ctx || !this.ambienceGain || this.ambienceSource) return
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    src.connect(this.ambienceGain)
    src.start()
    this.ambienceSource = src
    this.ambienceGain.gain.setTargetAtTime(0.16, this.ctx.currentTime, 0.8)
  }

  stopAmbience(): void {
    if (!this.ctx || !this.ambienceGain || !this.ambienceSource) return
    const src = this.ambienceSource
    this.ambienceSource = null
    this.ambienceGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4)
    window.setTimeout(() => src.stop(), 1600)
  }

  suspend(): void {
    void this.ctx?.suspend()
    this.titleTrack.pause()
    this.gameTrack?.pause()
  }

  resume(): void {
    void this.ctx?.resume()
    this.setMusic(this.musicMode, true)
  }
}

export const audio = new AudioManager()
