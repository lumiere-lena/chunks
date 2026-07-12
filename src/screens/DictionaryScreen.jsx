import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import NavBar from '../components/NavBar'
import { TappableText, TappablePattern, CreateCardBar, useWordTap } from '../components/WordTap'

const LANG_META = {
  sr: { flag: '🇷🇸', name: 'Serbian' },
  en: { flag: '🇬🇧', name: 'English' },
}

export default function DictionaryScreen() {
  const { user, activeLang, setActiveLang, plan } = useAuth()
  const [words, setWords] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [addingId, setAddingId] = useState(null)
  const [myWords, setMyWords] = useState(new Set())

  const tapDisabled = plan === 'free'
  const wt = useWordTap({
    language: activeLang,
    userId: user.id,
    onCreated: (res) => setMyWords(prev => new Set(prev).add(res.word.toLowerCase())),
  })

  useEffect(() => { fetchAll() }, [activeLang]) // eslint-disable-line

  async function fetchAll() {
    setLoading(true)
    const [{ data: dictData }, { data: cardsData }] = await Promise.all([
      supabase
        .from('dictionary')
        .select('id, word, pos, definition, translation_ru, patterns, verb_forms, language')
        .eq('language', activeLang)
        .order('word', { ascending: true }),
      supabase
        .from('cards')
        .select('word')
        .eq('user_id', user.id)
        .eq('language', activeLang),
    ])
    setWords(dictData ?? [])
    setMyWords(new Set((cardsData ?? []).map(c => c.word.toLowerCase())))
    setLoading(false)
  }

  async function handleAdd(entry) {
    if (myWords.has(entry.word.toLowerCase())) return
    setAddingId(entry.id)
    const today = new Date().toISOString().split('T')[0]
    const row = {
      user_id: user.id,
      language: activeLang,
      word: entry.word,
      pos: entry.pos,
      definition: entry.definition,
      patterns: entry.patterns,
      status: 'new',
      interval_days: 1,
      ease_factor: 2.5,
      next_review_at: today,
    }
    if (entry.translation_ru) row.translation_ru = entry.translation_ru
    if (entry.verb_forms) row.verb_forms = entry.verb_forms
    const { error } = await supabase.from('cards').insert(row)
    if (!error) {
      setMyWords(prev => new Set(prev).add(entry.word.toLowerCase()))
    }
    setAddingId(null)
  }

  return (
    <div className="screen" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ padding: '18px 20px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 className="h2">Dictionary</h1>
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
          {words.length} word{words.length !== 1 ? 's' : ''} available
        </p>
      </div>

      {/* List */}
      <div className="scroll" style={{ padding: '14px 20px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--t3)', fontSize: 14, fontWeight: 600 }}>
            Loading…
          </div>
        )}

        {!loading && words.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '40px 20px',
            color: 'var(--t3)', fontSize: 14, fontWeight: 600,
          }}>
            No words in dictionary yet
          </div>
        )}

        {words.map(entry => {
          const isOpen = expandedId === entry.id
          const alreadyAdded = myWords.has(entry.word.toLowerCase())

          return (
            <div key={entry.id} style={{
              background: 'var(--s1)', borderRadius: 14,
              transition: 'all 0.15s',
            }}>
              <div
                onClick={() => setExpandedId(isOpen ? null : entry.id)}
                style={{
                  padding: '15px 18px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--t1)' }}>{entry.word}</div>
                  {!isOpen && (
                    <div style={{
                      fontSize: 12.5, color: 'var(--t2)', marginTop: 3,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200,
                    }}>
                      {entry.definition}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  {entry.pos && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: 'var(--t2)',
                      background: 'var(--s2)', borderRadius: 8, padding: '3px 9px',
                    }}>
                      {entry.pos}
                    </span>
                  )}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
              </div>

              {isOpen && (
                <div style={{ padding: '0 18px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ height: 1, background: 'var(--border)' }} />

                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--acc)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                      {entry.word}
                    </div>
                  </div>

                  {entry.verb_forms && <VerbForms forms={entry.verb_forms} language={activeLang} />}

                  <p style={{ fontSize: 14.5, fontWeight: 500, lineHeight: 1.55, color: 'var(--t1)', margin: 0 }}>
                    <TappableText text={entry.definition} idPrefix={`d-def-${entry.id}`} selectedId={wt.selectedId} onWordTap={wt.selectWord} disabled={tapDisabled} />
                  </p>
                  {entry.translation_ru && (
                    <div style={{ fontSize: 13, color: 'var(--t2)', fontStyle: 'italic' }}>{entry.translation_ru}</div>
                  )}

                  {entry.patterns?.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)' }}>
                        Usage patterns
                      </span>
                      {entry.patterns.map((p, i) => (
                        <div key={i} style={{
                          background: 'var(--bg)', borderRadius: 10, padding: '9px 13px',
                          fontSize: 14, fontWeight: 500, lineHeight: 1.5, color: 'var(--t1)',
                        }}>
                          <TappablePattern pattern={p} word={entry.word} idPrefix={`d-pat-${entry.id}-${i}`} selectedId={wt.selectedId} onWordTap={wt.selectWord} disabled={tapDisabled} />
                        </div>
                      ))}
                    </div>
                  )}

                  {!tapDisabled && (
                    <div style={{ fontSize: 11.5, color: 'var(--t3)', fontWeight: 600, textAlign: 'center' }}>
                      Tap any word to add it as a card
                    </div>
                  )}

                  <button
                    onClick={(e) => { e.stopPropagation(); handleAdd(entry) }}
                    disabled={alreadyAdded || addingId === entry.id}
                    style={{
                      padding: '11px 16px', borderRadius: 12, border: 'none',
                      fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: alreadyAdded ? 'default' : 'pointer',
                      background: alreadyAdded ? 'var(--s2)' : 'var(--acc)',
                      color: alreadyAdded ? 'var(--t3)' : 'white',
                      transition: 'all 0.15s',
                    }}
                  >
                    {alreadyAdded ? 'Already in your library' : addingId === entry.id ? 'Adding…' : 'Add to my cards'}
                  </button>
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

