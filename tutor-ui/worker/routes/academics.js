import { requestDb, statement } from '../db.js'
import { dbError, isDate, isUuid, jsonBody, notFound, number, text, uuid } from '../helpers.js'

const assessmentTypes = new Set(['exam', 'make_up', 'practical', 'oral', 'other'])

function assessment(row) {
  return { id: row.id, title: row.title, type: row.type, date: row.date, notes: row.notes }
}

export function registerAcademicRoutes(app) {
  app.get('/api/v1/schools', async (c) => {
    try {
      const [schools, groups, subjects, assessments] = await requestDb(c).batch([
        `SELECT id,name,address,phone,notes FROM schools ORDER BY name`,
        `SELECT id,school_id,grade FROM school_groups ORDER BY grade`,
        `SELECT id,school_group_id,name FROM subjects ORDER BY name`,
        `SELECT id,subject_id,title,type,date,notes FROM assessments ORDER BY date DESC`,
      ], 'read')
      const assessmentsBySubject = new Map()
      for (const row of assessments.rows) {
        if (!assessmentsBySubject.has(row.subject_id)) assessmentsBySubject.set(row.subject_id, [])
        assessmentsBySubject.get(row.subject_id).push(assessment(row))
      }
      const subjectsByGroup = new Map()
      for (const row of subjects.rows) {
        if (!subjectsByGroup.has(row.school_group_id)) subjectsByGroup.set(row.school_group_id, [])
        subjectsByGroup.get(row.school_group_id).push({ id: row.id, name: row.name, assessments: assessmentsBySubject.get(row.id) || [] })
      }
      const groupsBySchool = new Map()
      for (const row of groups.rows) {
        if (!groupsBySchool.has(row.school_id)) groupsBySchool.set(row.school_id, [])
        groupsBySchool.get(row.school_id).push({ id: row.id, grade: Number(row.grade), subjects: subjectsByGroup.get(row.id) || [] })
      }
      return c.json(schools.rows.map((row) => ({ id: row.id, name: row.name, address: row.address, phone: row.phone, notes: row.notes, grades: groupsBySchool.get(row.id) || [] })))
    } catch (error) { return dbError(c, error) }
  })

  app.post('/api/v1/schools', async (c) => {
    const body = await jsonBody(c)
    const school = { id: uuid(), name: text(body?.name), address: text(body?.address), phone: text(body?.phone), notes: text(body?.notes) }
    if (!school.name) return c.json({ error: 'El nombre de la escuela es obligatorio.' }, 400)
    try {
      await requestDb(c).batch([
        statement(`INSERT INTO schools (id,name,address,phone,notes) VALUES (?,?,?,?,?)`, [school.id, school.name, school.address, school.phone, school.notes]),
        ...Array.from({ length: 7 }, (_, index) => statement(`INSERT INTO school_groups (id,school_id,name,grade) VALUES (?,?,?,?)`, [uuid(), school.id, school.name, index + 1])),
      ], 'write')
      return c.json({ ...school, grades: [] }, 201)
    } catch (error) { return dbError(c, error) }
  })

  app.patch('/api/v1/schools/:id', async (c) => {
    const id = c.req.param('id')
    const body = await jsonBody(c)
    const school = { id, name: text(body?.name), address: text(body?.address), phone: text(body?.phone), notes: text(body?.notes) }
    if (!isUuid(id) || !school.name) return c.json({ error: 'Los datos de la escuela no son válidos.' }, 400)
    try {
      const db = requestDb(c)
      const previous = await db.execute(statement(`SELECT name FROM schools WHERE id=?`, [id]))
      if (!previous.rows[0]) return notFound(c, 'Escuela')
      await db.batch([
        statement(`UPDATE schools SET name=?,address=?,phone=?,notes=? WHERE id=?`, [school.name, school.address, school.phone, school.notes, id]),
        statement(`UPDATE school_groups SET name=? WHERE school_id=?`, [school.name, id]),
        statement(`UPDATE students SET school=? WHERE school=?`, [school.name, previous.rows[0].name]),
      ], 'write')
      return c.json({ ...school, grades: [] })
    } catch (error) { return dbError(c, error) }
  })

  app.delete('/api/v1/schools/:id', async (c) => {
    const id = c.req.param('id')
    if (!isUuid(id)) return c.json({ error: 'ID de escuela inválido.' }, 400)
    try {
      const db = requestDb(c)
      const school = await db.execute(statement(`SELECT name FROM schools WHERE id=?`, [id]))
      if (!school.rows[0]) return notFound(c, 'Escuela')
      await db.batch([
        statement(`UPDATE students SET school='',grade=0 WHERE school=?`, [school.rows[0].name]),
        statement(`DELETE FROM assessments WHERE subject_id IN (
          SELECT subjects.id FROM subjects
          JOIN school_groups ON school_groups.id=subjects.school_group_id
          WHERE school_groups.school_id=?)`, [id]),
        statement(`DELETE FROM subjects WHERE school_group_id IN (SELECT id FROM school_groups WHERE school_id=?)`, [id]),
        statement(`DELETE FROM school_groups WHERE school_id=?`, [id]),
        statement(`DELETE FROM schools WHERE id=?`, [id]),
      ], 'write')
      return c.body(null, 204)
    } catch (error) { return dbError(c, error) }
  })

  app.post('/api/v1/schools/:id/grades', async (c) => {
    const schoolId = c.req.param('id')
    const body = await jsonBody(c)
    const grade = number(body?.grade, -1)
    if (!isUuid(schoolId) || grade < 1 || grade > 7) return c.json({ error: 'El grado debe estar entre 1 y 7.' }, 400)
    const id = uuid()
    try {
      const result = await requestDb(c).execute(statement(`INSERT INTO school_groups (id,school_id,name,grade) SELECT ?,id,name,? FROM schools WHERE id=?`, [id, grade, schoolId]))
      if (!result.rowsAffected) return notFound(c, 'Escuela')
      return c.json({ id, grade, subjects: [] }, 201)
    } catch (error) { return dbError(c, error) }
  })

  app.delete('/api/v1/school-grades/:id', deleteSchoolGroup)

  app.post('/api/v1/school-groups/:id/subjects', async (c) => {
    const groupId = c.req.param('id')
    const body = await jsonBody(c)
    const name = text(body?.name)
    if (!isUuid(groupId) || !name) return c.json({ error: 'La materia es obligatoria.' }, 400)
    const id = uuid()
    try {
      const result = await requestDb(c).execute(statement(`INSERT INTO subjects (id,school_group_id,name)
        SELECT ?,id,? FROM school_groups WHERE id=?`, [id, name, groupId]))
      if (!result.rowsAffected) return notFound(c, 'Grado')
      return c.json({ id, name, assessments: [] }, 201)
    } catch (error) { return dbError(c, error) }
  })

  app.delete('/api/v1/subjects/:id', deleteSubject)

  app.post('/api/v1/subjects/:id/assessments', async (c) => {
    const subjectId = c.req.param('id')
    const body = await jsonBody(c)
    const item = { id: uuid(), title: text(body?.title), type: text(body?.type), date: text(body?.date), notes: text(body?.notes) }
    if (!isUuid(subjectId) || !item.title || !assessmentTypes.has(item.type) || !isDate(item.date)) return c.json({ error: 'Los datos de la evaluación no son válidos.' }, 400)
    try {
      const db = requestDb(c)
      const [parent, duplicate] = await db.batch([
        statement(`SELECT 1 FROM subjects WHERE id=?`, [subjectId]),
        statement(`SELECT 1 FROM assessments WHERE subject_id=? AND lower(trim(title))=lower(trim(?)) AND type=? AND date=? LIMIT 1`, [subjectId, item.title, item.type, item.date]),
      ], 'read')
      if (!parent.rows.length) return notFound(c, 'Materia')
      if (duplicate.rows.length) return c.json({ error: 'Esa evaluación ya está guardada.' }, 409)
      const result = await db.execute(statement(`INSERT INTO assessments (id,subject_id,title,type,date,notes)
        SELECT ?,id,?,?,?,? FROM subjects WHERE id=?`, [item.id, item.title, item.type, item.date, item.notes, subjectId]))
      if (!result.rowsAffected) return notFound(c, 'Materia')
      return c.json(item, 201)
    } catch (error) { return dbError(c, error) }
  })

  app.post('/api/v1/school-grades/:id/exams', async (c) => {
    const groupId = c.req.param('id')
    const body = await jsonBody(c)
    const subjectName = text(body?.subjectName)
    const date = text(body?.date)
    if (!isUuid(groupId) || !subjectName || !isDate(date)) return c.json({ error: 'La materia y la fecha son obligatorias.' }, 400)
    try {
      const db = requestDb(c)
      const group = await db.execute(statement(`SELECT id FROM school_groups WHERE id=?`, [groupId]))
      if (!group.rows[0]) return notFound(c, 'Grado')
      const found = await db.execute(statement(`SELECT id FROM subjects WHERE school_group_id=? AND name=? COLLATE NOCASE`, [groupId, subjectName]))
      const subjectId = found.rows[0]?.id || uuid()
      const item = { id: uuid(), title: text(body.title) || 'Examen', type: 'exam', date, notes: text(body.notes) }
      if (found.rows[0]) {
        const duplicate = await db.execute(statement(`SELECT 1 FROM assessments WHERE subject_id=? AND lower(trim(title))=lower(trim(?)) AND type='exam' AND date=? LIMIT 1`, [subjectId, item.title, item.date]))
        if (duplicate.rows.length) return c.json({ error: 'Ese examen ya está guardado.' }, 409)
      }
      const queries = []
      if (!found.rows[0]) queries.push(statement(`INSERT INTO subjects (id,school_group_id,name) VALUES (?,?,?)`, [subjectId, groupId, subjectName]))
      queries.push(statement(`INSERT INTO assessments (id,subject_id,title,type,date,notes) VALUES (?,?,?,?,?,?)`, [item.id, subjectId, item.title, item.type, item.date, item.notes]))
      await db.batch(queries, 'write')
      return c.json(item, 201)
    } catch (error) { return dbError(c, error) }
  })

  app.delete('/api/v1/assessments/:id', (c) => removeById(c, 'assessments', 'Evaluación'))

  app.get('/api/v1/students/:id/assessments', async (c) => {
    const studentId = c.req.param('id')
    if (!isUuid(studentId)) return c.json({ error: 'ID de alumno inválido.' }, 400)
    try {
      const result = await requestDb(c).execute(statement(`SELECT id,subject_name,title,type,date,score,notes FROM student_assessments WHERE student_id=? ORDER BY date DESC`, [studentId]))
      return c.json(result.rows.map((row) => ({ id: row.id, subjectName: row.subject_name, title: row.title, type: row.type, date: row.date, score: row.score === null ? null : Number(row.score), notes: row.notes })))
    } catch (error) { return dbError(c, error) }
  })

  app.post('/api/v1/students/:id/assessments', async (c) => {
    const studentId = c.req.param('id')
    const body = await jsonBody(c)
    const score = body?.score === '' || body?.score === null || body?.score === undefined ? null : number(body.score, NaN)
    const item = { id: uuid(), subjectName: text(body?.subjectName), title: text(body?.title), type: text(body?.type), date: text(body?.date), score, notes: text(body?.notes) }
    if (!isUuid(studentId) || !item.subjectName || !item.title || !assessmentTypes.has(item.type) || !isDate(item.date) || (score !== null && (!Number.isFinite(score) || score < 0 || score > 10))) return c.json({ error: 'Los datos de la evaluación no son válidos.' }, 400)
    try {
      const db = requestDb(c)
      const student = await db.execute(statement(`SELECT is_active FROM students WHERE id=?`, [studentId]))
      if (!student.rows[0]) return notFound(c, 'Alumno')
      if (!student.rows[0].is_active) return c.json({ error: 'No se pueden agregar evaluaciones a un alumno inactivo.' }, 409)
      const duplicate = await db.execute(statement(`SELECT 1 FROM student_assessments
        WHERE student_id=? AND lower(trim(subject_name))=lower(trim(?))
          AND lower(trim(title))=lower(trim(?)) AND type=? AND date=? LIMIT 1`,
      [studentId, item.subjectName, item.title, item.type, item.date]))
      if (duplicate.rows.length) return c.json({ error: 'Esa evaluación ya está guardada.' }, 409)
      await db.execute(statement(`INSERT INTO student_assessments (id,student_id,subject_name,title,type,date,score,notes) VALUES (?,?,?,?,?,?,?,?)`, [item.id, studentId, item.subjectName, item.title, item.type, item.date, item.score, item.notes]))
      return c.json(item, 201)
    } catch (error) { return dbError(c, error) }
  })

  app.delete('/api/v1/student-assessments/:id', (c) => removeById(c, 'student_assessments', 'Evaluación'))
}

async function deleteSchoolGroup(c) {
  const id = c.req.param('id')
  if (!isUuid(id)) return c.json({ error: 'ID de grado inválido.' }, 400)
  try {
    const db = requestDb(c)
    const found = await db.execute(statement(`SELECT 1 FROM school_groups WHERE id=?`, [id]))
    if (!found.rows.length) return notFound(c, 'Grado')
    await db.batch([
      statement(`DELETE FROM assessments WHERE subject_id IN (SELECT id FROM subjects WHERE school_group_id=?)`, [id]),
      statement(`DELETE FROM subjects WHERE school_group_id=?`, [id]),
      statement(`DELETE FROM school_groups WHERE id=?`, [id]),
    ], 'write')
    return c.body(null, 204)
  } catch (error) { return dbError(c, error) }
}

async function deleteSubject(c) {
  const id = c.req.param('id')
  if (!isUuid(id)) return c.json({ error: 'ID de materia inválido.' }, 400)
  try {
    const db = requestDb(c)
    const found = await db.execute(statement(`SELECT 1 FROM subjects WHERE id=?`, [id]))
    if (!found.rows.length) return notFound(c, 'Materia')
    await db.batch([
      statement(`DELETE FROM assessments WHERE subject_id=?`, [id]),
      statement(`DELETE FROM subjects WHERE id=?`, [id]),
    ], 'write')
    return c.body(null, 204)
  } catch (error) { return dbError(c, error) }
}

async function removeById(c, table, label) {
  const id = c.req.param('id')
  if (!isUuid(id)) return c.json({ error: `ID de ${label.toLowerCase()} inválido.` }, 400)
  try {
    const result = await requestDb(c).execute(statement(`DELETE FROM ${table} WHERE id=?`, [id]))
    if (!result.rowsAffected) return notFound(c, label)
    return c.body(null, 204)
  } catch (error) { return dbError(c, error) }
}
