// ── Lexicon Crossing — Main Entry Point ──

import { Game } from './game/Game'

// Wait for fonts to load, then start
async function init(): Promise<void> {
  // Ensure the font is loaded before measuring text
  try {
    await document.fonts.ready
    // Explicitly load the fonts we need for Pretext measurements
    await Promise.all([
      document.fonts.load('300 16px "Cormorant Garamond"'),
      document.fonts.load('400 16px "Cormorant Garamond"'),
      document.fonts.load('500 16px "Cormorant Garamond"'),
      document.fonts.load('600 16px "Cormorant Garamond"'),
      document.fonts.load('700 16px "Cormorant Garamond"'),
      document.fonts.load('italic 300 16px "Cormorant Garamond"'),
      document.fonts.load('italic 400 16px "Cormorant Garamond"'),
      document.fonts.load('italic 500 16px "Cormorant Garamond"'),
      document.fonts.load('italic 700 16px "Cormorant Garamond"'),
    ])
  } catch (e) {
    console.warn('Font loading failed, using fallbacks:', e)
  }

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
  if (!canvas) throw new Error('Canvas not found')

  const game = new Game(canvas)

  // Responsive sizing
  function resize(): void {
    const container = document.getElementById('game-container')!
    const { width, height } = container.getBoundingClientRect()

    // Calculate scale to fit canvas in viewport while maintaining aspect ratio
    const hudHeight = 120 // approximate HUD + tray height
    const availableHeight = height - hudHeight
    const scale = Math.min(
      width / game.canvas.width,
      availableHeight / game.canvas.height,
      1.5, // max scale
    )

    canvas.style.width = `${game.canvas.width * scale}px`
    canvas.style.height = `${game.canvas.height * scale}px`
  }

  window.addEventListener('resize', resize)
  resize()

  // Game loop
  let lastTime = performance.now()

  function loop(now: number): void {
    const dt = Math.min((now - lastTime) / 1000, 0.05) // cap at 50ms
    lastTime = now

    game.update(dt)
    game.render()

    requestAnimationFrame(loop)
  }

  requestAnimationFrame(loop)
}

init().catch(console.error)
