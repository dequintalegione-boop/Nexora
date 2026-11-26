import { useMemo, useState } from "react"
import { useNexora } from "@/lib/nexora/store"
import { useUI } from "@/lib/nexora/ui-store"
import { STATUS_LABEL, PRIORITY_LABEL } from "@/lib/nexora/copy"
import type { TaskStatus, Priority } from "@/lib/nexora/types"
import { Button, Card, Input, Select, Badge } from "./ui"

export function TasksPage() {
  const tasks = useNexora((s) => s.tasks)
  const projects = useNexora((s) => s.projects)
  const addTask = useNexora((s) => s.addTask)
  const setTaskStatus = useNexora((s) => s.setTaskStatus)
  const updateTask = useNexora((s) => s.updateTask)
  const archiveTask = useNexora((s) => s.archiveTask)
  const setTaskId = useUI((s) => s.setTaskId)

  const [filter, setFilter] = useState<"all" | TaskStatus>("all")
  const [priorityFilter, setPriorityFilter] = useState<"all" | Priority>("all")
  const [search, setSearch] = useState("")
  const [title, setTitle] = useState("")

  const filtered = useMemo(() => {
    return tasks
      .filter((t) => !t.archived)
      .filter((t) => filter === "all" || t.status === filter)
      .filter((t) => priorityFilter === "all" || t.priority === priorityFilter)
      .filter((t) => !search || t.title.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        const prio = { critical: 0, high: 1, medium: 2, low: 3, none: 4 }
        return (prio[a.priority] ?? 5) - (prio[b.priority] ?? 5)
      })
  }, [tasks, filter, priorityFilter, search])

  const handleAdd = () => {
    if (!title.trim()) return
    addTask({ title: title.trim(), status: "inbox", priority: "none" })
    setTitle("")
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Задачи</h1>
        <div className="flex gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Новая задача..."
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="min-w-[200px]"
          />
          <Button onClick={handleAdd}>Добавить</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
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
            <Badge priority={task.priority}>{PRIORITY_LABEL[task.priority]}</Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                archiveTask(task.id)
              }}
            >
              Архив
            </Button>
          </Card>
        ))}
      </div>
    </div>
  )
}
