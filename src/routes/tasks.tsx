import { createFileRoute } from "@tanstack/react-router"
import { TasksPage } from "@/components/nexora/tasks-page"

export const Route = createFileRoute("/tasks")({
  component: TasksPage,
})
