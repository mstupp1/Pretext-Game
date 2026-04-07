// ── Scoring — Scrabble-style word scoring ──

import { LETTER_VALUES, MultiplierType } from '../utils/constants'
import { resolveWordPattern } from '../utils/dictionary'

const MIN_LENGTH_BONUS_WORD_LENGTH = 3
const LENGTH_BONUS_BY_WORD_LENGTH: Record<number, number> = {
  3: 0,
  4: 2,
  5: 4,
  6: 7,
  7: 12,
  8: 18,
  9: 24,
  10: 30,
}

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
  wordMultiplier: number
  totalScore: number
  timeBonus: number
}

export interface ScoredLetter {
  letter: string
  value: number
  isBlank: boolean
  multiplierType: MultiplierType
  isShiny: boolean
  shinyBonus: number
}

export interface ScoreModifiers {
  baseWordBonus: number
  multiplierBonus: number
}

function roundScoreValue(value: number): number {
  return Math.round(value)
}

function roundMultiplierValue(value: number): number {
  return Math.round(value * 100) / 100
}

function getSubmittedWordPattern(letters: ScoredLetter[]): string {
  return letters.map(letter => letter.isBlank ? '?' : letter.letter).join('').toUpperCase()
}

export async function scoreWord(
  letters: ScoredLetter[],
  modifiers: ScoreModifiers = { baseWordBonus: 0, multiplierBonus: 0 },
  usedWords?: ReadonlySet<string>,
): Promise<ScoreResult> {
  const preview = getScorePreview(letters, modifiers)
  const { letterScore, lengthBonus, totalScore } = preview
  const submittedWord = getSubmittedWordPattern(letters)

  if (submittedWord.length < 3) {
    return {
      valid: false,
      word: submittedWord,
      letterScore: 0,
      lengthBonus: 0,
      totalScore: 0,
      message: 'Too short — 3 letters minimum',
    }
  }

  const resolved = await resolveWordPattern(submittedWord, usedWords)
  if (!resolved.word) {
    const hasBlank = letters.some(letter => letter.isBlank)
    return {
      valid: false,
      word: resolved.blockedWord ?? submittedWord,
      letterScore: 0,
      lengthBonus: 0,
      totalScore: 0,
      message: resolved.blockedWord
        ? `"${resolved.blockedWord}" already used this run`
        : hasBlank
          ? 'No lexicon match for that blank pattern'
          : `"${submittedWord}" — not in lexicon`,
    }
  }

  // Generate flavor message
  const messages = getFlavorMessage(resolved.word.length, totalScore)

  return {
    valid: true,
    word: resolved.word,
    letterScore,
    lengthBonus,
    totalScore,
    message: messages,
  }
}

export function getScorePreview(letters: ScoredLetter[], modifiers: ScoreModifiers = { baseWordBonus: 0, multiplierBonus: 0 }): ScorePreview {
  const word = getSubmittedWordPattern(letters)

  let letterScore = 0
  let wordMultiplier = 1
  for (const item of letters) {
    let val = item.value
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

  letterScore += modifiers.baseWordBonus
  const lengthBonus = getLengthBonusForWordLength(word.length)
  wordMultiplier = roundMultiplierValue(wordMultiplier + modifiers.multiplierBonus)

  return {
    word,
    letterScore,
    lengthBonus,
    wordMultiplier,
    totalScore: roundScoreValue((letterScore + lengthBonus) * wordMultiplier),
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

export function getLengthBonusForWordLength(length: number): number {
  if (length <= MIN_LENGTH_BONUS_WORD_LENGTH) return 0

  return LENGTH_BONUS_BY_WORD_LENGTH[Math.min(length, 10)] ?? 50
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
