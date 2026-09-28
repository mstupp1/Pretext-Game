// ── Persistence (settings, records, daily results) ──
// localStorage can be unavailable (private mode, blocked storage) — every access is guarded.

export interface Settings {
  music: boolean
  sfx: boolean
}

export interface WordRecord {
  word: string
  score: number
}

export interface Stats {
  bestScore: number
  bestWord: WordRecord | null
  longestWord: string
  gamesPlayed: number
  wordsInked: number
  bestChapter: number
  tutorialDone: boolean
}

export interface DailyResult {
  date: string
  score: number
  words: number
  bestWord: WordRecord | null
}

const KEY = 'lexicon-crossing:v2'

interface SaveData {
  settings: Settings
  stats: Stats
  daily: DailyResult | null
}

function defaults(): SaveData {
  return {
    settings: { music: true, sfx: true },
    stats: {
      bestScore: 0,
      bestWord: null,
      longestWord: '',
      gamesPlayed: 0,
      wordsInked: 0,
      bestChapter: 1,
      tutorialDone: false,
    },
    daily: null,
  }
}

function load(): SaveData {
  const base = defaults()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Partial<SaveData>
    return {
      settings: { ...base.settings, ...parsed.settings },
      stats: { ...base.stats, ...parsed.stats },
      daily: parsed.daily ?? null,
    }
  } catch {
    return base
  }
}

export const save: SaveData = load()

export function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save))
  } catch {
    // Storage unavailable — progress simply isn't remembered.
  }
}
