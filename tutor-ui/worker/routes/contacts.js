import { requestDb, statement } from '../db.js'
import { dbError, isUuid, jsonBody, notFound, number, teacherFromRow, text, uuid } from '../helpers.js'

const teacherSelect = `SELECT id,name,school,phone_number,subject,email FROM teacher_contacts`

export function registerContactRoutes(app) {
  app.get('/api/v1/teachers', async (c) => {
    try {
      const result = await requestDb(c).execute(`${teacherSelect} ORDER BY name`)
      return c.json(result.rows.map(teacherFromRow))
    } catch (error) { return dbError(c, error) }
  })

  async function saveTeacher(c, create) {
    const id = create ? uuid() : c.req.param('id')
    if (!isUuid(id)) return c.json({ error: 'ID de maestra inválido.' }, 400)
    const body = await jsonBody(c)
    const teacher = { id, name: text(body?.name), school: text(body?.school), subject: text(body?.subject), phoneNumber: text(body?.phoneNumber), email: text(body?.email) }
    if (!teacher.name) return c.json({ error: 'El nombre es obligatorio.' }, 400)
    try {
      const db = requestDb(c)
      const result = create
        ? await db.execute(statement(`INSERT INTO teacher_contacts (id,name,school,phone_number,subject,email)
          SELECT ?,?,?,?,?,? WHERE NOT EXISTS (
            SELECT 1 FROM teacher_contacts
            WHERE lower(trim(name))=lower(trim(?)) AND lower(trim(school))=lower(trim(?))
              AND phone_number=? AND lower(trim(subject))=lower(trim(?)) AND lower(trim(email))=lower(trim(?))
          )`, [id, teacher.name, teacher.school, teacher.phoneNumber, teacher.subject, teacher.email, teacher.name, teacher.school, teacher.phoneNumber, teacher.subject, teacher.email]))
        : await db.execute(statement(`UPDATE teacher_contacts SET name=?,school=?,phone_number=?,subject=?,email=? WHERE id=?`, [teacher.name, teacher.school, teacher.phoneNumber, teacher.subject, teacher.email, id]))
      if (create && !result.rowsAffected) return c.json({ error: 'Esa maestra ya está guardada.' }, 409)
      if (!create && !result.rowsAffected) return notFound(c, 'Maestra')
      return c.json(teacher, create ? 201 : 200)
    } catch (error) { return dbError(c, error) }
  }

  app.post('/api/v1/teachers', (c) => saveTeacher(c, true))
  app.patch('/api/v1/teachers/:id', (c) => saveTeacher(c, false))
  app.delete('/api/v1/teachers/:id', async (c) => {
    const id = c.req.param('id')
    if (!isUuid(id)) return c.json({ error: 'ID de maestra inválido.' }, 400)
    try {
      const result = await requestDb(c).execute(statement(`DELETE FROM teacher_contacts WHERE id=?`, [id]))
      if (!result.rowsAffected) return notFound(c, 'Maestra')
      return c.body(null, 204)
    } catch (error) { return dbError(c, error) }
  })

  app.get('/api/v1/schedules', async (c) => {
    try {
      const result = await requestDb(c).execute(`SELECT id,student_id,day_of_week,start_time,duration_minutes FROM base_schedules ORDER BY day_of_week,start_time`)
      return c.json(result.rows.map((row) => ({ id: row.id, studentId: row.student_id, dayOfWeek: Number(row.day_of_week), startTime: row.start_time, durationMinutes: Number(row.duration_minutes) })))
    } catch (error) { return dbError(c, error) }
  })
  app.post('/api/v1/schedules', async (c) => {
    const body = await jsonBody(c)
    const item = { id: uuid(), studentId: text(body?.studentId), dayOfWeek: number(body?.dayOfWeek, -1), startTime: text(body?.startTime), durationMinutes: number(body?.durationMinutes) }
    if (!isUuid(item.studentId) || item.dayOfWeek < 0 || item.dayOfWeek > 6 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.startTime) || item.durationMinutes <= 0) return c.json({ error: 'El horario no es válido.' }, 400)
    try {
      const result = await requestDb(c).execute(statement(`INSERT INTO base_schedules (id,student_id,day_of_week,start_time,duration_minutes)
        SELECT ?,id,?,?,? FROM students WHERE id=? AND is_active=1`, [item.id, item.dayOfWeek, item.startTime, item.durationMinutes, item.studentId]))
      if (!result.rowsAffected) return notFound(c, 'Alumno')
      return c.json(item, 201)
    } catch (error) { return dbError(c, error) }
  })
  app.delete('/api/v1/schedules/:id', async (c) => {
    const id = c.req.param('id')
    if (!isUuid(id)) return c.json({ error: 'ID de horario inválido.' }, 400)
    try {
      const result = await requestDb(c).execute(statement(`DELETE FROM base_schedules WHERE id=?`, [id]))
      if (!result.rowsAffected) return notFound(c, 'Horario')
      return c.body(null, 204)
    } catch (error) { return dbError(c, error) }
  })
}
