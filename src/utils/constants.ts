// ── Lexicon Crossing — Constants ──

// Colors
export const COLORS = {
  ivory:      '#F5F1E8',
  cream:      '#EDE8DC',
  parchment:  '#E8E0D0',
  espresso:   '#2C1810',
  sepia:      '#5C4033',
  muted:      '#8B7355',
  gold:       '#B8860B',
  goldLight:  '#D4A843',
  goldFaint:  'rgba(184, 134, 11, 0.15)',
  goldGlow:   'rgba(184, 134, 11, 0.35)',
  red:        '#8B2500',
  green:      '#2E5A1E',
  rule:       'rgba(44, 24, 16, 0.15)',
  shadow:     'rgba(92, 64, 51, 0.12)',
  // Multipliers
  dlLight:    '#A0C4FF', // Light Blue (adjusted to match theme)
  tlBlue:     '#4A90E2', // Standard Blue
  dwCoral:    '#FF9AA2', // Light Red / Coral (adjusted to match theme)
  twRed:      '#D00000', // Standard Red
} as const

export type MultiplierType = 'None' | 'DoubleLetter' | 'TripleLetter' | 'DoubleWord' | 'TripleWord';

// Typography
export const FONTS = {
  display: '"Cormorant Garamond", "Palatino Linotype", Palatino, Georgia, serif',
  body:    '"Cormorant", "Palatino Linotype", Palatino, Georgia, serif',
  ui:      '"Cormorant Garamond", Georgia, serif',
} as const

// Canvas font strings for Pretext (must match canvas font format)
export const CANVAS_FONTS = {
  laneLight:    (size: number) => `300 ${size}px ${FONTS.display}`,
  laneRegular:  (size: number) => `${size}px ${FONTS.display}`,
  laneMedium:   (size: number) => `500 ${size}px ${FONTS.display}`,
  laneBold:     (size: number) => `700 ${size}px ${FONTS.display}`,
  laneItalic:   (size: number) => `italic ${size}px ${FONTS.display}`,
  laneBoldItalic: (size: number) => `italic 700 ${size}px ${FONTS.display}`,
  title:        (size: number) => `italic 300 ${size}px ${FONTS.display}`,
  ui:           (size: number) => `${size}px ${FONTS.ui}`,
  uiSmallCaps:  (size: number) => `600 ${size}px ${FONTS.ui}`,
  icons:        (size: number) => `900 ${size}px "Font Awesome 6 Free"`,
} as const

// Game dimensions
export const GAME_WIDTH = 900
export const GAME_HEIGHT = 640

// Lane dimensions
export const LANE_COUNT = 9
export const LANE_HEIGHT = 44
export const LANE_Y_START = 122
export const SAFE_ZONE_INDICES = [0, LANE_COUNT - 1] // top and bottom safe zones

// Player
export const PLAYER_SIZE = 28
export const PLAYER_SPEED = 3.5

// Game settings
export const LEVEL_TIME = 90 // seconds
export const TIME_BONUS = 15 // seconds added for reaching far side
export const MAX_COLLECTED_LETTERS = 12
export const MIN_WORD_LENGTH = 3

// Letter point values (Scrabble-accurate)
export const LETTER_VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1,
  J: 8, K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1,
  S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
}

// Word length bonuses
export const WORD_LENGTH_BONUS: Record<number, number> = {
  3: 0, 4: 8, 5: 20, 6: 40, 7: 70, 8: 110, 9: 160, 10: 220,
}

// Ornamental characters for safe zones
export const ORNAMENTS = ['·', '—', '·', '—', '·', '—', '·'] as const
export const FLOURISHES = ['❧', '✦', '※', '❦', '⁂', '☙', '✿'] as const

// FontAwesome Unicode Icons for the academic/library theme
export const ICONS = [
  '\uf02d', // book
  '\uf518', // book-open
  '\uf02e', // bookmark
  '\uf5ad', // pen-nib
  '\uf56b', // feather-pointed
  '\uf70e', // scroll
  '\uf530', // glasses
  '\uf10d', // quote-left
  '\uf10e', // quote-right
  '\uf15c', // file-lines
  '\uf084', // key
  '\uf252', // hourglass
  '\uf304', // pen
  '\uf558', // book-atlas
  '\uf5b7', // signature
  '\uf5bf', // stamp
  '\uf0eb', // lightbulb
  '\uf002', // magnifying-glass
]

// Roman numerals for chapter display
export const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'] as const
