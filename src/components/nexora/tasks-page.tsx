import { useMemo, useState } from "react"
import { useNexora } from "@/lib/nexora/store"
import { useUI } from "@/lib/nexora/ui-store"
import { STATUS_LABEL, PRIORITY_LABEL } from "@/lib/nexora/copy"
import type { TaskStatus, Priority } from "@/lib/nexora/types"
import { Button, Card, Input, Select, Badge } from "./ui"
import { getDependencyState, getTaskChildren } from "@/lib/nexora/task-logic"

export function TasksPage() {
  const tasks = useNexora((s) => s.tasks)
  const projects = useNexora((s) => s.projects)
  const addTask = useNexora((s) => s.addTask)
  const setTaskStatus = useNexora((s) => s.setTaskStatus)
  const updateTask = useNexora((s) => s.updateTask)
  const archiveTask = useNexora((s) => s.archiveTask)
  const restoreTask = useNexora((s) => s.restoreTask)
  const removeTask = useNexora((s) => s.removeTask)
  const permanentlyDeleteTask = useNexora((s) => s.permanentlyDeleteTask)
  const setTaskId = useUI((s) => s.setTaskId)

  const [view, setView] = useState<"active" | "archive" | "trash">("active")
  const [layout, setLayout] = useState<"list" | "kanban">("list")
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | TaskStatus>("all")
  const [priorityFilter, setPriorityFilter] = useState<"all" | Priority>("all")
  const [search, setSearch] = useState("")
  const [title, setTitle] = useState("")

  const filtered = useMemo(() => {
    return tasks
      .filter((t) => {
        if (view === "active") return !t.archived && !t.deletedAt
        if (view === "archive") return Boolean(t.archived) && !t.deletedAt
        return Boolean(t.deletedAt)
      })
      .filter((t) => filter === "all" || t.status === filter)
      .filter((t) => priorityFilter === "all" || t.priority === priorityFilter)
      .filter((t) => !search || t.title.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        const prio = { critical: 0, high: 1, medium: 2, low: 3, none: 4 }
        return (prio[a.priority] ?? 5) - (prio[b.priority] ?? 5)
      })
  }, [tasks, filter, priorityFilter, search, view])

  const handleAdd = () => {
    if (!title.trim()) return
    addTask({ title: title.trim(), status: "inbox", priority: "none" })
    setTitle("")
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Задачи</h1>
          <p className="mt-1 text-xs text-muted">{view === "active" ? "Активные задачи" : view === "archive" ? "Архив задач" : "Корзина"}</p>
        </div>
        <div className="flex gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Новая задача..."
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="min-w-[200px]"
          />
          {view === "active" && <Button onClick={handleAdd}>Добавить</Button>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border border-white/10 p-1">
          <Button size="sm" variant={view === "active" ? "primary" : "ghost"} onClick={() => setView("active")}>Активные</Button>
          <Button size="sm" variant={view === "archive" ? "primary" : "ghost"} onClick={() => setView("archive")}>Архив</Button>
          <Button size="sm" variant={view === "trash" ? "primary" : "ghost"} onClick={() => setView("trash")}>Корзина</Button>
        </div>
        {view === "active" && (
          <div className="flex gap-1 rounded-lg border border-white/10 p-1">
            <Button size="sm" variant={layout === "list" ? "primary" : "ghost"} onClick={() => setLayout("list")}>Список</Button>
            <Button size="sm" variant={layout === "kanban" ? "primary" : "ghost"} onClick={() => setLayout("kanban")}>Канбан</Button>
          </div>
        )}
        <Select value={filter} onChange={(e) => setFilter(e.target.value as any)}>
          <option value="all">Все статусы</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
        <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as any)}>
          <option value="all">Все приоритеты</option>
          {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск..."
          className="max-w-xs"
        />
      </div>

      {view === "active" && layout === "kanban" ? (
        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {Object.entries(STATUS_LABEL).map(([status, label]) => {
            const columnTasks = filtered.filter((task) => task.status === status)
            return (
              <section
                key={status}
                className="min-h-48 rounded-xl border border-white/10 bg-white/[0.025] p-2"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  if (draggedTaskId) setTaskStatus(draggedTaskId, status as TaskStatus)
                  setDraggedTaskId(null)
                }}
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold">{label}</h2>
                  <span className="text-xs text-muted">{columnTasks.length}</span>
                </div>
                <div className="space-y-2">
                  {columnTasks.map((task) => (
                    <Card
                      key={task.id}
                      draggable
                      onDragStart={() => setDraggedTaskId(task.id)}
                      onDragEnd={() => setDraggedTaskId(null)}
                      onClick={() => setTaskId(task.id)}
                      className={`cursor-grab p-3 transition hover:border-teal-400/40 ${draggedTaskId === task.id ? "opacity-40" : ""}`}
                    >
                      <p className="text-sm font-medium">{task.title}</p>
                      {task.dueDate && <p className="mt-1 text-xs text-muted">Срок: {task.dueDate}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <Badge priority={task.priority}>{PRIORITY_LABEL[task.priority]}</Badge>
                        {getDependencyState(task, tasks).isBlocked && <Badge priority="high">Блок</Badge>}
                        {getTaskChildren(tasks, task.id).length > 0 && <span className="text-xs text-muted">Подзадач: {getTaskChildren(tasks, task.id).length}</span>}
                      </div>
                    </Card>
                  ))}
                  {columnTasks.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted">Перетащите задачу сюда</p>}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <Card className="p-8 text-center text-muted">Нет задач по фильтру</Card>
          )}
          {filtered.map((task) => (
            <Card
              key={task.id}
              className="flex items-center gap-3 p-3 cursor-pointer hover:bg-white/5"
              onClick={() => setTaskId(task.id)}
            >
              <Select
                value={task.status}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setTaskStatus(task.id, e.target.value as TaskStatus)}
                className="w-36"
              >
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{task.title}</div>
                {task.dueDate && (
                  <div className="text-xs text-muted">до {task.dueDate}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {getDependencyState(task, tasks).isBlocked && <Badge priority="high">Заблокирована</Badge>}
                {getTaskChildren(tasks, task.id).length > 0 && <span className="text-xs text-muted">↳ {getTaskChildren(tasks, task.id).length}</span>}
                <Badge priority={task.priority}>{PRIORITY_LABEL[task.priority]}</Badge>
              </div>
              {view === "active" && <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  archiveTask(task.id)
                }}
              >
                Архив
              </Button>}
              {view !== "active" && <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  restoreTask(task.id)
                }}
              >
                Восстановить
              </Button>}
              {view === "active" && <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  removeTask(task.id)
                }}
              >
                В корзину
              </Button>}
              {view === "trash" && <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  if (window.confirm("Удалить задачу навсегда? Это действие нельзя отменить.")) permanentlyDeleteTask(task.id)
                }}
              >
                Удалить навсегда
              </Button>}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}