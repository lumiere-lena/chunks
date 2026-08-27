import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// Pronunciations live in a public Storage bucket under a key derived from the
// headword itself, so the URL can be computed here without asking the backend —
// the common case is a plain CDN fetch, no Edge Function involved.
// Must stay in sync with audioKey() in supabase/functions/_shared/audio.ts.
async function audioUrlFor(word, language) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${language}:${word.toLowerCase().trim()}`),
  )
  const hex = [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  const path = `${language}/${hex.slice(0, 24)}.mp3`
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/pronunciations/${path}`
}

// Words whose mp3 we already confirmed exists, so re-opening a card is instant.
const known = new Set()

async function synthesize(word, language) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/speak`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ word, language }),
      },
    )
    if (!res.ok) return null
    return (await res.json()).url ?? null
  } catch {
    return null
  }
}

/**
 * Speaker button that plays the pronunciation of a headword.
 *
 * `url` is the audio_url returned by generate-card — pass it when you have it
 * to skip the existence check entirely.
 */
export default function SpeakButton({ word, language, url, size = 18 }) {
  const [state, setState] = useState('idle') // idle | loading | playing | unavailable
  const audioRef = useRef(null)

  // The same button instance gets reused as the user moves between cards, so
  // reset the icon as soon as the headword changes rather than a render later.
  const id = `${language}:${word}`
  const [prevId, setPrevId] = useState(id)
  if (prevId !== id) {
    setPrevId(id)
    setState('idle')
  }

  // Resolve and preload the mp3 up front. This is what makes playback work on
  // iOS Safari: it only honours play() called synchronously inside a tap, so
  // the audio element has to be ready before the user touches anything.
  useEffect(() => {
    let alive = true
    audioRef.current = null

    async function preload() {
      let src = url
      if (!src) {
        src = await audioUrlFor(word, language)
        if (!known.has(src)) {
          // HEAD is a cheap CDN round-trip; a miss just means "not synthesized
          // yet", and we leave it to the tap so no credits are spent on a card
          // nobody asked to hear.
          try {
            const res = await fetch(src, { method: 'HEAD' })
            if (!res.ok) return
          } catch {
            return
          }
          known.add(src)
        }
      }
      if (!alive) return

      const audio = new Audio(src)
      audio.preload = 'auto'
      audio.addEventListener('ended', () => setState('idle'))
      audio.addEventListener('error', () => setState('unavailable'))
      audioRef.current = audio
    }

    preload()
    return () => {
      alive = false
      audioRef.current?.pause()
    }
  }, [word, language, url])

  async function handleClick() {
    if (state === 'loading') return

    const ready = audioRef.current
    if (ready) {
      ready.currentTime = 0
      setState('playing')
      // play() rejects if the browser blocks it — don't leave the icon stuck.
      ready.play().catch(() => setState('idle'))
      return
    }

    // Nothing preloaded: a card added before pronunciations existed, or a
    // failed synthesis. Generate it now.
    setState('loading')
    const src = await synthesize(word, language)
    if (!src) {
      setState('unavailable')
      return
    }
    known.add(src)
    const audio = new Audio(src)
    audio.addEventListener('ended', () => setState('idle'))
    audioRef.current = audio
    setState('playing')
    audio.play().catch(() => setState('idle'))
  }

  if (state === 'unavailable') return null

  const color = state === 'playing' ? 'var(--acc)' : 'var(--t3)'

  return (
    <button
      onClick={handleClick}
      aria-label={`Listen to ${word}`}
      style={{
        flexShrink: 0, background: 'none', border: 'none', padding: 6, margin: -6,
        cursor: 'pointer', color, display: 'flex', alignItems: 'center',
        justifyContent: 'center', transition: 'color 0.15s',
      }}
    >
      {state === 'loading' ? (
        <span style={{
          width: size, height: size, borderRadius: '50%',
          border: '2px solid var(--s2)', borderTopColor: 'var(--acc)',
          animation: 'spin 0.7s linear infinite',
        }} />
      ) : (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M15.5 8.5a5 5 0 0 1 0 7"/>
          <path d="M19 5a9 9 0 0 1 0 14"/>
        </svg>
      )}
    </button>
  )
}
