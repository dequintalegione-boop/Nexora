import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { BarChart3, CheckCircle2, Clock3, Target } from 'lucide-react'

export function Analytics() {
  const tasks = useLiveQuery(() => db.tasks.toArray(), [])
  const habits = useLiveQuery(() => db.habits.toArray(), [])
  const logs = useLiveQuery(() => db.habitLogs.toArray(), [])
  const sessions = useLiveQuery(() => db.timeSessions.toArray(), [])
  const summary = useMemo(() => {
    const taskList = (tasks ?? []).filter(t => !t.archived)
    const completed = taskList.filter(t => t.status === 'done').length
    const activeHabits = (habits ?? []).filter(h => h.active && !h.archived)
    const doneLogs = (logs ?? []).filter(l => typeof l.value === 'boolean' ? l.value : Number(l.value) > 0).length
    const minutes = (sessions ?? []).reduce((sum, s) => sum + (s.durationMinutes ?? (s.endedAt ? Math.max(0, Math.round((new Date(s.endedAt).getTime()-new Date(s.startedAt).getTime())/60000)) : 0)), 0)
    return { total: taskList.length, completed, activeHabits: activeHabits.length, doneLogs, minutes, rate: taskList.length ? Math.round(completed/taskList.length*100) : 0 }
  }, [tasks, habits, logs, sessions])
  const cards = [
    {label:'Выполнено задач',value:summary.completed+' / '+summary.total,icon:CheckCircle2},
    {label:'Выполнение задач',value:summary.rate+'%',icon:BarChart3},
    {label:'Отметки привычек',value:String(summary.doneLogs),icon:Target},
    {label:'Фокус-время',value:Math.floor(summary.minutes/60)+' ч '+summary.minutes%60+' мин',icon:Clock3},
  ]
  return <div className="mx-auto max-w-5xl space-y-6"><div className="animate-in"><div className="mb-1.5 flex items-center gap-2"><BarChart3 size={14} className="text-[var(--color-accent)]"/><span className="text-[11px] uppercase tracking-[0.1em] text-[var(--color-text-dim)]">Обзор результатов</span></div><h1 className="text-[28px] font-semibold">Аналитика</h1><p className="mt-1 text-sm text-[var(--color-text-muted)]">Показатели рассчитаны по данным, сохранённым в приложении.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(c=><div key={c.label} className="glass p-5"><div className="flex items-center justify-between"><p className="text-sm text-[var(--color-text-muted)]">{c.label}</p><c.icon size={18} className="text-[var(--color-accent)]"/></div><p className="mt-4 text-2xl font-semibold tabular-nums">{c.value}</p></div>)}</div>
    <div className="glass-static p-5"><h2 className="mb-4 text-sm font-medium">Сводка</h2><div className="space-y-4"><div><div className="mb-2 flex justify-between text-sm"><span className="text-[var(--color-text-muted)]">Завершённые задачи</span><span>{summary.rate}%</span></div><div className="h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-[var(--color-accent)] transition-all" style={{width:summary.rate+'%'}}/></div></div><div className="flex justify-between text-sm"><span className="text-[var(--color-text-muted)]">Активных привычек</span><span>{summary.activeHabits}</span></div><div className="flex justify-between text-sm"><span className="text-[var(--color-text-muted)]">Всего рабочих сессий</span><span>{sessions?.length ?? 0}</span></div></div></div>
  </div>
}
