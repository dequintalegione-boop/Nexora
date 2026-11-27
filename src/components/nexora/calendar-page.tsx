import { Fragment, useMemo, useState } from "react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { addDays, isoDate, monthGrid, parseISODate, startOfWeek } from "@/lib/nexora/dates"
import { isScheduled, logKey, logMap, isDoneLog } from "@/lib/nexora/logic"
import { getCalendarDayDropPatch, getCalendarDropPatch, getCalendarTaskTime } from "@/lib/nexora/calendar"
import { useNexora } from "@/lib/nexora/store"
import { useUI } from "@/lib/nexora/ui-store"
import { cn } from "@/lib/cn"
import { Card, PageHeader } from "./ui"

const HEADS = {
  1: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
  0: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
} as const
const TIME_SLOTS = Array.from({ length: 30 }, (_, index) => 7 * 60 + index * 30)
const AGENDA_LENGTH = 14

type CalendarView = "month" | "week" | "agenda"

function localTimeLabel(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
}

export function CalendarPage() {
  const today = isoDate()
  const initial = parseISODate(today)
  const [view, setView] = useState<CalendarView>("month")
  const [cursor, setCursor] = useState({ year: initial.getFullYear(), month: initial.getMonth() })
  const [selected, setSelected] = useState(today)
  const [draft, setDraft] = useState("")
  const weekStartsOn = useNexora((state) => state.settings.weekStartsOn)
  const tasks = useNexora((state) => state.tasks)
  const habits = useNexora((state) => state.habits)
  const habitLogs = useNexora((state) => state.habitLogs)
  const entries = useNexora((state) => state.entries)
  const addTask = useNexora((state) => state.addTask)
  const updateTask = useNexora((state) => state.updateTask)
  const setHabitValue = useNexora((state) => state.setHabitValue)
  const setTaskId = useUI((state) => state.setTaskId)

  const logs = useMemo(() => logMap(habitLogs), [habitLogs])
  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(selected, weekStartsOn)
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
  }, [selected, weekStartsOn])
  const agendaDays = useMemo(
    () => Array.from({ length: AGENDA_LENGTH }, (_, index) => addDays(selected, index)),
    [selected],
  )
  const cells = useMemo(() => monthGrid(cursor.year, cursor.month, weekStartsOn), [cursor, weekStartsOn])

  const monthLabel = format(new Date(cursor.year, cursor.month, 1), "LLLL yyyy", { locale: ru })
  const weekLabel = `${format(parseISODate(weekDays[0]), "d MMM", { locale: ru })} – ${format(parseISODate(weekDays[6]), "d MMM yyyy", { locale: ru })}`
  const agendaLabel = `${format(parseISODate(agendaDays[0]), "d MMM", { locale: ru })} – ${format(parseISODate(agendaDays[AGENDA_LENGTH - 1]), "d MMM yyyy", { locale: ru })}`

  const isTaskOnDay = (task: (typeof tasks)[number], day: string) =>
    !task.archived &&
    !task.deletedAt &&
    task.status !== "cancelled" &&
    (task.scheduledDate === day || task.dueDate === day || task.startAt?.slice(0, 10) === day)

  const dayTasks = tasks.filter((task) => isTaskOnDay(task, selected))
  const dayHabits = habits.filter((habit) => habit.active && !habit.archived && isScheduled(habit, selected))

  const shift = (amount: number) => {
    const days = view === "month" ? 0 : view === "agenda" ? amount * AGENDA_LENGTH : amount * 7
    if (view === "month") {
      const date = new Date(cursor.year, cursor.month + amount, 1)
      setCursor({ year: date.getFullYear(), month: date.getMonth() })
      return
    }
    const next = addDays(selected, days)
    setSelected(next)
    const date = parseISODate(next)
    setCursor({ year: date.getFullYear(), month: date.getMonth() })
  }

  const goToday = () => {
    setSelected(today)
    const date = parseISODate(today)
    setCursor({ year: date.getFullYear(), month: date.getMonth() })
  }

  const taskCount = (day: string) => tasks.filter((task) => isTaskOnDay(task, day)).length
  const habitDoneCount = (day: string) => {
    const scheduled = habits.filter((habit) => habit.active && !habit.archived && isScheduled(habit, day))
    return scheduled.filter((habit) => isDoneLog(habit, logs.get(logKey(habit.id, day)))).length
  }

  const moveTaskToSlot = (taskId: string, day: string, minutes: number) => {
    const task = tasks.find((item) => item.id === taskId)
    if (!task) return
    updateTask(taskId, getCalendarDropPatch(task, day, minutes))
  }

  const renderTask = (task: (typeof tasks)[number], compact = false) => (
    <button
      key={task.id}
      type="button"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/task-id", task.id)
        event.dataTransfer.effectAllowed = "move"
      }}
      onClick={() => setTaskId(task.id)}
      className={cn(
        "w-full rounded-lg border border-line bg-white/[0.04] px-2 py-1.5 text-left hover:border-accent/50 hover:bg-white/[0.07]",
        compact && "text-[11px]",
      )}
      title={task.title}
    >
      <span className={cn("block truncate font-medium", task.status === "done" && "line-through text-muted")}>{task.title}</span>
      {!compact && (
        <span className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-muted">
          {task.startAt && <span>{getCalendarTaskTime(task)}</span>}
          {task.endAt && <span>до {getCalendarTaskTime({ ...task, startAt: task.endAt })}</span>}
          {task.dueDate && <span>Срок: {task.dueDate}</span>}
        </span>
      )}
    </button>
  )

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        kicker="Календарь"
        title={view === "month" ? "Месяц" : view === "week" ? "Неделя" : "Повестка"}
        text="Планируйте задачи по дням и времени, переносите карточки на нужную дату или временной интервал."
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-line p-0.5">
            {(["month", "week", "agenda"] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={cn("rounded-md px-3 py-1 text-sm", view === item && "bg-white/10")}
                onClick={() => setView(item)}
              >
                {item === "month" ? "Месяц" : item === "week" ? "Неделя" : "Повестка"}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-ghost text-sm" onClick={goToday}>Сегодня</button>
          <button type="button" className="icon-btn border border-line" aria-label="Назад" onClick={() => shift(-1)}>
            <ChevronLeft size={18} />
          </button>
          <p className="min-w-40 text-center font-medium capitalize">
            {view === "month" ? monthLabel : view === "week" ? weekLabel : agendaLabel}
          </p>
          <button type="button" className="icon-btn border border-line" aria-label="Вперёд" onClick={() => shift(1)}>
            <ChevronRight size={18} />
          </button>
        </div>
      </PageHeader>

      {view === "month" && (
        <Card>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-dim">
            {HEADS[weekStartsOn].map((label) => <div key={label} className="py-1">{label}</div>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((day, index) => {
              if (!day) return <div key={`empty-${index}`} className="min-h-16" />
              const count = taskCount(day)
              const habitsDone = habitDoneCount(day)
              const habitsTotal = habits.filter((habit) => habit.active && !habit.archived && isScheduled(habit, day)).length
              const hasEntry = entries.some((entry) => entry.date === day)
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelected(day)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    const id = event.dataTransfer.getData("text/task-id")
                    if (id) {
                      const task = tasks.find((item) => item.id === id)
                      if (task) updateTask(id, getCalendarDayDropPatch(task, day))
                    }
                  }}
                  className={cn(
                    "min-h-16 rounded-xl border px-1.5 py-1.5 text-left transition",
                    day === selected ? "border-accent bg-accent/5" : "border-transparent bg-line/20 hover:bg-line/30",
                    day === today && "ring-1 ring-accent",
                  )}
                >
                  <span className="block text-sm font-medium tabular-nums">{Number(day.slice(8))}</span>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {count > 0 && <span className="rounded bg-accent/20 px-1 text-[10px] text-accent">{count}</span>}
                    {habitsTotal > 0 && <span className="rounded bg-white/10 px-1 text-[10px] text-muted">{habitsDone}/{habitsTotal}</span>}
                    {hasEntry && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Есть запись" />}
                  </div>
                </button>
              )
            })}
          </div>
        </Card>
      )}

      {view === "week" && (
        <Card>
          <p className="mb-3 text-xs text-muted">Перетащите задачу из списка дня или из другого временного слота. Шаг сетки — 30 минут. Продолжительность задачи сохраняется.</p>
          <div className="overflow-x-auto">
            <div className="min-w-[1120px]">
              <div className="grid grid-cols-[64px_repeat(7,minmax(140px,1fr))] gap-1">
                <div />
                {weekDays.map((day) => (
                  <button key={day} type="button" onClick={() => setSelected(day)} className={cn("rounded-lg px-2 py-2 text-center text-xs font-medium", day === selected ? "bg-accent/15 text-accent" : "bg-white/5")}>
                    <span className="block">{format(parseISODate(day), "EEE", { locale: ru })}</span>
                    <span className="mt-0.5 block text-sm">{format(parseISODate(day), "d MMM", { locale: ru })}</span>
                  </button>
                ))}
                <div className="text-[10px] text-muted">Весь день</div>
                {weekDays.map((day) => {
                  const allDayTasks = tasks.filter((task) => isTaskOnDay(task, day) && (!task.startAt || task.startAt.slice(0, 10) !== day || task.allDay))
                  return (
                    <div
                      key={day}
                      className="min-h-16 space-y-1 rounded-lg border border-line/60 p-1"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault()
                        const id = event.dataTransfer.getData("text/task-id")
                        if (id) updateTask(id, { scheduledDate: day, allDay: true, startAt: undefined, endAt: undefined })
                      }}
                    >
                      {allDayTasks.map((task) => renderTask(task, true))}
                    </div>
                  )
                })}
                {TIME_SLOTS.map((minutes) => (
                  <Fragment key={minutes}>
<div key={`label-${minutes}`} className="border-t border-line/60 pt-1 text-[10px] text-muted">{minutes % 60 === 0 ? localTimeLabel(minutes) : ""}</div>
                    {weekDays.map((day) => {
                      const slotTasks = tasks.filter((task) => {
                        if (!isTaskOnDay(task, day) || task.allDay || task.startAt?.slice(0, 10) !== day) return false
                        const time = getCalendarTaskTime(task)
                        if (!time) return false
                        const [hours, mins] = time.split(":").map(Number)
                        return Math.floor((hours * 60 + mins) / 30) * 30 === minutes
                      })
                      return (
                        <div
                          key={`${day}-${minutes}`}
                          className="min-h-11 border-t border-line/60 p-0.5"
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault()
                            const id = event.dataTransfer.getData("text/task-id")
                            if (id) moveTaskToSlot(id, day, minutes)
                          }}
                        >
                          {slotTasks.map((task) => renderTask(task, true))}
                        </div>
                      )
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      {view === "agenda" && (
        <div className="space-y-2">
          {agendaDays.map((day) => {
            const dayItems = tasks.filter((task) => isTaskOnDay(task, day)).sort((a, b) => {
              const aTime = a.startAt?.slice(11, 16) ?? "99:99"
              const bTime = b.startAt?.slice(11, 16) ?? "99:99"
              return aTime.localeCompare(bTime)
            })
            const dayHabits = habits.filter((habit) => habit.active && !habit.archived && isScheduled(habit, day))
            return (
              <Card key={day} className={cn(day === today && "border-accent/40")}>
                <button type="button" onClick={() => { setSelected(day); setView("week") }} className="mb-2 flex w-full items-center justify-between text-left">
                  <span className="font-semibold capitalize">{format(parseISODate(day), "EEEE, d MMMM", { locale: ru })}</span>
                  <span className="text-xs text-muted">{dayItems.length} задач</span>
                </button>
                {dayItems.length === 0 && dayHabits.length === 0 && <p className="text-sm text-muted">Нет запланированных задач</p>}
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {dayItems.map((task) => renderTask(task))}
                </div>
                {dayHabits.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {dayHabits.map((habit) => {
                      const done = isDoneLog(habit, logs.get(logKey(habit.id, day)))
                      return (
                        <button key={habit.id} type="button" onClick={() => setHabitValue(habit.id, day, true)} className={cn("rounded-full border px-2.5 py-1 text-xs", done ? "border-accent bg-accent/15 text-accent" : "border-line text-muted")}>
                          {done ? "✓ " : ""}{habit.title}
                        </button>
                      )
                    })}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <Card className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold capitalize">{format(parseISODate(selected), "EEEE, d MMMM", { locale: ru })}</h2>
          {selected === today && <span className="text-xs text-accent">Сегодня</span>}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const value = draft.trim()
            if (!value) return
            const id = addTask({ title: value, status: "planned", scheduledDate: selected, priority: "none" })
            setDraft("")
            setTaskId(id)
          }}
        >
          <input className="field" placeholder="Задача на этот день" value={draft} onChange={(event) => setDraft(event.target.value)} />
          <button className="btn btn-primary" type="submit">Добавить</button>
        </form>
        <div className="mt-4">
          <p className="mb-2 text-xs text-muted">Задачи</p>
          <div className="grid gap-2">
            {dayTasks.length === 0 && <p className="text-sm text-muted">На этот день задач нет.</p>}
            {dayTasks.map((task) => renderTask(task))}
          </div>
        </div>
        {dayHabits.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs text-muted">Привычки</p>
            <div className="flex flex-wrap gap-2">
              {dayHabits.map((habit) => {
                const done = isDoneLog(habit, logs.get(logKey(habit.id, selected)))
                return (
                  <button key={habit.id} type="button" className={cn("rounded-full border px-3 py-1 text-sm transition", done ? "border-accent bg-accent/20 text-accent" : "border-line hover:bg-white/5")} onClick={() => setHabitValue(habit.id, selected, true)}>
                    {done ? "✓ " : ""}{habit.title}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
