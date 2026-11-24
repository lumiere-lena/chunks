import { useNavigate } from 'react-router-dom'

// Small link icon next to a card's quote from a source: opens the source page
// with all its phrases and exercises.
export default function SourceLink({ sourceId, size = 15 }) {
  const navigate = useNavigate()
  if (!sourceId) return null
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigate(`/sources/${sourceId}`) }}
      aria-label="Open the source"
      title="Open the source"
      style={{
        flexShrink: 0, background: 'none', border: 'none', padding: 4, margin: -4,
        cursor: 'pointer', color: 'var(--t3)', display: 'flex', alignItems: 'center',
      }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      </svg>
    </button>
  )
}
