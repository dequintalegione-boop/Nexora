import { useMemo, useState } from "react"
import { useNexora } from "@/lib/nexora/store"
import { DEFAULT_TASK_TABLE_COLUMNS, TASK_TABLE_COLUMN_LABELS, useUI, type TaskTableColumn } from "@/lib/nexora/ui-store"
import { getTaskStatusLabels, getTaskPriorityLabels } from "@/lib/nexora/copy"
import { addDays, isoDate } from "@/lib/nexora/dates"
import type { TaskStatus, Priority } from "@/lib/nexora/types"
import { Button, Card, Input, Select, Badge } from "./ui"
import { getDependencyState, getTaskChildren } from "@/lib/nexora/task-logic"
import { parseQuickTaskInput } from "@/lib/nexora/quick-task"

export function TasksPage() {
  const tasks = useNexora((s) => s.tasks)
  const settings = useNexora((s) => s.settings)
  const statusLabels = getTaskStatusLabels(settings)
  const priorityLabels = getTaskPriorityLabels(settings)
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
    if (saved.columns?.length) useUI.setState({ taskTableColumns: saved.columns })
    setView("active")
    clearSelection()
  }
  const handleSaveView = () => {
    const name = viewName.trim()
    if (!name) return
    saveTaskView({ name, filter, priorityFilter, projectFilter, sortBy, quickFilter, search, layout, columns: taskTableColumns })
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
            срок: до ГГГГ-ММ-ДД; приоритет: !высокий, !средний, !низкий или !критический; метки: #работа; контекст: @офис.
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">