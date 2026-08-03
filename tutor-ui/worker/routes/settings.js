import { requestDb, statement } from '../db.js'
import { dbError, jsonBody, number } from '../helpers.js'

const settingSelect = `SELECT value FROM app_settings WHERE key=?`

async function hourlyPrice(db) {
  const result = await db.execute(statement(settingSelect, ['hourly_price']))
  return Number(result.rows[0]?.value || 1)
}

export function registerSettingsRoutes(app) {
  app.get('/api/v1/settings', async (c) => {
    try {
      return c.json({ hourlyPrice: await hourlyPrice(requestDb(c)) })
    } catch (error) { return dbError(c, error) }
  })

  app.patch('/api/v1/settings', async (c) => {
    const body = await jsonBody(c)
    const price = number(body?.hourlyPrice)
    if (price <= 0) return c.json({ error: 'El precio por hora debe ser mayor a cero.' }, 400)
    try {
      const db = requestDb(c)
      await db.batch([
        statement(`INSERT INTO app_settings (key,value,updated_at) VALUES ('hourly_price',?,?)
          ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`, [String(price), new Date().toISOString()]),
        statement(`UPDATE students SET hourly_rate=?`, [price]),
        statement(`UPDATE lessons SET hourly_rate=?,version=version+1 WHERE status='scheduled' AND amount=0 AND date>=?`, [price, new Date().toISOString()]),
      ], 'write')
      return c.json({ hourlyPrice: price })
    } catch (error) { return dbError(c, error) }
  })
}

export async function currentHourlyPrice(db) {
  return hourlyPrice(db)
}
