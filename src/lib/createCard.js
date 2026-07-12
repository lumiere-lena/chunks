import { supabase } from './supabase'

// Generate a card for `word` via the Edge Function and insert it into `cards`.
// Returns { status, word } where status is one of:
//   'done' | 'duplicate' | 'inappropriate' | 'locked' | 'error'
// `word` is the corrected headword returned by the model (when available).
export async function createCardFromWord({ word, language, userId }) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { status: 'error', word }

  let data
  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-card`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ word, language }),
      }
    )
    data = await res.json()

    if (!res.ok) {
      if (data.error === 'inappropriate') return { status: 'inappropriate', word }
      if (data.error === 'subscription_required') return { status: 'locked', word }
      return { status: 'error', word }
    }
  } catch {
    return { status: 'error', word }
  }

  const headword = data.word.toLowerCase().trim()

  const { count } = await supabase
    .from('cards')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('language', language)
    .ilike('word', headword)

  if (count > 0) return { status: 'duplicate', word: data.word }

  const today = new Date().toISOString().split('T')[0]
  const row = {
    user_id: userId,
    language,
    word: data.word,
    pos: data.pos,
    definition: data.definition,
    patterns: data.patterns,
    status: 'new',
    interval_days: 1,
    ease_factor: 2.5,
    next_review_at: today,
  }
  if (data.translation_ru) row.translation_ru = data.translation_ru
  if (data.verb_forms) row.verb_forms = data.verb_forms

  const { error } = await supabase.from('cards').insert(row)
  if (error) return { status: 'error', word: data.word }

  return { status: 'done', word: data.word }
}
