// ── Lexicon Crossing — Constants ──

// Colors
export const COLORS = {
  ivory:      '#F5F1E8',
  cream:      '#EDE8DC',
  parchment:  '#E8E0D0',
  espresso:   '#2C1810',
  sepia:      '#5C4033',
  muted:      '#8B7355',
  safeZoneInk:'#B6A48F',
  gold:       '#B8860B',
  goldLight:  '#D4A843',
  goldFaint:  'rgba(184, 134, 11, 0.15)',
  goldGlow:   'rgba(184, 134, 11, 0.35)',
  shinyGold:  '#F0C96C',
  shinyGlow:  'rgba(240, 201, 108, 0.42)',
  shinyGlowSoft: 'rgba(240, 201, 108, 0.18)',
  tileGold:   '#DEA13D',
  tileGoldLight: '#E8B05E',
  tileGoldBorder: '#C9851F',
  tileGoldDepth: 'rgba(132, 74, 18, 0.42)',
  red:        '#8B2500',
  green:      '#2E5A1E',
  rule:       'rgba(44, 24, 16, 0.15)',
  shadow:     'rgba(92, 64, 51, 0.12)',
  // Multipliers
  dlLight:    '#5B9BD5', // Medium Blue (Double Letter)
  tlBlue:     '#22A699', // Greenish Blue (Triple Letter) - modified for better x3 distinction
  dwCoral:    '#E74C3C', // Medium Red (Double Word)
  twPurple:   '#8E44AD', // Purple (Triple Word) - modified for better x3 distinction
} as const

export const REGULAR_TILE_STYLE = {
  fill: COLORS.tileGold,
  fillRgb: [222, 161, 61] as const,
  border: COLORS.tileGoldBorder,
  borderRgb: [201, 133, 31] as const,
  depth: COLORS.tileGoldDepth,
  darkTextRgb: [110, 76, 34] as const,
  lightTextRgb: [245, 241, 232] as const,
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
export const PLAYER_GRID_STEP = LANE_HEIGHT
export const PLAYER_GRID_CENTER_X = GAME_WIDTH / 2
export const PLAYER_GRID_MAX_OFFSET = Math.floor(
  Math.min(
    PLAYER_GRID_CENTER_X - PLAYER_SIZE,
    GAME_WIDTH - PLAYER_GRID_CENTER_X - PLAYER_SIZE,
  ) / PLAYER_GRID_STEP,
)

export function getPlayerGridX(offsetFromCenter: number): number {
  return PLAYER_GRID_CENTER_X + offsetFromCenter * PLAYER_GRID_STEP
}

// Game settings
export const STARTING_TIME = 60 // seconds
export const LEVEL_TIME = 30 // seconds
export const TIME_BONUS = 15 // seconds added for reaching far side
export const MAX_COLLECTED_LETTERS = 12
export const MIN_WORD_LENGTH = 3

// Letter point values (Scrabble-accurate)
export const LETTER_VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1,
  J: 8, K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1,
  S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
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

// Points required to unlock each chapter
export const CHAPTER_POINTS = [100, 300, 750, 1200, 1800, 2500, 3500, 5000, 7000, 10000] as const
