import { useMemo, useState } from "react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { addDays, isoDate, parseISODate, startOfWeek } from "@/lib/nexora/dates"
import {
  isDoneLog,
  isOpenTask,
  isScheduled,
  logKey,
  logMap,
  projectProgress,
  regularity,
  streak,
} from "@/lib/nexora/logic"
import { useNexora } from "@/lib/nexora/store"
import { Card, PageHeader, Meter } from "./ui"

export function AnalyticsPage() {
  const today = isoDate()
  const weekStartsOn = useNexora((s) => s.settings.weekStartsOn)
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(today, weekStartsOn))

  const tasks = useNexora((s) => s.tasks)
  const habits = useNexora((s) => s.habits)
  const habitLogs = useNexora((s) => s.habitLogs)
  const entries = useNexora((s) => s.entries)
  const projects = useNexora((s) => s.projects)
  const goals = useNexora((s) => s.goals)
  const sessions = useNexora((s) => s.sessions)

  const logs = useMemo(() => logMap(habitLogs), [habitLogs])

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekAnchor, i)),
    [weekAnchor]
  )
  const weekEnd = weekDays[6]
  const prevAnchor = addDays(weekAnchor, -7)

  const label = `${format(parseISODate(weekAnchor), "d MMM", { locale: ru })} – ${format(
    parseISODate(weekEnd),
    "d MMM yyyy",
    { locale: ru }
  )}`

  const weekTasks = tasks.filter((t) => {
    if (t.archived) return false
    const d = t.dueDate || t.scheduledDate || t.updatedAt?.slice(0, 10)
    return d && d >= weekAnchor && d <= weekEnd
  })
  const doneTasks = weekTasks.filter((t) => t.status === "done")
  const openTasks = weekTasks.filter((t) => isOpenTask(t))
  const taskRate = weekTasks.length ? Math.round((doneTasks.length / weekTasks.length) * 100) : 0

  const prevWeekTasks = tasks.filter((t) => {
    if (t.archived) return false
    const d = t.dueDate || t.scheduledDate || t.updatedAt?.slice(0, 10)
    return d && d >= prevAnchor && d < weekAnchor
  })
  const prevDone = prevWeekTasks.filter((t) => t.status === "done").length
  const prevRate = prevWeekTasks.length ? Math.round((prevDone / prevWeekTasks.length) * 100) : 0

  const activeHabits = habits.filter((h) => h.active && !h.archived)
  const habitStats = activeHabits.map((h) => {
    let scheduled = 0
    let done = 0
    for (const day of weekDays) {
      if (isScheduled(h, day)) {
        scheduled++
        if (isDoneLog(h, logs.get(logKey(h.id, day)))) done++
      }
    }
    const rate = scheduled ? Math.round((done / scheduled) * 100) : 0
    return {
      habit: h,
      scheduled,
      done,
      rate,
      streak: streak(h, logs, today),
      monthRate: regularity(h, logs, today, 30),
    }
  })
  const avgHabitRate =
    habitStats.length === 0
      ? 0
      : Math.round(habitStats.reduce((s, x) => s + x.rate, 0) / habitStats.length)

  const weekEntries = entries.filter((e) => e.date >= weekAnchor && e.date <= weekEnd)
  const moods = weekEntries.map((e) => e.mood).filter((v): v is number => v != null)
  const energies = weekEntries.map((e) => e.energy).filter((v): v is number => v != null)
  const avgMood = moods.length ? +(moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1) : null
  const avgEnergy = energies.length
    ? +(energies.reduce((a, b) => a + b, 0) / energies.length).toFixed(1)
    : null

  const activeProjects = projects.filter((p) => p.status === "active" && !p.archived)
  const projectStats = activeProjects.map((p) => ({
    project: p,
    progress: projectProgress(p, tasks),
  }))

  const activeGoals = goals.filter((g) => g.status === "active" && !g.archived)

  const weekSessions = sessions.filter((s) => {
    const d = s.startedAt?.slice(0, 10)
    return d && d >= weekAnchor && d <= weekEnd
  })
  const totalMinutes = weekSessions.reduce((s, x) => s + (x.durationMinutes || 0), 0)

  const shiftWeek = (dir: -1 | 1) => setWeekAnchor(addDays(weekAnchor, dir * 7))

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        kicker="Аналитика"
        title="Weekly Review"
        text="Что планировалось, что сделано, как себя чувствовали и куда двигаться дальше."
      >
        <div className="flex items-center gap-2">
          <button type="button" className="icon-btn border border-line" onClick={() => shiftWeek(-1)}>
            <ChevronLeft size={18} />
          </button>
          <p className="min-w-44 text-center text-sm font-medium">{label}</p>
          <button type="button" className="icon-btn border border-line" onClick={() => shiftWeek(1)}>
            <ChevronRight size={18} />
          </button>
          <button
            type="button"
            className="btn btn-ghost text-sm"
            onClick={() => setWeekAnchor(startOfWeek(today, weekStartsOn))}
          >
            Эта неделя
          </button>
        </div>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-muted">Задачи</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {doneTasks.length}
            <span className="text-base text-muted font-normal"> / {weekTasks.length}</span>
          </p>
          <div className="mt-2"><Meter value={taskRate} /></div>
          <p className="mt-1 text-xs text-muted">
            {taskRate}% · прошл. нед. {prevRate}%
            {taskRate > prevRate ? " ↑" : taskRate < prevRate ? " ↓" : ""}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-xs text-muted">Привычки</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{avgHabitRate}%</p>
          <div className="mt-2"><Meter value={avgHabitRate} /></div>
          <p className="mt-1 text-xs text-muted">{activeHabits.length} активных</p>
        </Card>

        <Card className="p-4">
          <p className="text-xs text-muted">Настроение / Энергия</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {avgMood ?? "—"}
            <span className="text-base text-muted font-normal"> / {avgEnergy ?? "—"}</span>
          </p>
          <p className="mt-2 text-xs text-muted">{weekEntries.length} записей за неделю</p>
        </Card>

        <Card className="p-4">
          <p className="text-xs text-muted">Время в фокусе</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {totalMinutes > 0 ? `${Math.round(totalMinutes / 60)}ч ${totalMinutes % 60}м` : "—"}
          </p>
          <p className="mt-2 text-xs text-muted">{weekSessions.length} сессий</p>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Привычки за неделю</h2>
        {habitStats.length === 0 && <p className="text-sm text-muted">Нет активных привычек</p>}
        <div className="space-y-3">
          {habitStats.map(({ habit, done, scheduled, rate, streak: st, monthRate }) => (
            <div key={habit.id} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{habit.title}</span>
                  <span className="text-sm tabular-nums text-muted">
                    {done}/{scheduled} · {rate}%
                  </span>
                </div>
                <div className="mt-1"><Meter value={rate} /></div>
                <p className="mt-0.5 text-xs text-muted">
                  Серия {st} · за 30 дней {monthRate}%
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <h2 className="font-semibold mb-3">Выполненные задачи</h2>
          {doneTasks.length === 0 && <p className="text-sm text-muted">Пока пусто</p>}
          <ul className="space-y-1.5">
            {doneTasks.slice(0, 12).map((t) => (
              <li key={t.id} className="text-sm flex items-start gap-2">
                <span className="text-accent mt-0.5">✓</span>
                <span className="truncate">{t.title}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <h2 className="font-semibold mb-3">Осталось открытых</h2>
          {openTasks.length === 0 && <p className="text-sm text-muted">Всё закрыто 🎉</p>}
          <ul className="space-y-1.5">
            {openTasks.slice(0, 12).map((t) => (
              <li key={t.id} className="text-sm flex items-start gap-2">
                <span className="text-muted mt-0.5">○</span>
                <span className="truncate">{t.title}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <h2 className="font-semibold mb-3">Проекты</h2>
          {projectStats.length === 0 && <p className="text-sm text-muted">Нет активных</p>}
          <div className="space-y-3">
            {projectStats.map(({ project, progress }) => (
              <div key={project.id}>
                <div className="flex justify-between text-sm">
                  <span className="truncate">{project.title}</span>
                  <span className="tabular-nums text-muted">{progress}%</span>
                </div>
                <div className="mt-1"><Meter value={progress} /></div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="font-semibold mb-3">Цели</h2>
          {activeGoals.length === 0 && <p className="text-sm text-muted">Нет активных целей</p>}
          <ul className="space-y-2">
            {activeGoals.map((g) => (
              <li key={g.id} className="text-sm">
                <div className="flex justify-between gap-2">
                  <span className="truncate">{g.title}</span>
                  <span className="text-muted tabular-nums">{g.progress ?? 0}%</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Настроение по дням</h2>
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((day) => {
            const entry = entries.find((e) => e.date === day)
            const mood = entry?.mood
            return (
              <div key={day} className="text-center">
                <p className="text-xs text-muted mb-1">
                  {format(parseISODate(day), "EEEEE", { locale: ru })}
                </p>
                <div
                  className="mx-auto h-10 w-10 rounded-lg flex items-center justify-center text-sm font-medium"
                  style={{
                    background:
                      mood != null
                        ? `color-mix(in oklch, var(--color-accent) ${mood * 10}%, transparent)`
                        : "var(--color-line, #ffffff10)",
                  }}
                >
                  {mood ?? "—"}
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
