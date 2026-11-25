// Renders the card-writing rules from the generate-card prompt into Markdown,
// so Claude in chat builds cards for import_source() by exactly the same rules
// as the app does through OpenRouter. The prompt stays the single source of
// truth: change it there, then re-run
//
//   node scripts/export-card-rules.mjs            → docs/card-rules-en.md
//   node scripts/export-card-rules.mjs sr         → docs/card-rules-sr.md
//
// and upload the file to the Claude skill again.

import { readFileSync, writeFileSync } from 'node:fs'

const lang = process.argv[2] ?? 'en'
const langName = { en: 'English', sr: 'Serbian' }[lang]
if (!langName) throw new Error(`unknown language: ${lang}`)

const src = readFileSync(new URL('../supabase/functions/generate-card/index.ts', import.meta.url), 'utf8')
const start = src.indexOf('const prompt = `')
const end = src.indexOf('`\n\n  console.log(`[generate-card]', start)
if (start < 0 || end < 0) throw new Error('prompt template not found in generate-card/index.ts')
const template = src.slice(start + 'const prompt = '.length, end + 1)

const render = new Function('word', 'langName', 'isSr', `return ${template}`)
const prompt = render('<the phrase>', langName, langName === 'Serbian')

const header = `# Card rules (${langName})

Generated from \`supabase/functions/generate-card/index.ts\` by \`scripts/export-card-rules.mjs\`.
Do not edit by hand — change the prompt and re-run the script.

## How to use this when importing a source

Each phrase passed to \`import_source\` is a card and follows the rules below exactly, as if
the phrase were the input word. Differences for import:

- Skip the JSON error answers (\`inappropriate\`, \`unknown_word\`): just do not pick such a phrase.
- \`patterns\`: 2–3 PHRASES, never sentences, per the rules below. The FIRST pattern is a
  fragment cut from the source sentence ("tend to <<reach for>> AI"), the others are your own.
- \`context\`: the full sentence from the source, cleaned of uh/um, with the phrase in
  <<double angle brackets>>. This is where the whole sentence goes — never into patterns.
- \`frequency\` is not stored for imported cards; still prefer common phrases.

---

`

const out = new URL(`../docs/card-rules-${lang}.md`, import.meta.url)
writeFileSync(out, header + prompt + '\n')
console.log(`wrote ${out.pathname}`)
