import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import {
  createProject,
  deleteProject,
  updateProject,
  PROJECT_STATUS_LABELS,
  type ProjectStatus,
} from '@/lib/projects'
import { PRIORITY_LABELS } from '@/lib/tasks'
import type { Priority, Project } from '@/types'
import { cn } from '@/lib/utils'
import {
  Plus,
  FolderKanban,
  Trash2,
  Filter,
} from 'lucide-react'

const FILTERS: { id: ProjectStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'active', label: 'Активные' },
  { id: 'on_hold', label: 'На паузе' },
  { id: 'completed', label: 'Завершённые' },
]

export function Projects() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('active')
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Priority>('none')
  const [submitting, setSubmitting] = useState(false)

  const projects = useLiveQuery(
    () => db.projects.orderBy('updatedAt').reverse().toArray(),
    []
  )
  const tasks = useLiveQuery(() => db.tasks.toArray(), [])

  const taskCountByProject = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of tasks ?? []) {
      if (!t.projectId || t.archived) continue
      map.set(t.projectId, (map.get(t.projectId) ?? 0) + 1)
    }
    return map
  }, [tasks])

  const visible = useMemo(() => {
    const list = (projects ?? []).filter((p) => !p.archived)
    if (filter === 'all') return list
    return list.filter((p) => p.status === filter)
  }, [projects, filter])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const value = title.trim()
    if (!value || submitting) return
    setSubmitting(true)
    try {
      await createProject({ title: value, priority, status: 'active' })
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
            Проекты
          </span>
        </div>
        <h1 className="text-[28px] font-semibold tracking-tight">Проекты</h1>
        <p className="mt-1 text-[14px] text-[var(--color-text-muted)]">
          Группируй задачи по проектам. Данные хранятся локально.
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
            placeholder="Новый проект…"
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
            Создать
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
              <FolderKanban size={24} strokeWidth={1.5} />
            </div>
            <p className="text-[15px] font-medium">Пока нет проектов</p>
            <p className="max-w-xs text-[13px] text-[var(--color-text-muted)]">
              Создай проект выше — потом можно будет привязывать к нему задачи.
            </p>
          </div>
        )}

        {visible.map((project, i) => (
          <ProjectRow
            key={project.id}
            project={project}
            taskCount={taskCountByProject.get(project.id) ?? 0}
            delay={0.02 * Math.min(i, 8)}
          />
        ))}
      </div>
    </div>
  )
}

function ProjectRow({
  project,
  taskCount,
  delay,
}: {
  project: Project
  taskCount: number
  delay: number
}) {
  return (
    <div
      className="glass animate-in group flex items-start gap-3 p-4"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
        <FolderKanban size={18} strokeWidth={1.75} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium leading-snug">{project.title}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-dim)]">
          <span>{PROJECT_STATUS_LABELS[project.status]}</span>
          <span>·</span>
          <span>{PRIORITY_LABELS[project.priority]}</span>
          <span>·</span>
          <span>
            {taskCount}{' '}
            {taskCount === 1 ? 'задача' : taskCount < 5 ? 'задачи' : 'задач'}
          </span>
        </div>
        {project.description && (
          <p className="mt-2 text-[13px] text-[var(--color-text-muted)] line-clamp-2">
            {project.description}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <select
          value={project.status}
          onChange={(e) =>
            updateProject(project.id, {
              status: e.target.value as ProjectStatus,
            })
          }
          className="rounded-lg border border-[var(--color-border)] bg-white/[0.04] px-2 py-1 text-[11px] text-[var(--color-text-muted)] outline-none"
        >
          {(Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map((s) => (
            <option key={s} value={s}>
              {PROJECT_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => deleteProject(project.id)}
          className="pressable rounded-lg p-1.5 text-[var(--color-text-dim)] hover:bg-red-500/10 hover:text-[var(--color-danger)]"
          aria-label="Удалить проект"
        >
          <Trash2 size={15} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}
