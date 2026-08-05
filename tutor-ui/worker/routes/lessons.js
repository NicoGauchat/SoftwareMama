import { requestDb, statement } from '../db.js'
import { dbError, isDate, isDateTime, isUuid, jsonBody, lessonFromRow, notFound, number, text, uuid } from '../helpers.js'
import { currentHourlyPrice } from './settings.js'

const lessonColumns = `id,student_id,date,real_duration_minutes,status,attendance,payment_status,amount,hourly_rate,paid_amount,payment_method,cash_paid_amount,transfer_paid_amount,topic_notes,version`
const lessonSelect = `SELECT ${lessonColumns} FROM lessons`
const validAttendance = new Set(['present', 'absent_excused', 'absent_unexcused'])
const validPaymentMethod = new Set(['cash', 'transfer'])
const argentinaOffset = '-03:00'

const dayStart = (date) => new Date(`${date}T00:00:00${argentinaOffset}`).toISOString()
const nextDay = (date) => {
  const value = new Date(`${date}T00:00:00${argentinaOffset}`)
  value.setUTCDate(value.getUTCDate() + 1)
  return value.toISOString()
}

async function findLesson(db, id) {
  const result = await db.execute(statement(`${lessonSelect} WHERE id=?`, [id]))
  return result.rows[0] ? lessonFromRow(result.rows[0]) : null
}

async function saveLesson(db, lesson) {
  const result = await db.execute(statement(`UPDATE lessons SET date=?,real_duration_minutes=?,status=?,attendance=?,payment_status=?,amount=?,hourly_rate=?,paid_amount=?,payment_method=?,cash_paid_amount=?,transfer_paid_amount=?,topic_notes=?,version=version+1 WHERE id=? AND version=? RETURNING ${lessonColumns}`,
    [lesson.date, lesson.realDurationMinutes, lesson.status, lesson.attendance, lesson.paymentStatus, lesson.amount, lesson.hourlyRate, lesson.paidAmount, lesson.paymentMethod, lesson.cashPaidAmount, lesson.transferPaidAmount, lesson.topicNotes, lesson.id, lesson.version]))
  return result.rows[0] ? lessonFromRow(result.rows[0]) : null
}

const changedElsewhere = (c) => c.json({ error: 'Ese turno cambió mientras lo estabas editando. Actualizá la pantalla e intentá nuevamente.' }, 409)

function chargeable(lesson) {
  return lesson.status === 'completed' && (lesson.attendance === 'present' || lesson.attendance === 'absent_unexcused')
}

function applyPayment(lesson, amount, method) {
  if (lesson.paidAmount > 0 && lesson.paymentMethod && lesson.paymentMethod !== method) lesson.paymentMethod = 'mixed'
  else lesson.paymentMethod = method
  lesson.paidAmount += amount
  if (method === 'cash') lesson.cashPaidAmount += amount
  if (method === 'transfer') lesson.transferPaidAmount += amount
  if (lesson.paidAmount + 0.001 >= lesson.amount) {
    lesson.paidAmount = lesson.amount
    lesson.paymentStatus = 'paid'
  } else lesson.paymentStatus = 'pending'
}

function preservePartialPayment(lesson, previousPayment) {
  const paidAmount = Math.min(previousPayment.paidAmount, lesson.amount)
  const factor = previousPayment.paidAmount > 0
    ? paidAmount / previousPayment.paidAmount
    : 0
  lesson.paidAmount = paidAmount
  lesson.paymentMethod = previousPayment.paymentMethod
  lesson.cashPaidAmount = previousPayment.cashPaidAmount * factor
  lesson.transferPaidAmount = previousPayment.transferPaidAmount * factor
  lesson.paymentStatus = paidAmount + 0.001 >= lesson.amount ? 'paid' : 'pending'
}

export function registerLessonRoutes(app) {
  app.get('/api/v1/lessons', async (c) => {
    const date = c.req.query('date')
    if (!isDate(date)) return c.json({ error: 'La fecha debe usar YYYY-MM-DD.' }, 400)
    try {
      const result = await requestDb(c).execute(statement(`${lessonSelect} WHERE date>=? AND date<? ORDER BY date`, [dayStart(date), nextDay(date)]))
      return c.json(result.rows.map(lessonFromRow))
    } catch (error) { return dbError(c, error) }
  })

  app.get('/api/v1/lessons/range', async (c) => {
    const from = c.req.query('from')
    const to = c.req.query('to')
    if (!isDate(from) || !isDate(to)) return c.json({ error: 'Las fechas deben usar YYYY-MM-DD.' }, 400)
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000
    if (days < 0 || days > 370) return c.json({ error: 'El rango debe cubrir como máximo 12 meses.' }, 400)
    try {
      const result = await requestDb(c).execute(statement(`${lessonSelect} WHERE date>=? AND date<? ORDER BY date`, [dayStart(from), nextDay(to)]))
      return c.json(result.rows.map(lessonFromRow))
    } catch (error) { return dbError(c, error) }
  })

  app.post('/api/v1/lessons', async (c) => {
    const body = await jsonBody(c)
    const studentId = text(body?.studentId)
    if (!isUuid(studentId) || !isDateTime(body?.date)) return c.json({ error: 'El alumno y la fecha son obligatorios.' }, 400)
    const date = new Date(body.date).toISOString()
    const duration = number(body.durationMinutes) > 0 ? Math.round(number(body.durationMinutes)) : 60
    try {
      const db = requestDb(c)
      const [studentResult, duplicateResult] = await db.batch([
        statement(`SELECT id,is_active,hourly_rate FROM students WHERE id=?`, [studentId]),
        statement(`SELECT id FROM lessons WHERE student_id=? AND date=? AND status<>'cancelled' LIMIT 1`, [studentId, date]),
      ], 'read')
      if (!studentResult.rows[0]) return notFound(c, 'Alumno')
      if (!studentResult.rows[0].is_active) return c.json({ error: 'No se pueden agregar turnos a un alumno inactivo.' }, 409)
      if (duplicateResult.rows.length) return c.json({ error: 'El alumno ya tiene un turno en ese horario.' }, 409)
      const lesson = {
        id: uuid(), studentId, date, realDurationMinutes: duration, status: 'scheduled', attendance: 'present',
        paymentStatus: 'pending', amount: 0, hourlyRate: await currentHourlyPrice(db),
        paidAmount: 0, paymentMethod: '', cashPaidAmount: 0, transferPaidAmount: 0, topicNotes: '', version: 0,
      }
      await db.execute(statement(`INSERT INTO lessons (id,student_id,date,real_duration_minutes,status,attendance,payment_status,amount,hourly_rate,paid_amount,payment_method,cash_paid_amount,transfer_paid_amount,topic_notes,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [lesson.id, lesson.studentId, lesson.date, lesson.realDurationMinutes, lesson.status, lesson.attendance, lesson.paymentStatus, lesson.amount, lesson.hourlyRate, lesson.paidAmount, lesson.paymentMethod, lesson.cashPaidAmount, lesson.transferPaidAmount, lesson.topicNotes, lesson.version]))
      return c.json(lesson, 201)
    } catch (error) { return dbError(c, error) }
  })

  app.patch('/api/v1/lessons/:id/complete', async (c) => {
    const id = c.req.param('id')
    if (!isUuid(id)) return c.json({ error: 'ID de turno inválido.' }, 400)
    const body = await jsonBody(c)
    const duration = Math.round(number(body?.realDurationMinutes))
    const attendance = text(body?.attendance)
    const requestedStatus = text(body?.paymentStatus)
    const paymentMethod = text(body?.paymentMethod)
    if (duration <= 0 || !validAttendance.has(attendance) || !['paid', 'pending'].includes(requestedStatus)) return c.json({ error: 'Los datos del turno no son válidos.' }, 400)
    if (attendance === 'present' && requestedStatus === 'paid' && !validPaymentMethod.has(paymentMethod)) return c.json({ error: 'Elegí efectivo o transferencia.' }, 400)
    try {
      const db = requestDb(c)
      const lesson = await findLesson(db, id)
      if (!lesson) return notFound(c, 'Turno')
      if (!['scheduled', 'completed'].includes(lesson.status)) return c.json({ error: 'Ese turno no se puede completar.' }, 409)
      const studentResult = await db.execute(statement(`SELECT hourly_rate,is_active FROM students WHERE id=?`, [lesson.studentId]))
      const student = studentResult.rows[0]
      if (!student?.is_active) return c.json({ error: 'El alumno está inactivo.' }, 409)
      const previousPayment = {
        paymentStatus: lesson.paymentStatus,
        paidAmount: lesson.paidAmount,
        paymentMethod: lesson.paymentMethod,
        cashPaidAmount: lesson.cashPaidAmount,
        transferPaidAmount: lesson.transferPaidAmount,
      }
      lesson.status = 'completed'
      lesson.realDurationMinutes = duration
      lesson.attendance = attendance
      lesson.paymentStatus = requestedStatus
      lesson.topicNotes = text(body.topicNotes)
      if (attendance === 'absent_excused') {
        Object.assign(lesson, { amount: 0, paidAmount: 0, paymentMethod: '', cashPaidAmount: 0, transferPaidAmount: 0, paymentStatus: 'pending' })
      } else {
        const rate = lesson.hourlyRate > 0 ? lesson.hourlyRate : Number(student.hourly_rate)
        lesson.amount = rate * duration / 60
        if (attendance === 'present' && requestedStatus === 'paid') {
          lesson.paidAmount = lesson.amount
          lesson.paymentMethod = paymentMethod
          lesson.cashPaidAmount = paymentMethod === 'cash' ? lesson.amount : 0
          lesson.transferPaidAmount = paymentMethod === 'transfer' ? lesson.amount : 0
      } else if (previousPayment.paidAmount > 0) {
        preservePartialPayment(lesson, previousPayment)
      } else Object.assign(lesson, { paidAmount: 0, paymentMethod: '', cashPaidAmount: 0, transferPaidAmount: 0, paymentStatus: 'pending' })
      }
      const saved = await saveLesson(db, lesson)
      return saved ? c.json(saved) : changedElsewhere(c)
    } catch (error) { return dbError(c, error) }
  })

  app.patch('/api/v1/lessons/:id/prepay', async (c) => {
    const id = c.req.param('id')
    const body = await jsonBody(c)
    const method = text(body?.paymentMethod)
    if (!isUuid(id) || !validPaymentMethod.has(method)) return c.json({ error: 'Elegí efectivo o transferencia.' }, 400)
    try {
      const db = requestDb(c)
      const lesson = await findLesson(db, id)
      if (!lesson) return notFound(c, 'Turno')
      if (lesson.status !== 'scheduled' || new Date(lesson.date) <= new Date()) {
        return c.json({ error: 'Sólo se pueden cobrar por adelantado los turnos futuros.' }, 409)
      }
      if (lesson.paidAmount > 0) return c.json({ error: 'Ese turno ya tiene un pago registrado.' }, 409)
      lesson.amount = lesson.hourlyRate * lesson.realDurationMinutes / 60
      if (lesson.amount <= 0) return c.json({ error: 'El turno no tiene un precio válido.' }, 409)
      applyPayment(lesson, lesson.amount, method)
      const saved = await saveLesson(db, lesson)
      return saved ? c.json(saved) : changedElsewhere(c)
    } catch (error) { return dbError(c, error) }
  })

  app.patch('/api/v1/lessons/:id/rate', async (c) => {
    const id = c.req.param('id')
    const body = await jsonBody(c)
    const hourlyRate = number(body?.hourlyRate)
    if (!isUuid(id) || hourlyRate <= 0) return c.json({ error: 'El precio por hora debe ser mayor a cero.' }, 400)
    try {
      const db = requestDb(c)
      const lesson = await findLesson(db, id)
      if (!lesson) return notFound(c, 'Turno')
      if (lesson.status === 'cancelled') return c.json({ error: 'No se puede corregir el precio de un turno cancelado.' }, 409)

      const previousPayment = {
        paidAmount: lesson.paidAmount,
        paymentMethod: lesson.paymentMethod,
        cashPaidAmount: lesson.cashPaidAmount,
        transferPaidAmount: lesson.transferPaidAmount,
      }
      lesson.hourlyRate = hourlyRate
      if (chargeable(lesson)) {
        lesson.amount = hourlyRate * lesson.realDurationMinutes / 60
        preservePartialPayment(lesson, previousPayment)
      } else if (lesson.status === 'completed') {
        Object.assign(lesson, { amount: 0, paidAmount: 0, paymentMethod: '', cashPaidAmount: 0, transferPaidAmount: 0, paymentStatus: 'pending' })
      }

      const saved = await saveLesson(db, lesson)
      return saved ? c.json(saved) : changedElsewhere(c)
    } catch (error) { return dbError(c, error) }
  })

  app.patch('/api/v1/lessons/:id/reschedule', async (c) => {
    const id = c.req.param('id')
    const body = await jsonBody(c)
    if (!isUuid(id) || !isDateTime(body?.date)) return c.json({ error: 'El turno o la fecha no son válidos.' }, 400)
    try {
      const db = requestDb(c)
      const lesson = await findLesson(db, id)
      if (!lesson) return notFound(c, 'Turno')
      if (lesson.status !== 'scheduled') return c.json({ error: 'Solo se puede mover un turno pendiente.' }, 409)
      lesson.date = new Date(body.date).toISOString()
      const saved = await saveLesson(db, lesson)
      return saved ? c.json(saved) : changedElsewhere(c)
    } catch (error) { return dbError(c, error) }
  })

  app.patch('/api/v1/lessons/:id/cancel', async (c) => {
    const id = c.req.param('id')
    if (!isUuid(id)) return c.json({ error: 'ID de turno inválido.' }, 400)
    try {
      const db = requestDb(c)
      const lesson = await findLesson(db, id)
      if (!lesson) return notFound(c, 'Turno')
      if (lesson.status !== 'scheduled') return c.json({ error: 'Solo se puede cancelar un turno pendiente.' }, 409)
      lesson.status = 'cancelled'
      const saved = await saveLesson(db, lesson)
      return saved ? c.json(saved) : changedElsewhere(c)
    } catch (error) { return dbError(c, error) }
  })

  app.patch('/api/v1/lessons/:id/reopen', async (c) => {
    const id = c.req.param('id')
    if (!isUuid(id)) return c.json({ error: 'ID de turno inválido.' }, 400)
    try {
      const db = requestDb(c)
      const lesson = await findLesson(db, id)
      if (!lesson) return notFound(c, 'Turno')
      if (lesson.status !== 'completed') return c.json({ error: 'Solo se puede reabrir un turno completado.' }, 409)
      lesson.status = 'scheduled'
      const saved = await saveLesson(db, lesson)
      return saved ? c.json(saved) : changedElsewhere(c)
    } catch (error) { return dbError(c, error) }
  })

  app.patch('/api/v1/lessons/:id/payment', async (c) => {
    const id = c.req.param('id')
    const body = await jsonBody(c)
    const amount = number(body?.amount)
    const method = text(body?.paymentMethod)
    if (!isUuid(id) || amount <= 0 || !validPaymentMethod.has(method)) return c.json({ error: 'El pago no es válido.' }, 400)
    try {
      const db = requestDb(c)
      const lesson = await findLesson(db, id)
      if (!lesson) return notFound(c, 'Turno')
      const remaining = lesson.amount - lesson.paidAmount
      if (!chargeable(lesson) || amount > remaining + 0.001) return c.json({ error: 'El pago supera el saldo del turno.' }, 400)
      applyPayment(lesson, amount, method)
      const saved = await saveLesson(db, lesson)
      return saved ? c.json(saved) : changedElsewhere(c)
    } catch (error) { return dbError(c, error) }
  })

  app.patch('/api/v1/lessons/:id/payment/reset', async (c) => {
    const id = c.req.param('id')
    if (!isUuid(id)) return c.json({ error: 'ID de turno inválido.' }, 400)
    try {
      const db = requestDb(c)
      const lesson = await findLesson(db, id)
      if (!lesson) return notFound(c, 'Turno')
      if (!(chargeable(lesson) || lesson.status === 'scheduled') || lesson.paidAmount <= 0) {
        return c.json({ error: 'Ese turno no tiene un pago editable.' }, 409)
      }
      Object.assign(lesson, { paidAmount: 0, paymentStatus: 'pending', paymentMethod: '', cashPaidAmount: 0, transferPaidAmount: 0 })
      const saved = await saveLesson(db, lesson)
      return saved ? c.json(saved) : changedElsewhere(c)
    } catch (error) { return dbError(c, error) }
  })

  app.post('/api/v1/payments', async (c) => {
    const body = await jsonBody(c)
    const ids = Array.isArray(body?.lessonIds) ? [...new Set(body.lessonIds)] : []
    const amount = number(body?.amount)
    const method = text(body?.paymentMethod)
    if (!ids.length || ids.some((id) => !isUuid(id)) || amount <= 0 || !validPaymentMethod.has(method)) return c.json({ error: 'El pago no es válido.' }, 400)
    let transaction
    try {
      const db = requestDb(c)
      transaction = await db.transaction('write')
      const placeholders = ids.map(() => '?').join(',')
      const result = await transaction.execute(statement(`${lessonSelect} WHERE id IN (${placeholders}) ORDER BY date`, ids))
      const lessons = result.rows.map(lessonFromRow).filter((lesson) => chargeable(lesson) && lesson.amount - lesson.paidAmount > 0)
      const total = lessons.reduce((sum, lesson) => sum + lesson.amount - lesson.paidAmount, 0)
      if (!lessons.length || amount > total + 0.001) {
        await transaction.rollback()
        return c.json({ error: 'El pago supera el saldo seleccionado.' }, 400)
      }
      let left = amount
      const changed = []
      for (const lesson of lessons) {
        if (left <= 0.001) break
        const allocation = Math.min(left, lesson.amount - lesson.paidAmount)
        applyPayment(lesson, allocation, method)
        left -= allocation
        const saved = await saveLesson(transaction, lesson)
        if (!saved) {
          await transaction.rollback()
          return changedElsewhere(c)
        }
        changed.push(saved)
      }
      await transaction.commit()
      return c.json({ appliedAmount: amount - left, lessons: changed })
    } catch (error) {
      if (transaction && !transaction.closed) {
        try { await transaction.rollback() } catch { /* La operación original es el error relevante. */ }
      }
      return dbError(c, error)
    }
  })
}
