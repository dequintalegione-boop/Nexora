import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import {
  createHabit,
  deleteHabit,
  toggleHabitDone,
} from '@/lib/habits'
import { todayISODate } from '@/lib/journal'
import type { HabitLog } from '@/types'
import { cn } from '@/lib/utils'
import { Plus, Repeat, Trash2, Check, Flame } from 'lucide-react'

export function Habits() {
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const today = todayISODate()

  const habits = useLiveQuery(
    () => db.habits.orderBy('updatedAt').reverse().toArray(),
    []
  )
  const logsToday = useLiveQuery(
    () => db.habitLogs.where('date').equals(today).toArray(),
    [today]
  )
  const allLogs = useLiveQuery(() => db.habitLogs.toArray(), [])

  const logByHabit = useMemo(() => {
    const map = new Map<string, HabitLog>()
    for (const log of logsToday ?? []) {
      map.set(log.habitId, log)
    }
    return map
  }, [logsToday])

  const streaks = useMemo(() => {
    const byHabit = new Map<string, Set<string>>()
    for (const log of allLogs ?? []) {
      const done =
        typeof log.value === 'boolean' ? log.value : Number(log.value) > 0
      if (!done) continue
      if (!byHabit.has(log.habitId)) byHabit.set(log.habitId, new Set())
      byHabit.get(log.habitId)!.add(log.date)
    }
    const result = new Map<string, number>()
    for (const [habitId, dates] of byHabit) {
      let streak = 0
      let cursor = today
      for (let i = 0; i < 365; i++) {
        if (!dates.has(cursor)) {
          if (i === 0) {
            const d = new Date(cursor + 'T12:00:00')
            d.setDate(d.getDate() - 1)
            cursor = d.toISOString().slice(0, 10)
            continue
          }
          break
        }
        streak++
        const d = new Date(cursor + 'T12:00:00')
        d.setDate(d.getDate() - 1)
        cursor = d.toISOString().slice(0, 10)
      }
      result.set(habitId, streak)
    }
    return result
  }, [allLogs, today])

  const active = useMemo(
    () => (habits ?? []).filter((h) => h.active && !h.archived),
    [habits]
  )

  const doneCount = active.filter((h) => {
    const log = logByHabit.get(h.id)
    if (!log) return false
    return typeof log.value === 'boolean' ? log.value : Number(log.value) > 0
  }).length

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const value = title.trim()
    if (!value || submitting) return
    setSubmitting(true)
    try {
      await createHabit({ title: value })
      setTitle('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="animate-in">
        <div className="mb-1.5 flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_10px_var(--color-accent)]" />
          <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-text-dim)]">
            Привычки
          </span>
        </div>
        <h1 className="text-[28px] font-semibold tracking-tight">Привычки</h1>
        <p className="mt-1 text-[14px] text-[var(--color-text-muted)]">
          Отмечай выполнение за сегодня. Серии считаются автоматически.
        </p>
      </div>

      {active.length > 0 && (
        <div className="glass-static animate-in flex items-center justify-between p-4" style={{ animationDelay: '0.04s' }}>
          <span className="text-[13px] text-[var(--color-text-muted)]">Сегодня</span>
          <span className="text-[15px] font-medium tabular-nums text-[var(--color-accent)]">
            {doneCount} / {active.length}
          </span>
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className="glass-static animate-in flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
        style={{ animationDelay: '0.06s' }}
      >
        <div className="flex flex-1 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <Plus size={18} strokeWidth={1.75} />
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Новая привычка…"
            className="w-full bg-transparent text-[15px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-dim)]"
            autoComplete="off"
          />
        </div>
        <button
          type="submit"
          disabled={!title.trim() || submitting}
          className="pressable rounded-xl bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#04120f] disabled:opacity-40"
        >
          Добавить
        </button>
      </form>

      <div className="space-y-2 animate-in" style={{ animationDelay: '0.1s' }}>
        {active.length === 0 && (
          <div className="glass-static flex flex-col items-center gap-3 px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] text-[var(--color-text-dim)]">
              <Repeat size={24} strokeWidth={1.5} />
            </div>
            <p className="text-[15px] font-medium">Привычек пока нет</p>
            <p className="max-w-xs text-[13px] text-[var(--color-text-muted)]">
              Добавь привычку выше и отмечай выполнение каждый день.
            </p>
          </div>
        )}

        {active.map((habit, i) => {
          const log = logByHabit.get(habit.id)
          const done = log
            ? typeof log.value === 'boolean'
              ? log.value
              : Number(log.value) > 0
            : false
          const streak = streaks.get(habit.id) ?? 0

          return (
            <div
              key={habit.id}
              className="glass animate-in group flex items-center gap-3 p-4"
              style={{ animationDelay: `${0.02 * Math.min(i, 8)}s` }}
            >
              <button
                type="button"
                onClick={() => toggleHabitDone(habit, today)}
                className={cn(
                  'pressable flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors',
                  done
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[#04120f]'
                    : 'border-white/20 text-transparent hover:border-[var(--color-accent)]/60'
                )}
                aria-label={done ? 'Снять отметку' : 'Отметить выполненным'}
              >
                <Check size={14} strokeWidth={2.5} />
              </button>

              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'text-[14.5px] font-medium',
                    done && 'text-[var(--color-text-dim)]'
                  )}
                >
                  {habit.title}
                </p>
                {streak > 0 && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-[var(--color-accent)]">
                    <Flame size={12} strokeWidth={1.75} />
                    серия {streak}{' '}
                    {streak === 1 ? 'день' : streak < 5 ? 'дня' : 'дней'}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => deleteHabit(habit.id)}
                className="pressable rounded-lg p-1.5 text-[var(--color-text-dim)] opacity-0 transition-opacity hover:bg-red-500/10 hover:text-[var(--color-danger)] group-hover:opacity-100"
                aria-label="Удалить привычку"
              >
                <Trash2 size={15} strokeWidth={1.75} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
