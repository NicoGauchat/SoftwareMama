import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarCheck, ChevronLeft, ChevronRight, Plus, Trash2, Users } from 'lucide-react'
import { BigButton, Field, PageTitle } from '../components/ui'
import ConfirmDialog from '../components/ConfirmDialog'
import FormModal from '../components/FormModal'
import {
  cancelLesson,
  completeLesson,
  createLesson,
  getLessons,
  getStudents,
} from '../services/api'

const HOURS = [
  '08:00', '09:00', '10:00', '11:00', '14:00',
  '15:00', '16:00', '17:00', '18:00', '19:00',
]
const DAYS = [
  'Lunes', 'Martes', 'Miércoles', 'Jueves',
  'Viernes', 'Sábado', 'Domingo',
]
const dateKey = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-')
const addDays = (date, count) => {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + count)
  return copy
}
const firstWeekDay = (date) => addDays(date, -((date.getDay() + 6) % 7))
const finalWeek = (date) => (
  addDays(new Date(date.getFullYear(), date.getMonth() + 1, 0), -6)
)
const currentWeekSegment = (date) => {
  const monday = firstWeekDay(date)
  return monday.getMonth() === date.getMonth()
    ? monday
    : new Date(date.getFullYear(), date.getMonth(), 1)
}
const shortName = (name = 'Alumno') => {
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? `${parts[0]} ${parts.at(-1)[0]}.` : parts[0]
}
const RESULT_OPTIONS = [
  { value: 'present_paid', label: 'Asistió y pagó', attendance: 'present', paymentStatus: 'paid' },
  { value: 'present_pending', label: 'Asistió y debe', attendance: 'present', paymentStatus: 'pending' },
  { value: 'absent_unexcused', label: 'Faltó (se cobra)', attendance: 'absent_unexcused', paymentStatus: 'pending' },
  { value: 'absent_excused', label: 'Faltó y avisó (no se cobra)', attendance: 'absent_excused', paymentStatus: 'pending' },
]
const lessonResultLabel = (lesson) => {
  if (lesson.attendance === 'absent_excused') return 'Faltó y avisó'
  if (lesson.attendance === 'absent_unexcused') return 'Faltó'
  return lesson.paymentStatus === 'paid' ? 'Asistió y pagó' : 'Asistió y debe'
}

export default function WeeklyView() {
  const [start, setStart] = useState(() => currentWeekSegment(new Date()))
  const [lessons, setLessons] = useState([])
  const [students, setStudents] = useState([])
  const [slot, setSlot] = useState(null)
  const [chosen, setChosen] = useState([])
  const [addingStudents, setAddingStudents] = useState(false)
  const [search, setSearch] = useState('')
  const [dialog, setDialog] = useState(null)
  const [notice, setNotice] = useState('')
  const [resultLesson, setResultLesson] = useState(null)
  const [outcome, setOutcome] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const todayRef = useRef(null)
  const addingStudentsRef = useRef(false)

  const days = useMemo(
    () => Array.from(
      { length: 7 },
      (_, index) => addDays(start, index),
    ).filter((day) => day.getMonth() === start.getMonth()),
    [start],
  )
  const load = useCallback(async () => {
    try {
      const [studentList, ...items] = await Promise.all([
        getStudents(),
        ...days.map((day) => getLessons(dateKey(day))),
      ])
      setStudents(studentList)
      setLessons(items.flat())
      setNotice('')
    } catch {
      setNotice('No pude cargar esta semana.')
    }
  }, [days])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const today = dateKey(new Date())
    if (dateKey(start) <= today && today <= dateKey(days.at(-1))) {
      todayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [start, days])

  const previous = () => {
    const value = addDays(start, -7)
    setStart(value.getMonth() === start.getMonth() ? value : finalWeek(value))
  }
  const next = () => {
    const value = addDays(start, 7)
    setStart(
      value.getMonth() === start.getMonth()
        ? value
        : new Date(start.getFullYear(), start.getMonth() + 1, 1),
    )
  }
  const slotLessons = slot
    ? lessons.filter((lesson) => (
      dateKey(new Date(lesson.date)) === dateKey(slot.day)
      && new Date(lesson.date).getHours() === Number(slot.hour.slice(0, 2))
      && lesson.status !== 'cancelled'
    ))
    : []
  const existingIds = new Set(slotLessons.map((lesson) => lesson.studentId))
  const available = students.filter((student) => (
    student.isActive
    && !existingIds.has(student.id)
    && student.name.toLowerCase().includes(search.toLowerCase())
  ))

  const addStudents = async (event) => {
    event.preventDefault()
    if (!chosen.length || addingStudentsRef.current) return
    addingStudentsRef.current = true
    setAddingStudents(true)
    try {
      const [hour, minute] = slot.hour.split(':')
      const date = new Date(slot.day)
      date.setHours(Number(hour), Number(minute), 0, 0)
      const selectedStudents = [...new Set(chosen)]
      await Promise.all(selectedStudents.map((studentId) => createLesson({
        studentId,
        date: date.toISOString(),
        durationMinutes: 60,
      })))
      setSlot(null)
      setChosen([])
      setSearch('')
      await load()
    } catch {
      setNotice(
        'No pude agregar el turno. El alumno puede estar ya cargado en ese horario.',
      )
    } finally {
      addingStudentsRef.current = false
      setAddingStudents(false)
    }
  }
  const removeLesson = async (lesson) => {
    try {
      await cancelLesson(lesson.id)
      setDialog(null)
      load()
    } catch {
      setDialog(null)
      setNotice('No pude eliminar ese alumno del turno.')
    }
  }
  const askRemove = (lesson, day, hour) => {
    const name = shortName(
      students.find((student) => student.id === lesson.studentId)?.name,
    )
    setDialog({
      title: 'Eliminar alumno del turno',
      message: `¿Seguro que querés eliminar a ${name} del ${DAYS[(day.getDay() + 6) % 7]} a las ${hour}?`,
      confirmLabel: 'Sí, eliminar',
      danger: true,
      onConfirm: () => removeLesson(lesson),
    })
  }
  const studentName = (lesson) => (
    students.find((student) => student.id === lesson.studentId)?.name || 'el alumno'
  )
  const openResult = (lesson) => {
    setResultLesson(lesson)
    setOutcome('')
    setPaymentMethod('cash')
  }
  const saveResult = async (lesson, selected) => {
    try {
      await completeLesson(lesson.id, {
        realDurationMinutes: lesson.realDurationMinutes || 60,
        attendance: selected.attendance,
        paymentStatus: selected.paymentStatus,
        paymentMethod: selected.paymentStatus === 'paid' ? paymentMethod : '',
      })
      setResultLesson(null)
      setDialog(null)
      await load()
    } catch {
      setDialog(null)
      setNotice('No pude registrar el resultado de esa clase.')
    }
  }
  const askSaveResult = (event) => {
    event.preventDefault()
    const selected = RESULT_OPTIONS.find((option) => option.value === outcome)
    if (!selected || !resultLesson) return
    setDialog({
      title: 'Registrar resultado atrasado',
      message: `¿Confirmás “${selected.label}” para ${studentName(resultLesson)}?`,
      confirmLabel: 'Sí, registrar',
      onConfirm: () => saveResult(resultLesson, selected),
    })
  }
  const openSlot = (day, hour) => {
    setSlot({ day, hour })
    setChosen([])
    setSearch('')
  }
  const navigation = (
    <div className="mt-7 flex items-center justify-between gap-3">
      <button
        onClick={previous}
        className="flex min-h-16 items-center gap-2 rounded-2xl bg-slate-800 px-5 text-lg font-bold text-white"
      >
        <ChevronLeft /> Semana anterior
      </button>
      <button
        onClick={next}
        className="flex min-h-16 items-center gap-2 rounded-2xl bg-indigo-500 px-5 text-lg font-bold text-white"
      >
        Semana siguiente <ChevronRight />
      </button>
    </div>
  )

  return (
    <section>
      <PageTitle eyebrow="Una semana completa, cómoda de leer">Semana</PageTitle>
      {notice && <Notice text={notice} close={() => setNotice('')} />}
      <div className="mt-5 text-center">
        <h2 className="text-3xl font-bold capitalize text-white">
          {start.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
        </h2>
        <p className="text-xl text-slate-300">
          {start.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}
          {' '}al{' '}
          {days.at(-1).toLocaleDateString('es-AR', {
            day: 'numeric',
            month: 'long',
          })}
        </p>
      </div>
      {navigation}

      {slot && (
        <FormModal
          title={`Agregar al turno · ${slot.hour}`}
          onClose={() => { setSlot(null); setChosen([]); setSearch('') }}
        >
          <form onSubmit={addStudents}>
            <p className="flex items-center gap-2 text-xl text-slate-300">
              <Users /> Podés elegir uno o varios alumnos.
            </p>
            <div className="mt-5">
              <Field
                label="Buscar alumno"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Escribí un nombre"
              />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {available.map((student) => (
                <label
                  key={student.id}
                  className={`flex min-h-16 items-center gap-3 rounded-2xl border p-4 text-lg font-bold ${
                    chosen.includes(student.id)
                      ? 'border-indigo-400 bg-indigo-500/20 text-white'
                      : 'border-slate-700 bg-slate-800 text-slate-200'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={chosen.includes(student.id)}
                    onChange={() => setChosen(
                      chosen.includes(student.id)
                        ? chosen.filter((id) => id !== student.id)
                        : [...chosen, student.id],
                    )}
                  />
                  {student.name}
                </label>
              ))}
              {!available.length && (
                <p className="text-lg text-slate-300">
                  No quedan alumnos disponibles para este horario.
                </p>
              )}
            </div>
            <BigButton
              className="mt-5 w-full bg-emerald-500 text-emerald-950"
              disabled={!chosen.length || addingStudents}
            >
              <Plus /> {addingStudents ? 'Guardando…' : 'Guardar turno'}
            </BigButton>
          </form>
        </FormModal>
      )}

      {resultLesson && (
        <FormModal
          title="Registrar resultado de la clase"
          onClose={() => setResultLesson(null)}
        >
          <form onSubmit={askSaveResult}>
            <p className="text-xl text-slate-300">
              {studentName(resultLesson)} ·{' '}
              {new Date(resultLesson.date).toLocaleDateString('es-AR', {
                day: 'numeric',
                month: 'long',
              })}
            </p>
            <label className="mt-5 block text-lg font-semibold text-slate-200">
              Resultado
              <select
                value={outcome}
                onChange={(event) => setOutcome(event.target.value)}
                className="mt-2 min-h-14 w-full rounded-xl border border-slate-600 bg-slate-800 px-4 text-lg text-white"
                required
              >
                <option value="">Elegí qué pasó</option>
                {RESULT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            {outcome === 'present_paid' && (
              <label className="mt-5 block text-lg font-semibold text-slate-200">
                Medio de pago
                <select
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                  className="mt-2 min-h-14 w-full rounded-xl border border-slate-600 bg-slate-800 px-4 text-lg text-white"
                >
                  <option value="cash">Efectivo</option>
                  <option value="transfer">Transferencia</option>
                </select>
              </label>
            )}
            <BigButton
              className="mt-6 w-full bg-emerald-500 text-emerald-950"
              disabled={!outcome}
            >
              <CalendarCheck /> Registrar resultado
            </BigButton>
          </form>
        </FormModal>
      )}

      <div className="mt-7 space-y-7">
        {days.map((day) => (
          <article
            ref={dateKey(day) === dateKey(new Date()) ? todayRef : null}
            key={dateKey(day)}
            className="rounded-3xl border border-slate-700 bg-slate-900 p-6 sm:p-8"
          >
            <h2 className="text-3xl font-bold text-white">
              {DAYS[(day.getDay() + 6) % 7]} ·{' '}
              {day.toLocaleDateString('es-AR', {
                day: 'numeric',
                month: 'long',
              })}
            </h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {HOURS.map((hour) => {
                const items = lessons.filter((lesson) => (
                  lesson.status !== 'cancelled'
                  && dateKey(new Date(lesson.date)) === dateKey(day)
                  && new Date(lesson.date).getHours() === Number(hour.slice(0, 2))
                ))
                return (
                  <div key={hour} className="min-h-36 rounded-2xl bg-slate-800 p-4">
                    <p className="text-2xl font-bold text-white">{hour}</p>
                    {items.map((lesson) => {
                      const name = shortName(
                        students.find(
                          (student) => student.id === lesson.studentId,
                        )?.name,
                      )
                      return (
                        <div
                          key={lesson.id}
                          className="mt-3 rounded-xl bg-emerald-500/20 p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-lg font-bold text-emerald-100">
                              {name}
                            </p>
                            {lesson.status === 'scheduled' && (
                              <button
                                onClick={() => askRemove(lesson, day, hour)}
                                className="flex min-h-11 items-center gap-1 rounded-lg bg-rose-500/20 px-3 text-base font-bold text-rose-200"
                                aria-label={`Eliminar a ${name}`}
                              >
                                <Trash2 size={18} /> Eliminar
                              </button>
                            )}
                            {lesson.status === 'completed' && (
                              <span className="rounded-lg bg-slate-700 px-2 py-1 text-sm font-bold text-slate-300">
                                {lessonResultLabel(lesson)}
                              </span>
                            )}
                          </div>
                          {lesson.status === 'scheduled' && dateKey(day) <= dateKey(new Date()) && (
                            <button
                              onClick={() => openResult(lesson)}
                              className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 px-3 text-base font-bold text-white"
                            >
                              <CalendarCheck size={18} /> Registrar resultado
                            </button>
                          )}
                        </div>
                      )
                    })}
                    <button
                      onClick={() => openSlot(day, hour)}
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-700 p-3 text-lg font-bold text-indigo-200"
                    >
                      <Plus size={20} /> {items.length ? 'Sumar alumno' : 'Agregar'}
                    </button>
                  </div>
                )
              })}
            </div>
          </article>
        ))}
      </div>
      {navigation}
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </section>
  )
}

function Notice({ text, close }) {
  return (
    <div className="mt-5 rounded-2xl border border-rose-400/40 bg-rose-500/10 p-5 text-lg text-rose-100">
      {text}
      <button onClick={close} className="ml-3 font-bold underline">Cerrar</button>
    </div>
  )
}
