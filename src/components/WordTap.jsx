import { useState, useRef, useCallback } from 'react'
import { normalizeWord } from '../lib/normalizeWord'
import { createCardFromWord } from '../lib/createCard'

// Words that are placeholders in usage patterns — never tappable.
const SKIP = new Set(['sth', 'sb', 'smn', 'sw', 'sms', 'sbs', 'one', 'ones'])

// Match a word: a letter followed by letters / marks / internal apostrophes-hyphens.
const WORD_RE = /[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu

function tokenize(text) {
  const out = []
  let last = 0
  for (const m of text.matchAll(WORD_RE)) {
    if (m.index > last) out.push({ t: 'sep', s: text.slice(last, m.index) })
    out.push({ t: 'word', s: m[0] })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ t: 'sep', s: text.slice(last) })
  return out
}

function wordStyle(selected) {
  return selected
    ? {
        color: 'var(--acc)', fontWeight: 800,
        background: 'color-mix(in oklch, var(--acc) 16%, transparent)',
        borderRadius: 5, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone',
      }
    : { cursor: 'pointer' }
}

// Plain text (definition) with tappable words.
export function TappableText({ text, idPrefix, selectedId, onWordTap, disabled }) {
  if (disabled || !text) return text
  return tokenize(text).map((tok, i) => {
    if (tok.t === 'sep' || SKIP.has(tok.s.toLowerCase())) return <span key={i}>{tok.s}</span>
    const id = `${idPrefix}:${i}`
    return (
      <span key={i} onClick={() => onWordTap(tok.s, id)} style={wordStyle(id === selectedId)}>
        {tok.s}
      </span>
    )
  })
}

// A usage pattern. Every non-target word is tappable. The target word (in <<>> or
// legacy _____) is never tappable: shown accent when `revealed`, as a blank otherwise.
export function TappablePattern({ pattern, word, idPrefix, selectedId, onWordTap, disabled, revealed = true }) {
  const hasMarkers = /<<[^>]+>>/.test(pattern)
  const parts = hasMarkers ? pattern.split(/<<([^>]+)>>/) : pattern.split(/(_____+)/)

  return parts.map((part, i) => {
    const isSlot = hasMarkers ? i % 2 === 1 : /^_____+$/.test(part)
    if (isSlot) {
      if (!revealed) {
        return (
          <span key={i} style={{
            display: 'inline-block', minWidth: 60,
            borderBottom: '2.5px solid var(--t2)', height: '0.85em',
            margin: '0 3px', verticalAlign: 'bottom', opacity: 0.35,
          }} />
        )
      }
      const display = hasMarkers ? part : word
      return <span key={i} style={{ color: 'var(--acc)', fontWeight: 800 }}>{display}</span>
    }
    return (
      <TappableText
        key={i}
        text={part}
        idPrefix={`${idPrefix}-${i}`}
        selectedId={selectedId}
        onWordTap={onWordTap}
        disabled={disabled}
      />
    )
  })
}

// Manages the tapped-word selection + inline card creation.
export function useWordTap({ language, userId, onCreated }) {
  const [selected, setSelected] = useState(null) // { word, id }
  const [phase, setPhase] = useState('confirm')   // 'confirm' | 'loading' | 'result'
  const [result, setResult] = useState(null)      // { status, word }
  const timer = useRef(null)

  const clear = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    setSelected(null)
    setPhase('confirm')
    setResult(null)
  }, [])

  const selectWord = useCallback((word, id) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    setResult(null)
    setPhase('confirm')
    setSelected({ word, id })
  }, [])

  const confirm = useCallback(async () => {
    if (!selected) return
    setPhase('loading')
    const norm = normalizeWord(selected.word, language)
    const res = await createCardFromWord({ word: norm, language, userId })
    setResult(res)
    setPhase('result')
    if (res.status === 'done' && onCreated) onCreated(res)
    timer.current = setTimeout(() => clear(), 2400)
  }, [selected, language, userId, onCreated, clear])

  return { selected, selectedId: selected?.id ?? null, phase, result, selectWord, confirm, clear }
}

const RESULT_UI = {
  done:          { icon: '✓', text: (w) => `Added: ${w}` },
  duplicate:     { icon: '📋', text: (w) => `Already in library: ${w}` },
  inappropriate: { icon: '🚫', text: () => `Can't add this word` },
  locked:        { icon: '🔒', text: () => `Subscription required` },
  error:         { icon: '⚠️', text: () => `Couldn't create card` },
}

// Fixed bottom action sheet, matching the app column width.
export function CreateCardBar({ selected, phase, result, onConfirm, onClose }) {
  if (!selected) return null

  return (
    <div style={{
      position: 'fixed', left: '50%', transform: 'translateX(-50%)',
      bottom: 0, width: '100%', maxWidth: 430, zIndex: 50,
      padding: '0 12px max(14px, env(safe-area-inset-bottom))',
      boxSizing: 'border-box', pointerEvents: 'none',
    }}>
      <div style={{
        pointerEvents: 'auto',
        background: 'var(--s1)', borderRadius: 16,
        border: '1.5px solid var(--border)',
        boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
        padding: '12px 12px 12px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        animation: 'fadeUp 0.18s ease',
      }}>
        {phase === 'confirm' && (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Create card
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--acc)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selected.word}
              </div>
            </div>
            <button onClick={onConfirm} style={{
              background: 'var(--acc)', color: 'white', border: 'none', borderRadius: 11,
              padding: '11px 18px', fontSize: 14.5, fontWeight: 700, fontFamily: 'inherit',
              cursor: 'pointer', flexShrink: 0,
            }}>
              Create
            </button>
            <button onClick={onClose} style={closeBtn}>
              <CloseIcon />
            </button>
          </>
        )}

        {phase === 'loading' && (
          <>
            <div style={{
              width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
              border: '2.5px solid var(--s2)', borderTopColor: 'var(--acc)',
              animation: 'spin 0.7s linear infinite',
            }} />
            <div style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Creating “{selected.word}”…
            </div>
          </>
        )}

        {phase === 'result' && result && (
          <>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{RESULT_UI[result.status].icon}</span>
            <div style={{ flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {RESULT_UI[result.status].text(result.word)}
            </div>
            <button onClick={onClose} style={closeBtn}>
              <CloseIcon />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

const closeBtn = {
  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)',
  padding: 6, display: 'flex', alignItems: 'center', flexShrink: 0,
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
