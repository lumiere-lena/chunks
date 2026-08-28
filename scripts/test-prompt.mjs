#!/usr/bin/env node

// Run the known failure cases from docs/card-quality.md through the current
// prompt and show what comes back. Uses dryRun, so nothing is written to the
// dictionary — safe to run as often as you like while tuning the prompt.
//
// Usage:
//   node scripts/test-prompt.mjs               # all cases
//   node scripts/test-prompt.mjs headword      # only the headword group
//   node scripts/test-prompt.mjs sense         # only the one-sense group
//
// Needs ADMIN_EMAIL and ADMIN_PASSWORD in .env.local, same as
// regen-dictionary.mjs — generate-card requires a signed-in paid account.

import { readFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(import.meta.dirname, '..', '.env.local')
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] ||= m[2].trim()
}

const { VITE_SUPABASE_URL: URL, VITE_SUPABASE_ANON_KEY: ANON,
        ADMIN_EMAIL: EMAIL, ADMIN_PASSWORD: PASSWORD } = process.env

if (!URL || !ANON || !EMAIL || !PASSWORD) {
  console.error('Missing env vars. .env.local needs:')
  console.error('  ADMIN_EMAIL=your@email.com')
  console.error('  ADMIN_PASSWORD=yourpassword')
  process.exit(1)
}

// `expect` is what the fix should produce; it is printed next to the actual
// result so a regression is obvious at a glance. `check` decides pass/fail.
const CASES = [
  // --- P1: refuse to invent -------------------------------------------------
  { group: 'headword', input: 'abiquated', lang: 'en', expect: 'unknown_word',
    check: r => r.error === 'unknown_word' },
  { group: 'headword', input: 'zorptastic', lang: 'en', expect: 'unknown_word',
    check: r => r.error === 'unknown_word' },
  { group: 'headword', input: 'recieve', lang: 'en', expect: 'receive (typo corrected)',
    check: r => r.word === 'receive' },

  // --- P2/P3/P4/P5: headword normalisation ----------------------------------
  { group: 'headword', input: 'an offsite', lang: 'en', expect: 'offsite',
    check: r => r.word === 'offsite' },
  { group: 'headword', input: 'taming', lang: 'en', expect: 'tame',
    check: r => r.word === 'tame' },
  { group: 'headword', input: 'interesting', lang: 'en', expect: 'interesting (must NOT reduce to interest)',
    check: r => r.word === 'interesting' },
  { group: 'headword', input: 'pulling together', lang: 'en', expect: 'pull together',
    check: r => r.word === 'pull together' },
  { group: 'headword', input: 'keep spending on it', lang: 'en', expect: 'keep spending on',
    check: r => r.word === 'keep spending on' },
  { group: 'headword', input: 'in the verge of tears', lang: 'en', expect: 'on the verge of tears',
    check: r => r.word === 'on the verge of tears' },
  { group: 'headword', input: 'offhanded statement', lang: 'en', expect: 'offhand statement',
    check: r => /^offhand /.test(r.word || '') },
  { group: 'headword', input: 'come up', lang: 'en', expect: 'come up (particle must NOT be stripped)',
    check: r => r.word === 'come up' },

  // --- P6/P7: one sense per card -------------------------------------------
  { group: 'sense', input: 'abstain', lang: 'en',
    expect: 'neutral definition that covers abstain from voting',
    check: r => !/enjoy|pleasur|harmful|unhealthy/i.test(r.definition || '') },
  { group: 'sense', input: 'stir', lang: 'en',
    expect: 'definition covers every pattern, not just stirring a liquid',
    check: r => coversPatterns(r) },
  { group: 'sense', input: 'revel', lang: 'en',
    expect: 'revel in sth = to take great pleasure in',
    check: r => /revel in|delight|pleasure|enjoy/i.test(r.definition || '') },
  { group: 'sense', input: 'wind up', lang: 'en',
    expect: 'one sense only, not conclude mixed with wind a clock',
    check: r => !(/meeting|finish|conclud|end\b/i.test(JSON.stringify(r.patterns))
               && /clock|watch|wound up/i.test(JSON.stringify(r.patterns))) },
  { group: 'sense', input: 'bid', lang: 'en',
    expect: 'forms match the sense the patterns teach',
    check: r => {
      const auction = /auction|bid on|contract|price/i.test(JSON.stringify(r.patterns))
      return !auction || r.verb_forms?.v2 === 'bid'
    } },

  // --- P8/P9/P10/P11: roles, frequency, naturalness -------------------------
  { group: 'quality', input: 'grasp', lang: 'en', expect: 'pos verb / noun, pattern a good grasp of',
    check: r => /\//.test(r.pos || '') },
  { group: 'quality', input: 'haul', lang: 'en', expect: 'long haul present among the patterns',
    check: r => /long haul/i.test(JSON.stringify(r.patterns)) },
  { group: 'quality', input: 'evenness', lang: 'en', expect: 'frequency: rare',
    check: r => r.frequency === 'rare' },
  { group: 'quality', input: 'effort', lang: 'en', expect: 'frequency: common',
    check: r => r.frequency === 'common' },
  { group: 'quality', input: 'deprecating', lang: 'en', expect: 'self-deprecating',
    check: r => /self-deprecating/.test(r.word || '') },
  { group: 'quality', input: 'hesitate', lang: 'en', expect: 'definition starts with a capital',
    check: r => r.definition && r.definition[0] === r.definition[0].toUpperCase() },

  // --- Serbian must not regress from the English-driven edits ---------------
  { group: 'sr', input: 'čitam', lang: 'sr', expect: 'čitati',
    check: r => r.word === 'čitati' },
  { group: 'sr', input: 'kuće', lang: 'sr', expect: 'kuća',
    check: r => r.word === 'kuća' },
]

// Every bracketed target word should be recognisable from the definition —
// a crude proxy for "the definition covers the patterns".
function coversPatterns(r) {
  const targets = (r.patterns || []).flatMap(p =>
    [...String(p).matchAll(/<<([^>]+)>>/g)].map(m => m[1].toLowerCase()))
  return targets.length > 0 && (r.definition || '').length > 40
}

const filter = process.argv[2]
const cases = filter ? CASES.filter(c => c.group === filter) : CASES

const auth = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
})
if (!auth.ok) {
  console.error('Auth failed:', await auth.text())
  process.exit(1)
}
const { access_token } = await auth.json()

let pass = 0, fail = 0
const failures = []

for (const c of cases) {
  process.stdout.write(`${c.input.padEnd(24)} `)
  let r
  try {
    const res = await fetch(`${URL}/functions/v1/generate-card`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` },
      body: JSON.stringify({ word: c.input, language: c.lang, dryRun: true }),
    })
    r = await res.json()
  } catch (e) {
    r = { error: e.message }
  }

  const ok = (() => { try { return c.check(r) } catch { return false } })()
  if (ok) { pass++; console.log('PASS') }
  else {
    fail++
    console.log(`FAIL  expected: ${c.expect}`)
    console.log(`   got: word="${r.word ?? ''}" pos="${r.pos ?? ''}" freq="${r.frequency ?? ''}"${r.error ? ` error="${r.error}"` : ''}`)
    if (r.definition) console.log(`   def: ${r.definition}`)
    if (r.patterns) console.log(`   pat: ${JSON.stringify(r.patterns)}`)
    failures.push(c.input)
  }
}

console.log(`\nPassed ${pass}, failed ${fail}`)
if (failures.length) console.log(`Failing: ${failures.join(', ')}`)
