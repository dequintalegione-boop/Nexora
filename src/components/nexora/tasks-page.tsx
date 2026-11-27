import { useMemo, useState, type ReactNode } from "react"
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
import { expandTasksForView, getTaskOccurrenceViewRange, type TaskViewItem } from "@/lib/nexora/task-view-occurrences"
import type { TaskStatus, Priority } from "@/lib/nexora/types"
import type { TaskOccurrenceContext } from "@/lib/nexora/ui-store"
import { Button, Card, Input, Select, Badge } from "./ui"
import { QuickTaskInput, buildQuickTaskSuggestions } from "./quick-task-input"
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
  const setTaskOccurrence = useUI((s) => s.setTaskOccurrence)
  const materializeTaskOccurrence = useNexora((s) => s.materializeTaskOccurrence)
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
  const [draggedTask, setDraggedTask] = useState<TaskViewItem | null>(null)
  const [showRecurringInstances, setShowRecurringInstances] = useState(true)
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
  const recurrenceRange = useMemo(
    () => getTaskOccurrenceViewRange(today, quickFilter),
    [today, quickFilter],
  )
  const taskViewItems = useMemo<TaskViewItem[]>(
    () => view === "active" && showRecurringInstances
      ? expandTasksForView(tasks, recurrenceRange)
      : tasks,
    [tasks, view, showRecurringInstances, recurrenceRange],
  )

  const filtered = useMemo(() => {
    return taskViewItems
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
        if (quickFilter === "today") return t.scheduledDate === today || t.dueDate === today || t.startAt?.slice(0, 10) === today
        if (quickFilter === "inbox") return t.status === "inbox"
        if (quickFilter === "overdue") return Boolean(t.dueDate && t.dueDate < today && t.status !== "done")
        if (quickFilter === "week") {
          const date = t.scheduledDate || t.dueDate || t.startAt?.slice(0, 10)
          return Boolean(date && date >= today && date <= weekLimit)
        }
        if (quickFilter === "unblocked") return !getDependencyState(t, tasks).isBlocked
        return true
      })
      .filter((t) => matchesTaskFilterGroup(t, advancedFilter, tasks))
      .sort((a, b) => {
        const prio = { critical: 0, high: 1, medium: 2, low: 3, none: 4 } as Record<string, number>
        if (sortBy === "due") return (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31")
        if (sortBy === "created") return b.createdAt.localeCompare(a.createdAt)
        if (sortBy === "title") return a.title.localeCompare(b.title, "ru")
        return (prio[a.priority] ?? 5) - (prio[b.priority] ?? 5)
      })
  }, [tasks, taskViewItems, filter, priorityFilter, projectFilter, search, view, quickFilter, today, weekLimit, sortBy, advancedFilter])

  const isRecurrenceInstance = (task: TaskViewItem) => Boolean(task.recurrenceParentId && task.occurrenceDate)

  const openTask = (task: TaskViewItem) => {
    if (task.virtualOccurrence && task.recurrenceParentId && task.occurrenceDate) {
      const occurrence: TaskOccurrenceContext = {
        seriesId: task.recurrenceSeriesId ?? task.recurrenceParentId,
        occurrenceDate: task.occurrenceDate,
        task,
      }
      setTaskId(occurrence.seriesId)
      setTaskOccurrence(occurrence)
      return
    }
    setTaskOccurrence(null)
    setTaskId(task.id)
  }

  const kanbanColumns = getKanbanColumns(kanbanGroupBy, projects, statusLabels, priorityLabels)
  const selectedCount = selectedTaskIds.filter((id) => filtered.some((task) => !task.virtualOccurrence && task.id === id)).length
  const toggleTaskSelection = (id: string) => {
    setSelectedTaskIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
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
  const selectedTasks = filtered.filter((task) => !task.virtualOccurrence && selectedTaskIds.includes(task.id))
  const bulkSetStatus = (status: TaskStatus) => { selectedTasks.forEach((task) => setTaskStatus(task.id, status)); clearSelection() }
  const bulkSetPriority = (priority: Priority) => { selectedTasks.forEach((task) => updateTask(task.id, { priority })); clearSelection() }
  const bulkArchive = () => { selectedTasks.forEach((task) => archiveTask(task.id)); clearSelection() }
  const bulkTrash = () => { selectedTasks.forEach((task) => removeTask(task.id)); clearSelection() }
  const bulkSetScheduledDate = (date: string) => { selectedTasks.forEach((task) => updateTask(task.id, { scheduledDate: date || undefined })) }
  const bulkSetDueDate = (date: string) => { selectedTasks.forEach((task) => updateTask(task.id, { dueDate: date || undefined })) }
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
    if (templateInput.projectId && !activeProjectIds.has(templateInput.projectId)) templateInput.projectId = templateInput.projectIds[0]
    if (!templateInput.projectId && templateInput.projectIds.length > 0) templateInput.projectId = templateInput.projectIds[0]
    const id = addTask(templateInput)
    setTaskOccurrence(null)
    setTaskId(id)
    setTemplateId("")
  }

  const quickSuggestions = useMemo(() => {
    const tagSet = new Set<string>()
    const ctxSet = new Set<string>()
    for (const task of tasks) {
      for (const tag of task.tags ?? []) if (tag.trim()) tagSet.add(tag.trim())
      for (const ctx of task.contexts ?? []) if (ctx.trim()) ctxSet.add(ctx.trim())
    }
    return buildQuickTaskSuggestions({
      tags: [...tagSet].sort((a, b) => a.localeCompare(b, "ru")),
      contexts: [...ctxSet].sort((a, b) => a.localeCompare(b, "ru")),
      projects: projects.filter((project) => !project.archived).map((project) => ({ id: project.id, title: project.title })),
      priorities: activePriorities.map((p) => ({ id: p.id, label: p.label })),
      statuses: activeStatuses.map((s) => ({ id: s.id, label: s.label })),
    })
  }, [tasks, projects, activePriorities, activeStatuses])

  const nlpDraft = useMemo(() => {
    if (!title.trim()) return null
    return parseQuickTaskInput(title, today)
  }, [title, today])

  const handleAdd = () => {
    if (!title.trim()) return
    const draft = parseQuickTaskInput(title, today)
    if (!draft.title) return
    const matchedProject = draft.projectTitle
      ? projects.find((p) => !p.archived && p.title.toLocaleLowerCase("ru-RU") === draft.projectTitle!.toLocaleLowerCase("ru-RU"))
      : undefined
    addTask({
      title: draft.title,
      status: draft.status ?? (draft.scheduledDate ? "planned" : "inbox"),
      priority: draft.priority,
      scheduledDate: draft.scheduledDate,
      dueDate: draft.dueDate,
      startAt: draft.startAt,
      endAt: draft.endAt,
      tags: draft.tags,
      contexts: draft.contexts,
      estimatedMinutes: draft.estimatedMinutes,
      projectId: matchedProject?.id,
      projectIds: matchedProject ? [matchedProject.id] : undefined,
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
          <QuickTaskInput
            value={title}
            onChange={setTitle}
            onSubmit={handleAdd}
            placeholder="Например: Позвонить завтра в 14:30 !высокий #работа @офис"
            className="min-w-[200px]"
            suggestions={quickSuggestions}
          />
          {view === "active" && <Button onClick={handleAdd}>Добавить</Button>}
        </div>
        {view === "active" && (
          <p className="-mt-3 text-xs text-muted">
            Дата: сегодня, завтра, в пятницу, 15 декабря, через 3 дня; время: в 14:30 или с 09:00 до 10:30;
            срок: до пятницы / до ГГГГ-ММ-ДД; оценка: 30 минут, 2ч; приоритет: !высокий;
            метки: #работа; контекст: @офис; проект: +Название; статус: *в_работе. Автодополнение: @ # + ! *
          </p>
        )}
        {view === "active" && nlpDraft && nlpDraft.title && (
          <div className="flex flex-wrap gap-1.5 -mt-2">
            {nlpDraft.scheduledDate && <span className="rounded-md bg-teal-400/15 px-2 py-0.5 text-[11px] text-teal-300">план {nlpDraft.scheduledDate}</span>}
            {nlpDraft.dueDate && <span className="rounded-md bg-amber-400/15 px-2 py-0.5 text-[11px] text-amber-300">срок {nlpDraft.dueDate}</span>}
            {nlpDraft.startAt && <span className="rounded-md bg-sky-400/15 px-2 py-0.5 text-[11px] text-sky-300">{nlpDraft.startAt.slice(11, 16)}{nlpDraft.endAt ? `–${nlpDraft.endAt.slice(11, 16)}` : ""}</span>}
            {nlpDraft.estimatedMinutes != null && <span className="rounded-md bg-violet-400/15 px-2 py-0.5 text-[11px] text-violet-300">{nlpDraft.estimatedMinutes} мин</span>}
            {nlpDraft.priority !== "none" && <span className="rounded-md bg-rose-400/15 px-2 py-0.5 text-[11px] text-rose-300">{priorityLabels[nlpDraft.priority] ?? nlpDraft.priority}</span>}
            {nlpDraft.status && <span className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] text-muted">{statusLabels[nlpDraft.status] ?? nlpDraft.status}</span>}
            {nlpDraft.projectTitle && <span className="rounded-md bg-emerald-400/15 px-2 py-0.5 text-[11px] text-emerald-300">+{nlpDraft.projectTitle}</span>}
            {nlpDraft.tags.map((tag) => <span key={`tag-${tag}`} className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] text-muted">#{tag}</span>)}
            {nlpDraft.contexts.map((ctx) => <span key={`ctx-${ctx}`} className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] text-muted">@{ctx}</span>)}
          </div>
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
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1">
              {([["all", "Все"], ["today", "Сегодня"], ["inbox", "Входящие"], ["overdue", "Просрочено"], ["week", "На неделе"], ["unblocked", "Не заблокированы"]] as const).map(([key, label]) => (
                <Button key={key} size="sm" variant={quickFilter === key ? "secondary" : "ghost"} onClick={() => setQuickFilter(key)}>{label}</Button>
              ))}
            </div>
            <label className="flex items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-muted" title={`Виртуальные повторения вычисляются для ${recurrenceRange.start} — ${recurrenceRange.end}`}>
              <input type="checkbox" checked={showRecurringInstances} onChange={(event) => setShowRecurringInstances(event.target.checked)} />
              Повторы
            </label>
          </div>
        )}
        <Select value={filter} onChange={(e) => setFilter(e.target.value as any)}>
          <option value="all">Все статусы</option>
          {activeStatuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
        <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as any)}>
          <option value="all">Все приоритеты</option>
          {activePriorities.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </Select>
        <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="all">Все проекты</option>
          {projects.filter((project) => !project.archived).map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
        </Select>
        <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
          <option value="priority">По приоритету</option>
          <option value="due">По сроку</option>
          <option value="created">Сначала новые</option>
          <option value="title">По названию</option>
        </Select>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск..." className="max-w-xs" />
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
              <Button size="sm" variant="secondary" onClick={handleSaveTemplate} disabled={!templateName.trim()}>Сохранить шаблон</Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={clearSelection}>Снять выделение</Button>
        </div>
      )}

      {view === "active" && layout === "table" && (
        <div className="flex flex-wrap gap-2 text-xs text-muted">
          {DEFAULT_TASK_TABLE_COLUMNS.map((col) => (
            <label key={col} className="flex items-center gap-1">
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
                className="w-72 shrink-0 rounded-xl border border-white/10 bg-white/[0.02] p-3"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (!draggedTask) return
                  if (getKanbanTaskColumnIds(draggedTask, kanbanGroupBy).includes(column.id)) {
                    setDraggedTask(null)
                    return
                  }
                  const patch = getKanbanDropPatch(kanbanGroupBy, column.id)
                  if (!patch) {
                    setDraggedTask(null)
                    return
                  }
                  const targetTaskId = draggedTask.virtualOccurrence
                    ? materializeTaskOccurrence(draggedTask)
                    : draggedTask.id
                  if (targetTaskId) {
                    if (patch.status) setTaskStatus(targetTaskId, patch.status as TaskStatus)
                    else if (Object.keys(patch).length) updateTask(targetTaskId, patch)
                  }
                  setDraggedTask(null)
                }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <strong className="text-sm">{column.label}</strong>
                  <span className="text-xs text-muted">{columnTasks.length}</span>
                </div>
                <div className="space-y-2">
                  {columnTasks.map((task) => (
                    <Card
                      key={task.id}
                      className="cursor-pointer p-3"
                      draggable
                      onDragStart={() => setDraggedTask(task)}
                      onDragEnd={() => setDraggedTask(null)}
                      onClick={() => openTask(task)}
                    >
                      <div className="font-medium">{task.title}</div>
                      {isRecurrenceInstance(task) && <span className="mt-1 block text-[10px] text-teal-300">Повтор · {task.occurrenceDate}</span>}
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge priority={task.priority}>{priorityLabels[task.priority]}</Badge>
                        {task.dueDate && <span className="text-xs text-muted">до {task.dueDate}</span>}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : view === "active" && layout === "table" ? (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-left text-xs text-muted">
              <tr>
                <th className="p-2"> </th>
                {taskTableColumns.map((col) => <th key={col} className="p-2">{TASK_TABLE_COLUMN_LABELS[col]}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((task) => (
                <tr key={task.id} className="border-t border-white/5 hover:bg-white/[0.02]" onClick={() => openTask(task)}>
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    {isRecurrenceInstance(task)
                      ? <span className="text-xs text-teal-300" title={task.virtualOccurrence ? "Виртуальный экземпляр повторения" : "Сохранённый экземпляр повторения"}>↻</span>
                      : <input type="checkbox" checked={selectedTaskIds.includes(task.id)} onChange={() => toggleTaskSelection(task.id)} />}
                  </td>
                  {taskTableColumns.map((col) => {
                    const cell: Record<TaskTableColumn, ReactNode> = {
                      title: (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          {task.title}
                          {isRecurrenceInstance(task) && <span className="text-[10px] text-teal-300">Повтор · {task.occurrenceDate}</span>}
                        </span>
                      ),
                      status: task.virtualOccurrence ? (statusLabels[task.status] ?? task.status) : (
                        <Select className="w-36" value={task.status} onClick={(e) => e.stopPropagation()} onChange={(event) => setTaskStatus(task.id, event.target.value as TaskStatus)}>
                          {getStatusSelectOptions(settings, task.status).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </Select>
                      ),
                      priority: <Badge priority={task.priority}>{priorityLabels[task.priority]}</Badge>,
                      dueDate: task.dueDate || "—",
                      scheduledDate: task.scheduledDate || "—",
                      projects: (task.projectIds?.length ? task.projectIds : task.projectId ? [task.projectId] : [])
                        .map((id) => projects.find((project) => project.id === id)?.title)
                        .filter((name): name is string => Boolean(name))
                        .join(", ") || "—",
                      tags: task.tags?.join(", ") || "—",
                      estimate: task.estimatedMinutes != null ? `${task.estimatedMinutes}м` : "—",
                      actual: task.actualMinutes != null ? `${task.actualMinutes}м` : "—",
                      updatedAt: new Date(task.updatedAt).toLocaleString(),
                    }
                    return <td key={col} className="p-2">{cell[col]}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => (
            <Card key={task.id} className="flex cursor-pointer items-center gap-3 p-3" onClick={() => openTask(task)}>
              {view === "active" && !task.virtualOccurrence && (
                <input type="checkbox" checked={selectedTaskIds.includes(task.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleTaskSelection(task.id)} />
              )}
              {task.virtualOccurrence
                ? <span className="w-36 shrink-0 text-xs text-muted">{statusLabels[task.status] ?? task.status}</span>
                : <Select value={task.status} onClick={(e) => e.stopPropagation()} onChange={(e) => setTaskStatus(task.id, e.target.value as TaskStatus)} className="w-36">
                {getStatusSelectOptions(settings, task.status).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </Select>}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{task.title}</div>
                {isRecurrenceInstance(task) && <div className="text-[10px] text-teal-300">Повтор · {task.occurrenceDate}</div>}
                {task.dueDate && <div className="text-xs text-muted">до {task.dueDate}</div>}
              </div>
              <div className="flex items-center gap-2">
                {getDependencyState(task, tasks).isBlocked && <Badge priority="high">Заблокирована</Badge>}
                {getTaskChildren(tasks, task.id).length > 0 && <span className="text-xs text-muted">↳ {getTaskChildren(tasks, task.id).length}</span>}
                <Badge priority={task.priority}>{priorityLabels[task.priority]}</Badge>
              </div>
              {view === "active" && !task.virtualOccurrence && <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); archiveTask(task.id) }}>Архив</Button>}
              {view !== "active" && <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); restoreTask(task.id) }}>Восстановить</Button>}
              {view === "active" && !task.virtualOccurrence && <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); removeTask(task.id) }}>В корзину</Button>}
              {view === "trash" && <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); if (window.confirm("Удалить задачу навсегда? Это действие нельзя отменить.")) permanentlyDeleteTask(task.id) }}>Удалить навсегда</Button>}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
