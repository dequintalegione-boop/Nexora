import { useState } from "react"
import { useNexora } from "@/lib/nexora/store"
import type { ProjectStatus } from "@/lib/nexora/types"
import { Button, Card, Input, Badge } from "./ui"

const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: "Активный",
  on_hold: "На паузе",
  completed: "Завершён",
  cancelled: "Отменён",
}

export function ProjectsPage() {
  const projects = useNexora((s) => s.projects)
  const addProject = useNexora((s) => s.addProject)
  const updateProject = useNexora((s) => s.updateProject)

  const [title, setTitle] = useState("")
  const active = projects.filter((p) => !p.archived && p.status === "active")

  const handleAdd = () => {
    if (!title.trim()) return
    addProject({ title: title.trim(), status: "active", priority: "medium" })
    setTitle("")
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Проекты</h1>
        <div className="flex gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Новый проект..." onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
          <Button onClick={handleAdd}>Добавить</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {active.map((project) => (
          <Card key={project.id} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium">{project.title}</div>
              <Badge priority={project.priority}>{project.priority}</Badge>
            </div>
            {project.description && <p className="text-sm text-muted">{project.description}</p>}
            <div className="flex items-center gap-2 text-xs text-muted">
              <span>{STATUS_LABEL[project.status]}</span>
              {project.progress != null && <span>• {project.progress}%</span>}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => updateProject(project.id, { status: "completed" })}>
                Завершить
              </Button>
              <Button size="sm" variant="ghost" onClick={() => updateProject(project.id, { status: "on_hold" })}>
                Пауза
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {active.length === 0 && <Card className="p-8 text-center text-muted">Нет активных проектов</Card>}
    </div>
  )
}
