import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type MouseEvent as ReactMouseEvent, type PointerEvent } from "react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus } from "lucide-react"
import {
  addDays,
  isoDate,
  monthGrid,
  parseISODate,
  startOfWeek,
} from "@/lib/nexora/dates"
import {
  getCalendarCreatePatch,
  getCalendarDayDropPatch,
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
type CalendarView = "year" | "month" | "week" | "days" | "day" | "list"
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
  taskId: string
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

const SLOT_STEP = 30
const ROW_HEIGHT = 44
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
  const [slotStartHour, setSlotStartHour] = useState(6)
  const [slotEndHour, setSlotEndHour] = useState(22)
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
  const suppressTouchClickRef = useRef(false)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const weekStartsOn = useNexora((s) => s.settings.weekStartsOn)
  const settings = useNexora((s) => s.settings)
  const tasks = useNexora((s) => s.tasks)
  const projects = useNexora((s) => s.projects)
  const sessions = useNexora((s) => s.sessions)
  const addTask = useNexora((s) => s.addTask)
  const updateTask = useNexora((s) => s.updateTask)
  const setTaskId = useUI((s) => s.setTaskId)
  const priorityLabels = getTaskPriorityLabels(settings)
  const statusDefinitions = getTaskStatusDefinitions(settings).filter((status) => !status.hidden)

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
    return [listDays[0] ?? selected, listDays[listDays.length - 1] ?? selected]
  }, [view, cursor.year, cells, selected, visibleWeekDays, customDays, listDays])

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
    return `${format(parseISODate(listDays[0]), "d MMM", { locale: ru })} – ${format(parseISODate(listDays[LIST_DAYS - 1]), "d MMM yyyy", { locale: ru })}`
  }, [view, cursor, weekDays, visibleWeekDays, customDays, selected, listDays])

  const shift = (direction: -1 | 1) => {
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
    setCursor({ year: now.getFullYear(), month: now.getMonth() })
    setSelectedSlot(null)
  }

  const setCalendarView = (nextView: CalendarView) => {
    setView(nextView)
    setSelectedSlot(null)
    const date = parseISODate(selected)
    setCursor({ year: date.getFullYear(), month: date.getMonth() })
  }

  const onEventClick = (task: CalendarTask) =>
    setTaskId(task.virtualOccurrence ? task.recurrenceSeriesId ?? task.id : task.id)

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
        draggable={!task.virtualOccurrence}
        onPointerDown={(event) => beginTouchTaskDrag(event, task)}
        onPointerMove={moveTouchTaskDrag}
        onPointerUp={finishTouchTaskDrag}
        onPointerCancel={cancelTouchTaskDrag}
        onClick={(event) => {
          if (handleTouchTaskClick(event)) return
          event.stopPropagation()
          onEventClick(task)
        }}
        onDragStart={task.virtualOccurrence ? undefined : (event) => {
          event.dataTransfer.setData("text/task-id", task.id)
          event.dataTransfer.effectAllowed = "move"
        }}
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

  const handleDayDrop = (day: string) => (event: DragEvent) => {
    event.preventDefault()
    const id = event.dataTransfer.getData("text/task-id")
    const task = tasks.find((item) => item.id === id)
    if (!task) return
    updateTask(id, getCalendarDayDropPatch(task, day))
  }

  const handleAllDayDrop = (day: string) => (event: DragEvent) => {
    event.preventDefault()
    const id = event.dataTransfer.getData("text/task-id")
    const task = tasks.find((item) => item.id === id)
    if (!task) return
    updateTask(id, {
      scheduledDate: day,
      startAt: undefined,
      endAt: undefined,
      allDay: true,
    })
  }

  const handleSlotDrop = (day: string, minutes: number) => (event: DragEvent) => {
    event.preventDefault()
    const id = event.dataTransfer.getData("text/task-id")
    const task = tasks.find((item) => item.id === id)
    if (!task) return
    updateTask(id, getCalendarDropPatch(task, day, minutes))
  }

  const resolveCalendarDropTarget = (clientX: number, clientY: number): CalendarDropTarget | null => {
    const element = window.document.elementFromPoint(clientX, clientY)
    const zone = element?.closest<HTMLElement>("[data-calendar-drop-day]")
    const day = zone?.dataset.calendarDropDay
    if (!day) return null
    if (zone?.dataset.calendarDropAllDay === "true") return { day, minutes: null, allDay: true }
    const minutes = zone?.dataset.calendarDropMinutes
    return { day, minutes: minutes === undefined ? null : Number(minutes), allDay: false }
  }

  const applyCalendarTouchDrop = (taskId: string, target: CalendarDropTarget) => {
    const task = tasks.find((item) => item.id === taskId)
    if (!task) return
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
    if (event.pointerType !== "touch" || !event.isPrimary || task.virtualOccurrence) return
    suppressTouchClickRef.current = false
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const drag: TouchTaskDrag = {
      taskId: task.id,
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
      if (target) applyCalendarTouchDrop(current.taskId, target)
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
    if (task.virtualOccurrence) return
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
    const steps = Math.round((event.clientY - resizeDraft.startY) / ROW_HEIGHT)
    if (resizeDraft.edge === "start") {
      const nextStart = Math.max(
        0,
        Math.min(resizeDraft.end - 15, Math.round((resizeDraft.start + steps * SLOT_STEP) / 15) * 15),
      )
      setResizeDraft({ ...resizeDraft, previewStart: nextStart })
      return
    }
    const nextEnd = Math.max(
      resizeDraft.start + 15,
      Math.min(24 * 60, Math.round((resizeDraft.end + steps * SLOT_STEP) / 15) * 15),
    )
    setResizeDraft({ ...resizeDraft, previewEnd: nextEnd })
  }

  const handleResizeEnd = (event: PointerEvent<HTMLSpanElement>, task: CalendarTask) => {
    if (!resizeDraft || resizeDraft.taskId !== task.id || resizeDraft.pointerId !== event.pointerId) return
    const current = resizeDraft
    updateTask(task.id, getCalendarResizePatch(task, current.day, current.previewStart, current.previewEnd))
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
      end: minutes + SLOT_STEP,
      slotStart,
      slotEnd,
    }
    slotSelectionRef.current = selection
    setSlotSelection(selection)
  }

  const updateTimeSelection = (event: PointerEvent<HTMLDivElement>) => {
    const current = slotSelectionRef.current
    if (!current || current.pointerId !== event.pointerId) return
    const deltaSteps = Math.round((event.clientY - current.startY) / ROW_HEIGHT)
    const range = getCalendarSelectionRange(current.anchorMinutes, deltaSteps, SLOT_STEP, current.slotStart, current.slotEnd)
    const next = { ...current, start: range.start, end: range.end }
    slotSelectionRef.current = next
    setSlotSelection(next)
  }

  const finishTimeSelection = (event: PointerEvent<HTMLDivElement>) => {
    const current = slotSelectionRef.current
    if (!current || current.pointerId !== event.pointerId) return
    const deltaSteps = Math.round((event.clientY - current.startY) / ROW_HEIGHT)
    const range = getCalendarSelectionRange(current.anchorMinutes, deltaSteps, SLOT_STEP, current.slotStart, current.slotEnd)
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
    const timeSlots = Array.from({ length: (slotEnd - slotStart) / SLOT_STEP }, (_, i) => slotStart + i * SLOT_STEP)
    const gridHeight = timeSlots.length * ROW_HEIGHT
    const nowMinutes = now.getHours() * 60 + now.getMinutes()

    return (
      <>
        <div
          className="grid min-w-full"
          style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(9.5rem, 1fr))` }}
        >
          <div className="nexora-calendar-all-day-label border-r border-white/10 px-2 py-3 text-[10px] font-medium uppercase tracking-wide text-white/45">
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
                  "nexora-calendar-all-day min-h-[4.5rem] space-y-1 border-r border-white/10 p-1.5",
                  day === today && "bg-sky-400/[0.055]",
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
          <div className="relative border-r border-white/10" style={{ height: gridHeight }}>
            {timeSlots.map((minutes) => minutes % 60 === 0 ? (
              <div
                key={minutes}
                className="nexora-calendar-time-label absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-white/45"
                style={{ top: ((minutes - slotStart) / SLOT_STEP) * ROW_HEIGHT }}
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
                      minutes % 60 === 0 ? "nexora-calendar-slot-hour" : "nexora-calendar-slot-half",
                      "hover:bg-white/[0.025]",
                      touchTaskDrag?.active && touchTaskDrag.target?.day === day && touchTaskDrag.target.minutes === minutes && "nexora-calendar-drop-target",
                    )}
                    style={{
                      top: ((minutes - slotStart) / SLOT_STEP) * ROW_HEIGHT,
                      height: ROW_HEIGHT,
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
                      top: ((slotSelection.start - slotStart) / SLOT_STEP) * ROW_HEIGHT,
                      height: Math.max(ROW_HEIGHT / 2, ((slotSelection.end - slotSelection.start) / SLOT_STEP) * ROW_HEIGHT),
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
                  const top = ((visibleStart - slotStart) / SLOT_STEP) * ROW_HEIGHT
                  const height = Math.max(25, ((visibleEnd - visibleStart) / SLOT_STEP) * ROW_HEIGHT)
                  const isDueOnly = task.dueDate === day && task.scheduledDate !== day && task.startAt?.slice(0, 10) !== day
                  const colorClass = PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR.none
                  return (
                    <button
                      key={task.id}
                      type="button"
                      draggable={!task.virtualOccurrence}
                      onPointerDown={(event) => beginTouchTaskDrag(event, task)}
                      onPointerMove={moveTouchTaskDrag}
                      onPointerUp={finishTouchTaskDrag}
                      onPointerCancel={cancelTouchTaskDrag}
                      onDragStart={task.virtualOccurrence ? undefined : (event) => {
                        event.dataTransfer.setData("text/task-id", task.id)
                        event.dataTransfer.effectAllowed = "move"
                      }}
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
                      {!task.virtualOccurrence ? (
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
                  const top = ((visibleStart - slotStart) / SLOT_STEP) * ROW_HEIGHT
                  const height = Math.max(25, ((visibleEnd - visibleStart) / SLOT_STEP) * ROW_HEIGHT)
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
                    className="pointer-events-none absolute inset-x-0 z-[4] flex items-center"
                    style={{ top: ((nowMinutes - slotStart) / SLOT_STEP) * ROW_HEIGHT }}
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
    setSelected(day)
    setSelectedSlot(null)
    setShowComposer(false)
    const date = parseISODate(day)
    setCursor({ year: date.getFullYear(), month: date.getMonth() })
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
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="nexora-calendar-view-button"
              onClick={() => setCalendarView(id)}
              aria-pressed={view === id}
              title={{ year: "Год", month: "Месяц", week: "Неделя", days: "Несколько дней", day: "День", list: "Список" }[id]}
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
        {(view === "week" || view === "days") ? (
          <label className="nexora-calendar-toggle">
            <input type="checkbox" checked={showWeekends} onChange={(event) => setShowWeekends(event.target.checked)} />
            Выходные
          </label>
        ) : null}

        <div className="nexora-calendar-filter-spacer" />

        {(view === "days" || view === "week" || view === "day") ? (
          <div className="nexora-calendar-range-controls">
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
          <div className="nexora-calendar-scroll overflow-x-auto">
            <div style={{ width: `max(100%, calc(3.5rem + ${visibleWeekDays.length} * 9.5rem))` }}>
            <div
              className="nexora-calendar-day-header grid border-b border-white/10 bg-black/25 text-center text-xs"
              style={{ gridTemplateColumns: `3.5rem repeat(${visibleWeekDays.length}, minmax(9.5rem, 1fr))` }}
            >
              <div />
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
                  <span className="block text-[10px] uppercase tracking-wide text-white/45">
                    {format(parseISODate(day), "EEE", { locale: ru })}
                  </span>
                  <span className="mt-0.5 block text-sm tabular-nums">{format(parseISODate(day), "d.MM", { locale: ru })}</span>
                </button>
              ))}
            </div>
            {renderTimeGrid(visibleWeekDays)}
            </div>
          </div>
        ) : null}

        {view === "days" ? (
          <div className="nexora-calendar-scroll overflow-x-auto">
            <div style={{ width: `max(100%, calc(3.5rem + ${customDays.length} * 9.5rem))` }}>
            <div
              className="nexora-calendar-day-header grid border-b border-white/10 bg-black/25 text-center text-xs"
              style={{ gridTemplateColumns: `3.5rem repeat(${customDays.length}, minmax(9.5rem, 1fr))` }}
            >
              <div />
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
                  <span className="block text-[10px] uppercase tracking-wide text-white/45">{format(parseISODate(day), "EEE", { locale: ru })}</span>
                  <span className="mt-0.5 block text-sm tabular-nums">{format(parseISODate(day), "d.MM", { locale: ru })}</span>
                </button>
              ))}
            </div>
            {renderTimeGrid(customDays)}
            </div>
          </div>
        ) : null}

        {view === "day" ? (
          <div className="nexora-calendar-scroll overflow-x-auto">
            <div style={{ width: "max(100%, 13rem)" }}>
              <div className="border-b border-white/10 bg-black/25 px-4 py-3 text-sm font-medium capitalize text-white/70">
                {format(parseISODate(selected), "EEEE, d MMMM", { locale: ru })}
              </div>
              {renderTimeGrid([selected])}
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
                            draggable={!task.virtualOccurrence}
                            onDragStart={task.virtualOccurrence ? undefined : (event) => {
                              event.dataTransfer.setData("text/task-id", task.id)
                            }}
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
