import { useState } from "react"
import { useNexora } from "@/lib/nexora/store"
import type { Goal, Horizon, GoalStatus } from "@/lib/nexora/types"
import { Button, Card, Input, Select } from "./ui"

const HORIZON_LABEL: Record<Horizon, string> = {
  daily: "День",
  weekly: "Неделя",
  monthly: "Месяц",
  quarterly: "Квартал",
  yearly: "Год",
  long_term: "Долгосрок",
}

export function GoalsPage() {
  const goals = useNexora((s) => s.goals)
  const addGoal = useNexora((s) => s.addGoal)
  const updateGoal = useNexora((s) => s.updateGoal)

  const [title, setTitle] = useState("")
  const [horizon, setHorizon] = useState<Horizon>("monthly")

  const active = goals.filter((g) => !g.archived && g.status === "active")

  const handleAdd = () => {
    if (!title.trim()) return
    addGoal({ title: title.trim(), horizon, status: "active" })
    setTitle("")
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Цели</h1>
        <div className="flex gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Новая цель..."
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Select value={horizon} onChange={(e) => setHorizon(e.target.value as Horizon)}>
            {Object.entries(HORIZON_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
          <Button onClick={handleAdd}>Добавить</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {active.map((goal) => (
          <Card key={goal.id} className="p-4 space-y-2">
            <div className="flex items-start justify-between">
              <div className="font-medium">{goal.title}</div>
              <span className="text-xs text-muted">{HORIZON_LABEL[goal.horizon]}</span>
            </div>
            {goal.description && <p className="text-sm text-muted">{goal.description}</p>}
            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => updateGoal(goal.id, { status: "completed" })}
              >
                Завершить
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => updateGoal(goal.id, { status: "abandoned" })}
              >
                Отказаться
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {active.length === 0 && (
        <Card className="p-8 text-center text-muted">Нет активных целей</Card>
      )}
    </div>
  )
}
