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
    const wrapper = document.getElementById('game-wrapper')!
    const { width, height } = container.getBoundingClientRect()

    // Calculate scale to fit the entire game within viewport, dynamically factoring in UI space
    const overlayTop = document.getElementById('overlay-top')!
    const wordTray = document.getElementById('word-tray')!

    const topHeight = overlayTop ? overlayTop.offsetHeight : 0
    const bottomHeight = wordTray ? wordTray.offsetHeight : 0

    // Add safe padding 
    const paddingX = 24
    const paddingY = 16

    const availableWidth = width - paddingX * 2
    const availableHeight = height - (topHeight + bottomHeight) - paddingY * 2

    // Maintain aspect ratio while zooming to fit
    const scale = Math.min(
      availableWidth / game.canvas.width,
      availableHeight / game.canvas.height,
      2.5, // increased max scale limits for larger screens
    )

    // Calculate vertical offset to center the canvas perfectly *between* the top and bottom UI arrays
    // Center of window is height / 2.
    // Center of available play area is topHeight + paddingY + availableHeight / 2.
    const centerOfPlayArea = topHeight + paddingY + (availableHeight / 2)
    const centerOfWindow = height / 2
    const yOffset = centerOfPlayArea - centerOfWindow

    // Apply scale and translation
    wrapper.style.transform = `translateY(${yOffset}px) scale(${scale})`

    // Dynamically match the inner UI containers to perfectly trace the canvas width
    const targetUIWidth = game.canvas.width * scale
    const uiContainers = document.querySelectorAll('.ui-container') as NodeListOf<HTMLElement>
    uiContainers.forEach(container => {
      container.style.maxWidth = `${targetUIWidth}px`
    })

    game.updateWordsUI()
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
