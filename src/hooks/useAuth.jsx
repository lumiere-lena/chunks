import { useState, useEffect, createContext, useContext } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = loading
  const [activeLang, setActiveLangState] = useState(null)
  const [langLoading, setLangLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadActiveLang(session.user.id)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
      if (session?.user) loadActiveLang(session.user.id)
      else { setActiveLangState(null); setLangLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function loadActiveLang(userId) {
    const { data } = await supabase
      .from('users')
      .select('active_language')
      .eq('id', userId)
      .single()
    if (data?.active_language) setActiveLangState(data.active_language)
    setLangLoading(false)
  }

  async function setActiveLang(lang) {
    setActiveLangState(lang)
    await supabase
      .from('users')
      .update({ active_language: lang })
      .eq('id', user.id)
  }

  async function signUp(email, password) {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, activeLang, setActiveLang, langLoading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
