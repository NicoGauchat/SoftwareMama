import { useState } from 'react'
import Layout from './components/Layout'
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
  const View = views[activeView]
  return <Layout activeView={activeView} onChangeView={setActiveView}><View /></Layout>
}
