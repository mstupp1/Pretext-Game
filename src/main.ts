// ── Lexicon Crossing — entry point ──

import '../index.css'
import '@fontsource/cormorant-garamond/latin-300.css'
import '@fontsource/cormorant-garamond/latin-300-italic.css'
import '@fontsource/cormorant-garamond/latin-400.css'
import '@fontsource/cormorant-garamond/latin-400-italic.css'
import '@fontsource/cormorant-garamond/latin-500.css'
import '@fontsource/cormorant-garamond/latin-600.css'
import '@fontsource/cormorant-garamond/latin-700.css'
import '@fontsource/cormorant-garamond/latin-700-italic.css'
import '@fortawesome/fontawesome-free/css/fontawesome.css'
import '@fortawesome/fontawesome-free/css/solid.css'
import trayTextureUrl from './assets/images/traytexture_1.webp'
import { Game, trayTexture } from './game/Game'
import { tileArt } from './game/Tiles'
import { view } from './core/view'
import { GAME_HEIGHT, GAME_WIDTH } from './utils/constants'

const MAX_BACKING_SCALE = 3
const MIN_BACKING_SCALE = 1

/** Upper bound on backing-store scale; lowered automatically on slow devices. */
let qualityCap = MAX_BACKING_SCALE

async function loadFonts(): Promise<void> {
  const faces = [
    '300 16px "Cormorant Garamond"', '400 16px "Cormorant Garamond"', '500 16px "Cormorant Garamond"',
    '600 16px "Cormorant Garamond"', '700 16px "Cormorant Garamond"', 'italic 300 16px "Cormorant Garamond"',
    'italic 400 16px "Cormorant Garamond"', 'italic 700 16px "Cormorant Garamond"', '900 16px "Font Awesome 7 Free"',
  ]
  const timeout = new Promise(resolve => setTimeout(resolve, 4000))
  try {
    await Promise.race([Promise.all(faces.map(f => document.fonts.load(f))), timeout])
  } catch (e) {
    console.warn('Font loading failed, using fallbacks:', e)
  }
}

async function init(): Promise<void> {
  await loadFonts()
  trayTexture.src = trayTextureUrl

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
  const wrapper = document.getElementById('game-wrapper') as HTMLElement
  const container = document.getElementById('game-container') as HTMLElement
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is not supported')

  const game = new Game(canvas, ctx)
  if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game

  function resize(): void {
    const { width, height } = container.getBoundingClientRect()
    const pad = Math.min(width, height) < 560 ? 4 : 20
    const scale = Math.min((width - pad * 2) / GAME_WIDTH, (height - pad * 2) / GAME_HEIGHT, 2.6)
    wrapper.style.transform = `scale(${scale})`
    // Render at the real on-screen resolution so text stays crisp at any zoom.
    const dpr = window.devicePixelRatio || 1
    const k = Math.min(qualityCap, Math.max(MIN_BACKING_SCALE, scale * dpr))
    view.k = k
    canvas.width = Math.round(GAME_WIDTH * k)
    canvas.height = Math.round(GAME_HEIGHT * k)
    tileArt.setResolution(k)
    // The rotate prompt covers the book on portrait phones — don't let the clock run behind it.
    if (window.matchMedia('(orientation: portrait) and (max-width: 700px)').matches) game.autoPause()
  }

  window.addEventListener('resize', resize)
  window.matchMedia?.('(resolution: 1dppx)').addEventListener?.('change', resize)
  resize()
  requestAnimationFrame(() => container.classList.add('is-visible'))

  // Adaptive resolution: if frames are consistently slow, render fewer pixels.
  let windowStart = 0
  let frames = 0
  let slowWindows = 0
  function adaptQuality(now: number): void {
    if (document.hidden) return
    if (windowStart === 0) windowStart = now
    frames++
    const elapsed = now - windowStart
    if (elapsed < 2000) return
    const fps = (frames * 1000) / elapsed
    windowStart = now
    frames = 0
    slowWindows = fps < 48 ? slowWindows + 1 : 0
    if (slowWindows >= 2 && view.k > MIN_BACKING_SCALE + 0.05) {
      qualityCap = Math.max(MIN_BACKING_SCALE, view.k * 0.8)
      slowWindows = 0
      resize()
    }
  }

  let last = performance.now()
  function frame(now: number): void {
    const dt = Math.max(0, Math.min((now - last) / 1000, 1 / 20))
    last = now
    game.update(dt)
    game.render()
    adaptQuality(now)
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

init().catch(err => {
  console.error(err)
  const el = document.getElementById('boot-error')
  if (el) el.hidden = false
})
