// The structural checks, shared by check-cards.mjs (which runs them over the
// live dictionary) and bench-cards.mjs (which runs them over a fresh sample).
//
// Both scripts MUST use the same code. docs/card-quality.md compares numbers
// across weeks, and a check quietly rewritten in one place would make every
// earlier measurement incomparable without anyone noticing.

const ARTICLES = /^(a|an|the)\s/i
const SUBJECT_PRONOUN = /^\s*(i|you|he|she|it|we|they)\b/i

// Patterns may be plain strings or, once idiom translations land, objects.
export const patternText = (p) => String(typeof p === 'string' ? p : p?.text ?? '')

export function structural(e) {
  const out = []
  const w = (e.word || '').toLowerCase().trim()
  const def = e.definition || ''
  const pats = Array.isArray(e.patterns) ? e.patterns : []
  const single = !w.includes(' ')
  const pos = (e.pos || '').toLowerCase()

  if (!(e.translation_ru || '').trim()) out.push('no Russian translation')

  // The prompt forbids a single-word definition from reusing the headword's
  // stem. The stem has to start a word for this to count, or short headwords
  // match inside unrelated ones ("form" inside "information"). Anchoring it
  // that way is what lets the check run from 4 letters: at >= 5 it silently
  // skipped "tame", whose definition opened with "An animal that is tame...".
  if (single && w.length >= 4) {
    const stem = w.slice(0, 5).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`\\b${stem}`, 'i').test(def)) {
      out.push('definition reuses the headword stem')
    }
  }

  if (pats.length < 2) out.push(`too few patterns (${pats.length})`)
  if (pats.some(p => !patternText(p).includes('<<'))) {
    out.push('pattern missing << >> markers')
  }
  // Patterns must be phrases to slot into speech, not ready-made sentences.
  // A leading subject pronoun is the shape that keeps coming back.
  if (pats.some(p => SUBJECT_PRONOUN.test(patternText(p).replace(/<<|>>/g, '')))) {
    out.push('pattern reads as a sentence')
  }

  // pos may be composite, e.g. "verb / noun".
  const isVerb = /\bverb\b|\bglagol\b/.test(pos)
  if (isVerb && !e.verb_forms) out.push('verb without forms')
  if (!isVerb && e.verb_forms) out.push('verb forms on a non-verb')

  if (ARTICLES.test(w)) out.push('article in the headword')
  if (def && def[0] !== def[0].toUpperCase()) out.push('definition starts lowercase')

  return out
}

// Headwords that collapse onto each other once inflection is stripped.
export function stem(w) {
  return w.toLowerCase().trim().replace(/\bit$/, '').trim()
    .split(/\s+/)
    .map(t => t.replace(/ing$/, '').replace(/e?d$/, ''))
    .join(' ')
}
