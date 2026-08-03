async function authRequest(path, options = {}) {
  if (import.meta.env.VITE_DEMO_MODE === 'true') return { authenticated: true }
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'No se pudo conectar con el servidor.')
  return data
}

export const getAuthStatus = () => authRequest('/auth/status')
export const login = (password) => authRequest('/auth/login', { method: 'POST', body: JSON.stringify({ password }) })
export const logout = () => authRequest('/auth/logout', { method: 'POST' })
