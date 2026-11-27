import { useEffect } from "react"
import { useNexora } from "@/lib/nexora/store"
import { getDueTaskReminders } from "@/lib/nexora/reminders"

/**
 * Browser notifications are delivered while Nexora is open.
 * A closed browser cannot run this local scheduler; reliable closed-app delivery
 * requires a push service and server-side subscription management.
 */
export function ReminderScheduler() {
  const enabled = useNexora((state) => state.settings.notificationsEnabled)

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("Notification" in window)) return

    const checkReminders = () => {
      if (Notification.permission !== "granted") return
      const now = Date.now()
      const due = getDueTaskReminders(useNexora.getState().tasks, now)

      for (const item of due) {
        const currentTask = useNexora.getState().tasks.find((task) => task.id === item.task.id)
        const currentReminder = currentTask?.reminders?.find((reminder) => reminder.id === item.reminder.id)
        if (!currentTask || !currentReminder || currentReminder.lastTriggeredAt) continue

        const triggeredAt = new Date(now).toISOString()
        useNexora.getState().updateTask(currentTask.id, {
          reminders: currentTask.reminders?.map((reminder) =>
            reminder.id === currentReminder.id
              ? { ...reminder, lastTriggeredAt: triggeredAt }
              : reminder
          ),
        })

        try {
          const notification = new Notification(currentTask.title, {
            body: currentTask.description?.trim() || "Время заняться задачей",
            tag: `nexora-reminder-${currentTask.id}-${currentReminder.id}`,
          })
          notification.onclick = () => {
            window.focus()
            notification.close()
          }
        } catch (error) {
          console.error("Не удалось показать напоминание Nexora:", error)
        }
      }
    }

    checkReminders()
    const intervalId = window.setInterval(checkReminders, 15_000)
    const handleVisibility = () => {
      if (document.visibilityState === "visible") checkReminders()
    }
    document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [enabled])

  return null
}
