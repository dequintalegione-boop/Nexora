import type { Task } from "./types"

export type TaskTemplate = {
  id: string
  name: string
  title: string
  description?: string
  priority: Task["priority"]
  estimatedMinutes?: number
  projectId?: string
  projectIds?: string[]
  recurrenceRule?: Task["recurrenceRule"]
  tags?: string[]
  contexts?: string[]
  links?: NonNullable<Task["links"]>
}

export type TaskTemplateDraft = Omit<TaskTemplate, "id">

export function createTaskTemplateFromTask(task: Task, name: string): TaskTemplateDraft {
  return {
    name: name.trim(),
    title: task.title,
    description: task.description,
    priority: task.priority,
    estimatedMinutes: task.estimatedMinutes,
    projectId: task.projectId,
    projectIds: [...(task.projectIds ?? (task.projectId ? [task.projectId] : []))],
    recurrenceRule: task.recurrenceRule ? { ...task.recurrenceRule, weekdays: task.recurrenceRule.weekdays ? [...task.recurrenceRule.weekdays] : undefined } : undefined,
    tags: [...(task.tags ?? [])],
    contexts: [...(task.contexts ?? [])],
    links: (task.links ?? []).map((link) => ({ ...link })),
  }
}

export function buildTaskInputFromTemplate(template: TaskTemplate): Partial<Task> & { title: string } {
  return {
    title: template.title,
    description: template.description,
    priority: template.priority,
    estimatedMinutes: template.estimatedMinutes,
    projectId: template.projectId,
    projectIds: [...(template.projectIds ?? (template.projectId ? [template.projectId] : []))],
    recurrenceRule: template.recurrenceRule ? { ...template.recurrenceRule, weekdays: template.recurrenceRule.weekdays ? [...template.recurrenceRule.weekdays] : undefined } : undefined,
    tags: [...(template.tags ?? [])],
    contexts: [...(template.contexts ?? [])],
    links: (template.links ?? []).map((link) => ({ ...link })),
    status: "inbox",
  }
}
