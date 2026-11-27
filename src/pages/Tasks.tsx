import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import {
  createTask,
  deleteTask,
  toggleTaskDone,
  updateTask,
  STATUS_LABELS,
  PRIORITY_LABELS,
} from '@/lib/tasks'
import type { Priority, Task, TaskStatus } from '@/types'
import { cn, formatDate } from '@/lib/utils'
import {
  Plus,
  Check,
  Trash2,
  Circle,
  Filter,
  Inbox,
} from 'lucide-react'

const FILTERS: { id: TaskStatus | 'all' | 'active'; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'active', label: 'Активные' },
  { id: 'inbox', label: 'Входящие' },
  { id: 'in_progress', label: 'В процессе' },
  { id: 'planned', label: 'План' },
  { id: 'done', label: 'Готово' },
]

const PRIORITY_DOT: Record<Priority, string> = {
  none: 'bg-white/20',
  low: 'bg-sky-400',
  medium: 'bg-amber-400',
  high: 'bg-orange-500',
  critical: 'bg-red-500',
}

export function Tasks() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('active')
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Priority>('none')
  const [submitting, setSubmitting] = useState(false)

  const tasks = useLiveQuery(
    () => db.tasks.orderBy('updatedAt').reverse().toArray(),
    []
  )

  const visible = useMemo(() => {
    const list = (tasks ?? []).filter((t) => !t.archived)
    if (filter === 'all') return list
    if (filter === 'active') {
      return list.filter((t) =>
        ['inbox', 'planned', 'in_progress', 'waiting'].includes(t.status)
      )
    }
    return list.filter((t) => t.status === filter)
  }, [tasks, filter])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const value = title.trim()
    if (!value || submitting) return
    setSubmitting(true)
    try {
      await createTask({ title: value, priority, status: 'inbox' })
      setTitle('')
      setPriority('none')
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
            Задачи
          </span>
        </div>
        <h1 className="text-[28px] font-semibold tracking-tight">Задачи</h1>
        <p className="mt-1 text-[14px] text-[var(--color-text-muted)]">
          Быстрый захват, статусы и приоритеты. Данные только на этом устройстве.
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
            placeholder="Новая задача…"
            className="w-full bg-transparent text-[15px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-dim)]"
            autoComplete="off"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="rounded-xl border border-[var(--color-border)] bg-white/[0.04] px-3 py-2 text-[12px] text-[var(--color-text-muted)] outline-none"
          >
            {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
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

      <div
        className="animate-in flex flex-wrap items-center gap-1.5"
        style={{ animationDelay: '0.1s' }}
      >
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
          <div className="glass-static animate-in flex flex-col items-center gap-3 px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] text-[var(--color-text-dim)]">
              <Inbox size={24} strokeWidth={1.5} />
            </div>
            <p className="text-[15px] font-medium">Пока пусто</p>
            <p className="max-w-xs text-[13px] text-[var(--color-text-muted)]">
              Добавь первую задачу выше — она сразу сохранится в локальную базу.
            </p>
          </div>
        )}

        {visible.map((task, i) => (
          <TaskRow key={task.id} task={task} delay={0.02 * Math.min(i, 8)} />
        ))}
      </div>
    </div>
  )
}

function TaskRow({ task, delay }: { task: Task; delay: number }) {
  const done = task.status === 'done'

  return (
    <div
      className="glass animate-in group flex items-start gap-3 p-3.5 sm:p-4"
      style={{ animationDelay: `${delay}s` }}
    >
      <button
        type="button"
        onClick={() => toggleTaskDone(task)}
        className={cn(
          'pressable mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors',
          done
            ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[#04120f]'
            : 'border-white/20 text-transparent hover:border-[var(--color-accent)]/60'
        )}
        aria-label={done ? 'Вернуть в активные' : 'Отметить выполненной'}
      >
        {done ? <Check size={14} strokeWidth={2.5} /> : <Circle size={14} />}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-[14.5px] font-medium leading-snug',
            done && 'text-[var(--color-text-dim)] line-through'
          )}
        >
          {task.title}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-dim)]">
          <span className="inline-flex items-center gap-1.5">
            <span className={cn('h-1.5 w-1.5 rounded-full', PRIORITY_DOT[task.priority])} />
            {PRIORITY_LABELS[task.priority]}
          </span>
          <span>·</span>
          <span>{STATUS_LABELS[task.status]}</span>
          {task.dueDate && (
            <>
              <span>·</span>
              <span>до {formatDate(task.dueDate)}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {!done && (
          <select
            value={task.status}
            onChange={(e) =>
              updateTask(task.id, { status: e.target.value as TaskStatus })
            }
            className="rounded-lg border border-[var(--color-border)] bg-white/[0.04] px-2 py-1 text-[11px] text-[var(--color-text-muted)] outline-none"
          >
            {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => deleteTask(task.id)}
          className="pressable rounded-lg p-1.5 text-[var(--color-text-dim)] hover:bg-red-500/10 hover:text-[var(--color-danger)]"
          aria-label="Удалить"
        >
          <Trash2 size={15} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}
