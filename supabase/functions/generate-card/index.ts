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
  gemini: 'google/gemini-2.5-flash',
}

async function generateWithOpenRouter(
  word: string,
  langName: string,
  modelKey: string,
): Promise<{ pos: string; definition: string; patterns: string[] }> {
  const modelId = MODELS[modelKey] ?? MODELS.haiku

  const prompt = `Create a vocabulary card for the ${langName} word or phrase: "${word}".

Return ONLY valid JSON with this exact shape, no other text:
{
  "pos": "part of speech, e.g. noun (m), verb, adjective",
  "definition": "1-2 sentence definition in ${langName} only, no translations",
  "patterns": [
    "usage pattern with _____ as placeholder for the word",
    "another pattern with _____",
    "optional third pattern with _____"
  ]
}

Rules:
- definition must be in ${langName} only
- patterns must use _____ (5 underscores) as placeholder
- 2-3 patterns showing real collocations and grammatical constructions`

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
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenRouter error ${res.status}: ${text}`)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Empty response from model')

  const parsed = JSON.parse(content)
  if (!parsed.pos || !parsed.definition || !Array.isArray(parsed.patterns)) {
    throw new Error('Invalid card shape from model')
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
    const card = { word, model, ...cardData }

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
