const STORAGE_KEY = 'softwaremama-demo-v2'
const HOURLY_PRICE = 12000
const SCHOOL_NAMES = [
  'Colegio Horizonte',
  'Instituto del Parque',
  'Escuela Nueva Argentina',
  'Colegio San Gabriel',
  'Instituto Los Aromos',
]
const STUDENT_NAMES = [
  'Sofía Benítez', 'Mateo Fernández', 'Valentina Rojas', 'Benjamín Castro',
  'Martina López', 'Felipe Acosta', 'Emma Herrera', 'Bautista Medina',
  'Catalina Suárez', 'Joaquín Romero', 'Olivia Pereyra', 'Santino Molina',
  'Delfina Vega', 'Franco Navarro', 'Renata Cabrera', 'Tomás Giménez',
  'Isabella Ortiz', 'Lautaro Silva', 'Malena Ferraro', 'Thiago Domínguez',
  'Pilar Núñez', 'Bruno Sosa', 'Juana Campos', 'Agustín Arias',
  'Mía Quiroga', 'Simón Ibarra', 'Clara Luna', 'Ramiro Peralta',
  'Victoria Paz', 'Lucas Villalba', 'Abril Correa', 'Nicolás Aguirre',
]
const TEACHER_NAMES = [
  'Laura Méndez', 'Mariana Torres', 'Carolina Ruiz', 'Florencia Blanco',
  'Paula Serrano', 'Gabriela Vidal', 'Natalia Márquez', 'Andrea Rivas',
  'Verónica Salas', 'Silvina Costa',
]
const SUBJECTS = ['Matemática', 'Prácticas del Lenguaje', 'Ciencias Sociales', 'Ciencias Naturales']
const HOURS = [8, 9, 10, 11, 14, 15, 16, 17, 18, 19]

const clone = (value) => structuredClone(value)
const id = (prefix, index) => `${prefix}-${String(index).padStart(4, '0')}`
const dateKey = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-')
const atLocalHour = (date, hour) => new Date(
  date.getFullYear(), date.getMonth(), date.getDate(), hour, 0, 0, 0,
).toISOString()
const addDays = (date, count) => {
  const next = new Date(date)
  next.setDate(next.getDate() + count)
  return next
}
const birthday = (index, now) => {
  const year = now.getFullYear() - 7 - (index % 7)
  const month = index < 5 ? now.getMonth() : (index * 3) % 12
  const day = 3 + ((index * 5) % 24)
  return dateKey(new Date(year, month, day))
}

function seedSchools(now) {
  let assessmentIndex = 0
  return SCHOOL_NAMES.map((name, schoolIndex) => ({
    id: id('school', schoolIndex + 1),
    name,
    address: `Av. Educadores ${1200 + schoolIndex * 340}, Buenos Aires`,
    phone: `11 455${schoolIndex + 1}-${String(2300 + schoolIndex * 137).padStart(4, '0')}`,
    notes: schoolIndex % 2 ? 'Contactar preferentemente por la mañana.' : 'Proyecto educativo con jornada extendida.',
    grades: Array.from({ length: 7 }, (_, gradeIndex) => ({
      id: id(`grade-${schoolIndex + 1}`, gradeIndex + 1),
      grade: gradeIndex + 1,
      subjects: SUBJECTS.map((subject, subjectIndex) => ({
        id: id(`subject-${schoolIndex + 1}-${gradeIndex + 1}`, subjectIndex + 1),
        name: subject,
        assessments: (schoolIndex + gradeIndex + subjectIndex) % 3 === 0
          ? [{
              id: id('school-assessment', ++assessmentIndex),
              title: ['Fracciones y decimales', 'Comprensión lectora', 'La organización nacional', 'Sistemas del cuerpo'][subjectIndex],
              type: 'exam',
              date: dateKey(addDays(now, 4 + ((assessmentIndex * 3) % 35))),
              notes: '',
            }]
          : [],
      })),
    })),
  }))
}

function seedStudents(now) {
  return STUDENT_NAMES.map((name, index) => {
    const guardianName = index % 2 ? `María ${name.split(' ').at(-1)}` : `Juan ${name.split(' ').at(-1)}`
    const studentId = id('student', index + 1)
    const guardians = [{
      id: id('guardian', index + 1),
      name: guardianName,
      relationship: index % 2 ? 'mother' : 'father',
      phone: `11 555${index % 10}-${String(1100 + index * 53).padStart(4, '0')}`,
      email: `familia.${index + 1}@ejemplo.com`,
    }]
    return {
      id: studentId,
      name,
      school: SCHOOL_NAMES[index % SCHOOL_NAMES.length],
      grade: (index % 7) + 1,
      hourlyRate: HOURLY_PRICE,
      notes: index % 4 === 0 ? 'Reforzar resolución de problemas y organización semanal.' : '',
      isActive: index < 29,
      birthDate: birthday(index, now),
      phone: index % 3 === 0 ? `11 444${index % 10}-${String(2100 + index * 41).padStart(4, '0')}` : '',
      email: index % 3 === 0 ? `alumno.${index + 1}@ejemplo.com` : '',
      address: `Calle Los Tilos ${300 + index * 17}, Buenos Aires`,
      guardian: guardians[0],
      guardians,
    }
  })
}

function paymentFor(sequence, amount) {
  if (sequence % 9 === 0) return { paidAmount: 0, paymentStatus: 'pending', paymentMethod: '', cashPaidAmount: 0, transferPaidAmount: 0 }
  if (sequence % 8 === 0) return { paidAmount: amount / 2, paymentStatus: 'pending', paymentMethod: 'cash', cashPaidAmount: amount / 2, transferPaidAmount: 0 }
  if (sequence % 7 === 0) return { paidAmount: amount, paymentStatus: 'paid', paymentMethod: 'mixed', cashPaidAmount: amount / 2, transferPaidAmount: amount / 2 }
  if (sequence % 2 === 0) return { paidAmount: amount, paymentStatus: 'paid', paymentMethod: 'transfer', cashPaidAmount: 0, transferPaidAmount: amount }
  return { paidAmount: amount, paymentStatus: 'paid', paymentMethod: 'cash', cashPaidAmount: amount, transferPaidAmount: 0 }
}

function seedLessons(now, students) {
  const lessons = []
  let sequence = 0
  for (let offset = -365; offset <= 28; offset += 1) {
    const date = addDays(now, offset)
    const weekday = date.getDay()
    if (weekday === 0 && offset !== 0) continue
    const count = offset === 0 ? 6 : weekday === 6 ? 2 : 4
    for (let position = 0; position < count; position += 1) {
      sequence += 1
      const student = students[(sequence * 5 + date.getDate() * 3 + position * 7) % 29]
      const completed = offset < 0 || (offset === 0 && position < 3)
      const attendance = sequence % 17 === 0
        ? 'absent_excused'
        : sequence % 11 === 0
          ? 'absent_unexcused'
          : 'present'
      const amount = completed && attendance !== 'absent_excused' ? HOURLY_PRICE : 0
      const payment = completed && amount > 0
        ? paymentFor(sequence, amount)
        : { paidAmount: 0, paymentStatus: 'pending', paymentMethod: '', cashPaidAmount: 0, transferPaidAmount: 0 }
      lessons.push({
        id: id('lesson', sequence),
        studentId: student.id,
        date: atLocalHour(date, HOURS[(position * 2 + sequence) % HOURS.length]),
        realDurationMinutes: 60,
        status: completed ? 'completed' : 'scheduled',
        attendance: completed ? attendance : 'present',
        amount,
        hourlyRate: HOURLY_PRICE,
        topicNotes: completed ? ['Repaso general', 'Problemas combinados', 'Preparación de evaluación', 'Tarea escolar'][sequence % 4] : '',
        version: 0,
        ...payment,
      })
    }
  }
  return lessons
}

function seedState() {
  const now = new Date()
  const schools = seedSchools(now)
  const students = seedStudents(now)
  const studentAssessments = students.slice(0, 20).flatMap((student, index) => [0, 1].map((item) => ({
    id: id('student-assessment', index * 2 + item + 1),
    studentId: student.id,
    subjectName: SUBJECTS[(index + item) % SUBJECTS.length],
    title: item ? 'Seguimiento mensual' : 'Evaluación diagnóstica',
    type: item ? 'homework' : 'exam',
    date: dateKey(addDays(now, -12 - index - item * 20)),
    score: 6 + ((index + item) % 5),
    notes: item ? 'Se observa una evolución sostenida.' : 'Buen punto de partida para el trimestre.',
  })))
  return {
    settings: { hourlyPrice: HOURLY_PRICE },
    students,
    schools,
    lessons: seedLessons(now, students),
    studentAssessments,
    teachers: TEACHER_NAMES.map((name, index) => ({
      id: id('teacher', index + 1),
      name,
      school: SCHOOL_NAMES[index % SCHOOL_NAMES.length],
      subject: SUBJECTS[index % SUBJECTS.length],
      phoneNumber: `11 433${index}-${String(3100 + index * 89).padStart(4, '0')}`,
      email: `${name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '.')}@ejemplo.com`,
    })),
    schedules: [],
  }
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) return JSON.parse(saved)
  const state = seedState()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  return state
}

const saveState = (state) => localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
const bodyFrom = (options) => options.body ? JSON.parse(options.body) : {}
const pathParts = (pathname) => pathname.split('/').filter(Boolean)
const notFound = (label) => { throw new Error(`${label} no encontrado.`) }
const byName = (a, b) => a.name.localeCompare(b.name, 'es')

function finishLesson(lesson, input) {
  const previous = clone(lesson)
  lesson.status = 'completed'
  lesson.realDurationMinutes = Number(input.realDurationMinutes || 60)
  lesson.attendance = input.attendance
  lesson.topicNotes = input.topicNotes || ''
  lesson.amount = input.attendance === 'absent_excused'
    ? 0
    : lesson.hourlyRate * lesson.realDurationMinutes / 60
  if (!lesson.amount) {
    Object.assign(lesson, { paidAmount: 0, paymentStatus: 'pending', paymentMethod: '', cashPaidAmount: 0, transferPaidAmount: 0 })
  } else if (input.attendance === 'present' && input.paymentStatus === 'paid') {
    Object.assign(lesson, {
      paidAmount: lesson.amount,
      paymentStatus: 'paid',
      paymentMethod: input.paymentMethod,
      cashPaidAmount: input.paymentMethod === 'cash' ? lesson.amount : 0,
      transferPaidAmount: input.paymentMethod === 'transfer' ? lesson.amount : 0,
    })
  } else if (previous.paymentStatus === 'pending' && previous.paidAmount > 0) {
    lesson.paidAmount = Math.min(previous.paidAmount, lesson.amount)
    lesson.paymentStatus = lesson.paidAmount >= lesson.amount ? 'paid' : 'pending'
  } else {
    Object.assign(lesson, { paidAmount: 0, paymentStatus: 'pending', paymentMethod: '', cashPaidAmount: 0, transferPaidAmount: 0 })
  }
  lesson.version += 1
}

function applyPayment(lesson, amount, method) {
  if (lesson.paidAmount > 0 && lesson.paymentMethod !== method) lesson.paymentMethod = 'mixed'
  else lesson.paymentMethod = method
  lesson.paidAmount += amount
  if (method === 'cash') lesson.cashPaidAmount += amount
  else lesson.transferPaidAmount += amount
  if (lesson.paidAmount >= lesson.amount) {
    lesson.paidAmount = lesson.amount
    lesson.paymentStatus = 'paid'
  }
  lesson.version += 1
}

export async function demoRequest(path, options = {}) {
  await Promise.resolve()
  const url = new URL(path, 'http://demo.local')
  const parts = pathParts(url.pathname)
  const method = (options.method || 'GET').toUpperCase()
  const input = bodyFrom(options)
  const state = loadState()
  let result

  if (method === 'GET' && parts[0] === 'settings') result = state.settings
  else if (method === 'PATCH' && parts[0] === 'settings') {
    state.settings.hourlyPrice = Number(input.hourlyPrice)
    state.students.forEach((student) => { student.hourlyRate = state.settings.hourlyPrice })
    const now = new Date().toISOString()
    state.lessons.filter((lesson) => lesson.status === 'scheduled' && lesson.date >= now).forEach((lesson) => {
      lesson.hourlyRate = state.settings.hourlyPrice
      lesson.version += 1
    })
    result = state.settings
  } else if (method === 'GET' && parts[0] === 'students' && parts.length === 1) result = [...state.students].sort(byName)
  else if (method === 'POST' && parts[0] === 'students' && parts.length === 1) {
    const student = { id: crypto.randomUUID(), ...input.student, hourlyRate: state.settings.hourlyPrice, isActive: true }
    student.guardians = (input.guardians || []).map((guardian) => ({ id: crypto.randomUUID(), ...guardian }))
    student.guardian = student.guardians[0]
    state.students.push(student)
    result = student
  } else if (parts[0] === 'students' && parts[1] && method === 'PATCH') {
    const student = state.students.find((item) => item.id === parts[1]) || notFound('Alumno')
    if (parts[2] === 'active') student.isActive = true
    else if (parts[2] === 'inactive') student.isActive = false
    else {
      Object.assign(student, input.student)
      student.guardians = (input.guardians || []).map((guardian) => ({ id: guardian.id || crypto.randomUUID(), ...guardian }))
      student.guardian = student.guardians[0]
    }
    result = student
  } else if (method === 'DELETE' && parts[0] === 'students') {
    state.students = state.students.filter((item) => item.id !== parts[1])
    result = null
  } else if (method === 'GET' && parts[0] === 'students' && parts[2] === 'assessments') {
    result = state.studentAssessments.filter((item) => item.studentId === parts[1]).sort((a, b) => b.date.localeCompare(a.date))
  } else if (method === 'POST' && parts[0] === 'students' && parts[2] === 'assessments') {
    result = { id: crypto.randomUUID(), studentId: parts[1], ...input }
    state.studentAssessments.push(result)
  } else if (method === 'DELETE' && parts[0] === 'student-assessments') {
    state.studentAssessments = state.studentAssessments.filter((item) => item.id !== parts[1])
    result = null
  } else if (method === 'GET' && parts[0] === 'lessons' && parts[1] === 'range') {
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    result = state.lessons.filter((lesson) => {
      const key = dateKey(new Date(lesson.date))
      return key >= from && key <= to
    })
  } else if (method === 'GET' && parts[0] === 'lessons') {
    const selectedDate = url.searchParams.get('date')
    result = state.lessons.filter((lesson) => dateKey(new Date(lesson.date)) === selectedDate).sort((a, b) => a.date.localeCompare(b.date))
  } else if (method === 'POST' && parts[0] === 'lessons') {
    result = {
      id: crypto.randomUUID(), studentId: input.studentId, date: new Date(input.date).toISOString(),
      realDurationMinutes: Number(input.durationMinutes || 60), status: 'scheduled', attendance: 'present',
      paymentStatus: 'pending', amount: 0, hourlyRate: state.settings.hourlyPrice, paidAmount: 0,
      paymentMethod: '', cashPaidAmount: 0, transferPaidAmount: 0, topicNotes: '', version: 0,
    }
    state.lessons.push(result)
  } else if (parts[0] === 'lessons' && parts[1] && method === 'PATCH') {
    const lesson = state.lessons.find((item) => item.id === parts[1]) || notFound('Turno')
    if (parts[2] === 'complete') finishLesson(lesson, input)
    else if (parts[2] === 'reschedule') { lesson.date = new Date(input.date).toISOString(); lesson.version += 1 }
    else if (parts[2] === 'cancel') { lesson.status = 'cancelled'; lesson.version += 1 }
    else if (parts[2] === 'reopen') { lesson.status = 'scheduled'; lesson.version += 1 }
    else if (parts[2] === 'payment' && parts[3] === 'reset') Object.assign(lesson, { paidAmount: 0, paymentStatus: 'pending', paymentMethod: '', cashPaidAmount: 0, transferPaidAmount: 0, version: lesson.version + 1 })
    else if (parts[2] === 'payment') applyPayment(lesson, Number(input.amount), input.paymentMethod)
    result = lesson
  } else if (method === 'POST' && parts[0] === 'payments') {
    let left = Number(input.amount)
    const changed = state.lessons.filter((lesson) => input.lessonIds.includes(lesson.id)).sort((a, b) => a.date.localeCompare(b.date))
    changed.forEach((lesson) => {
      const allocation = Math.min(left, lesson.amount - lesson.paidAmount)
      if (allocation > 0) applyPayment(lesson, allocation, input.paymentMethod)
      left -= allocation
    })
    result = { appliedAmount: Number(input.amount) - left, lessons: changed }
  } else if (method === 'GET' && parts[0] === 'schools') result = state.schools
  else if (method === 'POST' && parts[0] === 'schools') {
    result = { id: crypto.randomUUID(), ...input, grades: Array.from({ length: 7 }, (_, index) => ({ id: crypto.randomUUID(), grade: index + 1, subjects: [] })) }
    state.schools.push(result)
  } else if (method === 'PATCH' && parts[0] === 'schools') {
    result = state.schools.find((item) => item.id === parts[1]) || notFound('Escuela')
    Object.assign(result, input)
  } else if (method === 'DELETE' && parts[0] === 'schools') {
    state.schools = state.schools.filter((item) => item.id !== parts[1])
    result = null
  } else if (method === 'POST' && parts[0] === 'school-grades' && parts[2] === 'exams') {
    const grade = state.schools.flatMap((school) => school.grades).find((item) => item.id === parts[1]) || notFound('Grado')
    let subject = grade.subjects.find((item) => item.name.toLowerCase() === input.subjectName.toLowerCase())
    if (!subject) { subject = { id: crypto.randomUUID(), name: input.subjectName, assessments: [] }; grade.subjects.push(subject) }
    result = { id: crypto.randomUUID(), title: input.title || 'Examen', type: 'exam', date: input.date, notes: input.notes || '' }
    subject.assessments.push(result)
  } else if (method === 'DELETE' && parts[0] === 'assessments') {
    state.schools.forEach((school) => school.grades.forEach((grade) => grade.subjects.forEach((subject) => {
      subject.assessments = subject.assessments.filter((item) => item.id !== parts[1])
    })))
    result = null
  } else if (method === 'GET' && parts[0] === 'teachers') result = [...state.teachers].sort(byName)
  else if (method === 'POST' && parts[0] === 'teachers') { result = { id: crypto.randomUUID(), ...input }; state.teachers.push(result) }
  else if (method === 'PATCH' && parts[0] === 'teachers') { result = state.teachers.find((item) => item.id === parts[1]) || notFound('Maestra'); Object.assign(result, input) }
  else if (method === 'DELETE' && parts[0] === 'teachers') { state.teachers = state.teachers.filter((item) => item.id !== parts[1]); result = null }
  else if (method === 'GET' && parts[0] === 'schedules') result = state.schedules
  else if (method === 'POST' && parts[0] === 'schedules') { result = { id: crypto.randomUUID(), ...input }; state.schedules.push(result) }
  else if (method === 'DELETE' && parts[0] === 'schedules') { state.schedules = state.schedules.filter((item) => item.id !== parts[1]); result = null }
  else throw new Error(`La operación demo ${method} ${url.pathname} todavía no está disponible.`)

  if (method !== 'GET') saveState(state)
  return clone(result)
}
