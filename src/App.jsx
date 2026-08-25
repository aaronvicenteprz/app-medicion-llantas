import { useEffect, useMemo, useRef, useState } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const POSICIONES = [
  { id: 'DI', label: 'DI', nombre: 'Delantera Izquierda', eje: 'delantero' },
  { id: 'DD', label: 'DD', nombre: 'Delantera Derecha', eje: 'delantero' },
  { id: 'TI', label: 'TI', nombre: 'Trasera Izquierda', eje: 'trasero' },
  { id: 'TD', label: 'TD', nombre: 'Trasera Derecha', eje: 'trasero' },
]

const DIFERENCIA_MAXIMA_EJE_MM = 6

function calcularVidaUtil(modelo, diametroMedido) {
  const { diametro_nuevo_mm, diametro_limite_mm } = modelo
  const rango = diametro_nuevo_mm - diametro_limite_mm
  if (rango <= 0) return null
  const pct = ((diametroMedido - diametro_limite_mm) / rango) * 100
  return Math.max(0, Math.min(100, pct))
}

function semaforo(pct) {
  if (pct === null) return { color: 'gray', label: 'Sin datos' }
  if (pct > 40) return { color: 'green', label: 'Verde' }
  if (pct >= 20) return { color: 'yellow', label: 'Amarillo' }
  return { color: 'red', label: 'Rojo' }
}

const SEMAFORO_ESTILOS = {
  green: { bg: 'bg-green-500', ring: 'ring-green-500', text: 'text-green-700', bgSoft: 'bg-green-50', border: 'border-green-300' },
  yellow: { bg: 'bg-yellow-400', ring: 'ring-yellow-400', text: 'text-yellow-700', bgSoft: 'bg-yellow-50', border: 'border-yellow-300' },
  red: { bg: 'bg-red-500', ring: 'ring-red-500', text: 'text-red-700', bgSoft: 'bg-red-50', border: 'border-red-300' },
  gray: { bg: 'bg-gray-300', ring: 'ring-gray-300', text: 'text-gray-500', bgSoft: 'bg-gray-50', border: 'border-gray-200' },
}

function crearMedicionVacia() {
  return { modeloId: '', diametroMedido: '' }
}

const EMOJI_SEMAFORO = { green: '🟢', yellow: '🟡', red: '🔴', gray: '⚪' }

const RECOMENDACIONES = {
  green: 'Uso normal. Continuar monitoreo periódico.',
  yellow: 'Programar reemplazo en el próximo mantenimiento.',
  red: 'Reemplazar de inmediato.',
  gray: 'Sin datos suficientes para evaluar.',
}

const COLOR_RGB_PDF = {
  green: [34, 197, 94],
  yellow: [234, 179, 8],
  red: [239, 68, 68],
  gray: [180, 180, 180],
}

function formatFecha(fecha) {
  return fecha.toLocaleString('es', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function generarTextoReporte(datosEquipo, mediciones, resultados, alertasEje) {
  const lineas = []
  lineas.push('*Reporte de Inspección de Llantas*')
  lineas.push(`Fecha: ${formatFecha(new Date())}`)
  lineas.push(`Serie del equipo: ${datosEquipo.serie || '—'}`)
  lineas.push(`Sucursal: ${datosEquipo.sucursal || '—'}`)
  lineas.push(`Técnico responsable: ${datosEquipo.tecnico || '—'}`)
  lineas.push('')

  for (const pos of POSICIONES) {
    const r = resultados[pos.id]
    lineas.push(`${EMOJI_SEMAFORO[r.semaforo.color]} *${pos.id} - ${pos.nombre}*`)
    if (r.modelo && r.diametro !== null) {
      lineas.push(`Modelo: ${r.modelo.marca} ${r.modelo.modelo} (${r.modelo.medida})`)
      lineas.push(`Diámetro medido: ${r.diametro} mm`)
      lineas.push(`Vida útil: ${r.pct.toFixed(1)}% - ${r.semaforo.label}`)
      if (r.excedeNuevo) {
        lineas.push('⚠️ Advertencia: la medida excede el diámetro de una llanta nueva. Verifica el modelo o la captura.')
      }
    } else {
      lineas.push('Sin datos registrados')
    }
    lineas.push('')
  }

  if (alertasEje.length > 0) {
    lineas.push('⚠️ *Alertas de desbalance*')
    for (const a of alertasEje) {
      lineas.push(`- ${a.eje}: diferencia de ${a.diff} mm entre llantas (máx. ${DIFERENCIA_MAXIMA_EJE_MM} mm)`)
    }
  } else {
    lineas.push('Sin alertas de desbalance entre ejes.')
  }

  return lineas.join('\n')
}

async function copiarAlPortapapeles(texto) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(texto)
      return true
    } catch {
      // sigue con el método alternativo
    }
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = texto
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

function generarPDF(datosEquipo, mediciones, resultados, alertasEje) {
  const doc = new jsPDF()
  const fecha = formatFecha(new Date())

  doc.setFontSize(16)
  doc.setTextColor(30, 41, 59)
  doc.text('Ficha Técnica de Inspección de Llantas', 14, 18)

  doc.setFontSize(10)
  doc.setTextColor(100, 116, 139)
  doc.text('Montacargas · vida útil por posición', 14, 24)
  doc.text(`Fecha de generación: ${fecha}`, 14, 30)

  doc.setFontSize(10)
  doc.setTextColor(30, 41, 59)
  doc.text(`Serie del equipo: ${datosEquipo.serie || '—'}`, 14, 38)
  doc.text(`Sucursal: ${datosEquipo.sucursal || '—'}`, 14, 44)
  doc.text(`Técnico responsable: ${datosEquipo.tecnico || '—'}`, 14, 50)

  const filas = POSICIONES.map((pos) => {
    const r = resultados[pos.id]
    if (r.modelo && r.diametro !== null) {
      return [
        pos.id,
        `${r.modelo.marca} ${r.modelo.modelo}\n${r.modelo.medida}`,
        `${r.diametro} mm${r.excedeNuevo ? '\n⚠️ excede nuevo' : ''}`,
        `${r.pct.toFixed(1)}%`,
        r.semaforo.label,
        RECOMENDACIONES[r.semaforo.color],
      ]
    }
    return [pos.id, 'Sin datos', '-', '-', 'Sin datos', RECOMENDACIONES.gray]
  })

  autoTable(doc, {
    startY: 56,
    head: [['Pos.', 'Modelo', 'Diám. medido', 'Vida útil', 'Estado', 'Recomendación']],
    body: filas,
    styles: { fontSize: 9, cellPadding: 3, valign: 'middle' },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    columnStyles: { 0: { cellWidth: 12 }, 4: { cellWidth: 20 } },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        const pos = POSICIONES[data.row.index]
        const color = resultados[pos.id].semaforo.color
        data.cell.styles.textColor = COLOR_RGB_PDF[color]
        data.cell.styles.fontStyle = 'bold'
      }
      if (data.section === 'body' && data.column.index === 2) {
        const pos = POSICIONES[data.row.index]
        if (resultados[pos.id].excedeNuevo) {
          data.cell.styles.textColor = COLOR_RGB_PDF.red
          data.cell.styles.fontStyle = 'bold'
        }
      }
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        const pos = POSICIONES[data.row.index]
        const color = resultados[pos.id].semaforo.color
        doc.setFillColor(...COLOR_RGB_PDF[color])
        doc.circle(data.cell.x + 4, data.cell.y + data.cell.height / 2, 2, 'F')
      }
    },
  })

  let y = doc.lastAutoTable.finalY + 10

  if (alertasEje.length > 0) {
    doc.setFontSize(11)
    doc.setTextColor(185, 28, 28)
    doc.text('Alertas de desbalance entre ejes', 14, y)
    y += 6
    doc.setFontSize(9)
    for (const a of alertasEje) {
      doc.text(
        `- ${a.eje}: diferencia de ${a.diff} mm entre llantas (máximo permitido ${DIFERENCIA_MAXIMA_EJE_MM} mm).`,
        14,
        y,
      )
      y += 5
    }
  } else {
    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    doc.text('Sin alertas de desbalance entre ejes.', 14, y)
    y += 5
  }

  doc.setFontSize(8)
  doc.setTextColor(150, 150, 150)
  doc.text('Generado con App Medición de Llantas', 14, 287)

  const nombreArchivo = `ficha-tecnica-llantas-${new Date().toISOString().slice(0, 10)}.pdf`
  doc.save(nombreArchivo)
}

function crearDatosEquipoVacios() {
  return { serie: '', sucursal: '', tecnico: '' }
}

export default function App() {
  const [catalogo, setCatalogo] = useState([])
  const [estado, setEstado] = useState('cargando')
  const [datosEquipo, setDatosEquipo] = useState(crearDatosEquipoVacios())
  const [mediciones, setMediciones] = useState({
    DI: crearMedicionVacia(),
    DD: crearMedicionVacia(),
    TI: crearMedicionVacia(),
    TD: crearMedicionVacia(),
  })

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}catalogo_llantas.json`)
      .then((res) => {
        if (!res.ok) throw new Error('No se pudo cargar el catálogo')
        return res.json()
      })
      .then((data) => {
        setCatalogo(data)
        setEstado('listo')
      })
      .catch(() => setEstado('error'))
  }, [])

  const actualizarMedicion = (posId, campo, valor) => {
    setMediciones((prev) => ({
      ...prev,
      [posId]: { ...prev[posId], [campo]: valor },
    }))
  }

  const actualizarDatoEquipo = (campo, valor) => {
    setDatosEquipo((prev) => ({ ...prev, [campo]: valor }))
  }

  const datosEquipoCompletos =
    datosEquipo.serie.trim() !== '' && datosEquipo.sucursal.trim() !== '' && datosEquipo.tecnico.trim() !== ''

  const resultados = useMemo(() => {
    const map = {}
    for (const pos of POSICIONES) {
      const m = mediciones[pos.id]
      const modelo = catalogo.find((c) => String(c.id) === String(m.modeloId))
      const diametro = parseFloat(m.diametroMedido)
      const tieneDatos = modelo && !Number.isNaN(diametro) && m.diametroMedido !== ''
      const pct = tieneDatos ? calcularVidaUtil(modelo, diametro) : null
      const excedeNuevo = tieneDatos ? diametro > modelo.diametro_nuevo_mm : false
      map[pos.id] = {
        modelo,
        diametro: tieneDatos ? diametro : null,
        pct,
        semaforo: semaforo(pct),
        excedeNuevo,
      }
    }
    return map
  }, [mediciones, catalogo])

  const alertasEje = useMemo(() => {
    const ejes = [
      { nombre: 'Eje delantero', ids: ['DI', 'DD'] },
      { nombre: 'Eje trasero', ids: ['TI', 'TD'] },
    ]
    const alertas = []
    for (const eje of ejes) {
      const [a, b] = eje.ids.map((id) => resultados[id])
      if (a.diametro !== null && b.diametro !== null) {
        const diff = Math.abs(a.diametro - b.diametro)
        if (diff > DIFERENCIA_MAXIMA_EJE_MM) {
          alertas.push({
            eje: eje.nombre,
            diff: diff.toFixed(1),
          })
        }
      }
    }
    return alertas
  }, [resultados])

  if (estado === 'cargando') {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gray-100 text-gray-500 text-lg">
        Cargando catálogo…
      </div>
    )
  }

  if (estado === 'error') {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gray-100 text-red-600 text-lg px-6 text-center">
        No se pudo cargar catalogo_llantas.json
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-gray-100 pb-10">
      <header className="sticky top-0 z-10 bg-slate-800 text-white px-4 py-4 shadow-md">
        <h1 className="text-lg font-bold leading-tight">Medición de Llantas</h1>
        <p className="text-slate-300 text-sm">Montacargas · vida útil por posición</p>
      </header>

      {alertasEje.length > 0 && (
        <div className="mx-3 mt-4 space-y-2">
          {alertasEje.map((a) => (
            <div
              key={a.eje}
              className="flex items-start gap-2 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-red-800"
            >
              <span className="text-xl leading-none">⚠️</span>
              <p className="text-sm font-medium">
                {a.eje}: diferencia de diámetro de {a.diff} mm entre llantas (máximo permitido {DIFERENCIA_MAXIMA_EJE_MM} mm).
              </p>
            </div>
          ))}
        </div>
      )}

      <main className="px-3 mt-4 space-y-4">
        <DatosEquipo datos={datosEquipo} onChange={actualizarDatoEquipo} completos={datosEquipoCompletos} />

        {POSICIONES.map((pos) => (
          <TarjetaPosicion
            key={pos.id}
            posicion={pos}
            catalogo={catalogo}
            medicion={mediciones[pos.id]}
            resultado={resultados[pos.id]}
            onChange={(campo, valor) => actualizarMedicion(pos.id, campo, valor)}
          />
        ))}

        <ResumenInspeccion
          datosEquipo={datosEquipo}
          datosEquipoCompletos={datosEquipoCompletos}
          mediciones={mediciones}
          resultados={resultados}
          alertasEje={alertasEje}
        />
      </main>
    </div>
  )
}

function DatosEquipo({ datos, onChange, completos }) {
  const campo = (name, label, placeholder) => {
    const vacio = datos[name].trim() === ''
    return (
      <label className="block">
        <span className="text-sm font-medium text-slate-600">
          {label} <span className="text-red-500">*</span>
        </span>
        <input
          type="text"
          required
          placeholder={placeholder}
          value={datos[name]}
          onChange={(e) => onChange(name, e.target.value)}
          className={`mt-1 w-full rounded-xl border bg-white px-3 py-3 text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 ${
            vacio ? 'border-red-300' : 'border-slate-300 focus:border-slate-500'
          }`}
        />
      </label>
    )
  }

  return (
    <section className="rounded-2xl border-2 border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-slate-800">
        <h2 className="text-white font-semibold">Datos de Trazabilidad</h2>
      </div>
      <div className="px-4 py-4 space-y-3">
        {campo('serie', 'Serie del Equipo', 'Ej. FL-2045')}
        {campo('sucursal', 'Sucursal', 'Ej. Mérida')}
        {campo('tecnico', 'Técnico Responsable', 'Ej. Juan Pérez')}
        {!completos && (
          <p className="text-xs font-medium text-red-600">
            Completa los 3 campos para poder generar el reporte y garantizar la trazabilidad por unidad.
          </p>
        )}
      </div>
    </section>
  )
}

function ResumenInspeccion({ datosEquipo, datosEquipoCompletos, mediciones, resultados, alertasEje }) {
  const [mensaje, setMensaje] = useState(null)
  const timeoutRef = useRef(null)

  const mostrarMensaje = (texto) => {
    setMensaje(texto)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setMensaje(null), 3000)
  }

  const handleCopiar = async () => {
    const texto = generarTextoReporte(datosEquipo, mediciones, resultados, alertasEje)
    const ok = await copiarAlPortapapeles(texto)
    mostrarMensaje(ok ? '✅ Reporte copiado al portapapeles' : '⚠️ No se pudo copiar automáticamente')
  }

  const handleDescargarPDF = () => {
    try {
      generarPDF(datosEquipo, mediciones, resultados, alertasEje)
    } catch {
      mostrarMensaje('⚠️ No se pudo generar el PDF')
    }
  }

  const hayDatos = POSICIONES.some((pos) => resultados[pos.id].pct !== null)
  const puedeGenerar = hayDatos && datosEquipoCompletos

  return (
    <section className="rounded-2xl border-2 border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-slate-800">
        <h2 className="text-white font-semibold">Resumen de Inspección</h2>
      </div>

      <div className="px-4 py-3 divide-y divide-slate-100">
        {POSICIONES.map((pos) => {
          const r = resultados[pos.id]
          const estilo = SEMAFORO_ESTILOS[r.semaforo.color]
          return (
            <div key={pos.id} className="flex items-center justify-between py-2 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`h-3 w-3 rounded-full ${estilo.bg} shrink-0`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700">{pos.id}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {r.modelo ? `${r.modelo.marca} ${r.modelo.modelo}` : 'Sin datos'}
                  </p>
                </div>
              </div>
              <span className={`text-sm font-semibold ${estilo.text} shrink-0`}>
                {r.pct !== null ? `${r.pct.toFixed(1)}%` : '—'}
              </span>
            </div>
          )
        })}
      </div>

      {mensaje && (
        <p className="mx-4 mb-2 text-center text-sm font-medium text-slate-700">{mensaje}</p>
      )}

      {!datosEquipoCompletos && (
        <p className="mx-4 mb-2 text-center text-xs font-medium text-red-600">
          ⚠️ Completa Serie del Equipo, Sucursal y Técnico Responsable para generar el reporte.
        </p>
      )}

      <div className="px-4 pb-4 pt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={handleCopiar}
          disabled={!puedeGenerar}
          className="w-full rounded-xl bg-green-600 disabled:bg-slate-300 disabled:cursor-not-allowed active:bg-green-700 text-white font-semibold py-3 text-sm shadow-sm transition-colors"
        >
          📋 Copiar Reporte para WhatsApp / Texto
        </button>
        <button
          type="button"
          onClick={handleDescargarPDF}
          disabled={!puedeGenerar}
          className="w-full rounded-xl bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed active:bg-slate-900 text-white font-semibold py-3 text-sm shadow-sm transition-colors"
        >
          ⬇️ Descargar Ficha Técnica PDF
        </button>
      </div>
    </section>
  )
}

function TarjetaPosicion({ posicion, catalogo, medicion, resultado, onChange }) {
  const estilo = SEMAFORO_ESTILOS[resultado.semaforo.color]

  return (
    <section className={`rounded-2xl border-2 ${estilo.border} ${estilo.bgSoft} shadow-sm overflow-hidden`}>
      <div className="flex items-center justify-between px-4 py-3 bg-white/60">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-800 text-white font-bold text-base">
            {posicion.label}
          </span>
          <div>
            <p className="font-semibold text-slate-800 leading-tight">{posicion.nombre}</p>
            <p className="text-xs text-slate-500 capitalize">{posicion.eje}</p>
          </div>
        </div>
        <span className={`h-6 w-6 rounded-full ${estilo.bg} ring-4 ${estilo.ring}/30 shrink-0`} />
      </div>

      <div className="px-4 py-4 space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-slate-600">Modelo de llanta</span>
          <select
            value={medicion.modeloId}
            onChange={(e) => onChange('modeloId', e.target.value)}
            style={{ touchAction: 'manipulation' }}
            className="mt-1 w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-800 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            <option value="">Seleccionar modelo…</option>
            {catalogo.map((c) => (
              <option key={c.id} value={c.id}>
                {c.marca} {c.modelo} — {c.medida}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-600">Diámetro medido (mm)</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            placeholder="Ej. 495.5"
            value={medicion.diametroMedido}
            onChange={(e) => onChange('diametroMedido', e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-800 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </label>

        {resultado.modelo && (
          <p className="text-xs text-slate-500">
            Nuevo: {resultado.modelo.diametro_nuevo_mm} mm · Límite: {resultado.modelo.diametro_limite_mm} mm
          </p>
        )}

        {resultado.excedeNuevo && (
          <div className="flex items-start gap-2 rounded-xl border-2 border-red-300 bg-red-50 px-3 py-2 text-red-800">
            <span className="text-lg leading-none">⚠️</span>
            <p className="text-xs font-medium">
              Advertencia: La medida excede el diámetro de una llanta nueva. Verifica el modelo o la captura.
            </p>
          </div>
        )}

        <div className="pt-1">
          {resultado.pct === null ? (
            <p className="text-sm text-slate-400">Selecciona el modelo e ingresa el diámetro para calcular.</p>
          ) : (
            <div>
              <div className="flex items-baseline justify-between">
                <span className={`text-2xl font-bold ${estilo.text}`}>{resultado.pct.toFixed(1)}%</span>
                <span className={`text-sm font-semibold ${estilo.text}`}>{resultado.semaforo.label}</span>
              </div>
              <div className="mt-2 h-3 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={`h-full ${estilo.bg} transition-all`}
                  style={{ width: `${resultado.pct}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">Vida útil restante</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
