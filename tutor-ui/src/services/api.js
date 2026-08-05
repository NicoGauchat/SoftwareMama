const API_URL = '/api/v1'

async function request(path, options = {}) {
  if (import.meta.env.VITE_DEMO_MODE === 'true') {
    const { demoRequest } = await import('./demoApi')
    return demoRequest(path, options)
  }
  const response = await fetch(`${API_URL}${path}`, { headers: { 'Content-Type': 'application/json', ...options.headers }, ...options })
  if (response.status === 401) window.dispatchEvent(new Event('softwaremama:auth-required'))
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'No se pudo conectar con el servidor.')
  return response.status === 204 ? null : response.json()
}

export const getLessons = (date) => request(`/lessons?date=${date}`)
export const getLessonsRange = (from, to) => request(`/lessons/range?from=${from}&to=${to}`)
export const getTodayLessons = (date) => getLessons(date)
export const createLesson = (data) => request('/lessons', { method: 'POST', body: JSON.stringify(data) })
export const completeLesson = (id, data) => request(`/lessons/${id}/complete`, { method: 'PATCH', body: JSON.stringify(data) })
export const prepayLesson = (id, paymentMethod) => request(`/lessons/${id}/prepay`, { method: 'PATCH', body: JSON.stringify({ paymentMethod }) })
export const updateLessonRate = (id, hourlyRate) => request(`/lessons/${id}/rate`, { method: 'PATCH', body: JSON.stringify({ hourlyRate }) })
export const cancelLesson = (id) => request(`/lessons/${id}/cancel`, { method: 'PATCH' })
export const rescheduleLesson = (id, date) => request(`/lessons/${id}/reschedule`, { method: 'PATCH', body: JSON.stringify({ date }) })
export const reopenLesson = (id) => request(`/lessons/${id}/reopen`, { method: 'PATCH' })
export const registerLessonPayment = (id, amount, paymentMethod) => request(`/lessons/${id}/payment`, { method: 'PATCH', body: JSON.stringify({ amount, paymentMethod }) })
export const resetLessonPayment = (id) => request(`/lessons/${id}/payment/reset`, { method: 'PATCH' })
export const registerBatchPayment = (lessonIds, amount, paymentMethod) => request('/payments', { method: 'POST', body: JSON.stringify({ lessonIds, amount, paymentMethod }) })

export const getStudents = () => request('/students')
export const createStudent = (data) => request('/students', { method: 'POST', body: JSON.stringify(data) })
export const updateStudent = (id, data) => request(`/students/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deactivateStudent = (id) => request(`/students/${id}/inactive`, { method: 'PATCH' })
export const activateStudent = (id) => request(`/students/${id}/active`, { method: 'PATCH' })
export const deleteStudent = (id) => request(`/students/${id}`, { method: 'DELETE' })
export const getStudentAssessments = (id) => request(`/students/${id}/assessments`)
export const createStudentAssessment = (id, data) => request(`/students/${id}/assessments`, { method: 'POST', body: JSON.stringify(data) })
export const deleteStudentAssessment = (id) => request(`/student-assessments/${id}`, { method: 'DELETE' })

export const getSchools = () => request('/schools')
export const createSchool = (data) => request('/schools', { method: 'POST', body: JSON.stringify(data) })
export const updateSchool = (id, data) => request(`/schools/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteSchool = (id) => request(`/schools/${id}`, { method: 'DELETE' })
export const createSchoolGrade = (schoolId, grade) => request(`/schools/${schoolId}/grades`, { method: 'POST', body: JSON.stringify({ grade }) })
export const deleteSchoolGrade = (id) => request(`/school-grades/${id}`, { method: 'DELETE' })
export const createGradeExam = (gradeId, data) => request(`/school-grades/${gradeId}/exams`, { method: 'POST', body: JSON.stringify(data) })
export const createSubject = (groupId, name) => request(`/school-groups/${groupId}/subjects`, { method: 'POST', body: JSON.stringify({ name }) })
export const deleteSubject = (id) => request(`/subjects/${id}`, { method: 'DELETE' })
export const createAssessment = (subjectId, data) => request(`/subjects/${subjectId}/assessments`, { method: 'POST', body: JSON.stringify(data) })
export const deleteAssessment = (id) => request(`/assessments/${id}`, { method: 'DELETE' })

export const getSettings = () => request('/settings')
export const updateSettings = (data) => request('/settings', { method: 'PATCH', body: JSON.stringify(data) })

export const getWeeklySchedules = () => request('/schedules')
export const createWeeklySchedule = (data) => request('/schedules', { method: 'POST', body: JSON.stringify(data) })
export const deleteWeeklySchedule = (id) => request(`/schedules/${id}`, { method: 'DELETE' })

export const getTeachers = () => request('/teachers')
export const createTeacher = (data) => request('/teachers', { method: 'POST', body: JSON.stringify(data) })
export const updateTeacher = (id, data) => request(`/teachers/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteTeacher = (id) => request(`/teachers/${id}`, { method: 'DELETE' })
