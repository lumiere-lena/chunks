#!/usr/bin/env node

// Generate a fixed benchmark set of cards and compare it with the last run.
//
// The point is a regression signal for prompt changes. Every word below is a
// past failure from docs/card-quality.md, so if a prompt edit brings an old
// shape back, the diff says which word and which shape. Snapshots are committed
// to git — that is the history, and it is why the whole dictionary does not
// have to be kept anywhere.
//
// Nothing is written to the shared dictionary: generation runs with dryRun, so
// the cache is neither read nor written and the benchmark cannot pollute it.
//
// Usage:
//   node scripts/bench-cards.mjs                       # run, save, diff vs last
//   node scripts/bench-cards.mjs --lang en             # English only
//   node scripts/bench-cards.mjs --only tame,grasp     # just these inputs
//   node scripts/bench-cards.mjs --no-save             # look, do not record
//   node scripts/bench-cards.mjs --against bench/2026-08-31T09-12.json
//
// Sign-in (generate-card needs a signed-in paid account), either:
//   --token <token>   a session token copied from the browser
//   ADMIN_EMAIL + ADMIN_PASSWORD in .env.local
//
// Caveat worth remembering: the model runs at temperature 0.3, so wording
// drifts between runs on its own. Read the diff for the shape of a change —
// a finding gained or lost, a headword moving — not for every reworded clause.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs'
import { resolve, join } from 'path'
import { execSync } from 'child_process'
import { structural, patternText } from './lib/card-checks.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const BENCH_DIR = join(ROOT, 'bench')

for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] ||= m[2].trim()
}

// ------------------------------------------------------------- the word list

// `why` is the failure this word guards against — keep it, it is what makes a
// diff readable a month later. `expect: 'unknown_word'` means the card must NOT
// be generated at all.
const WORDS = [
  // Definitions that restate their own headword.
  { input: 'tame',        lang: 'en', why: 'restates headword; two roles; 4 letters' },
  { input: 'wordsmith',   lang: 'en', why: 'restates headword' },
  { input: 'fallback',    lang: 'en', why: 'restates headword' },
  { input: 'greatness',   lang: 'en', why: 'shares a stem with the definition' },

  // Two roles on one card.
  { input: 'grasp',       lang: 'en', why: 'verb / noun, definition must cover both' },
  { input: 'impact',      lang: 'en', why: 'verb / noun, definition must cover both' },

  // Definition that does not cover its own patterns.
  { input: 'abstain',     lang: 'en', why: 'definition narrower than the patterns' },
  { input: 'stir',        lang: 'en', why: 'two senses on one card' },
  { input: 'revel',       lang: 'en', why: 'must define "revel in sth", not partying' },
  { input: 'wind up',     lang: 'en', why: 'two unrelated senses' },

  // The idiom has to beat the literal use.
  { input: 'haul',        lang: 'en', why: 'long haul must appear in the patterns' },
  { input: 'dead weight', lang: 'en', why: 'unnatural collocations' },

  // Patterns drifting into whole sentences.
  { input: 'proliferate', lang: 'en', why: 'patterns must stay phrases' },

  // Honesty about how rare a word is.
  { input: 'evenness',    lang: 'en', why: 'must be flagged rare' },
  { input: 'bedraggled',  lang: 'en', why: 'must be flagged uncommon, not rare' },

  // Verb forms taken from the sense the card actually teaches.
  { input: 'bid',         lang: 'en', why: 'forms must match the sense in the patterns' },

  // Chunk headwords and their normalisation.
  { input: 'take into account',    lang: 'en', why: 'chunk kept whole, pos = phrase' },
  { input: 'in the verge of tears',lang: 'en', why: 'must normalise to "on the verge of tears"' },

  // Refusing to invent.
  { input: 'abiquated',   lang: 'en', why: 'not a real word', expect: 'unknown_word' },

  // Long headwords — these are the layout cases too.
  { input: 'commensurate',    lang: 'en', why: 'long headword, uncommon' },
  { input: 'self-deprecating',lang: 'en', why: 'long headword, only lives with self-' },

  // Serbian.
  { input: 'trebati',     lang: 'sr', why: 'infinitive headword, present-tense forms' },
  { input: 'ići',         lang: 'sr', why: 'irregular verb forms' },
  { input: 'kuća',        lang: 'sr', why: 'noun gender in pos' },
  { input: 'videti',      lang: 'sr', why: 'verb, must not become "vidim"' },
]

// ------------------------------------------------------------------ arguments

const arg = (name) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? null : process.argv[i + 1]
}
const langFilter = arg('--lang')
const onlyFilter = arg('--only')?.split(',').map(s => s.trim().toLowerCase())
const against = arg('--against')
const save = !process.argv.includes('--no-save')

const selected = WORDS
  .filter(w => !langFilter || w.lang === langFilter)
  .filter(w => !onlyFilter || onlyFilter.includes(w.input.toLowerCase()))

if (!selected.length) {
  console.error('No words selected.')
  process.exit(1)
}

// -------------------------------------------------------------------- sign in

const URL_ = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
if (!URL_ || !ANON) {
  console.error('Need VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

const TOKEN = arg('--token') ?? process.env.ADMIN_TOKEN
let accessToken = TOKEN

if (!accessToken) {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password) {
    console.error('Pass --token <session token from the browser>,')
    console.error('or put ADMIN_EMAIL and ADMIN_PASSWORD in .env.local.')
    process.exit(1)
  }
  const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!auth.ok) {
    console.error('Sign-in failed:', (await auth.text()).slice(0, 200))
    process.exit(1)
  }
  accessToken = (await auth.json()).access_token
}

// ----------------------------------------------------------------- generation

// dryRun keeps the shared dictionary out of this entirely: no cache read, no
// cache write. The benchmark must never change what the app serves.
async function generate(word, language) {
  const res = await fetch(`${URL_}/functions/v1/generate-card`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ word, language, dryRun: true }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { error: data.error ?? `http_${res.status}` }
  return data
}

const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim()
  } catch { return null }
})()

const entries = []
for (let i = 0; i < selected.length; i++) {
  const { input, lang, why, expect } = selected[i]
  process.stdout.write(`[${i + 1}/${selected.length}] ${input} (${lang})… `)

  const data = await generate(input, lang)
  const entry = {
    input, language: lang, why,
    ...(expect ? { expect } : {}),
    word: data.word ?? null,
    pos: data.pos ?? null,
    definition: data.definition ?? null,
    translation_ru: data.translation_ru ?? null,
    frequency: data.frequency ?? null,
    patterns: data.patterns ?? [],
    verb_forms: data.verb_forms ?? null,
    error: data.error ?? null,
  }

  // A word that must be refused is judged on the refusal, not on structure.
  if (expect) {
    entry.findings = entry.error === expect ? [] : [`expected ${expect}, got a card`]
  } else if (entry.error) {
    entry.findings = [`generation failed: ${entry.error}`]
  } else {
    entry.findings = structural(entry)
  }

  entries.push(entry)
  console.log(entry.findings.length ? `⚠️  ${entry.findings.join('; ')}` : '✅')
}

const snapshot = {
  generated_at: new Date().toISOString(),
  commit,
  lang: langFilter ?? 'all',
  entries,
}

// -------------------------------------------------------------------- the diff

function previousSnapshot() {
  if (against) return JSON.parse(readFileSync(resolve(ROOT, against), 'utf8'))
  if (!existsSync(BENCH_DIR)) return null
  const files = readdirSync(BENCH_DIR).filter(f => f.endsWith('.json')).sort()
  if (!files.length) return null
  return JSON.parse(readFileSync(join(BENCH_DIR, files[files.length - 1]), 'utf8'))
}

const short = (s, n = 90) => !s ? '—' : (s.length > n ? s.slice(0, n - 1) + '…' : s)
const patList = (e) => (e.patterns ?? []).map(patternText)

const prev = previousSnapshot()
console.log()

if (!prev) {
  console.log('No earlier snapshot — this run becomes the baseline.\n')
} else {
  const byInput = new Map(prev.entries.map(e => [`${e.language}:${e.input}`, e]))
  let changedWords = 0

  for (const e of entries) {
    const p = byInput.get(`${e.language}:${e.input}`)
    if (!p) { console.log(`+ ${e.input} (${e.language}) — new to the benchmark`); changedWords++; continue }

    const lines = []
    if (e.word !== p.word) lines.push(`  headword  ${p.word} → ${e.word}`)
    if (e.pos !== p.pos) lines.push(`  pos       ${p.pos} → ${e.pos}`)
    if (e.frequency !== p.frequency) lines.push(`  frequency ${p.frequency} → ${e.frequency}`)
    if (e.error !== p.error) lines.push(`  error     ${p.error ?? 'none'} → ${e.error ?? 'none'}`)
    if (e.definition !== p.definition) {
      lines.push(`  definition`)
      lines.push(`    - ${short(p.definition)}`)
      lines.push(`    + ${short(e.definition)}`)
    }
    const [now, before] = [patList(e), patList(p)]
    const gonePats = before.filter(x => !now.includes(x))
    const newPats = now.filter(x => !before.includes(x))
    if (gonePats.length || newPats.length) {
      lines.push(`  patterns`)
      for (const x of gonePats) lines.push(`    - ${x}`)
      for (const x of newPats) lines.push(`    + ${x}`)
    }

    // The signal that actually matters: a check that started or stopped firing.
    // A failed generation is excepted: its checks never ran, so reporting the
    // old findings as fixed would read as progress where there was none.
    const failed = e.error && !e.expect
    const goneFind = failed ? [] : p.findings.filter(x => !e.findings.includes(x))
    const newFind = e.findings.filter(x => !p.findings.includes(x))
    if (goneFind.length || newFind.length) {
      lines.push(`  findings`)
      for (const x of goneFind) lines.push(`    ✅ fixed:  ${x}`)
      for (const x of newFind) lines.push(`    ⚠️  new:    ${x}`)
    }

    if (lines.length) {
      changedWords++
      console.log(`~ ${e.input} (${e.language}) — ${e.why}`)
      console.log(lines.join('\n'))
      console.log()
    }
  }

  for (const p of prev.entries) {
    if (!entries.some(e => e.input === p.input && e.language === p.language)) {
      console.log(`- ${p.input} (${p.language}) — no longer in this run`)
    }
  }

  if (!changedWords) console.log('Nothing changed since the last snapshot.\n')
}

// ------------------------------------------------------------------- summary

const withFindings = entries.filter(e => e.findings.length)
const prevWith = prev ? prev.entries.filter(e => e.findings.length).length : null

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`
console.log(`\nBenchmark: ${plural(entries.length, 'word')}, ${withFindings.length} with findings`
  + (prevWith === null ? '' : ` (was ${prevWith})`))
if (prev) console.log(`Compared against ${prev.generated_at}${prev.commit ? ` @ ${prev.commit}` : ''}`)

if (withFindings.length) {
  console.log('\nStill flagged:')
  for (const e of withFindings) console.log(`  ${e.input.padEnd(22)} ${e.findings.join('; ')}`)
}

if (save) {
  mkdirSync(BENCH_DIR, { recursive: true })
  const name = snapshot.generated_at.slice(0, 16).replace(':', '-') + '.json'
  const path = join(BENCH_DIR, name)
  writeFileSync(path, JSON.stringify(snapshot, null, 2) + '\n')
  console.log(`\nSnapshot written to bench/${name} — commit it.`)
} else {
  console.log('\n--no-save: nothing recorded.')
}
