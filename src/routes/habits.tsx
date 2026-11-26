import { createFileRoute } from "@tanstack/react-router"
import { HabitsPage } from "@/components/nexora/habits-page"

export const Route = createFileRoute("/habits")({
  component: HabitsPage,
})
