import { useLayoutEffect, useRef, useState } from 'react'

// A headword sized to the width it really has. Guessing from the letter count
// kept failing on wide-glyph words ("amendment" is three m's), which then broke
// mid-word. Instead the element takes all the row space left by its siblings
// (flex: 1) and the text is measured in the real font against that width.
const MIN_SIZE = 17
const TRACKING = -0.03 // em, keep in sync with letterSpacing below

let canvas
function textWidth(text, size) {
  canvas ??= document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  ctx.font = `800 ${size}px Manrope, -apple-system, BlinkMacSystemFont, sans-serif`
  return ctx.measureText(text).width + [...text].length * TRACKING * size
}

export default function Headword({ word, base, style }) {
  const ref = useRef(null)
  const [size, setSize] = useState(base)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !word) return
    const fit = () => {
      const avail = el.clientWidth
      if (!avail) return
      const natural = textWidth(word, base)
      // Round down so a half-pixel of rounding never pushes the last letter over.
      const next = natural <= avail ? base : Math.floor((base * avail / natural) * 2) / 2
      setSize(Math.max(MIN_SIZE, next))
    }
    fit()
    // Re-measure once Manrope has loaded (the first pass may use the fallback)
    // and whenever the row changes width.
    document.fonts?.ready.then(fit)
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [word, base])

  return (
    <div ref={ref} style={{
      flex: '1 1 0%', minWidth: 0,
      fontSize: size, fontWeight: 800, color: 'var(--acc)',
      letterSpacing: `${TRACKING}em`, lineHeight: 1.05, overflowWrap: 'anywhere',
      ...style,
    }}>
      {word}
    </div>
  )
}
