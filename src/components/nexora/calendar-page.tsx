import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent } from "react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Play, Plus } from "lucide-react"
import {
  addDays,
  isoDate,
  monthGrid,
  parseISODate,
  startOfWeek,
} from "@/lib/nexora/dates"
import {
  getAgendaLoadIncrement,
  getCalendarCreatePatch,
  getCalendarDayActivity,
  getCalendarDayDropPatch,
  getCalendarDropMinutes,
  getCalendarFitPixelsPerHour,
  getCalendarDropPatch,
  getCalendarResizePatch,
  getCalendarTaskTime,
  getCalendarSelectionRange,
  getCalendarSessionRange,
  layoutCalendarEvents,
} from "@/lib/nexora/calendar"
import { expandTaskOccurrences } from "@/lib/nexora/recurrence"
import { getTaskStatusDefinitions, isDoneStatus, getTaskPriorityLabels } from "@/lib/nexora/copy"
import { useNexora } from "@/lib/nexora/store"
import { useUI } from "@/lib/nexora/ui-store"
import type { Task } from "@/lib/nexora/types"
import { cn } from "@/lib/cn"
import { Card } from "./ui"
import "./calendar-page.css"

/** Calendar views supported by the internal Nexora task calendar. */
type CalendarView = "year" | "month" | "week" | "days" | "day" | "list" | "agenda"
type CalendarTask = Task & { virtualOccurrence?: boolean; recurrenceSeriesId?: string }

type TaskMinutes = { start: number; end: number }
type ResizeDraft = {
  taskId: string
  day: string
  pointerId: number
  startY: number
  start: number
  end: number
  edge: "start" | "end"
  previewStart: number
  previewEnd: number
}

type SlotSelectionDraft = {
  day: string
  pointerId: number
  startY: number
  anchorMinutes: number
  start: number
  end: number
  slotStart: number
  slotEnd: number
}

type CalendarDropTarget = {
  day: string
  minutes: number | null
  allDay: boolean
}

type TouchTaskDrag = {
  task: CalendarTask
  pointerId: number
  startX: number
  startY: number
  active: boolean
  target: CalendarDropTarget | null
}

const HEADS = {
  1: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
  0: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
} as const

const LIST_DAYS = 14
const PRIORITY_COLOR: Record<string, string> = {
  none: "nexora-calendar-priority-none",
  low: "nexora-calendar-priority-low",
  medium: "nexora-calendar-priority-medium",
  high: "nexora-calendar-priority-high",
  critical: "nexora-calendar-priority-critical",
}

function localTimeLabel(minutes: number) {
  const normalized = Math.max(0, Math.min(24 * 60, minutes))
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`
}

function taskMinutes(task: Task): TaskMinutes | null {
  if (!task.startAt || task.allDay) return null
  const start = new Date(task.startAt)
  if (Number.isNaN(start.getTime())) return null

  const startMin = start.getHours() * 60 + start.getMinutes()
  let endMin = startMin + 60
  if (task.endAt) {
    const end = new Date(task.endAt)
    if (!Number.isNaN(end.getTime())) {
      endMin = end.toDateString() === start.toDateString()
        ? end.getHours() * 60 + end.getMinutes()
        : 24 * 60
      endMin = Math.max(startMin + 15, endMin)
    }
  }
  return { start: startMin, end: endMin }
}

function isTaskOnDay(task: Task, day: string) {
  if (task.deletedAt || task.archived) return false
  return task.scheduledDate === day || task.dueDate === day || task.startAt?.slice(0, 10) === day
}

function formatRange(start: number, end: number) {
  return `${localTimeLabel(start)} – ${localTimeLabel(end)}`
}

function monthName(year: number, month: number) {
  return format(new Date(year, month, 1), "LLLL", { locale: ru })
}

export function CalendarPage() {
  const [now, setNow] = useState(() => new Date())
  const calendarScrollRef = useRef<HTMLDivElement | null>(null)
  const miniCalendarRef = useRef<HTMLDivElement | null>(null)
  const miniCalendarTriggerRef = useRef<HTMLButtonElement | null>(null)
  const today = isoDate(now)
  const initial = parseISODate(today)
  const [view, setView] = useState<CalendarView>("week")
  const [cursor, setCursor] = useState({ year: initial.getFullYear(), month: initial.getMonth() })
  const [selected, setSelected] = useState(today)
  const [draft, setDraft] = useState("")
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const [showDue, setShowDue] = useState(true)
  const [showScheduled, setShowScheduled] = useState(true)
  const [showWeekends, setShowWeekends] = useState(true)
  const [dayCount, setDayCount] = useState(3)
  const [agendaDayCount, setAgendaDayCount] = useState(7)
  const [agendaStartDate, setAgendaStartDate] = useState(today)
  const [agendaHasScrolled, setAgendaHasScrolled] = useState(false)
  const [agendaScrollDirection, setAgendaScrollDirection] = useState<"up" | "down">("down")
  const agendaScrollRef = useRef<HTMLDivElement | null>(null)
  const agendaTopSentinelRef = useRef<HTMLDivElement | null>(null)
  const agendaBottomSentinelRef = useRef<HTMLDivElement | null>(null)
  const agendaPrependHeightRef = useRef<number | null>(null)
  const agendaProgrammaticScrollRef = useRef(false)
  const agendaLastScrollTopRef = useRef(0)
  const [miniCalendarOpen, setMiniCalendarOpen] = useState(false)
  const [slotStartHour, setSlotStartHour] = useState(6)
  const [slotEndHour, setSlotEndHour] = useState(22)
  const [snapMinutes, setSnapMinutes] = useState(15)
  const [pixelsPerHour, setPixelsPerHour] = useState(88)
  const [fitToWindow, setFitToWindow] = useState(false)
  const gridSlotHeight = (pixelsPerHour * snapMinutes) / 60
  const [resizeDraft, setResizeDraft] = useState<ResizeDraft | null>(null)
  const [slotSelection, setSlotSelection] = useState<SlotSelectionDraft | null>(null)
  const slotSelectionRef = useRef<SlotSelectionDraft | null>(null)
  const [selectedDuration, setSelectedDuration] = useState(60)
  const [showComposer, setShowComposer] = useState(false)
  const [showTimeEntries, setShowTimeEntries] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterProjectId, setFilterProjectId] = useState("")
  const [filterPriority, setFilterPriority] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [filterTag, setFilterTag] = useState("")
  const [touchTaskDrag, setTouchTaskDrag] = useState<TouchTaskDrag | null>(null)
  const touchTaskDragRef = useRef<TouchTaskDrag | null>(null)
  const draggedTaskRef = useRef<CalendarTask | null>(null)
  const suppressTouchClickRef = useRef(false)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!miniCalendarOpen) return
    const handleOutsidePointerDown = (event: Event) => {
      if (!miniCalendarRef.current?.contains(event.target as Node)) setMiniCalendarOpen(false)
    }
    window.addEventListener("pointerdown", handleOutsidePointerDown)
    return () => window.removeEventListener("pointerdown", handleOutsidePointerDown)
  }, [miniCalendarOpen])

  useEffect(() => {
    if (!miniCalendarOpen) return
    const frame = window.requestAnimationFrame(() => {
      const target = miniCalendarRef.current?.querySelector<HTMLButtonElement>('[data-mini-day="' + selected + '"]')
        ?? miniCalendarRef.current?.querySelector<HTMLButtonElement>("[data-mini-day]")
      target?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [miniCalendarOpen, selected])

  useEffect(() => {
    if (view !== "agenda" || agendaDayCount >= 365) return
    if (!("IntersectionObserver" in window)) return
    const root = agendaScrollRef.current
    const bottomSentinel = agendaBottomSentinelRef.current
    if (!root || !bottomSentinel) return

    const nextObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setAgendaDayCount((count) => Math.min(365, count + getAgendaLoadIncrement(count)))
      }
    }, { root, rootMargin: "180px 0px 180px 0px" })
    nextObserver.observe(bottomSentinel)

    let previousObserver: IntersectionObserver | null = null
    const topSentinel = agendaTopSentinelRef.current
    if (agendaHasScrolled && agendaScrollDirection === "up" && root.scrollHeight > root.clientHeight + 2 && topSentinel) {
      previousObserver = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        if (agendaPrependHeightRef.current !== null) return
        const increment = getAgendaLoadIncrement(agendaDayCount)
        if (increment <= 0) return
        agendaPrependHeightRef.current = root.scrollHeight
        setAgendaStartDate((start) => addDays(start, -increment))
        setAgendaDayCount((count) => Math.min(365, count + increment))
      }, { root, rootMargin: "140px 0px 0px 0px" })
      previousObserver.observe(topSentinel)
    }

    return () => {
      nextObserver.disconnect()
      previousObserver?.disconnect()
    }
  }, [view, agendaHasScrolled, agendaScrollDirection, agendaDayCount, agendaStartDate])

  useEffect(() => {
    const previousHeight = agendaPrependHeightRef.current
    if (previousHeight === null) return
    agendaProgrammaticScrollRef.current = true
    const frame = window.requestAnimationFrame(() => {
      const container = agendaScrollRef.current
      if (container) {
        container.scrollTop += container.scrollHeight - previousHeight
        agendaLastScrollTopRef.current = container.scrollTop
      }
      agendaPrependHeightRef.current = null
      window.requestAnimationFrame(() => { agendaProgrammaticScrollRef.current = false })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [agendaStartDate, agendaDayCount])

  useEffect(() => {
    if (!fitToWindow || (view !== "week" && view !== "days" && view !== "day")) return
    const container = calendarScrollRef.current
    if (!container) return

    let frame = 0
    const updateFit = () => {
      const grid = container.querySelector<HTMLElement>(".nexora-calendar-time-grid")
      if (!grid) return
      const fixedHeight = container.scrollHeight - grid.getBoundingClientRect().height
      const next = getCalendarFitPixelsPerHour(container.clientHeight, fixedHeight, slotStartHour, slotEndHour)
      if (next === null) return
      setPixelsPerHour((current) => current === next ? current : next)
    }
    const scheduleFit = () => {
      if (frame) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(updateFit)
    }

    const observer = new ResizeObserver(scheduleFit)
    observer.observe(container)
    const allDayRow = container.querySelector(".nexora-calendar-all-day")?.parentElement
    if (allDayRow) observer.observe(allDayRow)
    scheduleFit()

    return () => {
      observer.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [fitToWindow, view, slotStartHour, slotEndHour, snapMinutes])

  useEffect(() => {
    if (fitToWindow || (view !== "week" && view !== "days" && view !== "day")) return
    const frame = window.requestAnimationFrame(() => {
      const container = calendarScrollRef.current
      const marker = container?.querySelector<HTMLElement>("[data-calendar-now-marker]")
      if (!container || !marker) return
      const markerTop = marker.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
      const targetTop = markerTop - container.clientHeight * 0.34
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
      container.scrollTo({ top: Math.max(0, targetTop), behavior })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [view, selected, slotStartHour, slotEndHour, fitToWindow])

  const weekStartsOn = useNexora((s) => s.settings.weekStartsOn)
  const settings = useNexora((s) => s.settings)
  const tasks = useNexora((s) => s.tasks)
  const projects = useNexora((s) => s.projects)
  const sessions = useNexora((s) => s.sessions)
  const activeTimer = useNexora((s) => s.activeTimer)
  const startTimer = useNexora((s) => s.startTimer)
  const setTaskStatus = useNexora((s) => s.setTaskStatus)
  const addTask = useNexora((s) => s.addTask)
  const updateTask = useNexora((s) => s.updateTask)
  const materializeTaskOccurrence = useNexora((s) => s.materializeTaskOccurrence)
  const setTaskId = useUI((s) => s.setTaskId)
  const setTaskOccurrence = useUI((s) => s.setTaskOccurrence)
  const priorityLabels = getTaskPriorityLabels(settings)
  const statusDefinitions = getTaskStatusDefinitions(settings).filter((status) => !status.hidden)
  const doneStatusId = statusDefinitions.find((status) => status.category === "done")?.id
    ?? getTaskStatusDefinitions(settings).find((status) => status.category === "done")?.id

  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(selected, weekStartsOn)
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  }, [selected, weekStartsOn])

  const visibleWeekDays = useMemo(
    () => showWeekends ? weekDays : weekDays.filter((day) => ![0, 6].includes(parseISODate(day).getDay())),
    [showWeekends, weekDays],
  )

  const customDays = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => addDays(selected, i)),
    [dayCount, selected],
  )

  const listDays = useMemo(
    () => Array.from({ length: LIST_DAYS }, (_, i) => addDays(selected, i)),
    [selected],
  )

  const agendaDays = useMemo(
    () => Array.from({ length: agendaDayCount }, (_, i) => addDays(agendaStartDate, i)),
    [agendaDayCount, agendaStartDate],
  )

  const cells = useMemo(
    () => monthGrid(cursor.year, cursor.month, weekStartsOn),
    [cursor, monthGrid, weekStartsOn],
  )

  const yearCells = useMemo(
    () => Array.from({ length: 12 }, (_, month) => ({
      month,
      days: monthGrid(cursor.year, month, weekStartsOn),
    })),
    [cursor.year, weekStartsOn],
  )

  const miniMonthDays = useMemo(() => {
    const firstOfMonth = isoDate(new Date(cursor.year, cursor.month, 1))
    const gridStart = startOfWeek(firstOfMonth, weekStartsOn)
    return Array.from({ length: cells.length }, (_, index) => addDays(gridStart, index))
  }, [cursor.year, cursor.month, weekStartsOn, cells.length])

  const miniCalendarTasks = useMemo<CalendarTask[]>(() => {
    const firstDay = miniMonthDays[0]
    const lastDay = miniMonthDays[miniMonthDays.length - 1]
    if (!firstDay || !lastDay) return []

    const activeSeriesIds = new Set(
      tasks
        .filter((task) =>
          (task.recurrenceParentId ?? task.id) === task.id &&
          Boolean(task.recurrenceRule || task.repeat) &&
          !task.deletedAt &&
          !task.archived
        )
        .map((task) => task.id),
    )
    const ordinaryTasks = tasks.filter((task) =>
      !task.deletedAt &&
      !task.archived &&
      !task.recurrenceRule &&
      !task.repeat &&
      (!task.recurrenceParentId || !activeSeriesIds.has(task.recurrenceParentId))
    )
    const savedCandidates = tasks.filter((task) =>
      Boolean(task.recurrenceParentId && task.occurrenceDate && activeSeriesIds.has(task.recurrenceParentId)) &&
      !task.deletedAt &&
      !task.archived
    )
    const savedByOccurrence = new Map<string, Task>()
    for (const task of savedCandidates) {
      savedByOccurrence.set(task.recurrenceParentId + "::" + task.occurrenceDate, task)
    }
    const savedInstances = [...savedByOccurrence.values()]
    const occurrences = expandTaskOccurrences(tasks, firstDay, lastDay).map(({ task, isVirtual, seriesId }) => ({
      ...task,
      virtualOccurrence: isVirtual,
      recurrenceSeriesId: seriesId,
    }))
    const uniqueTasks = new Map<string, CalendarTask>()
    for (const task of [...ordinaryTasks, ...savedInstances, ...occurrences]) uniqueTasks.set(task.id, task)
    return [...uniqueTasks.values()]
  }, [tasks, miniMonthDays])

  const miniCalendarActivity = useMemo(
    () => getCalendarDayActivity(
      miniCalendarTasks,
      sessions,
      miniMonthDays,
      (status) => isDoneStatus(status, settings),
    ),
    [miniCalendarTasks, sessions, miniMonthDays, settings],
  )

  const miniCalendarFocusDay = miniMonthDays.includes(selected)
    ? selected
    : miniMonthDays.includes(today) ? today : miniMonthDays[0]

  const recurrenceRange = useMemo(() => {
    if (view === "year") {
      return [
        isoDate(new Date(cursor.year, 0, 1)),
        isoDate(new Date(cursor.year, 11, 31)),
      ]
    }
    if (view === "month") {
      const monthDays = cells.filter((day): day is string => Boolean(day))
      return [monthDays[0] ?? selected, monthDays[monthDays.length - 1] ?? selected]
    }
    if (view === "week") {
      const days = visibleWeekDays
      return [days[0] ?? selected, days[days.length - 1] ?? selected]
    }
    if (view === "days") return [customDays[0] ?? selected, customDays[customDays.length - 1] ?? selected]
    if (view === "day") return [selected, selected]
    if (view === "agenda") return [agendaDays[0] ?? selected, agendaDays[agendaDays.length - 1] ?? selected]
    return [listDays[0] ?? selected, listDays[listDays.length - 1] ?? selected]
  }, [view, cursor.year, cells, selected, visibleWeekDays, customDays, listDays, agendaDays])

  const visibleTasks = useMemo<CalendarTask[]>(() => {
    const activeSeriesIds = new Set(
      tasks
        .filter((task) =>
          (task.recurrenceParentId ?? task.id) === task.id &&
          Boolean(task.recurrenceRule || task.repeat) &&
          !task.deletedAt &&
          !task.archived
        )
        .map((task) => task.id),
    )
    const ordinaryTasks = tasks.filter((task) =>
      !task.deletedAt &&
      !task.archived &&
      !task.recurrenceRule &&
      !task.repeat &&
      (!task.recurrenceParentId || !activeSeriesIds.has(task.recurrenceParentId))
    )
    const occurrences = expandTaskOccurrences(tasks, recurrenceRange[0], recurrenceRange[1])
      .map((occurrence) => ({
        ...occurrence.task,
        virtualOccurrence: occurrence.isVirtual,
        recurrenceSeriesId: occurrence.seriesId,
      }))
    return [...ordinaryTasks, ...occurrences]
  }, [tasks, recurrenceRange])

  const calendarTags = useMemo(
    () => Array.from(new Set(visibleTasks.flatMap((task) => task.tags ?? []).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "ru")),
    [visibleTasks],
  )

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase()
  const filteredCalendarTasks = useMemo(() => visibleTasks.filter((task) => {
    if (normalizedSearch) {
      const searchable = [task.title, task.description, ...(task.tags ?? []), ...(task.contexts ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
      if (!searchable.includes(normalizedSearch)) return false
    }
    if (filterProjectId && task.projectId !== filterProjectId && !task.projectIds?.includes(filterProjectId)) return false
    if (filterPriority && task.priority !== filterPriority) return false
    if (filterStatus && task.status !== filterStatus) return false
    if (filterTag && !task.tags?.includes(filterTag)) return false
    return true
  }), [visibleTasks, normalizedSearch, filterProjectId, filterPriority, filterStatus, filterTag])

  const tasksForDay = (day: string) =>
    filteredCalendarTasks.filter((task) => {
      if (!isTaskOnDay(task, day)) return false
      const isDueOnly =
        task.dueDate === day && task.scheduledDate !== day && task.startAt?.slice(0, 10) !== day
      const isScheduled =
        task.scheduledDate === day || task.startAt?.slice(0, 10) === day
      if (isDueOnly && !showDue) return false
      if (isScheduled && !showScheduled && !isDueOnly) return false
      return showDue || showScheduled
    })

  const dayCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const task of filteredCalendarTasks) {
      if (task.scheduledDate) counts.set(task.scheduledDate, (counts.get(task.scheduledDate) ?? 0) + 1)
      if (task.dueDate && task.dueDate !== task.scheduledDate) {
        counts.set(task.dueDate, (counts.get(task.dueDate) ?? 0) + 1)
      }
    }
    return counts
  }, [filteredCalendarTasks])

  const title = useMemo(() => {
    if (view === "year") return String(cursor.year)
    if (view === "month") return format(new Date(cursor.year, cursor.month, 1), "LLLL yyyy", { locale: ru })
    if (view === "week") {
      return `${format(parseISODate(visibleWeekDays[0] ?? weekDays[0]), "d MMM", { locale: ru })} – ${format(parseISODate(visibleWeekDays[visibleWeekDays.length - 1] ?? weekDays[6]), "d MMM yyyy", { locale: ru })}`
    }
    if (view === "days") {
      return `${format(parseISODate(customDays[0]), "d MMM", { locale: ru })} – ${format(parseISODate(customDays[customDays.length - 1]), "d MMM yyyy", { locale: ru })}`
    }
    if (view === "day") return format(parseISODate(selected), "EEEE, d MMMM yyyy", { locale: ru })
    if (view === "agenda") return `${format(parseISODate(agendaDays[0] ?? selected), "d MMM", { locale: ru })} – ${format(parseISODate(agendaDays[agendaDays.length - 1] ?? selected), "d MMM yyyy", { locale: ru })}`
    return `${format(parseISODate(listDays[0]), "d MMM", { locale: ru })} – ${format(parseISODate(listDays[LIST_DAYS - 1]), "d MMM yyyy", { locale: ru })}`
  }, [view, cursor, weekDays, visibleWeekDays, customDays, selected, listDays, agendaDays])

  const resetAgendaScrollPosition = () => {
    agendaProgrammaticScrollRef.current = true
    window.requestAnimationFrame(() => {
      if (agendaScrollRef.current) agendaScrollRef.current.scrollTop = 0
      agendaLastScrollTopRef.current = 0
      setAgendaScrollDirection("down")
      setAgendaHasScrolled(false)
      window.requestAnimationFrame(() => { agendaProgrammaticScrollRef.current = false })
    })
  }

  const shift = (direction: -1 | 1) => {
    if (view === "agenda") {
      const next = addDays(agendaStartDate, direction * agendaDayCount)
      setSelected(next)
      setAgendaStartDate(next)
      setAgendaDayCount(7)
      setAgendaHasScrolled(false)
      agendaPrependHeightRef.current = null
      setSelectedSlot(null)
      const parsed = parseISODate(next)
      setCursor({ year: parsed.getFullYear(), month: parsed.getMonth() })
      resetAgendaScrollPosition()
      return
    }
    if (view === "year") {
      const year = cursor.year + direction
      setCursor({ year, month: cursor.month })
      const next = isoDate(new Date(year, cursor.month, 1))
      setSelected(next)
      setSelectedSlot(null)
      return
    }
    if (view === "month") {
      const date = new Date(cursor.year, cursor.month + direction, 1)
      setCursor({ year: date.getFullYear(), month: date.getMonth() })
      setSelected(isoDate(date))
      setSelectedSlot(null)
      return
    }
    const step = view === "list" ? LIST_DAYS : view === "day" ? 1 : view === "days" ? dayCount : 7
    const next = addDays(selected, direction * step)
    setSelected(next)
    setSelectedSlot(null)
    const parsed = parseISODate(next)
    setCursor({ year: parsed.getFullYear(), month: parsed.getMonth() })
  }
  const goToday = () => {
    setSelected(today)
    setAgendaStartDate(today)
    setAgendaDayCount(7)
    setAgendaHasScrolled(false)
    agendaPrependHeightRef.current = null
    setCursor({ year: now.getFullYear(), month: now.getMonth() })
    setSelectedSlot(null)
    resetAgendaScrollPosition()
  }

  const setCalendarView = (nextView: CalendarView) => {
    if (nextView === "agenda") {
      setAgendaStartDate(selected)
      setAgendaDayCount(7)
      setAgendaHasScrolled(false)
      agendaPrependHeightRef.current = null
    }
    setView(nextView)
    setSelectedSlot(null)
    const date = parseISODate(selected)
    setCursor({ year: date.getFullYear(), month: date.getMonth() })
    if (nextView === "agenda") {
      resetAgendaScrollPosition()
    }
  }

  const loadPreviousAgendaDays = () => {
    const increment = getAgendaLoadIncrement(agendaDayCount)
    if (increment <= 0) return
    const container = agendaScrollRef.current
    if (container && agendaPrependHeightRef.current === null) agendaPrependHeightRef.current = container.scrollHeight
    setAgendaStartDate((start) => addDays(start, -increment))
    setAgendaDayCount((count) => Math.min(365, count + increment))
  }

  const loadNextAgendaDays = () => {
    setAgendaDayCount((count) => Math.min(365, count + getAgendaLoadIncrement(count)))
  }

  const completeAgendaTask = (task: CalendarTask) => {
    if (!doneStatusId) return
    const taskId = task.virtualOccurrence ? materializeTaskOccurrence(task) : task.id
    if (taskId) setTaskStatus(taskId, doneStatusId)
  }

  const startAgendaTimer = (task: CalendarTask) => {
    if (activeTimer) return
    const taskId = task.virtualOccurrence ? materializeTaskOccurrence(task) : task.id
    if (taskId) startTimer({ taskId, title: task.title, kind: "focus" })
  }

  const onEventClick = (task: CalendarTask) => {
    if (task.virtualOccurrence && task.recurrenceParentId && task.occurrenceDate) {
      const seriesId = task.recurrenceSeriesId ?? task.recurrenceParentId
      setTaskId(seriesId)
      setTaskOccurrence({ seriesId, occurrenceDate: task.occurrenceDate, task })
      return
    }
    setTaskOccurrence(null)
    setTaskId(task.id)
  }

  const eventChipClass = (task: CalendarTask, kind: "scheduled" | "due") =>
    cn(
      "nexora-calendar-event-chip block w-full truncate rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight transition hover:brightness-110 focus-visible:z-20",
      PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR.none,
      isDoneStatus(task.status, settings) && "opacity-55 line-through",
      (kind === "due" || task.virtualOccurrence) && "border-dashed",
    )

  const renderEventChip = (task: CalendarTask, day: string) => {
    const isDue = task.dueDate === day && task.scheduledDate !== day
    const hasDeadline = task.dueDate === day
    const time = getCalendarTaskTime(task)
    return (
      <button
        key={task.id}
        type="button"
        draggable={!task.virtualOccurrence || Boolean(task.recurrenceParentId && task.occurrenceDate)}
        onPointerDown={(event) => beginTouchTaskDrag(event, task)}
        onPointerMove={moveTouchTaskDrag}
        onPointerUp={finishTouchTaskDrag}
        onPointerCancel={cancelTouchTaskDrag}
        onClick={(event) => {
          if (handleTouchTaskClick(event)) return
          event.stopPropagation()
          onEventClick(task)
        }}
        onDragStart={(event) => {
          draggedTaskRef.current = task
          event.dataTransfer.setData("text/task-id", task.id)
          event.dataTransfer.effectAllowed = "move"
        }}
        onDragEnd={() => { draggedTaskRef.current = null }}
        className={eventChipClass(task, isDue ? "due" : "scheduled")}
        title={`${task.title}${time ? ` · ${time}` : ""}${isDue ? " · срок" : ""}${task.virtualOccurrence ? " · повторение" : ""}`}
      >
        {time ? <span className="mr-1 tabular-nums opacity-80">{time}</span> : null}
        <span className="inline-flex min-w-0 items-center gap-1">
          {task.title}
          {hasDeadline ? <span className="ml-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-rose-300" title="Дедлайн" /> : null}
        </span>
      </button>
    )
  }

  const resolveCalendarTaskSource = (id: string): { id: string; task: CalendarTask } | null => {
    const dragged = draggedTaskRef.current
    if (dragged?.id === id && dragged.virtualOccurrence) {
      const materializedId = materializeTaskOccurrence(dragged)
      return materializedId ? { id: materializedId, task: dragged } : null
    }
    const task = tasks.find((item) => item.id === id)
    return task ? { id: task.id, task } : null
  }

  const handleDayDrop = (day: string) => (event: DragEvent) => {
    event.preventDefault()
    const id = event.dataTransfer.getData("text/task-id")
    const source = resolveCalendarTaskSource(id)
    if (!source) return
    updateTask(source.id, getCalendarDayDropPatch(source.task, day))
    draggedTaskRef.current = null
  }

  const handleAllDayDrop = (day: string) => (event: DragEvent) => {
    event.preventDefault()
    const id = event.dataTransfer.getData("text/task-id")
    const source = resolveCalendarTaskSource(id)
    if (!source) return
    updateTask(source.id, {
      scheduledDate: day,
      startAt: undefined,
      endAt: undefined,
      allDay: true,
    })
    draggedTaskRef.current = null
  }

  const handleSlotDrop = (day: string, minutes: number) => (event: DragEvent) => {
    event.preventDefault()
    const id = event.dataTransfer.getData("text/task-id")
    const source = resolveCalendarTaskSource(id)
    if (!source) return
    updateTask(source.id, getCalendarDropPatch(source.task, day, minutes))
    draggedTaskRef.current = null
  }

  const resolveCalendarDropTarget = (clientX: number, clientY: number): CalendarDropTarget | null => {
    const element = window.document.elementFromPoint(clientX, clientY)
    const zone = element?.closest<HTMLElement>("[data-calendar-drop-day]")
    const day = zone?.dataset.calendarDropDay
    if (!day) return null
    if (zone?.dataset.calendarDropAllDay === "true") return { day, minutes: null, allDay: true }
    const explicitMinutes = zone?.dataset.calendarDropMinutes
    if (explicitMinutes !== undefined) return { day, minutes: Number(explicitMinutes), allDay: false }
    if (zone?.dataset.calendarDropGrid === "true") {
      const rect = zone.getBoundingClientRect()
      const minutes = getCalendarDropMinutes(
        clientY,
        rect.top,
        rect.height,
        Number(zone.dataset.calendarDropStart),
        Number(zone.dataset.calendarDropEnd),
        snapMinutes,
      )
      return { day, minutes, allDay: false }
    }
    return { day, minutes: null, allDay: false }
  }

  const applyCalendarTouchDrop = (task: CalendarTask, target: CalendarDropTarget) => {
    const taskId = task.virtualOccurrence ? materializeTaskOccurrence(task) : task.id
    if (!taskId) return
    if (target.allDay) {
      updateTask(taskId, {
        scheduledDate: target.day,
        startAt: undefined,
        endAt: undefined,
        allDay: true,
      })
      return
    }
    if (target.minutes !== null && Number.isFinite(target.minutes)) {
      updateTask(taskId, getCalendarDropPatch(task, target.day, target.minutes))
      return
    }
    updateTask(taskId, getCalendarDayDropPatch(task, target.day))
  }

  const beginTouchTaskDrag = (event: PointerEvent<HTMLButtonElement>, task: CalendarTask) => {
    if (event.pointerType !== "touch" || !event.isPrimary) return
    if (task.virtualOccurrence && (!task.recurrenceParentId || !task.occurrenceDate)) return
    suppressTouchClickRef.current = false
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const drag: TouchTaskDrag = {
      task,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      target: null,
    }
    touchTaskDragRef.current = drag
    setTouchTaskDrag(drag)
  }

  const moveTouchTaskDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = touchTaskDragRef.current
    if (!current || current.pointerId !== event.pointerId) return
    const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY)
    const active = current.active || distance >= 9
    if (!active) return
    event.preventDefault()
    const target = resolveCalendarDropTarget(event.clientX, event.clientY)
    const next = { ...current, active, target }
    touchTaskDragRef.current = next
    setTouchTaskDrag(next)
  }

  const finishTouchTaskDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = touchTaskDragRef.current
    if (!current || current.pointerId !== event.pointerId) return
    const target = current.active
      ? resolveCalendarDropTarget(event.clientX, event.clientY) ?? current.target
      : null
    if (current.active) {
      suppressTouchClickRef.current = true
      if (target) applyCalendarTouchDrop(current.task, target)
    }
    touchTaskDragRef.current = null
    setTouchTaskDrag(null)
  }

  const cancelTouchTaskDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = touchTaskDragRef.current
    if (!current || current.pointerId !== event.pointerId) return
    if (current.active) suppressTouchClickRef.current = true
    touchTaskDragRef.current = null
    setTouchTaskDrag(null)
  }

  const handleTouchTaskClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (!suppressTouchClickRef.current) return false
    suppressTouchClickRef.current = false
    event.preventDefault()
    event.stopPropagation()
    return true
  }

  const selectSlot = (day: string, minutes: number | null) => {
    setSelected(day)
    setSelectedSlot(minutes)
    setSelectedDuration(60)
    setDraft("")
    setShowComposer(true)
    const date = parseISODate(day)
    setCursor({ year: date.getFullYear(), month: date.getMonth() })
  }

  const handleResizeStart = (
    event: PointerEvent<HTMLSpanElement>,
    task: CalendarTask,
    day: string,
    range: TaskMinutes,
    edge: "start" | "end",
  ) => {
    if (task.virtualOccurrence && (!task.recurrenceParentId || !task.occurrenceDate)) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setResizeDraft({
      taskId: task.id,
      day,
      pointerId: event.pointerId,
      startY: event.clientY,
      start: range.start,
      end: range.end,
      edge,
      previewStart: range.start,
      previewEnd: range.end,
    })
  }

  const handleResizeMove = (event: PointerEvent<HTMLSpanElement>, taskId: string) => {
    if (!resizeDraft || resizeDraft.taskId !== taskId || resizeDraft.pointerId !== event.pointerId) return
    const steps = Math.round((event.clientY - resizeDraft.startY) / gridSlotHeight)
    if (resizeDraft.edge === "start") {
      const nextStart = Math.max(
        0,
        Math.min(resizeDraft.end - snapMinutes, Math.round((resizeDraft.start + steps * snapMinutes) / snapMinutes) * snapMinutes),
      )
      setResizeDraft({ ...resizeDraft, previewStart: nextStart })
      return
    }
    const nextEnd = Math.max(
      resizeDraft.start + snapMinutes,
      Math.min(24 * 60, Math.round((resizeDraft.end + steps * snapMinutes) / snapMinutes) * snapMinutes),
    )
    setResizeDraft({ ...resizeDraft, previewEnd: nextEnd })
  }

  const handleResizeEnd = (event: PointerEvent<HTMLSpanElement>, task: CalendarTask) => {
    if (!resizeDraft || resizeDraft.taskId !== task.id || resizeDraft.pointerId !== event.pointerId) return
    const current = resizeDraft
    const taskId = task.virtualOccurrence ? materializeTaskOccurrence(task) : task.id
    if (taskId) updateTask(taskId, getCalendarResizePatch(task, current.day, current.previewStart, current.previewEnd))
    setResizeDraft(null)
  }

  const beginTimeSelection = (
    event: PointerEvent<HTMLDivElement>,
    day: string,
    minutes: number,
    slotStart: number,
    slotEnd: number,
  ) => {
    if (event.button !== 0 || !event.isPrimary) return
    if (event.pointerType !== "touch") event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const selection: SlotSelectionDraft = {
      day,
      pointerId: event.pointerId,
      startY: event.clientY,
      anchorMinutes: minutes,
      start: minutes,
      end: minutes + snapMinutes,
      slotStart,
      slotEnd,
    }
    slotSelectionRef.current = selection
    setSlotSelection(selection)
  }

  const updateTimeSelection = (event: PointerEvent<HTMLDivElement>) => {
    const current = slotSelectionRef.current
    if (!current || current.pointerId !== event.pointerId) return
    const deltaSteps = Math.round((event.clientY - current.startY) / gridSlotHeight)
    const range = getCalendarSelectionRange(current.anchorMinutes, deltaSteps, snapMinutes, current.slotStart, current.slotEnd)
    const next = { ...current, start: range.start, end: range.end }
    slotSelectionRef.current = next
    setSlotSelection(next)
  }

  const finishTimeSelection = (event: PointerEvent<HTMLDivElement>) => {
    const current = slotSelectionRef.current
    if (!current || current.pointerId !== event.pointerId) return
    const deltaSteps = Math.round((event.clientY - current.startY) / gridSlotHeight)
    const range = getCalendarSelectionRange(current.anchorMinutes, deltaSteps, snapMinutes, current.slotStart, current.slotEnd)
    slotSelectionRef.current = null
    setSlotSelection(null)
    setSelectedDate(current.day)
    setSelectedSlot(range.start)
    setSelectedDuration(deltaSteps === 0 ? 60 : range.end - range.start)
    setShowComposer(true)
    setDraft("")
  }

  const cancelTimeSelection = () => {
    slotSelectionRef.current = null
    setSlotSelection(null)
  }

  const renderTimeGrid = (days: string[]) => {
    const slotStart = slotStartHour * 60
    const slotEnd = slotEndHour * 60
    const timeSlots = Array.from({ length: (slotEnd - slotStart) / snapMinutes }, (_, i) => slotStart + i * snapMinutes)
    const gridHeight = timeSlots.length * gridSlotHeight
    const nowMinutes = now.getHours() * 60 + now.getMinutes()

    return (
      <>
        <div
          className="grid min-w-full"
          style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(9.5rem, 1fr))` }}
        >
          <div className="nexora-calendar-all-day-label nexora-calendar-time-gutter border-r border-white/10 px-2 py-3 text-[10px] font-medium uppercase tracking-wide text-white/45">
            весь день
          </div>
          {days.map((day) => {
            const allDay = tasksForDay(day).filter((task) => task.allDay || !taskMinutes(task))
            const visible = allDay.slice(0, 4)
            return (
              <div
                key={`allday-${day}`}
                data-calendar-drop-day={day}
                data-calendar-drop-all-day="true"
                className={cn(
                  "nexora-calendar-all-day min-h-[2.75rem] space-y-1 border-r border-white/10 p-1.5",
                  day === today && "nexora-calendar-today-column",
                  touchTaskDrag?.active && touchTaskDrag.target?.day === day && touchTaskDrag.target.allDay && "nexora-calendar-drop-target",
                )}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleAllDayDrop(day)}
                onClick={() => selectSlot(day, null)}
              >
                {visible.map((task) => renderEventChip(task, day))}
                {allDay.length > visible.length && (
                  <span className="block px-1 text-[10px] text-white/45">+{allDay.length - visible.length} ещё</span>
                )}
              </div>
            )
          })}
        </div>

        <div
          className="nexora-calendar-time-grid grid"
          style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(9.5rem, 1fr))` }}
        >
          <div className="nexora-calendar-time-gutter relative border-r border-white/10" style={{ height: gridHeight }}>
            {timeSlots.map((minutes) => minutes % 60 === 0 ? (
              <div
                key={minutes}
                className="nexora-calendar-time-label absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-white/45"
                style={{ top: ((minutes - slotStart) / snapMinutes) * gridSlotHeight }}
              >
                {localTimeLabel(minutes)}
              </div>
            ) : null)}
          </div>

          {days.map((day) => {
            const tasksForColumn = tasksForDay(day).filter((task) => taskMinutes(task))
            const timed = tasksForColumn.flatMap((task) => {
              const range = taskMinutes(task)
              if (!range) return []
              const start = Math.max(slotStart, range.start)
              const end = Math.min(slotEnd, range.end)
              return end > start ? [{ task, start, end, rawStart: range.start, rawEnd: range.end }] : []
            })
            const timeEntries = showTimeEntries ? sessions.flatMap((session) => {
              const range = getCalendarSessionRange(session, day)
              if (!range) return []
              const start = Math.max(slotStart, range.start)
              const end = Math.min(slotEnd, range.end)
              return end > start ? [{ session, start, end, rawStart: range.start, rawEnd: range.end }] : []
            }) : []
            const layout = layoutCalendarEvents([
              ...timed.map(({ task, start, end }) => ({ id: `task:${task.id}`, start, end })),
              ...timeEntries.map(({ session, start, end }) => ({ id: `session:${session.id}`, start, end })),
            ])
            const layoutById = new Map(layout.map((item) => [item.id, item] as const))
            const showNow = day === today && nowMinutes >= slotStart && nowMinutes <= slotEnd
            return (
              <div
                key={`grid-${day}`}
                data-calendar-drop-day={day}
                data-calendar-drop-grid="true"
                data-calendar-drop-start={slotStart}
                data-calendar-drop-end={slotEnd}
                className={cn(
                  "nexora-calendar-grid-column relative border-r border-white/10",
                  day === today && "nexora-calendar-today-column",
                )}
                style={{ height: gridHeight }}
              >
                {timeSlots.map((minutes) => (
                  <div
                    key={minutes}
                    data-calendar-drop-day={day}
                    data-calendar-drop-minutes={minutes}
                    className={cn(
                      "absolute inset-x-0 border-t transition-colors nexora-calendar-slot",
                      minutes % 60 === 0
                        ? "nexora-calendar-slot-hour"
                        : minutes % 30 === 0
                          ? "nexora-calendar-slot-half"
                          : "nexora-calendar-slot-quarter",
                      "hover:bg-white/[0.025]",
                      touchTaskDrag?.active && touchTaskDrag.target?.day === day && touchTaskDrag.target.minutes === minutes && "nexora-calendar-drop-target",
                    )}
                    style={{
                      top: ((minutes - slotStart) / snapMinutes) * gridSlotHeight,
                      height: gridSlotHeight,
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Создать задачу ${localTimeLabel(minutes)}`}
                    onPointerDown={(event) => beginTimeSelection(event, day, minutes, slotStart, slotEnd)}
                    onPointerMove={updateTimeSelection}
                    onPointerUp={finishTimeSelection}
                    onPointerCancel={cancelTimeSelection}
                    onLostPointerCapture={cancelTimeSelection}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        selectSlot(day, minutes)
                      }
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={handleSlotDrop(day, minutes)}
                    title={`Создать задачу в ${localTimeLabel(minutes)}`}
                  />
                ))}

                {slotSelection?.day === day ? (
                  <div
                    className="nexora-calendar-selection absolute inset-x-1 z-[1] rounded-md"
                    style={{
                      top: ((slotSelection.start - slotStart) / snapMinutes) * gridSlotHeight,
                      height: Math.max(gridSlotHeight / 2, ((slotSelection.end - slotSelection.start) / snapMinutes) * gridSlotHeight),
                    }}
                  >
                    <span>{formatRange(slotSelection.start, slotSelection.end)}</span>
                  </div>
                ) : null}

                {timed.map(({ task, rawStart, rawEnd }) => {
                  const layoutItem = layoutById.get(`task:${task.id}`)
                  if (!layoutItem) return null
                  const previewStart = resizeDraft?.taskId === task.id ? resizeDraft.previewStart : rawStart
                  const previewEnd = resizeDraft?.taskId === task.id ? resizeDraft.previewEnd : rawEnd
                  const visibleStart = Math.max(slotStart, previewStart)
                  const visibleEnd = Math.min(slotEnd, previewEnd)
                  const top = ((visibleStart - slotStart) / snapMinutes) * gridSlotHeight
                  const height = Math.max(Math.min(25, gridSlotHeight), ((visibleEnd - visibleStart) / snapMinutes) * gridSlotHeight)
                  const isDueOnly = task.dueDate === day && task.scheduledDate !== day && task.startAt?.slice(0, 10) !== day
                  const colorClass = PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR.none
                  return (
                    <button
                      key={task.id}
                      type="button"
                      draggable={!task.virtualOccurrence || Boolean(task.recurrenceParentId && task.occurrenceDate)}
                      onPointerDown={(event) => beginTouchTaskDrag(event, task)}
                      onPointerMove={moveTouchTaskDrag}
                      onPointerUp={finishTouchTaskDrag}
                      onPointerCancel={cancelTouchTaskDrag}
                      onDragStart={(event) => {
                        draggedTaskRef.current = task
                        event.dataTransfer.setData("text/task-id", task.id)
                        event.dataTransfer.effectAllowed = "move"
                      }}
                      onDragEnd={() => { draggedTaskRef.current = null }}
                      onClick={(event) => {
                        if (handleTouchTaskClick(event)) return
                        event.stopPropagation()
                        onEventClick(task)
                      }}
                      className={cn(
                        "nexora-calendar-event absolute z-[2] overflow-hidden rounded-md border px-2 py-1.5 text-left transition-[filter,opacity] hover:brightness-110 focus-visible:z-20",
                        colorClass,
                        isDoneStatus(task.status, settings) && "opacity-55",
                        (task.virtualOccurrence || isDueOnly) && "border-dashed",
                        resizeDraft?.taskId === task.id && "ring-1 ring-white/70",
                      )}
                      style={{
                        top,
                        height,
                        left: `calc(${layoutItem.leftPercent}% + 2px)`,
                        width: `calc(${layoutItem.widthPercent}% - 4px)`,
                        zIndex: 2 + layoutItem.column,
                      }}
                      title={`${task.title} · ${formatRange(previewStart, previewEnd)}${task.virtualOccurrence ? " · повторение" : ""}`}
                    >
                      <span className="block text-[10px] font-semibold tabular-nums leading-tight opacity-85">
                        {formatRange(previewStart, previewEnd)}
                      </span>
                      <span className="mt-0.5 block overflow-hidden text-ellipsis text-[11px] font-semibold leading-tight">
                        {task.title}
                      </span>
                      {task.dueDate === day ? (
                        <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-300" title="Дедлайн" />
                      ) : null}
                      {task.description ? (
                        <span className="mt-1 block line-clamp-2 text-[10px] leading-tight opacity-70">
                          {task.description}
                        </span>
                      ) : null}
                      {!task.virtualOccurrence || Boolean(task.recurrenceParentId && task.occurrenceDate) ? (
                        <>
                          <span
                            role="presentation"
                            className="nexora-calendar-resize-handle absolute inset-x-1 top-0 flex h-2 cursor-ns-resize items-center justify-center"
                            title="Изменить начало"
                            onPointerDown={(event) => handleResizeStart(event, task, day, { start: rawStart, end: rawEnd }, "start")}
                            onPointerMove={(event) => handleResizeMove(event, task.id)}
                            onPointerUp={(event) => handleResizeEnd(event, task)}
                            onPointerCancel={() => setResizeDraft(null)}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <span className="h-0.5 w-7 rounded-full bg-current/65" />
                          </span>
                          <span
                            role="presentation"
                            className="nexora-calendar-resize-handle absolute inset-x-1 bottom-0 flex h-2 cursor-ns-resize items-center justify-center"
                            title="Изменить конец"
                            onPointerDown={(event) => handleResizeStart(event, task, day, { start: rawStart, end: rawEnd }, "end")}
                            onPointerMove={(event) => handleResizeMove(event, task.id)}
                            onPointerUp={(event) => handleResizeEnd(event, task)}
                            onPointerCancel={() => setResizeDraft(null)}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <span className="h-0.5 w-7 rounded-full bg-current/65" />
                          </span>
                        </>
                      ) : null}
                    </button>
                  )
                })}

                {timeEntries.map(({ session, rawStart, rawEnd }) => {
                  const layoutItem = layoutById.get(`session:${session.id}`)
                  if (!layoutItem) return null
                  const visibleStart = Math.max(slotStart, rawStart)
                  const visibleEnd = Math.min(slotEnd, rawEnd)
                  const top = ((visibleStart - slotStart) / snapMinutes) * gridSlotHeight
                  const height = Math.max(Math.min(25, gridSlotHeight), ((visibleEnd - visibleStart) / snapMinutes) * gridSlotHeight)
                  const linkedTask = session.taskId ? tasks.find((task) => task.id === session.taskId) : undefined
                  return (
                    <button
                      key={`time-${session.id}`}
                      type="button"
                      disabled={!session.taskId}
                      onClick={() => session.taskId && setTaskId(session.taskId)}
                      className="nexora-calendar-time-entry absolute z-[2] overflow-hidden rounded-md border px-2 py-1.5 text-left"
                      style={{
                        top,
                        height,
                        left: `calc(${layoutItem.leftPercent}% + 2px)`,
                        width: `calc(${layoutItem.widthPercent}% - 4px)`,
                        zIndex: 2 + layoutItem.column,
                      }}
                      title={`${session.title ?? linkedTask?.title ?? "Фактическое время"} · ${formatRange(visibleStart, visibleEnd)}`}
                    >
                      <span className="block text-[10px] font-semibold tabular-nums leading-tight">
                        {formatRange(visibleStart, visibleEnd)}
                      </span>
                      <span className="mt-0.5 block overflow-hidden text-ellipsis text-[11px] font-semibold leading-tight">
                        {session.title ?? linkedTask?.title ?? "Фактическое время"}
                      </span>
                      <span className="absolute right-2 top-1.5 text-[9px] uppercase tracking-wide opacity-60">факт</span>
                    </button>
                  )
                })}

                {showNow ? (
                  <div
                    className="nexora-calendar-now-marker pointer-events-none absolute inset-x-0 z-[4] flex items-center"
                    data-calendar-now-marker="true"
                    style={{ top: ((nowMinutes - slotStart) / snapMinutes) * gridSlotHeight }}
                    aria-label="Текущее время"
                  >
                    <span className="-ml-1.5 h-2.5 w-2.5 rounded-full bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.65)]" />
                    <span className="h-px flex-1 bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.45)]" />
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </>
    )
  }

  const handleCreateTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = draft.trim()
    if (!value) return
    const schedulePatch = selectedSlot === null
      ? { scheduledDate: selected }
      : getCalendarCreatePatch(selected, selectedSlot, selectedDuration)
    const id = addTask({
      title: value,
      status: "planned",
      priority: "none",
      ...schedulePatch,
    })
    setDraft("")
    setSelectedSlot(null)
    setShowComposer(false)
    setTaskId(id)
  }

  const setSelectedDate = (day: string) => {
    setMiniCalendarOpen(false)
    setSelected(day)
    setAgendaStartDate(day)
    setAgendaDayCount(7)
    setAgendaHasScrolled(false)
    agendaPrependHeightRef.current = null
    setSelectedSlot(null)
    setShowComposer(false)
    const date = parseISODate(day)
    setCursor({ year: date.getFullYear(), month: date.getMonth() })
    resetAgendaScrollPosition()
  }

  const shiftMiniCalendarMonth = (direction: -1 | 1) => {
    setCursor((current) => {
      const next = new Date(current.year, current.month + direction, 1)
      return { year: next.getFullYear(), month: next.getMonth() }
    })
  }

  const handleMiniCalendarDayKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, day: string) => {
    let offset: number | null = null
    if (event.key === "ArrowLeft") offset = -1
    else if (event.key === "ArrowRight") offset = 1
    else if (event.key === "ArrowUp") offset = -7
    else if (event.key === "ArrowDown") offset = 7
    else if (event.key === "Home") {
      const weekday = parseISODate(day).getDay()
      offset = -((weekday - weekStartsOn + 7) % 7)
    } else if (event.key === "End") {
      const weekday = parseISODate(day).getDay()
      offset = 6 - ((weekday - weekStartsOn + 7) % 7)
    }
    if (offset === null) return
    event.preventDefault()
    const targetDay = addDays(day, offset)
    const target = miniCalendarRef.current?.querySelector<HTMLButtonElement>('[data-mini-day="' + targetDay + '"]')
    if (target) {
      target.focus()
      return
    }
    const nextDate = parseISODate(targetDay)
    setCursor({ year: nextDate.getFullYear(), month: nextDate.getMonth() })
    window.requestAnimationFrame(() => {
      miniCalendarRef.current?.querySelector<HTMLButtonElement>('[data-mini-day="' + targetDay + '"]')?.focus()
    })
  }

  return (
    <div className="nexora-calendar-page mx-auto w-full max-w-none space-y-3 pb-6">
      <div className="nexora-calendar-toolbar">
        <div className="nexora-calendar-toolbar-title">
          <CalendarDays size={16} />
          <span>Календарь</span>
          <span className="nexora-calendar-count">{filteredCalendarTasks.length} задач</span>
        </div>

        <div className="nexora-calendar-toolbar-actions">
          <select
            className="nexora-calendar-control"
            value={filterProjectId}
            onChange={(event) => setFilterProjectId(event.target.value)}
            aria-label="Фильтр по проекту"
            title="Проект"
          >
            <option value="">Все проекты</option>
            {projects.filter((project) => !project.archived).map((project) => (
              <option key={project.id} value={project.id}>{project.title}</option>
            ))}
          </select>
          <select
            className="nexora-calendar-control"
            value={filterStatus}
            onChange={(event) => setFilterStatus(event.target.value)}
            aria-label="Фильтр по статусу"
            title="Статус"
          >
            <option value="">Все статусы</option>
            {statusDefinitions.map((status) => (
              <option key={status.id} value={status.id}>{status.label}</option>
            ))}
          </select>
          <select
            className="nexora-calendar-control"
            value={filterTag}
            onChange={(event) => setFilterTag(event.target.value)}
            aria-label="Фильтр по метке"
            title="Метка"
          >
            <option value="">Все метки</option>
            {calendarTags.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
          <select
            className="nexora-calendar-control"
            value={filterPriority}
            onChange={(event) => setFilterPriority(event.target.value)}
            aria-label="Фильтр по приоритету"
            title="Приоритет"
          >
            <option value="">Все приоритеты</option>
            {Object.entries(priorityLabels).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          <input
            type="search"
            className="nexora-calendar-search"
            placeholder="Поиск"
            aria-label="Поиск задач"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <button
            type="button"
            className="nexora-calendar-new"
            onClick={() => {
              setDraft("")
              setSelectedSlot(null)
              setSelectedDuration(60)
              setShowComposer(true)
            }}
          >
            <Plus size={14} />
            Новый
          </button>
        </div>
      </div>

      <div className="nexora-calendar-period-bar">
        <div className="nexora-calendar-navigation">
          <button type="button" className="nexora-calendar-icon-button" aria-label="Предыдущий период" onClick={() => shift(-1)}>
            <ChevronLeft size={16} />
          </button>
          <button type="button" className="nexora-calendar-today" onClick={goToday}>Сегодня</button>
          <button type="button" className="nexora-calendar-icon-button" aria-label="Следующий период" onClick={() => shift(1)}>
            <ChevronRight size={16} />
          </button>
          <div className="nexora-calendar-mini" ref={miniCalendarRef}>
            <button
              ref={miniCalendarTriggerRef}
              type="button"
              className="nexora-calendar-mini-toggle"
              aria-expanded={miniCalendarOpen}
              aria-controls="nexora-mini-calendar-popover"
              aria-label={miniCalendarOpen ? "Закрыть мини-календарь" : "Открыть мини-календарь"}
              onClick={() => setMiniCalendarOpen((open) => !open)}
            >
              <CalendarDays size={14} />
              Месяц
            </button>
            {miniCalendarOpen ? (
              <div
                id="nexora-mini-calendar-popover"
                className="nexora-calendar-mini-popover"
                role="dialog"
                aria-label="Мини-календарь"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault()
                    setMiniCalendarOpen(false)
                    miniCalendarTriggerRef.current?.focus()
                  }
                }}
              >
                <div className="nexora-calendar-mini-header">
                  <button type="button" aria-label="Предыдущий месяц" onClick={() => shiftMiniCalendarMonth(-1)}>
                    <ChevronLeft size={15} />
                  </button>
                  <span>{format(new Date(cursor.year, cursor.month, 1), "LLLL yyyy", { locale: ru })}</span>
                  <button type="button" aria-label="Следующий месяц" onClick={() => shiftMiniCalendarMonth(1)}>
                    <ChevronRight size={15} />
                  </button>
                  <button type="button" className="nexora-calendar-mini-today" onClick={() => setSelectedDate(today)}>Сегодня</button>
                </div>
                <div className="nexora-calendar-mini-weekdays" aria-hidden="true">
                  {HEADS[weekStartsOn].map((label) => <span key={label}>{label}</span>)}
                </div>
                <div className="nexora-calendar-mini-days">
                  {miniMonthDays.map((day) => {
                    const activity = miniCalendarActivity.get(day)
                    const dayLabel = format(parseISODate(day), "EEEE, d MMMM", { locale: ru })
                    const scheduled = activity?.scheduled ?? 0
                    const deadlines = activity?.deadlines ?? 0
                    const completed = activity?.completed ?? 0
                    const timeBlocks = activity?.timeBlocks ?? 0
                    const sessionsCount = activity?.sessions ?? 0
                    return (
                      <button
                        key={day}
                        type="button"
                        data-mini-day={day}
                        aria-current={day === today ? "date" : undefined}
                        aria-pressed={day === selected}
                        aria-label={dayLabel + ". Запланировано: " + scheduled + "; дедлайны: " + deadlines + "; завершено: " + completed + "; временные блоки: " + timeBlocks + "; сессии: " + sessionsCount + "."}
                        title={dayLabel}
                        tabIndex={day === miniCalendarFocusDay ? 0 : -1}
                        className={cn(
                          "nexora-calendar-mini-day",
                          day === today && "nexora-calendar-mini-day-today",
                          day === selected && "nexora-calendar-mini-day-selected",
                          parseISODate(day).getMonth() !== cursor.month && "nexora-calendar-mini-day-outside",
                        )}
                        onClick={() => setSelectedDate(day)}
                        onKeyDown={(event) => handleMiniCalendarDayKeyDown(event, day)}
                      >
                        <span className="nexora-calendar-mini-day-number">{parseISODate(day).getDate()}</span>
                        <span className="nexora-calendar-mini-day-dots" aria-hidden="true">
                          {scheduled ? <i className="nexora-calendar-mini-dot nexora-calendar-mini-dot-scheduled" /> : null}
                          {deadlines ? <i className="nexora-calendar-mini-dot nexora-calendar-mini-dot-deadline" /> : null}
                          {completed ? <i className="nexora-calendar-mini-dot nexora-calendar-mini-dot-completed" /> : null}
                          {timeBlocks || sessionsCount ? <i className="nexora-calendar-mini-dot nexora-calendar-mini-dot-time" /> : null}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <div className="nexora-calendar-mini-legend" aria-label="Обозначения">
                  <span><i className="nexora-calendar-mini-dot nexora-calendar-mini-dot-scheduled" />План</span>
                  <span><i className="nexora-calendar-mini-dot nexora-calendar-mini-dot-deadline" />Срок</span>
                  <span><i className="nexora-calendar-mini-dot nexora-calendar-mini-dot-completed" />Готово</span>
                  <span><i className="nexora-calendar-mini-dot nexora-calendar-mini-dot-time" />Время</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <p className="nexora-calendar-period-title">{title}</p>

        <div className="nexora-calendar-view-switch" role="group" aria-label="Вид календаря">
          {([
            ["year", "Г"],
            ["month", "М"],
            ["week", "Н"],
            ["days", `${dayCount}д`],
            ["day", "Д"],
            ["list", "С"],
            ["agenda", "Пов."],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="nexora-calendar-view-button"
              onClick={() => setCalendarView(id)}
              aria-pressed={view === id}
              title={{ year: "Год", month: "Месяц", week: "Неделя", days: "Несколько дней", day: "День", list: "Список", agenda: "Повестка дня" }[id]}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="nexora-calendar-filterbar">
        <label className="nexora-calendar-toggle">
          <input type="checkbox" checked={showScheduled} onChange={(event) => setShowScheduled(event.target.checked)} />
          Запланировано
        </label>
        <label className="nexora-calendar-toggle">
          <input type="checkbox" checked={showDue} onChange={(event) => setShowDue(event.target.checked)} />
          Дедлайны
        </label>
        <label className="nexora-calendar-toggle">
          <input type="checkbox" checked={showTimeEntries} onChange={(event) => setShowTimeEntries(event.target.checked)} />
          Фактическое время
        </label>
        {(view === "week" || view === "days" || view === "agenda") ? (
          <label className="nexora-calendar-toggle">
            <input type="checkbox" checked={showWeekends} onChange={(event) => setShowWeekends(event.target.checked)} />
            Выходные
          </label>
        ) : null}

        <div className="nexora-calendar-filter-spacer" />

        {(view === "days" || view === "week" || view === "day") ? (
          <div className="nexora-calendar-range-controls">
            <label>Шаг
              <select
                className="nexora-calendar-control"
                value={snapMinutes}
                onChange={(event) => setSnapMinutes(Number(event.target.value))}
                aria-label="Шаг сетки"
              >
                <option value={15}>15 мин</option>
                <option value={30}>30 мин</option>
                <option value={60}>1 час</option>
              </select>
            </label>
            <button
              type="button"
              className="nexora-calendar-fit-button"
              aria-pressed={fitToWindow}
              title="Вписать весь диапазон времени в окно"
              onClick={() => setFitToWindow((value) => !value)}
            >
              Вписать
            </button>
            <div className="nexora-calendar-zoom" role="group" aria-label="Масштаб сетки">
              <span>Масштаб</span>
              <button
                type="button"
                aria-label="Уменьшить масштаб"
                title="Уменьшить масштаб"
                disabled={pixelsPerHour <= 66}
                onClick={() => {
                  setFitToWindow(false)
                  setPixelsPerHour((value) => Math.max(66, value - 11))
                }}
              >−</button>
              <output aria-live="polite">{pixelsPerHour} px/ч</output>
              <button
                type="button"
                aria-label="Увеличить масштаб"
                title="Увеличить масштаб"
                disabled={pixelsPerHour >= 132}
                onClick={() => {
                  setFitToWindow(false)
                  setPixelsPerHour((value) => Math.min(132, value + 11))
                }}
              >+</button>
            </div>
            {view === "days" ? (
              <label>Дней
                <select className="nexora-calendar-control" value={dayCount} onChange={(event) => setDayCount(Number(event.target.value))}>
                  {Array.from({ length: 9 }, (_, i) => i + 2).map((count) => (
                    <option key={count} value={count}>{count}</option>
                  ))}
                </select>
              </label>
            ) : null}
            {view !== "day" ? (
              <label>Время
                <select
                  className="nexora-calendar-control"
                  value={slotStartHour}
                  onChange={(event) => setSlotStartHour(Math.min(Number(event.target.value), slotEndHour - 1))}
                >
                  {Array.from({ length: 24 }, (_, hour) => hour).filter((hour) => hour < slotEndHour).map((hour) => (
                    <option key={hour} value={hour}>{localTimeLabel(hour * 60)}</option>
                  ))}
                </select>
                <span>—</span>
                <select
                  className="nexora-calendar-control"
                  value={slotEndHour}
                  onChange={(event) => setSlotEndHour(Math.max(Number(event.target.value), slotStartHour + 1))}
                >
                  {Array.from({ length: 24 }, (_, hour) => hour + 1).filter((hour) => hour > slotStartHour).map((hour) => (
                    <option key={hour} value={hour}>{localTimeLabel(hour * 60)}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}
      </div>

      <Card className="nexora-calendar-card overflow-hidden p-0">
        {view === "year" ? (
          <div className="grid grid-cols-2 gap-px bg-white/[0.07] p-px sm:grid-cols-3 xl:grid-cols-4">
            {yearCells.map(({ month, days }) => (
              <section key={month} className="min-w-0 bg-[#111518] p-3">
                <button
                  type="button"
                  className="mb-2 text-sm font-semibold capitalize text-white/85 hover:text-sky-300"
                  onClick={() => {
                    setCursor({ year: cursor.year, month })
                    setSelected(isoDate(new Date(cursor.year, month, 1)))
                    setView("month")
                  }}
                >
                  {monthName(cursor.year, month)}
                </button>
                <div className="mb-1 grid grid-cols-7 text-center text-[9px] text-white/35">
                  {HEADS[weekStartsOn].map((label, index) => <span key={index}>{label}</span>)}
                </div>
                <div className="grid grid-cols-7 gap-y-1 text-center">
                  {days.map((day, index) => {
                    if (!day) return <span key={`empty-${index}`} />
                    const date = parseISODate(day)
                    const hasItems = (dayCounts.get(day) ?? 0) > 0
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          setSelectedDate(day)
                          setView("day")
                        }}
                        className={cn(
                          "relative mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[10px] transition hover:bg-white/10",
                          date.getMonth() !== month && "opacity-25",
                          day === today && "bg-sky-400 font-semibold text-slate-950 hover:bg-sky-300",
                          day === selected && day !== today && "ring-1 ring-inset ring-sky-300/70",
                        )}
                      >
                        {date.getDate()}
                        {hasItems && day !== today ? <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-sky-300" /> : null}
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : null}

        {view === "month" ? (
          <div className="p-2">
            <div className="grid grid-cols-7 border-b border-white/10 text-center text-[11px] font-medium text-white/45">
              {HEADS[weekStartsOn].map((label) => <div key={label} className="py-2">{label}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((day, index) => {
                if (!day) {
                  return <div key={`empty-${index}`} className="min-h-[7.5rem] border-b border-r border-white/[0.07] bg-black/10" />
                }
                const dayList = tasksForDay(day)
                const isToday = day === today
                const isSelected = day === selected
                const inMonth = parseISODate(day).getMonth() === cursor.month
                return (
                  <div
                    key={day}
                    data-calendar-drop-day={day}
                    className={cn(
                      "min-h-[7.5rem] border-b border-r border-white/[0.07] p-1.5 transition hover:bg-white/[0.025]",
                      !inMonth && "opacity-35",
                      isToday && "bg-sky-400/[0.06]",
                      isSelected && "ring-1 ring-inset ring-sky-300/55",
                      touchTaskDrag?.active && touchTaskDrag.target?.day === day && "nexora-calendar-drop-target",
                    )}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={handleDayDrop(day)}
                    onClick={() => setSelectedDate(day)}
                  >
                    <div className="mb-1 flex items-center justify-between px-0.5">
                      <span className={cn(
                        "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                        isToday && "bg-sky-400 font-semibold text-slate-950",
                      )}>
                        {parseISODate(day).getDate()}
                      </span>
                      {dayList.length > 0 ? <span className="text-[9px] tabular-nums text-white/35">{dayList.length}</span> : null}
                    </div>
                    <div className="space-y-1">
                      {dayList.slice(0, 4).map((task) => renderEventChip(task, day))}
                      {dayList.length > 4 ? (
                        <span className="block px-1 text-[10px] text-white/40">+{dayList.length - 4} ещё</span>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

        {view === "week" ? (
          <div ref={calendarScrollRef} className="nexora-calendar-scroll">
            <div style={{ width: `max(100%, calc(3.5rem + ${visibleWeekDays.length} * 9.5rem))` }}>
            <div
              className="nexora-calendar-day-header grid border-b border-white/10 bg-black/25 text-center text-xs"
              style={{ gridTemplateColumns: `3.5rem repeat(${visibleWeekDays.length}, minmax(9.5rem, 1fr))` }}
            >
              <div className="nexora-calendar-header-corner" />
              {visibleWeekDays.map((day) => (
                <button
                  key={day}
                  type="button"
                  className={cn(
                    "border-l border-white/10 py-3 transition hover:bg-white/[0.04]",
                    day === today && "nexora-calendar-today-header bg-sky-400/[0.07] text-sky-300",
                    day === selected && "font-semibold",
                  )}
                  onClick={() => setSelectedDate(day)}
                >
                  <span className="block text-[11px] font-medium tabular-nums">
                    {format(parseISODate(day), "EEE d.MM", { locale: ru })}
                  </span>
                </button>
              ))}
            </div>
            {renderTimeGrid(visibleWeekDays)}
            </div>
          </div>
        ) : null}

        {view === "days" ? (
          <div ref={calendarScrollRef} className="nexora-calendar-scroll">
            <div style={{ width: `max(100%, calc(3.5rem + ${customDays.length} * 9.5rem))` }}>
            <div
              className="nexora-calendar-day-header grid border-b border-white/10 bg-black/25 text-center text-xs"
              style={{ gridTemplateColumns: `3.5rem repeat(${customDays.length}, minmax(9.5rem, 1fr))` }}
            >
              <div className="nexora-calendar-header-corner" />
              {customDays.map((day) => (
                <button
                  key={day}
                  type="button"
                  className={cn(
                    "border-l border-white/10 py-3 transition hover:bg-white/[0.04]",
                    day === today && "nexora-calendar-today-header bg-sky-400/[0.07] text-sky-300",
                    day === selected && "font-semibold",
                  )}
                  onClick={() => setSelectedDate(day)}
                >
                  <span className="block text-[11px] font-medium tabular-nums">{format(parseISODate(day), "EEE d.MM", { locale: ru })}</span>
                </button>
              ))}
            </div>
            {renderTimeGrid(customDays)}
            </div>
          </div>
        ) : null}

        {view === "day" ? (
          <div ref={calendarScrollRef} className="nexora-calendar-scroll">
            <div style={{ width: "max(100%, 13rem)" }}>
              <div className="nexora-calendar-day-title border-b border-white/10 bg-black/25 px-4 py-3 text-sm font-medium capitalize text-white/70">
                {format(parseISODate(selected), "EEEE, d MMMM", { locale: ru })}
              </div>
              {renderTimeGrid([selected])}
            </div>
          </div>
        ) : null}


        {view === "agenda" ? (
          <div
            ref={agendaScrollRef}
            className="nexora-calendar-agenda-scroll"
            onScroll={() => {
              const container = agendaScrollRef.current
              if (!container) return
              const nextTop = container.scrollTop
              if (!agendaProgrammaticScrollRef.current && nextTop !== agendaLastScrollTopRef.current) {
                setAgendaHasScrolled(true)
                setAgendaScrollDirection(nextTop < agendaLastScrollTopRef.current ? "up" : "down")
              }
              agendaLastScrollTopRef.current = nextTop
            }}
          >
            <div ref={agendaTopSentinelRef} className="nexora-calendar-agenda-sentinel" aria-hidden="true" />
            <div className="nexora-calendar-agenda divide-y divide-white/[0.08]">
            {agendaDays.filter((day) => showWeekends || ![0, 6].includes(parseISODate(day).getDay())).map((day) => {
              const dayTasks = [...tasksForDay(day)].sort((a, b) => {
                const aTime = taskMinutes(a)?.start ?? -1
                const bTime = taskMinutes(b)?.start ?? -1
                return aTime - bTime || a.title.localeCompare(b.title, "ru")
              })
              const daySessions = showTimeEntries ? sessions.flatMap((session) => {
                const range = getCalendarSessionRange(session, day)
                return range ? [{ session, range }] : []
              }).sort((a, b) => a.range.start - b.range.start) : []
              const allDayTasks = dayTasks.filter((task) => task.allDay || (!taskMinutes(task) && !task.startAt))
              const allDayIds = new Set(allDayTasks.map((task) => task.id))
              const isToday = day === today
              const isPast = day < today
              return (
                <section
                  key={day}
                  data-calendar-drop-day={day}
                  className={cn(
                    "nexora-calendar-agenda-day px-4 py-4",
                    isToday && "nexora-calendar-agenda-today",
                    touchTaskDrag?.active && touchTaskDrag.target?.day === day && "nexora-calendar-drop-target",
                  )}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleDayDrop(day)}
                >
                  <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      className={cn("text-left text-sm font-semibold capitalize", isToday ? "text-sky-300" : "text-white/80")}
                      onClick={() => setSelectedDate(day)}
                    >
                      {format(parseISODate(day), "EEEE, d MMMM", { locale: ru })}
                      {isToday ? " · сегодня" : ""}
                    </button>
                    <span className="text-[10px] tabular-nums text-white/40">
                      {dayTasks.length} задач{daySessions.length ? " · " + daySessions.length + " сессий" : ""}
                    </span>
                  </header>

                  {dayTasks.length === 0 && daySessions.length === 0 ? (
                    <p className="py-2 text-xs text-white/35">{isPast ? "Нет запланированных задач" : "Пока ничего не запланировано"}</p>
                  ) : (
                    <div className="space-y-2">
                      {allDayTasks.map((task) => (
                        <div key={task.id} className="nexora-calendar-agenda-row">
                          <button
                            type="button"
                            className={cn("nexora-calendar-agenda-task min-w-0 flex-1", PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR.none, isDoneStatus(task.status, settings) && "opacity-55 line-through", task.virtualOccurrence && "border-dashed")}
                            onPointerDown={(event) => beginTouchTaskDrag(event, task)}
                            onPointerMove={moveTouchTaskDrag}
                            onPointerUp={finishTouchTaskDrag}
                            onPointerCancel={cancelTouchTaskDrag}
                            onClick={(event) => {
                              if (handleTouchTaskClick(event)) return
                              onEventClick(task)
                            }}
                            draggable={!task.virtualOccurrence || Boolean(task.recurrenceParentId && task.occurrenceDate)}
                            onDragStart={(event) => {
                              draggedTaskRef.current = task
                              event.dataTransfer.setData("text/task-id", task.id)
                              event.dataTransfer.effectAllowed = "move"
                            }}
                            onDragEnd={() => { draggedTaskRef.current = null }}
                          >
                            <span className="block truncate text-[12px] font-semibold">{task.title}</span>
                            <span className="mt-1 block text-[10px] opacity-65">
                              {task.dueDate === day && task.scheduledDate !== day && task.startAt?.slice(0, 10) !== day
                                ? "Дедлайн"
                                : task.allDay ? "Весь день" : "Запланировано"}
                              {task.dueDate === day && (task.scheduledDate === day || task.startAt?.slice(0, 10) === day) ? " · срок сегодня" : ""}
                              {task.virtualOccurrence ? " · повтор " + task.occurrenceDate : ""}
                            </span>
                          </button>
                          <div className="nexora-calendar-agenda-actions">
                            {doneStatusId && !isDoneStatus(task.status, settings) ? (
                              <button type="button" aria-label="Завершить задачу" title="Завершить" onClick={() => completeAgendaTask(task)}>
                                <CheckCircle2 size={14} />
                              </button>
                            ) : null}
                            <button type="button" aria-label="Запустить таймер" title={activeTimer ? "Сначала остановите текущий таймер" : "Запустить таймер"} disabled={Boolean(activeTimer)} onClick={() => startAgendaTimer(task)}>
                              <Play size={13} />
                            </button>
                          </div>
                        </div>
                      ))}

                      {dayTasks.filter((task) => !allDayIds.has(task.id)).map((task) => {
                        const range = taskMinutes(task)
                        const isDueOnly = task.dueDate === day && task.scheduledDate !== day && task.startAt?.slice(0, 10) !== day
                        const isCompleted = isDoneStatus(task.status, settings)
                        return (
                          <div key={task.id} className="nexora-calendar-agenda-row">
                            <button
                              type="button"
                              className={cn("nexora-calendar-agenda-task min-w-0 flex-1", PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR.none, isCompleted && "opacity-55 line-through", (isDueOnly || task.virtualOccurrence) && "border-dashed")}
                              onPointerDown={(event) => beginTouchTaskDrag(event, task)}
                              onPointerMove={moveTouchTaskDrag}
                              onPointerUp={finishTouchTaskDrag}
                              onPointerCancel={cancelTouchTaskDrag}
                              onClick={(event) => {
                                if (handleTouchTaskClick(event)) return
                                onEventClick(task)
                              }}
                              draggable={!task.virtualOccurrence || Boolean(task.recurrenceParentId && task.occurrenceDate)}
                              onDragStart={(event) => {
                                draggedTaskRef.current = task
                                event.dataTransfer.setData("text/task-id", task.id)
                                event.dataTransfer.effectAllowed = "move"
                              }}
                              onDragEnd={() => { draggedTaskRef.current = null }}
                            >
                              <span className="block truncate text-[12px] font-semibold">{task.title}</span>
                              <span className="mt-1 block text-[10px] tabular-nums opacity-65">
                                {range ? formatRange(range.start, range.end) : isDueOnly ? "Дедлайн" : "Запланировано"}
                                {task.virtualOccurrence ? " · повтор " + task.occurrenceDate : ""}
                              </span>
                            </button>
                            <div className="nexora-calendar-agenda-actions">
                              {doneStatusId && !isCompleted ? (
                                <button type="button" aria-label="Завершить задачу" title="Завершить" onClick={() => completeAgendaTask(task)}>
                                  <CheckCircle2 size={14} />
                                </button>
                              ) : null}
                              <button type="button" aria-label="Запустить таймер" title={activeTimer ? "Сначала остановите текущий таймер" : "Запустить таймер"} disabled={Boolean(activeTimer)} onClick={() => startAgendaTimer(task)}>
                                <Play size={13} />
                              </button>
                            </div>
                          </div>
                        )
                      })}

                      {daySessions.map(({ session, range }) => {
                        const linkedTask = session.taskId ? tasks.find((task) => task.id === session.taskId) : undefined
                        return (
                          <div key={session.id} className="nexora-calendar-agenda-session">
                            <span className="w-28 shrink-0 text-[10px] tabular-nums text-teal-200/75">
                              {formatRange(range.start, range.end)}
                            </span>
                            {session.taskId ? (
                              <button type="button" className="min-w-0 flex-1 truncate text-left text-[11px] text-teal-100/85 hover:underline" onClick={() => setTaskId(session.taskId!)}>
                                {session.title ?? linkedTask?.title ?? "Фактическое время"}
                              </button>
                            ) : (
                              <span className="min-w-0 flex-1 truncate text-[11px] text-teal-100/75">{session.title ?? "Фактическое время"}</span>
                            )}
                            <span className="text-[9px] uppercase tracking-wide text-teal-200/50">факт</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
              )
            })}
            </div>
            <div ref={agendaBottomSentinelRef} className="nexora-calendar-agenda-sentinel" aria-hidden="true" />
            <div className="flex justify-center gap-2 p-4">
              <button type="button" className="nexora-calendar-today" disabled={agendaDayCount >= 365} onClick={loadPreviousAgendaDays}>
                Предыдущие дни
              </button>
              <button type="button" className="nexora-calendar-new" disabled={agendaDayCount >= 365} onClick={loadNextAgendaDays}>
                Показать ещё 7 дней
              </button>
            </div>
          </div>
        ) : null}

        {view === "list" ? (
          <div className="divide-y divide-white/[0.08]">
            {listDays.map((day) => {
              const dayList = tasksForDay(day)
              return (
                <div
                  key={day}
                  data-calendar-drop-day={day}
                  className={cn("px-4 py-4", touchTaskDrag?.active && touchTaskDrag.target?.day === day && "nexora-calendar-drop-target")}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleDayDrop(day)}
                >
                  <button
                    type="button"
                    className={cn(
                      "mb-2 text-left text-sm font-semibold capitalize",
                      day === today ? "text-sky-300" : "text-white/80",
                    )}
                    onClick={() => {
                      setSelectedDate(day)
                      setView("day")
                    }}
                  >
                    {format(parseISODate(day), "EEEE, d MMMM", { locale: ru })}
                    {day === today ? " · сегодня" : ""}
                  </button>
                  {dayList.length === 0 ? (
                    <p className="text-xs text-white/35">Нет задач</p>
                  ) : (
                    <div className="space-y-1.5">
                      {dayList.map((task) => {
                        const time = getCalendarTaskTime(task)
                        const isDue = task.dueDate === day && task.scheduledDate !== day
                        return (
                          <button
                            key={task.id}
                            type="button"
                            className={cn(
                              "nexora-calendar-list-event flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition hover:bg-white/[0.04]",
                              PRIORITY_COLOR[task.priority] ?? "border-white/10",
                              isDoneStatus(task.status, settings) && "opacity-55 line-through",
                              (isDue || task.virtualOccurrence) && "border-dashed",
                            )}
                            onPointerDown={(event) => beginTouchTaskDrag(event, task)}
                            onPointerMove={moveTouchTaskDrag}
                            onPointerUp={finishTouchTaskDrag}
                            onPointerCancel={cancelTouchTaskDrag}
                            onClick={(event) => {
                              if (handleTouchTaskClick(event)) return
                              onEventClick(task)
                            }}
                            draggable={!task.virtualOccurrence || Boolean(task.recurrenceParentId && task.occurrenceDate)}
                            onDragStart={(event) => {
                              draggedTaskRef.current = task
                              event.dataTransfer.setData("text/task-id", task.id)
                              event.dataTransfer.effectAllowed = "move"
                            }}
                            onDragEnd={() => { draggedTaskRef.current = null }}
                          >
                            <span className="flex w-20 shrink-0 items-center gap-1.5 text-xs tabular-nums text-white/55">
                              <Clock3 size={12} />
                              {time ?? (isDue ? "дедлайн" : "весь день")}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{task.title}</span>
                            <span className="shrink-0 text-[10px] text-white/45">
                              {priorityLabels[task.priority] ?? task.priority}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : null}
      </Card>

      {showComposer ? (
        <Card className="nexora-calendar-composer">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold capitalize">
                {format(parseISODate(selected), "EEEE, d MMMM", { locale: ru })}
              </h2>
              <p className="mt-1 text-xs text-white/55">
                {selected === today ? "Сегодня" : "Выбранная дата"}
                {selectedSlot === null
                  ? " · задача на весь день"
                  : ` · ${localTimeLabel(selectedSlot)}–${localTimeLabel(Math.min(selectedSlot + selectedDuration, 24 * 60))}`}
              </p>
            </div>
            <button type="button" className="nexora-calendar-cancel" onClick={() => setShowComposer(false)}>
              Отмена
            </button>
          </div>
          <form className="mt-3 flex flex-wrap gap-2" onSubmit={handleCreateTask}>
            <input
              className="field min-w-[14rem] flex-1"
              placeholder={selectedSlot === null ? "Быстро добавить задачу на этот день" : `Новая задача · ${localTimeLabel(selectedSlot)}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button className="nexora-calendar-new" type="submit" disabled={!draft.trim()}>
              <Plus size={14} />
              Добавить задачу
            </button>
          </form>
        </Card>
      ) : null}
    </div>
  )
}
