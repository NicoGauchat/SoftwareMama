import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Banknote, CalendarCheck, ChevronLeft, ChevronRight, Plus, Trash2, Undo2, Users } from 'lucide-react'
import { BigButton, Field, PageTitle } from '../components/ui'
import ConfirmDialog from '../components/ConfirmDialog'
import FormModal from '../components/FormModal'
import {
  cancelLesson,
  completeLesson,
  createLesson,
  getLessons,
  getStudents,
  prepayLesson,
  resetLessonPayment,
} from '../services/api'

const HOURS = [
  '08:00', '09:00', '10:00', '11:00', '14:00',
  '15:00', '16:00', '17:00', '18:00', '19:00',
]
const EMPTY_LESSONS = []
const DAYS = [
  'Lunes', 'Martes', 'Miércoles', 'Jueves',
  'Viernes', 'Sábado', 'Domingo',
]
const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires'
const dateKey = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-')
const argentinaDateParts = (value) => Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', {
    timeZone: ARGENTINA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value))
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, part.value]),
)
const argentinaDateKey = (value) => {
  const parts = argentinaDateParts(value)
  return `${parts.year}-${parts.month}-${parts.day}`
}
const argentinaHour = (value) => Number(argentinaDateParts(value).hour)
const argentinaDateTime = (day, hour) => (
  new Date(`${dateKey(day)}T${hour}:00-03:00`).toISOString()
)
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
const money = (value) => `$${Number(value || 0).toLocaleString('es-AR')}`
const RESULT_OPTIONS = [
  { value: 'present_prepaid', label: 'Asistió (ya estaba pagada)', attendance: 'present', paymentStatus: 'pending' },
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
  const [advanceLesson, setAdvanceLesson] = useState(null)
  const [advancePaymentMethod, setAdvancePaymentMethod] = useState('cash')
  const [savingAdvance, setSavingAdvance] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const todayRef = useRef(null)
  const addingStudentsRef = useRef(false)
  const loadVersionRef = useRef(0)
  const scrolledWeekRef = useRef('')

  const days = useMemo(
    () => Array.from(
      { length: 7 },
      (_, index) => addDays(start, index),
    ).filter((day) => day.getMonth() === start.getMonth()),
    [start],
  )
  const load = useCallback(async () => {
    const loadVersion = loadVersionRef.current + 1
    loadVersionRef.current = loadVersion
    setIsLoading(true)
    try {
      const [studentList, ...items] = await Promise.all([
        getStudents(),
        ...days.map((day) => getLessons(dateKey(day))),
      ])
      if (loadVersion !== loadVersionRef.current) return
      setStudents(studentList)
      setLessons(items.flat())
      setNotice('')
    } catch (error) {
      if (loadVersion !== loadVersionRef.current) return
      setNotice(error.message || 'No pude cargar esta semana.')
    } finally {
      if (loadVersion === loadVersionRef.current) setIsLoading(false)
    }
  }, [days])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const today = dateKey(new Date())
    const weekKey = `${dateKey(start)}-${dateKey(days.at(-1))}`
    if (isLoading || scrolledWeekRef.current === weekKey || dateKey(start) > today || today > dateKey(days.at(-1))) return undefined

    let frameId
    const timerId = window.setTimeout(() => {
      frameId = window.requestAnimationFrame(() => {
        todayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        scrolledWeekRef.current = weekKey
      })
    }, 220)
    return () => {
      window.clearTimeout(timerId)
      if (frameId) window.cancelAnimationFrame(frameId)
    }
  }, [start, days, isLoading])

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
  const lessonsBySlot = useMemo(() => {
    const grouped = new Map()
    lessons.forEach((lesson) => {
      if (lesson.status === 'cancelled') return
      const key = `${argentinaDateKey(lesson.date)}-${argentinaHour(lesson.date)}`
      grouped.set(key, [...(grouped.get(key) || []), lesson])
    })
    return grouped
  }, [lessons])
  const slotLessons = useMemo(() => {
    if (!slot) return EMPTY_LESSONS
    return lessonsBySlot.get(`${dateKey(slot.day)}-${Number(slot.hour.slice(0, 2))}`) || EMPTY_LESSONS
  }, [slot, lessonsBySlot])
  const available = useMemo(() => {
    const existingIds = new Set(slotLessons.map((lesson) => lesson.studentId))
    const normalizedSearch = search.toLowerCase()
    return students.filter((student) => (
      student.isActive
      && !existingIds.has(student.id)
      && student.name.toLowerCase().includes(normalizedSearch)
    ))
  }, [students, slotLessons, search])
  const studentsById = useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students],
  )
  const visibleResultOptions = Number(resultLesson?.paidAmount || 0) > 0
    ? RESULT_OPTIONS.filter((option) => !['present_paid', 'present_pending'].includes(option.value))
    : RESULT_OPTIONS.filter((option) => option.value !== 'present_prepaid')

  const addStudents = async (event) => {
    event.preventDefault()
    if (!chosen.length || addingStudentsRef.current) return
    addingStudentsRef.current = true
    setAddingStudents(true)
    try {
      const selectedStudents = [...new Set(chosen)]
      const results = await Promise.allSettled(selectedStudents.map((studentId) => createLesson({
        studentId,
        date: argentinaDateTime(slot.day, slot.hour),
        durationMinutes: 60,
      })))
      const failures = results.filter((result) => result.status === 'rejected')
      if (failures.length === selectedStudents.length) {
        throw failures[0].reason
      }
      setSlot(null)
      setChosen([])
      setSearch('')
      await load()
      if (failures.length) {
        const firstError = failures[0].reason
        setNotice(`${failures.length} turno${failures.length === 1 ? '' : 's'} no se pudo${failures.length === 1 ? '' : 'ieron'} guardar. ${firstError?.message || ''}`.trim())
      }
    } catch (error) {
      setNotice(error.message || 'No pude agregar el turno.')
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
    } catch (error) {
      setDialog(null)
      setNotice(error.message || 'No pude eliminar ese alumno del turno.')
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
  const openAdvancePayment = (lesson) => {
    setAdvanceLesson(lesson)
    setAdvancePaymentMethod('cash')
  }
  const saveAdvancePayment = async (event) => {
    event.preventDefault()
    if (!advanceLesson || savingAdvance) return
    setSavingAdvance(true)
    try {
      await prepayLesson(advanceLesson.id, advancePaymentMethod)
      setAdvanceLesson(null)
      await load()
    } catch (error) {
      setNotice(error.message || 'No pude registrar el pago adelantado.')
    } finally {
      setSavingAdvance(false)
    }
  }
  const resetAdvancePayment = async (lesson) => {
    try {
      await resetLessonPayment(lesson.id)
      setDialog(null)
      await load()
    } catch (error) {
      setDialog(null)
      setNotice(error.message || 'No pude anular el pago adelantado.')
    }
  }
  const askResetAdvancePayment = (lesson) => setDialog({
    title: 'Anular pago adelantado',
    message: `¿Confirmás que querés anular el pago adelantado de ${studentName(lesson)}?`,
    confirmLabel: 'Sí, anular pago',
    danger: true,
    onConfirm: () => resetAdvancePayment(lesson),
  })
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
    } catch (error) {
      setDialog(null)
      setNotice(error.message || 'No pude registrar el resultado de esa clase.')
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
                    onChange={() => setChosen((current) => (
                      current.includes(student.id)
                        ? current.filter((id) => id !== student.id)
                        : [...current, student.id]
                    ))}
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
              {new Date(resultLesson.date).toLocaleDateString('es-AR', { timeZone: ARGENTINA_TIME_ZONE,
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
                {visibleResultOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            {outcome === 'present_paid' && (
              <label className="mt-5 block text-lg font-semibold text-slate-200">
                Medio de pago
                <PaymentMethodButtons value={paymentMethod} onChange={setPaymentMethod} />
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

      {advanceLesson && (
        <FormModal
          title="Cobrar por adelantado"
          onClose={() => setAdvanceLesson(null)}
        >
          <form onSubmit={saveAdvancePayment}>
            <p className="text-xl text-slate-300">
              {studentName(advanceLesson)} ·{' '}
              {new Date(advanceLesson.date).toLocaleDateString('es-AR', { timeZone: ARGENTINA_TIME_ZONE,
                day: 'numeric',
                month: 'long',
              })}
            </p>
            <p className="mt-3 text-3xl font-bold text-emerald-300">
              {money(Number(advanceLesson.hourlyRate) * Number(advanceLesson.realDurationMinutes || 60) / 60)}
            </p>
            <label className="mt-5 block text-lg font-semibold text-slate-200">
              Medio de pago
              <PaymentMethodButtons value={advancePaymentMethod} onChange={setAdvancePaymentMethod} />
            </label>
            <BigButton
              className="mt-6 w-full bg-emerald-500 text-emerald-950"
              disabled={savingAdvance}
            >
              <Banknote /> {savingAdvance ? 'Registrando…' : 'Confirmar cobro adelantado'}
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
                const items = lessonsBySlot.get(`${dateKey(day)}-${Number(hour.slice(0, 2))}`) || []
                return (
                  <div key={hour} className="min-h-36 rounded-2xl bg-slate-800 p-4">
                    <p className="text-2xl font-bold text-white">{hour}</p>
                    {items.map((lesson) => {
                      const name = shortName(
                        studentsById.get(lesson.studentId)?.name,
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
                            {lesson.status === 'scheduled' && Number(lesson.paidAmount || 0) <= 0 && (
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
                          {lesson.status === 'scheduled'
                            && new Date(lesson.date) > new Date()
                            && Number(lesson.paidAmount || 0) <= 0 && (
                            <button
                              onClick={() => openAdvancePayment(lesson)}
                              className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 text-base font-bold text-emerald-950"
                            >
                              <Banknote size={18} /> Cobrar por adelantado
                            </button>
                          )}
                          {lesson.status === 'scheduled' && Number(lesson.paidAmount || 0) > 0 && (
                            <div className="mt-3 rounded-lg border border-emerald-400/40 bg-emerald-500/15 p-3">
                              <p className="text-center text-base font-bold text-emerald-200">
                                Pagada por adelantado · {money(lesson.paidAmount)}
                              </p>
                              <button
                                onClick={() => askResetAdvancePayment(lesson)}
                                className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-700 px-3 text-sm font-bold text-slate-200"
                              >
                                <Undo2 size={16} /> Anular adelanto
                              </button>
                            </div>
                          )}
                          {lesson.status === 'scheduled' && new Date(lesson.date) <= new Date() && (
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

function PaymentMethodButtons({ value, onChange }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-3" role="group" aria-label="Medio de pago">
      {[
        ['cash', 'Efectivo'],
        ['transfer', 'Transferencia'],
      ].map(([method, label]) => (
        <button
          key={method}
          type="button"
          onClick={() => onChange(method)}
          aria-pressed={value === method}
          className={`min-h-14 rounded-xl px-3 text-lg font-bold transition-colors ${
            value === method
              ? 'bg-emerald-500 text-emerald-950'
              : 'bg-slate-800 text-slate-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
