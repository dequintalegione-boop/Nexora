import { useNexora } from "@/lib/nexora/store"
import { useUI } from "@/lib/nexora/ui-store"
import { STATUS_LABEL, PRIORITY_LABEL } from "@/lib/nexora/copy"
import type { RecurrenceFrequency } from "@/lib/nexora/types"
import type { TaskStatus, Priority } from "@/lib/nexora/types"
import { Button, Card, Input, Select, Textarea } from "./ui"
import { getDependencyState, getTaskChildren } from "@/lib/nexora/task-logic"

export function TaskDialog() {
  const taskId = useUI((s) => s.taskId)
  const setTaskId = useUI((s) => s.setTaskId)
  const tasks = useNexora((s) => s.tasks)
  const projects = useNexora((s) => s.projects)
  const updateTask = useNexora((s) => s.updateTask)
  const setTaskStatus = useNexora((s) => s.setTaskStatus)
  const archiveTask = useNexora((s) => s.archiveTask)
  const startTimer = useNexora((s) => s.startTimer)
  const setTaskParent = useNexora((s) => s.setTaskParent)
  const addTaskDependency = useNexora((s) => s.addTaskDependency)
  const removeTaskDependency = useNexora((s) => s.removeTaskDependency)

  const task = tasks.find((t) => t.id === taskId)
  if (!task) return null
  const dependencyState = getDependencyState(task, tasks)
  const children = getTaskChildren(tasks, task.id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setTaskId(null)}>
      <Card className="w-full max-w-lg p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <Input
            value={task.title}
            onChange={(e) => updateTask(task.id, { title: e.target.value })}
            className="text-lg font-medium"
          />
          <Button variant="ghost" size="sm" onClick={() => setTaskId(null)}>✕</Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted">Статус</label>
            <Select value={task.status} onChange={(e) => setTaskStatus(task.id, e.target.value as TaskStatus)}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted">Приоритет</label>
            <Select value={task.priority} onChange={(e) => updateTask(task.id, { priority: e.target.value as Priority })}>
              {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted">Запланировано на</label>
            <Input
              type="date"
              value={task.scheduledDate ?? ""}
              onChange={(e) => updateTask(task.id, { scheduledDate: e.target.value || undefined })}
            />
          </div>
          <div>
            <label className="text-xs text-muted">Срок выполнения</label>
            <Input
              type="date"
              value={task.dueDate ?? ""}
              onChange={(e) => updateTask(task.id, { dueDate: e.target.value || undefined })}
            />
          </div>
          <div>
            <label className="text-xs text-muted">Оценка, минут</label>
            <Input
              type="number"
              min={0}
              value={task.estimatedMinutes ?? ""}
              onChange={(e) => updateTask(task.id, { estimatedMinutes: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) })}
            />
            <p className="mt-1 text-xs text-muted">Фактически: {task.actualMinutes ?? 0} мин.</p>
          </div>
          <div>
            <label className="text-xs text-muted">Родительская задача</label>
            <Select
              className="w-full"
              value={task.parentId ?? ""}
              onChange={(e) => setTaskParent(task.id, e.target.value || undefined)}
            >
              <option value="">Нет</option>
              {tasks.filter((item) => item.id !== task.id && !item.deletedAt && !item.archived).map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-white/10 p-3">
          <label className="text-xs text-muted">Проекты</label>
          <div className="grid gap-1 sm:grid-cols-2">
            {projects.filter((project) => !project.archived).map((project) => {
              const selectedIds = task.projectIds ?? (task.projectId ? [task.projectId] : [])
              const selected = selectedIds.includes(project.id)
              return (
                <label key={project.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(e) => {
                      const nextIds = e.target.checked
                        ? [...selectedIds, project.id]
                        : selectedIds.filter((id) => id !== project.id)
                      updateTask(task.id, { projectIds: nextIds, projectId: nextIds[0] })
                    }}
                  />
                  <span className="truncate">{project.title}</span>
                </label>
              )
            })}
            {projects.filter((project) => !project.archived).length === 0 && <p className="text-xs text-muted">Нет активных проектов</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted">Метки (через запятую)</label>
            <Input
              className="w-full"
              value={(task.tags ?? []).join(", ")}
              onChange={(e) => updateTask(task.id, { tags: e.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })}
            />
          </div>
          <div>
            <label className="text-xs text-muted">Контексты (через запятую)</label>
            <Input
              className="w-full"
              value={(task.contexts ?? []).join(", ")}
              onChange={(e) => updateTask(task.id, { contexts: e.target.value.split(",").map((context) => context.trim()).filter(Boolean) })}
            />
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-white/10 p-3">
          <label className="text-xs text-muted">Повторение задачи</label>
          <div className="grid grid-cols-2 gap-2">
            <Select
              className="w-full"
              value={task.recurrenceRule?.frequency ?? task.repeat ?? ""}
              onChange={(e) => {
                const frequency = e.target.value as RecurrenceFrequency | ""
                updateTask(task.id, {
                  repeat: frequency === "daily" || frequency === "weekly" ? frequency : undefined,
                  recurrenceRule: frequency
                    ? { frequency, interval: task.recurrenceRule?.interval ?? 1, until: task.recurrenceRule?.until }
                    : undefined,
                })
              }}
            >
              <option value="">Не повторять</option>
              <option value="daily">Каждый день</option>
              <option value="weekly">Каждую неделю</option>
              <option value="monthly">Каждый месяц</option>
              <option value="yearly">Каждый год</option>
            </Select>
            {task.recurrenceRule && (
              <Input
                type="number"
                min={1}
                max={365}
                aria-label="Интервал повторения"
                value={task.recurrenceRule.interval}
                onChange={(e) => updateTask(task.id, {
                  recurrenceRule: {
                    ...task.recurrenceRule!,
                    interval: Math.max(1, Number(e.target.value) || 1),
                  },
                })}
              />
            )}
          </div>
          {task.recurrenceRule && (
            <div>
              <label className="text-xs text-muted">Повторять до (необязательно)</label>
              <Input
                className="w-full"
                type="date"
                value={task.recurrenceRule.until ?? ""}
                onChange={(e) => updateTask(task.id, {
                  recurrenceRule: { ...task.recurrenceRule!, until: e.target.value || undefined },
                })}
              />
              <p className="mt-1 text-xs text-muted">Следующая задача создаётся автоматически после завершения текущей.</p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs text-muted">Зависит от (сначала нужно выполнить)</label>
          <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-white/10 p-2">
            {tasks.filter((item) => item.id !== task.id && !item.deletedAt && !item.archived).map((item) => (
              <label key={item.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={(task.dependsOn ?? []).includes(item.id)}
                  onChange={(e) => e.target.checked
                    ? addTaskDependency(task.id, item.id)
                    : removeTaskDependency(task.id, item.id)}
                />
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                {item.status === "done" ? <span className="text-xs text-emerald-400">Готово</span> : <span className="text-xs text-muted">Не выполнена</span>}
              </label>
            ))}
            {tasks.filter((item) => item.id !== task.id && !item.deletedAt && !item.archived).length === 0 && (
              <p className="text-xs text-muted">Пока нет других активных задач</p>
            )}
          </div>
          {dependencyState.isBlocked && (
            <p className="text-xs text-amber-400">
              Заблокирована: {dependencyState.blockedBy.length} незавершённых
              {dependencyState.missingDependencyIds.length > 0 && `, ${dependencyState.missingDependencyIds.length} отсутствующих связей`}
            </p>
          )}
        </div>

        <div>
          <label className="text-xs text-muted">Описание</label>
          <Textarea
            value={task.description || ""}
            onChange={(e) => updateTask(task.id, { description: e.target.value })}
            rows={3}
          />
        </div>

        {children.length > 0 && (
          <div className="rounded-lg border border-white/10 p-3">
            <p className="mb-2 text-xs text-muted">Подзадачи</p>
            <div className="space-y-1">
              {children.map((child) => (
                <button key={child.id} type="button" className="block w-full truncate text-left text-sm hover:text-teal-300" onClick={() => setTaskId(child.id)}>
                  {child.status === "done" ? "✓ " : "○ "}{child.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {task.history && task.history.length > 0 && (
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">История изменений ({task.history.length})</summary>
            <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto">
              {[...task.history].reverse().map((entry, index) => (
                <li key={index}>{new Date(entry.at).toLocaleString("ru-RU")} — {entry.change}</li>
              ))}
            </ul>
          </details>
        )}

        <div className="flex flex-wrap justify-between gap-2 pt-2">
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => {
              startTimer({ taskId: task.id, title: task.title, kind: "focus" })
              setTaskId(null)
            }}>
              Начать фокус
            </Button>
            <Button variant="ghost" onClick={() => { archiveTask(task.id); setTaskId(null) }}>
              В архив
            </Button>
          </div>
          <Button onClick={() => setTaskId(null)}>Закрыть</Button>
        </div>
      </Card>
    </div>
  )
}
