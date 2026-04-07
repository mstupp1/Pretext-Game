const MIN_WORD_LENGTH = 3
const MAX_WORD_LENGTH = 27
const TOTAL_WORD_COUNT = 173_016
const WILDCARD_CHAR = '?'
const COMMON_WORD_LENGTHS = [3, 4, 5, 6, 7, 8]
const WORD_LIST_LENGTHS = new Set([
  3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
  14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 27,
])

const WORD_BUCKETS = new Map<number, Set<string>>()
const WORD_BUCKET_LOADS = new Map<number, Promise<Set<string>>>()

function normalizeWord(word: string): string {
  return word.trim().toUpperCase()
}

function isAlphabeticWord(word: string): boolean {
  return /^[A-Z]+$/.test(word)
}

function isWordPattern(word: string): boolean {
  return /^[A-Z?]+$/.test(word)
}

function matchesWordPattern(candidate: string, pattern: string): boolean {
  if (candidate.length !== pattern.length) return false

  for (let i = 0; i < pattern.length; i++) {
    const patternChar = pattern[i]
    if (patternChar !== WILDCARD_CHAR && candidate[i] !== patternChar) {
      return false
    }
  }

  return true
}

function getWordListPath(length: number): string {
  return `${import.meta.env.BASE_URL}wordlists/${length}.txt`
}

async function loadWordBucket(length: number): Promise<Set<string>> {
  const cachedBucket = WORD_BUCKETS.get(length)
  if (cachedBucket) return cachedBucket

  const pendingLoad = WORD_BUCKET_LOADS.get(length)
  if (pendingLoad) return pendingLoad

  if (!WORD_LIST_LENGTHS.has(length)) {
    const emptyBucket = new Set<string>()
    WORD_BUCKETS.set(length, emptyBucket)
    return emptyBucket
  }

  const loadPromise = fetch(getWordListPath(length))
    .then(async response => {
      if (!response.ok) {
        console.error(`Failed to load word list for length ${length}: ${response.status}`)
        return new Set<string>()
      }

      const bucket = new Set<string>()
      const contents = await response.text()

      for (const entry of contents.split(/\r?\n/)) {
        const normalized = normalizeWord(entry)
        if (normalized.length === length && isAlphabeticWord(normalized)) {
          bucket.add(normalized)
        }
      }

      return bucket
    })
    .catch(error => {
      console.error(`Unable to load local word list for length ${length}:`, error)
      return new Set<string>()
    })
    .then(bucket => {
      WORD_BUCKETS.set(length, bucket)
      WORD_BUCKET_LOADS.delete(length)
      return bucket
    })

  WORD_BUCKET_LOADS.set(length, loadPromise)
  return loadPromise
}

function scheduleCommonWordListPreload(): void {
  if (typeof window === 'undefined') return

  const preload = () => {
    for (const length of COMMON_WORD_LENGTHS) {
      void loadWordBucket(length)
    }
  }

  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void) => number
  }

  if (idleWindow.requestIdleCallback) {
    idleWindow.requestIdleCallback(preload)
    return
  }

  globalThis.setTimeout(preload, 0)
}

scheduleCommonWordListPreload()

export async function checkWordValidity(word: string): Promise<boolean> {
  const resolution = await resolveWordPattern(word)
  return resolution.word !== null
}

export async function resolveWordPattern(
  word: string,
  excludedWords?: Iterable<string>,
): Promise<{ word: string | null; blockedWord: string | null }> {
  const normalized = normalizeWord(word)

  if (
    normalized.length < MIN_WORD_LENGTH ||
    normalized.length > MAX_WORD_LENGTH ||
    !isWordPattern(normalized)
  ) {
    return { word: null, blockedWord: null }
  }

  const excluded = excludedWords ? new Set(Array.from(excludedWords, normalizeWord)) : null
  const bucket = WORD_BUCKETS.get(normalized.length) ?? await loadWordBucket(normalized.length)

  if (!normalized.includes(WILDCARD_CHAR)) {
    if (!bucket.has(normalized)) {
      return { word: null, blockedWord: null }
    }

    if (excluded?.has(normalized)) {
      return { word: null, blockedWord: normalized }
    }

    return { word: normalized, blockedWord: null }
  }

  let blockedWord: string | null = null
  for (const candidate of bucket) {
    if (!matchesWordPattern(candidate, normalized)) continue
    if (excluded?.has(candidate)) {
      blockedWord = blockedWord ?? candidate
      continue
    }
    return { word: candidate, blockedWord }
  }

  return { word: null, blockedWord }
}

export function isValidWordLocal(word: string): boolean {
  const normalized = normalizeWord(word)
  const cachedBucket = WORD_BUCKETS.get(normalized.length)
  return cachedBucket?.has(normalized) ?? false
}

export function getWordCount(): number {
  return TOTAL_WORD_COUNT
}
