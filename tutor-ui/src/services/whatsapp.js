const relationshipLabel = (value) => ({
  father: 'Papá',
  mother: 'Mamá',
  relative: 'Familiar',
  other: 'Tutor/a',
}[value] || value || 'Tutor/a')

const isWhatsappPhone = (value) => {
  const raw = String(value || '').trim()
  const digits = raw.replace(/\D/g, '')
  return Boolean(raw) && !/[a-záéíóúñ]/i.test(raw) && digits.length >= 8 && digits.length <= 15
}

export function whatsappContactsFor(student) {
  const candidates = []
  if (isWhatsappPhone(student.phone)) {
    candidates.push({
      id: `student-${student.id}`,
      name: student.name,
      detail: 'Alumno/a',
      phone: student.phone.trim(),
    })
  }
  ;(student.guardians || []).forEach((guardian, index) => {
    if (!isWhatsappPhone(guardian.phone)) return
    candidates.push({
      id: guardian.id || `guardian-${index}`,
      name: guardian.name,
      detail: relationshipLabel(guardian.relationship),
      phone: guardian.phone.trim(),
    })
  })

  const seen = new Set()
  return candidates.filter((contact) => {
    const phone = contact.phone.replace(/\D/g, '')
    if (!phone || seen.has(phone)) return false
    seen.add(phone)
    return true
  })
}

export function normalizeWhatsappPhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = digits.slice(1)
  if (!digits.startsWith('54') && digits.length === 10) return `549${digits}`
  if (digits.startsWith('54') && !digits.startsWith('549') && digits.length === 12) {
    return `549${digits.slice(2)}`
  }
  return digits
}

export function monthlyWhatsappMessage({ monthName, year, account }) {
  const money = (value) => `$${Number(value || 0).toLocaleString('es-AR')}`
  const paymentLine = account.due > 0
    ? `Saldo pendiente: ${money(account.due)}`
    : 'Estado: mes abonado completo'

  return [
    `Hola, te paso el resumen de ${monthName} ${year} de ${account.student.name}:`,
    `• Clases: ${account.lessons.length}`,
    `• Total del mes: ${money(account.total)}`,
    `• Pagado: ${money(account.paid)}`,
    `• ${paymentLine}`,
  ].join('\n')
}

export function openWhatsappSummary({ phone, message }) {
  const normalizedPhone = normalizeWhatsappPhone(phone)
  if (!normalizedPhone) throw new Error('El contacto no tiene un teléfono válido.')
  window.open(
    `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`,
    '_blank',
    'noopener,noreferrer',
  )
}
