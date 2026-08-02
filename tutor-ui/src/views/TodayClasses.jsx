import { CheckCircle2, Clock3, UserRound, XCircle } from 'lucide-react'

const classes = [
  { id: 'victoria', student: 'Victoria', time: '10:00 a 12:00' },
  { id: 'martin', student: 'Martín', time: '15:30 a 17:00' },
]

const actions = [
  { label: 'Asistió y Pagó', icon: CheckCircle2, className: 'bg-emerald-500 hover:bg-emerald-400 text-emerald-950' },
  { label: 'Asistió y Debe', icon: Clock3, className: 'bg-orange-400 hover:bg-orange-300 text-orange-950' },
  { label: 'Faltó', icon: XCircle, className: 'bg-rose-500 hover:bg-rose-400 text-white' },
]

export default function TodayClasses() {
  const handleAction = (student, action) => {
    // Conecta aquí completeLesson/cancelLesson al recibir el ID real de la API.
    console.log(`${student}: ${action}`)
  }

  return (
    <section aria-labelledby="today-title">
      <p className="mb-2 text-lg font-medium text-indigo-300">Miércoles, 29 de julio</p>
      <h1 id="today-title" className="text-4xl font-bold tracking-tight text-white sm:text-5xl">Clases de Hoy</h1>
      <div className="mt-8 space-y-5">
        {classes.map(({ id, student, time }) => (
          <article key={id} className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-xl shadow-black/20 sm:p-8">
            <div className="mb-7 flex items-center gap-4">
              <div className="rounded-2xl bg-slate-800 p-3 text-indigo-300"><UserRound aria-hidden="true" size={30} /></div>
              <div>
                <h2 className="text-3xl font-semibold text-white">{student}</h2>
                <p className="mt-1 text-xl text-slate-300">{time}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {actions.map(({ label, icon: Icon, className }) => (
                <button key={label} type="button" onClick={() => handleAction(student, label)} className={`flex min-h-24 items-center justify-center gap-2 rounded-2xl px-4 text-lg font-bold transition-colors ${className}`}>
                  <Icon aria-hidden="true" size={24} />{label}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
