import { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Dashboard } from '@/pages/Dashboard'
import { Tasks } from '@/pages/Tasks'
import { Projects } from '@/pages/Projects'
import { Journal } from '@/pages/Journal'
import { Placeholder } from '@/pages/Placeholder'
import { ensureDefaults } from '@/db'

export default function App() {
  useEffect(() => {
    ensureDefaults().catch(console.error)
  }, [])

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="projects" element={<Projects />} />
          <Route path="goals" element={<Placeholder />} />
          <Route path="journal" element={<Journal />} />
          <Route path="calendar" element={<Placeholder />} />
          <Route path="timer" element={<Placeholder />} />
          <Route path="settings" element={<Placeholder />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
