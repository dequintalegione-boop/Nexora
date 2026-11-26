import { addDays as dfAddDays, format, parseISO, startOfWeek as dfStartOfWeek } from "date-fns"
import { ru } from "date-fns/locale"

export function isoDate(d: Date = new Date()): string {
  return format(d, "yyyy-MM-dd")
}

export function addDays(date: string, n: number): string {
  return isoDate(dfAddDays(parseISO(date), n))
}

export function startOfWeek(date: string, weekStartsOn: 0 | 1 = 1): string {
  return isoDate(dfStartOfWeek(parseISO(date), { weekStartsOn }))
}

export function parseISODate(date: string): Date {
  return parseISO(date)
}

export { format, ru }
