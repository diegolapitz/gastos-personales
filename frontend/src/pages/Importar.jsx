import { useCallback, useState } from 'react'
import { api, fmt, fmtFecha, catColor } from '../api'
import { Upload, CheckCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'

export default function Importar() {
  const [dragging, setDragging] = useState(false)
  const [step, setStep] = useState('idle') // idle | processing | preview | done
  const [progress, setProgress] = useState(0)
  const [preview, setPreview] = useState(null)
  const [filas, setFilas] = useState([])
  const [crearPeriodo, setCrearPeriodo] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState(null)
  const [showAll, setShowAll] = useState(false)

  const [categorias, setCategorias] = useState([])

  const handleFile = useCallback(async (file) => {
    if (!file) return
    setError(null)
    setStep('processing')
    setProgress(10)

    // Load categories for editing
    api.getCategorias().then(d => setCategorias(d.categorias || []))

    setProgress(30)
    const data = await api.previewCSV(file).catch(e => {
      setError(e.message || 'Error al procesar el CSV')
      setStep('idle')
      return null
    })
    setProgress(100)

    if (!data) return
    setPreview(data)
    setFilas(data.filas.map(f => ({ ...f, _cat: f.categoria })))
    setCrearPeriodo(!!data.ingreso_detectado)
    setStep('preview')
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  const onFileInput = (e) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  function updateCat(idx, cat) {
    setFilas(prev => prev.map((f, i) => i === idx ? { ...f, _cat: cat } : f))
  }

  async function confirmar() {
    setConfirming(true)
    const data = {
      filas: filas.map(f => ({ ...f, categoria: f._cat })),
      crear_periodo: crearPeriodo,
      ingreso: preview?.ingreso_detectado || null,
    }
    const res = await api.confirmarImport(data).catch(e => {
      setError(e.message || 'Error al confirmar')
      setConfirming(false)
      return null
    })
    if (!res) return
    setResultado(res)
    setStep('done')
    setConfirming(false)
  }

  function reset() {
    setStep('idle')
    setPreview(null)
    setFilas([])
    setProgress(0)
    setResultado(null)
    setError(null)
    setCrearPeriodo(false)
  }

  const visibleFilas = showAll ? filas : filas.slice(0, 20)
  const aClasificar = filas.filter(f => f._cat === 'A Clasificar').length

  return (
    <div>
      <div className="page-header"><h1>Importar MercadoPago</h1></div>

      {error && (
        <div className="alert alert-warn" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={16} />
          {error}
          <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Paso 1: Drop zone */}
      {step === 'idle' && (
        <div className="card">
          <label
            className={`dropzone${dragging ? ' active' : ''}`}
            onDragEnter={e => { e.preventDefault(); setDragging(true) }}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            style={{ cursor: 'pointer' }}
          >
            <input type="file" accept=".csv" style={{ display: 'none' }} onChange={onFileInput} />
            <Upload size={36} style={{ margin: '0 auto 12px', display: 'block', color: 'var(--accent)', opacity: .7 }} />
            <div style={{ fontWeight: 600, fontSize: 15 }}>Arrastrá tu CSV de MercadoPago</div>
            <p>o hacé clic para seleccionar el archivo</p>
            <p style={{ marginTop: 6, fontSize: 11 }}>El archivo debe ser el extracto descargado desde la app de MercadoPago</p>
          </label>
        </div>
      )}

      {/* Paso 2: Procesando */}
      {step === 'processing' && (
        <div className="card" style={{ textAlign: 'center', padding: '60px 40px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>Procesando y categorizando...</div>
          <div className="progress-track" style={{ maxWidth: 400, margin: '0 auto' }}>
            <div className="progress-fill" style={{ width: `${progress}%`, transition: 'width .5s ease' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 10 }}>{progress}%</div>
        </div>
      )}

      {/* Paso 3: Preview */}
      {step === 'preview' && preview && (
        <>
          {/* Ingreso detectado */}
          {preview.ingreso_detectado && (
            <div className="alert alert-info" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <strong>Ingreso detectado:</strong> {fmt(preview.ingreso_detectado.monto)} el {fmtFecha(preview.ingreso_detectado.fecha)} — posible sueldo
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input
                  type="checkbox"
                  checked={crearPeriodo}
                  onChange={e => setCrearPeriodo(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                Iniciar nuevo período
              </label>
            </div>
          )}

          {/* Resumen */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', fontSize: 13 }}>
              <span><strong>{filas.length}</strong> movimientos a importar</span>
              <span>Total: <strong>{fmt(filas.reduce((s, f) => s + f.monto, 0))}</strong></span>
              {aClasificar > 0 && (
                <span style={{ color: 'var(--warning)' }}>
                  <strong>{aClasificar}</strong> sin clasificar — podés editarlos abajo
                </span>
              )}
              {preview.duplicados > 0 && (
                <span style={{ color: 'var(--text-secondary)' }}>
                  {preview.duplicados} duplicados omitidos
                </span>
              )}
            </div>
          </div>

          {/* Tabla preview */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Nombre</th>
                    <th>Categoría</th>
                    <th style={{ textAlign: 'right' }}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleFilas.map((f, i) => (
                    <tr key={i}>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {fmtFecha(f.fecha)}
                      </td>
                      <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.nombre}
                      </td>
                      <td>
                        <select
                          value={f._cat}
                          onChange={e => updateCat(i, e.target.value)}
                          style={{
                            width: 'auto',
                            padding: '3px 8px',
                            fontSize: 12,
                            background: catColor(f._cat) + '22',
                            color: catColor(f._cat),
                            borderColor: catColor(f._cat) + '44',
                          }}
                        >
                          {categorias.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="amount">{fmt(f.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filas.length > 20 && (
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginTop: 12, width: '100%' }}
                onClick={() => setShowAll(s => !s)}
              >
                {showAll ? <><ChevronUp size={13} /> Mostrar menos</> : <><ChevronDown size={13} /> Ver todos ({filas.length})</>}
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={reset}>Cancelar</button>
            <button className="btn btn-primary" onClick={confirmar} disabled={confirming}>
              {confirming ? 'Importando...' : `Confirmar importación (${filas.length} mov.)`}
            </button>
          </div>
        </>
      )}

      {/* Paso 4: Done */}
      {step === 'done' && resultado && (
        <div className="card" style={{ textAlign: 'center', padding: '60px 40px' }}>
          <CheckCircle size={48} style={{ color: 'var(--success)', margin: '0 auto 16px', display: 'block' }} />
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Importación completada</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
            <div>{resultado.importados} movimientos importados</div>
            {resultado.periodo_creado && (
              <div style={{ marginTop: 4, color: 'var(--success)' }}>Nuevo período iniciado</div>
            )}
          </div>
          <button className="btn btn-primary" onClick={reset}>Importar otro archivo</button>
        </div>
      )}
    </div>
  )
}
