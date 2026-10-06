import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { todayISO } from '@shared/dates'
import { formatDayDate, formatDuration, formatPace, parseDuration, shotUrl, toKm } from '@shared/format'
import type { ParsedRun } from '@shared/planner'
import type { AppState, Run, RunType, Session, Units } from '@shared/types'
import { Segmented, Spinner } from '../components/ui'

// ── Draft model ────────────────────────────────────────

/** A run being entered or reviewed. Text fields hold what the user typed, in display units. */
export interface Draft {
  id: string
  existing: Run | null
  date: string
  startTime: string
  type: RunType
  distance: string
  time: string
  avgHr: string
  elevation: string
  splits: string[]
  notes: string
  effort: number | null
  source: Run['source']
  screenshotPaths: string[]
  unreadable: string[]
}

const RUN_TYPES: { value: RunType; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'tempo', label: 'Tempo' },
  { value: 'intervals', label: 'Intervals' },
  { value: 'long', label: 'Long' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'race', label: 'Race' },
  { value: 'other', label: 'Other' }
]

export const EFFORT_LABELS = ['', 'Very easy', 'Easy', 'Easy', 'Comfortable', 'Steady', 'Comfortably hard', 'Hard', 'Very hard', 'Near max', 'All out']

const mmss = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`
/** Logged distances keep two decimals (8.21), unlike the plan's rounded ones. */
const show = (km: number, units: Units): string => String(Math.round((units === 'metric' ? km : km / 1.609344) * 100) / 100)
const asType = (t: string | undefined): RunType | null => (t && RUN_TYPES.some((x) => x.value === t) ? (t as RunType) : null)

function blankDraft(session: Session | null, units: Units): Draft {
  return {
    id: crypto.randomUUID(),
    existing: null,
    date: session?.date ?? todayISO(),
    startTime: '',
    type: asType(session?.type) ?? 'easy',
    distance: session ? show(session.distanceKm, units) : '',
    time: '',
    avgHr: '',
    elevation: '',
    splits: [],
    notes: '',
    effort: null,
    source: 'manual',
    screenshotPaths: [],
    unreadable: []
  }
}

export function draftFromRun(run: Run, units: Units): Draft {
  return {
    id: run.id,
    existing: run,
    date: run.date,
    startTime: run.startTime ?? '',
    type: run.type,
    distance: show(run.distanceKm, units),
    time: formatDuration(run.durationSec),
    avgHr: run.avgHr ? String(run.avgHr) : '',
    elevation: run.elevationM !== undefined ? String(Math.round(run.elevationM)) : '',
    splits: run.splits.map(mmss),
    notes: run.notes ?? '',
    effort: run.effort,
    source: run.source,
    screenshotPaths: run.screenshotPaths ?? [],
    unreadable: []
  }
}

function draftFromParsed(p: ParsedRun, images: string[], state: AppState, prefill: Session | null): Draft {
  const units = state.settings.units
  const date = p.date ?? prefill?.date ?? todayISO()
  const planned = state.sessions.find((s) => s.date === date && s.type !== 'rest')
  return {
    ...blankDraft(null, units),
    date,
    startTime: p.startTime ?? '',
    type: asType(p.type) ?? asType(planned?.type) ?? 'easy',
    distance: p.distanceKm ? show(p.distanceKm, units) : '',
    time: p.durationSec ? formatDuration(p.durationSec) : '',
    avgHr: p.avgHr ? String(Math.round(p.avgHr)) : '',
    elevation: p.elevationM !== undefined ? String(Math.round(p.elevationM)) : '',
    splits: (p.splits ?? []).map(mmss),
    source: 'screenshot',
    screenshotPaths: p.imageIndexes.map((i) => images[i]).filter(Boolean),
    unreadable: p.unreadable
  }
}

interface Checked {
  run: Run | null
  errors: Partial<Record<'distance' | 'time' | 'effort' | 'splits' | 'date', string>>
  warning: string | null
  paceSec: number | null
}

/** Validates a draft and builds the run it describes. */
export function checkDraft(d: Draft, units: Units): Checked {
  const errors: Checked['errors'] = {}
  const dist = Number(d.distance.replace(',', '.'))
  const km = Number.isFinite(dist) && dist > 0 ? toKm(dist, units) : null
  const sec = parseDuration(d.time)
  if (!km) errors.distance = 'Add the distance'
  if (!sec) errors.time = 'Add the time, like 46:58'
  if (!d.date) errors.date = 'Pick the date'
  else if (d.date > todayISO()) errors.date = 'That’s in the future'
  if (d.effort === null) errors.effort = 'How hard did it feel?'
  const splits = d.splits.filter((s) => s.trim()).map((s) => parseDuration(s))
  if (splits.some((s) => s === null)) errors.splits = 'Splits look like 5:42'
  else if (km && splits.length > Math.ceil(km)) errors.splits = `That’s more splits than kilometres (${Math.ceil(km)})`
  const paceSec = km && sec ? sec / km : null
  const warning = paceSec && (paceSec < 150 || paceSec > 900) ? `A ${formatPace(paceSec, units)} pace looks unusual. Check the distance and time.` : null

  const ok = Object.keys(errors).length === 0
  const hr = Number(d.avgHr)
  const elev = Number(d.elevation)
  return {
    errors,
    warning,
    paceSec,
    run: ok
      ? {
          id: d.id,
          date: d.date,
          startTime: d.startTime || undefined,
          type: d.type,
          distanceKm: Math.round(km! * 1000) / 1000,
          durationSec: sec!,
          avgHr: d.avgHr.trim() && hr > 0 ? Math.round(hr) : undefined,
          elevationM: d.elevation.trim() && Number.isFinite(elev) ? elev : undefined,
          effort: d.effort!,
          splits: splits as number[],
          notes: d.notes.trim() || undefined,
          source: d.source,
          screenshotPaths: d.screenshotPaths.length ? d.screenshotPaths : undefined,
          isBenchmark: d.existing?.isBenchmark ?? false
        }
      : null
  }
}

// ── The card ───────────────────────────────────────────

type Mode = 'screenshot' | 'manual'
type ShotPhase = { kind: 'idle' } | { kind: 'parsing'; images: string[] } | { kind: 'review'; images: string[]; drafts: Draft[]; index: number } | { kind: 'error'; images: string[]; message: string }

interface Props {
  state: AppState
  /** The planned session to prefill ("Log this run"), if any. */
  prefill: Session | null
  /** An existing run to edit. */
  editing: Run | null
  /** Screenshots to read as soon as the card opens (dropped on another screen). */
  initialFiles?: File[]
  /** Save the run as the benchmark the prediction is based on. */
  asBenchmark?: boolean
  /** Called after saving, deleting or cancelling. */
  onClose: (message?: string) => void
}

export function LogRun({ state, prefill, editing, initialFiles, asBenchmark, onClose }: Props): React.JSX.Element {
  const units = state.settings.units
  const [mode, setMode] = useState<Mode>(editing ? 'manual' : 'screenshot')
  const [manual, setManual] = useState<Draft>(() => (editing ? draftFromRun(editing, units) : blankDraft(prefill, units)))
  const [shot, setShot] = useState<ShotPhase>({ kind: 'idle' })
  const [saving, setSaving] = useState(false)
  const [tried, setTried] = useState(false)
  // Screenshots imported in this session that no saved run has claimed yet.
  const unclaimed = useRef(new Set<string>())

  useEffect(
    () => () => {
      if (unclaimed.current.size) void window.stride.discardScreenshots([...unclaimed.current])
    },
    []
  )

  const parse = useCallback(
    async (images: string[]) => {
      setShot({ kind: 'parsing', images })
      try {
        const found = await window.stride.parseScreenshots(images)
        setShot({ kind: 'review', images, drafts: found.map((p) => draftFromParsed(p, images, state, prefill)), index: 0 })
        setTried(false)
      } catch (e) {
        setShot({ kind: 'error', images, message: friendly(e) })
      }
    },
    [state, prefill]
  )

  const addFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith('image/') || /\.(heic|png|jpe?g|webp|gif)$/i.test(f.name))
      if (images.length === 0) return
      setMode('screenshot')
      try {
        const paths = await window.stride.importScreenshots(await Promise.all(images.map(async (f) => ({ name: f.name || 'pasted.png', data: await f.arrayBuffer() }))))
        paths.forEach((p) => unclaimed.current.add(p))
        // Adding to screenshots already read re-reads them all together, so a forgotten splits screen joins its run.
        const existing = shot.kind === 'idle' ? [] : shot.images
        void parse([...existing, ...paths])
      } catch (e) {
        setShot({ kind: 'error', images: shot.kind === 'idle' ? [] : shot.images, message: friendly(e) })
      }
    },
    [parse, shot]
  )

  // Screenshots dropped elsewhere (the Race screen) are read straight away.
  const started = useRef(false)
  useEffect(() => {
    if (initialFiles?.length && !started.current) {
      started.current = true
      void addFiles(initialFiles)
    }
  }, [initialFiles, addFiles])

  // ⌘V pastes screenshots straight in.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      const files = [...(e.clipboardData?.files ?? [])]
      if (files.length && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        void addFiles(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles])

  const save = async (d: Draft): Promise<boolean> => {
    setTried(true)
    const { run } = checkDraft(d, units)
    if (!run) return false
    setSaving(true)
    try {
      await window.stride.saveRun(asBenchmark ? { ...run, isBenchmark: true } : run)
      d.screenshotPaths.forEach((p) => unclaimed.current.delete(p))
      setTried(false)
      return true
    } finally {
      setSaving(false)
    }
  }

  const saveReviewed = async (): Promise<void> => {
    if (shot.kind !== 'review') return
    const d = shot.drafts[shot.index]
    if (!(await save(d))) return
    const rest = shot.drafts.filter((_, i) => i !== shot.index)
    if (rest.length) setShot({ ...shot, drafts: rest, index: 0 })
    else onClose(savedMessage(state))
  }

  const remove = async (): Promise<void> => {
    if (!editing) return
    await window.stride.deleteRun(editing.id)
    onClose('Run deleted.')
  }

  const title = editing ? 'Edit run' : asBenchmark ? 'Add a benchmark run' : 'Log a run'

  return (
    <section className="card" style={{ padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span className="display" style={{ fontSize: 20, fontWeight: 700 }}>
          {title}
        </span>
        {prefill && !editing && <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{formatDayDate(prefill.date)}</span>}
        {!editing && (
          <div style={{ marginLeft: 'auto' }}>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'manual', label: 'Enter manually' },
                { value: 'screenshot', label: 'From screenshot' }
              ]}
            />
          </div>
        )}
      </div>

      {mode === 'manual' ? (
        <ManualForm draft={manual} onChange={setManual} state={state} tried={tried} />
      ) : (
        <ScreenshotFlow
          phase={shot}
          state={state}
          tried={tried}
          onFiles={addFiles}
          onRetry={() => shot.kind === 'error' && shot.images.length && void parse(shot.images)}
          onChange={(d) => shot.kind === 'review' && setShot({ ...shot, drafts: shot.drafts.map((x, i) => (i === shot.index ? d : x)) })}
          onPick={(i) => shot.kind === 'review' && setShot({ ...shot, index: i })}
          onManual={() => setMode('manual')}
        />
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 'auto' }}>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--muted)' }}>
          {mode === 'screenshot' ? 'Screenshots stay on this Mac.' : editing?.source === 'screenshot' ? 'Logged from a screenshot.' : ''}
        </span>
        {editing && (
          <button className="btn-soft" onClick={remove}>
            Delete
          </button>
        )}
        <button className="btn-soft" onClick={() => onClose()}>
          Cancel
        </button>
        {mode === 'manual' ? (
          <button className="btn-dark" style={{ padding: '11px 22px' }} disabled={saving} onClick={async () => (await save(manual)) && onClose(savedMessage(state))}>
            {editing ? 'Save changes' : 'Save run'}
          </button>
        ) : (
          <button className="btn-dark" style={{ padding: '11px 22px' }} disabled={saving || shot.kind !== 'review'} onClick={saveReviewed}>
            {shot.kind === 'review' && shot.drafts.length > 1 ? `Save run ${shot.index + 1} of ${shot.drafts.length}` : 'Save run'}
          </button>
        )}
      </div>
    </section>
  )
}

function savedMessage(state: AppState): string {
  return state.race ? 'Run saved. The plan is catching up with it.' : 'Run saved.'
}

function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

// ── Manual entry (2f) ──────────────────────────────────

function ManualForm({ draft, onChange, state, tried }: { draft: Draft; onChange: (d: Draft) => void; state: AppState; tried: boolean }): React.JSX.Element {
  const units = state.settings.units
  const set = <K extends keyof Draft>(k: K, v: Draft[K]): void => onChange({ ...draft, [k]: v })
  const { errors, warning } = checkDraft(draft, units)
  const err = (k: keyof typeof errors): string | undefined => (tried ? errors[k] : undefined)

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
        <SmallField label="Date" error={err('date')}>
          <input type="date" value={draft.date} max={todayISO()} onChange={(e) => set('date', e.target.value)} />
        </SmallField>
        <SmallField label="Type">
          <select value={draft.type} onChange={(e) => set('type', e.target.value as RunType)}>
            {RUN_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <span className="suffix">⌄</span>
        </SmallField>
        <SmallField label="Distance" error={err('distance')}>
          <input value={draft.distance} inputMode="decimal" placeholder="8.2" onChange={(e) => set('distance', e.target.value)} />
          <span className="suffix" style={{ color: 'var(--faint)', fontWeight: 400 }}>
            {units === 'metric' ? 'km' : 'mi'}
          </span>
        </SmallField>
        <SmallField label="Time" error={err('time')}>
          <input value={draft.time} placeholder="46:58" onChange={(e) => set('time', e.target.value)} />
        </SmallField>
      </div>
      <PaceLine draft={draft} state={state} warning={warning} />
      <Effort value={draft.effort} onChange={(v) => set('effort', v)} error={err('effort')} />
      <Splits splits={draft.splits} onChange={(v) => set('splits', v)} distance={draft.distance} error={err('splits')} />
      <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minHeight: 0 }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--muted)' }}>Notes</span>
        <textarea
          value={draft.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="How it felt, the conditions, anything niggling"
          style={{ flex: 1, minHeight: 60, padding: 12, borderRadius: 12, background: 'var(--inset)', border: 0, outline: 0, fontSize: 13.5, lineHeight: 1.5, color: 'var(--body-on-tint)', resize: 'none' }}
        />
      </label>
    </>
  )
}

function SmallField({ label, error, children }: { label: string; error?: string; children: ReactNode }): React.JSX.Element {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--muted)' }}>{label}</span>
      <div className={`input${error ? ' invalid' : ''}`}>{children}</div>
      {error && <span className="error-text" style={{ fontSize: 11.5 }}>{error}</span>}
    </label>
  )
}

/** "Average pace 5:44 /km, 6 s faster than planned". */
function PaceLine({ draft, state, warning }: { draft: Draft; state: AppState; warning: string | null }): React.JSX.Element | null {
  const units = state.settings.units
  const { paceSec } = checkDraft(draft, units)
  if (!paceSec) return null
  const planned = state.sessions.find((s) => s.date === draft.date && s.type !== 'rest')?.targetPaceSecPerKm
  let compare = ''
  if (planned) {
    const diff = Math.round((units === 'metric' ? 1 : 1.609344) * (paceSec - planned))
    compare = Math.abs(diff) <= 2 ? ', right on the planned pace' : `, ${Math.abs(diff)} s ${diff < 0 ? 'faster' : 'slower'} than planned`
  }
  return (
    <span style={{ fontSize: 12.5, color: warning ? 'var(--accent-text)' : 'var(--body-2)' }}>
      {warning ?? (
        <>
          Average pace <strong style={{ fontWeight: 700 }}>{formatPace(paceSec, units)}</strong>
          {compare}
        </>
      )}
    </span>
  )
}

function Effort({ value, onChange, error, compact }: { value: number | null; onChange: (v: number) => void; error?: string; compact?: boolean }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 600, color: error ? 'var(--accent-text)' : 'var(--muted)' }}>
        <span>{compact ? 'Effort, add your own' : 'Effort'}</span>
        <span>{value ? `${value} · ${EFFORT_LABELS[value]}` : error ?? 'Tap a number'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: compact ? 4 : 6 }}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button key={n} type="button" className="effort-btn" aria-pressed={value === n} style={{ height: compact ? 28 : 34, borderRadius: compact ? 8 : 10, fontSize: compact ? 12 : 13 }} onClick={() => onChange(n)} title={EFFORT_LABELS[n]}>
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

function Splits({ splits, onChange, distance, error }: { splits: string[]; onChange: (s: string[]) => void; distance: string; error?: string }): React.JSX.Element {
  const max = Math.ceil(Number(distance.replace(',', '.')) || 0)
  const paste = async (): Promise<void> => {
    const text = await navigator.clipboard.readText().catch(() => '')
    const found = text.match(/\b\d{1,2}:[0-5]\d\b/g)
    if (found?.length) onChange(found)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)' }}>
        <span>Splits (optional)</span>
        <button style={{ color: 'var(--accent-text)', fontWeight: 600 }} onClick={paste}>
          Paste from clipboard
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 6 }}>
        {splits.map((s, i) => (
          <label key={i} style={{ padding: '8px 10px', borderRadius: 12, background: 'var(--inset)', display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 10.5, color: 'var(--faint)' }}>km {i + 1}</span>
            <input
              value={s}
              placeholder="5:40"
              onChange={(e) => onChange(splits.map((x, j) => (j === i ? e.target.value : x)))}
              onBlur={(e) => !e.target.value.trim() && onChange(splits.filter((_, j) => j !== i))}
              style={{ border: 0, outline: 0, background: 'transparent', fontSize: 13.5, fontWeight: 700, padding: 0, width: '100%' }}
            />
          </label>
        ))}
        {(max === 0 || splits.length < max) && (
          <button type="button" className="dashed-btn" onClick={() => onChange([...splits, ''])}>
            + km {splits.length + 1}
          </button>
        )}
      </div>
      {error && <span className="error-text" style={{ fontSize: 11.5 }}>{error}</span>}
    </div>
  )
}

// ── From a screenshot (2g) ─────────────────────────────

interface FlowProps {
  phase: ShotPhase
  state: AppState
  tried: boolean
  onFiles: (f: File[]) => void
  onRetry: () => void
  onChange: (d: Draft) => void
  onPick: (i: number) => void
  onManual: () => void
}

function ScreenshotFlow({ phase, state, tried, onFiles, onRetry, onChange, onPick, onManual }: FlowProps): React.JSX.Element {
  const current = phase.kind === 'review' ? phase.drafts[phase.index] : null
  const images = current ? current.screenshotPaths : phase.kind === 'idle' ? [] : phase.images

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px minmax(0, 1fr)', gap: 20 }}>
      <DropZone images={images} busy={phase.kind === 'parsing'} onFiles={onFiles} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        {phase.kind === 'idle' && (
          <Explainer>
            Drop in the screenshots from your watch or running app: the summary, the splits, whatever you have. Several at once is fine, even from different runs. We’ll read them and you check the numbers before saving.
          </Explainer>
        )}
        {phase.kind === 'parsing' && (
          <Explainer>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Spinner /> Reading your screenshot{phase.images.length > 1 ? 's' : ''}…
            </span>
          </Explainer>
        )}
        {phase.kind === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
            <span style={{ fontSize: 13, color: 'var(--body-2)', lineHeight: 1.5 }}>Couldn’t read this screenshot. Try another or enter manually.</span>
            <span className="hint">{phase.message}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {phase.images.length > 0 && (
                <button className="btn-float" onClick={onRetry}>
                  Try again
                </button>
              )}
              <button className="btn-float" onClick={onManual}>
                Enter manually
              </button>
            </div>
          </div>
        )}
        {phase.kind === 'review' && current && (
          <Review draft={current} drafts={phase.drafts} index={phase.index} onPick={onPick} onChange={onChange} state={state} tried={tried} />
        )}
      </div>
    </div>
  )
}

function Explainer({ children }: { children: ReactNode }): React.JSX.Element {
  return <span style={{ fontSize: 13, color: 'var(--body-2)', lineHeight: 1.55, paddingTop: 4 }}>{children}</span>
}

function DropZone({ images, busy, onFiles }: { images: string[]; busy: boolean; onFiles: (f: File[]) => void }): React.JSX.Element {
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const [shown, setShown] = useState(0)
  useEffect(() => setShown(0), [images.join()])

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        onFiles([...e.dataTransfer.files])
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <button
        type="button"
        className="drop-zone"
        data-over={over}
        onClick={() => input.current?.click()}
        style={{ height: images.length > 1 ? 340 : 380, padding: images.length ? 0 : 16 }}
      >
        {images.length > 0 ? (
          <img src={shotUrl(images[Math.min(shown, images.length - 1)])} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: busy ? 0.45 : 1, transition: 'opacity .2s var(--ease)' }} />
        ) : (
          <>
            <span style={{ font: '500 11px ui-monospace, Menlo, monospace', color: 'var(--muted)' }}>watch / app screenshot</span>
            <span style={{ fontSize: 11.5, color: 'var(--faint)' }}>Drag in, paste, or choose a file</span>
          </>
        )}
        {busy && (
          <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <Spinner size={22} />
          </span>
        )}
      </button>
      {images.length > 1 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {images.map((p, i) => (
            <button key={p} onClick={() => setShown(i)} style={{ width: 28, height: 28, borderRadius: 8, overflow: 'hidden', boxShadow: i === shown ? 'inset 0 0 0 2px var(--apricot)' : 'inset 0 0 0 1px var(--ring)', padding: 2 }}>
              <img src={shotUrl(p)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }} />
            </button>
          ))}
        </div>
      )}
      {images.length > 0 && !busy && (
        <button className="dashed-btn" style={{ padding: '8px 0' }} onClick={() => input.current?.click()}>
          + Add a screenshot
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*,.heic"
        multiple
        hidden
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
    </div>
  )
}

function Review({ draft, drafts, index, onPick, onChange, state, tried }: { draft: Draft; drafts: Draft[]; index: number; onPick: (i: number) => void; onChange: (d: Draft) => void; state: AppState; tried: boolean }): React.JSX.Element {
  const units = state.settings.units
  const set = <K extends keyof Draft>(k: K, v: Draft[K]): void => onChange({ ...draft, [k]: v })
  const { errors, warning, paceSec } = checkDraft(draft, units)
  const err = (k: keyof typeof errors): string | undefined => (tried ? errors[k] : undefined)
  const missing = (f: string): boolean => draft.unreadable.includes(f)

  return (
    <>
      {drafts.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {drafts.map((d, i) => (
            <button key={d.id} className="chip-btn" aria-pressed={i === index} onClick={() => onPick(i)}>
              {d.date ? formatDayDate(d.date) : `Run ${i + 1}`}
              {d.distance ? ` · ${d.distance} ${units === 'metric' ? 'km' : 'mi'}` : ''}
            </button>
          ))}
        </div>
      )}
      <span style={{ fontSize: 13, color: 'var(--body-2)' }}>
        {drafts.length > 1 ? `We found ${drafts.length} runs in your screenshots. Check each before saving.` : 'We read these from your screenshot. Check them before saving.'}
      </span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <Tile label="Date" missing={missing('date')} error={err('date')}>
          <input type="date" value={draft.date} max={todayISO()} onChange={(e) => set('date', e.target.value)} />
          <input value={draft.startTime} placeholder="time" onChange={(e) => set('startTime', e.target.value)} style={{ flex: 'none', width: 48, textAlign: 'right' }} />
        </Tile>
        <Tile label="Type">
          <select value={draft.type} onChange={(e) => set('type', e.target.value as RunType)}>
            {RUN_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Tile>
        <Tile label="Distance" missing={missing('distanceKm')} error={err('distance')} unit={units === 'metric' ? 'km' : 'mi'}>
          <input value={draft.distance} inputMode="decimal" placeholder="—" onChange={(e) => set('distance', e.target.value)} />
        </Tile>
        <Tile label="Time" missing={missing('durationSec')} error={err('time')}>
          <input value={draft.time} placeholder="—" onChange={(e) => set('time', e.target.value)} />
        </Tile>
        <Tile label="Avg pace">
          <span style={{ color: paceSec ? undefined : 'var(--faint)' }}>{paceSec ? formatPace(paceSec, units) : '—'}</span>
        </Tile>
        <Tile label="Avg heart rate" missing={missing('avgHr')} unit="bpm">
          <input value={draft.avgHr} inputMode="numeric" placeholder="—" onChange={(e) => set('avgHr', e.target.value)} />
        </Tile>
        <Tile label="Elevation" missing={missing('elevationM')} unit="m">
          <input value={draft.elevation} inputMode="numeric" placeholder="—" onChange={(e) => set('elevation', e.target.value)} />
        </Tile>
      </div>
      {warning && <span className="error-text">{warning}</span>}
      <Tile label={draft.splits.length ? `Splits · ${draft.splits.length} found` : 'Splits'} missing={missing('splits')} error={err('splits')}>
        <input
          value={draft.splits.join(' ')}
          placeholder="—"
          onChange={(e) => set('splits', e.target.value.split(/[\s,]+/).filter(Boolean))}
          style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.5 }}
        />
      </Tile>
      <Effort value={draft.effort} onChange={(v) => set('effort', v)} error={err('effort')} compact />
      <input
        value={draft.notes}
        onChange={(e) => set('notes', e.target.value)}
        placeholder="Notes (optional)"
        style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--inset)', border: 0, outline: 0, fontSize: 13 }}
      />
    </>
  )
}

/** A review field: tinted with an apricot edge when the screenshot didn't show it. */
function Tile({ label, missing, error, unit, children }: { label: string; missing?: boolean; error?: string; unit?: string; children: ReactNode }): React.JSX.Element {
  const flagged = missing || !!error
  return (
    <label
      className="review-tile"
      style={{
        padding: '10px 12px',
        borderRadius: 12,
        background: flagged ? 'var(--hero)' : 'var(--inset)',
        boxShadow: flagged ? 'inset 0 0 0 1.5px var(--apricot)' : undefined,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        minWidth: 0
      }}
    >
      <span style={{ fontSize: 10.5, color: flagged ? 'var(--body-2)' : 'var(--faint)' }}>
        {label}
        {missing ? ' · couldn’t read' : ''}
        {error && !missing ? ` · ${error.toLowerCase()}` : ''}
      </span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, fontSize: 13.5, fontWeight: 700 }}>
        {children}
        {unit && <span style={{ fontWeight: 500, color: 'var(--faint)', fontSize: 12.5 }}>{unit}</span>}
      </span>
    </label>
  )
}
