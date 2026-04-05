// ── Scoring — Scrabble-style word scoring ──

import { LETTER_VALUES, MultiplierType } from '../utils/constants'
import { checkWordValidity } from '../utils/dictionary'

export interface ScoreResult {
  valid: boolean
  word: string
  letterScore: number
  lengthBonus: number
  totalScore: number
  message: string
}

export interface ScorePreview {
  word: string
  letterScore: number
  lengthBonus: number
  totalScore: number
  timeBonus: number
}

export interface ScoredLetter {
  letter: string
  multiplierType: MultiplierType
}

export async function scoreWord(letters: ScoredLetter[]): Promise<ScoreResult> {
  const preview = getScorePreview(letters)
  const { word, letterScore, lengthBonus, totalScore } = preview

  if (word.length < 3) {
    return {
      valid: false,
      word,
      letterScore: 0,
      lengthBonus: 0,
      totalScore: 0,
      message: 'Too short — 3 letters minimum',
    }
  }

  const isValid = await checkWordValidity(word)
  if (!isValid) {
    return {
      valid: false,
      word,
      letterScore: 0,
      lengthBonus: 0,
      totalScore: 0,
      message: `"${word}" — not in lexicon`,
    }
  }

  // Generate flavor message
  const messages = getFlavorMessage(word.length, totalScore)

  return {
    valid: true,
    word,
    letterScore,
    lengthBonus,
    totalScore,
    message: messages,
  }
}

export function getScorePreview(letters: ScoredLetter[]): ScorePreview {
  const word = letters.map(l => l.letter).join('').toUpperCase()

  let letterScore = 0
  let wordMultiplier = 1
  for (const item of letters) {
    const letter = item.letter.toUpperCase()
    let val = LETTER_VALUES[letter] || 0
    if (item.multiplierType === 'DoubleLetter') {
      val *= 2
    } else if (item.multiplierType === 'TripleLetter') {
      val *= 3
    } else if (item.multiplierType === 'DoubleWord') {
      wordMultiplier *= 2
    } else if (item.multiplierType === 'TripleWord') {
      wordMultiplier *= 3
    }
    letterScore += val
  }

  const lengthBonus = 0

  return {
    word,
    letterScore,
    lengthBonus,
    totalScore: (letterScore * wordMultiplier) + lengthBonus,
    timeBonus: getTimeBonusForWordLength(word.length),
  }
}

export function getTimeBonusForWordLength(length: number): number {
  if (length >= 6) return 15
  if (length === 5) return 8
  if (length === 4) return 5
  if (length === 3) return 3
  return 0
}

function getFlavorMessage(length: number, score: number): string {
  if (length >= 8) return 'Magnificent!'
  if (length >= 7) return 'Extraordinary!'
  if (length >= 6) return 'Splendid!'
  if (length >= 5) return 'Well done!'
  if (score >= 15) return 'Excellent.'
  if (length >= 4) return 'Good word.'
  return 'Noted.'
}

export function getLetterValue(letter: string): number {
  return LETTER_VALUES[letter.toUpperCase()] || 0
}
