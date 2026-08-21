// Long words used to overflow their container (a 38px headword like
// "condescending", a verb form like "comprehended"). Scale the type down to the
// width the text actually has instead.
// `avail` is the usable width in px at the narrowest supported screen (375).
// `perChar` is the measured average glyph width in em: tight headwords
// (weight 800, -0.035em tracking) run ~0.55, plain bold text ~0.62.
export function fitFontSize(text, base, avail, { min = 20, perChar = 0.56 } = {}) {
  const len = [...(text ?? '')].length
  if (!len) return base
  const fit = avail / (len * perChar)
  return Math.max(min, Math.min(base, Math.round(fit * 2) / 2))
}

export const headwordSize = (word, base, avail) => fitFontSize(word, base, avail, { min: 20 })
