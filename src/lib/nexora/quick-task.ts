import type { Priority } from "./types"

export interface QuickTaskDraft {
  title: string
  priority: Priority
  scheduledDate?: string
  dueDate?: string
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
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

const PRIORITY_TOKENS: Record<string, Priority> = {
  критический: "critical",
  критично: "critical",
  critical: "critical",
  высокий: "high",
  high: "high",
  средний: "medium",
  medium: "medium",
  низкий: "low",
  low: "low",
  нет: "none",
  none: "none",
}

/**
 * Parses a deliberately small, predictable quick-capture syntax.
 * Examples:
 *   "Позвонить завтра !высокий #работа @офис"
 *   "Оплатить счёт до 2026-12-01"
 *
 * Unknown words are kept as part of the task title.
 */
export function parseQuickTaskInput(input: string, today: string): QuickTaskDraft {
  let remaining = input.trim()
  let priority: Priority = "none"
  let scheduledDate: string | undefined
  let dueDate: string | undefined

  remaining = remaining.replace(/(^|\s)!([\p{L}]+)(?=\s|$)/giu, (match, prefix: string, token: string) => {
    const parsed = PRIORITY_TOKENS[token.toLocaleLowerCase("ru-RU")]
    if (!parsed) return match
    priority = parsed
    return prefix
  })

  remaining = remaining.replace(/(^|\s)до\s+(\d{4}-\d{2}-\d{2})(?=\s|$)/giu, (_match, prefix: string, date: string) => {
    if (!isValidISODate(date)) return _match
    dueDate = date
    return prefix
  })

  const dateTokens: Array<[RegExp, number]> = [
    [/(^|\s)послезавтра(?=\s|$)/giu, 2],
    [/(^|\s)завтра(?=\s|$)/giu, 1],
    [/(^|\s)сегодня(?=\s|$)/giu, 0],
  ]
  for (const [pattern, offset] of dateTokens) {
    remaining = remaining.replace(pattern, (_match, prefix: string) => {
      scheduledDate = addCalendarDays(today, offset)
      return prefix
    })
  }

  remaining = remaining.replace(/(^|\s)(\d{4}-\d{2}-\d{2})(?=\s|$)/gu, (_match, prefix: string, date: string) => {
    if (!isValidISODate(date)) return _match
    scheduledDate = date
    return prefix
  })

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
    tags: [...new Set(tags)],
    contexts: [...new Set(contexts)],
  }
}
