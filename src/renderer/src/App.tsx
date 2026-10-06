import { useState } from 'react'
import { TopBar, type Screen } from './components/TopBar'
import { useAppState } from './useAppState'

export function App(): React.JSX.Element {
  const state = useAppState()
  const [screen, setScreen] = useState<Screen>('home')

  if (!state) return <div style={{ height: '100%', background: 'var(--bg)' }} />

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar screen={screen} onNavigate={setScreen} refresh={state.refresh} onRefresh={() => window.stride.refresh()} />
      <main className="content">
        <Placeholder screen={screen} />
      </main>
    </div>
  )
}

function Placeholder({ screen }: { screen: Screen }): React.JSX.Element {
  return (
    <div className="card" style={{ height: '100%', padding: '26px 28px' }}>
      <span className="display" style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em' }}>
        {screen}
      </span>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>Coming in a later stage.</p>
    </div>
  )
}
