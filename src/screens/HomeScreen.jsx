import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import NavBar from '../components/NavBar'
import { normalizeWord } from '../lib/normalizeWord'

const LANG_META = {
  sr: { flag: '🇷🇸', name: 'Serbian' },
  en: { flag: '🇬🇧', name: 'English' },
}

export default function HomeScreen() {
  const { user, activeLang, setActiveLang, plan, langLoading } = useAuth()
  const navigate = useNavigate()
  const inputRef = useRef(null)

  const [stats, setStats] = useState({ new: 0, learning: 0, mastered: 0 })
  const [dueCount, setDueCount] = useState(0)
  const [word, setWord] = useState('')
  const [statsLoading, setStatsLoading] = useState(true)

  useEffect(() => {
    if (langLoading) return
    if (!activeLang) { setStatsLoading(false); return }
    fetchStats()
  }, [activeLang, langLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchStats() {
    setStatsLoading(true)
    const today = new Date().toISOString().split('T')[0]

    const [{ data: cards }, { count: due }] = await Promise.all([
      supabase
        .from('cards')
        .select('status')
        .eq('user_id', user.id)
        .eq('language', activeLang),
      supabase
        .from('cards')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('language', activeLang)
        .lte('next_review_at', today),
    ])

    const counts = { new: 0, learning: 0, mastered: 0 }
    cards?.forEach(c => { if (counts[c.status] !== undefined) counts[c.status]++ })
    setStats(counts)
    setDueCount(due ?? 0)
    setStatsLoading(false)
  }

  const isFree = plan === 'free'

  function handleSubmit() {
    if (isFree) return
    const normalized = normalizeWord(word, activeLang)
    if (!normalized) return
    navigate('/draft', { state: { word: normalized, language: activeLang } })
  }

  const lang = LANG_META[activeLang] ?? null
  const totalCards = stats.new + stats.learning + stats.mastered

  return (
    <div className="screen" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ padding: '18px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--acc)', letterSpacing: '-0.02em' }}>Chunks</div>
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

      {/* Body */}
      <div className="scroll" style={{ padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            { label: 'New',      value: stats.new,      color: 'var(--new-c)' },
            { label: 'Learning', value: stats.learning,  color: 'var(--learning-c)' },
            { label: 'Mastered', value: stats.mastered,  color: 'var(--mastered-c)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--s1)', borderRadius: 14, padding: '16px 10px', textAlign: 'center' }}>
              <span style={{ display: 'block', fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: statsLoading ? 'var(--t3)' : s.color }}>
                {statsLoading ? '—' : s.value}
              </span>
              <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--t2)', marginTop: 3 }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* No language selected */}
        {!langLoading && !activeLang && (
          <div style={{
            background: 'var(--s1)', borderRadius: 18, padding: '22px 18px',
            display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', textAlign: 'center',
          }}>
            <div style={{ fontSize: 32 }}>🌍</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)' }}>Choose a language</div>
            <div style={{ fontSize: 13, color: 'var(--t2)' }}>Go to Profile to pick the language you're learning</div>
            <button className="btn btn-acc" onClick={() => navigate('/profile')} style={{ marginTop: 4, width: 'auto', padding: '12px 20px' }}>
              Go to Profile
            </button>
          </div>
        )}

        {/* Empty state */}
        {!statsLoading && activeLang && totalCards === 0 && (
          <div style={{
            background: 'var(--s1)', borderRadius: 18, padding: '22px 18px',
            display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', textAlign: 'center',
          }}>
            <div style={{ fontSize: 32 }}>✏️</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)' }}>Add your first word</div>
            <div style={{ fontSize: 13, color: 'var(--t2)' }}>Type a word below — AI will build the card for you</div>
          </div>
        )}

        {/* Due banner */}
        {!statsLoading && activeLang && dueCount > 0 && (
          <div style={{
            background: 'var(--s1)', border: '1.5px solid var(--acc)', borderRadius: 18,
            padding: '18px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t1)' }}>{dueCount} card{dueCount !== 1 ? 's' : ''} due</div>
              <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 3 }}>Ready for review today</div>
            </div>
            <button
              onClick={() => navigate('/study')}
              style={{
                background: 'var(--acc)', color: 'white', border: 'none', borderRadius: 12,
                padding: '11px 16px', fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
                cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              Study →
            </button>
          </div>
        )}

        {/* All caught up */}
        {!statsLoading && activeLang && totalCards > 0 && dueCount === 0 && (
          <div style={{
            background: 'var(--s1)', borderRadius: 18, padding: '18px 18px',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <span style={{ fontSize: 28 }}>🎉</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)' }}>All caught up!</div>
              <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 3 }}>No cards due today. Come back tomorrow.</div>
            </div>
          </div>
        )}

        {/* Word input */}
        <div style={{
          background: 'var(--s1)', borderRadius: 16, padding: 10,
          display: 'flex', alignItems: 'center', gap: 8,
          opacity: isFree ? 0.55 : 1,
        }}>
          <input
            ref={inputRef}
            value={word}
            onChange={e => !isFree && setWord(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder={isFree ? 'Card generation requires a subscription' : 'Add a word or phrase…'}
            disabled={isFree}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontFamily: 'inherit', fontSize: 16, color: 'var(--t1)',
              padding: '8px 8px 8px 10px',
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={isFree || !word.trim()}
            style={{
              width: 42, height: 42,
              background: !isFree && word.trim() ? 'var(--acc)' : 'var(--s2)',
              border: 'none', borderRadius: 11, cursor: !isFree && word.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              transition: 'background 0.15s',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
            </svg>
          </button>
        </div>
        {isFree ? (
          <p style={{ fontSize: 12.5, color: 'var(--t3)', textAlign: 'center', margin: 0 }}>
            Browse the Dictionary to add words to your library
          </p>
        ) : (
          <button
            onClick={() => navigate('/import')}
            style={{
              background: 'none', border: 'none', fontFamily: 'inherit',
              fontSize: 13, fontWeight: 600, color: 'var(--t3)', cursor: 'pointer',
              padding: 0, alignSelf: 'center',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--acc)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--t3)'}
          >
            Import multiple words
          </button>
        )}
      </div>

      <NavBar />
    </div>
  )
}
