import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Dashboard } from '@/pages/Dashboard'
import { Tasks } from '@/pages/Tasks'
import { Journal } from '@/pages/Journal'
import { Placeholder } from '@/pages/Placeholder'
import { ensureDefaults } from '@/db'

export default function App() {
  useEffect(() => {
    ensureDefaults().catch(console.error)
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="projects" element={<Placeholder />} />
          <Route path="goals" element={<Placeholder />} />
          <Route path="journal" element={<Journal />} />
          <Route path="calendar" element={<Placeholder />} />
          <Route path="timer" element={<Placeholder />} />
          <Route path="settings" element={<Placeholder />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
