import { useMemo, useState, type ReactElement } from "react"
import { useNexora } from "@/lib/nexora/store"
import { useUI } from "@/lib/nexora/ui-store"
import { WIDGETS } from "@/lib/nexora/copy"
import { isoDate, format, parseISODate, ru } from "@/lib/nexora/dates"
import { dayTaskPool, isTodayTask, isScheduled, isDoneLog, logKey, logMap, suggestTask } from "@/lib/nexora/logic"
import { Button, Card, Input } from "./ui"

function greeting() {
  const h = new Date().getHours()
  if (h < 6) return "Доброй ночи"
  if (h < 12) return "Доброе утро"
  if (h < 18) return "Добрый день"
  return "Добрый вечер"
}

export function Dashboard() {
  const tasks = useNexora((s) => s.tasks)
  const habits = useNexora((s) => s.habits)
  const habitLogs = useNexora((s) => s.habitLogs)
  const entries = useNexora((s) => s.entries)
  const projects = useNexora((s) => s.projects)
  const settings = useNexora((s) => s.settings)
  const setTaskStatus = useNexora((s) => s.setTaskStatus)
  const setHabitValue = useNexora((s) => s.setHabitValue)
  const addTask = useNexora((s) => s.addTask)
  const moveWidget = useNexora((s) => s.moveWidget)
  const toggleWidget = useNexora((s) => s.toggleWidget)
  const setTaskId = useUI((s) => s.setTaskId)

  const today = isoDate()
  const [minutes, setMinutes] = useState("")
  const [capture, setCapture] = useState("")
  const [editing, setEditing] = useState(false)

  const logs = useMemo(() => logMap(habitLogs), [habitLogs])
  const entry = entries.find((e) => e.date === today)
  const pool = dayTaskPool(tasks, today)
  const doneTasks = pool.filter((t) => t.status === "done").length
  const habitsToday = habits.filter((h) => isScheduled(h, today))
  const habitsDone = habitsToday.filter((h) => isDoneLog(h, logs.get(logKey(h.id, today)))).length
  const total = pool.length + habitsToday.length
  const done = doneTasks + habitsDone
  const progress = total === 0 ? 0 : Math.round((done / total) * 100)

  const suggestion = suggestTask(tasks, today, {
    minutes: minutes ? Number(minutes) : undefined,
    energy: entry?.energy,
  })

  const todayTasks = tasks.filter((t) => isTodayTask(t, today) && t.status !== "done")
  const activeProjects = projects.filter((p) => p.status === "active" && !p.archived).slice(0, 3)
  const dateLabel = format(parseISODate(today), "EEEE, d MMMM", { locale: ru })
  const order = settings.widgetOrder.length ? settings.widgetOrder : WIDGETS.map((w) => w.id)
  const hidden = new Set(settings.hiddenWidgets)
  const name = settings.displayName.trim()
  const hello = name ? `${greeting()}, ${name}` : greeting()

  const blocks: Record<string, ReactElement> = {
    progress: (
      <Card key="progress" className="p-4">
        <p className="text-sm text-muted">Прогресс дня</p>
        <div className="mt-2 flex items-end gap-3">
          <span className="text-3xl font-semibold">{progress}%</span>
          <span className="text-sm text-muted">{done} из {total}</span>
        </div>
        <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full bg-teal-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </Card>
    ),
    habits: (
      <Card key="habits" className="p-4 space-y-2">
        <p className="text-sm text-muted">Привычки сегодня</p>
        {habitsToday.length === 0 && <p className="text-sm text-muted">Нет запланированных</p>}
        {habitsToday.map((h) => {
          const done = isDoneLog(h, logs.get(logKey(h.id, today)))
          return (
            <div key={h.id} className="flex items-center justify-between gap-2">
              <span className={done ? "line-through text-muted" : ""}>{h.title}</span>
              <Button size="sm" variant={done ? "primary" : "secondary"} onClick={() => setHabitValue(h.id, today, true)}>
                {done ? "✓" : "Отметить"}
              </Button>
            </div>
          )
        })}
      </Card>
    ),
    tasks: (
      <Card key="tasks" className="p-4 space-y-2">
        <p className="text-sm text-muted">Задачи на сегодня</p>
        {todayTasks.length === 0 && <p className="text-sm text-muted">Всё сделано 🎉</p>}
        {todayTasks.slice(0, 5).map((t) => (
          <div key={t.id} className="flex items-center gap-2 cursor-pointer" onClick={() => setTaskId(t.id)}>
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setTaskStatus(t.id, "done") }}>○</Button>
            <span className="truncate">{t.title}</span>
          </div>
        ))}
      </Card>
    ),
    suggest: (
      <Card key="suggest" className="p-4 space-y-3">
        <p className="text-sm text-muted">Чем заняться?</p>
        {suggestion ? (
          <>
            <div className="font-medium">{suggestion.title}</div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setTaskStatus(suggestion.id, "in_progress")}>Взять</Button>
              <Button size="sm" variant="ghost" onClick={() => setTaskId(suggestion.id)}>Открыть</Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">Нет подходящих задач</p>
        )}
        <div className="flex gap-2 items-center">
          <Input type="number" placeholder="мин" value={minutes} onChange={(e) => setMinutes(e.target.value)} className="w-20" />
          <span className="text-xs text-muted">доступно</span>
        </div>
      </Card>
    ),
    projects: (
      <Card key="projects" className="p-4 space-y-2">
        <p className="text-sm text-muted">Активные проекты</p>
        {activeProjects.map((p) => (
          <div key={p.id} className="text-sm">{p.title}</div>
        ))}
        {activeProjects.length === 0 && <p className="text-sm text-muted">Нет активных</p>}
      </Card>
    ),
    capture: (
      <Card key="capture" className="p-4 space-y-2">
        <p className="text-sm text-muted">Быстрый захват</p>
        <div className="flex gap-2">
          <Input
            value={capture}
            onChange={(e) => setCapture(e.target.value)}
            placeholder="Задача или мысль..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && capture.trim()) {
                addTask({ title: capture.trim(), status: "inbox", priority: "none" })
                setCapture("")
              }
            }}
          />
          <Button onClick={() => {
            if (capture.trim()) {
              addTask({ title: capture.trim(), status: "inbox", priority: "none" })
              setCapture("")
            }
          }}>＋</Button>
        </div>
      </Card>
    ),
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{hello}</h1>
          <p className="text-muted capitalize">{dateLabel}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)}>
          {editing ? "Готово" : "Виджеты"}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {order.filter((id) => !hidden.has(id) && blocks[id]).map((id) => (
          <div key={id} className="relative">
            {blocks[id]}
            {editing && (
              <div className="absolute top-2 right-2 flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => moveWidget(id, -1)}>↑</Button>
                <Button size="sm" variant="ghost" onClick={() => moveWidget(id, 1)}>↓</Button>
                <Button size="sm" variant="ghost" onClick={() => toggleWidget(id)}>✕</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
