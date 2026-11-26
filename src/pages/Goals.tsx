import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import {
  createGoal,
  deleteGoal,
  updateGoal,
  HORIZON_LABELS,
  GOAL_STATUS_LABELS,
  type GoalHorizon,
  type GoalStatus,
} from '@/lib/goals'
import type { Goal } from '@/types'
import { cn } from '@/lib/utils'
import { Plus, Target, Trash2, Filter } from 'lucide-react'

const FILTERS: { id: GoalStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'active', label: 'Активные' },
  { id: 'completed', label: 'Достигнутые' },
  { id: 'abandoned', label: 'Отменённые' },
]

export function Goals() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('active')
  const [title, setTitle] = useState('')
  const [horizon, setHorizon] = useState<GoalHorizon>('monthly')
  const [submitting, setSubmitting] = useState(false)

  const goals = useLiveQuery(
    () => db.goals.orderBy('updatedAt').reverse().toArray(),
    []
  )

  const visible = useMemo(() => {
    const list = (goals ?? []).filter((g) => !g.archived)
    if (filter === 'all') return list
    return list.filter((g) => g.status === filter)
  }, [goals, filter])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const value = title.trim()
    if (!value || submitting) return
    setSubmitting(true)
    try {
      await createGoal({ title: value, horizon })
      setTitle('')
      setHorizon('monthly')
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
            Цели
          </span>
        </div>
        <h1 className="text-[28px] font-semibold tracking-tight">Цели</h1>
        <p className="mt-1 text-[14px] text-[var(--color-text-muted)]">
          Горизонты от дня до долгосрока. Прогресс и статусы сохраняются локально.
        </p>
      </div>

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
            placeholder="Новая цель…"
            className="w-full bg-transparent text-[15px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-dim)]"
            autoComplete="off"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={horizon}
            onChange={(e) => setHorizon(e.target.value as GoalHorizon)}
            className="rounded-xl border border-[var(--color-border)] bg-white/[0.04] px-3 py-2 text-[12px] text-[var(--color-text-muted)] outline-none"
          >
            {(Object.keys(HORIZON_LABELS) as GoalHorizon[]).map((h) => (
              <option key={h} value={h}>
                {HORIZON_LABELS[h]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!title.trim() || submitting}
            className="pressable rounded-xl bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-[#04120f] disabled:opacity-40"
          >
            Добавить
          </button>
        </div>
      </form>

      <div className="animate-in flex flex-wrap items-center gap-1.5" style={{ animationDelay: '0.1s' }}>
        <Filter size={14} className="mr-1 text-[var(--color-text-dim)]" />
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              'pressable rounded-full px-3 py-1.5 text-[12px] font-medium',
              filter === f.id
                ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                : 'text-[var(--color-text-muted)] hover:bg-white/[0.05]'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-2 animate-in" style={{ animationDelay: '0.14s' }}>
        {visible.length === 0 && (
          <div className="glass-static flex flex-col items-center gap-3 px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] text-[var(--color-text-dim)]">
              <Target size={24} strokeWidth={1.5} />
            </div>
            <p className="text-[15px] font-medium">Целей пока нет</p>
            <p className="max-w-xs text-[13px] text-[var(--color-text-muted)]">
              Добавь первую цель — можно выбрать горизонт планирования.
            </p>
          </div>
        )}

        {visible.map((goal, i) => (
          <GoalRow key={goal.id} goal={goal} delay={0.02 * Math.min(i, 8)} />
        ))}
      </div>
    </div>
  )
}

function GoalRow({ goal, delay }: { goal: Goal; delay: number }) {
  const progress = Math.min(100, Math.max(0, goal.progress ?? 0))

  return (
    <div
      className="glass animate-in group flex flex-col gap-3 p-4"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
          <Target size={18} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium leading-snug">{goal.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-dim)]">
            <span>{HORIZON_LABELS[goal.horizon]}</span>
            <span>·</span>
            <span>{GOAL_STATUS_LABELS[goal.status]}</span>
            <span>·</span>
            <span className="tabular-nums">{progress}%</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <select
            value={goal.status}
            onChange={(e) =>
              updateGoal(goal.id, { status: e.target.value as GoalStatus })
            }
            className="rounded-lg border border-[var(--color-border)] bg-white/[0.04] px-2 py-1 text-[11px] text-[var(--color-text-muted)] outline-none"
          >
            {(Object.keys(GOAL_STATUS_LABELS) as GoalStatus[]).map((s) => (
              <option key={s} value={s}>
                {GOAL_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => deleteGoal(goal.id)}
            className="pressable rounded-lg p-1.5 text-[var(--color-text-dim)] hover:bg-red-500/10 hover:text-[var(--color-danger)]"
            aria-label="Удалить цель"
          >
            <Trash2 size={15} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          value={progress}
          onChange={(e) =>
            updateGoal(goal.id, { progress: Number(e.target.value) })
          }
          className="h-1 flex-1 cursor-pointer accent-[var(--color-accent)]"
        />
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="progress-fill h-full rounded-full bg-gradient-to-r from-[var(--color-accent)] to-cyan-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  )
}
