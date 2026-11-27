import { useMemo, useState } from "react"
import { useNexora } from "@/lib/nexora/store"
import { DEFAULT_TASK_TABLE_COLUMNS, TASK_TABLE_COLUMN_LABELS, useUI, type TaskTableColumn } from "@/lib/nexora/ui-store"
import {
  getTaskStatusLabels,
  getTaskPriorityLabels,
  getActiveTaskStatuses,
  getActiveTaskPriorities,
  getStatusSelectOptions,
} from "@/lib/nexora/copy"
import { addDays, isoDate } from "@/lib/nexora/dates"
import type { TaskStatus, Priority } from "@/lib/nexora/types"
import { Button, Card, Input, Select, Badge } from "./ui"
import { getDependencyState, getTaskChildren } from "@/lib/nexora/task-logic"
import { parseQuickTaskInput } from "@/lib/nexora/quick-task"
import { createTaskFilterGroup, matchesTaskFilterGroup, type TaskFilterGroup } from "@/lib/nexora/task-filters"
import { TaskFilterBuilder } from "./task-filter-builder"
import { getKanbanColumns, getKanbanDropPatch, getKanbanTaskColumnIds } from "@/lib/nexora/kanban"
import { buildTaskInputFromTemplate, createTaskTemplateFromTask } from "@/lib/nexora/task-templates"
import type { KanbanGroupBy } from "@/lib/nexora/kanban"

export function TasksPage() {
  const tasks = useNexora((s) => s.tasks)
  const settings = useNexora((s) => s.settings)
  const statusLabels = getTaskStatusLabels(settings)
  const priorityLabels = getTaskPriorityLabels(settings)
  const activeStatuses = getActiveTaskStatuses(settings)
  const activePriorities = getActiveTaskPriorities(settings)
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
  const taskTableColumns = useUI((s) => s.taskTableColumns ?? DEFAULT_TASK_TABLE_COLUMNS)
  const toggleTaskTableColumn = useUI((s) => s.toggleTaskTableColumn)
  const kanbanGroupBy = useUI((s) => s.kanbanGroupBy)
  const setKanbanGroupBy = useUI((s) => s.setKanbanGroupBy)
  const taskTemplates = useUI((s) => s.taskTemplates)
  const saveTaskTemplate = useUI((s) => s.saveTaskTemplate)
  const removeTaskTemplate = useUI((s) => s.removeTaskTemplate)

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
  const [templateName, setTemplateName] = useState("")
  const [templateId, setTemplateId] = useState("")
  const [bulkScheduledDate, setBulkScheduledDate] = useState("")
  const [bulkDueDate, setBulkDueDate] = useState("")
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
  const [advancedFilter, setAdvancedFilter] = useState<TaskFilterGroup>(() => createTaskFilterGroup())

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
      .filter((t) => matchesTaskFilterGroup(t, advancedFilter, tasks))
      .sort((a, b) => {
        const prio = { critical: 0, high: 1, medium: 2, low: 3, none: 4 }
        if (sortBy === "due") return (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31")
        if (sortBy === "created") return b.createdAt.localeCompare(a.createdAt)
        if (sortBy === "title") return a.title.localeCompare(b.title, "ru")
        return (prio[a.priority] ?? 5) - (prio[b.priority] ?? 5)
      })
  }, [tasks, filter, priorityFilter, projectFilter, search, view, quickFilter, today, weekLimit, sortBy, advancedFilter])

  const kanbanColumns = getKanbanColumns(kanbanGroupBy, projects, statusLabels, priorityLabels)
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
    setAdvancedFilter(saved.advancedFilter ?? createTaskFilterGroup())
    setKanbanGroupBy(saved.kanbanGroupBy ?? "status")
    setLayout(saved.layout)
    if (saved.columns?.length) useUI.setState({ taskTableColumns: saved.columns })
    setView("active")
    clearSelection()
  }
  const handleSaveView = () => {
    const name = viewName.trim()
    if (!name) return
    saveTaskView({ name, filter, priorityFilter, projectFilter, sortBy, quickFilter, search, layout, columns: taskTableColumns, advancedFilter, kanbanGroupBy })
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
  const bulkSetScheduledDate = (date: string) => {
    selectedTasks.forEach((task) => updateTask(task.id, { scheduledDate: date || undefined }))
  }
  const bulkSetDueDate = (date: string) => {
    selectedTasks.forEach((task) => updateTask(task.id, { dueDate: date || undefined }))
  }
  const bulkSetProject = (projectId: string) => {
    selectedTasks.forEach((task) => updateTask(task.id, { projectId: projectId || undefined, projectIds: projectId ? [projectId] : [] }))
    clearSelection()
  }
  const handleSaveTemplate = () => {
    const task = selectedTasks[0]
    const name = templateName.trim()
    if (!task || !name) return
    saveTaskTemplate(createTaskTemplateFromTask(task, name))
    setTemplateName("")
  }
  const createFromTemplate = () => {
    const template = taskTemplates.find((item) => item.id === templateId)
    if (!template) return
    const templateInput = buildTaskInputFromTemplate(template)
    const activeProjectIds = new Set(projects.filter((project) => !project.archived).map((project) => project.id))
    templateInput.projectIds = (templateInput.projectIds ?? []).filter((id) => activeProjectIds.has(id))
    if (templateInput.projectId && !activeProjectIds.has(templateInput.projectId)) {
      templateInput.projectId = templateInput.projectIds[0]
    }
    if (!templateInput.projectId && templateInput.projectIds.length > 0) {
      templateInput.projectId = templateInput.projectIds[0]
    }
    const id = addTask(templateInput)
    setTaskId(id)
    setTemplateId("")
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
      startAt: draft.startAt,
      endAt: draft.endAt,
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
            placeholder="Например: Позвонить завтра в 14:30 !высокий #работа @офис"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="min-w-[200px]"
          />
          {view === "active" && <Button onClick={handleAdd}>Добавить</Button>}
        </div>
        {view === "active" && (
          <p className="-mt-3 text-xs text-muted">
            Дата: сегодня, завтра, послезавтра или ГГГГ-ММ-ДД; время: в 14:30 или с 09:00 до 10:30;
            срок: до ГГГГ-ММ-ДД; приоритет: !высокий, !средний, !низкий или !критический;
            метки: #работа; контекст: @офис.
          </p>
        )}
      </div>

      {view === "active" && taskTemplates.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <span className="text-xs text-muted">Шаблоны задач</span>
          <Select value={templateId} onChange={(event) => setTemplateId(event.target.value)} className="min-w-48">
            <option value="">Выберите шаблон...</option>
            {taskTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </Select>
          <Button size="sm" onClick={createFromTemplate} disabled={!templateId}>Создать задачу</Button>
          {taskTemplates.map((template) => <Button key={template.id} size="sm" variant="ghost" title={`Удалить шаблон ${template.name}`} onClick={() => removeTaskTemplate(template.id)}>× {template.name}</Button>)}
        </div>
      )}

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
          {activeStatuses.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </Select>
        <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as any)}>
          <option value="all">Все приоритеты</option>
          {activePriorities.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
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

      {view === "active" && (
        <TaskFilterBuilder
          group={advancedFilter}
          onChange={setAdvancedFilter}
          projects={projects.filter((project) => !project.archived)}
          statusLabels={Object.fromEntries(activeStatuses.map((s) => [s.id, s.label])) as typeof statusLabels}
          priorityLabels={Object.fromEntries(activePriorities.map((p) => [p.id, p.label])) as typeof priorityLabels}
        />
      )}

      {view === "active" && selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-teal-400/20 bg-teal-400/5 p-3">
          <strong className="text-sm">Выбрано: {selectedCount}</strong>
          <Select value="" onChange={(event) => event.target.value && bulkSetStatus(event.target.value as TaskStatus)}>
            <option value="">Изменить статус...</option>
            {activeStatuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
          <Select value="" onChange={(event) => event.target.value && bulkSetPriority(event.target.value as Priority)}>
            <option value="">Изменить приоритет...</option>
            {activePriorities.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </Select>
          <Button size="sm" variant="secondary" onClick={bulkArchive}>В архив</Button>
          <Button size="sm" variant="ghost" onClick={bulkTrash}>В корзину</Button>
          <Select value="" onChange={(event) => event.target.value && bulkSetProject(event.target.value)}>
            <option value="">Назначить проект...</option>
            {projects.filter((project) => !project.archived).map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
          </Select>
          <label className="flex items-center gap-1 text-xs text-muted">План <input type="date" className="field w-36" value={bulkScheduledDate} onChange={(event) => setBulkScheduledDate(event.target.value)} /></label>
          <Button size="sm" variant="secondary" onClick={() => bulkSetScheduledDate(bulkScheduledDate)}>Применить план</Button>
          <Button size="sm" variant="ghost" onClick={() => bulkSetScheduledDate("")}>Очистить план</Button>
          <label className="flex items-center gap-1 text-xs text-muted">Срок <input type="date" className="field w-36" value={bulkDueDate} onChange={(event) => setBulkDueDate(event.target.value)} /></label>
          <Button size="sm" variant="secondary" onClick={() => bulkSetDueDate(bulkDueDate)}>Применить срок</Button>
          <Button size="sm" variant="ghost" onClick={() => bulkSetDueDate("")}>Очистить срок</Button>
          {selectedTasks.length === 1 && (
            <>
              <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Имя шаблона" className="max-w-40" />
              <Button size="sm" variant="secondary" onClick={handleSaveTemplate} disabled={!templateName.trim()}>Сохранить как шаблон</Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={clearSelection}>Снять выделение</Button>
        </div>
      )}

      {view === "active" && layout === "table" && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <span className="text-xs text-muted">Колонки таблицы</span>
          {(Object.keys(TASK_TABLE_COLUMN_LABELS) as TaskTableColumn[]).map((col) => (
            <label key={col} className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={taskTableColumns.includes(col)} onChange={() => toggleTaskTableColumn(col)} />
              {TASK_TABLE_COLUMN_LABELS[col]}
            </label>
          ))}
        </div>
      )}

      {view === "active" && layout === "kanban" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Группировка</span>
          <Select value={kanbanGroupBy} onChange={(e) => setKanbanGroupBy(e.target.value as KanbanGroupBy)}>
            <option value="status">Статусу</option>
            <option value="priority">Приоритету</option>
            <option value="project">Проекту</option>
          </Select>
        </div>
      )}

      {view === "active" && layout === "kanban" ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {kanbanColumns.map((column) => {
            const columnTasks = filtered.filter((task) => getKanbanTaskColumnIds(task, kanbanGroupBy).includes(column.id))
            return (
              <div
                key={column.id}
                className="flex w-72 shrink-0 flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (!draggedTaskId) return
                  const patch = getKanbanDropPatch(draggedTaskId, column.id, kanbanGroupBy, tasks)
                  if (patch.status) setTaskStatus(draggedTaskId, patch.status)
                  if (patch.priority) updateTask(draggedTaskId, { priority: patch.priority })
                  if (patch.projectId !== undefined) updateTask(draggedTaskId, { projectId: patch.projectId, projectIds: patch.projectId ? [patch.projectId] : [] })
                  setDraggedTaskId(null)
                }}
              >
                <div className="flex items-center justify-between">
                  <strong className="text-sm">{column.label}</strong>
                  <span className="text-xs text-muted">{columnTasks.length}</span>
                </div>
                {columnTasks.map((task) => (
                  <Card
                    key={task.id}
                    className="cursor-pointer p-3 space-y-1"
                    draggable
                    onDragStart={() => setDraggedTaskId(task.id)}
                    onClick={() => setTaskId(task.id)}
                  >
                    <div className="font-medium text-sm">{task.title}</div>
                    <div className="flex flex-wrap gap-1">
                      <Badge priority={task.priority}>{priorityLabels[task.priority]}</Badge>
                      {task.dueDate && <span className="text-[10px] text-muted">до {task.dueDate}</span>}
                    </div>
                  </Card>
                ))}
              </div>
            )
          })}
        </div>
      ) : view === "active" && layout === "table" ? (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="border-b border-white/10 bg-white/[0.03] text-left text-xs text-muted">
              <tr>
                <th className="p-2 w-8"></th>
                {taskTableColumns.map((col) => (
                  <th key={col} className="p-2">{TASK_TABLE_COLUMN_LABELS[col]}</th>
                ))}
                <th className="p-2">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((task) => (
                <tr key={task.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="p-2">
                    <input type="checkbox" checked={selectedTaskIds.includes(task.id)} onChange={() => toggleTaskSelection(task.id)} />
                  </td>
                  {taskTableColumns.map((col) => {
                    const cells: Record<TaskTableColumn, React.ReactNode> = {
                      title: <button className="text-left font-medium hover:underline" onClick={() => setTaskId(task.id)}>{task.title}</button>,
                      status: <Select className="w-36" value={task.status} onChange={(event) => setTaskStatus(task.id, event.target.value as TaskStatus)}><>{getStatusSelectOptions(settings, task.status).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</></Select>,
                      priority: <Badge priority={task.priority}>{priorityLabels[task.priority]}</Badge>,
                      due: task.dueDate ?? "—",
                      scheduled: task.scheduledDate ?? "—",
                      project: projects.find((p) => p.id === task.projectId)?.title ?? "—",
                      tags: (task.tags ?? []).join(", ") || "—",
                    }
                    return <td key={col} className="p-2">{cells[col]}</td>
                  })}
                  <td className="p-2">
                    <Button size="sm" variant="ghost" onClick={() => archiveTask(task.id)}>Архив</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 && <p className="text-sm text-muted">Нет задач по текущим фильтрам</p>}
          {filtered.map((task) => (
            <Card key={task.id} className="flex flex-wrap items-center gap-3 p-3 cursor-pointer" onClick={() => setTaskId(task.id)}>
              {view === "active" && (
                <input
                  type="checkbox"
                  checked={selectedTaskIds.includes(task.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleTaskSelection(task.id)}
                />
              )}
              <Select
                value={task.status}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setTaskStatus(task.id, e.target.value as TaskStatus)}
                className="w-36"
              >
                {getStatusSelectOptions(settings, task.status).map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
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
                <Badge priority={task.priority}>{priorityLabels[task.priority]}</Badge>
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
