#!/usr/bin/env node

// Measure dictionary quality. Run this before and after any prompt change so
// the numbers in docs/card-quality.md stay comparable — rewriting the checks
// between runs makes the comparison meaningless.
//
// Usage:
//   node scripts/check-cards.mjs                    # all languages
//   node scripts/check-cards.mjs --lang en          # English only
//   node scripts/check-cards.mjs --md review.md     # also write a full review
//
// Only needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from .env.local:
// the dictionary table is world-readable.

import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(import.meta.dirname, '..', '.env.local')
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] ||= m[2].trim()
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

const arg = (name) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? null : process.argv[i + 1]
}
const langFilter = arg('--lang')
const mdPath = arg('--md')

// ---------------------------------------------------------------- fetch data

const url = `${SUPABASE_URL}/rest/v1/dictionary?select=word,language,pos,definition,translation_ru,patterns,verb_forms`
  + (langFilter ? `&language=eq.${langFilter}` : '')
  + '&order=language.asc,word.asc'

const entries = await (await fetch(url, { headers: { apikey: ANON_KEY } })).json()
if (!Array.isArray(entries)) {
  console.error('Unexpected response:', entries)
  process.exit(1)
}

// ------------------------------------------------------------ structural checks

const ARTICLES = /^(a|an|the)\s/i

function structural(e) {
  const out = []
  const w = (e.word || '').toLowerCase().trim()
  const def = e.definition || ''
  const pats = Array.isArray(e.patterns) ? e.patterns : []
  const single = !w.includes(' ')
  const pos = (e.pos || '').toLowerCase()

  if (!(e.translation_ru || '').trim()) out.push('no Russian translation')

  // The prompt forbids a single-word definition from reusing the headword's stem.
  if (single && w.length >= 5 && def.toLowerCase().includes(w.slice(0, 5))) {
    out.push('definition reuses the headword stem')
  }

  if (pats.length < 2) out.push(`too few patterns (${pats.length})`)
  // Patterns may be plain strings or, once idiom translations land, objects.
  if (pats.some(p => !String(typeof p === 'string' ? p : p.text ?? '').includes('<<'))) {
    out.push('pattern missing << >> markers')
  }

  // pos may be composite, e.g. "verb / noun".
  const isVerb = /\bverb\b|\bglagol\b/.test(pos)
  if (isVerb && !e.verb_forms) out.push('verb without forms')
  if (!isVerb && e.verb_forms) out.push('verb forms on a non-verb')

  if (ARTICLES.test(w)) out.push('article in the headword')
  if (def && def[0] !== def[0].toUpperCase()) out.push('definition starts lowercase')

  return out
}

// --------------------------------------------------------- duplicate headwords

function stem(w) {
  return w.toLowerCase().trim().replace(/\bit$/, '').trim()
    .split(/\s+/)
    .map(t => t.replace(/ing$/, '').replace(/e?d$/, ''))
    .join(' ')
}

const buckets = new Map()
for (const e of entries) {
  const k = `${e.language}:${stem(e.word)}`
  if (!buckets.has(k)) buckets.set(k, [])
  buckets.get(k).push(e.word)
}
const dupes = [...buckets.values()].filter(v => v.length > 1)

// ------------------------------------------------------------------- reporting

const found = entries.map(e => ({ e, notes: structural(e) })).filter(x => x.notes.length)
const dupeWords = new Set(dupes.flat())
const flagged = new Set([
  ...found.map(x => x.e.word),
  ...dupeWords,
])

const counts = new Map()
for (const { notes } of found) for (const n of notes) {
  const key = n.replace(/\(\d+\)/, '').trim()
  counts.set(key, (counts.get(key) || 0) + 1)
}

const pct = entries.length ? Math.round((flagged.size / entries.length) * 100) : 0

console.log(`\nEntries: ${entries.length}${langFilter ? ` (${langFilter})` : ''}`)
console.log(`With findings: ${flagged.size} (${pct}%)\n`)

if (dupes.length) {
  console.log(`Overlapping headwords (${dupes.length}):`)
  for (const d of dupes) console.log(`  ${d.join(' / ')}`)
  console.log()
}
if (counts.size) {
  console.log('Structural findings:')
  for (const [k, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${k}`)
  }
  console.log()
}

// Ready to paste into the history table in docs/card-quality.md
const today = new Date().toISOString().slice(0, 10)
console.log('Row for docs/card-quality.md:')
console.log(`| ${today} | ${langFilter ?? 'all'} | ${entries.length} | ${flagged.size} | ${pct}% |  |\n`)

if (mdPath) {
  const md = []
  md.push(`# Card review — ${today}\n`)
  md.push(`Entries: **${entries.length}**, with findings: **${flagged.size}** (${pct}%).\n`)
  if (dupes.length) md.push(`## Overlapping headwords\n\n${dupes.map(d => `- ${d.join(' / ')}`).join('\n')}\n`)
  if (found.length) {
    md.push('## Structural findings\n')
    md.push('| Word | Lang | Finding |')
    md.push('|---|---|---|')
    for (const { e, notes } of found) md.push(`| ${e.word} | ${e.language} | ${notes.join('; ')} |`)
    md.push('')
  }
  md.push('## All entries\n')
  for (const e of entries) {
    const mark = flagged.has(e.word) ? ' ⚠️' : ''
    md.push(`### ${e.word} · ${e.language}${mark}\n`)
    md.push(`**${e.pos}** — ${e.definition}\n`)
    md.push(`*${e.translation_ru || '_no translation_'}*\n`)
    for (const p of (e.patterns || [])) {
      const text = typeof p === 'string' ? p : p.text ?? ''
      md.push(`- ${text.replace(/<</g, '**').replace(/>>/g, '**')}`)
    }
    md.push('')
  }
  writeFileSync(mdPath, md.join('\n'))
  console.log(`Full report written to ${mdPath}`)
}
