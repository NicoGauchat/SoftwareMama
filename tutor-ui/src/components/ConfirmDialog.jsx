import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'

export default function ConfirmDialog({ dialog, onClose }) {
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  useEffect(() => {
    busyRef.current = false
    setBusy(false)
  }, [dialog])

  if (!dialog) return null
  const confirm = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await dialog.onConfirm()
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  return createPortal(
    <div className="modal-backdrop fixed inset-0 z-50 flex items-end bg-slate-950/80 p-4 backdrop-blur-sm sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="modal-panel w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-7 shadow-2xl">
        <h2 id="dialog-title" className="text-2xl font-bold text-white">{dialog.title}</h2>
        <p className="mt-3 text-lg text-slate-300">{dialog.message}</p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <button disabled={busy} onClick={onClose} className="secondary-button min-h-16 rounded-2xl bg-slate-800 px-5 text-lg font-bold text-white disabled:cursor-wait disabled:opacity-60">No, volver</button>
          <button disabled={busy} onClick={confirm} className={`confirm-button min-h-16 rounded-2xl px-5 text-lg font-bold disabled:cursor-wait disabled:opacity-60 ${dialog.danger ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-emerald-950'}`}>{busy ? 'Procesando...' : dialog.confirmLabel || 'Sí, continuar'}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
