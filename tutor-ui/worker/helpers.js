export const uuid = () => crypto.randomUUID()

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '')
}

export const text = (value) => typeof value === 'string' ? value.trim() : ''
export const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
export const isDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
export const isDateTime = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value))

export async function jsonBody(c) {
  try {
    return await c.req.json()
  } catch {
    return null
  }
}

export function dbError(c, error) {
  console.error(error)
  const message = String(error?.message || '')
  if (/UNIQUE constraint failed/i.test(message)) return c.json({ error: 'Ya existe un registro con esos datos.' }, 409)
  if (/FOREIGN KEY constraint failed/i.test(message)) return c.json({ error: 'No se puede eliminar porque tiene información relacionada.' }, 409)
  return c.json({ error: 'Ocurrió un error interno.' }, 500)
}

export function notFound(c, label = 'Registro') {
  return c.json({ error: `${label} no encontrado.` }, 404)
}

export function studentFromRow(row, guardians = []) {
  return {
    id: row.id,
    name: row.name,
    school: row.school,
    grade: Number(row.grade),
    hourlyRate: Number(row.hourly_rate),
    notes: row.notes,
    isActive: Boolean(row.is_active),
    birthDate: row.birth_date,
    phone: row.phone,
    email: row.email,
    address: row.address,
    ...(guardians.length ? { guardian: guardians[0] } : {}),
    guardians,
  }
}

export function lessonFromRow(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    date: row.date,
    realDurationMinutes: Number(row.real_duration_minutes),
    status: row.status,
    attendance: row.attendance,
    paymentStatus: row.payment_status,
    amount: Number(row.amount),
    hourlyRate: Number(row.hourly_rate),
    paidAmount: Number(row.paid_amount),
    paymentMethod: row.payment_method,
    cashPaidAmount: Number(row.cash_paid_amount),
    transferPaidAmount: Number(row.transfer_paid_amount),
    topicNotes: row.topic_notes,
    version: Number(row.version || 0),
  }
}

export function teacherFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    school: row.school,
    phoneNumber: row.phone_number,
    subject: row.subject,
    email: row.email,
  }
}
