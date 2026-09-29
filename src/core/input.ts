// ── Input — keyboard actions, held-key state, and pointer events in game space ──

import { GAME_HEIGHT, GAME_WIDTH } from '../utils/constants'

export type Action =
  | 'up' | 'down' | 'left' | 'right'
  | 'grab' | 'submit' | 'undo' | 'clear' | 'pause' | 'back'

const KEY_MAP: Record<string, Action> = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
  ' ': 'grab',
  Enter: 'submit',
  Backspace: 'undo',
  Delete: 'clear',
  Escape: 'back',
  p: 'pause', P: 'pause',
}

export type PointerKind = 'mouse' | 'touch' | 'pen'

export interface PointerInfo {
  x: number
  y: number
  kind: PointerKind
}

export class Input {
  private held = new Set<Action>()
  lastDevice: 'keyboard' | PointerKind = 'keyboard'
  pointer: PointerInfo | null = null

  onAction: (action: Action, repeat: boolean) => void = () => undefined
  onPointerDown: (p: PointerInfo) => void = () => undefined
  onPointerMove: (p: PointerInfo) => void = () => undefined

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', e => this.keyDown(e))
    window.addEventListener('keyup', e => {
      const action = KEY_MAP[e.key]
      if (action) this.held.delete(action)
    })
    window.addEventListener('blur', () => this.held.clear())

    canvas.addEventListener('pointerdown', e => {
      e.preventDefault()
      const p = this.toGame(e)
      this.lastDevice = p.kind
      this.pointer = p
      this.onPointerDown(p)
    })
    canvas.addEventListener('pointermove', e => {
      const p = this.toGame(e)
      this.pointer = p
      if (p.kind === 'mouse') this.onPointerMove(p)
    })
    canvas.addEventListener('pointerleave', () => {
      this.pointer = null
    })
    canvas.addEventListener('contextmenu', e => e.preventDefault())
  }

  isHeld(action: Action): boolean {
    return this.held.has(action)
  }

  clearHeld(): void {
    this.held.clear()
  }

  private keyDown(e: KeyboardEvent): void {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const action = KEY_MAP[e.key]
    if (!action) return
    e.preventDefault()
    this.lastDevice = 'keyboard'
    if (!e.repeat) this.held.add(action)
    this.onAction(action, e.repeat)
  }

  private toGame(e: PointerEvent): PointerInfo {
    const rect = this.canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * GAME_WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * GAME_HEIGHT,
      kind: (e.pointerType as PointerKind) || 'mouse',
    }
  }
}
