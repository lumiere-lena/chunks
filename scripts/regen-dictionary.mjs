#!/usr/bin/env node

// Regenerate all dictionary entries with the current Edge Function prompt.
//
// Usage:
//   node scripts/regen-dictionary.mjs                # regenerate all languages
//   node scripts/regen-dictionary.mjs --lang sr       # only Serbian
//   node scripts/regen-dictionary.mjs --lang en       # only English
//
// Requires SUPABASE_URL, SUPABASE_ANON_KEY, and ADMIN_EMAIL/ADMIN_PASSWORD
// in .env.local (or environment).

import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env.local
const envPath = resolve(import.meta.dirname, '..', '.env.local')
const envLines = readFileSync(envPath, 'utf8').split('\n')
for (const line of envLines) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) process.env[match[1].trim()] ||= match[2].trim()
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
const EMAIL = process.env.ADMIN_EMAIL
const PASSWORD = process.env.ADMIN_PASSWORD

if (!SUPABASE_URL || !ANON_KEY || !EMAIL || !PASSWORD) {
  console.error('Missing env vars. Add to .env.local:')
  console.error('  ADMIN_EMAIL=your@email.com')
  console.error('  ADMIN_PASSWORD=yourpassword')
  process.exit(1)
}

const langFilter = process.argv.includes('--lang')
  ? process.argv[process.argv.indexOf('--lang') + 1]
  : null

// Sign in
console.log(`Signing in as ${EMAIL}...`)
const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
})
if (!authRes.ok) {
  console.error('Auth failed:', await authRes.text())
  process.exit(1)
}
const { access_token } = await authRes.json()

// Fetch current dictionary
const dictUrl = langFilter
  ? `${SUPABASE_URL}/rest/v1/dictionary?language=eq.${langFilter}&select=word,language`
  : `${SUPABASE_URL}/rest/v1/dictionary?select=word,language`

const dictRes = await fetch(dictUrl, {
  headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${access_token}` },
})
const words = await dictRes.json()
console.log(`Found ${words.length} dictionary entries${langFilter ? ` (${langFilter})` : ''}`)

if (words.length === 0) {
  console.log('Nothing to regenerate.')
  process.exit(0)
}

// Clear dictionary
const delUrl = langFilter
  ? `${SUPABASE_URL}/rest/v1/dictionary?language=eq.${langFilter}`
  : `${SUPABASE_URL}/rest/v1/dictionary?id=gt.00000000-0000-0000-0000-000000000000`

await fetch(delUrl, {
  method: 'DELETE',
  headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${access_token}`, 'Prefer': 'return=minimal' },
})
console.log('Dictionary cleared.\n')

// Regenerate each word
let ok = 0, fail = 0
for (let i = 0; i < words.length; i++) {
  const { word, language } = words[i]
  process.stdout.write(`[${i + 1}/${words.length}] ${word} (${language})... `)

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-card`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${access_token}`,
      },
      body: JSON.stringify({ word, language }),
    })

    if (res.ok) {
      console.log('✅')
      ok++
    } else {
      const err = await res.text()
      console.log(`❌ ${res.status}: ${err.slice(0, 100)}`)
      fail++
    }
  } catch (e) {
    console.log(`❌ ${e.message}`)
    fail++
  }
}

console.log(`\nDone! ✅ ${ok} regenerated, ❌ ${fail} failed.`)
console.log('Now delete old cards in Library and re-add from Dictionary.')
