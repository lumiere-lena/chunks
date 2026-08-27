import { createClient } from 'npm:@supabase/supabase-js'
import { ensureAudio, MAX_TTS_CHARS } from '../_shared/audio.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Returns the pronunciation URL for a headword, synthesizing it on a cache miss.
// `generate-card` warms this in the background, so most calls are a cache hit;
// this endpoint exists for words added before pronunciations were a thing, and
// as a retry path when the background warm-up failed.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { word, language } = await req.json()

    if (!word || !language) {
      return json({ error: 'word and language are required' }, 400)
    }
    if (String(word).trim().length > MAX_TTS_CHARS) {
      return json({ error: 'word_too_long' }, 400)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return json({ error: 'Unauthorized' }, 401)

    // Same gate as card generation — audio is only ever needed for cards, and
    // free accounts cannot create those.
    const { data: userData } = await supabase
      .from('users')
      .select('plan')
      .eq('id', user.id)
      .single()

    if (!userData?.plan || userData.plan === 'free') {
      return json({ error: 'subscription_required' }, 403)
    }

    const url = await ensureAudio(word, language)
    return json({ url })
  } catch (err) {
    console.error('[speak]', err)
    return json({ error: 'Failed to generate audio' }, 500)
  }
})
