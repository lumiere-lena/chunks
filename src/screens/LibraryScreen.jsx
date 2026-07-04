import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import NavBar from '../components/NavBar'

const LANG_META = {
  sr: 'Serbian',
  en: 'English',
}

const FILTERS = ['all', 'new', 'learning', 'mastered']

const BADGE_STYLES = {
  new:      { color: 'var(--new-c)',      background: 'color-mix(in oklch, var(--new-c) 18%, transparent)' },
  learning: { color: 'var(--learning-c)', background: 'color-mix(in oklch, var(--learning-c) 18%, transparent)' },
  mastered: { color: 'var(--mastered-c)', background: 'color-mix(in oklch, var(--mastered-c) 18%, transparent)' },
}

export default function LibraryScreen() {
  const { user, activeLang } = useAuth()
  const [cards, setCards] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchCards() }, [activeLang]) // eslint-disable-line

  async function fetchCards() {
    setLoading(true)
    const { data } = await supabase
      .from('cards')
      .select('id, word, definition, status, created_at')
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
  const langName = LANG_META[activeLang] ?? activeLang

  return (
    <div className="screen" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 0', flexShrink: 0 }}>
        <h1 className="h2">Library</h1>
        <p style={{ fontSize: 13.5, color: 'var(--t2)', marginTop: 4 }}>
          {cards.length} word{cards.length !== 1 ? 's' : ''} · {langName}
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

        {filtered.map(card => (
          <div key={card.id} style={{
            background: 'var(--s1)', borderRadius: 14, padding: '15px 18px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--t1)' }}>{card.word}</div>
              <div style={{
                fontSize: 12.5, color: 'var(--t2)', marginTop: 3,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 170,
              }}>
                {card.definition}
              </div>
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
                onClick={() => handleDelete(card.id)}
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
        ))}
      </div>

      <NavBar />
    </div>
  )
}
