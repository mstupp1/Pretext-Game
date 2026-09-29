// ── Scoring — word values, bonuses, and the Flow combo ──

import { letterValue, type TileKind } from './Tiles'

export interface TrayLetter {
  letter: string // '' for an unfilled blank
  kind: TileKind
}

export interface ScoreBreakdown {
  letters: number
  lengthBonus: number
  wordMultiplier: number
  flow: number
  lens: number
  total: number
  timeBonus: number
}

const LENGTH_BONUS = [0, 0, 0, 0, 2, 5, 9, 14, 20, 27, 35]
const TIME_BONUS = [0, 0, 0, 2, 4, 6, 8, 11, 14, 16, 18]

export const FLOW_LEVELS = [1, 1.25, 1.5, 2, 2.5, 3]

/** Seconds a flow level lasts before it slips down a level. */
export function flowWindow(level: number): number {
  return Math.max(7, 13 - level * 1.2)
}

export function lengthBonus(length: number): number {
  return LENGTH_BONUS[Math.min(length, LENGTH_BONUS.length - 1)]
}

export function timeBonus(length: number): number {
  return TIME_BONUS[Math.min(length, TIME_BONUS.length - 1)]
}

export function scoreLetters(letters: TrayLetter[], flowLevel: number, lens: boolean): ScoreBreakdown {
  let sum = 0
  let wordMultiplier = 1
  for (const l of letters) {
    const v = l.kind === 'blank' ? 0 : letterValue(l.letter)
    if (l.kind === 'DL') sum += v * 2
    else if (l.kind === 'TL') sum += v * 3
    else sum += v
    if (l.kind === 'DW') wordMultiplier *= 2
    if (l.kind === 'TW') wordMultiplier *= 3
  }
  const bonus = lengthBonus(letters.length)
  const flow = FLOW_LEVELS[Math.min(flowLevel, FLOW_LEVELS.length - 1)]
  const lensMult = lens ? 2 : 1
  return {
    letters: sum,
    lengthBonus: bonus,
    wordMultiplier,
    flow,
    lens: lensMult,
    total: Math.round((sum + bonus) * wordMultiplier * flow * lensMult),
    timeBonus: timeBonus(letters.length),
  }
}

export function praise(length: number, total: number): string {
  if (length >= 9 || total >= 300) return 'Legendary!'
  if (length >= 8 || total >= 200) return 'Magnificent!'
  if (length >= 7 || total >= 120) return 'Extraordinary!'
  if (length >= 6 || total >= 70) return 'Splendid!'
  if (length >= 5 || total >= 35) return 'Well penned!'
  if (length >= 4) return 'Nice.'
  return ''
}
