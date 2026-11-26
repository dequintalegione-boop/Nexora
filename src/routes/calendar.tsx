import { createFileRoute } from "@tanstack/react-router"
import { CalendarPage } from "@/components/nexora/calendar-page"

export const Route = createFileRoute("/calendar")({
  component: CalendarPage,
})
