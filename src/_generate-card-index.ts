import { createClient } from 'npm:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LANG_NAMES: Record<string, string> = {
  sr: 'Serbian',
  en: 'English',
}

// Free users cannot generate cards at all

const MODEL_ID = 'google/gemini-2.5-flash'

async function generateWithOpenRouter(
  word: string,
  langName: string,
): Promise<{ word: string; pos: string; definition: string; patterns: string[]; verb_forms?: Record<string, string> }> {

  const defLang = langName === 'Serbian' ? 'English' : langName

  const prompt = `You are building a ${langName} vocabulary card for the input: "${word}".

CONTENT POLICY — check FIRST, before doing anything else:
If the input word is a slur, hate speech, a term primarily used to demean or dehumanize people
based on race, ethnicity, gender, sexuality, disability, or religion, then DO NOT generate a card.
Instead return ONLY this JSON: { "error": "inappropriate" }
Vulgar/colloquial words (damn, shit, ass, etc.) and words that have legitimate non-offensive uses are fine — only block hate speech and slurs.

First, determine the correct dictionary headword:
- Convert purely inflected forms to their base/lemma form (plural → singular, conjugated verb → infinitive).
  Examples: "dogs" → "dog", "running" → "run", "ran" → "run".
  For Serbian verbs ALWAYS use the infinitive ending in -ti or -ći: "treba" → "trebati", "idem" → "ići", "vidim" → "videti", "čitam" → "čitati".
  For Serbian nouns use the nominative singular: "kuće" → "kuća", "knjige" → "knjiga".
- Fix obvious spelling mistakes (e.g. "recieve" → "receive", "preavailing" → "prevailing").
- Keep deliberate fixed phrases as-is (e.g. "take into account").
- IMPORTANT: if an -ing or -ed form is an ESTABLISHED adjective with its own dictionary
  entry and meaning (e.g. "prevailing", "interesting", "amazing", "complicated"),
  KEEP that form and label it as an adjective — do NOT reduce it to the base verb.
  Only reduce -ing/-ed forms when they are plain verb inflections (e.g. "walking" → "walk").
- If a plural form has a distinct meaning of its own (e.g. "glasses" = spectacles), keep that form.
- The headword must be in ${langName}.

Return ONLY valid JSON with this exact shape, no other text:
{
  "word": "the corrected dictionary headword",
  "pos": "part of speech, e.g. noun (m), verb, adjective",
  "definition": "1-2 sentence definition in ${defLang}, direct meaning only — no meta-phrases like 'This term describes…' or 'It is a word that…'",
  "patterns": [
    "short phrase with the target word in <<double angle brackets>>",
    "another pattern with a different grammatical form in <<brackets>>",
    "optional third pattern"
  ],
  "verb_forms": null
}

VERB FORMS — only include if pos is "verb" (or starts with "verb"):
${langName === 'English'
  ? `For English verbs, set "verb_forms" to an object with three forms:
  { "v1": "base form", "v2": "past simple", "v3": "past participle" }
  Example for "run": { "v1": "run", "v2": "ran", "v3": "run" }
  Example for "take": { "v1": "take", "v2": "took", "v3": "taken" }`
  : `For Serbian verbs, set "verb_forms" to an object with two present-tense forms:
  { "1sg": "1st person singular present", "3pl": "3rd person plural present" }
  Example for "ići": { "1sg": "idem", "3pl": "idu" }
  Example for "čitati": { "1sg": "čitam", "3pl": "čitaju" }
  Example for "trebati": { "1sg": "trebam", "3pl": "trebaju" }`}
For non-verbs, set "verb_forms" to null.

Rules:
- "word" is the cleaned headword, NOT the raw input
- definition must be written in ${defLang}
- Write the definition directly — never start with meta-phrases like "This term describes", "This word refers to", "It is a word that", "A term used to". Jump straight to the meaning.
- the definition must NOT contain the headword or any word sharing its root/stem
  (e.g. for "greatness" do not use "great", "greatly"; for "decision" do not use "decide").
  Explain the meaning using different vocabulary — paraphrase instead.
- Each pattern must be a SHORT PHRASE or collocation (3-7 words), NOT a full sentence.
  Show the word in a typical grammatical context: with its common prepositions, collocates, or structures.
- Wrap ONLY the target word (in whatever grammatical form fits the context) in <<double angle brackets>>
  e.g. for "trebati": "meni <<treba>> pomoć", "<<trebam>> da učim", "ne <<treba>> da brineš"
  e.g. for "impact": "have a significant <<impact>> on", "make a lasting <<impact>>", "<<impacting>> communities"
  e.g. for "effort": "make a conscious <<effort>>", "combined <<efforts>>", "put in the <<effort>>"
- Use varied grammatical forms across patterns to show how the word actually behaves
- 2-3 patterns showing real collocations and grammatical constructions`

  console.log(`[generate-card] model=${MODEL_ID}, word="${word}", lang=${langName}`)

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://chunks.runtheshow.dev',
      'X-Title': 'Chunks',
    },
    body: JSON.stringify({
      model: MODEL_ID,
      max_tokens: 512,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`[generate-card] OpenRouter error ${res.status}: ${text}`)
    throw new Error(`OpenRouter error ${res.status}: ${text}`)
  }

  const data = await res.json()
  console.log(`[generate-card] response:`, JSON.stringify(data).slice(0, 500))

  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Empty response from model')

  console.log(`[generate-card] raw content:`, content)

  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`No JSON object in model output: ${content.slice(0, 200)}`)
  }
  const jsonStr = content.slice(start, end + 1)

  let parsed
  try {
    parsed = JSON.parse(jsonStr)
  } catch (e) {
    throw new Error(`JSON parse failed: ${(e as Error).message} — got: ${jsonStr.slice(0, 200)}`)
  }

  if (parsed.error === 'inappropriate') {
    return { error: 'inappropriate' } as any
  }

  if (!parsed.word || !parsed.pos || !parsed.definition || !Array.isArray(parsed.patterns)) {
    throw new Error(`Invalid card shape: ${JSON.stringify(parsed).slice(0, 200)}`)
  }

  const result: any = { word: parsed.word, pos: parsed.pos, definition: parsed.definition, patterns: parsed.patterns }
  if (parsed.verb_forms && typeof parsed.verb_forms === 'object') {
    result.verb_forms = parsed.verb_forms
  }
  return result
}

// Dictionary cache via REST API
async function dictLookup(word: string, language: string): Promise<any | null> {
  const url = `${Deno.env.get('SUPABASE_URL')}/rest/v1/dictionary?word=eq.${encodeURIComponent(word)}&language=eq.${encodeURIComponent(language)}&select=word,pos,definition,patterns,verb_forms,model&limit=1`
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
      },
    })
    if (!res.ok) return null
    const rows = await res.json()
    return rows?.[0] ?? null
  } catch {
    return null
  }
}

async function dictSave(entry: { word: string; language: string; pos: string; definition: string; patterns: string[]; verb_forms?: Record<string, string>; model: string }) {
  const url = `${Deno.env.get('SUPABASE_URL')}/rest/v1/dictionary`
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(entry),
    })
  } catch (e) {
    console.error('[generate-card] dict save error:', e)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { word, language } = await req.json()

    if (!word || !language) {
      return new Response(JSON.stringify({ error: 'word and language are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Auth check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Freemium check
    const { data: userData } = await supabase
      .from('users')
      .select('plan')
      .eq('id', user.id)
      .single()

    if (!userData?.plan || userData.plan === 'free') {
      return new Response(JSON.stringify({ error: 'subscription_required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const langName = LANG_NAMES[language] ?? language
    const wordLower = word.toLowerCase().trim()

    // Check dictionary cache
    const cached = await dictLookup(wordLower, language)
    if (cached) {
      console.log(`[generate-card] cache hit: "${wordLower}" (${language})`)
      return new Response(JSON.stringify({ ...cached, cached: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Cache miss — generate via AI
    const cardData = await generateWithOpenRouter(word, langName)

    if (cardData.error === 'inappropriate') {
      return new Response(JSON.stringify({ error: 'inappropriate' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Save to dictionary (fire-and-forget)
    const dictWord = cardData.word.toLowerCase().trim()
    const dictEntry: any = {
      word: dictWord,
      language,
      pos: cardData.pos,
      definition: cardData.definition,
      patterns: cardData.patterns,
      model: MODEL_ID,
    }
    if (cardData.verb_forms) {
      dictEntry.verb_forms = cardData.verb_forms
    }
    dictSave(dictEntry)
    console.log(`[generate-card] cached: "${dictWord}" (${language})`)

    return new Response(JSON.stringify(cardData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'Failed to generate card' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
