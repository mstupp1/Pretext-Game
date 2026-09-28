// ── Lexicon Crossing — Constants ──

export const COLORS = {
  ivory: '#F5F1E8',
  cream: '#EDE8DC',
  parchment: '#E8E0D0',
  espresso: '#2C1810',
  sepia: '#5C4033',
  muted: '#8B7355',
  faint: '#B6A48F',
  gold: '#B8860B',
  goldLight: '#D4A843',
  goldGlow: 'rgba(184, 134, 11, 0.35)',
  red: '#A8321E',
  green: '#3E7A2A',
  rule: 'rgba(44, 24, 16, 0.14)',
} as const

// Typography
export const FONTS = {
  display: '"Cormorant Garamond", "Palatino Linotype", Palatino, Georgia, serif',
  body: '"Cormorant", "Palatino Linotype", Palatino, Georgia, serif',
  icons: '"Font Awesome 7 Free"',
} as const

export const CANVAS_FONTS = {
  laneLight: (size: number) => `300 ${size}px ${FONTS.display}`,
  laneRegular: (size: number) => `${size}px ${FONTS.display}`,
  laneMedium: (size: number) => `500 ${size}px ${FONTS.display}`,
  laneBold: (size: number) => `700 ${size}px ${FONTS.display}`,
  laneItalic: (size: number) => `italic ${size}px ${FONTS.display}`,
  laneBoldItalic: (size: number) => `italic 700 ${size}px ${FONTS.display}`,
  title: (size: number) => `italic 300 ${size}px ${FONTS.display}`,
  ui: (size: number) => `500 ${size}px ${FONTS.display}`,
  uiBold: (size: number) => `700 ${size}px ${FONTS.display}`,
  caps: (size: number) => `600 ${size}px ${FONTS.display}`,
  icons: (size: number) => `900 ${size}px ${FONTS.icons}`,
} as const

// Logical canvas size (everything is laid out in this space and scaled crisply)
export const GAME_WIDTH = 900
export const GAME_HEIGHT = 640

// Board
export const LANE_COUNT = 9
export const LANE_HEIGHT = 44
export const LANE_Y_START = 118
export const MARGIN_LANES = [0, LANE_COUNT - 1] as const
export const BOARD_LEFT = 34
export const BOARD_RIGHT = GAME_WIDTH - 34

export function laneCenterY(lane: number): number {
  return LANE_Y_START + lane * LANE_HEIGHT + LANE_HEIGHT / 2
}

export function isMarginLane(lane: number): boolean {
  return lane === MARGIN_LANES[0] || lane === MARGIN_LANES[1]
}

// Rules
export const STARTING_TIME = 60
export const MAX_TIME = 99
export const MAX_TRAY = 10
export const MIN_WORD_LENGTH = 3
export const GRAB_REACH = 30

// Letter point values (Scrabble)
export const LETTER_VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1,
  J: 8, K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1,
  S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
}

export const ROMAN_NUMERALS = [
  'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX',
] as const

export function toRoman(n: number): string {
  return ROMAN_NUMERALS[n - 1] ?? String(n)
}

/** Score needed to *finish* chapter n (i.e. reach chapter n + 1). */
export function chapterThreshold(chapter: number): number {
  const table = [150, 400, 800, 1400, 2200, 3200, 4500, 6000, 8000, 10500]
  if (chapter <= table.length) return table[chapter - 1]
  return table[table.length - 1] + (chapter - table.length) * 3000
}

export const ICON = {
  hourglass: '',
  bookmark: '',
  feather: '',
  glass: '',
  pause: '',
  check: '',
  undo: '',
  music: '',
  volume: '',
  mute: '',
  calendar: '',
  play: '',
  share: '',
  crown: '',
  xmark: '',
} as const
