import { fitFontSize } from '../lib/headword'

// Verb conjugation chips (V1/V2/V3 for English, 1sg/3pl otherwise).
// Long forms like "comprehended" used to push the row wider than the card, so
// the chips are allowed to shrink and the text scales down to fit.

const SIZES = {
  lg: { gap: 6, radius: 10, padding: '8px 4px', label: 10.5, value: 15 },
  sm: { gap: 6, radius: 8, padding: '6px 4px', label: 9.5, value: 13.5 },
}

// Width the chip row has to work with on the narrowest screen (375px): the
// screen padding and the card padding are already taken out.
const ROW_WIDTH = 299

export default function VerbForms({ forms, language, size = 'lg' }) {
  const s = SIZES[size] ?? SIZES.lg
  const entries = (language === 'en'
    ? [['V1', forms.v1], ['V2', forms.v2], ['V3', forms.v3]]
    : [['ja', forms['1sg']], ['oni/one', forms['3pl']]]
  ).filter(([, value]) => value)

  if (!entries.length) return null

  // Shrink the type when the longest form would otherwise overflow its chip.
  const longest = entries.reduce((a, [, v]) => (String(v).length > a.length ? String(v) : a), '')
  const perChip = (ROW_WIDTH - s.gap * (entries.length - 1)) / entries.length - 10
  const valueSize = fitFontSize(longest, s.value, perChip, { min: 9.5, perChar: 0.63 })

  return (
    <div style={{ display: 'flex', gap: s.gap }}>
      {entries.map(([label, value]) => (
        <div key={label} style={{
          background: 'var(--bg)', borderRadius: s.radius, padding: s.padding,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          flex: '1 1 0', minWidth: 0,
        }}>
          <span style={{ fontSize: s.label, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--t3)' }}>{label}</span>
          <span style={{
            fontSize: valueSize, fontWeight: 700, color: 'var(--acc)',
            maxWidth: '100%', textAlign: 'center', overflowWrap: 'anywhere',
          }}>{value}</span>
        </div>
      ))}
    </div>
  )
}
