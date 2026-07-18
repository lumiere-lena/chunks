import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { TappableText, TappablePattern, CreateCardBar, useWordTap } from '../components/WordTap'
import { groupReviewsBySession, formatSessionTime } from '../lib/learnedToday'

// SM-2-ish SRS — 3-button: hard / ok / easy
// First reviews use fixed intervals (1 → 1 → 3 → 7), then ease_factor kicks in
const EARLY_INTERVALS = { ok: [1, 3, 7], easy: [3, 7, 14] }

function applyRating(card, rating) {
  let { interval_days, ease_factor } = card
  let status = card.status
  const reviewCount = card.review_count ?? 0

  if (rating === 'hard') {
    interval_days = Math.max(1, Math.round(interval_days * 0.7))
    ease_factor = Math.max(1.3, ease_factor - 0.15)
    status = 'learning'
  } else if (rating === 'ok') {
    if (reviewCount < 3) {
      interval_days = EARLY_INTERVALS.ok[reviewCount]
    } else {
      interval_days = Math.max(1, Math.round(interval_days * ease_factor))
    }
    status = interval_days >= 21 ? 'mastered' : 'learning'
  } else if (rating === 'easy') {
    if (reviewCount < 3) {
      interval_days = EARLY_INTERVALS.easy[reviewCount]
    } else {
      interval_days = Math.max(1, Math.round(interval_days * ease_factor * 1.3))
    }
    ease_factor = Math.min(3.0, ease_factor + 0.15)
    status = interval_days >= 21 ? 'mastered' : 'learning'
  }

  const next = new Date()
  next.setDate(next.getDate() + interval_days)
  const next_review_at = next.toISOString().split('T')[0]

  return { interval_days, ease_factor, status, next_review_at, review_count: reviewCount + 1 }
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
  const { user, activeLang, plan } = useAuth()
  const navigate = useNavigate()

  const tapDisabled = plan === 'free'
  const wt = useWordTap({ language: activeLang, userId: user.id })

  const [cards, setCards] = useState([])
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [results, setResults] = useState([])
  const [done, setDone] = useState(false)
  const [remainingCount, setRemainingCount] = useState(0)
  const [peeked, setPeeked] = useState(false)
  const [learnedSessions, setLearnedSessions] = useState([])
  // Grade for the current card, decided by how the user answered (typed / gave up).
  const [autoGrade, setAutoGrade] = useState(null)

  useEffect(() => { loadCards() }, []) // eslint-disable-line

  useEffect(() => {
    if (done) fetchLearnedToday()
  }, [done]) // eslint-disable-line

  async function fetchLearnedToday() {
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    const { data } = await supabase
      .from('reviews')
      .select('card_id, reviewed_at, cards!inner(word, translation_ru, language)')
      .eq('user_id', user.id)
      .eq('cards.language', activeLang)
      .gte('reviewed_at', dayStart.toISOString())
      .order('reviewed_at', { ascending: false })
    setLearnedSessions(groupReviewsBySession(data))
  }

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
      const shuffled = [...data].sort(() => Math.random() - 0.5)
      setCards(shuffled.slice(0, 10))
      setRemainingCount(Math.max(0, data.length - 10))
    } else {
      setDone(true)
    }
  }

  async function handleRating(rating) {
    const card = cards[index]
    const updates = applyRating(card, rating)
    await Promise.all([
      supabase.from('cards').update(updates).eq('id', card.id),
      supabase.from('reviews').insert({ card_id: card.id, user_id: user.id, rating }),
    ])

    const newResults = [...results, { word: card.word, rating, interval: updates.interval_days }]
    if (index + 1 >= cards.length) {
      setResults(newResults)
      setDone(true)
    } else {
      setResults(newResults)
      setIndex(i => i + 1)
      setRevealed(false)
      setPeeked(false)
      setAutoGrade(null)
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

          {learnedSessions.length > 0 && (
            <div style={{ width: '100%' }}>
              <div className="micro" style={{ marginBottom: 10 }}>Learned today</div>
              <div style={{
                background: 'var(--s1)', borderRadius: 20, padding: '16px 18px',
                display: 'flex', flexDirection: 'column', gap: 18,
              }}>
                {learnedSessions.map((s, si) => (
                  <div key={si} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--t3)' }}>
                      {formatSessionTime(s.at)} · {s.words.length}
                    </div>
                    {s.words.map((w, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)', flexShrink: 0 }}>{w.word}</span>
                        {w.translation && (
                          <span style={{ fontSize: 13.5, color: 'var(--t2)', textAlign: 'right' }}>{w.translation}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {remainingCount > 0 && (
            <div style={{
              background: 'var(--s1)', border: '1.5px solid var(--acc)', borderRadius: 18,
              padding: '16px 18px', width: '100%', textAlign: 'center',
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>
                {remainingCount} more card{remainingCount !== 1 ? 's' : ''} due
              </div>
              <button
                onClick={() => {
                  setCards([])
                  setIndex(0)
                  setRevealed(false)
                  setPeeked(false)
                  setAutoGrade(null)
                  setResults([])
                  setDone(false)
                  setLoading(true)
                  setRemainingCount(0)
                  loadCards()
                }}
                style={{
                  marginTop: 10, background: 'var(--acc)', color: 'white', border: 'none',
                  borderRadius: 12, padding: '11px 20px', fontSize: 15, fontWeight: 700,
                  fontFamily: 'inherit', cursor: 'pointer',
                }}
              >
                Study more
              </button>
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

              {card.verb_forms && <VerbForms forms={card.verb_forms} language={card.language} />}

              <div style={{ height: 1, background: 'var(--border)' }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ fontSize: 15.5, fontWeight: 500, lineHeight: 1.6, color: 'var(--t1)' }}>
                  <TappableText text={card.definition} idPrefix={`s-def-${card.id}`} selectedId={wt.selectedId} onWordTap={wt.selectWord} disabled={tapDisabled} />
                </p>
                {card.translation_ru && (
                  <div style={{ fontSize: 14, color: 'var(--t2)', fontStyle: 'italic' }}>{card.translation_ru}</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span className="micro">Usage patterns</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {(card.patterns ?? []).map((p, i) => (
                      <div key={i} style={{
                        background: 'var(--bg)', borderRadius: 12, padding: '11px 14px',
                        fontSize: 15, fontWeight: 500, lineHeight: 1.5, color: 'var(--t1)',
                      }}>
                        <TappablePattern pattern={p} word={card.word} idPrefix={`s-pat-${card.id}-${i}`} selectedId={wt.selectedId} onWordTap={wt.selectWord} disabled={tapDisabled} />
                      </div>
                    ))}
                  </div>
                  {!tapDisabled && (
                    <div style={{ fontSize: 11.5, color: 'var(--t3)', fontWeight: 600, textAlign: 'center', marginTop: 2 }}>
                      Tap any word to add it as a card
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            // Before reveal: "Think of the word…" → definition → divider → patterns with blanks
            <>
              <div>
                <div className="micro" style={{ marginBottom: 10 }}>Think of the word…</div>
                <p style={{ fontSize: 15.5, fontWeight: 500, lineHeight: 1.6, color: 'var(--t1)' }}>
                  <TappableText text={card.definition} idPrefix={`s-def-${card.id}`} selectedId={wt.selectedId} onWordTap={wt.selectWord} disabled={tapDisabled} />
                </p>
              </div>

              <WordInput
                word={card.word}
                onSolved={(rating) => { setAutoGrade(rating); setRevealed(true) }}
              />

              {card.translation_ru && (
                <TranslationPeek text={card.translation_ru} peeked={peeked} onPeek={() => setPeeked(true)} />
              )}

              <div style={{ height: 1, background: 'var(--border)' }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span className="micro">Usage patterns</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {(card.patterns ?? []).map((p, i) => (
                    <div key={i} style={{
                      background: 'var(--bg)', borderRadius: 12, padding: '11px 14px',
                      fontSize: 15, fontWeight: 500, lineHeight: 1.5, color: 'var(--t1)',
                    }}>
                      <TappablePattern pattern={p} word={card.word} idPrefix={`s-pat-${card.id}-${i}`} selectedId={wt.selectedId} onWordTap={wt.selectWord} disabled={tapDisabled} revealed={false} />
                    </div>
                  ))}
                </div>
                {!tapDisabled && (
                  <div style={{ fontSize: 11.5, color: 'var(--t3)', fontWeight: 600, textAlign: 'center', marginTop: 2 }}>
                    Tap any word to add it as a card
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Action zone */}
      {!revealed ? (
        <div style={{ padding: '0 18px 22px', flexShrink: 0, display: 'flex', gap: 8 }}>
          <button
            onClick={() => { setAutoGrade('easy'); setRevealed(true) }}
            style={{
              flex: 1, padding: '15px 6px', borderRadius: 14,
              border: '1.5px solid var(--border)', background: 'var(--s1)',
              color: 'var(--t1)', fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            I knew it
          </button>
          <button
            className="btn btn-acc"
            style={{ flex: 1 }}
            onClick={() => { setAutoGrade('hard'); setRevealed(true) }}
          >
            Show word
          </button>
        </div>
      ) : (
        <div style={{
          padding: '10px 18px 22px', flexShrink: 0,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {autoGrade && (() => {
            const g = RATINGS.find(r => r.key === autoGrade)
            return (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                fontSize: 13.5, fontWeight: 700, color: g.color,
              }}>
                {g.icon}
                {g.label} · next in {previewInterval(autoGrade)}
              </div>
            )
          })()}
          <button className="btn btn-acc" onClick={() => handleRating(autoGrade)}>
            Next
          </button>
        </div>
      )}

      <CreateCardBar selected={wt.selected} phase={wt.phase} result={wt.result} onConfirm={wt.confirm} onClose={wt.clear} />
    </div>
  )
}

function VerbForms({ forms, language }) {
  const isEnglish = language === 'en'
  const entries = isEnglish
    ? [['V1', forms.v1], ['V2', forms.v2], ['V3', forms.v3]]
    : [['ja', forms['1sg']], ['oni/one', forms['3pl']]]

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {entries.map(([label, value]) => value && (
        <div key={label} style={{
          background: 'var(--bg)', borderRadius: 10, padding: '8px 14px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1,
        }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--t3)' }}>{label}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--acc)' }}>{value}</span>
        </div>
      ))}
    </div>
  )
}

const DIACRITIC_FOLD = { 'č': 'c', 'ć': 'c', 'đ': 'd', 'š': 's', 'ž': 'z' }
const isLetter = (c) => /\p{L}/u.test(c)
function fold(ch) {
  const l = ch.toLowerCase()
  return DIACRITIC_FOLD[l] ?? l
}

// Type-the-word input. One underlined slot per letter (length is visible);
// wrong letters turn red immediately; a fully correct entry auto-reveals.
// Diacritics are matched leniently (c=č, s=š, z=ž, d=đ). Spaces/hyphens are
// shown as separators and skipped by the typing cursor.
function WordInput({ word, onSolved }) {
  const [typed, setTyped] = useState('')
  const inputRef = useRef(null)
  const solvedRef = useRef(false)
  const mistakeRef = useRef(false) // any wrong keystroke during this attempt

  const chars = [...word]
  const letters = chars.filter(isLetter)

  useEffect(() => {
    setTyped('')
    solvedRef.current = false
    mistakeRef.current = false
    const t = setTimeout(() => inputRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [word])

  // Flag a mistake if any entered character (ignoring diacritics) is wrong, then
  // auto-reveal once the whole word is correct — Easy if flawless, else OK.
  function flagAndCheck(str) {
    const cleaned = [...str].filter(isLetter)
    if (cleaned.some((ch, i) => fold(ch) !== fold(letters[i]))) {
      mistakeRef.current = true
    }
    if (cleaned.length === letters.length && !solvedRef.current
        && letters.every((ch, i) => fold(cleaned[i]) === fold(ch))) {
      solvedRef.current = true
      const rating = mistakeRef.current ? 'ok' : 'easy'
      setTimeout(() => onSolved(rating), 320)
    }
  }

  function handleChange(e) {
    const next = [...e.target.value].filter(isLetter).slice(0, letters.length).join('')
    setTyped(next)
    flagAndCheck(next)
  }

  // Let the user just start typing on a physical keyboard without tapping a cell
  // first. Ignored while a real text field is focused (e.g. the hidden input on
  // mobile handles its own onChange there).
  useEffect(() => {
    function onKeyDown(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const ae = document.activeElement
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return
      if (e.key === 'Backspace') {
        e.preventDefault()
        setTyped(prev => prev.slice(0, -1))
      } else if (e.key.length === 1 && isLetter(e.key)) {
        e.preventDefault()
        setTyped(prev => {
          if (prev.length >= letters.length) return prev
          const next = prev + e.key
          flagAndCheck(next)
          return next
        })
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [word]) // eslint-disable-line react-hooks/exhaustive-deps

  const RED = 'oklch(55% 0.2 25)'
  let li = -1

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 6, cursor: 'text', position: 'relative' }}
    >
      <input
        ref={inputRef}
        value={typed}
        onChange={handleChange}
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1, border: 'none', padding: 0 }}
      />
      {chars.map((ch, i) => {
        if (!isLetter(ch)) {
          return ch === ' '
            ? <span key={i} style={{ width: 10 }} />
            : <span key={i} style={{ fontSize: 20, fontWeight: 700, color: 'var(--t3)', alignSelf: 'center' }}>{ch}</span>
        }
        li += 1
        const idx = li
        const typedCh = typed[idx]
        const isCurrent = idx === typed.length
        let borderColor = 'var(--border)'
        let textColor = 'var(--t1)'
        if (typedCh != null) {
          const ok = fold(typedCh) === fold(ch)
          textColor = ok ? 'var(--acc)' : RED
          borderColor = ok ? 'var(--acc)' : RED
        } else if (isCurrent) {
          borderColor = 'var(--acc)'
        }
        return (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 24, height: 32, padding: '0 3px',
            borderBottom: `2.5px solid ${borderColor}`,
            fontSize: 20, fontWeight: 800, color: textColor, lineHeight: 1,
            transition: 'color 0.1s, border-color 0.1s',
          }}>
            {typedCh ?? ''}
          </span>
        )
      })}
    </div>
  )
}

function TranslationPeek({ text, peeked, onPeek }) {
  const eye = (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  )

  if (peeked) {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, alignSelf: 'flex-start',
        color: 'var(--t2)', fontSize: 14, fontStyle: 'italic',
      }}>
        <span style={{ color: 'var(--t3)', display: 'flex' }}>{eye}</span>
        {text}
      </div>
    )
  }

  return (
    <button
      onClick={onPeek}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, alignSelf: 'flex-start',
        background: 'var(--s2)', border: 'none', borderRadius: 10, padding: '7px 12px',
        color: 'var(--t2)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
      }}
    >
      {eye}
      Translation
    </button>
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
