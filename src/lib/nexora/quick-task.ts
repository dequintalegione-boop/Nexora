import type { Priority, TaskStatus } from "./types"

export interface QuickTaskDraft {
  title: string
  priority: Priority
  status?: TaskStatus
  scheduledDate?: string
  dueDate?: string
  startAt?: string
  endAt?: string
  tags: string[]
  contexts: string[]
  /** Project title hint from +Name marker; resolved by caller against existing projects. */
  projectTitle?: string
  estimatedMinutes?: number
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
  критический: "critical",
  критично: "critical",
  critical: "critical",
  высокий: "high",
  high: "high",
  срочно: "high",
  средний: "medium",
  medium: "medium",
  низкий: "low",
  low: "low",
  нет: "none",
  none: "none",
}

const WEEKDAY_TOKENS: Record<string, number> = {
  воскресенье: 0,
  вс: 0,
  понедельник: 1,
  пн: 1,
  вторник: 2,
  вт: 2,
  среда: 3,
  среду: 3,
  ср: 3,
  четверг: 4,
  чт: 4,
  пятница: 5,
  пятницу: 5,
  пт: 5,
  суббота: 6,
  субботу: 6,
  сб: 6,
}

const MONTH_TOKENS: Record<string, number> = {
  января: 1,
  янв: 1,
  февраля: 2,
  фев: 2,
  марта: 3,
  мар: 3,
  апреля: 4,
  апр: 4,
  мая: 5,
  июня: 6,
  июн: 6,
  июля: 7,
  июл: 7,
  августа: 8,
  авг: 8,
  сентября: 9,
  сен: 9,
  сент: 9,
  октября: 10,
  окт: 10,
  ноября: 11,
  ноя: 11,
  декабря: 12,
  дек: 12,
}

const STATUS_TOKENS: Record<string, TaskStatus> = {
  inbox: "inbox",
  входящие: "inbox",
  planned: "planned",
  запланирована: "planned",
  запланировано: "planned",
  in_progress: "in_progress",
  "в_работе": "in_progress",
  "в-работе": "in_progress",
  работа: "in_progress",
  waiting: "waiting",
  ожидает: "waiting",
  done: "done",
  готово: "done",
  cancelled: "cancelled",
  отменена: "cancelled",
  отменено: "cancelled",
}

function nextWeekday(today: string, targetDow: number): string {
  const [year, month, day] = today.split("-").map(Number)
  const date = new Date(year, month - 1, day)
  const current = date.getDay()
  let delta = (targetDow - current + 7) % 7
  if (delta === 0) delta = 7
  return addCalendarDays(today, delta)
}

function resolveNamedDate(day: number, monthName: string, today: string): string | undefined {
  const month = MONTH_TOKENS[monthName.toLocaleLowerCase("ru-RU")]
  if (!month || day < 1 || day > 31) return undefined
  const [y] = today.split("-").map(Number)
  let candidate = `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  if (!isValidISODate(candidate)) return undefined
  if (candidate < today) {
    candidate = `${y + 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    if (!isValidISODate(candidate)) return undefined
  }
  return candidate
}

function lookupWeekday(token: string): number | undefined {
  const fullKey = token.toLocaleLowerCase("ru-RU")
  return (
    WEEKDAY_TOKENS[fullKey] ??
    WEEKDAY_TOKENS[fullKey.replace(/а$/, "")] ??
    WEEKDAY_TOKENS[fullKey.replace(/у$/, "а")] ??
    WEEKDAY_TOKENS[fullKey.replace(/ы$/, "а")]
  )
}

/**
 * Parses predictable quick-capture syntax for dates, time blocks, priority,
 * tags, contexts, project, status and duration estimate.
 * Unknown or invalid phrases remain in the task title.
 */
export function parseQuickTaskInput(input: string, today: string): QuickTaskDraft {
  let remaining = input.trim()
  let priority: Priority = "none"
  let status: TaskStatus | undefined
  let scheduledDate: string | undefined
  let dueDate: string | undefined
  let startAt: string | undefined
  let endAt: string | undefined
  let timeRange: [number, number] | undefined
  let clockTime: number | undefined
  let projectTitle: string | undefined
  let estimatedMinutes: number | undefined

  remaining = remaining.replace(/(^|\s)!([\p{L}]+)(?=\s|$)/giu, (_match, prefix: string, token: string) => {
    const parsed = PRIORITY_TOKENS[token.toLocaleLowerCase("ru-RU")]
    if (!parsed) return match
    priority = parsed
    return prefix
  })

  remaining = remaining.replace(/(^|\s)\*([\p{L}\p{N}_-]+)(?=\s|$)/giu, (match, prefix: string, token: string) => {
    const key = token.toLocaleLowerCase("ru-RU")
    const parsed = STATUS_TOKENS[key]
    // Built-in aliases or raw status id (including custom_* from catalogs)
    status = (parsed ?? token) as TaskStatus
    return prefix
  })

  remaining = remaining.replace(/(^|\s)\+([^\s#@!*+]+(?:\s+[^\s#@!*+]+)*)/gu, (_match, prefix: string, name: string) => {
    projectTitle = name.trim()
    return prefix
  })

  remaining = remaining.replace(
    /(^|\s)(\d+(?:[.,]\d+)?)\s*(минут[аы]?|мин\.?|м|час(?:а|ов)?|ч)(?=\s|$)/giu,
    (match, prefix: string, amountText: string, unit: string) => {
      const amount = Number(amountText.replace(",", "."))
      if (!Number.isFinite(amount) || amount <= 0 || amount > 24 * 60) return match
      const normalized = unit.toLocaleLowerCase("ru-RU")
      const isHour = normalized.startsWith("ч")
      const minutes = Math.round(isHour ? amount * 60 : amount)
      if (minutes < 1 || minutes > 24 * 60) return match
      estimatedMinutes = minutes
      return prefix
    },
  )

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
  remaining = remaining.replace(
    /(^|\s)до\s+(понедельник[а]?|вторник[а]?|сред[уы]|четверг[а]?|пятниц[уы]|суббот[уы]|воскресень[ея]|пн|вт|ср|чт|пт|сб|вс)(?=\s|$)/giu,
    (match, prefix: string, token: string) => {
      const dow = lookupWeekday(token)
      if (dow === undefined) return match
      dueDate = nextWeekday(today, dow)
      return prefix
    },
  )
  remaining = remaining.replace(
    /(^|\s)до\s+(\d{1,2})\s+(января|янв|февраля|фев|марта|мар|апреля|апр|мая|июня|июн|июля|июл|августа|авг|сентября|сент|сен|октября|окт|ноября|ноя|декабря|дек)(?=\s|$)/giu,
    (match, prefix: string, dayText: string, monthName: string) => {
      const resolved = resolveNamedDate(Number(dayText), monthName, today)
      if (!resolved) return match
      dueDate = resolved
      return prefix
    },
  )

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

  remaining = remaining.replace(
    /(^|\s)во?\s+(понедельник|вторник|сред[уы]|четверг|пятниц[уы]|суббот[уы]|воскресенье|пн|вт|ср|чт|пт|сб|вс)(?=\s|$)/giu,
    (match, prefix: string, token: string) => {
      const dow = lookupWeekday(token)
      if (dow === undefined) return match
      scheduledDate = nextWeekday(today, dow)
      return prefix
    },
  )

  remaining = remaining.replace(
    /(^|\s)(\d{1,2})\s+(января|янв|февраля|фев|марта|мар|апреля|апр|мая|июня|июн|июля|июл|августа|авг|сентября|сент|сен|октября|окт|ноября|ноя|декабря|дек)(?=\s|$)/giu,
    (match, prefix: string, dayText: string, monthName: string) => {
      const resolved = resolveNamedDate(Number(dayText), monthName, today)
      if (!resolved) return match
      scheduledDate = resolved
      return prefix
    },
  )

  remaining = remaining.replace(/(^|\s)(\d{4}-\d{2}-\d{2})(?=\s|$)/gu, (match, prefix: string, date: string) => {
    if (!isValidISODate(date)) return match
    scheduledDate = date
    return prefix
  })

  remaining = remaining.replace(
    /(^|\s)с\s+(\d{1,2}:\d{2})\s+до\s+(\d{1,2}:\d{2})(?=\s|$)/giu,
    (match, prefix: string, from: string, to: string) => {
      const fromMinutes = parseClockTime(from)
      const toMinutes = parseClockTime(to)
      if (fromMinutes === undefined || toMinutes === undefined || fromMinutes === toMinutes) return match
      timeRange = [fromMinutes, toMinutes < fromMinutes ? toMinutes + 1440 : toMinutes]
      return prefix
    },
  )
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
    status,
    scheduledDate,
    dueDate,
    startAt,
    endAt,
    tags: [...new Set(tags)],
    contexts: [...new Set(contexts)],
    projectTitle,
    estimatedMinutes,
  }
}
