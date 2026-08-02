import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarCheck2,
  CheckCircle2,
  Download,
  DollarSign,
  MessageCircle,
  Pencil,
  Undo2,
  UserRoundCheck,
  UsersRound,
  WalletCards,
} from 'lucide-react'
import { BigButton, Field, PageTitle } from '../components/ui'
import ConfirmDialog from '../components/ConfirmDialog'
import FormModal from '../components/FormModal'
import {
  getLessons,
  getStudents,
  registerBatchPayment,
  registerLessonPayment,
  resetLessonPayment,
} from '../services/api'
import {
  exportMonthlyReport,
  exportStudentMonthlyReport,
} from '../services/exportMonthlyReport'
import {
  monthlyWhatsappMessage,
  openWhatsappSummary,
  whatsappContactsFor,
} from '../services/whatsapp'
import { Empty } from './TodayView'

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const NOW = new Date()
const monthDates = (year, month) => Array.from(
  { length: new Date(year, month + 1, 0).getDate() },
  (_, index) => new Date(year, month, index + 1).toISOString().slice(0, 10),
)
const money = (value) => `$${Number(value || 0).toLocaleString('es-AR')}`
const paymentMethodLabel = (value) => ({
  cash: 'Efectivo',
  transfer: 'Transferencia',
  mixed: 'Mixto',
}[value] || 'Sin especificar')
const paidFor = (lesson) => Number(
  lesson.paidAmount ?? (lesson.paymentStatus === 'paid' ? lesson.amount : 0),
)
const balanceFor = (lesson) => Math.max(0, Number(lesson.amount || 0) - paidFor(lesson))

export default function MonthlyView() {
  const [price, setPrice] = useState(() => localStorage.getItem('hourlyPrice') || '0')
  const [draftPrice, setDraftPrice] = useState(price)
  const [month, setMonth] = useState(NOW.getMonth())
  const [year, setYear] = useState(NOW.getFullYear())
  const [students, setStudents] = useState([])
  const [lessons, setLessons] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('due')
  const [selectedId, setSelectedId] = useState('')
  const [priceModal, setPriceModal] = useState(false)
  const [paymentModal, setPaymentModal] = useState(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentError, setPaymentError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportingStudentId, setExportingStudentId] = useState('')
  const [exportSuccess, setExportSuccess] = useState('')
  const [whatsappModal, setWhatsappModal] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [notice, setNotice] = useState('')

  const dates = useMemo(() => monthDates(year, month), [year, month])
  const load = useCallback(async () => {
    try {
      const [people, ...items] = await Promise.all([
        getStudents(),
        ...dates.map(getLessons),
      ])
      setStudents(people)
      setLessons(items.flat())
      setNotice('')
    } catch {
      setNotice('No pude cargar el resumen mensual.')
    }
  }, [dates])
  useEffect(() => { load() }, [load])

  const billableLessons = lessons.filter(
    (lesson) => (
      lesson.status === 'completed'
      && ['present', 'absent_unexcused'].includes(lesson.attendance)
    ),
  )
  const accounts = students
    .map((student) => {
      const items = billableLessons
        .filter((lesson) => lesson.studentId === student.id)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
      const total = items.reduce((sum, lesson) => sum + Number(lesson.amount || 0), 0)
      const paid = items.reduce((sum, lesson) => sum + paidFor(lesson), 0)
      return {
        student,
        lessons: items,
        total,
        paid,
        due: Math.max(0, total - paid),
      }
    })
    .filter((account) => account.lessons.length)
  const visibleAccounts = accounts.filter((account) => (
    account.student.name.toLowerCase().includes(search.toLowerCase())
    && (
      filter === 'all'
      || (filter === 'due' && account.due > 0)
      || (filter === 'paid' && account.due <= 0)
    )
  ))
  const selected = accounts.find((account) => account.student.id === selectedId)

  const totalBilled = accounts.reduce((sum, account) => sum + account.total, 0)
  const totalPaid = accounts.reduce((sum, account) => sum + account.paid, 0)
  const totalDue = accounts.reduce((sum, account) => sum + account.due, 0)
  const completedLessons = lessons.filter((lesson) => lesson.status === 'completed')
  const attendedLessons = completedLessons.filter(
    (lesson) => lesson.attendance === 'present',
  ).length
  const absentLessons = completedLessons.filter(
    (lesson) => lesson.attendance !== 'present',
  ).length
  const attendanceRate = completedLessons.length
    ? attendedLessons / completedLessons.length
    : 0
  const studentsWithDebt = accounts.filter((account) => account.due > 0).length
  const averagePerClass = billableLessons.length ? totalBilled / billableLessons.length : 0

  const savePrice = () => {
    localStorage.setItem('hourlyPrice', String(Number(draftPrice)))
    setPrice(String(Number(draftPrice)))
    setPriceModal(false)
    setDialog(null)
  }
  const openLessonPayment = (lesson) => {
    setPaymentError('')
    setPaymentMethod('')
    setPaymentAmount(String(balanceFor(lesson)))
    setPaymentModal({ type: 'lesson', lesson })
  }
  const openAccountPayment = (account, full = false) => {
    setPaymentError('')
    setPaymentMethod('')
    setPaymentAmount(String(full ? account.due : ''))
    setPaymentModal({ type: 'account', account })
  }
  const submitPayment = (event) => {
    event.preventDefault()
    const amount = Number(paymentAmount)
    const balance = paymentModal.type === 'lesson'
      ? balanceFor(paymentModal.lesson)
      : paymentModal.account.due
    if (!paymentMethod) {
      setPaymentError('Elegí si pagó en efectivo o por transferencia.')
      return
    }
    if (amount <= 0 || amount > balance) {
      setPaymentError(`El pago debe ser mayor a $0 y no superar ${money(balance)}.`)
      return
    }
    setPaymentError('')
    setDialog({
      title: 'Registrar pago',
      message: `¿Seguro que querés registrar un pago de ${money(amount)}?`,
      confirmLabel: 'Sí, registrar pago',
      onConfirm: applyPayment,
    })
  }
  const applyPayment = async () => {
    try {
      const amount = Number(paymentAmount)
      if (paymentModal.type === 'lesson') {
        await registerLessonPayment(paymentModal.lesson.id, amount, paymentMethod)
      } else {
        const ids = paymentModal.account.lessons
          .filter((lesson) => balanceFor(lesson) > 0)
          .map((lesson) => lesson.id)
        await registerBatchPayment(ids, amount, paymentMethod)
      }
      setDialog(null)
      setPaymentModal(null)
      setPaymentAmount('')
      setPaymentMethod('')
      setPaymentError('')
      load()
    } catch (error) {
      setDialog(null)
      setPaymentError(
        error.message || 'No pude registrar el pago. Revisá que el servidor esté encendido.',
      )
    }
  }
  const resetPayment = async (lesson) => {
    try {
      await resetLessonPayment(lesson.id)
      setDialog(null)
      load()
    } catch {
      setDialog(null)
      setNotice('No pude cancelar ese pago.')
    }
  }
  const downloadReport = async () => {
    try {
      setExporting(true)
      setNotice('')
      setExportSuccess('')
      await exportMonthlyReport({
        monthName: MONTHS[month],
        year,
        accounts,
        lessons,
        metrics: {
          totalBilled,
          totalPaid,
          totalDue,
          attendedLessons,
          absentLessons,
          attendanceRate,
          studentsWithDebt,
          averagePerClass,
        },
      })
      setExportSuccess(`Listo. Se descargó el Excel de ${MONTHS[month]} ${year}.`)
    } catch (error) {
      console.error('Excel export failed', error)
      setNotice('No pude crear el archivo de Excel. Intentá nuevamente.')
    } finally {
      setExporting(false)
    }
  }
  const downloadStudentReport = async (account) => {
    try {
      setExportingStudentId(account.student.id)
      setNotice('')
      setExportSuccess('')
      await exportStudentMonthlyReport({
        monthName: MONTHS[month],
        year,
        account,
        lessons,
      })
      setExportSuccess(
        `Listo. Se descargó el resumen de ${account.student.name} de ${MONTHS[month]} ${year}.`,
      )
    } catch (error) {
      console.error('Student Excel export failed', error)
      setNotice('No pude crear el Excel de este alumno. Intentá nuevamente.')
    } finally {
      setExportingStudentId('')
    }
  }
  const chooseWhatsappContact = (account) => {
    const contacts = whatsappContactsFor(account.student)
    if (!contacts.length) {
      setNotice(
        `No hay teléfonos cargados para ${account.student.name} ni para sus tutores.`,
      )
      return
    }
    setNotice('')
    setWhatsappModal({ account, contacts })
  }
  const sendWhatsappSummary = (contact) => {
    try {
      openWhatsappSummary({
        phone: contact.phone,
        message: monthlyWhatsappMessage({
          monthName: MONTHS[month],
          year,
          account: whatsappModal.account,
        }),
      })
      setWhatsappModal(null)
    } catch (error) {
      setWhatsappModal(null)
      setNotice(error.message || 'No pude abrir WhatsApp para este contacto.')
    }
  }
  return (
    <section>
      <PageTitle eyebrow="Cuenta corriente simple y clara">Resumen Mensual</PageTitle>
      {notice && <Notice text={notice} close={() => setNotice('')} />}

      <div className="mt-7 rounded-3xl border border-slate-700 bg-slate-900 p-6">
        <p className="text-lg font-semibold text-slate-300">Precio por hora actual</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <p className="text-4xl font-bold text-white">{money(price)}</p>
          <button
            onClick={() => { setDraftPrice(price); setPriceModal(true) }}
            className="flex min-h-14 items-center gap-2 rounded-xl bg-indigo-500 px-5 text-lg font-bold text-white"
          >
            <Pencil /> Editar precio
          </button>
        </div>
        <p className="mt-3 text-lg text-slate-400">
          Las clases ya creadas conservan su precio.
        </p>
      </div>

      {priceModal && (
        <FormModal title="Editar precio por hora" onClose={() => setPriceModal(false)}>
          <form onSubmit={(event) => {
            event.preventDefault()
            setDialog({
              title: 'Guardar precio',
              message: `¿Seguro que querés cambiar el precio a ${money(draftPrice)}?`,
              confirmLabel: 'Sí, guardar precio',
              onConfirm: savePrice,
            })
          }}>
            <Field
              label="Nuevo precio"
              type="number"
              min="1"
              value={draftPrice}
              onChange={(event) => setDraftPrice(event.target.value)}
              required
            />
            <BigButton className="mt-5 w-full bg-emerald-500 text-emerald-950">
              Guardar precio
            </BigButton>
          </form>
        </FormModal>
      )}

      {paymentModal && (
        <FormModal
          title={paymentModal.type === 'lesson'
            ? 'Cobrar esta clase'
            : `Registrar pago de ${paymentModal.account.student.name}`}
          onClose={() => { setPaymentModal(null); setPaymentError(''); setPaymentMethod('') }}
        >
          <form onSubmit={submitPayment}>
            <p className="mb-5 text-lg text-slate-300">
              Saldo disponible:{' '}
              <strong className="text-white">
                {money(paymentModal.type === 'lesson'
                  ? balanceFor(paymentModal.lesson)
                  : paymentModal.account.due)}
              </strong>
            </p>
            <Field
              label="Monto que pagó"
              type="number"
              min="1"
              value={paymentAmount}
              onChange={(event) => {
                setPaymentAmount(event.target.value)
                setPaymentError('')
              }}
              placeholder="Ejemplo: 7500"
              required
            />
            <div className="mt-4">
              <Field
                as="select"
                label="¿Cómo pagó?"
                value={paymentMethod}
                onChange={(event) => {
                  setPaymentMethod(event.target.value)
                  setPaymentError('')
                }}
                required
              >
                <option value="">Elegí una opción</option>
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
              </Field>
            </div>
            {paymentError && (
              <div
                role="alert"
                className="mt-4 rounded-2xl border border-rose-400/50 bg-rose-500/15 p-4 text-lg font-semibold text-rose-100"
              >
                {paymentError}
              </div>
            )}
            <BigButton className="mt-5 w-full bg-emerald-500 text-emerald-950">
              <WalletCards /> Registrar pago
            </BigButton>
          </form>
        </FormModal>
      )}

      {whatsappModal && (
        <FormModal
          title={`Enviar resumen de ${whatsappModal.account.student.name}`}
          onClose={() => setWhatsappModal(null)}
        >
          <p className="text-lg text-slate-300">
            Elegí a quién querés enviarle el resumen de {MONTHS[month]} {year}.
          </p>
          <div className="mt-5 space-y-3">
            {whatsappModal.contacts.map((contact) => (
              <button
                key={contact.id}
                type="button"
                onClick={() => sendWhatsappSummary(contact)}
                className="flex min-h-16 w-full items-center gap-4 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-left"
              >
                <MessageCircle className="shrink-0 text-emerald-300" />
                <span>
                  <strong className="block text-xl text-white">{contact.name}</strong>
                  <span className="text-base text-slate-300">
                    {contact.detail} · {contact.phone}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <p className="mt-5 text-base text-slate-400">
            Se abrirá WhatsApp con el mensaje listo para revisar y enviar.
          </p>
        </FormModal>
      )}

      <div className="mt-5 grid gap-4 rounded-3xl border border-slate-700 bg-slate-900 p-6 sm:grid-cols-2">
        <Select
          label="Mes"
          value={month}
          onChange={(value) => { setMonth(Number(value)); setSelectedId('') }}
        >
          {MONTHS.map((name, index) => <option key={name} value={index}>{name}</option>)}
        </Select>
        <Select
          label="Año"
          value={year}
          onChange={(value) => { setYear(Number(value)); setSelectedId('') }}
        >
          {Array.from({ length: 8 }, (_, index) => NOW.getFullYear() - index)
            .map((item) => <option key={item}>{item}</option>)}
        </Select>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <Metric label="Total del mes" value={totalBilled} color="text-indigo-300" />
        <Metric label="Ya cobrado" value={totalPaid} color="text-emerald-300" />
        <Metric label="Falta cobrar" value={totalDue} color="text-orange-300" />
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CountMetric icon={CalendarCheck2} label="Clases dadas" value={attendedLessons} />
        <CountMetric
          icon={UserRoundCheck}
          label="Asistencia"
          value={`${Math.round(attendanceRate * 100)}%`}
        />
        <CountMetric icon={UsersRound} label="Alumnos que deben" value={studentsWithDebt} />
        <CountMetric icon={DollarSign} label="Promedio por clase" value={money(averagePerClass)} />
      </div>
      <BigButton
        onClick={downloadReport}
        disabled={exporting || !completedLessons.length}
        className="mt-5 w-full bg-emerald-500 text-emerald-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
      >
        <Download />
        {exporting ? 'Preparando Excel...' : `Exportar ${MONTHS[month]} a Excel`}
      </BigButton>
      {exportSuccess && (
        <div
          role="status"
          className="mt-3 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4 text-lg font-semibold text-emerald-100"
        >
          {exportSuccess}
        </div>
      )}

      <section className="mt-7">
        <h2 className="text-3xl font-bold text-white">¿Quién pagó y quién debe?</h2>
        <div className="mt-4">
          <Field
            label="Buscar alumno"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Escribí un nombre"
          />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[['due', 'Deben'], ['paid', 'Pagaron'], ['all', 'Todos']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`min-h-14 rounded-xl text-lg font-bold ${
                filter === id
                  ? 'bg-indigo-500 text-white'
                  : 'bg-slate-800 text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {visibleAccounts.map((account) => (
            <button
              key={account.student.id}
              onClick={() => setSelectedId(account.student.id)}
              className={`rounded-3xl border p-6 text-left ${
                selectedId === account.student.id
                  ? 'border-indigo-400 bg-indigo-500/10'
                  : 'border-slate-700 bg-slate-900'
              }`}
            >
              <h3 className="text-2xl font-bold text-white">{account.student.name}</h3>
              <p className="mt-3 text-lg text-emerald-300">Pagó: {money(account.paid)}</p>
              <p className="text-xl font-bold text-orange-300">Debe: {money(account.due)}</p>
              <p className="mt-2 text-lg text-slate-400">{account.lessons.length} clases</p>
            </button>
          ))}
          {!visibleAccounts.length && <Empty>No hay alumnos en este filtro.</Empty>}
        </div>
      </section>

      {selected && (
        <section className="mt-8 rounded-3xl border border-indigo-500/30 bg-indigo-500/5 p-6">
          <h2 className="text-3xl font-bold text-white">
            Cuenta de {selected.student.name}
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <SmallMetric label="Clases" value={selected.total} />
            <SmallMetric label="Pagó" value={selected.paid} />
            <SmallMetric label="Debe" value={selected.due} />
          </div>
          {selected.due > 0 && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <BigButton
                onClick={() => openAccountPayment(selected)}
                className="bg-indigo-500 text-white"
              >
                <DollarSign /> Registrar un monto
              </BigButton>
              <BigButton
                onClick={() => openAccountPayment(selected, true)}
                className="bg-emerald-500 text-emerald-950"
              >
                <CheckCircle2 /> Pagar toda la deuda
              </BigButton>
            </div>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <BigButton
              onClick={() => downloadStudentReport(selected)}
              disabled={exportingStudentId === selected.student.id}
              className="bg-slate-700 text-white disabled:cursor-not-allowed disabled:text-slate-400"
            >
              <Download />
              {exportingStudentId === selected.student.id
                ? 'Preparando Excel...'
                : 'Descargar Excel del alumno'}
            </BigButton>
            <BigButton
              onClick={() => chooseWhatsappContact(selected)}
              className="bg-emerald-500 text-emerald-950"
            >
              <MessageCircle /> Enviar por WhatsApp
            </BigButton>
          </div>
          <div className="mt-6 space-y-4">
            {selected.lessons.map((lesson) => {
              const paid = paidFor(lesson)
              const balance = balanceFor(lesson)
              return (
                <article
                  key={lesson.id}
                  className="rounded-2xl border border-slate-700 bg-slate-900 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xl font-bold text-white">
                        {new Date(lesson.date).toLocaleDateString('es-AR', {
                          day: 'numeric',
                          month: 'long',
                        })}
                      </p>
                      <p className="mt-1 text-lg text-slate-300">
                        Clase: {money(lesson.amount)} · Pagó: {money(paid)}
                      </p>
                      {paid > 0 && (
                        <p className="mt-1 text-lg text-slate-300">
                          Medio: {paymentMethodLabel(lesson.paymentMethod)}
                        </p>
                      )}
                      <p className={`mt-1 text-lg font-bold ${
                        balance > 0 ? 'text-orange-300' : 'text-emerald-300'
                      }`}>
                        {balance > 0 ? `Falta: ${money(balance)}` : 'Pagada completa'}
                      </p>
                    </div>
                    {balance > 0 && (
                      <button
                        onClick={() => openLessonPayment(lesson)}
                        className="min-h-12 rounded-xl bg-indigo-500 px-4 text-lg font-bold text-white"
                      >
                        Registrar pago
                      </button>
                    )}
                  </div>
                  {paid > 0 && (
                    <button
                      onClick={() => setDialog({
                        title: 'Cancelar pago',
                        message: '¿Seguro que querés cancelar el pago registrado para esta clase? Volverá a figurar como deuda.',
                        confirmLabel: 'Sí, cancelar pago',
                        danger: true,
                        onConfirm: () => resetPayment(lesson),
                      })}
                      className="mt-4 text-lg font-bold text-rose-300"
                    >
                      <Undo2 className="inline" /> Cancelar pago
                    </button>
                  )}
                </article>
              )
            })}
          </div>
        </section>
      )}
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </section>
  )
}

function Metric({ label, value, color }) {
  return (
    <article className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
      <DollarSign className={color} size={30} />
      <p className="mt-4 text-lg text-slate-300">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${color}`}>{money(value)}</p>
    </article>
  )
}

function CountMetric({ icon: Icon, label, value }) {
  return (
    <article className="rounded-3xl border border-slate-700 bg-slate-900 p-5">
      <Icon className="text-indigo-300" size={28} />
      <p className="mt-3 text-lg text-slate-300">{label}</p>
      <p className="mt-1 text-3xl font-bold text-white">{value}</p>
    </article>
  )
}

function SmallMetric({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-900 p-4">
      <p className="text-lg text-slate-400">{label}</p>
      <p className="text-2xl font-bold text-white">{money(value)}</p>
    </div>
  )
}

function Select({ label, value, onChange, children }) {
  return (
    <label className="text-lg font-semibold text-slate-200">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-14 w-full rounded-xl border border-slate-600 bg-slate-800 px-4 text-xl text-white"
      >
        {children}
      </select>
    </label>
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
