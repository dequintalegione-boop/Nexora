import { useMemo, useState } from "react"
import { useNexora } from "@/lib/nexora/store"
import { useUI } from "@/lib/nexora/ui-store"
import { STATUS_LABEL, PRIORITY_LABEL } from "@/lib/nexora/copy"
import { addDays, isoDate } from "@/lib/nexora/dates"
import type { TaskStatus, Priority } from "@/lib/nexora/types"
import { Button, Card, Input, Select, Badge } from "./ui"
import { getDependencyState, getTaskChildren } from "@/lib/nexora/task-logic"
import { parseQuickTaskInput } from "@/lib/nexora/quick-task"

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
  const savedTaskViews = useUI((s) => s.savedTaskViews)
  const saveTaskView = useUI((s) => s.saveTaskView)
  const removeTaskView = useUI((s) => s.removeTaskView)

  const [view, setView] = useState<"active" | "archive" | "trash">("active")
  const [layout, setLayout] = useState<"list" | "table" | "kanban">("list")
  const [quickFilter, setQuickFilter] = useState<"all" | "today" | "inbox" | "overdue" | "week" | "unblocked">("all")
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | TaskStatus>("all")
  const [priorityFilter, setPriorityFilter] = useState<"all" | Priority>("all")
  const [projectFilter, setProjectFilter] = useState("all")
  const [sortBy, setSortBy] = useState<"priority" | "due" | "created" | "title">("priority")
  const [search, setSearch] = useState("")
  const [title, setTitle] = useState("")
  const [viewName, setViewName] = useState("")
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])

  const today = isoDate()
  const weekLimit = addDays(today, 7)

  const filtered = useMemo(() => {
    return tasks
      .filter((t) => {
        if (view === "active") return !t.archived && !t.deletedAt
        if (view === "archive") return Boolean(t.archived) && !t.deletedAt
        return Boolean(t.deletedAt)
      })
      .filter((t) => filter === "all" || t.status === filter)
      .filter((t) => priorityFilter === "all" || t.priority === priorityFilter)
      .filter((t) => projectFilter === "all" || t.projectId === projectFilter || (t.projectIds ?? []).includes(projectFilter))
      .filter((t) => !search || t.title.toLowerCase().includes(search.toLowerCase()))
      .filter((t) => {
        if (quickFilter === "today") return t.scheduledDate === today || t.dueDate === today
        if (quickFilter === "inbox") return t.status === "inbox"
        if (quickFilter === "overdue") return Boolean(t.dueDate && t.dueDate < today && t.status !== "done")
        if (quickFilter === "week") {
          const date = t.scheduledDate || t.dueDate
          return Boolean(date && date >= today && date <= weekLimit)
        }
        if (quickFilter === "unblocked") return !getDependencyState(t, tasks).isBlocked
        return true
      })
      .sort((a, b) => {
        const prio = { critical: 0, high: 1, medium: 2, low: 3, none: 4 }
        if (sortBy === "due") return (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31")
        if (sortBy === "created") return b.createdAt.localeCompare(a.createdAt)
        if (sortBy === "title") return a.title.localeCompare(b.title, "ru")
        return (prio[a.priority] ?? 5) - (prio[b.priority] ?? 5)
      })
  }, [tasks, filter, priorityFilter, projectFilter, search, view, quickFilter, today, weekLimit, sortBy])

  const selectedCount = selectedTaskIds.filter((id) => filtered.some((task) => task.id === id)).length
  const toggleTaskSelection = (id: string) => {
    setSelectedTaskIds((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id])
  }
  const clearSelection = () => setSelectedTaskIds([])
  const applySavedView = (id: string) => {
    const saved = savedTaskViews.find((item) => item.id === id)
    if (!saved) return
    setFilter(saved.filter)
    setPriorityFilter(saved.priorityFilter)
    setProjectFilter(saved.projectFilter)
    setSortBy(saved.sortBy)
    setQuickFilter(saved.quickFilter)
    setSearch(saved.search)
    setLayout(saved.layout)
    setView("active")
    clearSelection()
  }
  const handleSaveView = () => {
    const name = viewName.trim()
    if (!name) return
    saveTaskView({ name, filter, priorityFilter, projectFilter, sortBy, quickFilter, search, layout })
    setViewName("")
  }
  const selectedTasks = filtered.filter((task) => selectedTaskIds.includes(task.id))
  const bulkSetStatus = (status: TaskStatus) => {
    selectedTasks.forEach((task) => setTaskStatus(task.id, status))
    clearSelection()
  }
  const bulkSetPriority = (priority: Priority) => {
    selectedTasks.forEach((task) => updateTask(task.id, { priority }))
    clearSelection()
  }
  const bulkArchive = () => {
    selectedTasks.forEach((task) => archiveTask(task.id))
    clearSelection()
  }
  const bulkTrash = () => {
    selectedTasks.forEach((task) => removeTask(task.id))
    clearSelection()
  }

  const handleAdd = () => {
    if (!title.trim()) return
    const draft = parseQuickTaskInput(title, today)
    if (!draft.title) return
    addTask({
      title: draft.title,
      status: draft.scheduledDate ? "planned" : "inbox",
      priority: draft.priority,
      scheduledDate: draft.scheduledDate,
      dueDate: draft.dueDate,
      tags: draft.tags,
      contexts: draft.contexts,
    })
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
            placeholder="Например: Позвонить завтра !высокий #работа @офис"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="min-w-[200px]"
          />
          {view === "active" && <Button onClick={handleAdd}>Добавить</Button>}
        </div>
        {view === "active" && (
          <p className="-mt-3 text-xs text-muted">
            Дата: сегодня, завтра, послезавтра или ГГГГ-ММ-ДД; срок: до ГГГГ-ММ-ДД;
            приоритет: !высокий, !средний, !низкий или !критический; метки: #работа; контекст: @офис.
          </p>
        )}
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
            <Button size="sm" variant={layout === "table" ? "primary" : "ghost"} onClick={() => setLayout("table")}>Таблица</Button>
            <Button size="sm" variant={layout === "kanban" ? "primary" : "ghost"} onClick={() => setLayout("kanban")}>Канбан</Button>
          </div>
        )}
        {view === "active" && (
          <div className="flex flex-wrap gap-1">
            {([
              ["all", "Все"],
              ["today", "Сегодня"],
              ["inbox", "Входящие"],
              ["overdue", "Просрочено"],
              ["week", "На неделе"],
              ["unblocked", "Не заблокированы"],
            ] as const).map(([key, label]) => (
              <Button key={key} size="sm" variant={quickFilter === key ? "secondary" : "ghost"} onClick={() => setQuickFilter(key)}>
                {label}
              </Button>
            ))}
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
        <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="all">Все проекты</option>
          {projects.filter((project) => !project.archived).map((project) => (
            <option key={project.id} value={project.id}>{project.title}</option>
          ))}
        </Select>
        <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
          <option value="priority">По приоритету</option>
          <option value="due">По сроку</option>
          <option value="created">Сначала новые</option>
          <option value="title">По названию</option>
        </Select>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск..."
          className="max-w-xs"
        />
      </div>

      {view === "active" && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <span className="text-xs text-muted">Сохранённые представления</span>
          <Select value="" onChange={(event) => applySavedView(event.target.value)} className="min-w-44">
            <option value="">Открыть представление...</option>
            {savedTaskViews.map((saved) => <option key={saved.id} value={saved.id}>{saved.name}</option>)}
          </Select>
          <Input value={viewName} onChange={(event) => setViewName(event.target.value)} placeholder="Название представления" className="max-w-52" />
          <Button size="sm" variant="secondary" onClick={handleSaveView} disabled={!viewName.trim()}>Сохранить текущие фильтры</Button>
          {savedTaskViews.map((saved) => (
            <Button key={saved.id} size="sm" variant="ghost" title={`Удалить представление «${saved.name}»`} onClick={() => removeTaskView(saved.id)}>× {saved.name}</Button>
          ))}
        </div>
      )}

      {view === "active" && selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-teal-400/20 bg-teal-400/5 p-3">
          <strong className="text-sm">Выбрано: {selectedCount}</strong>
          <Select value="" onChange={(event) => event.target.value && bulkSetStatus(event.target.value as TaskStatus)}>
            <option value="">Изменить статус...</option>
            {Object.entries(STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </Select>
          <Select value="" onChange={(event) => event.target.value && bulkSetPriority(event.target.value as Priority)}>
            <option value="">Изменить приоритет...</option>
            {Object.entries(PRIORITY_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </Select>
          <Button size="sm" variant="secondary" onClick={bulkArchive}>В архив</Button>
          <Button size="sm" variant="ghost" onClick={bulkTrash}>В корзину</Button>
          <Button size="sm" variant="ghost" onClick={clearSelection}>Снять выбор</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedTaskIds(filtered.map((task) => task.id))}>Выбрать все отфильтрованные</Button>
        </div>
      )}

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
                      <div className="mb-2 flex items-start gap-2">
                        <input type="checkbox" checked={selectedTaskIds.includes(task.id)} onChange={() => toggleTaskSelection(task.id)} onClick={(event) => event.stopPropagation()} aria-label={`Выбрать задачу ${task.title}`} />
                        <p className="text-sm font-medium">{task.title}</p>
                      </div>
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
      ) : view === "active" && layout === "table" ? (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs text-muted">
              <tr>
                <th className="px-3 py-3 font-medium"><input type="checkbox" aria-label="Выбрать все отфильтрованные задачи" checked={filtered.length > 0 && filtered.every((task) => selectedTaskIds.includes(task.id))} onChange={(event) => setSelectedTaskIds(event.target.checked ? filtered.map((task) => task.id) : [])} /></th>
                <th className="px-3 py-3 font-medium">Задача</th>
                <th className="px-3 py-3 font-medium">Статус</th>
                <th className="px-3 py-3 font-medium">Приоритет</th>
                <th className="px-3 py-3 font-medium">Срок</th>
                <th className="px-3 py-3 font-medium">Проекты</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((task) => {
                const linkedProjects = projects.filter((project) =>
                  (task.projectIds ?? (task.projectId ? [task.projectId] : [])).includes(project.id)
                )
                return (
                  <tr key={task.id} className="cursor-pointer hover:bg-white/5" onClick={() => setTaskId(task.id)}>
                    <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selectedTaskIds.includes(task.id)} onChange={() => toggleTaskSelection(task.id)} aria-label={`Выбрать задачу ${task.title}`} /></td>
                    <td className="px-3 py-3">
                      <div className="font-medium">{task.title}</div>
                      {getDependencyState(task, tasks).isBlocked && <span className="text-xs text-amber-400">Заблокирована</span>}
                    </td>
                    <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                      <Select className="w-36" value={task.status} onChange={(event) => setTaskStatus(task.id, event.target.value as TaskStatus)}>
                        {Object.entries(STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                      </Select>
                    </td>
                    <td className="px-3 py-3"><Badge priority={task.priority}>{PRIORITY_LABEL[task.priority]}</Badge></td>
                    <td className="px-3 py-3 tabular-nums text-muted">{task.dueDate ?? "—"}</td>
                    <td className="px-3 py-3 text-muted">{linkedProjects.map((project) => project.title).join(", ") || "—"}</td>
                  </tr>
                )
              })}
              {filtered.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted">Нет задач по фильтру</td></tr>}
            </tbody>
          </table>
        </Card>
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
              <input type="checkbox" checked={selectedTaskIds.includes(task.id)} onChange={() => toggleTaskSelection(task.id)} onClick={(event) => event.stopPropagation()} aria-label={`Выбрать задачу ${task.title}`} />
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