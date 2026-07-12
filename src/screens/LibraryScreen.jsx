import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import NavBar from '../components/NavBar'
import { TappableText, TappablePattern, CreateCardBar, useWordTap } from '../components/WordTap'

const LANG_META = {
  sr: { flag: '🇷🇸', name: 'Serbian' },
  en: { flag: '🇬🇧', name: 'English' },
}

const FILTERS = ['all', 'new', 'learning', 'mastered']

const BADGE_STYLES = {
  new:      { color: 'var(--new-c)',      background: 'color-mix(in oklch, var(--new-c) 18%, transparent)' },
  learning: { color: 'var(--learning-c)', background: 'color-mix(in oklch, var(--learning-c) 18%, transparent)' },
  mastered: { color: 'var(--mastered-c)', background: 'color-mix(in oklch, var(--mastered-c) 18%, transparent)' },
}

export default function LibraryScreen() {
  const { user, activeLang, setActiveLang, plan } = useAuth()
  const [cards, setCards] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)

  const tapDisabled = plan === 'free'
  const wt = useWordTap({
    language: activeLang,
    userId: user.id,
    onCreated: () => fetchCards(),
  })

  useEffect(() => { fetchCards() }, [activeLang]) // eslint-disable-line

  async function fetchCards() {
    setLoading(true)
    const { data } = await supabase
      .from('cards')
      .select('id, word, pos, definition, translation_ru, patterns, verb_forms, status, created_at')
      .eq('user_id', user.id)
      .eq('language', activeLang)
      .order('created_at', { ascending: false })

    setCards(data ?? [])
    setLoading(false)
  }

  async function handleDelete(id) {
    setCards(prev => prev.filter(c => c.id !== id))
    await supabase.from('cards').delete().eq('id', id)
  }

  const filtered = filter === 'all' ? cards : cards.filter(c => c.status === filter)

  return (
    <div className="screen" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ padding: '18px 20px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 className="h2">Library</h1>
          <div style={{
            display: 'flex', background: 'var(--s1)', borderRadius: 20, padding: 3,
          }}>
            {Object.entries(LANG_META).map(([id, m]) => (
              <button
                key={id}
                onClick={() => setActiveLang(id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 12px', borderRadius: 17, border: 'none',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  background: activeLang === id ? 'var(--acc)' : 'transparent',
                  color: activeLang === id ? 'white' : 'var(--t2)',
                  transition: 'all 0.15s',
                }}
              >
                {m.flag} {m.name}
              </button>
            ))}
          </div>
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--t2)', marginTop: 4 }}>
          {cards.length} word{cards.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Filter tabs */}
      <div style={{
        display: 'flex', gap: 6, padding: '16px 20px 10px',
        overflowX: 'auto', flexShrink: 0,
      }}>
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '7px 16px', borderRadius: 20, border: 'none',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              whiteSpace: 'nowrap', fontFamily: 'inherit',
              background: filter === f ? 'var(--acc)' : 'var(--s1)',
              color: filter === f ? 'white' : 'var(--t2)',
              transition: 'all 0.15s',
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="scroll" style={{ padding: '4px 20px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--t3)', fontSize: 14, fontWeight: 600 }}>
            Loading…
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '40px 20px',
            color: 'var(--t3)', fontSize: 14, fontWeight: 600,
          }}>
            {cards.length === 0 ? 'No cards yet' : 'No cards match this filter'}
          </div>
        )}

        {filtered.map(card => {
          const isOpen = expandedId === card.id
          return (
            <div key={card.id} style={{
              background: 'var(--s1)', borderRadius: 14,
              transition: 'all 0.15s',
            }}>
              <div
                onClick={() => setExpandedId(isOpen ? null : card.id)}
                style={{
                  padding: '15px 18px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--t1)' }}>{card.word}</div>
                  {!isOpen && (
                    <div style={{
                      fontSize: 12.5, color: 'var(--t2)', marginTop: 3,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 170,
                    }}>
                      {card.definition}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, borderRadius: 8, padding: '4px 10px',
                    textTransform: 'capitalize',
                    ...BADGE_STYLES[card.status],
                  }}>
                    {card.status}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(card.id) }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--t3)', padding: 4, display: 'flex', alignItems: 'center',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              </div>

              {isOpen && (
                <div style={{ padding: '0 18px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ height: 1, background: 'var(--border)' }} />

                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--acc)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                      {card.word}
                    </div>
                    {card.pos && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: 'var(--t2)',
                        background: 'var(--s2)', borderRadius: 8, padding: '3px 9px',
                        whiteSpace: 'nowrap', flexShrink: 0,
                      }}>
                        {card.pos}
                      </span>
                    )}
                  </div>

                  {card.verb_forms && <VerbForms forms={card.verb_forms} language={activeLang} />}

                  <p style={{ fontSize: 14.5, fontWeight: 500, lineHeight: 1.55, color: 'var(--t1)', margin: 0 }}>
                    <TappableText text={card.definition} idPrefix={`l-def-${card.id}`} selectedId={wt.selectedId} onWordTap={wt.selectWord} disabled={tapDisabled} />
                  </p>
                  {card.translation_ru && (
                    <div style={{ fontSize: 13, color: 'var(--t2)', fontStyle: 'italic' }}>{card.translation_ru}</div>
                  )}

                  {card.patterns?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)' }}>
                        Usage patterns
                      </span>
                      {card.patterns.map((p, i) => (
                        <div key={i} style={{
                          background: 'var(--bg)', borderRadius: 10, padding: '9px 13px',
                          fontSize: 14, fontWeight: 500, lineHeight: 1.5, color: 'var(--t1)',
                        }}>
                          <TappablePattern pattern={p} word={card.word} idPrefix={`l-pat-${card.id}-${i}`} selectedId={wt.selectedId} onWordTap={wt.selectWord} disabled={tapDisabled} />
                        </div>
                      ))}
                    </div>
                  )}

                  {!tapDisabled && (
                    <div style={{ fontSize: 11.5, color: 'var(--t3)', fontWeight: 600, textAlign: 'center' }}>
                      Tap any word to add it as a card
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <CreateCardBar selected={wt.selected} phase={wt.phase} result={wt.result} onConfirm={wt.confirm} onClose={wt.clear} />

      <NavBar />
    </div>
  )
}

function VerbForms({ forms, language }) {
  const isEnglish = language === 'en'
  const entries = isEnglish
    ? [['V1', forms.v1], ['V2', forms.v2], ['V3', forms.v3]]
    : [['ja', forms['1sg']], ['oni/one', forms['3pl']]]

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {entries.map(([label, value]) => value && (
        <div key={label} style={{
          background: 'var(--bg)', borderRadius: 8, padding: '6px 12px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, flex: 1,
        }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--t3)' }}>{label}</span>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--acc)' }}>{value}</span>
        </div>
      ))}
    </div>
  )
}

