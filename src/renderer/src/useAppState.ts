import { useEffect, useState } from 'react'
import type { AppState } from '@shared/types'

/** Subscribes to main-process state. Null until the first load. */
export function useAppState(): AppState | null {
  const [state, setState] = useState<AppState | null>(null)
  useEffect(() => {
    let live = true
    window.stride.getState().then((s) => live && setState(s))
    const off = window.stride.onState(setState)
    return () => {
      live = false
      off()
    }
  }, [])
  return state
}
