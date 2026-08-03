const ARS_FORMAT = '"$" #,##0.00'
const REPORT_TIME_ZONE = 'America/Argentina/Buenos_Aires'
const COLORS = {
  navy: '#0f172a',
  slate: '#334155',
  indigo: '#4f46e5',
  white: '#ffffff',
  paleBlue: '#e0e7ff',
  paleGreen: '#dcfce7',
  paleOrange: '#ffedd5',
  paleRed: '#fee2e2',
  green: '#166534',
  blue: '#3730a3',
  orange: '#9a3412',
}

const titleCell = (value, columnSpan) => ({
  value,
  columnSpan,
  height: 38,
  fontSize: 22,
  fontWeight: 'bold',
  color: COLORS.navy,
  backgroundColor: COLORS.paleBlue,
  alignVertical: 'center',
})

const subtitleCell = (value, columnSpan) => ({
  value,
  columnSpan,
  height: 26,
  fontSize: 12,
  color: COLORS.slate,
  alignVertical: 'center',
})

const headerCell = (value) => ({
  value,
  height: 30,
  fontWeight: 'bold',
  color: COLORS.navy,
  backgroundColor: '#c7d2fe',
  align: 'center',
  alignVertical: 'center',
  borderColor: COLORS.white,
  bottomBorderStyle: 'thin',
})

const textCell = (value, backgroundColor = COLORS.white) => ({
  value,
  type: String,
  height: 25,
  backgroundColor,
  alignVertical: 'center',
})

const numberCell = (value, format, backgroundColor = COLORS.white) => ({
  value: Number(value || 0),
  type: Number,
  format,
  height: 25,
  backgroundColor,
  alignVertical: 'center',
})

const paidFor = (lesson) => Number(
  lesson.paidAmount ?? (lesson.paymentStatus === 'paid' ? lesson.amount : 0),
)
const paymentMethodLabel = (value) => ({
  cash: 'Efectivo',
  transfer: 'Transferencia',
  mixed: 'Mixto',
}[value] || 'Sin especificar')
const lessonDateParts = (value) => Object.fromEntries(
  new Intl.DateTimeFormat('en-US', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date(value))
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, Number(part.value)]),
)
const paymentTotalsFor = (lessons) => lessons
  .filter((lesson) => lesson.status === 'completed' && paidFor(lesson) > 0)
  .reduce((totals, lesson) => {
    const paid = paidFor(lesson)
    const cash = Number(lesson.cashPaidAmount)
    const transfer = Number(lesson.transferPaidAmount)
    if (Number.isFinite(cash) && Number.isFinite(transfer)) {
      totals.cash += cash
      totals.transfer += transfer
      const unmatched = paid - cash - transfer
      if (unmatched > 0.001) totals.unspecified += unmatched
      return totals
    }
    const method = ['cash', 'transfer', 'mixed'].includes(lesson.paymentMethod)
      ? lesson.paymentMethod
      : 'unspecified'
    totals[method] += paid
    return totals
  }, { cash: 0, transfer: 0, mixed: 0, unspecified: 0 })

export async function exportMonthlyReport({
  monthName,
  year,
  accounts,
  lessons,
  metrics,
  reportTitle = 'Resumen mensual de clases y cobros',
  downloadName = `Resumen-${monthName}-${year}.xlsx`,
  studentAccount = null,
}) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const subtitle = `${monthName} ${year} · Generado el ${new Date().toLocaleDateString('es-AR')}`
  const paymentTotals = paymentTotalsFor(lessons)
  const summaryColumnCount = studentAccount ? 7 : 4

  const summaryRows = [
    [titleCell(reportTitle, summaryColumnCount), ...Array(summaryColumnCount - 1).fill(null)],
    [subtitleCell(subtitle, summaryColumnCount), ...Array(summaryColumnCount - 1).fill(null)],
  ]
  const metricRows = studentAccount
    ? [
        ['Total facturado', metrics.totalBilled, 'Total cobrado', metrics.totalPaid, 'currency', 'currency'],
        ['Cobrado en efectivo', paymentTotals.cash, 'Cobrado por transferencia', paymentTotals.transfer, 'currency', 'currency'],
        ['Total pendiente', metrics.totalDue, 'Clases dadas', metrics.attendedLessons, 'currency', 'number'],
        ['Asistencia', metrics.attendanceRate, '', null, 'percent', 'empty'],
      ]
    : [
        ['Total facturado', metrics.totalBilled, 'Total cobrado', metrics.totalPaid, 'currency', 'currency'],
        ['Cobrado en efectivo', paymentTotals.cash, 'Cobrado por transferencia', paymentTotals.transfer, 'currency', 'currency'],
        ['Total pendiente', metrics.totalDue, 'Alumnos con deuda', metrics.studentsWithDebt, 'currency', 'number'],
        ['Clases dadas', metrics.attendedLessons, 'Ausencias', metrics.absentLessons, 'number', 'number'],
        ['Asistencia', metrics.attendanceRate, 'Promedio por clase', metrics.averagePerClass, 'percent', 'currency'],
      ]
  const unclassifiedPayments = paymentTotals.mixed + paymentTotals.unspecified
  if (unclassifiedPayments > 0) {
    metricRows.splice(2, 0, [
      'Mixto o sin especificar',
      unclassifiedPayments,
      '',
      null,
      'currency',
      'empty',
    ])
  }
  metricRows.forEach(([label1, value1, label2, value2, type1, type2], index) => {
    const background = index % 2 ? COLORS.white : COLORS.paleBlue
    const value = (number, type) => ({
      ...numberCell(
        number,
        type === 'currency' ? ARS_FORMAT : type === 'percent' ? '0.0%' : '#,##0',
        background,
      ),
      fontSize: 15,
      fontWeight: 'bold',
      color: COLORS.navy,
    })
    const row = [
      { ...textCell(label1, background), fontWeight: 'bold', color: COLORS.slate },
      value(value1, type1),
      label2
        ? { ...textCell(label2, background), fontWeight: 'bold', color: COLORS.slate }
        : textCell('', background),
      type2 === 'empty' ? textCell('', background) : value(value2, type2),
    ]
    while (row.length < summaryColumnCount) row.push(textCell('', background))
    summaryRows.push(row)
  })
  summaryRows.push([])
  if (studentAccount) {
    summaryRows.push([
      headerCell('Clase'),
      headerCell('Valor de la clase'),
      headerCell('Pagó'),
      headerCell('En efectivo'),
      headerCell('Por transferencia'),
      headerCell('Método de pago'),
      headerCell('Debe'),
    ])
    studentAccount.lessons.forEach((lesson, index) => {
      const background = index % 2 ? COLORS.white : '#f8fafc'
      const { month: lessonMonth, day: lessonDay } = lessonDateParts(lesson.date)
      const paid = paidFor(lesson)
      const due = Math.max(0, Number(lesson.amount || 0) - paid)
      summaryRows.push([
        textCell(`Clase ${Number(lessonDay)}/${Number(lessonMonth)}`, background),
        numberCell(lesson.amount, ARS_FORMAT, background),
        numberCell(paid, ARS_FORMAT, background),
        numberCell(Number(lesson.cashPaidAmount || 0), ARS_FORMAT, background),
        numberCell(Number(lesson.transferPaidAmount || 0), ARS_FORMAT, background),
        textCell(paid > 0 ? paymentMethodLabel(lesson.paymentMethod) : '—', background),
        {
          ...numberCell(due, ARS_FORMAT, background),
          fontWeight: 'bold',
          color: due > 0 ? COLORS.orange : COLORS.green,
        },
      ])
    })
    summaryRows.push([
      { ...textCell('TOTAL', COLORS.paleBlue), fontWeight: 'bold', color: COLORS.navy },
      { ...numberCell(studentAccount.total, ARS_FORMAT, COLORS.paleBlue), fontWeight: 'bold' },
      { ...numberCell(studentAccount.paid, ARS_FORMAT, COLORS.paleBlue), fontWeight: 'bold' },
      { ...numberCell(paymentTotals.cash, ARS_FORMAT, COLORS.paleBlue), fontWeight: 'bold' },
      { ...numberCell(paymentTotals.transfer, ARS_FORMAT, COLORS.paleBlue), fontWeight: 'bold' },
      { ...textCell('—', COLORS.paleBlue), fontWeight: 'bold', align: 'center' },
      {
        ...numberCell(studentAccount.due, ARS_FORMAT, COLORS.paleBlue),
        fontWeight: 'bold',
        color: studentAccount.due > 0 ? COLORS.orange : COLORS.green,
      },
    ])
  } else {
    summaryRows.push([
      headerCell('Alumno'),
      headerCell('Total del mes'),
      headerCell('Pagó'),
      headerCell('Debe'),
    ])
    accounts.forEach((account, index) => {
      const background = index % 2 ? COLORS.white : '#f8fafc'
      summaryRows.push([
        textCell(account.student.name, background),
        numberCell(account.total, ARS_FORMAT, background),
        numberCell(account.paid, ARS_FORMAT, background),
        {
          ...numberCell(account.due, ARS_FORMAT, background),
          fontWeight: 'bold',
          color: account.due > 0 ? COLORS.orange : COLORS.green,
        },
      ])
    })
  }

  const studentNames = new Map(accounts.map((account) => [
    account.student.id,
    account.student.name,
  ]))
  const detailRows = [
    [titleCell('Detalle de clases', 11), null, null, null, null, null, null, null, null, null, null],
    [subtitleCell(subtitle, 11), null, null, null, null, null, null, null, null, null, null],
    [
      headerCell('Fecha', 14),
      headerCell('Alumno', 28),
      headerCell('Horario', 12),
      headerCell('Duración', 14),
      headerCell('Asistencia', 16),
      headerCell('Precio por hora', 18),
      headerCell('Valor clase', 18),
      headerCell('Pagado', 18),
      headerCell('Pendiente', 18),
      headerCell('Medio de pago', 18),
      headerCell('Estado de pago', 18),
    ],
  ]
  lessons
    .filter((lesson) => lesson.status === 'completed')
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .forEach((lesson, index) => {
      const paid = paidFor(lesson)
      const due = Math.max(0, Number(lesson.amount || 0) - paid)
      const present = lesson.attendance === 'present'
      const excused = lesson.attendance === 'absent_excused'
      const attendanceLabel = present ? 'Asistió' : excused ? 'Faltó y avisó' : 'Faltó'
      const background = index % 2 ? COLORS.white : '#f8fafc'
      const { year: lessonYear, month: lessonMonth, day: lessonDay } = lessonDateParts(lesson.date)
      detailRows.push([
        {
          value: new Date(lessonYear, lessonMonth - 1, lessonDay, 12),
          type: Date,
          format: 'dd/mm/yyyy',
          height: 25,
          backgroundColor: background,
          alignVertical: 'center',
        },
        textCell(studentNames.get(lesson.studentId) || 'Alumno sin identificar', background),
        textCell(
          new Date(lesson.date).toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: REPORT_TIME_ZONE,
          }),
          background,
        ),
        numberCell(Number(lesson.realDurationMinutes || 60) / 60, '0.0 "h"', background),
        {
          ...textCell(attendanceLabel, present ? COLORS.paleGreen : excused ? COLORS.paleBlue : COLORS.paleRed),
          fontWeight: 'bold',
          color: present ? COLORS.green : excused ? COLORS.blue : '#991b1b',
        },
        numberCell(lesson.hourlyRate, ARS_FORMAT, background),
        numberCell(lesson.amount, ARS_FORMAT, background),
        numberCell(paid, ARS_FORMAT, background),
        numberCell(due, ARS_FORMAT, background),
        textCell(paid > 0 ? paymentMethodLabel(lesson.paymentMethod) : '—', background),
        {
          ...textCell(
            excused
              ? 'No corresponde'
              : due <= 0
                ? 'Pagada'
                : paid > 0
                  ? 'Pago parcial'
                  : 'Pendiente',
            due <= 0 ? COLORS.paleGreen : COLORS.paleOrange,
          ),
          fontWeight: 'bold',
          color: due <= 0 ? COLORS.green : COLORS.orange,
        },
      ])
    })

  const sheets = [
    {
      data: summaryRows,
      sheet: 'Resumen',
      columns: studentAccount
        ? [{ width: 24 }, { width: 20 }, { width: 18 }, { width: 18 }, { width: 22 }, { width: 22 }, { width: 18 }]
        : [{ width: 31 }, { width: 20 }, { width: 31 }, { width: 20 }],
    },
  ]
  if (!studentAccount) sheets.push({
      data: detailRows,
      sheet: 'Detalle de clases',
      columns: [
        { width: 14 }, { width: 28 }, { width: 12 }, { width: 14 }, { width: 16 },
        { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 },
        { width: 18 },
      ],
    })
  const file = await writeXlsxFile(sheets).toBlob()
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = downloadName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const safeFilePart = (value) => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-|-$/g, '')

export function exportStudentMonthlyReport({
  monthName,
  year,
  account,
  lessons,
}) {
  const studentLessons = lessons.filter((lesson) => (
    lesson.studentId === account.student.id && lesson.status === 'completed'
  ))
  const attendedLessons = studentLessons.filter(
    (lesson) => lesson.attendance === 'present',
  ).length
  const absentLessons = studentLessons.length - attendedLessons

  return exportMonthlyReport({
    monthName,
    year,
    accounts: [account],
    lessons: studentLessons,
    metrics: {
      totalBilled: account.total,
      totalPaid: account.paid,
      totalDue: account.due,
      attendedLessons,
      absentLessons,
      attendanceRate: studentLessons.length ? attendedLessons / studentLessons.length : 0,
      studentsWithDebt: account.due > 0 ? 1 : 0,
      averagePerClass: attendedLessons ? account.total / attendedLessons : 0,
    },
    reportTitle: `Resumen mensual de ${account.student.name}`,
    downloadName: `Resumen-${safeFilePart(account.student.name)}-${monthName}-${year}.xlsx`,
    studentAccount: account,
  })
}
