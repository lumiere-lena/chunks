import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

const MODEL = 'gemini'

export default function CardDraftScreen() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { state } = useLocation()

  const word     = state?.word     ?? ''
  const language = state?.language ?? 'sr'

  const [card,   setCard]   = useState(null)
  const [status, setStatus] = useState('idle') // idle | loading | error | done | duplicate
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (word) generate()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    setStatus('loading')
    setCard(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-card`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ word, language, model: MODEL }),
        }
      )
      const data = await res.json()
      if (!res.ok) {
        if (data.error === 'card_limit_reached') {
          setStatus('limit')
        } else if (data.error === 'inappropriate') {
          setStatus('inappropriate')
        } else {
          setStatus('error')
        }
        return
      }
      setCard(data)

      // Check if user already has this word
      const headword = data.word.toLowerCase().trim()
      const { count } = await supabase
        .from('cards')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('language', language)
        .ilike('word', headword)

      if (count > 0) {
        setStatus('duplicate')
        return
      }

      setStatus('done')
    } catch {
      setStatus('error')
    }
  }

  async function handleSave() {
    if (!card || saving) return
    setSaving(true)
    const today = new Date().toISOString().split('T')[0]
    const row = {
      user_id:        user.id,
      language,
      word:           card.word,
      pos:            card.pos,
      definition:     card.definition,
      patterns:       card.patterns,
      status:         'new',
      interval_days:  1,
      ease_factor:    2.5,
      next_review_at: today,
    }
    if (card.verb_forms) row.verb_forms = card.verb_forms
    const { error } = await supabase.from('cards').insert(row)
    setSaving(false)
    if (!error) {
      navigate('/home', { replace: true })
    }
  }

  return (
    <div className="screen" style={{ background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{ padding: '16px 20px 0', flexShrink: 0 }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 15, fontWeight: 600, color: 'var(--t2)', fontFamily: 'inherit', padding: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back
        </button>
      </div>

      {/* Body */}
      <div className="scroll" style={{ padding: '14px 20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Word */}
        <div style={{
          background: 'var(--s1)', borderRadius: 18, padding: '18px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div className="micro" style={{ marginBottom: 5 }}>Word</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--acc)', letterSpacing: '-0.02em' }}>{word}</div>
          </div>
          <div style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
            color: 'var(--t3)', background: 'var(--s2)', borderRadius: 8, padding: '5px 10px',
          }}>
            {language === 'sr' ? '🇷🇸 SR' : '🇬🇧 EN'}
          </div>
        </div>

        {/* Loading */}
        {status === 'loading' && (
          <div style={{
            background: 'var(--s1)', borderRadius: 18, padding: '40px 20px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          }}>
            <Spinner />
            <div style={{ fontSize: 14, color: 'var(--t2)', fontWeight: 600 }}>Generating card…</div>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div style={{
            background: 'var(--s1)', borderRadius: 18, padding: '28px 20px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center',
          }}>
            <div style={{ fontSize: 32 }}>⚠️</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>Something went wrong</div>
            <div style={{ fontSize: 13, color: 'var(--t2)' }}>Couldn't generate the card. Try again?</div>
            <button
              onClick={() => generate()}
              className="btn btn-acc"
              style={{ marginTop: 4, width: 'auto', padding: '12px 24px' }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Limit reached */}
        {status === 'limit' && (
          <div style={{
            background: 'var(--s1)', border: '1.5px solid var(--acc)', borderRadius: 18,
            padding: '28px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center',
          }}>
            <div style={{ fontSize: 32 }}>🔒</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>30-card limit reached</div>
            <div style={{ fontSize: 13, color: 'var(--t2)' }}>Upgrade to Pro for unlimited cards</div>
            <button className="btn btn-acc" style={{ marginTop: 4, width: 'auto', padding: '12px 24px' }}>
              Upgrade to Pro
            </button>
          </div>
        )}

        {/* Inappropriate */}
        {status === 'inappropriate' && (
          <div style={{
            background: 'var(--s1)', borderRadius: 18, padding: '28px 20px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center',
          }}>
            <div style={{ fontSize: 32 }}>🚫</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>Word not available</div>
            <div style={{ fontSize: 13, color: 'var(--t2)' }}>This word can't be added to the dictionary</div>
          </div>
        )}

        {/* Duplicate */}
        {status === 'duplicate' && card && (
          <div style={{
            background: 'var(--s1)', border: '1.5px solid var(--hard-c)', borderRadius: 18,
            padding: '28px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center',
          }}>
            <div style={{ fontSize: 32 }}>📋</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>
              "{card.word}" is already in your library
            </div>
            <div style={{ fontSize: 13, color: 'var(--t2)' }}>
              You can find it in your Library
            </div>
            <button
              onClick={() => navigate('/library', { replace: true })}
              className="btn btn-acc"
              style={{ marginTop: 4, width: 'auto', padding: '12px 24px' }}
            >
              Go to Library
            </button>
          </div>
        )}

        {/* Card preview — single unified card */}
        {status === 'done' && card && (
          <div style={{
            background: 'var(--s1)', borderRadius: 22, padding: '22px 22px 20px',
            display: 'flex', flexDirection: 'column', gap: 18,
          }}>
            {/* Word + POS pill */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--acc)', letterSpacing: '-0.035em', lineHeight: 1 }}>
                {card.word}
              </div>
              <div style={{
                flexShrink: 0,
                fontSize: 12, fontWeight: 700, color: 'var(--t2)',
                background: 'var(--s2)', borderRadius: 8, padding: '4px 10px', whiteSpace: 'nowrap',
              }}>
                {card.pos}
              </div>
            </div>

            {/* Verb forms */}
            {card.verb_forms && <VerbForms forms={card.verb_forms} language={language} />}

            {/* Definition */}
            <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--t1)', lineHeight: 1.6 }}>{card.definition}</div>

            <div style={{ height: 1, background: 'var(--border)' }} />

            {/* Usage patterns */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)' }}>
                  Usage patterns
                </span>
                <button
                  onClick={() => generate()}
                  style={{
                    background: 'none', border: 'none', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: 12.5, fontWeight: 700, color: 'var(--t3)', cursor: 'pointer', padding: 0,
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--acc)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--t3)'}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5"/>
                    <path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>
                  </svg>
                  Regenerate
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {card.patterns.map((p, i) => (
                  <PatternRow key={i} pattern={p} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div style={{
        padding: '12px 20px 28px', flexShrink: 0,
        display: 'flex', gap: 10, borderTop: '1px solid var(--border)',
        background: 'var(--bg)',
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            flex: 1, height: 50, background: 'var(--s1)',
            border: '1.5px solid var(--border)',
            borderRadius: 14, fontSize: 15, fontWeight: 700, color: 'var(--t1)',
            fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          Discard
        </button>
        <button
          onClick={handleSave}
          disabled={status !== 'done' || saving}
          style={{
            flex: 2, height: 50, border: 'none', borderRadius: 14,
            fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            background: status === 'done' ? 'var(--acc)' : 'var(--s2)',
            color: status === 'done' ? 'white' : 'var(--t3)',
            transition: 'background 0.15s',
          }}
        >
          {saving ? 'Saving…' : 'Save card'}
        </button>
      </div>
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

function PatternRow({ pattern }) {
  const parts = pattern.split(/<<([^>]+)>>/)
  return (
    <div style={{
      background: 'var(--bg)', borderRadius: 13, padding: '12px 16px',
      fontSize: 15.5, fontWeight: 500, color: 'var(--t1)', lineHeight: 1.55,
    }}>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <span key={i} style={{ color: 'var(--acc)', fontWeight: 700 }}>{part}</span>
          : <span key={i}>{part}</span>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%',
      border: '3px solid var(--s2)',
      borderTopColor: 'var(--acc)',
      animation: 'spin 0.7s linear infinite',
    }} />
  )
}
