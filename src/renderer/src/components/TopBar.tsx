import type { RefreshState } from '@shared/types'

export type Screen = 'home' | 'week' | 'history' | 'race' | 'settings'

const NAV: { id: Screen; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'week', label: 'This week' },
  { id: 'history', label: 'History' },
  { id: 'race', label: 'Race' },
  { id: 'settings', label: 'Settings' }
]

interface Props {
  screen: Screen | null // null hides the nav (onboarding)
  onNavigate: (s: Screen) => void
  refresh: RefreshState | null
  onRefresh?: () => void
}

export function TopBar({ screen, onNavigate, refresh, onRefresh }: Props): React.JSX.Element {
  const isMac = window.stride.platform === 'darwin'
  return (
    <header className="topbar" style={isMac ? undefined : { paddingRight: 160 }}>
      {/* The system draws the traffic lights here: 3 × 12pt + 2 × 8pt gaps, then the design's 16pt gap. */}
      {isMac && <div style={{ width: 52 + 16, flex: 'none' }} />}
      <span className="wordmark" style={isMac ? { marginLeft: 10 } : { marginLeft: 0 }}>
        Stride
      </span>
      {screen && (
        <nav className="nav">
          {NAV.map((n) => (
            <button key={n.id} aria-current={screen === n.id ? 'page' : undefined} onClick={() => onNavigate(n.id)}>
              {n.label}
            </button>
          ))}
        </nav>
      )}
      {onRefresh && refresh && (
        <button className="btn-float" style={{ marginLeft: 'auto' }} disabled={refresh.running} onClick={onRefresh}>
          {refresh.running && <span className="spinner" />}
          {refresh.running ? 'Refreshing…' : 'Refresh plan'}
        </button>
      )}
    </header>
  )
}
