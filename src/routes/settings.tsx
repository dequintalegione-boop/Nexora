import { createFileRoute } from "@tanstack/react-router"
import { SettingsPage } from "@/components/nexora/settings-page"

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
})
