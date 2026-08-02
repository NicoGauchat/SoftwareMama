import { useCallback, useEffect, useState } from 'react'
import { Mail, Pencil, Phone, Plus, Save, Trash2 } from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog'
import FormModal from '../components/FormModal'
import { BigButton, Field, PageTitle } from '../components/ui'
import { createTeacher, deleteTeacher, getTeachers, updateTeacher } from '../services/api'
import { Empty } from './TodayView'

const empty = { name: '', school: '', phoneNumber: '', email: '' }

export default function TeachersView() {
  const [teachers, setTeachers] = useState([])
  const [form, setForm] = useState(empty)
  const [open, setOpen] = useState(false)
  const [id, setId] = useState(null)
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState(null)

  const load = useCallback(async () => {
    try {
      setTeachers(await getTeachers())
      setError('')
    } catch {
      setError('No pude cargar las maestras.')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    try {
      if (id) await updateTeacher(id, form)
      else await createTeacher(form)
      setOpen(false)
      setForm(empty)
      setId(null)
      await load()
    } catch {
      setError('No pude guardar a la maestra.')
    } finally {
      setDialog(null)
    }
  }

  return (
    <section>
      <PageTitle eyebrow="Contactos útiles">Maestras</PageTitle>
      {error && <Notice text={error} close={() => setError('')} />}
      <BigButton
        onClick={() => { setForm(empty); setId(null); setOpen(true) }}
        className="mt-7 w-full bg-indigo-500 text-white"
      >
        <Plus /> Agregar Maestra
      </BigButton>

      {open && (
        <FormModal title={id ? 'Editar maestra' : 'Agregar maestra'} onClose={() => setOpen(false)}>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              setDialog({
                title: 'Guardar maestra',
                message: '¿Seguro que querés guardar esta información?',
                confirmLabel: 'Sí, guardar',
                onConfirm: save,
              })
            }}
            className="grid gap-4 sm:grid-cols-2"
          >
            <Field label="Nombre" name="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            <Field label="Escuela" name="school" value={form.school} onChange={(event) => setForm({ ...form, school: event.target.value })} />
            <Field label="Teléfono" name="phoneNumber" value={form.phoneNumber} onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })} />
            <Field label="Mail" name="email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            <BigButton className="bg-emerald-500 text-emerald-950 sm:col-span-2"><Save /> Guardar</BigButton>
          </form>
        </FormModal>
      )}

      <div className="mt-6 space-y-4">
        {teachers.map((teacher) => (
          <article key={teacher.id} className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-2xl font-bold text-white">{teacher.name}</h2>
            <p className="mt-1 text-lg text-slate-300">{teacher.school || 'Escuela sin cargar'}</p>
            <div className="mt-5 space-y-3 text-lg font-bold text-indigo-200">
              <p className="flex items-center gap-2"><Phone /> {teacher.phoneNumber || 'Sin teléfono'}</p>
              <p className="flex items-center gap-2"><Mail /> {teacher.email || 'Sin mail'}</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-5">
              <button
                onClick={() => { setForm(teacher); setId(teacher.id); setOpen(true) }}
                className="text-lg font-bold text-indigo-300"
              >
                <Pencil className="inline" /> Editar
              </button>
              <button
                onClick={() => setDialog({
                  title: 'Eliminar maestra',
                  message: `¿Seguro que querés eliminar a ${teacher.name}?`,
                  confirmLabel: 'Sí, eliminar',
                  danger: true,
                  onConfirm: async () => {
                    try {
                      await deleteTeacher(teacher.id)
                      await load()
                    } catch {
                      setError('No pude eliminar la maestra.')
                    } finally {
                      setDialog(null)
                    }
                  },
                })}
                className="text-lg font-bold text-rose-300"
              >
                <Trash2 className="inline" /> Eliminar
              </button>
            </div>
          </article>
        ))}
        {!teachers.length && <Empty>Agregá las maestras importantes para tenerlas a mano.</Empty>}
      </div>
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </section>
  )
}

function Notice({ text, close }) {
  return (
    <div className="mt-5 rounded-2xl border border-rose-400/50 bg-rose-500/10 p-5 text-lg text-rose-100">
      {text}<button onClick={close} className="ml-3 font-bold underline">Cerrar</button>
    </div>
  )
}
