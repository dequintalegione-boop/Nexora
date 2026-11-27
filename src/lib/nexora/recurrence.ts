import type { RecurrenceRule, Task } from "./types"

const DAY_MS = 86_400_000
const MAX_SCAN_DAYS = 36_600
const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const
const WEEKDAY_BY_CODE = new Map(WEEKDAY_CODES.map((code, index) => [code, index]))

export interface RecurrenceOccurrence {
  date: string
  number: number
}

export interface TaskOccurrenceView {
  seriesId: string
  occurrenceDate: string
  occurrenceNumber: number
  isVirtual: boolean
  task: Task
}

export interface ParsedICalendarRecurrence {
  rule: RecurrenceRule
  startDate?: string
}

function dateOrdinal(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day, 12))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null
  }
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS)
}

function ordinalDate(value: number): string {
  const date = new Date(value * DAY_MS)
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-")
}

function weekdayAt(value: number): number {
  return new Date(value * DAY_MS).getUTCDay()
}

function monthLength(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0, 12)).getUTCDate()
}

function safeInterval(rule: RecurrenceRule): number {
  return Number.isInteger(rule.interval) && rule.interval > 0
    ? Math.min(rule.interval, 10_000)
    : 1
}

function effectiveByDays(rule: RecurrenceRule): Array<{ weekday: number; ordinal?: number }> {
  if (rule.byDay?.length) {
    return rule.byDay.filter((item) =>
      Number.isInteger(item.weekday) &&
      item.weekday >= 0 &&
      item.weekday <= 6 &&
      (item.ordinal === undefined ||
        (Number.isInteger(item.ordinal) && item.ordinal !== 0 && Math.abs(item.ordinal) <= 5))
    )
  }
  if (rule.frequency === "weekly" && rule.weekdays?.length) {
    return rule.weekdays
      .filter((weekday) => Number.isInteger(weekday) && weekday >= 0 && weekday <= 6)
      .map((weekday) => ({ weekday }))
  }
  return []
}

function matchesOrdinalWeekday(
  value: number,
  weekday: number,
  ordinal: number,
  yearly: boolean,
): boolean {
  const date = new Date(value * DAY_MS)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  const daysInMonth = monthLength(year, month)
  const actualWeekday = date.getUTCDay()
  if (actualWeekday !== weekday) return false

  if (!yearly) {
    const position = ordinal > 0
      ? Math.floor((day - 1) / 7) + 1
      : Math.floor((daysInMonth - day) / 7) + 1
    return position === Math.abs(ordinal)
  }

  const yearStart = Math.floor(Date.UTC(year, 0, 1, 12) / DAY_MS)
  const yearEnd = Math.floor(Date.UTC(year + 1, 0, 1, 12) / DAY_MS) - 1
  const position = ordinal > 0
    ? Math.floor((value - yearStart) / 7) + 1
    : Math.floor((yearEnd - value) / 7) + 1
  return position === Math.abs(ordinal)
}

function matchesByDay(value: number, rule: RecurrenceRule): boolean {
  const byDays = effectiveByDays(rule)
  if (byDays.length === 0) return true
  const weekday = weekdayAt(value)
  const yearlyOrdinal = rule.frequency === "yearly" && !(rule.byMonth?.length)
  return byDays.some((item) => {
    if (!Number.isInteger(item.weekday) || item.weekday < 0 || item.weekday > 6) return false
    if (weekday !== item.weekday) return false
    if (item.ordinal === undefined) return true
    if (!Number.isInteger(item.ordinal) || item.ordinal === 0 || Math.abs(item.ordinal) > 5) return false
    return matchesOrdinalWeekday(value, item.weekday, item.ordinal, yearlyOrdinal)
  })
}

function matchesByMonthDay(value: number, monthDays: number[]): boolean {
  const date = new Date(value * DAY_MS)
  const day = date.getUTCDate()
  const lastDay = monthLength(date.getUTCFullYear(), date.getUTCMonth())
  return monthDays.some((monthDay) => {
    if (!Number.isInteger(monthDay) || monthDay === 0 || Math.abs(monthDay) > 31) return false
    return monthDay > 0 ? day === monthDay : day === lastDay + monthDay + 1
  })
}

function matchesRuleDate(value: number, startValue: number, rule: RecurrenceRule): boolean {
  if (value === startValue) return true
  if (value < startValue) return false

  const interval = safeInterval(rule)
  const date = new Date(value * DAY_MS)
  const start = new Date(startValue * DAY_MS)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const startYear = start.getUTCFullYear()
  const startMonth = start.getUTCMonth()
  const diffDays = value - startValue
  const diffMonths = (year - startYear) * 12 + month - startMonth

  if (rule.frequency === "daily" && diffDays % interval !== 0) return false
  if (rule.frequency === "weekly") {
    const weekStart = Number.isInteger(rule.weekStart) && rule.weekStart! >= 0 && rule.weekStart! <= 6
      ? rule.weekStart!
      : 1
    const startWeek = startValue - ((weekdayAt(startValue) - weekStart + 7) % 7)
    const currentWeek = value - ((weekdayAt(value) - weekStart + 7) % 7)
    const weekDifference = Math.floor((currentWeek - startWeek) / 7)
    if (weekDifference < 0 || weekDifference % interval !== 0) return false
  }
  if (rule.frequency === "monthly" && (diffMonths < 0 || diffMonths % interval !== 0)) return false
  if (rule.frequency === "yearly" && (year - startYear < 0 || (year - startYear) % interval !== 0)) return false

  if (rule.byMonth?.length && !rule.byMonth.includes(month + 1)) return false
  if (rule.byMonthDay?.length && !matchesByMonthDay(value, rule.byMonthDay)) return false
  if (!matchesByDay(value, rule)) return false

  const hasByMonthDay = Boolean(rule.byMonthDay?.length)
  const hasByDay = effectiveByDays(rule).length > 0
  if (!hasByMonthDay && !hasByDay) {
    const startDay = start.getUTCDate()
    if (rule.frequency === "weekly" && weekdayAt(value) !== weekdayAt(startValue)) return false
    if (rule.frequency === "monthly") {
      if (date.getUTCDate() !== Math.min(startDay, monthLength(year, month))) return false
    }
    if (rule.frequency === "yearly") {
      const expectedMonth = rule.byMonth?.length
        ? rule.byMonth.includes(month + 1)
        : month === startMonth
      if (!expectedMonth || date.getUTCDate() !== Math.min(startDay, monthLength(year, month))) return false
    }
  }

  return true
}

function validUntil(rule: RecurrenceRule): number | null {
  if (!rule.until) return null
  return dateOrdinal(rule.until)
}

function isExcluded(date: string, rule: RecurrenceRule, extraExcluded: string[]): boolean {
  return (rule.excludeDates ?? []).includes(date) || extraExcluded.includes(date)
}

/** Expand a rule within a date range without creating persisted task records. */
export function getRecurrenceOccurrences(
  rule: RecurrenceRule,
  startDate: string,
  rangeStart: string,
  rangeEnd: string,
  extraExcluded: string[] = [],
  maxOccurrences = 10_000,
): RecurrenceOccurrence[] {
  const start = dateOrdinal(startDate)
  const from = dateOrdinal(rangeStart)
  const to = dateOrdinal(rangeEnd)
  if (start === null || from === null || to === null || to < from || to < start) return []

  const until = validUntil(rule)
  if (rule.until && until === null) return []
  const lastDay = Math.min(to, start + MAX_SCAN_DAYS, until ?? Number.MAX_SAFE_INTEGER)
  const results: RecurrenceOccurrence[] = []
  let occurrenceNumber = 0

  for (let cursor = start; cursor <= lastDay; cursor += 1) {
    if (!matchesRuleDate(cursor, start, rule)) continue
    occurrenceNumber += 1
    if (rule.count != null && occurrenceNumber > rule.count) break
    if (cursor < from) continue
    const date = ordinalDate(cursor)
    if (isExcluded(date, rule, extraExcluded)) continue
    results.push({ date, number: occurrenceNumber })
    if (results.length >= maxOccurrences) break
  }

  return results
}

/** Find the next eligible occurrence while respecting COUNT, UNTIL and exclusions. */
export function getNextRecurrenceOccurrence(
  rule: RecurrenceRule,
  startDate: string,
  afterDate: string,
  extraExcluded: string[] = [],
): RecurrenceOccurrence | null {
  const start = dateOrdinal(startDate)
  const after = dateOrdinal(afterDate)
  if (start === null || after === null) return null

  const until = validUntil(rule)
  if (rule.until && until === null) return null
  const lastDay = Math.min(start + MAX_SCAN_DAYS, until ?? Number.MAX_SAFE_INTEGER)
  let occurrenceNumber = 0

  for (let cursor = start; cursor <= lastDay; cursor += 1) {
    if (!matchesRuleDate(cursor, start, rule)) continue
    occurrenceNumber += 1
    if (rule.count != null && occurrenceNumber > rule.count) return null
    if (cursor <= after) continue
    const date = ordinalDate(cursor)
    if (isExcluded(date, rule, extraExcluded)) continue
    return { date, number: occurrenceNumber }
  }
  return null
}

function shiftDate(date: string, days: number): string {
  const value = dateOrdinal(date)
  return value === null ? date : ordinalDate(value + days)
}

function dateDifference(left: string, right: string): number {
  const leftValue = dateOrdinal(left)
  const rightValue = dateOrdinal(right)
  return leftValue === null || rightValue === null ? 0 : leftValue - rightValue
}

function shiftDateTime(value: string | undefined, days: number): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return value
  return shiftDate(value.slice(0, 10), days) + value.slice(10)
}

function taskRule(task: Task): RecurrenceRule | undefined {
  return task.recurrenceRule ?? (task.repeat ? { frequency: task.repeat, interval: 1 } : undefined)
}

/** Build only the occurrences needed for a visible calendar window. */
export function expandTaskOccurrences(
  tasks: Task[],
  rangeStart: string,
  rangeEnd: string,
): TaskOccurrenceView[] {
  const from = dateOrdinal(rangeStart)
  const to = dateOrdinal(rangeEnd)
  if (from === null || to === null || to < from) return []

  const output: TaskOccurrenceView[] = []
  const roots = tasks.filter((task) => taskRule(task) && (task.recurrenceParentId ?? task.id) === task.id)

  for (const root of roots) {
    if (root.deletedAt || root.archived) continue
    const rule = taskRule(root)!
    const startDate = root.recurrenceStartDate ?? root.occurrenceDate ?? root.scheduledDate ?? root.dueDate ?? root.startAt?.slice(0, 10)
    if (!startDate) continue

    const scheduledAnchor = root.recurrenceStartScheduledDate ?? root.scheduledDate
    const dueAnchor = root.recurrenceStartDueDate ?? root.dueDate
    const startAtAnchor = root.recurrenceStartStartAt ?? root.startAt
    const endAtAnchor = root.recurrenceStartEndAt ?? root.endAt
    const scheduledOffset = scheduledAnchor ? dateDifference(scheduledAnchor, startDate) : 0
    const dueOffset = dueAnchor ? dateDifference(dueAnchor, startDate) : 0
    const startAtOffset = startAtAnchor ? dateDifference(startAtAnchor.slice(0, 10), startDate) : 0
    const endAtOffset = endAtAnchor ? dateDifference(endAtAnchor.slice(0, 10), startDate) : 0
    const offsets = [
      scheduledAnchor ? scheduledOffset : 0,
      dueAnchor ? dueOffset : 0,
      startAtAnchor ? startAtOffset : 0,
      endAtAnchor ? endAtOffset : 0,
    ]
    const minOffset = Math.min(...offsets)
    const maxOffset = Math.max(...offsets)
    const occurrenceRangeStart = shiftDate(rangeStart, -maxOffset)
    const occurrenceRangeEnd = shiftDate(rangeEnd, -minOffset)

    const materialized = new Map<string, Task>()
    for (const candidate of tasks) {
      if (candidate.id === root.id) {
        materialized.set(candidate.occurrenceDate ?? startDate, candidate)
      } else if (candidate.recurrenceParentId === root.id && candidate.occurrenceDate) {
        materialized.set(candidate.occurrenceDate, candidate)
      }
    }

    const excluded = [...(root.skippedOccurrences ?? [])]
    const occurrences = getRecurrenceOccurrences(
      rule,
      startDate,
      occurrenceRangeStart,
      occurrenceRangeEnd,
      excluded,
    )

    const renderedTaskIds = new Set<string>()
    for (const occurrence of occurrences) {
      const existing = materialized.get(occurrence.date)
      let occurrenceTask: Task
      let isVirtual = false

      if (existing) {
        occurrenceTask = existing
      } else {
        const offset = dateDifference(occurrence.date, startDate)
        occurrenceTask = {
          ...root,
          id: root.id + "::" + occurrence.date,
          status: "planned",
          completedAt: undefined,
          archived: false,
          archivedAt: undefined,
          deletedAt: undefined,
          recurrenceParentId: root.id,
          recurrenceRule: undefined,
          repeat: undefined,
          occurrenceDate: occurrence.date,
          occurrenceNumber: occurrence.number,
          scheduledDate: scheduledAnchor ? shiftDate(scheduledAnchor, offset) : undefined,
          dueDate: dueAnchor ? shiftDate(dueAnchor, offset) : undefined,
          startAt: shiftDateTime(startAtAnchor, offset),
          endAt: shiftDateTime(endAtAnchor, offset),
          recurrenceStartDate: startDate,
          recurrenceStartScheduledDate: scheduledAnchor,
          recurrenceStartDueDate: dueAnchor,
          recurrenceStartStartAt: startAtAnchor,
          recurrenceStartEndAt: endAtAnchor,
          skippedOccurrences: undefined,
          history: undefined,
        }
        isVirtual = true
      }

      if (occurrenceTask.deletedAt || occurrenceTask.archived) continue
      const visibleDates = [
        occurrenceTask.scheduledDate,
        occurrenceTask.dueDate,
        occurrenceTask.startAt?.slice(0, 10),
      ].filter((value): value is string => Boolean(value))
      const isInRange = visibleDates.length
        ? visibleDates.some((date) => {
            const value = dateOrdinal(date)
            return value !== null && value >= from && value <= to
          })
        : occurrence.date >= rangeStart && occurrence.date <= rangeEnd
      if (!isInRange) continue

      output.push({
        seriesId: root.id,
        occurrenceDate: occurrence.date,
        occurrenceNumber: occurrenceTask.occurrenceNumber ?? occurrence.number,
        isVirtual,
        task: occurrenceTask,
      })
      renderedTaskIds.add(occurrenceTask.id)
    }

    // Keep saved instances visible even when a later series edit moves them off the new RRULE dates.
    for (const [date, savedTask] of materialized) {
      if (renderedTaskIds.has(savedTask.id) || savedTask.deletedAt || savedTask.archived) continue
      const visibleDates = [
        savedTask.scheduledDate,
        savedTask.dueDate,
        savedTask.startAt?.slice(0, 10),
      ].filter((value): value is string => Boolean(value))
      const isInRange = visibleDates.length
        ? visibleDates.some((value) => {
            const ordinal = dateOrdinal(value)
            return ordinal !== null && ordinal >= from && ordinal <= to
          })
        : date >= rangeStart && date <= rangeEnd
      if (!isInRange) continue
      output.push({
        seriesId: root.id,
        occurrenceDate: date,
        occurrenceNumber: savedTask.occurrenceNumber ?? 1,
        isVirtual: false,
        task: savedTask,
      })
      renderedTaskIds.add(savedTask.id)
    }
  }

  return output.sort((left, right) =>
    left.occurrenceDate.localeCompare(right.occurrenceDate) ||
    left.seriesId.localeCompare(right.seriesId),
  )
}

function dateToIcal(value: string): string {
  if (dateOrdinal(value) === null) throw new Error("Дата повторения должна быть в формате YYYY-MM-DD.")
  return value.replaceAll("-", "")
}

function dateFromIcal(value: string): string {
  const trimmed = value.trim()
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(trimmed)
  if (match) {
    const normalized = match[1] + "-" + match[2] + "-" + match[3]
    if (dateOrdinal(normalized) !== null) return normalized
  }
  if (dateOrdinal(trimmed) !== null) return trimmed
  throw new Error("Ожидалась дата без времени в правиле повторения: " + value)
}

/** Export a date-only iCalendar DTSTART/RRULE/EXDATE block. */
export function formatICalendarRecurrence(rule: RecurrenceRule, startDate: string): string {
  if (rule.count != null && rule.until) {
    throw new Error("RFC 5545 не допускает одновременное использование COUNT и UNTIL.")
  }
  const fields = ["FREQ=" + rule.frequency.toUpperCase()]
  const interval = safeInterval(rule)
  if (interval !== 1) fields.push("INTERVAL=" + interval)
  if (rule.byMonth?.length) fields.push("BYMONTH=" + [...new Set(rule.byMonth)].join(","))
  if (rule.byMonthDay?.length) fields.push("BYMONTHDAY=" + [...new Set(rule.byMonthDay)].join(","))
  const byDays = effectiveByDays(rule)
  if (byDays.length) {
    const values = byDays.map((item) => {
      if (!Number.isInteger(item.weekday) || item.weekday < 0 || item.weekday > 6) {
        throw new Error("В BYDAY указан неизвестный день недели.")
      }
      const ordinal = item.ordinal ?? ""
      if (ordinal !== "" && (!Number.isInteger(ordinal) || ordinal === 0 || Math.abs(ordinal) > 5)) {
        throw new Error("Порядковый номер BYDAY должен быть от -5 до -1 или от 1 до 5.")
      }
      return String(ordinal) + WEEKDAY_CODES[item.weekday]
    })
    fields.push("BYDAY=" + [...new Set(values)].join(","))
  }
  if (rule.weekStart !== undefined) {
    if (!Number.isInteger(rule.weekStart) || rule.weekStart < 0 || rule.weekStart > 6) {
      throw new Error("WKST должен быть днём недели от 0 до 6.")
    }
    fields.push("WKST=" + WEEKDAY_CODES[rule.weekStart])
  }
  if (rule.count !== undefined) {
    if (!Number.isInteger(rule.count) || rule.count < 1) throw new Error("COUNT должен быть положительным целым числом.")
    fields.push("COUNT=" + rule.count)
  }
  if (rule.until) fields.push("UNTIL=" + dateToIcal(rule.until))

  const lines = [
    "DTSTART;VALUE=DATE:" + dateToIcal(startDate),
    "RRULE:" + fields.join(";"),
  ]
  const exclusions = [...new Set(rule.excludeDates ?? [])].sort()
  if (exclusions.length) {
    lines.push("EXDATE;VALUE=DATE:" + exclusions.map(dateToIcal).join(","))
  }
  return lines.join("\r\n")
}

/** Parse the supported RFC 5545 date-only recurrence properties. */
export function parseICalendarRecurrence(source: string): ParsedICalendarRecurrence {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const startLine = lines.find((line) => line.toUpperCase().startsWith("DTSTART"))
  const ruleLine = lines.find((line) => line.toUpperCase().startsWith("RRULE:"))
  if (!ruleLine) throw new Error("В iCalendar-блоке отсутствует RRULE.")

  let startDate: string | undefined
  if (startLine) {
    const value = startLine.slice(startLine.indexOf(":") + 1)
    startDate = dateFromIcal(value)
  }

  const values = new Map<string, string>()
  const rawRule = ruleLine.slice(ruleLine.indexOf(":") + 1)
  for (const entry of rawRule.split(";")) {
    const separator = entry.indexOf("=")
    if (separator <= 0) throw new Error("Некорректный параметр RRULE: " + entry)
    const key = entry.slice(0, separator).toUpperCase()
    const value = entry.slice(separator + 1).toUpperCase()
    if (values.has(key)) throw new Error("Параметр RRULE повторяется: " + key)
    values.set(key, value)
  }

  const frequency = values.get("FREQ")?.toLowerCase()
  if (frequency !== "daily" && frequency !== "weekly" && frequency !== "monthly" && frequency !== "yearly") {
    throw new Error("Поддерживаются только DAILY, WEEKLY, MONTHLY и YEARLY.")
  }
  const supported = new Set(["FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "BYMONTHDAY", "BYMONTH", "WKST"])
  for (const key of values.keys()) {
    if (!supported.has(key)) throw new Error("Параметр RRULE пока не поддерживается: " + key)
  }

  const numberList = (key: string, min: number, max: number, allowNegative = false): number[] | undefined => {
    const raw = values.get(key)
    if (!raw) return undefined
    const parsed = raw.split(",").map(Number)
    if (!parsed.every((value) =>
      Number.isInteger(value) &&
      value !== 0 &&
      (allowNegative ? Math.abs(value) >= min && Math.abs(value) <= max : value >= min && value <= max)
    )) {
      throw new Error("Некорректное значение " + key + ".")
    }
    return [...new Set(parsed)]
  }

  const interval = Number(values.get("INTERVAL") ?? "1")
  const count = values.has("COUNT") ? Number(values.get("COUNT")) : undefined
  if (!Number.isInteger(interval) || interval < 1 || interval > 10_000) {
    throw new Error("INTERVAL должен быть целым числом от 1 до 10000.")
  }
  if (count !== undefined && (!Number.isInteger(count) || count < 1)) {
    throw new Error("COUNT должен быть положительным целым числом.")
  }
  if (count !== undefined && values.has("UNTIL")) {
    throw new Error("RFC 5545 не допускает одновременное использование COUNT и UNTIL.")
  }

  const until = values.has("UNTIL") ? dateFromIcal(values.get("UNTIL")!) : undefined
  const byMonth = numberList("BYMONTH", 1, 12)
  const byMonthDay = numberList("BYMONTHDAY", 1, 31, true)
  let byDay: Array<{ weekday: number; ordinal?: number }> | undefined
  if (values.has("BYDAY")) {
    byDay = values.get("BYDAY")!.split(",").map((token) => {
      const match = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(token)
      if (!match) throw new Error("Некорректное значение BYDAY: " + token)
      const ordinal = match[1] ? Number(match[1]) : undefined
      if (ordinal !== undefined && (ordinal === 0 || Math.abs(ordinal) > 5)) {
        throw new Error("Порядковый номер BYDAY должен быть от -5 до -1 или от 1 до 5.")
      }
      if (ordinal !== undefined && (frequency === "daily" || frequency === "weekly")) {
        throw new Error("Порядковый BYDAY поддерживается для MONTHLY и YEARLY.")
      }
      return {
        weekday: WEEKDAY_BY_CODE.get(match[2] as typeof WEEKDAY_CODES[number])!,
        ordinal,
      }
    })
  }
  const weekStartCode = values.get("WKST")
  const weekStart = weekStartCode
    ? WEEKDAY_BY_CODE.get(weekStartCode as typeof WEEKDAY_CODES[number])
    : undefined
  if (weekStartCode && weekStart === undefined) throw new Error("Неизвестный день WKST.")

  const excludeDates: string[] = []
  for (const line of lines.filter((item) => item.toUpperCase().startsWith("EXDATE"))) {
    const value = line.slice(line.indexOf(":") + 1)
    for (const date of value.split(",")) excludeDates.push(dateFromIcal(date))
  }

  return {
    startDate,
    rule: {
      frequency,
      interval,
      count,
      until,
      byMonth,
      byMonthDay,
      byDay,
      weekStart,
      excludeDates: excludeDates.length ? [...new Set(excludeDates)].sort() : undefined,
      weekdays: frequency === "weekly" && byDay?.length
        ? byDay.filter((item) => item.ordinal === undefined).map((item) => item.weekday)
        : undefined,
    },
  }
}
