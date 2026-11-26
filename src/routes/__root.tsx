import { createRootRoute, Outlet } from "@tanstack/react-router"
import { Shell } from "@/components/nexora/shell"

export const Route = createRootRoute({
  component: () => (
    <Shell>
      <Outlet />
    </Shell>
  ),
})
