#!/usr/bin/env node

// Apply the data fixes from docs/card-quality.md (D1-D5).
//
// Dry run by default — prints the plan and changes nothing:
//   node scripts/fix-cards.mjs
//   node scripts/fix-cards.mjs --apply
//   node scripts/fix-cards.mjs --step regen --apply --email you@example.com
//
// Steps: replace (D1-D3), regen (D4-D5). Run `replace` first: it decides which
// headwords survive, and `regen` then rewrites their contents.
//
// Sign-in: --email or ADMIN_EMAIL from .env.local; the password is typed at
// the prompt (not echoed, not stored) unless ADMIN_PASSWORD is set.
//
// Deleting stale rows from the shared `dictionary` needs a service-role key,
// since that table only has a read policy. Put SUPABASE_SERVICE_ROLE_KEY in
// .env.local to enable it — without it your own cards are still fixed, only
// the cache keeps a few orphaned rows.

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createInterface } from 'readline'

const envPath = resolve(import.meta.dirname, '..', '.env.local')
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] ||= m[2].trim()
}

const URL_ = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const EMAIL = (process.argv.includes('--email')
  ? process.argv[process.argv.indexOf('--email') + 1]
  : null) ?? process.env.ADMIN_EMAIL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

const APPLY = process.argv.includes('--apply')
const STEP = process.argv.includes('--step')
  ? process.argv[process.argv.indexOf('--step') + 1]
  : null

if (!URL_ || !ANON) {
  console.error('Need VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}
if (!EMAIL) {
  console.error('Pass --email you@example.com, or set ADMIN_EMAIL in .env.local')
  process.exit(1)
}

// --------------------------------------------------------------- the fix list

// Headwords that must go. Each card is moved to `to`, keeping its review
// progress; `to: null` means the word was never real and the card is dropped.
const REPLACE = [
  { from: 'abiquated',            to: null,                     why: 'not a real word' },
  { from: 'inflate with',         to: 'inflate',                why: 'invented phrasal verb' },
  { from: 'an offsite',           to: 'offsite',                why: 'article in the headword' },
  { from: 'taming',               to: 'tame',                   why: 'gerund instead of infinitive' },
  { from: 'in the verge of tears',to: 'on the verge of tears',  why: 'wrong preposition' },
  { from: 'offhanded statement',  to: 'offhand statement',      why: 'non-standard form' },
  { from: 'pulling together',     to: 'pull together',          why: 'duplicate' },
  { from: 'keep spending on it',  to: 'keep spending on',       why: 'duplicate' },
  { from: 'deprecating',          to: 'self-deprecating',       why: 'only lives with self-' },
]

// Entries whose text was wrong even though the headword is fine — regenerated
// against the new prompt. Includes everything that was missing a translation.
const REGEN = [
  // Text was wrong under the old prompt.
  'abstain', 'stir', 'revel', 'grasp', 'wind up', 'haul', 'bid',
  'dead weight', 'prone to indecision', 'blown off the map', 'evenness',
  'wordsmith', 'hesitate',
  // Were missing a Russian translation.
  'determination', 'fallback', 'feeble', 'generic', 'grit', 'passion',
  'ransom', 'wimpy',
  // Renamed by fix-cards-apply.sql: the headword is right but the text still
  // describes the old one.
  'inflate', 'tame', 'on the verge of tears', 'offhand statement',
  'pull together', 'self-deprecating', 'keep spending on',
]

// ------------------------------------------------------------------- plumbing

async function askPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  process.stdout.write(`Password for ${EMAIL}: `)
  rl.output.write = () => {} // stop echoing what is typed
  const pw = await new Promise(res => rl.question('', a => { rl.close(); res(a) }))
  process.stdout.write('\n')
  return pw
}

const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: await askPassword() }),
})
if (!auth.ok) {
  console.error('Sign-in failed:', (await auth.text()).slice(0, 200))
  process.exit(1)
}
const { access_token, user } = await auth.json()
const USER_ID = user.id
console.log(`Signed in as ${EMAIL}\n`)

const userHeaders = { apikey: ANON, Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' }
const adminHeaders = SERVICE
  ? { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }
  : null

const rest = async (path, opts = {}) => {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: userHeaders, ...opts })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}

const q = encodeURIComponent

async function myCards(word) {
  return rest(`cards?select=*&user_id=eq.${USER_ID}&word=ilike.${q(word)}`)
}

// Ask the Edge Function for a fresh entry, bypassing the dictionary cache.
async function generate(word, language) {
  const res = await fetch(`${URL_}/functions/v1/generate-card`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` },
    body: JSON.stringify({ word, language, regenerate: true }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

const CARD_FIELDS = ['word', 'pos', 'definition', 'translation_ru', 'patterns', 'verb_forms']
const contentOf = (data) => Object.fromEntries(
  CARD_FIELDS.filter(f => data[f] !== undefined).map(f => [f, data[f]]))

let changed = 0
const log = (s) => console.log(`  ${s}`)

// ------------------------------------------------------- step: replace / merge

async function stepReplace() {
  console.log('=== Replacing and merging headwords ===\n')

  for (const { from, to, why } of REPLACE) {
    console.log(`${from} -> ${to ?? 'delete'}   (${why})`)
    const cards = await myCards(from)
    if (!cards.length) { log('no card, dictionary row only'); }

    if (!to) {
      for (const c of cards) {
        log(`deleting card ${c.id.slice(0, 8)} (reviews: ${c.review_count ?? 0})`)
        if (APPLY) {
          await rest(`reviews?card_id=eq.${c.id}`, { method: 'DELETE' })
          await rest(`cards?id=eq.${c.id}`, { method: 'DELETE' })
          changed++
        }
      }
      await dropDictionary(from)
      continue
    }

    // Make sure the replacement entry exists and is up to date.
    let fresh
    try {
      fresh = APPLY ? await generate(to, 'en') : { word: to }
      if (fresh.word && fresh.word.toLowerCase() !== to.toLowerCase()) {
        log(`WARN  model returned "${fresh.word}" instead of "${to}" — skipped, handle by hand`)
        continue
      }
    } catch (e) {
      log(`WARN  could not generate "${to}": ${e.message}`)
      continue
    }

    const targets = await myCards(to)

    for (const c of cards) {
      if (targets.length) {
        // Both cards exist: keep the target, carry over the better progress.
        const t = targets[0]
        const keep = {
          interval_days: Math.max(c.interval_days ?? 1, t.interval_days ?? 1),
          ease_factor: Math.max(c.ease_factor ?? 2.5, t.ease_factor ?? 2.5),
          review_count: (c.review_count ?? 0) + (t.review_count ?? 0),
          status: (c.status === 'mastered' || t.status === 'mastered') ? 'mastered'
                : (c.status === 'learning' || t.status === 'learning') ? 'learning' : 'new',
        }
        log(`merging into ${t.word}: reviews ${c.review_count ?? 0} + ${t.review_count ?? 0} → ${keep.review_count}`)
        if (APPLY) {
          await rest(`reviews?card_id=eq.${c.id}`, {
            method: 'PATCH', body: JSON.stringify({ card_id: t.id }),
          })
          await rest(`cards?id=eq.${t.id}`, {
            method: 'PATCH', body: JSON.stringify({ ...keep, ...contentOf(fresh) }),
          })
          await rest(`cards?id=eq.${c.id}`, { method: 'DELETE' })
          changed++
        }
      } else {
        // Only the wrong one exists: rename it in place, progress untouched.
        log(`renaming card, progress preserved (reviews: ${c.review_count ?? 0})`)
        if (APPLY) {
          await rest(`cards?id=eq.${c.id}`, {
            method: 'PATCH', body: JSON.stringify(contentOf(fresh)),
          })
          changed++
        }
      }
    }

    await dropDictionary(from)
  }
}

// The shared cache only has a read policy, so this needs the service role.
async function dropDictionary(word) {
  if (!adminHeaders) {
    log(`dictionary row "${word}" will remain — no SUPABASE_SERVICE_ROLE_KEY`)
    return
  }
  log(`deleting dictionary row "${word}"`)
  if (!APPLY) return
  await fetch(`${URL_}/rest/v1/dictionary?word=eq.${q(word)}&language=eq.en`, {
    method: 'DELETE', headers: { ...adminHeaders, Prefer: 'return=minimal' },
  })
  const left = await fetch(`${URL_}/rest/v1/dictionary?select=word&word=eq.${q(word)}&language=eq.en`,
    { headers: { apikey: ANON } }).then(r => r.json())
  if (left.length) log(`WARN  row "${word}" was not deleted — check the key`)
  else changed++
}

// ------------------------------------------------------------- step: regenerate

async function stepRegen() {
  console.log('\n=== Regenerating entry text ===\n')

  for (const word of REGEN) {
    process.stdout.write(`${word.padEnd(22)} `)
    if (!APPLY) { console.log('(dry run)'); continue }
    try {
      const fresh = await generate(word, 'en')
      if (fresh.error) { console.log(`WARN  ${fresh.error}`); continue }
      if (fresh.word.toLowerCase() !== word.toLowerCase()) {
        console.log(`WARN  headword changed to "${fresh.word}" — skipped`)
        continue
      }
      const cards = await myCards(word)
      for (const c of cards) {
        await rest(`cards?id=eq.${c.id}`, {
          method: 'PATCH', body: JSON.stringify(contentOf(fresh)),
        })
        changed++
      }
      console.log(`OK ${fresh.frequency ?? ''}${cards.length ? '' : ' (dictionary only)'}`)
    } catch (e) {
      console.log(`FAIL ${e.message}`)
    }
  }
}

// ------------------------------------------------------------------------ run

if (!APPLY) console.log('DRY RUN — nothing is changed. Add --apply.\n')
if (!SERVICE) console.log('SUPABASE_SERVICE_ROLE_KEY not set: dictionary rows will not be deleted.\n')

if (!STEP || STEP === 'replace') await stepReplace()
if (!STEP || STEP === 'regen') await stepRegen()

console.log(`\n${APPLY ? `Changes: ${changed}` : 'Dry run complete.'}`)
console.log('Next: node scripts/check-cards.mjs --lang en')
