// Group today's review rows into study sessions and present them newest-first.
//
// There is no session id on the `reviews` table, so sessions are inferred from
// gaps between consecutive reviews: a gap longer than SESSION_GAP_MS starts a
// new session. Within a session, a card is shown once even if reviewed twice.

const SESSION_GAP_MS = 30 * 60 * 1000 // 30 minutes

// reviews: [{ card_id, reviewed_at, cards: { word, translation_ru } }]
// returns: [{ at: Date, words: [{ word, translation }] }] newest session first
export function groupReviewsBySession(reviews) {
  const rows = [...(reviews ?? [])].sort(
    (a, b) => new Date(a.reviewed_at) - new Date(b.reviewed_at)
  )

  const sessions = []
  let current = null
  let lastTime = null

  for (const r of rows) {
    const t = new Date(r.reviewed_at)
    if (!current || t - lastTime > SESSION_GAP_MS) {
      current = { at: t, words: [], seen: new Set() }
      sessions.push(current)
    }
    current.at = t // most recent activity in this session
    lastTime = t
    if (!current.seen.has(r.card_id)) {
      current.seen.add(r.card_id)
      current.words.push({ word: r.cards.word, translation: r.cards.translation_ru })
    }
  }

  return sessions.reverse().map(s => ({ at: s.at, words: s.words }))
}

export function formatSessionTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
