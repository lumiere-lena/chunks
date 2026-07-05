import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import NavBar from '../components/NavBar'

const LANGS = [
  { id: 'sr', flag: '🇷🇸', name: 'Serbian', native: 'srpski jezik' },
  { id: 'en', flag: '🇬🇧', name: 'English', native: 'English language' },
]

export default function ProfileScreen() {
  const { user, activeLang, setActiveLang, plan, signOut } = useAuth()
  const navigate = useNavigate()

  const email = user?.email ?? ''
  const initial = email.charAt(0).toUpperCase() || '?'

  async function handleSignOut() {
    await signOut()
    navigate('/', { replace: true })
  }

  return (
    <div className="screen" style={{ background: 'var(--bg)' }}>
      <div className="scroll" style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <h1 className="h2">Profile</h1>

        {/* User */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
            background: 'var(--acc)', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 800,
          }}>
            {initial}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: 15, color: 'var(--t2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {email}
            </div>
          </div>
        </div>

        {/* Active language */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="micro">Active language</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {LANGS.map(l => {
              const active = activeLang === l.id
              return (
                <button
                  key={l.id}
                  onClick={() => setActiveLang(l.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: 15, borderRadius: 16, cursor: 'pointer',
                    background: active ? 'var(--acc-dim)' : 'var(--s1)',
                    border: `2px solid ${active ? 'var(--acc)' : 'transparent'}`,
                    textAlign: 'left', fontFamily: 'inherit', width: '100%',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  <span style={{ fontSize: 26 }}>{l.flag}</span>
                  <div>
                    <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--t1)' }}>{l.name}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--t2)', marginTop: 1 }}>{l.native}</div>
                  </div>
                  {active && (
                    <svg style={{ marginLeft: 'auto', color: 'var(--acc)' }} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Account */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="micro">Account</div>
          <div style={{ background: 'var(--s1)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '15px 18px', borderBottom: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--t1)' }}>Plan</span>
              <span style={{ fontSize: 14.5, color: 'var(--t2)', textTransform: 'capitalize' }}>{plan ?? 'free'}</span>
            </div>
            <button
              onClick={handleSignOut}
              style={{
                width: '100%', background: 'none', border: 'none', fontFamily: 'inherit',
                padding: '15px 18px', textAlign: 'left', cursor: 'pointer',
                fontSize: 15.5, fontWeight: 600, color: 'oklch(60% 0.22 20)',
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      <NavBar />
    </div>
  )
}
