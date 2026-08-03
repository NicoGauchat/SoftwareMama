import { createClient } from '@tursodatabase/serverless/compat'

const schemaReady = new Set()

const initialTables = [
  `CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, school TEXT NOT NULL DEFAULT '',
    grade INTEGER NOT NULL DEFAULT 0 CHECK(grade BETWEEN 0 AND 7), hourly_rate REAL NOT NULL,
    notes TEXT NOT NULL DEFAULT '', is_active INTEGER NOT NULL DEFAULT 1,
    birth_date TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS guardians (
    id TEXT PRIMARY KEY, student_id TEXT NOT NULL, name TEXT NOT NULL,
    relationship TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS teacher_contacts (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, school TEXT NOT NULL DEFAULT '',
    phone_number TEXT NOT NULL DEFAULT '', subject TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS base_schedules (
    id TEXT PRIMARY KEY, student_id TEXT NOT NULL, day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
    start_time TEXT NOT NULL, duration_minutes INTEGER NOT NULL CHECK(duration_minutes > 0),
    FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS lessons (
    id TEXT PRIMARY KEY, student_id TEXT NOT NULL, date TEXT NOT NULL,
    real_duration_minutes INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK(status IN ('scheduled','completed','cancelled')),
    attendance TEXT NOT NULL DEFAULT 'present' CHECK(attendance IN ('present','absent_excused','absent_unexcused')),
    payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('paid','pending')),
    amount REAL NOT NULL DEFAULT 0, hourly_rate REAL NOT NULL DEFAULT 0,
    paid_amount REAL NOT NULL DEFAULT 0, payment_method TEXT NOT NULL DEFAULT '',
    cash_paid_amount REAL NOT NULL DEFAULT 0, transfer_paid_amount REAL NOT NULL DEFAULT 0,
    topic_notes TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(student_id) REFERENCES students(id)
  )`,
  `CREATE TABLE IF NOT EXISTS schools (
    id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, address TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS school_groups (
    id TEXT PRIMARY KEY, school_id TEXT NOT NULL, name TEXT NOT NULL DEFAULT '',
    grade INTEGER NOT NULL CHECK(grade BETWEEN 1 AND 7), UNIQUE(school_id, grade),
    FOREIGN KEY(school_id) REFERENCES schools(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY, school_group_id TEXT NOT NULL, name TEXT NOT NULL,
    UNIQUE(school_group_id, name), FOREIGN KEY(school_group_id) REFERENCES school_groups(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS assessments (
    id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, title TEXT NOT NULL, type TEXT NOT NULL,
    date TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS student_assessments (
    id TEXT PRIMARY KEY, student_id TEXT NOT NULL, subject_name TEXT NOT NULL,
    title TEXT NOT NULL, type TEXT NOT NULL, date TEXT NOT NULL, score REAL, notes TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
  )`,
]

const initialColumns = [
  ['students', 'birth_date', `TEXT NOT NULL DEFAULT ''`],
  ['students', 'phone', `TEXT NOT NULL DEFAULT ''`],
  ['students', 'email', `TEXT NOT NULL DEFAULT ''`],
  ['students', 'grade', `INTEGER NOT NULL DEFAULT 0`],
  ['students', 'hourly_rate', `REAL NOT NULL DEFAULT 1`],
  ['guardians', 'email', `TEXT NOT NULL DEFAULT ''`],
  ['teacher_contacts', 'email', `TEXT NOT NULL DEFAULT ''`],
  ['lessons', 'hourly_rate', `REAL NOT NULL DEFAULT 0`],
  ['lessons', 'paid_amount', `REAL NOT NULL DEFAULT 0`],
  ['lessons', 'payment_method', `TEXT NOT NULL DEFAULT ''`],
  ['lessons', 'cash_paid_amount', `REAL NOT NULL DEFAULT 0`],
  ['lessons', 'transfer_paid_amount', `REAL NOT NULL DEFAULT 0`],
  ['school_groups', 'school_id', `TEXT NOT NULL DEFAULT ''`],
]

const initialIndexes = [
  `CREATE INDEX IF NOT EXISTS idx_lessons_date ON lessons(date)`,
  `CREATE INDEX IF NOT EXISTS idx_lessons_student_id ON lessons(student_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_students_unique_identity ON students(lower(trim(name)), birth_date)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_lessons_unique_active_slot ON lessons(student_id, date) WHERE status <> 'cancelled'`,
  `CREATE INDEX IF NOT EXISTS idx_assessments_date ON assessments(date)`,
  `CREATE INDEX IF NOT EXISTS idx_student_assessments_student ON student_assessments(student_id, date)`,
]

function requireDatabaseEnv(env) {
  if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) {
    throw new Error('Faltan TURSO_DATABASE_URL o TURSO_AUTH_TOKEN')
  }
}

function databaseKey(env) {
  return `${env.TURSO_DATABASE_URL}|${env.TURSO_AUTH_TOKEN}`
}

export function getDb(env) {
  requireDatabaseEnv(env)
  return createClient({
    url: env.TURSO_DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  })
}

export function requestDb(c) {
  return c.get('db') || getDb(c.env)
}

async function existingColumns(db, table) {
  const result = await db.execute(`PRAGMA table_info(${table})`)
  return new Set(result.rows.map((row) => row.name))
}

async function ensureColumns(db, columns) {
  const grouped = new Map()
  for (const [table, name, definition] of columns) {
    if (!grouped.has(table)) grouped.set(table, [])
    grouped.get(table).push([name, definition])
  }
  for (const [table, items] of grouped) {
    const present = await existingColumns(db, table)
    for (const [name, definition] of items) {
      if (present.has(name)) continue
      try {
        await db.execute(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`)
      } catch (error) {
        if (!/duplicate column name/i.test(String(error?.message || error))) throw error
      }
    }
  }
}

async function migrationApplied(db, version) {
  const result = await db.execute(statement(`SELECT 1 FROM schema_migrations WHERE version=?`, [version]))
  return result.rows.length > 0
}

async function recordMigration(db, version) {
  await db.execute(statement(`INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?,?)`, [version, new Date().toISOString()]))
}

async function migrateInitialSchema(db) {
  if (await migrationApplied(db, 1)) return
  await db.batch(initialTables, 'write')
  await ensureColumns(db, initialColumns)
  await db.execute(`UPDATE lessons SET paid_amount=amount WHERE payment_status='paid' AND paid_amount=0`)
  await db.execute(`UPDATE lessons SET cash_paid_amount=paid_amount WHERE payment_method='cash' AND paid_amount>0 AND cash_paid_amount=0 AND transfer_paid_amount=0`)
  await db.execute(`UPDATE lessons SET transfer_paid_amount=paid_amount WHERE payment_method='transfer' AND paid_amount>0 AND cash_paid_amount=0 AND transfer_paid_amount=0`)
  await db.batch(initialIndexes, 'write')
  await recordMigration(db, 1)
}

async function migrateCloudSettingsAndAddress(db) {
  if (await migrationApplied(db, 2)) return
  await ensureColumns(db, [
    ['students', 'address', `TEXT NOT NULL DEFAULT ''`],
    ['lessons', 'version', `INTEGER NOT NULL DEFAULT 0`],
  ])
  await db.batch([
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS login_attempts (
      identifier TEXT PRIMARY KEY, failed_count INTEGER NOT NULL DEFAULT 0,
      first_failed_at INTEGER NOT NULL DEFAULT 0, blocked_until INTEGER NOT NULL DEFAULT 0
    )`,
    `INSERT OR IGNORE INTO app_settings (key,value,updated_at)
      SELECT 'hourly_price',CAST(hourly_rate AS TEXT),datetime('now')
      FROM lessons WHERE hourly_rate>0 ORDER BY date DESC LIMIT 1`,
    `INSERT OR IGNORE INTO app_settings (key,value,updated_at)
      SELECT 'hourly_price',CAST(hourly_rate AS TEXT),datetime('now')
      FROM students WHERE hourly_rate>0 LIMIT 1`,
    `INSERT OR IGNORE INTO app_settings (key,value,updated_at)
      VALUES ('hourly_price','1',datetime('now'))`,
  ], 'write')
  await recordMigration(db, 2)
}

export async function ensureSchema(env) {
  const key = databaseKey(env)
  const db = getDb(env)
  await db.execute('PRAGMA foreign_keys = ON')
  if (!schemaReady.has(key)) {
    await db.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL
    )`)
    await migrateInitialSchema(db)
    await migrateCloudSettingsAndAddress(db)
    schemaReady.add(key)
  }
  return db
}

export const statement = (sql, args = []) => ({ sql, args })
