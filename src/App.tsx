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
import { Settings } from '@/pages/Settings'
import { db, ensureDefaults } from '@/db'

export default function App() {
  useEffect(() => {
    ensureDefaults()
      .then(async () => {
        const settings = await db.settings.get('settings')
        if (settings?.accentColor) {
          document.documentElement.style.setProperty('--color-accent', settings.accentColor)
          document.documentElement.style.setProperty('--color-accent-soft', settings.accentColor + '24')
          document.documentElement.style.setProperty('--color-accent-glow', settings.accentColor + '66')
        }
      })
      .catch(console.error)
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
          <Route path="analytics" element={<Analytics />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="timer" element={<Timer />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
