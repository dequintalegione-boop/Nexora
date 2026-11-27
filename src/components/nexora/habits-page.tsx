import { useMemo, useState } from "react"
import { useNexora } from "@/lib/nexora/store"
import { isoDate } from "@/lib/nexora/dates"
import { isScheduled, isDoneLog, logKey, logMap } from "@/lib/nexora/logic"
import type { Measurement } from "@/lib/nexora/types"
import { Button, Card, Input, Select } from "./ui"

export function HabitsPage() {
  const habits = useNexora((s) => s.habits)
  const habitLogs = useNexora((s) => s.habitLogs)
  const addHabit = useNexora((s) => s.addHabit)
  const setHabitValue = useNexora((s) => s.setHabitValue)
  const skipHabit = useNexora((s) => s.skipHabit)
  const clearHabitLog = useNexora((s) => s.clearHabitLog)

  const today = isoDate()
  const logs = useMemo(() => logMap(habitLogs), [habitLogs])
  const [title, setTitle] = useState("")
  const [measurement, setMeasurement] = useState<Measurement>("boolean")

  const activeHabits = habits.filter((h) => h.active && !h.archived)

  const handleAdd = () => {
    if (!title.trim()) return
    addHabit({
      title: title.trim(),
      measurementType: measurement,
      schedule: { days: [1, 2, 3, 4, 5, 6, 0] },
      active: true,
    })
    setTitle("")
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Привычки</h1>
        <div className="flex gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Новая привычка..."
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Select value={measurement} onChange={(e) => setMeasurement(e.target.value as Measurement)}>
            <option value="boolean">Да/Нет</option>
            <option value="number">Число</option>
            <option value="duration">Время</option>
          </Select>
          <Button onClick={handleAdd}>Добавить</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {activeHabits.map((habit) => {
          const key = logKey(habit.id, today)
          const log = logs.get(key)
          const done = isDoneLog(habit, log)
          const scheduled = isScheduled(habit, today)

          return (
            <Card key={habit.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{habit.title}</div>
                  <div className="text-xs text-muted">
                    {habit.measurementType === "boolean" ? "Отметка" : habit.unit || "значение"}
                  </div>
                </div>
                {scheduled && (
                  <span className={`text-xs px-2 py-0.5 rounded ${done ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10"}`}>
                    {done ? "Сделано" : "Сегодня"}
                  </span>
                )}
              </div>

              {scheduled && (
                <div className="flex gap-2">
                  {habit.measurementType === "boolean" ? (
                    <>
                      <Button
                        size="sm"
                        variant={done ? "primary" : "secondary"}
                        onClick={() => setHabitValue(habit.id, today, true)}
                      >
                        ✓
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => skipHabit(habit.id, today)}
                      >
                        Пропуск
                      </Button>
                      {log && (
                        <Button size="sm" variant="ghost" onClick={() => clearHabitLog(habit.id, today)}>
                          Сброс
                        </Button>
                      )}
                    </>
                  ) : (
                    <Input
                      type="number"
                      placeholder="Значение"
                      className="w-24"
                      defaultValue={typeof log?.value === "number" ? log.value : ""}
                      onBlur={(e) => {
                        const v = Number(e.target.value)
                        if (!Number.isNaN(v)) setHabitValue(habit.id, today, v)
                      }}
                    />
                  )}
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {activeHabits.length === 0 && (
        <Card className="p-8 text-center text-muted">Пока нет привычек. Добавь первую!</Card>
      )}
    </div>
  )
}
