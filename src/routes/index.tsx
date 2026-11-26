import { createFileRoute } from "@tanstack/react-router"
import { Dashboard } from "@/components/nexora/dashboard"

export const Route = createFileRoute("/")({
  component: Dashboard,
})
