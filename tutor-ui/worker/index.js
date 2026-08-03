import { Hono } from 'hono'
import {
  clearFailedLogins,
  clearSession,
  createSession,
  hasSession,
  loginBlocked,
  passwordMatches,
  recordFailedLogin,
  requireSession,
} from './auth.js'
import { ensureSchema } from './db.js'
import { jsonBody } from './helpers.js'
import { registerAcademicRoutes } from './routes/academics.js'
import { registerContactRoutes } from './routes/contacts.js'
import { registerLessonRoutes } from './routes/lessons.js'
import { registerSettingsRoutes } from './routes/settings.js'
import { registerStudentRoutes } from './routes/students.js'

const app = new Hono()

app.get('/health', (c) => c.json({ status: 'ok' }))

app.get('/auth/status', async (c) => c.json({ authenticated: await hasSession(c) }))
app.post('/auth/login', async (c) => {
  c.set('db', await ensureSchema(c.env))
  const retryAfter = await loginBlocked(c)
  if (retryAfter > 0) {
    c.header('Retry-After', String(retryAfter))
    return c.json({ error: 'Hubo demasiados intentos. Esperá unos minutos y probá nuevamente.' }, 429)
  }
  const body = await jsonBody(c)
  if (!(await passwordMatches(body?.password, c.env))) {
    const blockedFor = await recordFailedLogin(c)
    if (blockedFor > 0) {
      c.header('Retry-After', String(blockedFor))
      return c.json({ error: 'Hubo demasiados intentos. Esperá unos minutos y probá nuevamente.' }, 429)
    }
    return c.json({ error: 'La contraseña no es correcta.' }, 401)
  }
  await clearFailedLogins(c)
  await createSession(c)
  return c.json({ authenticated: true })
})
app.post('/auth/logout', (c) => {
  clearSession(c)
  return c.json({ authenticated: false })
})

app.use('/api/v1/*', requireSession)
app.use('/api/v1/*', async (c, next) => {
  c.set('db', await ensureSchema(c.env))
  await next()
})

registerStudentRoutes(app)
registerContactRoutes(app)
registerLessonRoutes(app)
registerAcademicRoutes(app)
registerSettingsRoutes(app)

app.notFound((c) => c.json({ error: 'Ruta no encontrada.' }, 404))
app.onError((error, c) => {
  console.error(error)
  return c.json({
    error: 'Ocurrió un error interno.',
    ...(c.env.DEBUG_ERRORS === 'true' ? { diagnostic: String(error?.message || error) } : {}),
  }, 500)
})

export default app
