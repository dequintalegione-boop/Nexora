import { useEffect } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Dashboard } from '@/pages/Dashboard'
import { Tasks } from '@/pages/Tasks'
import { Projects } from '@/pages/Projects'
import { Goals } from '@/pages/Goals'
import { Journal } from '@/pages/Journal'
import { Habits } from '@/pages/Habits'
import { Timer } from '@/pages/Timer'
import { Calendar } from '@/pages/Calendar'
import { Analytics } from '@/pages/Analytics'
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
          <Route path="goals" element={<Goals />} />
          <Route path="journal" element={<Journal />} />
          <Route path="habits" element={<Habits />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="timer" element={<Timer />} />
          <Route path="settings" element={<Placeholder />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
