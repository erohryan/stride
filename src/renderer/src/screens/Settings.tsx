import { useState, type ReactNode } from 'react'
import { formatDistanceWithUnit, weekdayLong } from '@shared/format'
import type { AppState, Settings as SettingsT, Units, Weekday } from '@shared/types'
import { RunDays, runDaysHint, Segmented, WeekdaySelect } from '../components/ui'

interface Props {
  state: AppState
  onEditProfile: () => void
}

export function Settings({ state, onEditProfile }: Props): React.JSX.Element {
  const s = state.settings
  const save = (patch: Partial<SettingsT>): Promise<void> => window.stride.saveSettings({ ...s, ...patch })

  // Run days re-plan, so they're gathered and applied together.
  const [runDays, setRunDays] = useState<Weekday[]>(s.runDays)
  const [longRunDay, setLongRunDay] = useState<Weekday>(s.longRunDay)
  const weekChanged = runDays.join() !== s.runDays.join() || longRunDay !== s.longRunDay
  const weekError = runDays.length < 2 ? 'Pick at least two days' : !runDays.includes(longRunDay) ? `${weekdayLong(longRunDay)} isn't one of your run days` : null

  const [exported, setExported] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const p = state.profile

  return (
    <div style={{ height: '100%', overflowY: 'auto', margin: '0 -22px', padding: '0 22px' }}>
      <section className="card fade-in" style={{ width: 600, maxWidth: '100%', margin: '0 auto', padding: '26px 28px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <span className="display" style={{ fontSize: 22, fontWeight: 700 }}>
          Settings
        </span>

        <Row title="Units" hint="Distances, paces and temperatures">
          <Segmented<Units>
            value={s.units}
            onChange={(units) => save({ units })}
            options={[
              { value: 'metric', label: 'km · °C' },
              { value: 'imperial', label: 'mi · °F' }
            ]}
          />
        </Row>
        <div className="divider" />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Label title="Run days" hint={weekError ?? runDaysHint(runDays)} error={!!weekError} />
          <RunDays value={runDays} onChange={setRunDays} />
        </div>
        <Row title="Long run day" hint="Weather can still move it a day either way">
          <WeekdaySelect
            value={longRunDay}
            onChange={(d) => {
              setLongRunDay(d)
              if (!runDays.includes(d)) setRunDays([...runDays, d].sort())
            }}
          />
        </Row>
        {weekChanged && (
          <div className="fade-in" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16, background: 'var(--hero)' }}>
            <span style={{ flex: 1, fontSize: 12.5, color: 'var(--body-on-tint)' }}>Changing your week re-plans the sessions from today.</span>
            <button
              className="btn-soft"
              style={{ background: 'transparent' }}
              onClick={() => {
                setRunDays(s.runDays)
                setLongRunDay(s.longRunDay)
              }}
            >
              Cancel
            </button>
            <button className="btn-dark" style={{ padding: '10px 18px' }} disabled={!!weekError} onClick={() => save({ runDays, longRunDay })}>
              Re-plan my week
            </button>
          </div>
        )}
        <div className="divider" />

        <Row title="Reminders" hint={s.reminders.enabled ? 'A nudge the morning after a planned run with nothing logged' : 'Off. Runs to log still show in History and the menu bar.'}>
          {s.reminders.enabled && (
            <div className="input" style={{ width: 110 }}>
              <select value={s.reminders.hour} onChange={(e) => save({ reminders: { ...s.reminders, hour: Number(e.target.value) } })}>
                {[6, 7, 8, 9, 10, 12, 17, 19].map((h) => (
                  <option key={h} value={h}>
                    {h === 12 ? '12 pm' : h > 12 ? `${h - 12} pm` : `${h} am`}
                  </option>
                ))}
              </select>
              <span className="suffix">⌄</span>
            </div>
          )}
          <Switch on={s.reminders.enabled} label="Reminders" onChange={(enabled) => save({ reminders: { ...s.reminders, enabled } })} />
        </Row>
        <Row title="Open at login" hint="Stride starts quietly in the menu bar, so reminders and weather checks keep running">
          <Switch on={state.openAtLogin} label="Open at login" onChange={(on) => window.stride.setOpenAtLogin(on)} />
        </Row>
        <div className="divider" />

        <Row
          title="Your details"
          hint={
            p
              ? [p.name, p.location?.name, `${formatDistanceWithUnit(p.weeklyKm, s.units)} a week`].filter(Boolean).join(' · ')
              : 'Not set'
          }
        >
          <button className="btn-float" style={{ boxShadow: 'none', background: 'var(--inset)' }} onClick={onEditProfile}>
            Edit
          </button>
        </Row>
        <div className="divider" />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Label title="Export plan" hint="Calendar events update when the plan changes" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button
              className="export-tile"
              onClick={() => window.stride.addToCalendar().catch((e) => setExportError(friendly(e)))}
            >
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>Add to Calendar</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                {state.calendar.subscribed ? `Subscribed · ${state.calendar.runs} runs` : 'Subscribe to a live feed'}
              </span>
            </button>
            <button
              className="export-tile"
              onClick={async () => {
                setExportError(null)
                try {
                  const path = await window.stride.exportCsv()
                  if (path) setExported(path.split('/').pop() ?? path)
                } catch (e) {
                  setExportError(friendly(e))
                }
              }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>Export CSV</span>
              <span style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {exported ? `Saved ${exported}` : 'Full plan with paces'}
              </span>
            </button>
          </div>
          {exportError && <span className="error-text">{exportError}</span>}
          {!state.calendar.subscribed && (
            <span className="hint">The feed is served by Stride on this Mac, so Calendar picks up changes while Stride is running.</span>
          )}
        </div>
      </section>
    </div>
  )
}

function Label({ title, hint, error }: { title: string; hint: string; error?: boolean }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: 14, fontWeight: 700 }}>{title}</span>
      <span className={error ? 'error-text' : 'hint'}>{hint}</span>
    </div>
  )
}

function Row({ title, hint, children }: { title: string; hint: string; children: ReactNode }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <Label title={title} hint={hint} />
      {children}
    </div>
  )
}

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }): React.JSX.Element {
  return <button role="switch" aria-checked={on} aria-label={label} className="switch" onClick={() => onChange(!on)} />
}

function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
