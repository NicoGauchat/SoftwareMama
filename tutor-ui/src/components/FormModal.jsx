import { X } from 'lucide-react'
import { createPortal } from 'react-dom'

export default function FormModal({ title, children, onClose }) {
  return createPortal(
    <div className="modal-backdrop fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="modal-panel mx-auto my-6 w-full max-w-3xl rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl sm:p-8">
        <div className="modal-heading mb-6 flex items-center justify-between gap-4">
          <h2 className="text-3xl font-bold text-white">{title}</h2>
          <button onClick={onClose} className="modal-close rounded-xl bg-slate-800 p-3 text-white" aria-label="Cerrar"><X size={25} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
