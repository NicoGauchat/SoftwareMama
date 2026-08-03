import { useRef, useState } from 'react'
import { GraduationCap, LockKeyhole } from 'lucide-react'
import { login } from '../services/auth'

export default function LoginScreen({ onLogin }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const loginInFlight = useRef(false)

  const submit = async (event) => {
    event.preventDefault()
    if (loginInFlight.current) return
    loginInFlight.current = true
    setLoading(true)
    setError('')
    try {
      await login(password)
      onLogin()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      loginInFlight.current = false
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl sm:p-10">
        <div className="mb-8 flex items-center gap-4">
          <span className="rounded-2xl bg-indigo-500 p-3 text-white"><GraduationCap size={34} /></span>
          <div>
            <h1 className="text-2xl font-bold text-white">Mis clases</h1>
            <p className="text-sm font-semibold text-slate-400">Ingresá para ver la agenda</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-5">
          <label className="block text-sm font-bold text-slate-200">
            Contraseña
            <span className="mt-2 flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-950 px-4 focus-within:border-indigo-400">
              <LockKeyhole size={20} className="text-slate-500" />
              <input
                autoFocus
                required
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-w-0 flex-1 bg-transparent py-3.5 text-base text-white outline-none"
                autoComplete="current-password"
              />
            </span>
          </label>
          {error && <p role="alert" className="rounded-xl bg-rose-950 px-4 py-3 text-sm font-semibold text-rose-200">{error}</p>}
          <button disabled={loading} className="w-full rounded-xl bg-indigo-500 px-5 py-3.5 text-base font-bold text-white hover:bg-indigo-400 disabled:opacity-60">
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </section>
    </main>
  )
}
