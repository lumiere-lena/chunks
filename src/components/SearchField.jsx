// The word search shared by Library and Dictionary.
export default function SearchField({ value, onChange }) {
  return (
    <div style={{ padding: '14px 20px 0', flexShrink: 0, position: 'relative' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        style={{ position: 'absolute', left: 34, top: '50%', marginTop: 7, transform: 'translateY(-50%)', pointerEvents: 'none' }}>
        <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        className="input"
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Search words"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        style={{ padding: '12px 16px 12px 42px' }}
      />
    </div>
  )
}
