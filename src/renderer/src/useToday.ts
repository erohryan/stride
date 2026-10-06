import { useEffect, useState } from 'react'
import { todayISO } from '@shared/dates'
import type { ISODate } from '@shared/types'

/** Today's date, rolling over at midnight while the app stays open. */
export function useToday(): ISODate {
  const [today, setToday] = useState(todayISO)
  useEffect(() => {
    const t = setInterval(() => setToday((prev) => (prev === todayISO() ? prev : todayISO())), 30_000)
    return () => clearInterval(t)
  }, [])
  return today
}
