import { useEffect, useState } from 'react'
import {
  Cake,
  ClipboardList,
  Mail,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  UserPlus,
  UserX,
} from 'lucide-react'
import { BigButton, Field, PageTitle } from '../components/ui'
import ConfirmDialog from '../components/ConfirmDialog'
import FormModal from '../components/FormModal'
import {
  activateStudent,
  createStudent,
  createStudentAssessment,
  deactivateStudent,
  deleteStudentAssessment,
  deleteStudent,
  getSchools,
  getStudentAssessments,
  getStudents,
  updateStudent,
} from '../services/api'
import { Empty } from './TodayView'

const blankGuardian = () => ({
  name: '',
  relationship: '',
  phone: '',
  email: '',
})
const blankForm = () => ({
  name: '',
  school: '',
  grade: '',
  birthDate: '',
  notes: '',
  phone: '',
  email: '',
  guardians: [blankGuardian()],
})
const age = (value) => {
  if (!value) return ''
  const birth = new Date(`${value}T00:00:00`)
  const now = new Date()
  return now.getFullYear() - birth.getFullYear()
    - (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0)
}
const relationshipLabel = (value) => ({
  father: 'Padre',
  mother: 'Madre',
  relative: 'Familiar',
  other: 'Otro',
}[value] || value || 'Familiar')

export default function StudentsView() {
  const [students, setStudents] = useState([])
  const [schools, setSchools] = useState([])
  const [form, setForm] = useState(blankForm)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('active')
  const [notice, setNotice] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [trackingStudent, setTrackingStudent] = useState(null)
  const [trackingFormOpen, setTrackingFormOpen] = useState(false)
  const [trackingError, setTrackingError] = useState('')
  const [assessments, setAssessments] = useState([])

  const load = async () => {
    try {
      const [people, schoolItems] = await Promise.all([getStudents(), getSchools()])
      setStudents(people)
      setSchools(schoolItems)
      setNotice('')
    } catch {
      setNotice('No pude cargar los alumnos. Revisá que el servidor esté encendido.')
    }
  }
  useEffect(() => { load() }, [])

  const change = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value })
    setFormError('')
  }
  const changeGuardian = (index, event) => {
    setForm({
      ...form,
      guardians: form.guardians.map((guardian, position) => (
        position === index
          ? { ...guardian, [event.target.name]: event.target.value }
          : guardian
      )),
    })
    setFormError('')
  }
  const addGuardian = () => {
    setForm({ ...form, guardians: [...form.guardians, blankGuardian()] })
  }
  const removeGuardian = (index) => {
    setForm({
      ...form,
      guardians: form.guardians.filter((_, position) => position !== index),
    })
  }
  const closeForm = () => {
    setOpen(false)
    setEditingId(null)
    setForm(blankForm())
    setFormError('')
  }
  const openCreate = () => {
    setForm(blankForm())
    setEditingId(null)
    setFormError('')
    setOpen(true)
  }
  const openEdit = (student) => {
    const guardians = student.guardians?.length
      ? student.guardians
      : student.guardian
        ? [student.guardian]
        : [blankGuardian()]
    setEditingId(student.id)
    setForm({
      name: student.name || '',
      school: student.school || '',
      grade: student.grade || '',
      birthDate: student.birthDate || '',
      notes: student.notes || '',
      phone: student.phone || '',
      email: student.email || '',
      guardians: guardians.map((guardian) => ({
        name: guardian.name || '',
        relationship: relationshipLabel(guardian.relationship),
        phone: guardian.phone || '',
        email: guardian.email || '',
      })),
    })
    setFormError('')
    setOpen(true)
  }
  const save = async () => {
    setSaving(true)
    try {
      const data = {
        student: {
          name: form.name,
          school: form.school,
          grade: Number(form.grade || 0),
          birthDate: form.birthDate,
          notes: form.notes,
          phone: form.phone,
          email: form.email,
        },
        guardians: form.guardians,
      }
      if (editingId) {
        await updateStudent(editingId, data)
      } else {
        await createStudent(data)
      }
      setDialog(null)
      closeForm()
      await load()
    } catch (error) {
      setDialog(null)
      setFormError(
        error.message || 'No pude guardar el alumno. Revisá los datos e intentá nuevamente.',
      )
    } finally {
      setSaving(false)
    }
  }
  const confirmSave = (event) => {
    event.preventDefault()
    if (!form.guardians.length) {
      setFormError('Agregá por lo menos un tutor o familiar.')
      return
    }
    setDialog({
      title: editingId ? 'Guardar cambios' : 'Guardar alumno',
      message: editingId
        ? `¿Seguro que querés guardar los cambios de ${form.name}?`
        : `¿Seguro que querés agregar a ${form.name}?`,
      confirmLabel: 'Sí, guardar',
      onConfirm: save,
    })
  }
  const setActive = async (student, active) => {
    try {
      if (active) {
        await activateStudent(student.id)
      } else {
        await deactivateStudent(student.id)
      }
      setDialog(null)
      await load()
    } catch {
      setDialog(null)
      setNotice(
        active
          ? 'No pude volver a activar ese alumno.'
          : 'No pude poner ese alumno como inactivo.',
      )
    }
  }
  const removeStudent = async (student) => {
    try {
      await deleteStudent(student.id)
      setDialog(null)
      await load()
    } catch {
      setDialog(null)
      setNotice(
        'No pude eliminar el alumno. Puede tener clases guardadas; en ese caso conviene dejarlo inactivo.',
      )
    }
  }

  const openTracking = async (student) => {
    setTrackingStudent(student)
    setTrackingFormOpen(false)
    setTrackingError('')
    try {
      setAssessments(await getStudentAssessments(student.id))
    } catch {
      setAssessments([])
      setNotice('No pude cargar el seguimiento de ese alumno.')
    }
  }

  const saveStudentAssessment = async (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const score = data.get('score')
    setSaving(true)
    setTrackingError('')
    try {
      await createStudentAssessment(trackingStudent.id, {
        subjectName: data.get('subjectName'),
        title: data.get('title'),
        type: data.get('type'),
        date: data.get('date'),
        score: score === '' ? null : Number(score),
        notes: data.get('notes'),
      })
      setAssessments(await getStudentAssessments(trackingStudent.id))
      setTrackingFormOpen(false)
    } catch (error) {
      setTrackingError(error.message || 'No pude guardar la evaluación.')
    } finally {
      setSaving(false)
    }
  }

  const removeStudentAssessment = async (assessment) => {
    try {
      await deleteStudentAssessment(assessment.id)
      setAssessments(await getStudentAssessments(trackingStudent.id))
      setDialog(null)
    } catch {
      setDialog(null)
      setNotice('No pude eliminar esa evaluación.')
    }
  }

  const filtered = students.filter((student) => (
    student.name.toLowerCase().includes(search.toLowerCase())
    && (activeFilter === 'all'
      || (activeFilter === 'active' && student.isActive)
      || (activeFilter === 'inactive' && !student.isActive))
  ))
  const selectedSchool = schools.find((school) => school.name === form.school)
  const availableGrades = selectedSchool?.grades || []

  return (
    <section>
      <PageTitle eyebrow="Personas que acompañás">Alumnos</PageTitle>
      {notice && <Notice text={notice} close={() => setNotice('')} />}
      <BigButton
        onClick={openCreate}
        className="mt-7 w-full bg-indigo-500 text-white"
      >
        <Plus /> Agregar Alumno
      </BigButton>
      <div className="mt-5">
        <Field
          label="Buscar alumno"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Escribí un nombre"
        />
      </div>
      <section className="mt-5" aria-label="Filtrar alumnos por estado">
        <h2 className="text-xl font-bold text-white">Mostrar</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            ['active', 'Activos'],
            ['inactive', 'Inactivos'],
            ['all', 'Todos'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={activeFilter === value}
              onClick={() => setActiveFilter(value)}
              className={`min-h-16 rounded-2xl px-5 text-xl font-bold transition-colors ${
                activeFilter === value
                  ? 'bg-indigo-500 text-white ring-4 ring-indigo-300/30'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {open && (
        <FormModal
          title={editingId ? 'Editar alumno' : 'Agregar alumno'}
          onClose={closeForm}
        >
          <form onSubmit={confirmSave}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Nombre"
                name="name"
                value={form.name}
                onChange={change}
                required
              />
              <Field
                as="select"
                label="Escuela (opcional)"
                name="school"
                value={form.school}
                onChange={(event) => {
                  setForm({ ...form, school: event.target.value, grade: '' })
                  setFormError('')
                }}
              >
                <option value="">Sin especificar</option>
                {form.school && !schools.some((school) => school.name === form.school) && (
                  <option value={form.school}>{form.school}</option>
                )}
                {schools.map((school) => (
                  <option key={school.id} value={school.name}>{school.name}</option>
                ))}
              </Field>
              <Field
                as="select"
                label="Grado (opcional)"
                name="grade"
                value={form.grade}
                onChange={change}
                disabled={!selectedSchool}
              >
                <option value="">Sin especificar</option>
                {availableGrades.map((grade) => (
                  <option key={grade.id} value={grade.grade}>{grade.grade}.º grado</option>
                ))}
              </Field>
              <Field
                label="Fecha de nacimiento"
                name="birthDate"
                type="date"
                value={form.birthDate}
                onChange={change}
                required
              />
              <Field
                label="Teléfono del alumno"
                name="phone"
                value={form.phone}
                onChange={change}
              />
              <Field
                label="Mail del alumno"
                name="email"
                type="email"
                value={form.email}
                onChange={change}
              />
              <div className="sm:col-span-2">
                <Field
                  as="textarea"
                  rows="4"
                  label="Observaciones / notas"
                  name="notes"
                  value={form.notes}
                  onChange={change}
                  placeholder="Ejemplo: temas que está trabajando, preferencias o información importante"
                />
              </div>
            </div>

            <h3 className="mt-7 text-2xl font-bold text-white">
              Tutores o familiares
            </h3>
            {form.guardians.map((guardian, index) => (
              <div
                key={index}
                className="mt-4 rounded-2xl border border-slate-700 bg-slate-800 p-4"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Nombre"
                    name="name"
                    value={guardian.name}
                    onChange={(event) => changeGuardian(index, event)}
                    required
                  />
                  <Field
                    label="Relación"
                    name="relationship"
                    value={guardian.relationship}
                    onChange={(event) => changeGuardian(index, event)}
                    placeholder="Ejemplo: mamá, papá, hermana"
                    required
                  />
                  <Field
                    label="Teléfono"
                    name="phone"
                    value={guardian.phone}
                    onChange={(event) => changeGuardian(index, event)}
                    required
                  />
                  <Field
                    label="Mail"
                    name="email"
                    type="email"
                    value={guardian.email}
                    onChange={(event) => changeGuardian(index, event)}
                  />
                </div>
                {form.guardians.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeGuardian(index)}
                    className="mt-4 flex min-h-12 items-center gap-2 rounded-xl bg-rose-500/15 px-4 text-lg font-bold text-rose-200"
                  >
                    <Trash2 size={20} /> Quitar este familiar
                  </button>
                )}
              </div>
            ))}
            <BigButton
              onClick={addGuardian}
              className="mt-4 w-full bg-slate-700 text-white"
            >
              <UserPlus /> Agregar otro familiar
            </BigButton>
            {formError && (
              <div
                role="alert"
                className="mt-4 rounded-2xl border border-rose-400/50 bg-rose-500/15 p-4 text-lg font-semibold text-rose-100"
              >
                {formError}
              </div>
            )}
            <BigButton
              className="mt-4 w-full bg-emerald-500 text-emerald-950"
              disabled={saving}
            >
              <Save /> {saving ? 'Guardando...' : 'Guardar alumno'}
            </BigButton>
          </form>
        </FormModal>
      )}

      <div className="mt-6 space-y-5">
        {filtered.map((student) => {
          const guardians = student.guardians?.length
            ? student.guardians
            : student.guardian
              ? [student.guardian]
              : []
          return (
            <article
              key={student.id}
              className={`rounded-3xl border p-6 ${
                student.isActive
                  ? 'border-slate-700 bg-slate-900'
                  : 'border-orange-500/40 bg-slate-950'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-bold text-white">{student.name}</h2>
                  <p className="mt-1 text-xl text-slate-300">
                    {student.school || 'Escuela sin cargar'}
                    {student.grade ? ` · ${student.grade}.º grado` : ''}
                  </p>
                  {student.birthDate && (
                    <p className="mt-3 flex items-center gap-2 text-lg text-indigo-200">
                      <Cake size={20} /> {age(student.birthDate)} años
                    </p>
                  )}
                  {!student.isActive && (
                    <p className="mt-3 text-lg font-bold text-orange-300">
                      Alumno inactivo
                    </p>
                  )}
                </div>
                <button
                  onClick={() => openEdit(student)}
                  className="flex min-h-14 items-center gap-2 rounded-xl bg-slate-800 px-4 text-lg font-bold text-indigo-200"
                >
                  <Pencil /> Editar
                </button>
              </div>

              {(student.phone || student.email) && (
                <div className="mt-5 flex flex-wrap gap-4 rounded-2xl bg-slate-800 p-4">
                  {student.phone && (
                    <a
                      href={`tel:${student.phone}`}
                      className="text-lg font-bold text-indigo-100"
                    >
                      <Phone className="inline" /> {student.phone}
                    </a>
                  )}
                  {student.email && (
                    <a
                      href={`mailto:${student.email}`}
                      className="text-lg font-bold text-indigo-100"
                    >
                      <Mail className="inline" /> {student.email}
                    </a>
                  )}
                </div>
              )}

              <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-800/60 p-4">
                <h3 className="text-xl font-bold text-white">
                  Observaciones / notas
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-lg text-slate-300">
                  {student.notes || 'Sin observaciones cargadas.'}
                </p>
              </div>

              <div className="mt-5 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="flex items-center gap-2 text-xl font-bold text-white">
                      <ClipboardList size={22} /> Seguimiento escolar
                    </h3>
                    <p className="mt-1 text-slate-300">
                      Exámenes, recuperatorios, trabajos y notas.
                    </p>
                  </div>
                  <button
                    onClick={() => openTracking(student)}
                    className="min-h-12 rounded-xl bg-indigo-500 px-4 text-lg font-bold text-white"
                  >
                    {student.isActive ? 'Ver seguimiento' : 'Ver historial'}
                  </button>
                  {!student.isActive && (
                    <p className="w-full text-sm font-semibold text-orange-200">
                      El historial se puede consultar, pero no modificar mientras el alumno esté inactivo.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 border-t border-slate-700 pt-4">
                <h3 className="text-xl font-bold text-white">Tutores y contacto</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {guardians.map((guardian) => (
                    <div
                      key={guardian.id || `${guardian.name}-${guardian.phone}`}
                      className="rounded-2xl bg-slate-800 p-4"
                    >
                      <p className="text-xl font-bold text-white">
                        {guardian.name} · {relationshipLabel(guardian.relationship)}
                      </p>
                      {guardian.phone && (
                        <a
                          href={`tel:${guardian.phone}`}
                          className="mt-2 block text-lg text-indigo-100"
                        >
                          <Phone className="inline" /> {guardian.phone}
                        </a>
                      )}
                      {guardian.email && (
                        <a
                          href={`mailto:${guardian.email}`}
                          className="mt-2 block text-lg text-indigo-100"
                        >
                          <Mail className="inline" /> {guardian.email}
                        </a>
                      )}
                    </div>
                  ))}
                  {!guardians.length && (
                    <p className="text-lg text-slate-300">
                      No hay familiares cargados.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-4">
                {student.isActive ? (
                  <button
                    onClick={() => setDialog({
                      title: 'Poner alumno inactivo',
                      message: `¿Seguro que querés poner inactivo a ${student.name}?`,
                      confirmLabel: 'Sí, poner inactivo',
                      onConfirm: () => setActive(student, false),
                    })}
                    className="flex min-h-12 items-center gap-2 rounded-xl bg-orange-500/15 px-4 text-lg font-bold text-orange-200"
                  >
                    <UserX /> Poner inactivo
                  </button>
                ) : (
                  <button
                    onClick={() => setDialog({
                      title: 'Volver a activar alumno',
                      message: `¿Seguro que querés volver a activar a ${student.name}?`,
                      confirmLabel: 'Sí, activar',
                      onConfirm: () => setActive(student, true),
                    })}
                    className="flex min-h-12 items-center gap-2 rounded-xl bg-emerald-500/15 px-4 text-lg font-bold text-emerald-200"
                  >
                    <RotateCcw /> Volver a activar
                  </button>
                )}
                <button
                  onClick={() => setDialog({
                    title: 'Eliminar alumno',
                    message: `¿Seguro que querés eliminar definitivamente a ${student.name}? Esta acción no se puede deshacer.`,
                    confirmLabel: 'Sí, eliminar',
                    danger: true,
                    onConfirm: () => removeStudent(student),
                  })}
                  className="flex min-h-12 items-center gap-2 rounded-xl bg-rose-500/15 px-4 text-lg font-bold text-rose-200"
                >
                  <Trash2 /> Eliminar
                </button>
              </div>
            </article>
          )
        })}
        {!filtered.length && (
          <Empty>
            {search
              ? 'No encontré alumnos con ese nombre en este grupo.'
              : activeFilter === 'active'
                ? 'No hay alumnos activos.'
                : activeFilter === 'inactive'
                  ? 'No hay alumnos inactivos.'
                  : 'Todavía no hay alumnos cargados.'}
          </Empty>
        )}
      </div>
      {trackingStudent && (
        <FormModal
          title={`Seguimiento de ${trackingStudent.name}`}
          onClose={() => {
            setTrackingStudent(null)
            setTrackingFormOpen(false)
          }}
        >
          {trackingStudent.isActive ? (
            <button
              type="button"
              onClick={() => setTrackingFormOpen(!trackingFormOpen)}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 text-lg font-bold text-white"
            >
              <Plus /> {trackingFormOpen ? 'Cerrar formulario' : 'Agregar evaluación o nota'}
            </button>
          ) : (
            <p className="rounded-2xl border border-orange-400/30 bg-orange-500/10 p-4 text-lg font-semibold text-orange-100">
              Este alumno está inactivo. Podés consultar su historial, pero no agregar evaluaciones ni notas.
            </p>
          )}
          {trackingStudent.isActive && trackingFormOpen && (
            <form onSubmit={saveStudentAssessment} className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Materia" name="subjectName" placeholder="Ejemplo: Matemática" required />
              <Field as="select" label="Tipo" name="type" required>
                <option value="exam">Examen</option>
                <option value="make_up">Recuperatorio</option>
                <option value="practical">Trabajo práctico</option>
                <option value="oral">Evaluación oral</option>
                <option value="other">Otra evaluación</option>
              </Field>
              <Field label="Título o tema" name="title" placeholder="Ejemplo: Fracciones" required />
              <Field label="Fecha" name="date" type="date" required />
              <Field
                label="Nota (opcional)"
                name="score"
                type="number"
                min="0"
                max="10"
                step="0.01"
                placeholder="De 0 a 10"
              />
              <div className="sm:col-span-2">
                <Field as="textarea" rows="3" label="Observaciones" name="notes" />
              </div>
              {trackingError && (
                <div
                  role="alert"
                  className="rounded-2xl border border-rose-400/50 bg-rose-500/15 p-4 text-lg font-semibold text-rose-100 sm:col-span-2"
                >
                  {trackingError}
                </div>
              )}
              <BigButton
                className="bg-emerald-500 text-emerald-950 sm:col-span-2"
                disabled={saving}
              >
                <Save /> Guardar en el seguimiento
              </BigButton>
            </form>
          )}
          <div className="mt-6 space-y-3">
            {assessments.map((assessment) => (
              <article key={assessment.id} className="rounded-2xl bg-slate-800 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-bold text-white">
                      {assessment.subjectName} · {assessment.title}
                    </p>
                    <p className="mt-1 text-lg text-slate-300">
                      {{
                        exam: 'Examen',
                        make_up: 'Recuperatorio',
                        practical: 'Trabajo práctico',
                        oral: 'Evaluación oral',
                        other: 'Otra evaluación',
                      }[assessment.type]} ·{' '}
                      {new Date(`${assessment.date}T00:00:00`).toLocaleDateString('es-AR')}
                    </p>
                    <p className="mt-2 text-lg font-bold text-amber-200">
                      {assessment.score === null ? 'Sin nota cargada' : `Nota: ${assessment.score}`}
                    </p>
                    {assessment.notes && (
                      <p className="mt-2 whitespace-pre-wrap text-slate-300">{assessment.notes}</p>
                    )}
                  </div>
                  {trackingStudent.isActive && (
                    <button
                      aria-label={`Eliminar ${assessment.title}`}
                      onClick={() => setDialog({
                        title: 'Eliminar del seguimiento',
                        message: `¿Eliminar “${assessment.title}” del seguimiento de ${trackingStudent.name}?`,
                        confirmLabel: 'Sí, eliminar',
                        danger: true,
                        onConfirm: () => removeStudentAssessment(assessment),
                      })}
                      className="rounded-lg p-2 text-rose-300"
                    >
                      <Trash2 size={20} />
                    </button>
                  )}
                </div>
              </article>
            ))}
            {!assessments.length && (
              <p className="rounded-2xl border border-dashed border-slate-600 p-5 text-center text-slate-300">
                Todavía no hay evaluaciones cargadas.
              </p>
            )}
          </div>
        </FormModal>
      )}
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
