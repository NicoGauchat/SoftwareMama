import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { requestDb, statement } from './db.js'

const COOKIE_NAME = 'softwaremama_session'
const SESSION_SECONDS = 60 * 60 * 24 * 30
const LOGIN_WINDOW_SECONDS = 15 * 60
const LOGIN_MAX_FAILURES = 5
const encoder = new TextEncoder()

function toBase64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function fromBase64Url(value) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function signingKey(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

async function sign(value, secret) {
  const signature = await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(value))
  return toBase64Url(new Uint8Array(signature))
}

async function loginIdentifier(c) {
  requireAuthEnv(c.env)
  const address = c.req.header('CF-Connecting-IP')
    || c.req.header('X-Forwarded-For')?.split(',')[0]?.trim()
    || 'unknown'
  return sign(`login:${address}`, c.env.SESSION_SECRET)
}

async function verify(value, signature, secret) {
  try {
    return crypto.subtle.verify('HMAC', await signingKey(secret), fromBase64Url(signature), encoder.encode(value))
  } catch {
    return false
  }
}

function requireAuthEnv(env) {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    throw new Error('Faltan ADMIN_PASSWORD o SESSION_SECRET (mínimo 32 caracteres)')
  }
}

export async function passwordMatches(candidate, env) {
  requireAuthEnv(env)
  const expected = await crypto.subtle.digest('SHA-256', encoder.encode(env.ADMIN_PASSWORD))
  const received = await crypto.subtle.digest('SHA-256', encoder.encode(candidate || ''))
  const a = new Uint8Array(expected)
  const b = new Uint8Array(received)
  let difference = 0
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index]
  return difference === 0
}

export async function loginBlocked(c) {
  const identifier = await loginIdentifier(c)
  const now = Math.floor(Date.now() / 1000)
  const result = await requestDb(c).execute(statement(
    `SELECT blocked_until FROM login_attempts WHERE identifier=?`,
    [identifier],
  ))
  const blockedUntil = Number(result.rows[0]?.blocked_until || 0)
  return blockedUntil > now ? blockedUntil - now : 0
}

export async function recordFailedLogin(c) {
  const identifier = await loginIdentifier(c)
  const now = Math.floor(Date.now() / 1000)
  const result = await requestDb(c).execute(statement(
    `INSERT INTO login_attempts (identifier,failed_count,first_failed_at,blocked_until)
      VALUES (?,1,?,0)
      ON CONFLICT(identifier) DO UPDATE SET
        failed_count=CASE
          WHEN ?-login_attempts.first_failed_at>=? THEN 1
          ELSE login_attempts.failed_count+1
        END,
        first_failed_at=CASE
          WHEN ?-login_attempts.first_failed_at>=? THEN ?
          ELSE login_attempts.first_failed_at
        END,
        blocked_until=CASE
          WHEN ?-login_attempts.first_failed_at>=? THEN 0
          WHEN login_attempts.failed_count+1>=? THEN ?+?
          ELSE login_attempts.blocked_until
        END
      RETURNING failed_count,blocked_until`,
    [
      identifier, now,
      now, LOGIN_WINDOW_SECONDS,
      now, LOGIN_WINDOW_SECONDS, now,
      now, LOGIN_WINDOW_SECONDS,
      LOGIN_MAX_FAILURES, now, LOGIN_WINDOW_SECONDS,
    ],
  ))
  const blockedUntil = Number(result.rows[0]?.blocked_until || 0)
  return blockedUntil > now ? blockedUntil - now : 0
}

export async function clearFailedLogins(c) {
  const identifier = await loginIdentifier(c)
  await requestDb(c).execute(statement(`DELETE FROM login_attempts WHERE identifier=?`, [identifier]))
}

export async function createSession(c) {
  requireAuthEnv(c.env)
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS
  const payload = toBase64Url(encoder.encode(JSON.stringify({ expiresAt })))
  const signature = await sign(payload, c.env.SESSION_SECRET)
  setCookie(c, COOKIE_NAME, `${payload}.${signature}`, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Strict',
    path: '/',
    maxAge: SESSION_SECONDS,
  })
}

export async function hasSession(c) {
  requireAuthEnv(c.env)
  const cookie = getCookie(c, COOKIE_NAME)
  if (!cookie) return false
  const [payload, signature, extra] = cookie.split('.')
  if (!payload || !signature || extra || !(await verify(payload, signature, c.env.SESSION_SECRET))) return false
  try {
    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)))
    return Number.isFinite(data.expiresAt) && data.expiresAt > Date.now() / 1000
  } catch {
    return false
  }
}

export function clearSession(c) {
  deleteCookie(c, COOKIE_NAME, { path: '/', secure: new URL(c.req.url).protocol === 'https:' })
}

export async function requireSession(c, next) {
  if (!(await hasSession(c))) return c.json({ error: 'Tenés que iniciar sesión.' }, 401)
  await next()
}
