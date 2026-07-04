// Cheap client-side normalization before sending to AI.
// Heavy work (lemmatization, typo fixing) happens in the Edge Function;
// the model returns the final `word` that actually gets saved.

// Languages where lowercasing is safe (NOT German — nouns are capitalized there)
const LOWERCASE_LANGS = new Set(['en', 'sr'])

export function normalizeWord(raw, language) {
  if (!raw) return ''

  let w = raw
    .trim()
    .replace(/\s+/g, ' ') // collapse inner whitespace

  // Strip punctuation/symbols from the edges only.
  // Keeps internal hyphens (well-being) and apostrophes (it's).
  w = w.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '')

  if (LOWERCASE_LANGS.has(language)) {
    w = w.toLowerCase()
  }

  return w
}
