import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CalendarRange,
  Cake,
  CheckCircle2,
  Clock3,
  DollarSign,
  Pencil,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react'
import { BigButton, Field, PageTitle } from '../components/ui'
import ConfirmDialog from '../components/ConfirmDialog'
import FormModal from '../components/FormModal'
import { getDailyMessage } from '../content/dailyMessages'
import {
  cancelLesson,
  completeLesson,
  getStudents,
  getSchools,
  getTodayLessons,
  reopenLesson,
  rescheduleLesson,
  updateLessonRate,
} from '../services/api'

const localDateKey = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-')

const greetingFor = (date) => {
  const hour = date.getHours()
  if (hour < 12) return 'Buenos días'
  if (hour < 20) return 'Buenas tardes'
  return 'Buenas noches'
}
const resultLabel = (lesson) => {
  if (lesson.attendance === 'absent_excused') return 'Faltó y avisó'
  if (lesson.attendance === 'absent_unexcused') return 'Faltó'
  return lesson.paymentStatus === 'paid' ? 'Asistió y Pagó' : 'Asistió y Debe'
}
const paymentMethodLabel = (value) => ({
  cash: 'Efectivo',
  transfer: 'Transferencia',
  mixed: 'Mixto',
}[value] || 'Sin especificar')

export default function TodayView() {
  const [now, setNow] = useState(() => new Date())
  const [lessons, setLessons] = useState([])
  const [students, setStudents] = useState([])
  const [schools, setSchools] = useState([])
  const [modal, setModal] = useState(null)
  const moveInFlight = useRef(false)
  const [dialog, setDialog] = useState(null)
  const [notice, setNotice] = useState('')
  const todayKey = localDateKey(now)

  const load = useCallback(async () => {
    try {
      const [items, people, groups] = await Promise.all([
        getTodayLessons(todayKey),
        getStudents(),
        getSchools(),
      ])
      setLessons(items.slice().sort((a, b) => {
        const aRegistered = a.status === 'scheduled' ? 0 : 1
        const bRegistered = b.status === 'scheduled' ? 0 : 1
        return aRegistered - bRegistered
          || new Date(a.date).getTime() - new Date(b.date).getTime()
      }))
      setStudents(people)
      setSchools(groups)
      setNotice('')
    } catch {
      setNotice('No pude cargar las clases de hoy.')
    }
  }, [todayKey])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(clock)
  }, [])

  const studentName = (id) => (
    students.find((student) => student.id === id)?.name || 'Alumno'
  )
  const birthdays = students
    .filter((student) => (
      student.birthDate
      && new Date(`${student.birthDate}T00:00:00`).getMonth() === now.getMonth()
    ))
    .sort((a, b) => a.birthDate.slice(5).localeCompare(b.birthDate.slice(5)))
  const upcomingAssessments = schools
    .flatMap((school) => school.grades.flatMap((grade) => (
      grade.subjects.flatMap((subject) => (
        subject.assessments.map((assessment) => ({
          ...assessment,
          school: school.name,
          grade: grade.grade,
          subject: subject.name,
        }))
      ))
    )))
    .filter((assessment) => assessment.date >= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8)

  const saveMove = async (event) => {
    event.preventDefault()
    if (moveInFlight.current) return
    moveInFlight.current = true
    const form = new FormData(event.currentTarget)
    try {
      const [year, month, day] = String(form.get('date')).split('-').map(Number)
      const [hour, minute] = String(form.get('time')).split(':').map(Number)
      const localDate = new Date(year, month - 1, day, hour, minute)
      await rescheduleLesson(
        modal.lesson.id,
        localDate.toISOString(),
      )
      setModal(null)
      await load()
    } catch {
      setNotice('No pude cambiar el horario.')
    } finally {
      moveInFlight.current = false
    }
  }
  const saveRate = async (event) => {
    event.preventDefault()
    const hourlyRate = Number(new FormData(event.currentTarget).get('hourlyRate'))
    if (hourlyRate <= 0) {
      setNotice('El precio por hora debe ser mayor a cero.')
      return
    }
    try {
      await updateLessonRate(modal.lesson.id, hourlyRate)
      setModal(null)
      await load()
    } catch (error) {
      setNotice(error.message || 'No pude corregir el precio del turno.')
    }
  }
  const register = async (
    lesson,
    paymentStatus,
    attendance = 'present',
    paymentMethod = '',
  ) => {
    try {
      await completeLesson(lesson.id, {
        realDurationMinutes: 60,
        attendance,
        paymentStatus,
        paymentMethod,
      })
      setDialog(null)
      load()
    } catch {
      setDialog(null)
      setNotice('No pude registrar el resultado de la clase.')
    }
  }
  const reopen = async (lesson) => {
    try {
      await reopenLesson(lesson.id)
      setDialog(null)
      load()
    } catch {
      setDialog(null)
      setNotice('No pude reabrir esa clase.')
    }
  }
  const cancel = async (lesson) => {
    try {
      await cancelLesson(lesson.id)
      setDialog(null)
      load()
    } catch {
      setDialog(null)
      setNotice('No pude cancelar ese turno.')
    }
  }
  const showResultConfirmation = (
    lesson,
    label,
    paymentStatus,
    attendance,
    paymentMethod = '',
  ) => setDialog({
    title: label,
    message: `¿Seguro que querés registrar “${label}” para ${studentName(lesson.studentId)}?`,
    confirmLabel: 'Sí, registrar',
    onConfirm: () => register(
      lesson,
      paymentStatus,
      attendance,
      paymentMethod,
    ),
  })
  const askResult = (
    lesson,
    label,
    paymentStatus,
    attendance = 'present',
  ) => {
    if (paymentStatus === 'paid' && attendance === 'present') {
      setModal({ type: 'paid', lesson, label, paymentStatus, attendance })
      return
    }
    showResultConfirmation(lesson, label, paymentStatus, attendance)
  }
  const confirmPaidMethod = (event) => {
    event.preventDefault()
    const paymentMethod = new FormData(event.currentTarget).get('paymentMethod')
    const current = modal
    setModal(null)
    showResultConfirmation(
      current.lesson,
      current.label,
      current.paymentStatus,
      current.attendance,
      paymentMethod,
    )
  }

  return (
    <section>
      <PageTitle
        eyebrow={now.toLocaleDateString('es-AR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
      >
        {greetingFor(now)}, ELISABET
      </PageTitle>
      <aside className="mt-6 rounded-3xl border border-amber-300/30 bg-gradient-to-br from-amber-300/15 via-indigo-500/10 to-fuchsia-500/10 p-6 sm:p-7">
        <p className="flex items-center gap-2 text-base font-bold uppercase tracking-wider text-amber-200">
          <Sparkles aria-hidden="true" size={22} /> Mensaje de hoy
        </p>
        <p className="mt-3 max-w-4xl text-xl font-medium leading-relaxed text-white sm:text-2xl">
          “{getDailyMessage(now)}”
        </p>
      </aside>
      {notice && <Notice text={notice} close={() => setNotice('')} />}

      <section className="mt-6 rounded-3xl border border-amber-300/30 bg-amber-300/10 p-6">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-white">
          <CalendarRange className="text-amber-200" /> Próximas evaluaciones
        </h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {upcomingAssessments.map((assessment) => (
            <article key={assessment.id} className="rounded-2xl bg-slate-900/80 p-4">
              <p className="text-lg font-bold text-white">
                {assessment.school} · {assessment.grade}.º grado
              </p>
              <p className="mt-1 text-lg text-amber-100">
                {assessment.subject} · {assessment.title}
              </p>
              <p className="mt-1 text-slate-300">
                {new Date(`${assessment.date}T00:00:00`).toLocaleDateString(
                  'es-AR',
                  { weekday: 'long', day: 'numeric', month: 'long' },
                )}
              </p>
            </article>
          ))}
          {!upcomingAssessments.length && (
            <p className="text-lg text-slate-300">
              No hay evaluaciones próximas cargadas.
            </p>
          )}
        </div>
      </section>

      {modal?.type === 'paid' && (
        <FormModal title="¿Cómo pagó?" onClose={() => setModal(null)}>
          <form onSubmit={confirmPaidMethod}>
            <p className="mb-5 text-xl text-slate-300">
              Elegí el medio de pago de {studentName(modal.lesson.studentId)}.
            </p>
            <Field as="select" label="Medio de pago" name="paymentMethod" required>
              <option value="">Elegí una opción</option>
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
            </Field>
            <BigButton className="mt-5 w-full bg-emerald-500 text-emerald-950">
              Continuar
            </BigButton>
          </form>
        </FormModal>
      )}

      {modal?.type === 'move' && (
        <FormModal title="Cambiar horario" onClose={() => setModal(null)}>
          <form onSubmit={saveMove} className="grid gap-4 sm:grid-cols-2">
            <Field label="Fecha" name="date" type="date" required />
            <Field label="Horario" name="time" type="time" required />
            <BigButton className="bg-emerald-500 text-emerald-950 sm:col-span-2">
              Guardar cambio
            </BigButton>
          </form>
        </FormModal>
      )}

      {modal?.type === 'rate' && (
        <FormModal title="Corregir precio del turno" onClose={() => setModal(null)}>
          <form onSubmit={saveRate}>
            <p className="mb-5 text-xl text-slate-300">
              Este cambio se aplica solamente al turno de {studentName(modal.lesson.studentId)}
              {' '}y vuelve a calcular su importe y su deuda.
            </p>
            <Field
              label="Precio por hora correcto"
              name="hourlyRate"
              type="number"
              min="1"
              step="1"
              defaultValue={modal.lesson.hourlyRate}
              required
            />
            <BigButton className="mt-5 w-full bg-emerald-500 text-emerald-950">
              Guardar precio correcto
            </BigButton>
          </form>
        </FormModal>
      )}

      <section className="mt-6 rounded-3xl border border-indigo-500/40 bg-indigo-500/10 p-6">
        <h2 className="flex gap-2 text-2xl font-bold text-white">
          <Cake /> Cumpleaños de {now.toLocaleDateString('es-AR', { month: 'long' })}
        </h2>
        {birthdays.map((student) => (
          <p key={student.id} className="mt-3 text-lg text-white">
            <strong>{student.name}</strong> ·{' '}
            {new Date(`${student.birthDate}T00:00:00`).toLocaleDateString(
              'es-AR',
              { day: 'numeric', month: 'long' },
            )}
          </p>
        ))}
        {!birthdays.length && (
          <p className="mt-3 text-lg text-slate-300">
            No hay cumpleaños este mes.
          </p>
        )}
      </section>

      <div className="mt-6 space-y-5">
        {lessons
          .filter((lesson) => lesson.status !== 'cancelled')
          .map((lesson) => (
            <article
              key={lesson.id}
              className="rounded-3xl border border-slate-700 bg-slate-900 p-6"
            >
              <h2 className="text-2xl font-bold text-white">
                {studentName(lesson.studentId)}
              </h2>
              <p className="text-xl text-slate-300">
                {new Date(lesson.date).toLocaleTimeString('es-AR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })} · 1 hora
              </p>

              {lesson.status === 'scheduled' ? (
                <>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <BigButton
                      onClick={() => askResult(lesson, 'Asistió y Pagó', 'paid')}
                      className="bg-emerald-500 text-emerald-950"
                    >
                      <CheckCircle2 /> Asistió y Pagó
                    </BigButton>
                    <BigButton
                      onClick={() => askResult(lesson, 'Asistió y Debe', 'pending')}
                      className="bg-orange-400 text-orange-950"
                    >
                      <Clock3 /> Asistió y Debe
                    </BigButton>
                    <BigButton
                      onClick={() => askResult(
                        lesson,
                        'Faltó',
                        'pending',
                        'absent_unexcused',
                      )}
                      className="bg-rose-500 text-white"
                    >
                      <XCircle /> Faltó
                    </BigButton>
                    <BigButton
                      onClick={() => askResult(
                        lesson,
                        'Faltó y avisó',
                        'pending',
                        'absent_excused',
                      )}
                      className="bg-sky-500 text-sky-950"
                    >
                      <XCircle /> Faltó y avisó
                    </BigButton>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-4">
                    <button
                      onClick={() => setModal({ type: 'move', lesson })}
                      className="text-lg font-bold text-indigo-300"
                    >
                      <Pencil className="inline" /> Cambiar horario
                    </button>
                    <button
                      onClick={() => setModal({ type: 'rate', lesson })}
                      className="text-lg font-bold text-amber-300"
                    >
                      <DollarSign className="inline" /> Corregir precio
                    </button>
                    <button
                      onClick={() => setDialog({
                        title: 'Cancelar turno',
                        message: `¿Seguro que querés cancelar el turno de ${studentName(lesson.studentId)}?`,
                        confirmLabel: 'Sí, cancelar',
                        danger: true,
                        onConfirm: () => cancel(lesson),
                      })}
                      className="text-lg font-bold text-rose-300"
                    >
                      <Trash2 className="inline" /> Cancelar turno
                    </button>
                  </div>
                </>
              ) : (
                <div className="mt-5 rounded-2xl bg-slate-800 p-5">
                  <p className="text-xl font-bold text-white">
                    Registrado: {resultLabel(lesson)}
                  </p>
                  <p className="mt-1 text-lg text-slate-300">
                    Importe: ${lesson.amount.toLocaleString('es-AR')}
                  </p>
                  {lesson.paymentStatus === 'paid' && (
                    <p className="mt-1 text-lg text-slate-300">
                      Medio: {paymentMethodLabel(lesson.paymentMethod)}
                    </p>
                  )}
                  <button
                    onClick={() => setDialog({
                      title: 'Editar registro',
                      message: 'Se quitará temporalmente este resultado del resumen mensual. Los pagos parciales se conservarán y el pago final se actualizará según el nuevo resultado. ¿Continuar?',
                      confirmLabel: 'Sí, editar',
                      onConfirm: () => reopen(lesson),
                    })}
                    className="mt-4 text-lg font-bold text-indigo-300"
                  >
                    <Pencil className="inline" /> Editar registro
                  </button>
                  <button
                    onClick={() => setModal({ type: 'rate', lesson })}
                    className="ml-5 mt-4 text-lg font-bold text-amber-300"
                  >
                    <DollarSign className="inline" /> Corregir precio
                  </button>
                </div>
              )}
            </article>
          ))}
      </div>
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </section>
  )
}

export function Empty({ children }) {
  return (
    <p className="rounded-3xl border border-dashed border-slate-700 p-8 text-center text-lg text-slate-300">
      {children}
    </p>
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
