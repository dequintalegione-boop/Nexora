import { createFileRoute } from "@tanstack/react-router"
import { AnalyticsPage } from "@/components/nexora/analytics-page"

export const Route = createFileRoute("/analytics")({
  component: AnalyticsPage,
})
