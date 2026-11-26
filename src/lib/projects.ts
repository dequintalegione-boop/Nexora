import { db } from '@/db'
import { createId, nowISO } from '@/lib/id'
import type { Priority, Project } from '@/types'

export type ProjectStatus = Project['status']

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Активный',
  on_hold: 'На паузе',
  completed: 'Завершён',
  cancelled: 'Отменён',
}

export async function createProject(input: {
  title: string
  description?: string
  status?: ProjectStatus
  priority?: Priority
}): Promise<Project> {
  const now = nowISO()
  const project: Project = {
    id: createId(),
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    status: input.status ?? 'active',
    priority: input.priority ?? 'none',
    createdAt: now,
    updatedAt: now,
  }
  await db.projects.add(project)
  return project
}

export async function updateProject(
  id: string,
  patch: Partial<Omit<Project, 'id' | 'createdAt'>>
): Promise<void> {
  await db.projects.update(id, {
    ...patch,
    updatedAt: nowISO(),
  })
}

export async function deleteProject(id: string): Promise<void> {
  await db.projects.delete(id)
}

export async function countProjectTasks(projectId: string): Promise<number> {
  return db.tasks.where('projectId').equals(projectId).count()
}
