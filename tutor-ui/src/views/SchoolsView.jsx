import { useEffect, useRef, useState } from 'react'
import {
  CalendarDays,
  GraduationCap,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Trash2,
} from 'lucide-react'
import { BigButton, Field, PageTitle } from '../components/ui'
import ConfirmDialog from '../components/ConfirmDialog'
import FormModal from '../components/FormModal'
import {
  createGradeExam,
  createSchool,
  deleteAssessment,
  deleteSchool,
  getSchools,
  updateSchool,
} from '../services/api'
import { Empty } from './TodayView'

const formatDate = (value) => new Date(`${value}T00:00:00`).toLocaleDateString(
  'es-AR',
  { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
)

export default function SchoolsView() {
  const [schools, setSchools] = useState([])
  const [selectedGrades, setSelectedGrades] = useState({})
  const [modal, setModal] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  const load = async () => {
    try {
      setSchools(await getSchools())
      setNotice('')
    } catch {
      setNotice('No pude cargar las escuelas.')
    }
  }
  useEffect(() => { load() }, [])

  const saveSchool = async (event) => {
    event.preventDefault()
    if (savingRef.current) return
    savingRef.current = true
    const form = new FormData(event.currentTarget)
    const data = {
      name: form.get('name'),
      address: form.get('address'),
      phone: form.get('phone'),
      notes: form.get('notes'),
    }
    setSaving(true)
    try {
      if (modal.school) {
        await updateSchool(modal.school.id, data)
      } else {
        await createSchool(data)
      }
      setModal(null)
      await load()
    } catch (error) {
      setNotice(error.message || 'No pude guardar la escuela.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const saveExam = async (event) => {
    event.preventDefault()
    if (savingRef.current) return
    savingRef.current = true
    const form = new FormData(event.currentTarget)
    setSaving(true)
    try {
      await createGradeExam(modal.grade.id, {
        subjectName: form.get('subjectName'),
        date: form.get('date'),
        title: form.get('title'),
        notes: '',
      })
      setModal(null)
      await load()
    } catch (error) {
      setNotice(error.message || 'No pude guardar la fecha del examen.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const remove = async (action) => {
    try {
      await action()
      setDialog(null)
      await load()
    } catch {
      setDialog(null)
      setNotice('No pude eliminar ese registro.')
    }
  }

  return (
    <section>
      <PageTitle eyebrow="Fechas de exámenes por escuela y grado">
        Escuelas
      </PageTitle>
      {notice && <Notice text={notice} close={() => setNotice('')} />}
      <BigButton
        onClick={() => setModal({ type: 'school' })}
        className="mt-7 w-full bg-indigo-500 text-white"
      >
        <Plus /> Agregar escuela
      </BigButton>

      {modal?.type === 'school' && (
        <FormModal
          title={modal.school ? 'Editar escuela' : 'Agregar escuela'}
          onClose={() => setModal(null)}
        >
          <form onSubmit={saveSchool} className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Nombre de la escuela"
              name="name"
              defaultValue={modal.school?.name || ''}
              required
            />
            <Field
              label="Dirección (opcional)"
              name="address"
              defaultValue={modal.school?.address || ''}
            />
            <Field
              label="Teléfono (opcional)"
              name="phone"
              defaultValue={modal.school?.phone || ''}
            />
            <div className="sm:col-span-2">
              <Field
                as="textarea"
                rows="3"
                label="Observaciones (opcional)"
                name="notes"
                defaultValue={modal.school?.notes || ''}
              />
            </div>
            <BigButton
              className="bg-emerald-500 text-emerald-950 sm:col-span-2"
              disabled={saving}
            >
              {saving ? 'Guardando...' : 'Guardar escuela'}
            </BigButton>
          </form>
        </FormModal>
      )}

      {modal?.type === 'exam' && (
        <FormModal
          title={`${modal.school.name} · ${modal.grade.grade}.º grado`}
          onClose={() => setModal(null)}
        >
          <form onSubmit={saveExam} className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Materia"
              name="subjectName"
              placeholder="Ejemplo: Matemática"
              required
            />
            <Field label="Fecha del examen" name="date" type="date" required />
            <div className="sm:col-span-2">
              <Field
                label="Tema o detalle (opcional)"
                name="title"
                placeholder="Ejemplo: Fracciones"
              />
            </div>
            <BigButton
              className="bg-emerald-500 text-emerald-950 sm:col-span-2"
              disabled={saving}
            >
              <CalendarDays /> {saving ? 'Guardando...' : 'Guardar fecha del examen'}
            </BigButton>
          </form>
        </FormModal>
      )}

      <div className="mt-7 space-y-7">
        {schools.map((school) => {
          const selectedID = selectedGrades[school.id] || school.grades[0]?.id
          const selectedGrade = school.grades.find((grade) => grade.id === selectedID)
          return (
            <article
              key={school.id}
              className="rounded-3xl border border-slate-700 bg-slate-900 p-6 sm:p-7"
            >
              <header className="flex flex-wrap items-start justify-between gap-5">
                <div>
                  <h2 className="flex items-center gap-3 text-3xl font-bold text-white">
                    <GraduationCap size={30} /> {school.name}
                  </h2>
                  {school.address && (
                    <p className="mt-3 flex items-center gap-2 text-lg text-slate-300">
                      <MapPin size={21} /> {school.address}
                    </p>
                  )}
                  {school.phone && (
                    <a
                      href={`tel:${school.phone}`}
                      className="mt-2 flex items-center gap-2 text-lg text-indigo-200"
                    >
                      <Phone size={21} /> {school.phone}
                    </a>
                  )}
                  {school.notes && (
                    <p className="mt-3 whitespace-pre-wrap text-lg text-slate-300">
                      {school.notes}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => setModal({ type: 'school', school })}
                    className="flex min-h-14 items-center gap-2 rounded-xl bg-slate-700 px-5 text-lg font-bold text-indigo-100"
                  >
                    <Pencil size={21} /> Editar escuela
                  </button>
                  <button
                    aria-label={`Eliminar ${school.name}`}
                    onClick={() => setDialog({
                      title: 'Eliminar escuela',
                      message: `¿Eliminar ${school.name} y todas sus fechas de exámenes?`,
                      confirmLabel: 'Sí, eliminar',
                      danger: true,
                      onConfirm: () => remove(() => deleteSchool(school.id)),
                    })}
                    className="flex min-h-14 items-center gap-2 rounded-xl bg-rose-500/15 px-5 text-lg font-bold text-rose-200"
                  >
                    <Trash2 size={21} /> Eliminar
                  </button>
                </div>
              </header>

              <section className="mt-7 border-t border-slate-700 pt-6">
                <h3 className="text-2xl font-bold text-white">Elegí el grado</h3>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                  {school.grades.map((grade) => (
                    <button
                      key={grade.id}
                      onClick={() => setSelectedGrades({
                        ...selectedGrades,
                        [school.id]: grade.id,
                      })}
                      className={`min-h-16 rounded-xl px-3 text-xl font-bold ${
                        selectedGrade?.id === grade.id
                          ? 'bg-indigo-500 text-white ring-4 ring-indigo-300/30'
                          : 'bg-slate-800 text-slate-200'
                      }`}
                    >
                      {grade.grade}.º
                    </button>
                  ))}
                </div>
              </section>

              {selectedGrade && (
                <GradeExams
                  school={school}
                  grade={selectedGrade}
                  addExam={() => setModal({
                    type: 'exam',
                    school,
                    grade: selectedGrade,
                  })}
                  askDelete={(assessment) => setDialog({
                    title: 'Eliminar fecha de examen',
                    message: `¿Eliminar el examen de ${assessment.subject}?`,
                    confirmLabel: 'Sí, eliminar',
                    danger: true,
                    onConfirm: () => remove(() => deleteAssessment(assessment.id)),
                  })}
                />
              )}
            </article>
          )
        })}
        {!schools.length && (
          <Empty>Agregá una escuela. Los siete grados aparecerán automáticamente.</Empty>
        )}
      </div>
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </section>
  )
}

function GradeExams({ school, grade, addExam, askDelete }) {
  const exams = grade.subjects
    .flatMap((subject) => subject.assessments.map((assessment) => ({
      ...assessment,
      subject: subject.name,
    })))
    .sort((a, b) => a.date.localeCompare(b.date))

  return (
    <section className="mt-6 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold text-white">
            {grade.grade}.º grado
          </h3>
          <p className="mt-1 text-lg text-slate-300">
            Fechas de exámenes de {school.name}
          </p>
        </div>
        <button
          onClick={addExam}
          className="flex min-h-16 items-center gap-3 rounded-2xl bg-amber-300 px-5 text-lg font-bold text-amber-950"
        >
          <Plus size={24} /> Agregar fecha de examen
        </button>
      </div>
      <div className="mt-5 space-y-3">
        {exams.map((assessment) => (
          <article
            key={assessment.id}
            className="flex flex-wrap items-start justify-between gap-4 rounded-2xl bg-slate-900 p-5"
          >
            <div>
              <p className="text-xl font-bold text-white">{assessment.subject}</p>
              <p className="mt-1 text-lg font-semibold text-amber-200">
                {formatDate(assessment.date)}
              </p>
              {assessment.title !== 'Examen' && (
                <p className="mt-2 text-lg text-slate-300">{assessment.title}</p>
              )}
            </div>
            <button
              aria-label={`Eliminar examen de ${assessment.subject}`}
              onClick={() => askDelete(assessment)}
              className="flex min-h-12 items-center gap-2 rounded-xl bg-rose-500/15 px-4 font-bold text-rose-200"
            >
              <Trash2 size={20} /> Eliminar
            </button>
          </article>
        ))}
        {!exams.length && (
          <p className="rounded-2xl border border-dashed border-slate-600 p-6 text-center text-lg text-slate-300">
            No hay exámenes cargados para este grado.
          </p>
        )}
      </div>
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
