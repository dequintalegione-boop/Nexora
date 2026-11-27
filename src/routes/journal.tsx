import { createFileRoute } from "@tanstack/react-router"
import { JournalPage } from "@/components/nexora/journal-page"

export const Route = createFileRoute("/journal")({
  component: JournalPage,
})
