import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// Pronunciations live in a public Storage bucket under a key derived from the
// headword itself, so the URL can be computed here without asking the backend.
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

// Headwords played at least once this session, so revisiting a card skips
// straight to playback instead of probing for the file again.
const played = new Set()

// Ask the backend to synthesize. Costs ElevenLabs credits, so this only ever
// runs from a tap on a word that has no audio yet.
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
        // Without this the spinner can spin forever if the function stalls.
        signal: AbortSignal.timeout(45000),
      },
    )
    if (!res.ok) return null
    return (await res.json()).url ?? null
  } catch {
    return null
  }
}

/**
 * Speaker button that plays the pronunciation of a headword, synthesizing it
 * on the first tap if nobody has ever asked for this word before.
 */
export default function SpeakButton({ word, language, size = 18 }) {
  const [state, setState] = useState('idle') // idle | loading | playing | failed
  const audioRef = useRef(null)
  const urlRef = useRef(null)

  // Reset when the same button instance is reused for the next card.
  const id = `${language}:${word}`
  const [prevId, setPrevId] = useState(id)
  if (prevId !== id) {
    setPrevId(id)
    setState('idle')
  }

  // One audio element per card, with the URL resolved ahead of the tap. Hashing
  // is async, and iOS Safari only plays audio from a synchronous call inside a
  // tap handler — so the element has to be armed before the user touches it.
  useEffect(() => {
    let alive = true
    audioRef.current = null
    urlRef.current = null

    audioUrlFor(word, language).then(url => {
      if (!alive) return
      urlRef.current = url
      const audio = new Audio()
      audio.preload = 'none' // don't fetch until asked — most cards never are
      audio.src = url
      audio.addEventListener('ended', () => setState('idle'))
      audioRef.current = audio
    })

    return () => {
      alive = false
      audioRef.current?.pause()
    }
  }, [word, language])

  async function handleClick() {
    if (state === 'loading') return
    const audio = audioRef.current
    if (!audio) return

    audio.currentTime = 0
    setState('playing')

    // Play synchronously first. If the word has audio this just works, and on
    // iOS it is the only call that counts as user-initiated. If the file isn't
    // there yet the request 404s and we fall through to synthesizing it — by
    // which point this element is already unlocked, so the retry plays too.
    try {
      await audio.play()
      played.add(urlRef.current)
      return
    } catch {
      // play() also rejects for reasons that have nothing to do with a missing
      // file — an autoplay policy, an interrupted load. Only a set media error
      // means the source itself failed, and only that is worth spending an
      // ElevenLabs credit on.
      if (!audio.error || played.has(urlRef.current)) {
        setState('idle')
        return
      }
    }

    setState('loading')
    const url = await synthesize(word, language)
    if (!url) {
      setState('failed')
      return
    }
    played.add(url)
    audio.src = url
    setState('playing')
    audio.play().catch(() => setState('idle'))
  }

  // A failed word keeps its button — dimmed rather than hidden, so a retry is
  // still one tap away and a silent word never looks like a missing feature.
  const color = state === 'playing' ? 'var(--acc)' : 'var(--t3)'

  return (
    <button
      onClick={handleClick}
      aria-label={`Listen to ${word}`}
      title={state === 'failed' ? 'Could not load audio — tap to retry' : undefined}
      style={{
        flexShrink: 0, background: 'none', border: 'none', padding: 6, margin: -6,
        cursor: 'pointer', color, opacity: state === 'failed' ? 0.35 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'color 0.15s, opacity 0.15s',
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
