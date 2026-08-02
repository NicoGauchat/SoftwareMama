import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  ContactRound,
  GraduationCap,
  School,
  UsersRound,
  WalletCards,
} from 'lucide-react'

const tabs = [
  { id: 'today', label: 'Día de Hoy', icon: CalendarDays },
  { id: 'week', label: 'Semana', icon: CalendarRange },
  { id: 'students', label: 'Alumnos', icon: UsersRound },
  { id: 'schools', label: 'Escuelas', icon: School },
  { id: 'teachers', label: 'Maestras', icon: ContactRound },
  { id: 'monthly', label: 'Resumen Mensual', icon: WalletCards },
  { id: 'statistics', label: 'Estadísticas', icon: BarChart3 },
]

export default function Layout({ children, activeView, onChangeView }) {
  return (
    <div className="app-shell min-h-screen bg-slate-950">
      <header className="app-header border-b border-slate-800 bg-slate-950">
        <div className="mx-auto max-w-7xl px-5 py-5 sm:px-8">
          <div className="app-brand flex items-center gap-3">
            <span className="brand-mark rounded-xl bg-indigo-500 p-2.5 text-white"><GraduationCap size={30} /></span>
            <span>
              <span className="block text-2xl font-bold text-white">Mis clases</span>
              <span className="brand-subtitle block text-sm font-semibold text-slate-400">Agenda, alumnos y progreso</span>
            </span>
          </div>
          <nav aria-label="Secciones" className="app-nav mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => onChangeView(id)}
                aria-current={activeView === id ? 'page' : undefined}
                className={`nav-tab min-h-16 rounded-xl px-3 text-base font-bold ${activeView === id ? 'is-active bg-indigo-500 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}
              >
                <Icon className="nav-tab-icon" size={22} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="app-main mx-auto max-w-7xl px-5 py-9 sm:px-8 sm:py-12">{children}</main>
    </div>
  )
}
