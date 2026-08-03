import { useEffect, useState } from 'react'
import Layout from './components/Layout'
import LoginScreen from './components/LoginScreen'
import { getAuthStatus, logout } from './services/auth'
import TodayView from './views/TodayView'
import WeeklyView from './views/WeeklyView'
import StudentsView from './views/StudentsView'
import TeachersView from './views/TeachersView'
import MonthlyView from './views/MonthlyView'
import SchoolsView from './views/SchoolsView'
import StatisticsView from './views/StatisticsView'

const views = { today: TodayView, week: WeeklyView, students: StudentsView, schools: SchoolsView, teachers: TeachersView, monthly: MonthlyView, statistics: StatisticsView }

export default function App() {
  const [activeView, setActiveView] = useState('today')
  const [authenticated, setAuthenticated] = useState(null)
  const View = views[activeView]

  useEffect(() => {
    getAuthStatus().then(({ authenticated: value }) => setAuthenticated(value)).catch(() => setAuthenticated(false))
    const requireLogin = () => setAuthenticated(false)
    window.addEventListener('softwaremama:auth-required', requireLogin)
    return () => window.removeEventListener('softwaremama:auth-required', requireLogin)
  }, [])

  if (authenticated === null) return <div className="min-h-screen bg-slate-950" />
  if (!authenticated) return <LoginScreen onLogin={() => setAuthenticated(true)} />

  const handleLogout = async () => {
    await logout().catch(() => {})
    setAuthenticated(false)
  }

  return <Layout activeView={activeView} onChangeView={setActiveView} onLogout={handleLogout}><View /></Layout>
}
