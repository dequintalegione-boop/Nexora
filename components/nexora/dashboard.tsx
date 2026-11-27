import { useMemo, useState, type ReactElement } from "react"
import { format } from "date-fns"
import { ru } from "date-fns/locale"
import { useNexora } from "@/lib/nexora/store"
import { useUI } from "@/lib/nexora/ui-store"
import { WIDGETS } from "@/lib/nexora/copy"
import { addDays, greeting, isoDate, parseISODate } from "@/lib/nexora/dates"
import { useCountUp } from "@/lib/nexora/motion"
import { useDayProgress } from "@/lib/nexora/day-progress"
import { isDoneLog, isScheduled, isTodayTask, logKey, logMap, projectProgress, suggestTask } from "@/lib/nexora/logic"
import { cn } from "@/lib/cn"
import { ActivityChart, type ChartPoint } from "./activity-chart"
import { IconArrowRight, IconCheck, IconPlus, IconSparkle } from "./icons"
import { Button, Card, Input, Meter, Ring } from "./ui"

const PERIODS = [7, 14, 30] as const
type Period = (typeof PERIODS)[number]

function Stat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  const shown = useCountUp(value, 900)
  return (
    <div className="min-w-[84px]">
      <p className="text-xs text-white/40">{label}</p>
      <p className="mt-1.5 text-xl font-medium tabular-nums tracking-tight">
        {Math.round(shown)}
        {suffix && <span className="ml-0.5 text-sm text-white/40">{suffix}</span>}
      </p>
    </div>
  )
}

function CardTitle({ title, sub, right }: { title: string; sub?: string; right?: ReactElement }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-[15px] font-medium tracking-tight">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-white/40">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

export function Dashboard() {
  const tasks = useNexora((s) => s.tasks)
  const habits = useNexora((s) => s.habits)
  const habitLogs = useNexora((s) => s.habitLogs)
  const entries = useNexora((s) => s.entries)
  const projects = useNexora((s) => s.projects)
  const sessions = useNexora((s) => s.sessions)
  const settings = useNexora((s) => s.settings)
  const setTaskStatus = useNexora((s) => s.setTaskStatus)
  const setHabitValue = useNexora((s) => s.setHabitValue)
  const clearHabitLog = useNexora((s) => s.clearHabitLog)
  const addTask = useNexora((s) => s.addTask)
  const moveWidget = useNexora((s) => s.moveWidget)
  const toggleWidget = useNexora((s) => s.toggleWidget)
  const setTaskId = useUI((s) => s.setTaskId)
  const { done, total, progress, todayOpen } = useDayProgress()

  const today = isoDate()
  const [minutes, setMinutes] = useState("")
  const [capture, setCapture] = useState("")
  const [editing, setEditing] = useState(false)
  const [period, setPeriod] = useState<Period>(7)

  const logs = useMemo(() => logMap(habitLogs), [habitLogs])
  const entry = entries.find((e) => e.date === today)
  const habitsToday = habits.filter((h) => isScheduled(h, today))
  const habitsDone = habitsToday.filter((h) => isDoneLog(h, logs.get(logKey(h.id, today)))).length

  const suggestion = suggestTask(tasks, today, {
    minutes: minutes ? Number(minutes) : undefined,
    energy: entry?.energy,
  })

  const todayTasks = tasks.filter((t) => isTodayTask(t, today) && t.status !== "done")
  const activeProjects = projects.filter((p) => p.status === "active" && !p.archived).slice(0, 4)
  const dateLabel = format(parseISODate(today), "EEEE, d MMMM", { locale: ru })
  const order = settings.widgetOrder.length ? settings.widgetOrder : WIDGETS.map((w) => w.id)
  const hidden = new Set(settings.hiddenWidgets)
  const name = settings.displayName.trim()
  const hello = name ? `${greeting()}, ${name}` : greeting()

  const focusToday = useMemo(
    () =>
      sessions
        .filter((s) => isoDate(new Date(s.startedAt)) === today)
        .reduce((sum, s) => sum + (Number.isFinite(s.durationMinutes) ? s.durationMinutes : 0), 0),
    [sessions, today],
  )

  // Завершённые задачи по дням — данные для графика
  const series = useMemo<ChartPoint[]>(() => {
    const counts = new Map<string, number>()
    for (const t of tasks) {
      if (!t.completedAt) continue
      const when = new Date(t.completedAt)
      if (Number.isNaN(when.getTime())) continue
      const key = isoDate(when)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return Array.from({ length: period }, (_, i) => {
      const date = addDays(today, i - (period - 1))
      return {
        label: format(parseISODate(date), "d MMM", { locale: ru }),
        value: counts.get(date) ?? 0,
      }
    })
  }, [tasks, today, period])

  const periodTotal = series.reduce((sum, p) => sum + p.value, 0)
  const doneShown = useCountUp(done, 1000)
  const periodShown = useCountUp(periodTotal, 1000)

  const createCapture = () => {
    const title = capture.trim()
    if (!title) return
    addTask({ title, status: "inbox", priority: "none" })
    setCapture("")
  }

  const blocks: Record<string, { span?: string; node: ReactElement }> = {
    week: {
      span: "md:col-span-2",
      node: (
        <Card key="week" className="p-5 md:p-6">
          <CardTitle
            title="Активность"
            sub={`Завершено за период: ${Math.round(periodShown)}`}
            right={
              <div className="seg" role="group" aria-label="Период">
                {PERIODS.map((p) => (
                  <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}>
                    {p}Д
                  </button>
                ))}
              </div>
            }
          />
          <ActivityChart key={period} data={series} />
        </Card>
      ),
    },
    progress: {
      node: (
        <Card key="progress" className="flex flex-col p-5 md:p-6">
          <CardTitle title="Прогресс дня" sub={`${done} из ${total}`} />
          <div className="flex flex-1 items-center justify-center py-2">
            <Ring value={progress} caption={total === 0 ? "нет задач" : "выполнено"} />
          </div>
        </Card>
      ),
    },
    next: {
      node: (
        <Card key="next" className="p-5 md:p-6">
          <CardTitle title="Чем заняться?" sub="Подбор по сроку, приоритету и энергии" right={<IconSparkle className="text-[var(--color-accent)]" />} />
          {suggestion ? (
            <div className="space-y-4">
              <p className="text-lg font-medium leading-snug tracking-tight">{suggestion.task.title}</p>
              {suggestion.reasons.length > 0 && (
                <p className="text-xs text-white/40">{suggestion.reasons.slice(0, 2).join(" · ")}</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setTaskStatus(suggestion.task.id, "in_progress")}>Взять в работу</Button>
                <Button size="sm" variant="ghost" onClick={() => setTaskId(suggestion.task.id)}>Открыть</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">Нет подходящих задач</p>
          )}
          <div className="mt-5 flex items-center gap-2 border-t border-white/[0.06] pt-4">
            <Input
              type="number"
              min={0}
              placeholder="мин"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="w-20"
              aria-label="Доступно минут"
            />
            <span className="text-xs text-white/40">минут есть</span>
          </div>
        </Card>
      ),
    },
    tasks: {
      node: (
        <Card key="tasks" className="p-5 md:p-6">
          <CardTitle title="Задачи на сегодня" sub={todayTasks.length ? `Осталось ${todayTasks.length}` : undefined} />
          {todayTasks.length === 0 && <p className="text-sm text-muted">Всё сделано</p>}
          <ul className="-mx-2 space-y-0.5">
            {todayTasks.slice(0, 5).map((t) => (
              <li key={t.id}>
                <div
                  role="button"
                  tabIndex={0}
                  className="group flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition-colors duration-300 hover:bg-white/[0.045]"
                  onClick={() => setTaskId(t.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setTaskId(t.id)
                  }}
                >
                  <button
                    type="button"
                    aria-label={`Отметить выполненной: ${t.title}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setTaskStatus(t.id, "done")
                    }}
                    className="pressable flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/25 text-transparent hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                  >
                    <IconCheck width={12} height={12} strokeWidth={2.4} />
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                  <IconArrowRight width={14} height={14} className="shrink-0 -translate-x-1 text-white/0 transition-all duration-300 group-hover:translate-x-0 group-hover:text-white/40" />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ),
    },
    habits: {
      node: (
        <Card key="habits" className="p-5 md:p-6">
          <CardTitle title="Привычки сегодня" sub={habitsToday.length ? `${habitsDone} из ${habitsToday.length}` : undefined} />
          {habitsToday.length === 0 && <p className="text-sm text-muted">Нет запланированных</p>}
          <ul className="-mx-2 space-y-0.5">
            {habitsToday.map((h) => {
              const isDone = isDoneLog(h, logs.get(logKey(h.id, today)))
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    aria-pressed={isDone}
                    onClick={() => {
                      if (isDone) clearHabitLog(h.id, today)
                      else setHabitValue(h.id, today, h.measurementType === "boolean" ? true : h.targetValue && h.targetValue > 0 ? h.targetValue : 1)
                    }}
                    className="pressable flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-300 hover:bg-white/[0.045]"
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all duration-300",
                        isDone
                          ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[#04120b] shadow-[0_0_14px_var(--color-accent-glow)]"
                          : "border-white/25 text-transparent",
                      )}
                    >
                      <IconCheck width={12} height={12} strokeWidth={2.6} />
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate text-sm transition-colors duration-300", isDone && "text-white/35 line-through")}>
                      {h.title}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>
      ),
    },
    projects: {
      node: (
        <Card key="projects" className="p-5 md:p-6">
          <CardTitle title="Активные проекты" />
          {activeProjects.length === 0 && <p className="text-sm text-muted">Нет активных</p>}
          <ul className="space-y-4">
            {activeProjects.map((p) => {
              const value = projectProgress(p, tasks)
              return (
                <li key={p.id}>
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{p.title}</span>
                    <span className="text-xs tabular-nums text-white/40">{value}%</span>
                  </div>
                  <Meter value={value} />
                </li>
              )
            })}
          </ul>
        </Card>
      ),
    },
    capture: {
      node: (
        <Card key="capture" className="p-5 md:p-6">
          <CardTitle title="Быстрый захват" sub="Мысль или задача — сразу во входящие" />
          <div className="flex gap-2">
            <Input
              value={capture}
              onChange={(e) => setCapture(e.target.value)}
              placeholder="Что нужно сделать…"
              className="min-w-0 flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") createCapture()
              }}
            />
            <Button onClick={createCapture} aria-label="Добавить" className="!px-3.5">
              <IconPlus width={16} height={16} />
            </Button>
          </div>
        </Card>
      ),
    },
  }

  const visible = order.filter((id) => !hidden.has(id) && blocks[id])

  return (
    <div className="space-y-8 p-4 md:p-8">
      {/* Верхний блок */}
      <section className="animate-in flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow mb-3 capitalize">{dateLabel}</p>
          <h1 className="text-[22px] font-medium tracking-tight text-white/70">{hello}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <span className="num-xl tabular-nums">{Math.round(doneShown)}</span>
            <span className="rounded-full border border-[color-mix(in_srgb,var(--color-accent)_30%,transparent)] bg-[var(--color-accent-soft)] px-3 py-1 text-[13px] text-[var(--color-accent)]">
              {progress}% дня
            </span>
          </div>
          <p className="mt-2 text-sm text-white/40">выполнено сегодня</p>
        </div>
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <Stat label="Осталось задач" value={todayOpen} />
          <Stat label="Привычки" value={habitsDone} suffix={`/${habitsToday.length}`} />
          <Stat label="Фокус" value={focusToday} suffix=" мин" />
          <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)}>
            {editing ? "Готово" : "Виджеты"}
          </Button>
        </div>
      </section>

      {/* Виджеты */}
      <section className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((id) => (
          <div key={id} className={cn("relative", blocks[id].span)}>
            {blocks[id].node}
            {editing && (
              <div className="animate-fade absolute right-3 top-3 z-20 flex gap-1 rounded-full border border-white/10 bg-black/60 p-1 backdrop-blur">
                <Button size="sm" variant="ghost" onClick={() => moveWidget(id, -1)} aria-label="Выше">↑</Button>
                <Button size="sm" variant="ghost" onClick={() => moveWidget(id, 1)} aria-label="Ниже">↓</Button>
                <Button size="sm" variant="ghost" onClick={() => toggleWidget(id)} aria-label="Скрыть">✕</Button>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  )
}
