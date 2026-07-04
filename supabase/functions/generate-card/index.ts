import { createClient } from 'npm:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LANG_NAMES: Record<string, string> = {
  sr: 'Serbian',
  en: 'English',
}

const FREE_CARD_LIMIT = 30

// OpenRouter model IDs
const MODELS: Record<string, string> = {
  haiku:  'anthropic/claude-haiku-4-5',
  gemini: 'openai/gpt-oss-120b:free',
}

async function generateWithOpenRouter(
  word: string,
  langName: string,
  modelKey: string,
): Promise<{ word: string; pos: string; definition: string; patterns: string[] }> {
  const modelId = MODELS[modelKey] ?? MODELS.haiku

  // Definition language: Serbian cards get English definitions; others use the card language.
  const defLang = langName === 'Serbian' ? 'English' : langName

  const prompt = `You are building a ${langName} vocabulary card for the input: "${word}".

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
  "definition": "1-2 sentence definition written in ${defLang}",
  "patterns": [
    "full natural sentence or phrase with the target word wrapped in [square brackets]",
    "another pattern with the word in a different grammatical form, also in [brackets]",
    "optional third pattern"
  ]
}

Rules:
- "word" is the cleaned headword, NOT the raw input
- definition must be written in ${defLang}
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

  console.log(`[generate-card] model=${modelKey} (${modelId}), word="${word}", lang=${langName}`)

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://chunks.runtheshow.dev',
      'X-Title': 'Chunks',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 512,
      temperature: 0.3,
      // json_object only for models that support it (Gemini); Haiku uses prompt-only
      ...(modelKey === 'gemini' ? { response_format: { type: 'json_object' } } : {}),
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

  // Extract the JSON object even if the model wrapped it in prose or code fences.
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

  if (!parsed.word || !parsed.pos || !parsed.definition || !Array.isArray(parsed.patterns)) {
    throw new Error(`Invalid card shape: ${JSON.stringify(parsed).slice(0, 200)}`)
  }
  return parsed
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { word, language, model = 'haiku' } = await req.json()

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

    if (userData?.plan === 'free') {
      const { count } = await supabase
        .from('cards')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('language', language)

      if ((count ?? 0) >= FREE_CARD_LIMIT) {
        return new Response(JSON.stringify({ error: 'card_limit_reached' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Generate card
    const langName = LANG_NAMES[language] ?? language
    const cardData = await generateWithOpenRouter(word, langName, model)
    // cardData.word is the model-cleaned headword (lemma + typo fix), used as final word
    const card = { model, ...cardData }

    return new Response(JSON.stringify(card), {
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
