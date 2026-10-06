import { useState } from 'react'
import { TopBar, type Screen } from './components/TopBar'
import type { Session } from '@shared/types'
import { Home } from './screens/Home'
import { AboutYou, BuildingPlan, RaceSetup } from './screens/Onboarding'
import { Week } from './screens/Week'
import { useAppState } from './useAppState'
import { useToday } from './useToday'

export function App(): React.JSX.Element {
  const state = useAppState()
  const [screen, setScreen] = useState<Screen>('home')
  const [editingProfile, setEditingProfile] = useState(false)
  // The session "Log this run" was pressed for; History (stage 4) opens Log a run prefilled with it.
  const [, setLogDraft] = useState<Session | null>(null)
  const today = useToday()

  if (!state) return <div style={{ height: '100%', background: 'var(--bg)' }} />

  // First run: about you → race → build. The nav appears once a plan exists.
  let body: React.JSX.Element
  let onboarding = true
  if (!state.profile || editingProfile) {
    body = <AboutYou state={state} onDone={() => setEditingProfile(false)} />
  } else if (!state.race) {
    body = <RaceSetup state={state} onBack={() => setEditingProfile(true)} />
  } else if (state.weeks.length === 0) {
    body = <BuildingPlan state={state} />
  } else {
    onboarding = false
    const logRun = (s: Session | null): void => {
      setLogDraft(s)
      setScreen('history')
    }
    body =
      screen === 'home' ? (
        <Home state={state} today={today} onLogRun={logRun} />
      ) : screen === 'week' ? (
        <Week state={state} today={today} onLogRun={logRun} />
      ) : (
        <Placeholder screen={screen} />
      )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <TopBar
        screen={onboarding ? null : screen}
        onNavigate={setScreen}
        refresh={state.refresh}
        onRefresh={onboarding ? undefined : () => window.stride.refresh()}
      />
      {!onboarding && state.refresh.error && <ErrorStrip message={state.refresh.error} />}
      <main className="content">{body}</main>
    </div>
  )
}

function ErrorStrip({ message }: { message: string }): React.JSX.Element {
  return (
    <div className="fade-in" style={{ margin: '0 22px 12px', padding: '10px 16px', borderRadius: 14, background: 'var(--hero)', fontSize: 12.5, color: 'var(--body-on-tint)' }}>
      <b style={{ fontWeight: 700 }}>The plan couldn't refresh.</b> {message}
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
