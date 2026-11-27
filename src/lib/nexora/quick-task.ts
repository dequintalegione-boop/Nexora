import type { Priority } from "./types"

export interface QuickTaskDraft {
  title: string
  priority: Priority
  scheduledDate?: string
  dueDate?: string
  startAt?: string
  endAt?: string
  tags: string[]
  contexts: string[]
}

function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function addCalendarDays(value: string, amount: number): string {
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + amount)
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-")
}

function addCalendarMonths(value: string, amount: number): string {
  const [year, month, day] = value.split("-").map(Number)
  const target = new Date(year, month - 1 + amount, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(day, lastDay))
  return [target.getFullYear(), String(target.getMonth() + 1).padStart(2, "0"), String(target.getDate()).padStart(2, "0")].join("-")
}

function parseClockTime(value: string): number | undefined {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return undefined
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return undefined
  return hours * 60 + minutes
}

function localDateTime(date: string, minutes: number): string {
  const normalizedDate = minutes >= 1440 ? addCalendarDays(date, 1) : date
  const clockMinutes = minutes % 1440
  return `${normalizedDate}T${String(Math.floor(clockMinutes / 60)).padStart(2, "0")}:${String(clockMinutes % 60).padStart(2, "0")}`
}

const PRIORITY_TOKENS: Record<string, Priority> = {
  критический: "critical", критично: "critical", critical: "critical",
  высокий: "high", high: "high", средний: "medium", medium: "medium",
  низкий: "low", low: "low", нет: "none", none: "none",
}

/**
 * Parses predictable quick-capture syntax for dates, time blocks, priority,
 * tags and contexts. Unknown or invalid phrases remain in the task title.
 */
export function parseQuickTaskInput(input: string, today: string): QuickTaskDraft {
  let remaining = input.trim()
  let priority: Priority = "none"
  let scheduledDate: string | undefined
  let dueDate: string | undefined
  let startAt: string | undefined
  let endAt: string | undefined
  let timeRange: [number, number] | undefined
  let clockTime: number | undefined

  remaining = remaining.replace(/(^|\s)!([\p{L}]+)(?=\s|$)/giu, (match, prefix: string, token: string) => {
    const parsed = PRIORITY_TOKENS[token.toLocaleLowerCase("ru-RU")]
    if (!parsed) return match
    priority = parsed
    return prefix
  })

  remaining = remaining.replace(/(^|\s)до\s+(\d{4}-\d{2}-\d{2})(?=\s|$)/giu, (match, prefix: string, date: string) => {
    if (!isValidISODate(date)) return match
    dueDate = date
    return prefix
  })
  remaining = remaining.replace(/(^|\s)до\s+через\s+(\d{1,3})\s+(день|дня|дней)(?=\s|$)/giu, (match, prefix: string, amountText: string) => {
    const amount = Number(amountText)
    if (amount < 1 || amount > 365) return match
    dueDate = addCalendarDays(today, amount)
    return prefix
  })
  remaining = remaining.replace(/(^|\s)до\s+через\s+(\d{1,2})\s+(неделя|недели|недель)(?=\s|$)/giu, (match, prefix: string, amountText: string) => {
    const amount = Number(amountText)
    if (amount < 1 || amount > 52) return match
    dueDate = addCalendarDays(today, amount * 7)
    return prefix
  })
  remaining = remaining.replace(/(^|\s)до\s+через\s+(\d{1,2})\s+(месяц|месяца|месяцев)(?=\s|$)/giu, (match, prefix: string, amountText: string) => {
    const amount = Number(amountText)
    if (amount < 1 || amount > 24) return match
    dueDate = addCalendarMonths(today, amount)
    return prefix
  })
  remaining = remaining.replace(/(^|\s)до\s+(сегодня|завтра|послезавтра)(?=\s|$)/giu, (_match, prefix: string, token: string) => {
    const normalized = token.toLocaleLowerCase("ru-RU")
    dueDate = addCalendarDays(today, normalized === "сегодня" ? 0 : normalized === "завтра" ? 1 : 2)
    return prefix
  })

  remaining = remaining.replace(/(^|\s)через\s+(\d{1,3})\s+(день|дня|дней)(?=\s|$)/giu, (match, prefix: string, amountText: string) => {
    const amount = Number(amountText)
    if (amount < 1 || amount > 365) return match
    scheduledDate = addCalendarDays(today, amount)
    return prefix
  })
  remaining = remaining.replace(/(^|\s)через\s+(\d{1,2})\s+(неделя|недели|недель)(?=\s|$)/giu, (match, prefix: string, amountText: string) => {
    const amount = Number(amountText)
    if (amount < 1 || amount > 52) return match
    scheduledDate = addCalendarDays(today, amount * 7)
    return prefix
  })
  remaining = remaining.replace(/(^|\s)через\s+(\d{1,2})\s+(месяц|месяца|месяцев)(?=\s|$)/giu, (match, prefix: string, amountText: string) => {
    const amount = Number(amountText)
    if (amount < 1 || amount > 24) return match
    scheduledDate = addCalendarMonths(today, amount)
    return prefix
  })

  for (const [pattern, offset] of [
    [/(^|\s)послезавтра(?=\s|$)/giu, 2],
    [/(^|\s)завтра(?=\s|$)/giu, 1],
    [/(^|\s)сегодня(?=\s|$)/giu, 0],
  ] as Array<[RegExp, number]>) {
    remaining = remaining.replace(pattern, (_match, prefix: string) => {
      scheduledDate = addCalendarDays(today, offset)
      return prefix
    })
  }
  remaining = remaining.replace(/(^|\s)(\d{4}-\d{2}-\d{2})(?=\s|$)/gu, (match, prefix: string, date: string) => {
    if (!isValidISODate(date)) return match
    scheduledDate = date
    return prefix
  })

  // A range is a scheduled time block. An end earlier than the start means
  // the block crosses midnight; equal or invalid times are left untouched.
  remaining = remaining.replace(/(^|\s)с\s+(\d{1,2}:\d{2})\s+до\s+(\d{1,2}:\d{2})(?=\s|$)/giu, (match, prefix: string, from: string, to: string) => {
    const fromMinutes = parseClockTime(from)
    const toMinutes = parseClockTime(to)
    if (fromMinutes === undefined || toMinutes === undefined || fromMinutes === toMinutes) return match
    timeRange = [fromMinutes, toMinutes < fromMinutes ? toMinutes + 1440 : toMinutes]
    return prefix
  })
  remaining = remaining.replace(/(^|\s)в\s+(\d{1,2}:\d{2})(?=\s|$)/giu, (match, prefix: string, value: string) => {
    const parsed = parseClockTime(value)
    if (parsed === undefined) return match
    clockTime = parsed
    return prefix
  })

  if (timeRange || clockTime !== undefined) {
    scheduledDate ??= today
    if (timeRange) {
      startAt = localDateTime(scheduledDate, timeRange[0])
      endAt = localDateTime(scheduledDate, timeRange[1])
    } else if (clockTime !== undefined) {
      startAt = localDateTime(scheduledDate, clockTime)
    }
  }

  const tags: string[] = []
  remaining = remaining.replace(/(^|\s)#([\p{L}\p{N}_-]+)(?=\s|$)/gu, (_match, prefix: string, tag: string) => {
    tags.push(tag)
    return prefix
  })
  const contexts: string[] = []
  remaining = remaining.replace(/(^|\s)@([\p{L}\p{N}_-]+)(?=\s|$)/gu, (_match, prefix: string, context: string) => {
    contexts.push(context)
    return prefix
  })

  return {
    title: remaining.replace(/\s+/g, " ").replace(/\s+([,.?])/g, "$1").trim(),
    priority,
    scheduledDate,
    dueDate,
    startAt,
    endAt,
    tags: [...new Set(tags)],
    contexts: [...new Set(contexts)],
  }
}
