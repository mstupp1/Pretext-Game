// ── Scoring — Scrabble-style word scoring ──

import { LETTER_VALUES, WORD_LENGTH_BONUS } from '../utils/constants'
import { isValidWord } from '../utils/dictionary'

export interface ScoreResult {
  valid: boolean
  word: string
  letterScore: number
  lengthBonus: number
  totalScore: number
  message: string
}

export function scoreWord(letters: string[]): ScoreResult {
  const word = letters.join('').toUpperCase()

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

  if (!isValidWord(word)) {
    return {
      valid: false,
      word,
      letterScore: 0,
      lengthBonus: 0,
      totalScore: 0,
      message: `"${word}" — not in lexicon`,
    }
  }

  // Calculate letter scores
  let letterScore = 0
  for (const letter of word) {
    letterScore += LETTER_VALUES[letter] || 0
  }

  // Length bonus
  const lengthBonus = WORD_LENGTH_BONUS[Math.min(word.length, 10)] || 0

  const totalScore = letterScore + lengthBonus

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
