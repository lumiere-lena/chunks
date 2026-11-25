import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { TappablePattern } from '../components/WordTap'
import SpeakButton from '../components/SpeakButton'

// One source (a video, a text, a speaking session): its phrases, then gap
// exercises from the original sentences, then in new contexts, then a box for
// my own sentences. Content is written by Claude through import_source(); this
// screen only reads it, marks phrases as known and logs attempts.

const KIND_LABEL = { youtube: 'Video', audio: 'Audio', text: 'Text', speaking: 'Speaking practice' }

// Case, spacing, apostrophe style and closing punctuation never make an answer wrong.
function normalizeAnswer(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,!?;:…"]+$/, '')
    .trim()
}

function hintFor(answer) {
  return answer.split(' ').map(w => w[0] + '…').join(' ')
}

// Stable shuffle so the word bank does not reorder on every render.
function seededOrder(items, seed) {
  const h = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
  return [...items].sort((a, b) => h(seed + a.key) - h(seed + b.key))
}

export default function SourceScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState(null)
  const [cards, setCards] = useState([])
  const [exercises, setExercises] = useState([])
  const [undo, setUndo] = useState(null) // { card, prevStatus }
  const undoTimer = useRef(null)

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true)
      const [{ data: src }, { data: cardRows }, { data: exRows }] = await Promise.all([
        supabase.from('sources').select('id, kind, url, title, author, language, created_at').eq('id', id).maybeSingle(),
        supabase.from('cards').select('id, word, pos, definition, patterns, status, context, context_ts, my_attempt, language').eq('source_id', id),
        supabase.from('exercises').select('id, card_id, kind, sentence, answers, position').eq('source_id', id).order('position'),
      ])
      if (!alive) return
      setSource(src ?? null)
      setExercises(exRows ?? [])
      // Source order: by timestamp, else by where the phrase's exercises sit.
      const firstEx = {}
      for (const e of exRows ?? []) firstEx[e.card_id] ??= e.position
      setCards([...(cardRows ?? [])].sort((a, b) =>
        (a.context_ts ?? Infinity) - (b.context_ts ?? Infinity)
        || (firstEx[a.id] ?? Infinity) - (firstEx[b.id] ?? Infinity)
        || a.word.localeCompare(b.word)))
      setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [id])

  useEffect(() => () => clearTimeout(undoTimer.current), [])

  const visibleCards = cards.filter(c => c.status !== 'known')
  const cardById = useMemo(() => Object.fromEntries(cards.map(c => [c.id, c])), [cards])
  const visibleEx = exercises.filter(e => cardById[e.card_id] && cardById[e.card_id].status !== 'known')

  async function setStatus(card, status) {
    setCards(prev => prev.map(c => c.id === card.id ? { ...c, status } : c))
    await supabase.from('cards').update({ status }).eq('id', card.id).eq('user_id', user.id)
  }

  function handleKnow(card) {
    clearTimeout(undoTimer.current)
    setUndo({ card, prevStatus: card.status })
    setStatus(card, 'known')
    undoTimer.current = setTimeout(() => setUndo(null), 4000)
  }

  function handleUndo() {
    if (!undo) return
    clearTimeout(undoTimer.current)
    setStatus(undo.card, undo.prevStatus)
    setUndo(null)
  }

  function logAttempt(exercise, answer, correct, hinted) {
    supabase.from('exercise_attempts')
      .insert({ user_id: user.id, exercise_id: exercise.id, answer, correct, hinted })
      .then(() => {}, () => {})
  }

  function goBack() {
    if (window.history.length > 1) navigate(-1)
    else navigate('/library')
  }

  return (
    <div className="screen" style={{ background: 'var(--bg)', position: 'relative' }}>
      <div style={{ padding: '16px 20px 0', flexShrink: 0 }}>
        <button className="back-btn" onClick={goBack} style={{ padding: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back
        </button>
      </div>

      <div className="scroll" style={{ padding: '14px 20px 40px', display: 'flex', flexDirection: 'column', gap: 26 }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--t3)', fontSize: 14, fontWeight: 600 }}>Loading…</div>
        )}

        {!loading && !source && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--t3)', fontSize: 14, fontWeight: 600 }}>
            This source is not available.
          </div>
        )}

        {!loading && source && (
          <>
            {/* Header */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="micro">{KIND_LABEL[source.kind] ?? 'Source'}</span>
              <h1 className="h2" style={{ lineHeight: 1.2 }}>{source.title || 'Untitled'}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13.5, color: 'var(--t2)', fontWeight: 600 }}>
                {source.author && <span>{source.author}</span>}
                {source.url && (
                  <a href={source.url} target="_blank" rel="noreferrer" style={{ color: 'var(--acc)', textDecoration: 'none', fontWeight: 700 }}>
                    {source.kind === 'youtube' ? 'Watch on YouTube ↗' : 'Open original ↗'}
                  </a>
                )}
              </div>
            </div>

            {/* Phrases */}
            <Section title="Phrases" count={visibleCards.length}>
              {visibleCards.length === 0 && <Empty>Every phrase here is marked as known.</Empty>}
              {visibleCards.map(card => (
                <PhraseRow key={card.id} card={card} onKnow={() => handleKnow(card)} />
              ))}
            </Section>

            <GapSection
              title="From the source"
              items={visibleEx.filter(e => e.kind === 'gap_source')}
              cardById={cardById}
              seed={`${id}:src`}
              onAttempt={logAttempt}
            />

            <GapSection
              title="New contexts"
              items={visibleEx.filter(e => e.kind === 'gap_new')}
              cardById={cardById}
              seed={`${id}:new`}
              onAttempt={logAttempt}
            />

            {visibleCards.length > 0 && <YourSentences sourceId={id} words={visibleCards.map(c => c.word)} />}
          </>
        )}
      </div>

      {undo && (
        <div style={{
          position: 'absolute', left: 20, right: 20, bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
          background: 'var(--t1)', color: 'white', borderRadius: 14, padding: '12px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          fontSize: 14, fontWeight: 600, boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
          animation: 'fadeUp 0.18s ease',
        }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            “{undo.card.word}” marked as known
          </span>
          <button onClick={handleUndo} style={{
            background: 'none', border: 'none', color: 'white', fontFamily: 'inherit',
            fontSize: 14, fontWeight: 800, cursor: 'pointer', padding: 0, flexShrink: 0,
          }}>
            Undo
          </button>
        </div>
      )}
    </div>
  )
}

function Section({ title, count, children }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--t1)' }}>{title}</h2>
        {count != null && <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t3)' }}>{count}</span>}
      </div>
      {children}
    </section>
  )
}

function Empty({ children }) {
  return <div style={{ fontSize: 14, color: 'var(--t3)', fontWeight: 600, padding: '6px 0' }}>{children}</div>
}

function PhraseRow({ card, onKnow }) {
  // The full sentence from the source; older cards only have patterns.
  const quote = card.context || card.patterns?.[0]
  return (
    <div style={{ background: 'var(--s1)', borderRadius: 16, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--acc)', letterSpacing: '-0.02em', overflowWrap: 'anywhere' }}>
            {card.word}
          </span>
          <SpeakButton word={card.word} language={card.language} size={16} />
        </div>
        <button onClick={onKnow} style={{
          flexShrink: 0, border: '1.5px solid var(--border)', background: 'none', borderRadius: 10,
          padding: '5px 11px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700,
          color: 'var(--t2)', cursor: 'pointer',
        }}>
          Know
        </button>
      </div>
      <p style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.5, color: 'var(--t2)' }}>
        {card.pos && <span style={{ fontWeight: 700, color: 'var(--t3)' }}>{card.pos} · </span>}
        {card.definition}
      </p>
      {quote && (
        <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '9px 12px', fontSize: 14.5, fontWeight: 500, lineHeight: 1.5, color: 'var(--t1)' }}>
          <TappablePattern pattern={quote} word={card.word} idPrefix={`src-${card.id}`} disabled />
          {card.my_attempt && (
            <div style={{ fontSize: 12.5, color: 'var(--t3)', marginTop: 4 }}>I said: {card.my_attempt}</div>
          )}
        </div>
      )}
      {card.context && card.patterns?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 13, fontWeight: 600, color: 'var(--t2)' }}>
          {card.patterns.map((p, i) => (
            <span key={i}><TappablePattern pattern={p} word={card.word} idPrefix={`srcp-${card.id}-${i}`} disabled /></span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Gap exercises ───────────────────────────────────────────────────────────

function GapSection({ title, items, cardById, seed, onAttempt }) {
  // { [exerciseId]: { value, tries, hinted, state: 'open' | 'right' | 'shown' } }
  const [rows, setRows] = useState({})
  const inputs = useRef({})

  if (items.length === 0) return null

  const get = ex => rows[ex.id] ?? { value: '', tries: 0, hinted: false, state: 'open' }
  const patch = (ex, p) => setRows(prev => ({ ...prev, [ex.id]: { ...get(ex), ...p } }))

  const bank = seededOrder(items.map(ex => ({ key: ex.id, word: cardById[ex.card_id]?.word ?? ex.answers[0] })), seed)
  const done = items.filter(ex => get(ex).state !== 'open').length

  function focusNext(fromIndex) {
    for (let k = 1; k <= items.length; k++) {
      const ex = items[(fromIndex + k) % items.length]
      if (get(ex).state === 'open' && ex.id !== items[fromIndex].id) {
        inputs.current[ex.id]?.focus()
        return
      }
    }
  }

  function check(ex, i) {
    const r = get(ex)
    if (r.state !== 'open' || !r.value.trim()) return
    const ok = ex.answers.some(a => normalizeAnswer(a) === normalizeAnswer(r.value))
    onAttempt(ex, r.value, ok, r.hinted)
    if (ok) {
      patch(ex, { state: 'right' })
      focusNext(i)
    } else if (r.tries + 1 >= 2) {
      patch(ex, { state: 'shown', tries: r.tries + 1, value: ex.answers[0] })
      focusNext(i)
    } else {
      patch(ex, { tries: r.tries + 1 })
    }
  }

  return (
    <Section title={title} count={`${done} / ${items.length}`}>
      {/* Word bank: a word is struck through once its gap is filled */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {bank.map(b => {
          const used = rows[b.key] && rows[b.key].state !== 'open'
          return (
            <span key={b.key} style={{
              fontSize: 13, fontWeight: 700, borderRadius: 8, padding: '4px 10px',
              background: used ? 'transparent' : 'var(--acc-dim)',
              color: used ? 'var(--t3)' : 'var(--acc)',
              textDecoration: used ? 'line-through' : 'none',
              border: used ? '1px solid var(--border)' : '1px solid transparent',
            }}>
              {b.word}
            </span>
          )
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((ex, i) => (
          <GapRow
            key={ex.id}
            ex={ex}
            row={get(ex)}
            inputRef={el => { inputs.current[ex.id] = el }}
            onChange={value => patch(ex, { value })}
            onCheck={() => check(ex, i)}
            onHint={() => { patch(ex, { hinted: true }); inputs.current[ex.id]?.focus() }}
          />
        ))}
      </div>
    </Section>
  )
}

function GapRow({ ex, row, inputRef, onChange, onCheck, onHint }) {
  const [before, after] = ex.sentence.split(/_{3,}/)
  const answer = ex.answers[0]
  const color = row.state === 'right' ? 'var(--good-c)'
    : row.state === 'shown' ? 'var(--again-c)'
    : row.tries > 0 ? 'var(--hard-c)' : 'var(--t1)'

  return (
    <div style={{
      background: 'var(--s1)', borderRadius: 14, padding: '12px 14px',
      display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, lineHeight: 1.9, color: 'var(--t1)' }}>
        {before}
        {row.state === 'open' ? (
          <input
            ref={inputRef}
            value={row.value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onCheck() } }}
            placeholder={row.hinted ? hintFor(answer) : ''}
            enterKeyHint="next"
            autoCapitalize="none" autoCorrect="off" spellCheck={false}
            style={{
              width: `${Math.max(6, answer.length + 2)}ch`, maxWidth: '100%',
              font: 'inherit', fontWeight: 700, color,
              background: 'var(--bg)', border: 'none', borderBottom: `2px solid ${row.tries > 0 ? 'var(--hard-c)' : 'var(--t3)'}`,
              borderRadius: '6px 6px 0 0', padding: '0 6px', margin: '0 3px', outline: 'none',
            }}
          />
        ) : (
          <span style={{ fontWeight: 800, color, margin: '0 3px' }}>{row.value}</span>
        )}
        {after}
      </div>
      {row.state === 'open' && !row.hinted && (
        <button
          onPointerDown={e => e.preventDefault()}
          onClick={onHint}
          aria-label="Hint"
          title="Hint"
          style={{
            flexShrink: 0, background: 'var(--s2)', border: 'none', borderRadius: 9, padding: '6px 9px',
            color: 'var(--t2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, marginTop: 2,
          }}
        >
          hint
        </button>
      )}
      {row.state !== 'open' && (
        <span aria-hidden style={{ flexShrink: 0, fontSize: 15, fontWeight: 800, color, marginTop: 4 }}>
          {row.state === 'right' ? '✓' : '✗'}
        </span>
      )}
    </div>
  )
}

// ── Your sentences ──────────────────────────────────────────────────────────
// No checking in the app for now: Copy puts the text on the clipboard to send
// to Claude in chat.

function YourSentences({ sourceId, words }) {
  const key = `chunks:sentences:${sourceId}`
  const [text, setText] = useState(() => localStorage.getItem(key) ?? '')
  const [copied, setCopied] = useState(false)

  useEffect(() => { localStorage.setItem(key, text) }, [key, text])

  async function copy() {
    const body = `Check my sentences. Phrases: ${words.join(', ')}\n\n${text.trim()}`
    try {
      await navigator.clipboard.writeText(body)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard blocked — nothing to do */ }
  }

  return (
    <Section title="Your sentences">
      <p style={{ fontSize: 13.5, color: 'var(--t2)', lineHeight: 1.5 }}>
        Write a few sentences of your own with the phrases above.
      </p>
      <textarea
        className="input"
        value={text}
        onChange={e => setText(e.target.value)}
        rows={5}
        placeholder="When I'm stuck on a product decision, I tend to reach for…"
        style={{ resize: 'vertical', lineHeight: 1.5 }}
      />
      <button className="btn btn-acc" onClick={copy} disabled={!text.trim()} style={{ padding: '13px 20px', fontSize: 15 }}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </Section>
  )
}
