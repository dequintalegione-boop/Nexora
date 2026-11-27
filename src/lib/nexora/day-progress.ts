import { useMemo } from "react"
import { useNexora } from "./store"
import { isoDate } from "./dates"
import { dayTaskPool, isDoneLog, isScheduled, isTodayTask, logKey, logMap } from "./logic"

export interface DayProgress {
  done: number
  total: number
  progress: number
  /** Открытые задачи «на сегодня» (включая просроченные) */
  todayOpen: number
}

/** Прогресс дня: задачи + привычки. Используется и в сайдбаре, и на главной. */
export function useDayProgress(): DayProgress {
  const tasks = useNexora((s) => s.tasks)
  const habits = useNexora((s) => s.habits)
  const habitLogs = useNexora((s) => s.habitLogs)
  const today = isoDate()

  return useMemo(() => {
    const logs = logMap(habitLogs)
    const pool = dayTaskPool(tasks, today)
    const doneTasks = pool.filter((t) => t.status === "done").length
    const habitsToday = habits.filter((h) => isScheduled(h, today))
    const habitsDone = habitsToday.filter((h) => isDoneLog(h, logs.get(logKey(h.id, today)))).length
    const total = pool.length + habitsToday.length
    const done = doneTasks + habitsDone
    return {
      done,
      total,
      progress: total === 0 ? 0 : Math.round((done / total) * 100),
      todayOpen: tasks.filter((t) => isTodayTask(t, today) && t.status !== "done").length,
    }
  }, [tasks, habits, habitLogs, today])
}
