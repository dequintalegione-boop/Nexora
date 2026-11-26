import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { todayISODate } from '@/lib/journal'
import { formatDate } from '@/lib/utils'
import { CheckSquare, FolderKanban, Target, BookOpen, TrendingUp, Zap, Clock, ArrowUpRight, CalendarDays, BarChart3 } from 'lucide-react'

export function Dashboard() {
  const today = todayISODate()
  const tasks = useLiveQuery(() => db.tasks.toArray(), [])
  const projectsCount = useLiveQuery(() => db.projects.where('status').equals('active').count())
  const goalsCount = useLiveQuery(() => db.goals.where('status').equals('active').count())
  const todayEntry = useLiveQuery(() => db.dailyEntries.where('date').equals(today).first(), [today])
  const habits = useLiveQuery(() => db.habits.filter(h => h.active && !h.archived).toArray(), [])
  const logs = useLiveQuery(() => db.habitLogs.where('date').equals(today).toArray(), [today])
  const sessions = useLiveQuery(() => db.timeSessions.toArray(), [])
  const metrics = useMemo(() => {
    const activeTasks = (tasks ?? []).filter(t => !t.archived && t.status !== 'cancelled')
    const completedToday = activeTasks.filter(t => t.status === 'done' && t.updatedAt.slice(0,10) === today).length
    const plannedToday = activeTasks.filter(t => t.scheduledDate?.slice(0,10) === today || t.dueDate?.slice(0,10) === today)
    const doneHabitIds = new Set((logs ?? []).filter(l => typeof l.value === 'boolean' ? l.value : Number(l.value) > 0).map(l => l.habitId))
    const focusMinutes = (sessions ?? []).filter(s => s.startedAt.slice(0,10) === today).reduce((sum,s) => sum + (s.durationMinutes ?? (s.endedAt ? Math.max(0,Math.round((new Date(s.endedAt).getTime()-new Date(s.startedAt).getTime())/60000)) : 0)),0)
    return { taskTotal: plannedToday.length, taskDone: plannedToday.filter(t=>t.status==='done').length, habitTotal: habits?.length ?? 0, habitDone: doneHabitIds.size, focusMinutes, completedToday, activeTasks: activeTasks.length }
  }, [tasks, logs, habits, sessions, today])
  const stats = [
    { label: 'Активные задачи', value: metrics.activeTasks, icon: CheckSquare },
    { label: 'Проекты', value: projectsCount ?? 0, icon: FolderKanban },
    { label: 'Цели', value: goalsCount ?? 0, icon: Target },
    { label: 'Ежедневник', value: todayEntry ? 'Заполнен' : 'Пусто', icon: BookOpen, isText: true },
  ]
  const progress = metrics.taskTotal + metrics.habitTotal ? Math.round((metrics.taskDone + metrics.habitDone) / (metrics.taskTotal + metrics.habitTotal) * 100) : 0
  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="animate-in flex flex-wrap items-end justify-between gap-4"><div><div className="mb-1.5 flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_10px_var(--color-accent)]"/><span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-text-dim)]">Обзор</span></div><h1 className="text-[28px] font-semibold tracking-tight">Добро пожаловать в Nexora</h1><p className="mt-1 text-[14px] text-[var(--color-text-muted)]">{formatDate(new Date().toISOString(),{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p></div><Link to="/analytics" className="pressable flex items-center gap-2 rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"><BarChart3 size={16}/>Аналитика</Link></div>
    <div className="stagger grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">{stats.map(stat=><div key={stat.label} className="glass animate-in p-5"><div className="flex items-start justify-between"><div><p className="text-[13px] text-[var(--color-text-muted)]">{stat.label}</p><p className="mt-3 text-2xl font-semibold tabular-nums">{stat.isText?<span className="text-base font-medium">{stat.value}</span>:stat.value}</p></div><div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]"><stat.icon size={17}/></div></div></div>)}</div>
    <div className="grid gap-3.5 lg:grid-cols-3">
      <section className="glass-static space-y-5 p-6 lg:col-span-2"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><TrendingUp size={16} className="text-[var(--color-accent)]"/><h2 className="text-[15px] font-medium">Прогресс дня</h2></div><span className="text-sm font-semibold tabular-nums text-[var(--color-accent)]">{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-[var(--color-accent)] transition-all" style={{width:progress+'%'}}/></div><div className="grid gap-3 sm:grid-cols-3"><div><p className="text-xs text-[var(--color-text-dim)]">Задачи на сегодня</p><p className="mt-1 text-lg font-semibold">{metrics.taskDone} / {metrics.taskTotal}</p></div><div><p className="text-xs text-[var(--color-text-dim)]">Привычки</p><p className="mt-1 text-lg font-semibold">{metrics.habitDone} / {metrics.habitTotal}</p></div><div><p className="text-xs text-[var(--color-text-dim)]">Фокус-время</p><p className="mt-1 text-lg font-semibold">{metrics.focusMinutes} мин</p></div></div><div className="grid gap-2 sm:grid-cols-3"><Link to="/tasks" className="pressable flex items-center gap-2 rounded-xl border border-[var(--color-border)] p-3 text-sm hover:bg-white/[0.04]"><Zap size={15} className="text-[var(--color-accent)]"/>Задачи</Link><Link to="/timer" className="pressable flex items-center gap-2 rounded-xl border border-[var(--color-border)] p-3 text-sm hover:bg-white/[0.04]"><Clock size={15} className="text-[var(--color-accent)]"/>Фокус-сессия</Link><Link to="/calendar" className="pressable flex items-center gap-2 rounded-xl border border-[var(--color-border)] p-3 text-sm hover:bg-white/[0.04]"><CalendarDays size={15} className="text-[var(--color-accent)]"/>Календарь</Link></div></section>
      <section className="glass-static p-6"><div className="mb-4 flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"/><h2 className="text-[15px] font-medium">Быстрый доступ</h2></div><div className="space-y-2"><Link to="/journal" className="pressable flex items-center justify-between rounded-xl border border-[var(--color-border)] p-3 text-sm hover:bg-white/[0.04]">Открыть ежедневник <ArrowUpRight size={14}/></Link><Link to="/habits" className="pressable flex items-center justify-between rounded-xl border border-[var(--color-border)] p-3 text-sm hover:bg-white/[0.04]">Отметить привычки <ArrowUpRight size={14}/></Link><Link to="/goals" className="pressable flex items-center justify-between rounded-xl border border-[var(--color-border)] p-3 text-sm hover:bg-white/[0.04]">Посмотреть цели <ArrowUpRight size={14}/></Link><Link to="/analytics" className="pressable flex items-center justify-between rounded-xl border border-[var(--color-border)] p-3 text-sm hover:bg-white/[0.04]">Моя аналитика <ArrowUpRight size={14}/></Link></div></section>
    </div>
    <div className="glass-static flex items-center gap-4 p-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-accent-soft)]"><div className="h-2.5 w-2.5 rounded-full bg-[var(--color-accent)]"/></div><div className="min-w-0 flex-1"><p className="text-[13.5px] font-medium">Данные под контролем</p><p className="text-[12.5px] text-[var(--color-text-muted)]">Все записи сохраняются локально в этом браузере.</p></div></div>
  </div>
}
