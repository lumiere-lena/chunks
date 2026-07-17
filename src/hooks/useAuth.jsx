import { useState, useEffect, createContext, useContext } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = loading
  const [activeLang, setActiveLangState] = useState(null)
  const [plan, setPlan] = useState(null)
  const [langLoading, setLangLoading] = useState(true)

  useEffect(() => {
    let done = false

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        done = true
        setUser(session?.user ?? null)
        if (session?.user) loadUserData(session.user.id)
        else setLangLoading(false)
      })
      .catch(() => {
        // getSession can reject/hang (e.g. cross-tab refresh lock). Fall back to
        // logged-out so the app shows the login screen instead of a blank page.
        done = true
        setUser(null)
        setLangLoading(false)
      })

    // Safety net: never stay stuck on `undefined` (blank screen) if getSession
    // neither resolves nor rejects within a few seconds.
    const timeout = setTimeout(() => {
      if (!done) {
        setUser(u => (u === undefined ? null : u))
        setLangLoading(false)
      }
    }, 5000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      done = true
      setUser(session?.user ?? null)
      if (session?.user) loadUserData(session.user.id)
      else { setActiveLangState(null); setPlan(null); setLangLoading(false) }
    })
    return () => { clearTimeout(timeout); subscription.unsubscribe() }
  }, [])

  async function loadUserData(userId) {
    try {
      const { data } = await supabase
        .from('users')
        .select('active_language, plan')
        .eq('id', userId)
        .single()
      if (data?.active_language) setActiveLangState(data.active_language)
      setPlan(data?.plan ?? 'free')
    } catch {
      setPlan('free')
    } finally {
      setLangLoading(false)
    }
  }

  async function setActiveLang(lang) {
    setActiveLangState(lang)
    await supabase
      .from('users')
      .update({ active_language: lang })
      .eq('id', user.id)
  }

  async function signUp(email, password, language) {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    // Save chosen language immediately after signup
    if (data.user && language) {
      await supabase
        .from('users')
        .update({ active_language: language })
        .eq('id', data.user.id)
      setActiveLangState(language)
    }
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, activeLang, setActiveLang, plan, langLoading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
