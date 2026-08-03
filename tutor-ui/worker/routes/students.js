import { requestDb, statement } from '../db.js'
import { dbError, isDate, isUuid, jsonBody, notFound, number, studentFromRow, text, uuid } from '../helpers.js'
import { currentHourlyPrice } from './settings.js'

const studentSelect = `SELECT id,name,school,grade,hourly_rate,notes,is_active,birth_date,phone,email,address FROM students`

function guardianFromRow(row) {
  return { id: row.id, name: row.name, relationship: row.relationship, phone: row.phone, email: row.email }
}

function parseGuardians(inputs, studentId) {
  if (!Array.isArray(inputs) || !inputs.length) return null
  const guardians = inputs.map((input) => ({
    id: uuid(), studentId, name: text(input?.name), relationship: text(input?.relationship),
    phone: text(input?.phone), email: text(input?.email),
  }))
  return guardians.every((item) => item.name && item.relationship && item.phone) ? guardians : null
}

async function findStudent(db, id) {
  const result = await db.execute(statement(`${studentSelect} WHERE id=?`, [id]))
  return result.rows[0]
}

async function findGuardians(db, studentId) {
  const result = await db.execute(statement(`SELECT id,name,relationship,phone,email FROM guardians WHERE student_id=? ORDER BY name`, [studentId]))
  return result.rows.map(guardianFromRow)
}

export function registerStudentRoutes(app) {
  app.get('/api/v1/students', async (c) => {
    try {
      const db = requestDb(c)
      const [studentsResult, guardiansResult] = await db.batch([
        `${studentSelect} ORDER BY name`,
        `SELECT id,student_id,name,relationship,phone,email FROM guardians ORDER BY name`,
      ], 'read')
      const grouped = new Map()
      for (const row of guardiansResult.rows) {
        if (!grouped.has(row.student_id)) grouped.set(row.student_id, [])
        grouped.get(row.student_id).push(guardianFromRow(row))
      }
      return c.json(studentsResult.rows.map((row) => studentFromRow(row, grouped.get(row.id) || [])))
    } catch (error) { return dbError(c, error) }
  })

  app.post('/api/v1/students', async (c) => {
    const body = await jsonBody(c)
    const input = body?.student
    const birthDate = text(input?.birthDate)
    const studentId = uuid()
    const guardians = parseGuardians(body?.guardians?.length ? body.guardians : body?.guardian ? [body.guardian] : [], studentId)
    const name = text(input?.name)
    const grade = number(input?.grade, -1)
    if (!name || !isDate(birthDate) || grade < 0 || grade > 7 || !guardians) {
      return c.json({ error: 'El alumno, la fecha de nacimiento y al menos un adulto completo son obligatorios.' }, 400)
    }
    const student = {
      id: studentId, name, school: text(input.school), grade,
      hourlyRate: number(input.hourlyRate) > 0 ? number(input.hourlyRate) : 1,
      notes: text(input.notes), isActive: true, birthDate,
      phone: text(input.phone), email: text(input.email), address: text(input.address),
    }
    try {
      const db = requestDb(c)
      const rate = await currentHourlyPrice(db)
      student.hourlyRate = rate
      await db.batch([
        statement(`INSERT INTO students (id,name,school,grade,hourly_rate,notes,is_active,birth_date,phone,email,address) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [student.id, student.name, student.school, student.grade, student.hourlyRate, student.notes, 1, student.birthDate, student.phone, student.email, student.address]),
        ...guardians.map((guardian) => statement(`INSERT INTO guardians (id,student_id,name,relationship,phone,email) VALUES (?,?,?,?,?,?)`,
          [guardian.id, student.id, guardian.name, guardian.relationship, guardian.phone, guardian.email])),
      ], 'write')
      const responseGuardians = guardians.map(({ studentId: _, ...guardian }) => guardian)
      return c.json({ ...student, guardian: responseGuardians[0], guardians: responseGuardians }, 201)
    } catch (error) { return dbError(c, error) }
  })

  app.patch('/api/v1/students/:id', async (c) => {
    const id = c.req.param('id')
    if (!isUuid(id)) return c.json({ error: 'ID de alumno inválido.' }, 400)
    const body = await jsonBody(c)
    const input = body?.student
    const name = text(input?.name)
    const birthDate = text(input?.birthDate)
    const grade = number(input?.grade, -1)
    if (!name || !isDate(birthDate) || grade < 0 || grade > 7) return c.json({ error: 'Los datos del alumno no son válidos.' }, 400)
    const replaceGuardians = Array.isArray(body?.guardians) && body.guardians.length > 0
    const guardians = replaceGuardians ? parseGuardians(body.guardians, id) : null
    if (replaceGuardians && !guardians) return c.json({ error: 'Los datos de los adultos responsables están incompletos.' }, 400)
    try {
      const db = requestDb(c)
      const current = await findStudent(db, id)
      if (!current) return notFound(c, 'Alumno')
      const statements = [statement(`UPDATE students SET name=?,school=?,grade=?,notes=?,birth_date=?,phone=?,email=?,address=? WHERE id=?`,
        [name, text(input.school), grade, text(input.notes), birthDate, text(input.phone), text(input.email), text(input.address), id])]
      if (replaceGuardians) {
        statements.push(statement(`DELETE FROM guardians WHERE student_id=?`, [id]))
        statements.push(...guardians.map((guardian) => statement(`INSERT INTO guardians (id,student_id,name,relationship,phone,email) VALUES (?,?,?,?,?,?)`,
          [guardian.id, id, guardian.name, guardian.relationship, guardian.phone, guardian.email])))
      }
      await db.batch(statements, 'write')
      const updated = await findStudent(db, id)
      return c.json(studentFromRow(updated, await findGuardians(db, id)))
    } catch (error) { return dbError(c, error) }
  })

  async function setActive(c, active) {
    const id = c.req.param('id')
    if (!isUuid(id)) return c.json({ error: 'ID de alumno inválido.' }, 400)
    try {
      const db = requestDb(c)
      const result = await db.execute(statement(`UPDATE students SET is_active=? WHERE id=?`, [active ? 1 : 0, id]))
      if (!result.rowsAffected) return notFound(c, 'Alumno')
      return c.json(studentFromRow(await findStudent(db, id), await findGuardians(db, id)))
    } catch (error) { return dbError(c, error) }
  }

  app.patch('/api/v1/students/:id/inactive', (c) => setActive(c, false))
  app.patch('/api/v1/students/:id/active', (c) => setActive(c, true))

  app.delete('/api/v1/students/:id', async (c) => {
    const id = c.req.param('id')
    if (!isUuid(id)) return c.json({ error: 'ID de alumno inválido.' }, 400)
    try {
      const db = requestDb(c)
      const related = await db.execute(statement(`SELECT 1 FROM lessons WHERE student_id=? LIMIT 1`, [id]))
      if (related.rows.length) {
        return c.json({ error: 'No se puede eliminar porque tiene clases guardadas. Conviene dejarlo inactivo.' }, 409)
      }
      const results = await db.batch([
        statement(`DELETE FROM guardians WHERE student_id=?`, [id]),
        statement(`DELETE FROM base_schedules WHERE student_id=?`, [id]),
        statement(`DELETE FROM student_assessments WHERE student_id=?`, [id]),
        statement(`DELETE FROM students WHERE id=?`, [id]),
      ], 'write')
      if (!results.at(-1).rowsAffected) return notFound(c, 'Alumno')
      return c.body(null, 204)
    } catch (error) { return dbError(c, error) }
  })
}
