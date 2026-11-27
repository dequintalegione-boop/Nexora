import { useMemo, useState, type DragEvent } from "react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { addDays, isoDate, monthGrid, parseISODate, startOfWeek } from "@/lib/nexora/dates"
import { getCalendarDayDropPatch, getCalendarDropPatch, getCalendarTaskTime } from "@/lib/nexora/calendar"
import { expandTaskOccurrences } from "@/lib/nexora/recurrence"
import { isDoneStatus, getTaskPriorityLabels } from "@/lib/nexora/copy"
import { useNexora } from "@/lib/nexora/store"
import { useUI } from "@/lib/nexora/ui-store"
import type { Task } from "@/lib/nexora/types"
import { cn } from "@/lib/cn"
import { Card, PageHeader } from "./ui"

/** TaskNotes / FullCalendar-inspired view modes */
type CalendarView = "month" | "week" | "day" | "list"

const HEADS = {
  1: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
  0: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
} as const

/** Hourly slots from 06:00 to 22:00 (FullCalendar-style timegrid) */
const SLOT_START = 6 * 60
const SLOT_END = 22 * 60
const SLOT_STEP = 30
const TIME_SLOTS = Array.from(
  { length: (SLOT_END - SLOT_START) / SLOT_STEP },
  (_, i) => SLOT_START + i * SLOT_STEP,
)
const LIST_DAYS = 14

type CalendarTask = Task & { virtualOccurrence?: boolean; recurrenceSeriesId?: string }

const PRIORITY_COLOR: Record<string, string> = {
  none: "bg-white/15 border-white/20 text-white/90",
  low: "bg-sky-500/25 border-sky-400/40 text-sky-100",
  medium: "bg-amber-500/25 border-amber-400/40 text-amber-50",
  high: "bg-orange-500/30 border-orange-400/50 text-orange-50",
  critical: "bg-rose-500/35 border-rose-400/50 text-rose-50",
}

function localTimeLabel(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
}

function taskMinutes(task: Task): { start: number; end: number } | null {
  if (!task.startAt || task.allDay) return null
  const start = new Date(task.startAt)
  if (Number.isNaN(start.getTime())) return null
  const startMin = start.getHours() * 60 + start.getMinutes()
  let endMin = startMin + 60
  if (task.endAt) {
    const end = new Date(task.endAt)
    if (!Number.isNaN(end.getTime())) {
      endMin = Math.max(startMin + 15, end.getHours() * 60 + end.getMinutes())
    }
  }
  return { start: startMin, end: endMin }
}

function isTaskOnDay(task: Task, day: string) {
  if (task.deletedAt || task.archived) return false
  return task.scheduledDate === day || task.dueDate === day || task.startAt?.slice(0, 10) === day
}

export function CalendarPage() {
  const today = isoDate()
  const initial = parseISODate(today)
  const [view, setView] = useState<CalendarView>("week")
  const [cursor, setCursor] = useState({ year: initial.getFullYear(), month: initial.getMonth() })
  const [selected, setSelected] = useState(today)
  const [draft, setDraft] = useState("")
  const [showDue, setShowDue] = useState(true)
  const [showScheduled, setShowScheduled] = useState(true)

  const weekStartsOn = useNexora((s) => s.settings.weekStartsOn)
  const settings = useNexora((s) => s.settings)
  const tasks = useNexora((s) => s.tasks)
  const addTask = useNexora((s) => s.addTask)
  const updateTask = useNexora((s) => s.updateTask)
  const setTaskId = useUI((s) => s.setTaskId)
  const priorityLabels = getTaskPriorityLabels(settings)

  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(selected, weekStartsOn)
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  }, [selected, weekStartsOn])

  const listDays = useMemo(
    () => Array.from({ length: LIST_DAYS }, (_, i) => addDays(selected, i)),
    [selected],
  )

  const cells = useMemo(
    () => monthGrid(cursor.year, cursor.month, weekStartsOn),
    [cursor, weekStartsOn],
  )

  const recurrenceRange = view === "month"
    ? cells.filter((day): day is string => Boolean(day))
    : view === "week"
      ? weekDays
      : view === "day"
        ? [selected]
        : listDays
  const recurrenceRangeStart = recurrenceRange[0] ?? selected
  const recurrenceRangeEnd = recurrenceRange[recurrenceRange.length - 1] ?? selected

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
    const occurrences = expandTaskOccurrences(tasks, recurrenceRangeStart, recurrenceRangeEnd)
      .map((occurrence) => ({
        ...occurrence.task,
        virtualOccurrence: occurrence.isVirtual,
        recurrenceSeriesId: occurrence.seriesId,
      }))
    return [...ordinaryTasks, ...occurrences]
  }, [tasks, recurrenceRangeStart, recurrenceRangeEnd])

  const tasksForDay = (day: string) =>
    visibleTasks.filter((task) => {
      if (!isTaskOnDay(task, day)) return false
      const isDueOnly =
        task.dueDate === day && task.scheduledDate !== day && task.startAt?.slice(0, 10) !== day
      const isScheduled =
        task.scheduledDate === day || task.startAt?.slice(0, 10) === day
      if (isDueOnly && !showDue) return false
      if (isScheduled && !showScheduled && !isDueOnly) return false
      return showDue || showScheduled
    })

  const title = useMemo(() => {
    if (view === "month") {
      return format(new Date(cursor.year, cursor.month, 1), "LLLL yyyy", { locale: ru })
    }
    if (view === "week") {
      return `${format(parseISODate(weekDays[0]), "d MMM", { locale: ru })} – ${format(parseISODate(weekDays[6]), "d MMM yyyy", { locale: ru })}`
    }
    if (view === "day") {
      return format(parseISODate(selected), "EEEE, d MMMM yyyy", { locale: ru })
    }
    return `${format(parseISODate(listDays[0]), "d MMM", { locale: ru })} – ${format(parseISODate(listDays[LIST_DAYS - 1]), "d MMM yyyy", { locale: ru })}`
  }, [view, cursor, weekDays, selected, listDays])

  const shift = (dir: -1 | 1) => {
    if (view === "month") {
      const d = new Date(cursor.year, cursor.month + dir, 1)
      setCursor({ year: d.getFullYear(), month: d.getMonth() })
      setSelected(isoDate(new Date(d.getFullYear(), d.getMonth(), 1)))
      return
    }
    const step = view === "list" ? LIST_DAYS : view === "day" ? 1 : 7
    const next = addDays(selected, dir * step)
    setSelected(next)
    const parsed = parseISODate(next)
    setCursor({ year: parsed.getFullYear(), month: parsed.getMonth() })
  }

  const goToday = () => {
    setSelected(today)
    const d = parseISODate(today)
    setCursor({ year: d.getFullYear(), month: d.getMonth() })
  }

  const onEventClick = (task: CalendarTask) => setTaskId(task.virtualOccurrence ? task.recurrenceSeriesId ?? task.id : task.id)

  const eventChipClass = (task: CalendarTask, kind: "scheduled" | "due") =>
    cn(
      "block w-full truncate rounded border px-1.5 py-0.5 text-left text-[11px] leading-tight transition hover:brightness-110",
      PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR.none,
      isDoneStatus(task.status, settings) && "opacity-50 line-through",
      (kind === "due" || task.virtualOccurrence) && "border-dashed",
    )

  const renderEventChip = (task: CalendarTask, day: string) => {
    const isDue = task.dueDate === day && task.scheduledDate !== day
    const time = getCalendarTaskTime(task)
    return (
      <button
        key={task.id}
        type="button"
        draggable={!task.virtualOccurrence}
        onDragStart={task.virtualOccurrence ? undefined : (e) => {
          e.dataTransfer.setData("text/task-id", task.id)
          e.dataTransfer.effectAllowed = "move"
        }}
        onClick={(e) => {
          e.stopPropagation()
          onEventClick(task)
        }}
        className={eventChipClass(task, isDue ? "due" : "scheduled")}
        title={`${task.title}${time ? ` · ${time}` : ""}${isDue ? " (срок)" : ""}${task.virtualOccurrence ? " · повторение" : ""}`}
      >
        {time ? <span className="mr-1 opacity-80">{time}</span> : null}
        {task.title}
      </button>
    )
  }

  const handleDayDrop = (day: string) => (e: DragEvent) => {
    e.preventDefault()
    const id = e.dataTransfer.getData("text/task-id")
    const task = tasks.find((t) => t.id === id)
    if (!task) return
    updateTask(id, getCalendarDayDropPatch(task, day))
  }

  const handleSlotDrop = (day: string, minutes: number) => (e: DragEvent) => {
    e.preventDefault()
    const id = e.dataTransfer.getData("text/task-id")
    const task = tasks.find((t) => t.id === id)
    if (!task) return
    updateTask(id, getCalendarDropPatch(task, day, minutes))
  }

  const TimeGrid = ({ days }: { days: string[] }) => {
    const gridHeight = ((SLOT_END - SLOT_START) / SLOT_STEP) * 28

    return (
      <div className="overflow-x-auto">
        <div
          className="grid border-b border-line"
          style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(6rem, 1fr))` }}
        >
          <div className="border-r border-line px-1 py-2 text-[10px] text-muted">весь день</div>
          {days.map((day) => {
            const allDay = tasksForDay(day).filter((t) => t.allDay || !taskMinutes(t))
            return (
              <div
                key={`allday-${day}`}
                className={cn(
                  "min-h-10 space-y-0.5 border-r border-line p-1",
                  day === today && "bg-accent/5",
                )}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDayDrop(day)}
                onClick={() => setSelected(day)}
              >
                {allDay.slice(0, 4).map((t) => renderEventChip(t, day))}
                {allDay.length > 4 && (
                  <span className="text-[10px] text-muted">+{allDay.length - 4}</span>
                )}
              </div>
            )
          })}
        </div>

        <div
          className="grid"
          style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(6rem, 1fr))` }}
        >
          <div className="relative border-r border-line" style={{ height: gridHeight }}>
            {TIME_SLOTS.map((m) =>
              m % 60 === 0 ? (
                <div
                  key={m}
                  className="absolute right-1 -translate-y-1/2 text-[10px] text-muted"
                  style={{ top: ((m - SLOT_START) / SLOT_STEP) * 28 }}
                >
                  {localTimeLabel(m)}
                </div>
              ) : null,
            )}
          </div>

          {days.map((day) => {
            const timed = tasksForDay(day).filter((t) => taskMinutes(t))
            return (
              <div
                key={`grid-${day}`}
                className={cn("relative border-r border-line", day === today && "bg-accent/5")}
                style={{ height: gridHeight }}
                onClick={() => setSelected(day)}
              >
                {TIME_SLOTS.map((m) => (
                  <div
                    key={m}
                    className={cn(
                      "absolute inset-x-0 border-t",
                      m % 60 === 0 ? "border-line/80" : "border-line/30",
                    )}
                    style={{ top: ((m - SLOT_START) / SLOT_STEP) * 28, height: 28 }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleSlotDrop(day, m)}
                  />
                ))}
                {timed.map((task) => {
                  const range = taskMinutes(task)!
                  const top = Math.max(0, ((range.start - SLOT_START) / SLOT_STEP) * 28)
                  const height = Math.max(22, ((range.end - range.start) / SLOT_STEP) * 28)
                  return (
                    <button
                      key={task.id}
                      type="button"
                      draggable={!task.virtualOccurrence}
                      onDragStart={task.virtualOccurrence ? undefined : (e) => {
                        e.dataTransfer.setData("text/task-id", task.id)
                        e.dataTransfer.effectAllowed = "move"
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        onEventClick(task)
                      }}
                      className={cn(
                        "absolute left-0.5 right-0.5 z-[1] overflow-hidden rounded border px-1 py-0.5 text-left text-[11px] shadow-sm",
                        PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR.none,
                        isDoneStatus(task.status, settings) && "opacity-50 line-through",
                      )}
                      style={{ top, height }}
                      title={task.title}
                    >
                      <span className="font-medium opacity-90">{localTimeLabel(range.start)}</span>
                      <span className="ml-1 block truncate">{task.title}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        kicker="Календарь"
        title="Планирование"
        text="Вид как в TaskNotes: месяц, неделя и день с time-grid, перетаскивание задач, срок и план."
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-line bg-black/20 p-0.5">
            <button type="button" className="icon-btn" aria-label="Назад" onClick={() => shift(-1)}>
              <ChevronLeft size={18} />
            </button>
            <button type="button" className="btn btn-ghost px-2 text-sm" onClick={goToday}>
              Сегодня
            </button>
            <button type="button" className="icon-btn" aria-label="Вперёд" onClick={() => shift(1)}>
              <ChevronRight size={18} />
            </button>
          </div>

          <p className="min-w-[12rem] text-center text-sm font-medium capitalize">{title}</p>

          <div className="flex rounded-lg border border-line p-0.5">
            {(
              [
                ["month", "Месяц"],
                ["week", "Неделя"],
                ["day", "День"],
                ["list", "Список"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={cn(
                  "rounded-md px-2.5 py-1 text-sm transition",
                  view === id ? "bg-accent/20 text-accent" : "text-muted hover:bg-white/5",
                )}
                onClick={() => setView(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </PageHeader>

      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted">
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={showScheduled}
            onChange={(e) => setShowScheduled(e.target.checked)}
            className="rounded border-line"
          />
          Запланированные
        </label>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={showDue}
            onChange={(e) => setShowDue(e.target.checked)}
            className="rounded border-line"
          />
          Срок (due)
        </label>
        <span className="text-[10px] opacity-70">
          Пунктир — только срок · цвет — приоритет
        </span>
      </div>

      <Card className="overflow-hidden p-0">
        {view === "month" && (
          <div className="p-2">
            <div className="grid grid-cols-7 border-b border-line text-center text-[11px] font-medium text-muted">
              {HEADS[weekStartsOn].map((label) => (
                <div key={label} className="py-2">
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((day, index) => {
                if (!day) {
                  return (
                    <div
                      key={`e-${index}`}
                      className="min-h-[5.5rem] border-b border-r border-line/50 bg-black/10"
                    />
                  )
                }
                const dayList = tasksForDay(day)
                const isToday = day === today
                const isSelected = day === selected
                const inMonth = parseISODate(day).getMonth() === cursor.month
                return (
                  <div
                    key={day}
                    className={cn(
                      "min-h-[5.5rem] border-b border-r border-line/50 p-1 transition",
                      !inMonth && "opacity-40",
                      isToday && "bg-accent/10",
                      isSelected && "ring-1 ring-inset ring-accent/50",
                    )}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDayDrop(day)}
                    onClick={() => setSelected(day)}
                  >
                    <div className="mb-0.5 flex items-center justify-between px-0.5">
                      <span
                        className={cn(
                          "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                          isToday && "bg-accent font-semibold text-black",
                        )}
                      >
                        {parseISODate(day).getDate()}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {dayList.slice(0, 3).map((t) => renderEventChip(t, day))}
                      {dayList.length > 3 && (
                        <span className="block px-1 text-[10px] text-muted">
                          +{dayList.length - 3} ещё
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {view === "week" && (
          <div>
            <div
              className="grid border-b border-line bg-black/20 text-center text-xs"
              style={{ gridTemplateColumns: "3.5rem repeat(7, minmax(6rem, 1fr))" }}
            >
              <div />
              {weekDays.map((day) => (
                <button
                  key={day}
                  type="button"
                  className={cn(
                    "border-l border-line py-2 transition hover:bg-white/5",
                    day === today && "bg-accent/10 text-accent",
                    day === selected && "font-semibold",
                  )}
                  onClick={() => setSelected(day)}
                >
                  <div className="text-[10px] uppercase text-muted">
                    {format(parseISODate(day), "EEE", { locale: ru })}
                  </div>
                  <div className="text-sm">{format(parseISODate(day), "d")}</div>
                </button>
              ))}
            </div>
            <TimeGrid days={weekDays} />
          </div>
        )}

        {view === "day" && (
          <div>
            <div className="border-b border-line bg-black/20 px-4 py-2 text-sm capitalize text-muted">
              {format(parseISODate(selected), "EEEE, d MMMM", { locale: ru })}
            </div>
            <TimeGrid days={[selected]} />
          </div>
        )}

        {view === "list" && (
          <div className="divide-y divide-line">
            {listDays.map((day) => {
              const dayList = tasksForDay(day)
              return (
                <div key={day} className="px-4 py-3">
                  <button
                    type="button"
                    className={cn(
                      "mb-2 text-left text-sm font-medium capitalize",
                      day === today && "text-accent",
                    )}
                    onClick={() => {
                      setSelected(day)
                      setView("day")
                    }}
                  >
                    {format(parseISODate(day), "EEEE, d MMMM", { locale: ru })}
                    {day === today ? " · сегодня" : ""}
                  </button>
                  {dayList.length === 0 ? (
                    <p className="text-xs text-muted">Нет задач</p>
                  ) : (
                    <div className="space-y-1">
                      {dayList.map((task) => {
                        const time = getCalendarTaskTime(task)
                        const isDue = task.dueDate === day && task.scheduledDate !== day
                        return (
                          <button
                            key={task.id}
                            type="button"
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition hover:bg-white/5",
                              PRIORITY_COLOR[task.priority] ?? "border-line",
                              isDoneStatus(task.status, settings) && "opacity-50 line-through",
                            )}
                            onClick={() => onEventClick(task)}
                            draggable={!task.virtualOccurrence}
                            onDragStart={task.virtualOccurrence ? undefined : (e) => {
                              e.dataTransfer.setData("text/task-id", task.id)
                            }}
                          >
                            <span className="w-12 shrink-0 text-xs tabular-nums text-muted">
                              {time ?? (isDue ? "срок" : "—")}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{task.title}</span>
                            <span className="shrink-0 text-[10px] text-muted">
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
        )}
      </Card>

      <Card className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold capitalize">
            {format(parseISODate(selected), "EEEE, d MMMM", { locale: ru })}
          </h2>
          {selected === today && <span className="text-xs text-accent">Сегодня</span>}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const value = draft.trim()
            if (!value) return
            const id = addTask({
              title: value,
              status: "planned",
              scheduledDate: selected,
              priority: "none",
            })
            setDraft("")
            setTaskId(id)
          }}
        >
          <input
            className="field"
            placeholder="Быстро добавить задачу на этот день"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="btn btn-primary" type="submit">
            Добавить
          </button>
        </form>
      </Card>
    </div>
  )
}
