import { createFileRoute } from "@tanstack/react-router"
import { GoalsPage } from "@/components/nexora/goals-page"

export const Route = createFileRoute("/goals")({
  component: GoalsPage,
})
