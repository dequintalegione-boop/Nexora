import { useMemo, useState } from "react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { addDays, isoDate, monthGrid, parseISODate, startOfWeek } from "@/lib/nexora/dates"
import { isScheduled, logKey, logMap, isDoneLog } from "@/lib/nexora/logic"
import { useNexora } from "@/lib/nexora/store"
import { useUI } from "@/lib/nexora/ui-store"
import { cn } from "@/lib/cn"
import { Card, PageHeader } from "./ui"

const HEADS = {
  1: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
  0: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
} as const

export function CalendarPage() {
  const today = isoDate()
  const initial = parseISODate(today)
  const [view, setView] = useState<"month" | "week">("month")
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

  const cells = useMemo(() => {
    if (view === "month") {
      return monthGrid(cursor.year, cursor.month, weekStartsOn)
    }
    const weekStart = startOfWeek(selected, weekStartsOn)
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  }, [view, cursor, selected, weekStartsOn])

  const monthLabel = format(new Date(cursor.year, cursor.month, 1), "LLLL yyyy", { locale: ru })
  const weekLabel = (() => {
    const start = startOfWeek(selected, weekStartsOn)
    const end = addDays(start, 6)
    return `${format(parseISODate(start), "d MMM", { locale: ru })} – ${format(parseISODate(end), "d MMM yyyy", { locale: ru })}`
  })()

  const isTaskOnDay = (task: (typeof tasks)[number], day: string) =>
    !task.archived &&
    !task.deletedAt &&
    task.status !== "cancelled" &&
    (task.scheduledDate === day || task.dueDate === day || task.startAt?.slice(0, 10) === day)

  const dayTasks = tasks.filter((task) => isTaskOnDay(task, selected))
  const dayHabits = habits.filter((h) => h.active && !h.archived && isScheduled(h, selected))

  const shift = (amount: number) => {
    if (view === "month") {
      const date = new Date(cursor.year, cursor.month + amount, 1)
      setCursor({ year: date.getFullYear(), month: date.getMonth() })
    } else {
      const next = addDays(selected, amount * 7)
      setSelected(next)
      const d = parseISODate(next)
      setCursor({ year: d.getFullYear(), month: d.getMonth() })
    }
  }

  const goToday = () => {
    setSelected(today)
    const d = parseISODate(today)
    setCursor({ year: d.getFullYear(), month: d.getMonth() })
  }

  const taskCount = (day: string) =>
    tasks.filter(
      (t) => isTaskOnDay(t, day)
    ).length

  const habitDoneCount = (day: string) => {
    const scheduled = habits.filter((h) => h.active && !h.archived && isScheduled(h, day))
    return scheduled.filter((h) => isDoneLog(h, logs.get(logKey(h.id, day)))).length
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        kicker="Календарь"
        title={view === "month" ? "Месяц" : "Неделя"}
        text="Клик по дню — задачи и привычки. Перетащите задачу на другую дату. Можно быстро создать задачу на выбранный день."
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-line p-0.5">
            <button
              type="button"
              className={cn("px-3 py-1 text-sm rounded-md", view === "month" && "bg-white/10")}
              onClick={() => setView("month")}
            >
              Месяц
            </button>
            <button
              type="button"
              className={cn("px-3 py-1 text-sm rounded-md", view === "week" && "bg-white/10")}
              onClick={() => setView("week")}
            >
              Неделя
            </button>
          </div>
          <button type="button" className="btn btn-ghost text-sm" onClick={goToday}>
            Сегодня
          </button>
          <button type="button" className="icon-btn border border-line" aria-label="Назад" onClick={() => shift(-1)}>
            <ChevronLeft size={18} />
          </button>
          <p className="min-w-40 text-center font-medium capitalize">
            {view === "month" ? monthLabel : weekLabel}
          </p>
          <button type="button" className="icon-btn border border-line" aria-label="Вперёд" onClick={() => shift(1)}>
            <ChevronRight size={18} />
          </button>
        </div>
      </PageHeader>

      <Card>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-dim">
          {HEADS[weekStartsOn].map((label) => (
            <div key={label} className="py-1">
              {label}
            </div>
          ))}
        </div>
        <div className={cn("mt-1 grid grid-cols-7 gap-1", view === "week" && "auto-rows-fr")}>
          {cells.map((day, index) => {
            if (!day) return <div key={`empty-${index}`} className="min-h-16" />
            const count = taskCount(day)
            const habitsDone = habitDoneCount(day)
            const habitsTotal = habits.filter((h) => h.active && !h.archived && isScheduled(h, day)).length
            const hasEntry = entries.some((entry) => entry.date === day)
            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelected(day)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  const id = event.dataTransfer.getData("text/task-id")
                  if (id) updateTask(id, { scheduledDate: day })
                }}
                className={cn(
                  "min-h-16 rounded-xl border px-1.5 py-1.5 text-left transition",
                  day === selected ? "border-accent bg-accent/5" : "border-transparent bg-line/20 hover:bg-line/30",
                  day === today && "ring-1 ring-accent",
                  view === "week" && "min-h-28"
                )}
              >
                <span className="block text-sm tabular-nums font-medium">{Number(day.slice(8))}</span>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {count > 0 && (
                    <span className="text-[10px] px-1 rounded bg-accent/20 text-accent">{count}</span>
                  )}
                  {habitsTotal > 0 && (
                    <span className="text-[10px] px-1 rounded bg-white/10 text-muted">
                      {habitsDone}/{habitsTotal}
                    </span>
                  )}
                  {hasEntry && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Есть запись" />}
                </div>
                {view === "week" && (
                  <div className="mt-1 space-y-0.5">
                    {tasks
                      .filter((t) => isTaskOnDay(t, day))
                      .slice(0, 3)
                      .map((t) => (
                        <div key={t.id} className="truncate text-[11px] text-muted">
                          {t.title}
                        </div>
                      ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
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
          onSubmit={(event) => {
            event.preventDefault()
            const value = draft.trim()
            if (!value) return
            const id = addTask({
              title: value,
              status: "planned",
              dueDate: selected,
              scheduledDate: selected,
              priority: "none",
            })
            setDraft("")
            setTaskId(id)
          }}
        >
          <input
            className="field"
            placeholder="Задача на этот день"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button className="btn btn-primary" type="submit">
            Добавить
          </button>
        </form>

        <div className="mt-4">
          <p className="text-xs text-muted mb-2">Задачи</p>
          <div className="grid gap-2">
            {dayTasks.length === 0 && <p className="text-sm text-muted">На этот день задач нет.</p>}
            {dayTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                draggable
                onDragStart={(event) => event.dataTransfer.setData("text/task-id", task.id)}
                className="rounded-xl border border-line px-3 py-2 text-left hover:bg-white/5"
                onClick={() => setTaskId(task.id)}
              >
                <span className={cn(task.status === "done" && "line-through text-muted")}>{task.title}</span>
                {task.startAt && <span className="ml-2 text-xs text-muted">{new Date(task.startAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>}
                {task.dueDate === selected && <span className="ml-2 text-[10px] text-amber-400">Дедлайн</span>}
              </button>
            ))}
          </div>
        </div>

        {dayHabits.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-muted mb-2">Привычки</p>
            <div className="flex flex-wrap gap-2">
              {dayHabits.map((habit) => {
                const done = isDoneLog(habit, logs.get(logKey(habit.id, selected)))
                return (
                  <button
                    key={habit.id}
                    type="button"
                    className={cn(
                      "rounded-full px-3 py-1 text-sm border transition",
                      done ? "bg-accent/20 border-accent text-accent" : "border-line hover:bg-white/5"
                    )}
                    onClick={() => setHabitValue(habit.id, selected, true)}
                  >
                    {done ? "✓ " : ""}
                    {habit.title}
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
