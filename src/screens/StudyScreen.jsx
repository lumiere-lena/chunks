import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

// SM-2-ish SRS — 3-button: hard / ok / easy
function applyRating(card, rating) {
  let { interval_days, ease_factor } = card
  let status = card.status

  if (rating === 'hard') {
    interval_days = Math.max(1, Math.round(interval_days * ease_factor * 0.85))
    ease_factor = Math.max(1.3, ease_factor - 0.15)
    status = 'learning'
  } else if (rating === 'ok') {
    interval_days = Math.max(1, Math.round(interval_days * ease_factor))
    status = interval_days >= 21 ? 'mastered' : 'learning'
  } else if (rating === 'easy') {
    interval_days = Math.max(1, Math.round(interval_days * ease_factor * 1.3))
    ease_factor = Math.min(3.0, ease_factor + 0.15)
    status = 'mastered'
  }

  const next = new Date()
  next.setDate(next.getDate() + interval_days)
  const next_review_at = next.toISOString().split('T')[0]

  return { interval_days, ease_factor, status, next_review_at }
}

const RATINGS = [
  {
    key: 'hard', label: 'Hard', color: 'oklch(50% 0.18 25)',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
  },
  {
    key: 'ok', label: 'OK', color: 'oklch(55% 0.15 50)',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    ),
  },
  {
    key: 'easy', label: 'Easy', color: 'oklch(48% 0.17 145)',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
      </svg>
    ),
  },
]

export default function StudyScreen() {
  const { user, activeLang } = useAuth()
  const navigate = useNavigate()

  const [cards, setCards] = useState([])
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [results, setResults] = useState([])
  const [done, setDone] = useState(false)

  useEffect(() => { loadCards() }, []) // eslint-disable-line

  async function loadCards() {
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .eq('user_id', user.id)
      .eq('language', activeLang)
      .lte('next_review_at', today)
      .order('next_review_at', { ascending: true })

    setLoading(false)
    if (!error && data?.length) {
      setCards([...data].sort(() => Math.random() - 0.5))
    } else {
      setDone(true)
    }
  }

  async function handleRating(rating) {
    const card = cards[index]
    const updates = applyRating(card, rating)
    await supabase.from('cards').update(updates).eq('id', card.id)

    const newResults = [...results, { word: card.word, rating, interval: updates.interval_days }]
    if (index + 1 >= cards.length) {
      setResults(newResults)
      setDone(true)
    } else {
      setResults(newResults)
      setIndex(i => i + 1)
      setRevealed(false)
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  if (done) {
    const counts = { hard: 0, ok: 0, easy: 0 }
    results.forEach(r => counts[r.rating]++)
    const total = results.length

    return (
      <div className="screen" style={{ background: 'var(--bg)' }}>
        <div className="scroll" style={{
          padding: '48px 24px 40px',
          display: 'flex', flexDirection: 'column', gap: 28, alignItems: 'center',
        }}>
          <div style={{ fontSize: 48 }}>🎯</div>
          <div style={{ textAlign: 'center' }}>
            <div className="h2" style={{ marginBottom: 6 }}>Session done!</div>
            <div style={{ fontSize: 15, color: 'var(--t2)' }}>
              {total === 0 ? 'No cards were due.' : `${total} card${total !== 1 ? 's' : ''} reviewed`}
            </div>
          </div>

          {total > 0 && (
            <div style={{ width: '100%' }}>
              <div className="micro" style={{ marginBottom: 10 }}>Recall breakdown</div>
              <div style={{
                background: 'var(--s1)', borderRadius: 20, padding: 20,
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
              }}>
                {RATINGS.map(r => (
                  <div key={r.key} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: r.color }}>{counts[r.key]}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)', marginTop: 2 }}>{r.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button className="btn btn-acc" onClick={() => navigate('/home', { replace: true })} style={{ width: '100%' }}>
            Done
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="screen" style={{ background: 'var(--bg)', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    )
  }

  const card = cards[index]
  const total = cards.length

  // Preview interval for rating buttons
  function previewInterval(rating) {
    const { interval_days } = applyRating(card, rating)
    return interval_days === 1 ? '1 day' : `${interval_days} days`
  }

  // ── Study card ────────────────────────────────────────────────────────────
  return (
    <div className="screen" style={{ background: 'var(--bg)' }}>

      {/* Nav: Back | pips | counter */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 20px 2px', flexShrink: 0,
      }}>
        <button
          onClick={() => navigate('/home', { replace: true })}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'none', border: 'none', fontFamily: 'inherit',
            fontSize: 15, fontWeight: 600, color: 'var(--t2)', cursor: 'pointer', padding: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back
        </button>

        <div style={{ display: 'flex', gap: 4 }}>
          {Array.from({ length: total }).map((_, i) => {
            const ratingColor = { hard: 'oklch(50% 0.18 25)', ok: 'oklch(55% 0.15 50)', easy: 'oklch(48% 0.17 145)' }
            const result = results[i]
            return (
              <div key={i} style={{
                width: 26, height: 4, borderRadius: 2,
                background: i < index
                  ? (result ? ratingColor[result.rating] : 'var(--acc)')
                  : i === index ? 'var(--acc)' : 'var(--border)',
                opacity: i < index ? 0.8 : 1,
                transition: 'background 0.2s',
              }} />
            )
          })}
        </div>

        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t3)' }}>
          {index + 1} / {total}
        </span>
      </div>

      {/* Card body */}
      <div className="scroll" style={{ padding: '10px 18px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{
          background: 'var(--s1)', borderRadius: 20, padding: 20,
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          {revealed ? (
            // After reveal: word + pos → divider → definition → patterns filled
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ fontSize: 38, fontWeight: 800, color: 'var(--acc)', letterSpacing: '-0.035em', lineHeight: 1 }}>
                  {card.word}
                </div>
                <span style={{
                  fontSize: 12, fontWeight: 700, color: 'var(--t2)',
                  background: 'var(--s2)', borderRadius: 8, padding: '4px 10px',
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {card.pos}
                </span>
              </div>

              <div style={{ height: 1, background: 'var(--border)' }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ fontSize: 15.5, fontWeight: 500, lineHeight: 1.6, color: 'var(--t1)' }}>
                  {card.definition}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span className="micro">Usage patterns</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {(card.patterns ?? []).map((p, i) => (
                      <PatternRow key={i} pattern={p} revealed={true} />
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            // Before reveal: "Think of the word…" → definition → divider → patterns with blanks
            <>
              <div>
                <div className="micro" style={{ marginBottom: 10 }}>Think of the word…</div>
                <p style={{ fontSize: 15.5, fontWeight: 500, lineHeight: 1.6, color: 'var(--t1)' }}>
                  {card.definition}
                </p>
              </div>

              <div style={{ height: 1, background: 'var(--border)' }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span className="micro">Usage patterns</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {(card.patterns ?? []).map((p, i) => (
                    <PatternRow key={i} pattern={p} revealed={false} />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Action zone */}
      {!revealed ? (
        <div style={{ padding: '0 18px 22px', flexShrink: 0 }}>
          <button className="btn btn-acc" onClick={() => setRevealed(true)}>
            Show word
          </button>
        </div>
      ) : (
        <div style={{
          padding: '10px 18px 22px', flexShrink: 0,
          display: 'flex', gap: 8,
        }}>
          {RATINGS.map(r => (
            <button
              key={r.key}
              onClick={() => handleRating(r.key)}
              style={{
                flex: 1, padding: '13px 6px', borderRadius: 14,
                border: `1.5px solid color-mix(in oklch, ${r.color} 25%, transparent)`,
                background: `color-mix(in oklch, ${r.color} 8%, transparent)`,
                color: r.color,
                fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                cursor: 'pointer',
              }}
            >
              {r.icon}
              {r.label}
              <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.6 }}>
                {previewInterval(r.key)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function PatternRow({ pattern, revealed }) {
  const parts = pattern.split(/<<([^>]+)>>/)
  return (
    <div style={{
      background: 'var(--bg)', borderRadius: 12, padding: '11px 14px',
      fontSize: 15, fontWeight: 500, lineHeight: 1.5, color: 'var(--t1)',
    }}>
      {parts.map((part, i) => {
        if (i % 2 === 0) return <span key={i}>{part}</span>
        if (revealed) {
          return <span key={i} style={{ color: 'var(--acc)', fontWeight: 800 }}>{part}</span>
        }
        return (
          <span key={i} style={{
            display: 'inline-block',
            minWidth: 60,
            borderBottom: '2.5px solid var(--t2)',
            height: '0.85em',
            margin: '0 3px',
            verticalAlign: 'bottom',
            opacity: 0.35,
          }} />
        )
      })}
    </div>
  )
}

function Spinner() {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%',
      border: '3px solid var(--s2)', borderTopColor: 'var(--acc)',
      animation: 'spin 0.7s linear infinite',
    }} />
  )
}
