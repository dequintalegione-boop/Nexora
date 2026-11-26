import { createFileRoute } from "@tanstack/react-router"
import { TimerPage } from "@/components/nexora/timer-page"

export const Route = createFileRoute("/timer")({
  component: TimerPage,
})
