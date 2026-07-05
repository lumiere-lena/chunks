import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { normalizeWord } from '../lib/normalizeWord'

const STATUS_ICON = {
  pending: '⏳',
  loading: '⏳',
  done: '✅',
  duplicate: '📋',
  error: '❌',
  inappropriate: '🚫',
}

export default function BulkImportScreen() {
  const { user, activeLang } = useAuth()
  const navigate = useNavigate()

  const [input, setInput] = useState('')
  const [items, setItems] = useState(null)
  const [running, setRunning] = useState(false)
  const abortRef = useRef(false)

  function handleStart() {
    const words = input
      .split(/[\n,]+/)
      .map(w => normalizeWord(w.trim(), activeLang))
      .filter(Boolean)
      .filter((w, i, arr) => arr.indexOf(w) === i)

    if (!words.length) return

    const list = words.map(w => ({ word: w, status: 'pending', detail: '' }))
    setItems(list)
    runImport(list)
  }

  async function runImport(list) {
    setRunning(true)
    abortRef.current = false

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    for (let i = 0; i < list.length; i++) {
      if (abortRef.current) break

      setItems(prev => prev.map((it, j) => j === i ? { ...it, status: 'loading' } : it))

      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-card`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ word: list[i].word, language: activeLang }),
          }
        )
        const data = await res.json()

        if (!res.ok) {
          setItems(prev => prev.map((it, j) => j === i
            ? { ...it, status: data.error === 'inappropriate' ? 'inappropriate' : 'error', detail: data.error || 'failed' }
            : it
          ))
          continue
        }

        const headword = data.word.toLowerCase().trim()
        const { count } = await supabase
          .from('cards')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('language', activeLang)
          .ilike('word', headword)

        if (count > 0) {
          setItems(prev => prev.map((it, j) => j === i
            ? { ...it, status: 'duplicate', detail: data.word }
            : it
          ))
          continue
        }

        const today = new Date().toISOString().split('T')[0]
        const row = {
          user_id: user.id,
          language: activeLang,
          word: data.word,
          pos: data.pos,
          definition: data.definition,
          patterns: data.patterns,
          status: 'new',
          interval_days: 1,
          ease_factor: 2.5,
          next_review_at: today,
        }
        if (data.verb_forms) row.verb_forms = data.verb_forms

        const { error } = await supabase.from('cards').insert(row)
        setItems(prev => prev.map((it, j) => j === i
          ? { ...it, status: error ? 'error' : 'done', detail: data.word }
          : it
        ))
      } catch {
        setItems(prev => prev.map((it, j) => j === i
          ? { ...it, status: 'error', detail: 'network error' }
          : it
        ))
      }
    }
    setRunning(false)
  }

  function handleStop() {
    abortRef.current = true
  }

  const doneCount = items?.filter(it => it.status === 'done').length ?? 0
  const totalCount = items?.length ?? 0
  const finished = items && !running

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
        <h1 className="h2" style={{ marginTop: 12 }}>Import words</h1>
        <p style={{ fontSize: 13.5, color: 'var(--t2)', marginTop: 4 }}>
          Enter words separated by commas or new lines
        </p>
      </div>

      <div className="scroll" style={{ padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Input phase */}
        {!items && (
          <>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={"run\ntake\ngo\nprevailing"}
              rows={8}
              style={{
                width: '100%', background: 'var(--s1)', border: 'none', borderRadius: 14,
                padding: '14px 16px', fontFamily: 'inherit', fontSize: 15, color: 'var(--t1)',
                resize: 'vertical', outline: 'none', lineHeight: 1.6,
                boxSizing: 'border-box',
              }}
            />
            <button
              className="btn btn-acc"
              onClick={handleStart}
              disabled={!input.trim()}
              style={{ opacity: input.trim() ? 1 : 0.5 }}
            >
              Generate cards
            </button>
          </>
        )}

        {/* Progress */}
        {items && (
          <>
            {/* Progress bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                flex: 1, height: 6, background: 'var(--s1)', borderRadius: 3, overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  background: 'var(--acc)',
                  width: `${((items.filter(it => it.status !== 'pending' && it.status !== 'loading').length) / totalCount) * 100}%`,
                  transition: 'width 0.3s',
                }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t2)', whiteSpace: 'nowrap' }}>
                {items.filter(it => it.status !== 'pending' && it.status !== 'loading').length} / {totalCount}
              </span>
            </div>

            {/* Word list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((it, i) => (
                <div key={i} style={{
                  background: 'var(--s1)', borderRadius: 12, padding: '12px 16px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  opacity: it.status === 'pending' ? 0.5 : 1,
                  transition: 'opacity 0.2s',
                }}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--t1)' }}>{it.word}</span>
                    {it.status === 'duplicate' && (
                      <span style={{ fontSize: 12, color: 'var(--t3)', marginLeft: 8 }}>already exists</span>
                    )}
                    {it.status === 'inappropriate' && (
                      <span style={{ fontSize: 12, color: 'var(--t3)', marginLeft: 8 }}>not available</span>
                    )}
                    {it.status === 'error' && (
                      <span style={{ fontSize: 12, color: 'oklch(60% 0.22 20)', marginLeft: 8 }}>failed</span>
                    )}
                  </div>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>
                    {it.status === 'loading' ? (
                      <Spinner />
                    ) : (
                      STATUS_ICON[it.status]
                    )}
                  </span>
                </div>
              ))}
            </div>

            {/* Actions */}
            {running && (
              <button
                onClick={handleStop}
                style={{
                  padding: '12px 20px', borderRadius: 14, border: '1.5px solid var(--border)',
                  background: 'var(--s1)', fontSize: 15, fontWeight: 700, color: 'var(--t1)',
                  fontFamily: 'inherit', cursor: 'pointer',
                }}
              >
                Stop
              </button>
            )}

            {finished && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>
                  {doneCount} card{doneCount !== 1 ? 's' : ''} added
                  {totalCount - doneCount > 0 && `, ${totalCount - doneCount} skipped`}
                </p>
                <button
                  className="btn btn-acc"
                  onClick={() => navigate('/home', { replace: true })}
                >
                  Done
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <div style={{
      width: 18, height: 18, borderRadius: '50%',
      border: '2.5px solid var(--s2)', borderTopColor: 'var(--acc)',
      animation: 'spin 0.7s linear infinite',
    }} />
  )
}
