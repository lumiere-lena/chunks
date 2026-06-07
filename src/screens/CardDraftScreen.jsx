import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

const MODEL_OPTIONS = [
  { key: 'haiku',  label: 'Haiku 4.5' },
  { key: 'gemini', label: 'Gemini 2.5 Flash' },
]

export default function CardDraftScreen() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { state } = useLocation()

  const word     = state?.word     ?? ''
  const language = state?.language ?? 'sr'

  const [model,   setModel]   = useState('haiku')
  const [card,    setCard]    = useState(null)   // { pos, definition, patterns }
  const [status,  setStatus]  = useState('idle') // idle | loading | error | done
  const [saving,  setSaving]  = useState(false)

  // Auto-generate on mount
  useEffect(() => {
    if (word) generate(model)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function generate(modelKey) {
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
          body: JSON.stringify({ word, language, model: modelKey }),
        }
      )
      const data = await res.json()
      if (!res.ok) {
        if (data.error === 'card_limit_reached') {
          setStatus('limit')
        } else {
          setStatus('error')
        }
        return
      }
      setCard(data)
      setStatus('done')
    } catch {
      setStatus('error')
    }
  }

  function switchModel(key) {
    setModel(key)
    generate(key)
  }

  async function handleSave() {
    if (!card || saving) return
    setSaving(true)
    const today = new Date().toISOString().split('T')[0]
    const { error } = await supabase.from('cards').insert({
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
    })
    setSaving(false)
    if (!error) {
      navigate('/home', { replace: true })
    }
  }

  return (
    <div className="screen" style={{ background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{
        padding: '18px 20px 0',
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'var(--s1)', border: 'none', borderRadius: 12,
            width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--t2)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--t1)', letterSpacing: '-0.01em' }}>
          New card
        </div>
      </div>

      {/* Body */}
      <div className="scroll" style={{ padding: '20px 20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

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

        {/* Model switcher */}
        <div style={{
          background: 'var(--s1)', borderRadius: 14, padding: 5,
          display: 'flex', gap: 4,
        }}>
          {MODEL_OPTIONS.map(m => (
            <button
              key={m.key}
              onClick={() => switchModel(m.key)}
              disabled={status === 'loading'}
              style={{
                flex: 1, border: 'none', borderRadius: 10, padding: '9px 0',
                fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                background: model === m.key ? 'var(--acc)' : 'transparent',
                color:      model === m.key ? 'white'      : 'var(--t2)',
                transition: 'background 0.15s, color 0.15s',
                opacity: status === 'loading' ? 0.6 : 1,
              }}
            >
              {m.label}
            </button>
          ))}
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
              onClick={() => generate(model)}
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

        {/* Card preview */}
        {status === 'done' && card && (
          <>
            {/* POS */}
            <div style={{ background: 'var(--s1)', borderRadius: 18, padding: '16px 20px' }}>
              <div className="micro" style={{ marginBottom: 6 }}>Part of speech</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t1)' }}>{card.pos}</div>
            </div>

            {/* Definition */}
            <div style={{ background: 'var(--s1)', borderRadius: 18, padding: '16px 20px' }}>
              <div className="micro" style={{ marginBottom: 6 }}>Definition</div>
              <div style={{ fontSize: 15, color: 'var(--t1)', lineHeight: 1.6 }}>{card.definition}</div>
            </div>

            {/* Patterns */}
            <div style={{ background: 'var(--s1)', borderRadius: 18, padding: '16px 20px' }}>
              <div className="micro" style={{ marginBottom: 10 }}>Usage patterns</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {card.patterns.map((p, i) => (
                  <PatternRow key={i} pattern={p} word={card.word} />
                ))}
              </div>
            </div>

            {/* Regenerate hint */}
            <button
              onClick={() => generate(model)}
              style={{
                background: 'none', border: 'none', fontFamily: 'inherit',
                fontSize: 13, fontWeight: 600, color: 'var(--t3)', cursor: 'pointer',
                textAlign: 'center', padding: '4px 0', textDecoration: 'underline',
                textDecorationColor: 'transparent',
              }}
              onMouseEnter={e => e.target.style.color = 'var(--t2)'}
              onMouseLeave={e => e.target.style.color = 'var(--t3)'}
            >
              ↺ Regenerate
            </button>
          </>
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
            flex: 1, height: 50, background: 'var(--s1)', border: 'none',
            borderRadius: 14, fontSize: 15, fontWeight: 700, color: 'var(--t2)',
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

// Pattern with word highlighted
function PatternRow({ pattern, word }) {
  const parts = pattern.split('_____')
  return (
    <div style={{ fontSize: 14, color: 'var(--t2)', lineHeight: 1.6 }}>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            <span style={{ color: 'var(--acc)', fontWeight: 700 }}>{word}</span>
          )}
        </span>
      ))}
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
