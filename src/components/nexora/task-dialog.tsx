import { useNexora } from "@/lib/nexora/store"
import { useUI } from "@/lib/nexora/ui-store"
import { STATUS_LABEL, PRIORITY_LABEL } from "@/lib/nexora/copy"
import type { TaskStatus, Priority } from "@/lib/nexora/types"
import { Button, Card, Input, Select, Textarea } from "./ui"

export function TaskDialog() {
  const taskId = useUI((s) => s.taskId)
  const setTaskId = useUI((s) => s.setTaskId)
  const tasks = useNexora((s) => s.tasks)
  const updateTask = useNexora((s) => s.updateTask)
  const setTaskStatus = useNexora((s) => s.setTaskStatus)
  const archiveTask = useNexora((s) => s.archiveTask)

  const task = tasks.find((t) => t.id === taskId)
  if (!task) return null

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

        <div>
          <label className="text-xs text-muted">Описание</label>
          <Textarea
            value={task.description || ""}
            onChange={(e) => updateTask(task.id, { description: e.target.value })}
            rows={3}
          />
        </div>

        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={() => { archiveTask(task.id); setTaskId(null) }}>
            В архив
          </Button>
          <Button onClick={() => setTaskId(null)}>Закрыть</Button>
        </div>
      </Card>
    </div>
  )
}
