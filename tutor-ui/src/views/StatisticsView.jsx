import { useEffect, useMemo, useState } from 'react'
import {
  Banknote,
  BarChart3,
  CalendarCheck,
  Clock3,
  Goal,
  Lightbulb,
  Calculator,
  TrendingUp,
  UserRoundCheck,
  Users,
  XCircle,
} from 'lucide-react'
import { BigButton, Field, PageTitle } from '../components/ui'
import { getLessonsRange, getSettings, getStudents } from '../services/api'

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const PLAN_DAYS = [1, 2, 3, 4, 5]
const DEFAULT_HOURS = [9, 10, 15, 16, 17, 18]
const localDateKey = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
const money = (value) => `$${Math.round(Number(value || 0)).toLocaleString('es-AR')}`
const paidFor = (lesson) => Number(
  lesson.paidAmount ?? (lesson.paymentStatus === 'paid' ? lesson.amount : 0),
)
const isBillable = (lesson) => (
  lesson.status === 'completed'
  && ['present', 'absent_unexcused'].includes(lesson.attendance)
)
const topEntry = (counts, fallbackKey = '') => (
  [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || [fallbackKey, 0]
)

export default function StatisticsView() {
  const [lessons, setLessons] = useState([])
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [price, setPrice] = useState(0)
  const [target, setTarget] = useState(() => Number(localStorage.getItem('statisticsMonthlyGoal') || 0))
  const [draftTarget, setDraftTarget] = useState(String(target || ''))

  const period = useMemo(() => {
    const today = new Date()
    const from = new Date(today.getFullYear(), today.getMonth() - 11, 1)
    return { from, today }
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        const [lessonList, studentList, settings] = await Promise.all([
          getLessonsRange(localDateKey(period.from), localDateKey(period.today)),
          getStudents(),
          getSettings(),
        ])
        setLessons(lessonList)
        setStudents(studentList)
        setPrice(Number(settings.hourlyPrice))
        setNotice('')
      } catch {
        setNotice('No pude cargar las estadísticas. Probá nuevamente en unos segundos.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [period])

  const data = useMemo(() => {
    const completed = lessons.filter((lesson) => lesson.status === 'completed')
    const billable = completed.filter(isBillable)
    const monthly = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(period.from.getFullYear(), period.from.getMonth() + index, 1)
      const key = monthKey(date)
      const items = completed.filter((lesson) => monthKey(new Date(lesson.date)) === key)
      const billedItems = items.filter(isBillable)
      const attended = items.filter((lesson) => lesson.attendance === 'present').length
      const absences = items.length - attended
      const billed = billedItems.reduce((sum, lesson) => sum + Number(lesson.amount || 0), 0)
      const paid = billedItems.reduce((sum, lesson) => sum + paidFor(lesson), 0)
      return {
        key,
        label: `${MONTHS[date.getMonth()]} ${date.getFullYear()}`,
        shortLabel: MONTHS[date.getMonth()].slice(0, 3),
        students: new Set(items.map((lesson) => lesson.studentId)).size,
        classes: items.length,
        attended,
        absences,
        attendance: items.length ? attended / items.length : 0,
        billed,
        paid,
        due: Math.max(0, billed - paid),
      }
    })
    const hourCounts = new Map()
    const dayCounts = new Map()
    completed.forEach((lesson) => {
      const date = new Date(lesson.date)
      hourCounts.set(date.getHours(), (hourCounts.get(date.getHours()) || 0) + 1)
      dayCounts.set(date.getDay(), (dayCounts.get(date.getDay()) || 0) + 1)
    })
    const [busyHour, busyHourCount] = topEntry(hourCounts)
    const [busyDay, busyDayCount] = topEntry(dayCounts)
    const bestMonth = [...monthly].sort((a, b) => b.students - a.students || b.classes - a.classes)[0]
    const present = completed.filter((lesson) => lesson.attendance === 'present').length
    const excused = completed.filter((lesson) => lesson.attendance === 'absent_excused').length
    const unexcused = completed.filter((lesson) => lesson.attendance === 'absent_unexcused').length
    const billed = billable.reduce((sum, lesson) => sum + Number(lesson.amount || 0), 0)
    const paid = billable.reduce((sum, lesson) => sum + paidFor(lesson), 0)
    return {
      completed,
      monthly,
      current: monthly.at(-1),
      bestMonth,
      hourCounts,
      dayCounts,
      busyHour,
      busyHourCount,
      busyDay,
      busyDayCount,
      present,
      excused,
      unexcused,
      attendance: completed.length ? present / completed.length : 0,
      billed,
      paid,
      due: Math.max(0, billed - paid),
      collectionRate: billed ? paid / billed : 0,
    }
  }, [lessons, period])

  const goal = useMemo(() => {
    const classesPerMonth = price > 0 && target > 0 ? Math.ceil(target / price) : 0
    const classesPerWeek = classesPerMonth ? Math.ceil(classesPerMonth / 4.33) : 0
    const remainingMoney = Math.max(0, target - Number(data.current?.billed || 0))
    const remainingClasses = price > 0 ? Math.ceil(remainingMoney / price) : 0
    const rankedDays = [...PLAN_DAYS].sort((a, b) => (
      (data.dayCounts.get(b) || 0) - (data.dayCounts.get(a) || 0)
    ))
    const counts = new Map(PLAN_DAYS.map((day) => [day, Math.floor(classesPerWeek / PLAN_DAYS.length)]))
    for (let index = 0; index < classesPerWeek % PLAN_DAYS.length; index += 1) {
      const day = rankedDays[index]
      counts.set(day, counts.get(day) + 1)
    }
    const popularHours = [...data.hourCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([hour]) => hour)
    const hours = [...new Set([...popularHours, ...DEFAULT_HOURS])]
    const plan = PLAN_DAYS.map((day) => {
      const count = counts.get(day) || 0
      const selectedHours = Array.from({ length: Math.min(count, hours.length) }, (_, index) => (
        hours[index % hours.length]
      )).sort((a, b) => a - b)
      return { day, count, hours: selectedHours }
    }).filter((item) => item.count > 0)
    return { classesPerMonth, classesPerWeek, remainingMoney, remainingClasses, plan }
  }, [data, price, target])

  const saveGoal = (event) => {
    event.preventDefault()
    const nextTarget = Math.max(0, Number(draftTarget || 0))
    if (price <= 0) {
      setNotice('El precio por hora debe ser mayor a cero.')
      return
    }
    localStorage.setItem('statisticsMonthlyGoal', String(nextTarget))
    setTarget(nextTarget)
    setNotice('')
  }

  if (loading) return <Loading />

  const maxStudents = Math.max(1, ...data.monthly.map((month) => month.students))
  const activeStudents = students.filter((student) => student.isActive).length
  const currentAttendance = data.current?.classes
    ? `${Math.round(data.current.attendance * 100)}%`
    : 'Sin datos'

  return (
    <section>
      <PageTitle eyebrow="Números simples para tomar mejores decisiones">Estadísticas</PageTitle>
      <p className="mt-4 max-w-3xl text-xl leading-relaxed text-slate-300">
        Acá podés ver qué está funcionando y calcular cuántas clases necesitás para llegar a un objetivo mensual.
      </p>
      {notice && <Notice text={notice} />}

      <h2 className="mt-9 text-3xl font-bold text-white">Este mes, de un vistazo</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Metric icon={Users} label="Alumnos activos" value={activeStudents} help="Alumnos que hoy siguen tomando clases." />
        <Metric icon={CalendarCheck} label="Clases dadas" value={data.current?.attended || 0} help="Sólo cuenta las clases a las que asistieron." />
        <Metric icon={XCircle} label="Inasistencias" value={data.current?.absences || 0} help="Incluye faltas con y sin aviso." />
        <Metric icon={UserRoundCheck} label="Asistencia" value={currentAttendance} help="Porcentaje de clases a las que asistieron." />
        <Metric icon={Banknote} label="Facturado" value={money(data.current?.billed)} help={`Cobrado: ${money(data.current?.paid)} · Pendiente: ${money(data.current?.due)}`} />
      </div>

      <div className="mt-9 grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 sm:p-8">
          <h2 className="flex items-center gap-3 text-3xl font-bold text-white"><TrendingUp className="text-emerald-300" /> Lo que mejor funciona</h2>
          <div className="mt-6 space-y-4">
            <Finding label="Mes con más alumnos" value={data.bestMonth?.students ? data.bestMonth.label : 'Todavía sin datos'} detail={data.bestMonth?.students ? `${data.bestMonth.students} alumnos distintos` : 'Se completará con el historial.'} />
            <Finding label="Día con más clases" value={data.busyDayCount ? DAYS[data.busyDay] : 'Todavía sin datos'} detail={data.busyDayCount ? `${data.busyDayCount} clases en el último año` : 'Se completará con el historial.'} />
            <Finding label="Hora más concurrida" value={data.busyHourCount ? `${String(data.busyHour).padStart(2, '0')}:00` : 'Todavía sin datos'} detail={data.busyHourCount ? `${data.busyHourCount} alumnos en ese horario` : 'Se completará con el historial.'} />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-700 bg-slate-900 p-6 sm:p-8">
          <h2 className="flex items-center gap-3 text-3xl font-bold text-white"><Lightbulb className="text-amber-300" /> Datos para cuidar el negocio</h2>
          <div className="mt-6 space-y-4">
            <Finding label="Cobranza del último año" value={`${Math.round(data.collectionRate * 100)}% cobrado`} detail={`${money(data.due)} todavía pendiente`} />
            <Finding label="Faltas con aviso" value={data.excused} detail="No se cobraron." />
            <Finding label="Faltas sin aviso" value={data.unexcused} detail="Estas clases sí se cobran." />
          </div>
        </section>
      </div>

      <section className="mt-9 rounded-3xl border border-slate-700 bg-slate-900 p-6 sm:p-8">
        <h2 className="flex items-center gap-3 text-3xl font-bold text-white"><BarChart3 className="text-indigo-300" /> Alumnos por mes</h2>
        <p className="mt-2 text-lg text-slate-300">Cantidad de alumnos distintos que tuvieron al menos una clase registrada.</p>
        <div className="mt-7 space-y-4">
          {data.monthly.map((month) => (
            <div key={month.key} className="grid items-center gap-2 sm:grid-cols-[9rem_1fr_8rem]">
              <p className="text-lg font-bold capitalize text-white">{month.label}</p>
              <div className="h-5 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(month.students / maxStudents) * 100}%` }} />
              </div>
              <p className="text-lg text-slate-300">{month.students} alumnos · {month.classes} clases</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-9 rounded-3xl border border-emerald-400/40 bg-emerald-500/10 p-6 sm:p-8">
        <h2 className="flex items-center gap-3 text-3xl font-bold text-white"><Goal className="text-emerald-300" /> Objetivo de facturación mensual</h2>
        <p className="mt-3 max-w-3xl text-xl text-slate-200">
          Escribí cuánto querés facturar. El cálculo supone clases de una hora y usa los días y horarios que mejor funcionaron hasta ahora.
        </p>
        <form onSubmit={saveGoal} className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <Field label="Precio actual por hora" value={money(price)} disabled />
          <Field label="Quiero facturar por mes" type="number" min="0" step="1000" value={draftTarget} onChange={(event) => setDraftTarget(event.target.value)} placeholder="Ejemplo: 500000" required />
          <BigButton className="bg-emerald-500 text-emerald-950"><Calculator /> Calcular</BigButton>
        </form>
        <p className="mt-3 text-base text-slate-300">
          El precio por hora se modifica desde Resumen Mensual.
        </p>

        {goal.classesPerMonth > 0 ? (
          <div className="mt-8">
            <div className="grid gap-4 sm:grid-cols-3">
              <GoalNumber value={goal.classesPerMonth} label="clases por mes" />
              <GoalNumber value={goal.classesPerWeek} label="clases por semana" />
              <GoalNumber value={goal.remainingClasses} label="clases que faltan este mes" detail={`Faltan ${money(goal.remainingMoney)} para el objetivo.`} />
            </div>
            <h3 className="mt-8 text-2xl font-bold text-white">Una forma simple de ordenarlas</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {goal.plan.map((item) => (
                <article key={item.day} className="rounded-2xl bg-slate-900 p-5">
                  <h4 className="text-xl font-bold text-white">{DAYS[item.day]}</h4>
                  <p className="mt-2 text-3xl font-bold text-emerald-300">{item.count}</p>
                  <p className="text-lg text-slate-300">{item.count === 1 ? 'clase' : 'clases'}</p>
                  <p className="mt-3 flex items-start gap-2 text-base text-slate-300">
                    <Clock3 className="mt-0.5 shrink-0" size={19} />
                    {item.hours.map((hour) => `${String(hour).padStart(2, '0')}:00`).join(', ')}
                    {item.count > item.hours.length ? ` y ${item.count - item.hours.length} más` : ''}
                  </p>
                </article>
              ))}
            </div>
            <p className="mt-5 text-lg text-slate-300">
              Es una orientación: podés mover las clases según la disponibilidad de los alumnos.
            </p>
          </div>
        ) : (
          <p className="mt-6 rounded-2xl bg-slate-900 p-5 text-xl text-slate-200">
            Cargá el precio y el objetivo para ver cuántas clases necesitás.
          </p>
        )}
      </section>
    </section>
  )
}

function Metric({ icon: Icon, label, value, help }) {
  return (
    <article className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
      <Icon className="text-indigo-300" size={30} />
      <p className="mt-4 text-lg font-bold text-slate-300">{label}</p>
      <p className="mt-1 text-4xl font-bold text-white">{value}</p>
      <p className="mt-3 text-base leading-relaxed text-slate-400">{help}</p>
    </article>
  )
}

function Finding({ label, value, detail }) {
  return (
    <article className="rounded-2xl bg-slate-800 p-5">
      <p className="text-base font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold capitalize text-white">{value}</p>
      <p className="mt-1 text-lg text-slate-300">{detail}</p>
    </article>
  )
}

function GoalNumber({ value, label, detail }) {
  return (
    <article className="rounded-2xl bg-slate-900 p-5 text-center">
      <p className="text-5xl font-bold text-emerald-300">{value}</p>
      <p className="mt-2 text-xl font-bold text-white">{label}</p>
      {detail && <p className="mt-2 text-base text-slate-300">{detail}</p>}
    </article>
  )
}

function Loading() {
  return (
    <section>
      <PageTitle eyebrow="Preparando los números">Estadísticas</PageTitle>
      <p className="mt-6 text-xl text-slate-300">Cargando el historial de clases...</p>
    </section>
  )
}

function Notice({ text }) {
  return <p className="mt-6 rounded-2xl border border-rose-400/40 bg-rose-500/10 p-5 text-lg text-rose-100">{text}</p>
}
