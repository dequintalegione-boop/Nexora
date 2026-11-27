import { createFileRoute } from "@tanstack/react-router"
import { ProjectsPage } from "@/components/nexora/projects-page"

export const Route = createFileRoute("/projects")({
  component: ProjectsPage,
})
