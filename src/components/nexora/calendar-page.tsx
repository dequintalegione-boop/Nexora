import { useMemo } from "react"
import { useNexora } from "@/lib/nexora/store"
import { isoDate, addDays, startOfWeek, format, parseISODate, ru } from "@/lib/nexora/dates"
import { Card } from "./ui"

export function CalendarPage() {
  const tasks = useNexora((s) => s.tasks)
  const settings = useNexora((s) => s.settings)
  const today = isoDate()
  const weekStart = startOfWeek(today, settings.weekStartsOn)
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  return (
    <div className="space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-semibold">Календарь</h1>
      <p className="text-muted text-sm">Неделя с {format(parseISODate(weekStart), "d MMMM", { locale: ru })}</p>

      <div className="grid grid-cols-7 gap-2">
        {days.map((day) => {
          const dayTasks = tasks.filter(
            (t) => !t.archived && (t.scheduledDate === day || t.dueDate === day)
          )
          const isToday = day === today
          return (
            <Card
              key={day}
              className={`p-2 min-h-[120px] ${isToday ? "ring-1 ring-teal-500/50" : ""}`}
            >
              <div className={`text-sm font-medium mb-2 ${isToday ? "text-teal-400" : ""}`}>
                {format(parseISODate(day), "EEE d", { locale: ru })}
              </div>
              <div className="space-y-1">
                {dayTasks.slice(0, 4).map((t) => (
                  <div key={t.id} className="text-xs truncate rounded bg-white/5 px-1.5 py-0.5">
                    {t.title}
                  </div>
                ))}
                {dayTasks.length > 4 && (
                  <div className="text-xs text-muted">+{dayTasks.length - 4}</div>
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
