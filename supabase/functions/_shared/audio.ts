// Pronunciation audio: synthesize a headword once, cache it in Storage, and
// remember the object key on the shared `dictionary` row so every user who adds
// the same word reuses the same mp3.

const BUCKET = 'pronunciations'

// Flash v2.5: half the credit cost per character of multilingual v2, and it
// covers both Serbian and English — one voice serves both languages.
const TTS_MODEL = 'eleven_flash_v2_5'

// A headword is a word or a short chunk. Anything longer is not something we
// should be paying ElevenLabs credits for.
export const MAX_TTS_CHARS = 60

const SUPABASE_URL = () => Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function serviceHeaders(extra: Record<string, string> = {}) {
  return {
    'apikey': SERVICE_KEY(),
    'Authorization': `Bearer ${SERVICE_KEY()}`,
    ...extra,
  }
}

export function publicAudioUrl(path: string) {
  return `${SUPABASE_URL()}/storage/v1/object/public/${BUCKET}/${path}`
}

// Object key derived from the headword itself, so it is stable across runs and
// safe for Serbian diacritics and multi-word chunks alike.
async function audioKey(word: string, language: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${language}:${word}`),
  )
  const hex = [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return `${language}/${hex.slice(0, 24)}.mp3`
}

async function synthesize(word: string, language: string): Promise<ArrayBuffer> {
  const voiceId = Deno.env.get('ELEVENLABS_VOICE_ID')
  if (!voiceId) throw new Error('ELEVENLABS_VOICE_ID is not set')

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': Deno.env.get('ELEVENLABS_API_KEY')!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: word,
        model_id: TTS_MODEL,
        // One voice covers both languages, so the language has to be stated
        // explicitly — otherwise "trebati" gets read with English phonetics.
        language_code: language,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 0.9 },
      }),
    },
  )

  if (!res.ok) {
    throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
  return res.arrayBuffer()
}

async function lookupAudioPath(word: string, language: string): Promise<string | null> {
  const url = `${SUPABASE_URL()}/rest/v1/dictionary` +
    `?word=eq.${encodeURIComponent(word)}&language=eq.${encodeURIComponent(language)}` +
    `&select=audio_path&limit=1`
  try {
    const res = await fetch(url, { headers: serviceHeaders() })
    if (!res.ok) return null
    const rows = await res.json()
    return rows?.[0]?.audio_path ?? null
  } catch {
    return null
  }
}

// Best-effort: the dictionary row may not exist yet (a word can be spoken
// before its card was ever generated). The mp3 is already in Storage either
// way, so a missed write only costs one extra HEAD next time.
async function saveAudioPath(word: string, language: string, path: string) {
  const url = `${SUPABASE_URL()}/rest/v1/dictionary` +
    `?word=eq.${encodeURIComponent(word)}&language=eq.${encodeURIComponent(language)}`
  try {
    await fetch(url, {
      method: 'PATCH',
      headers: serviceHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ audio_path: path }),
    })
  } catch (e) {
    console.error('[audio] failed to save audio_path:', e)
  }
}

async function objectExists(path: string): Promise<boolean> {
  try {
    const res = await fetch(publicAudioUrl(path), { method: 'HEAD' })
    return res.ok
  } catch {
    return false
  }
}

async function upload(path: string, bytes: ArrayBuffer) {
  const res = await fetch(`${SUPABASE_URL()}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: serviceHeaders({
      'Content-Type': 'audio/mpeg',
      'x-upsert': 'true',
      // The key is a hash of the text, so the bytes never change — let the
      // browser and CDN hold on to them.
      'Cache-Control': 'public, max-age=31536000, immutable',
    }),
    body: bytes,
  })
  if (!res.ok) {
    throw new Error(`Storage upload ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
}

// Returns the public mp3 URL, synthesizing it only on a genuine cache miss.
export async function ensureAudio(word: string, language: string): Promise<string> {
  const headword = word.toLowerCase().trim()
  if (!headword) throw new Error('empty word')
  if (headword.length > MAX_TTS_CHARS) {
    throw new Error(`word too long for TTS (${headword.length} chars)`)
  }

  const cachedPath = await lookupAudioPath(headword, language)
  if (cachedPath) return publicAudioUrl(cachedPath)

  const path = await audioKey(headword, language)

  // The mp3 may already be in Storage even when the dictionary row does not
  // point at it yet — an interrupted run, or a word spoken before its card
  // existed. Checking is far cheaper than burning ElevenLabs credits.
  if (await objectExists(path)) {
    await saveAudioPath(headword, language, path)
    return publicAudioUrl(path)
  }

  console.log(`[audio] synthesizing "${headword}" (${language})`)
  const bytes = await synthesize(headword, language)
  await upload(path, bytes)
  await saveAudioPath(headword, language, path)

  return publicAudioUrl(path)
}
