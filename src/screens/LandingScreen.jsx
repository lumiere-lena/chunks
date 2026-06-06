import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const LANGS = [
  { id: 'sr', flag: '🇷🇸', name: 'Serbian',  native: 'srpski jezik' },
  { id: 'en', flag: '🇬🇧', name: 'English',  native: 'English language' },
  { id: 'de', flag: '🇩🇪', name: 'German',   native: 'Deutsch', soon: true },
]

export default function LandingScreen() {
  const [selected, setSelected] = useState(null)
  const navigate = useNavigate()

  return (
    <div className="screen" style={{ background: 'var(--bg)' }}>
      <div className="scroll" style={{ padding: '52px 20px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <div className="logo">Chunks</div>
          <div style={{ fontSize: 14, color: 'var(--t2)', marginTop: 4 }}>Learn words deeply</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h1 className="h1">Build real vocabulary.<br />No translations.</h1>
          <p className="body-text">Add any word you encounter. Get AI-generated cards with definitions and usage patterns in the target language.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="micro">Available languages</div>
          {LANGS.map(l => (
            <button
              key={l.id}
              onClick={() => !l.soon && setSelected(l.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: 16, background: 'var(--s1)',
                border: `2px solid ${selected === l.id ? 'var(--acc)' : 'var(--border)'}`,
                borderRadius: 16, cursor: l.soon ? 'default' : 'pointer',
                opacity: l.soon ? 0.45 : 1,
                background: selected === l.id ? 'var(--acc-dim)' : 'var(--s1)',
                textAlign: 'left', fontFamily: 'inherit', width: '100%',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <span style={{ fontSize: 28 }}>{l.flag}</span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)' }}>{l.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--t2)', marginTop: 1 }}>{l.native}</div>
              </div>
              {l.soon && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--t3)', fontWeight: 600 }}>coming soon</span>}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          className="btn btn-acc"
          disabled={!selected}
          onClick={() => navigate('/signup', { state: { language: selected } })}
        >
          Get started
        </button>
        <button className="btn-text" onClick={() => navigate('/signin')}>Sign in</button>
      </div>
    </div>
  )
}
