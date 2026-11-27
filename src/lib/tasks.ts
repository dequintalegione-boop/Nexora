import { db } from '@/db'
import { createId, nowISO } from '@/lib/id'
import type { Task, TaskStatus, Priority } from '@/types'

export const STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: 'Входящие',
  planned: 'Запланирована',
  in_progress: 'В процессе',
  waiting: 'Ожидает',
  done: 'Выполнена',
  cancelled: 'Отменена',
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  none: 'Нет',
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  critical: 'Критический',
}

export const PRIORITY_ORDER: Priority[] = ['critical', 'high', 'medium', 'low', 'none']

export async function createTask(input: {
  title: string
  description?: string
  status?: TaskStatus
  priority?: Priority
  dueDate?: string
  projectId?: string
}): Promise<Task> {
  const now = nowISO()
  const task: Task = {
    id: createId(),
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    status: input.status ?? 'inbox',
    priority: input.priority ?? 'none',
    dueDate: input.dueDate,
    projectId: input.projectId,
    createdAt: now,
    updatedAt: now,
  }
  await db.tasks.add(task)
  return task
}

export async function updateTask(
  id: string,
  patch: Partial<Omit<Task, 'id' | 'createdAt'>>
): Promise<void> {
  await db.tasks.update(id, {
    ...patch,
    updatedAt: nowISO(),
  })
}

export async function toggleTaskDone(task: Task): Promise<void> {
  const next: TaskStatus = task.status === 'done' ? 'inbox' : 'done'
  await updateTask(task.id, { status: next })
}

export async function deleteTask(id: string): Promise<void> {
  await db.tasks.delete(id)
}

export async function archiveTask(id: string): Promise<void> {
  await updateTask(id, { archived: true })
}
