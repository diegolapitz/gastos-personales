import { useEffect, useState, useRef, useMemo } from 'react'
import { api, fmt, fmtFecha, catColor } from '../api'
import { useVista } from '../VistaContext'
import { Trash2 } from 'lucide-react'

// Generate last N months as YYYY-MM strings, most recent first
function lastMonths(n = 18) {
  const result = []
  const d = new Date()
  for (let i = 0; i < n; i++) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    result.push(`${y}-${m}`)
    d.setMonth(d.getMonth() - 1)
  }
  return result
}

export default function Movimientos() {
  const { vista } = useVista()

  const [periodos, setPeriodos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [categoriasFull, setCategoriasFull] = useState([])
  const [formasPago, setFormasPago] = useState([])
  const [gastos, setGastos] = useState([])
  const [ingresos, setIngresos] = useState([])
  const [loading, setLoading] = useState(true)

  const [periodoId, setPeriodoId] = useState('')
  const [mesConsumo, setMesConsumo] = useState(lastMonths(1)[0])
  const [catFiltro, setCatFiltro] = useState([])
  const [fpFiltro, setFpFiltro] = useState('')
  const [buscar, setBuscar] = useState('')
  const [montoMin, setMontoMin] = useState('')
  const [montoMax, setMontoMax] = useState('')

  const [editCatId, setEditCatId] = useState(null)
  const [editCat, setEditCat] = useState('')
  const [editMontoId, setEditMontoId] = useState(null)
  const [editMonto, setEditMonto] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [hoverId, setHoverId] = useState(null)

  const searchTimer = useRef(null)

  useEffect(() => {
    Promise.all([api.getPeriodos(), api.getCategorias()])
      .then(([ps, cats]) => {
        setPeriodos(ps)
        if (ps.length > 0) setPeriodoId(ps[0].id.toString())
        const lista = cats.categorias || []
        setCategorias(lista)
        setCategoriasFull(cats.categorias_completo || lista.map(n => ({ nombre: n })))
        setFormasPago(cats.formas_pago || [])
      })
    api.getIngresos().then(setIngresos).catch(() => {})
  }, [])

  useEffect(() => {
    if (vista === 'consumo') { fetchGastos(); return }
    if (periodoId === '') return
    fetchGastos()
  }, [periodoId, mesConsumo, catFiltro, fpFiltro, vista])

  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(fetchGastos, 350)
    return () => clearTimeout(searchTimer.current)
  }, [buscar, montoMin, montoMax])

  async function fetchGastos() {
    setLoading(true)
    let params = {}
    if (vista === 'consumo') {
      params.mes_consumo = mesConsumo
    } else if (periodoId === '0') {
      params.periodo_id = '0'
    } else if (periodoId) {
      params.periodo_id = periodoId
    } else {
      setLoading(false)
      return
    }
    if (catFiltro.length > 0) params.categoria = catFiltro.join(',')
    if (fpFiltro) params.forma_pago = fpFiltro
    if (buscar.trim()) params.buscar = buscar.trim()
    if (montoMin) params.monto_min = montoMin
    if (montoMax) params.monto_max = montoMax
    const data = await api.getGastos(params).finally(() => setLoading(false))
    setGastos(data)
  }

  async function saveCat(id, cat) {
    if (!cat) return
    await api.updateGasto(id, { categoria: cat })
    setEditCatId(null)
    fetchGastos()
  }

  async function saveMonto(id) {
    const m = parseFloat(editMonto)
    if (isNaN(m) || m <= 0) return
    setSaving(true)
    await api.updateGasto(id, { monto: m })
    setSaving(false)
    setEditMontoId(null)
    fetchGastos()
  }

  async function confirmDelete(id) {
    await api.deleteGasto(id)
    setDeleteId(null)
    fetchGastos()
  }

  async function resolverIngreso(id) {
    await api.resolverIngreso(id)
    setIngresos(prev => prev.filter(i => i.id !== id))
  }

  async function ingresoAlPeriodo(id) {
    await api.ingresoAlPeriodo(id)
    setIngresos(prev => prev.filter(i => i.id !== id))
  }

  function toggleCat(cat) {
    setCatFiltro(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])
  }

  const periodo = periodos.find(p => p.id === parseInt(periodoId))
  const ingresosDelPeriodo = useMemo(() => {
    if (periodoId === '0') return ingresos
    if (!periodo) return []
    const desde = periodo.fecha_inicio
    const hasta = periodo.fecha_fin || '9999-12-31'
    return ingresos.filter(i => i.fecha >= desde && i.fecha < hasta)
  }, [ingresos, periodoId, periodos])

  const filas = useMemo(() => {
    const gs = gastos.map(g => ({ ...g, _tipo: 'gasto' }))
    const is = ingresosDelPeriodo.map(i => ({ ...i, _tipo: 'ingreso' }))
    return [...gs, ...is].sort((a, b) => b.fecha.localeCompare(a.fecha))
  }, [gastos, ingresosDelPeriodo])

  const totalFiltrado = gastos.reduce((s, g) => s + g.monto, 0)

  const excluidas = new Set(categoriasFull.filter(c => c.excluir_gastos).map(c => c.nombre || c))
  const totalSinExcluidas = gastos.filter(g => !excluidas.has(g.categoria)).reduce((s, g) => s + g.monto, 0)
  const hayExcluidas = gastos.some(g => excluidas.has(g.categoria))

  return (
    <div>
      <div className="page-header">
        <h1>Movimientos</h1>
        {ingresosDelPeriodo.length > 0 && (
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.08em',
            color: 'var(--green)', border: '1px solid #1a3a1a',
            padding: '3px 10px', borderRadius: 2,
          }}>
            {ingresosDelPeriodo.length} INGRESO{ingresosDelPeriodo.length > 1 ? 'S' : ''} PENDIENTE{ingresosDelPeriodo.length > 1 ? 'S' : ''}
          </span>
        )}
      </div>

      {/* Filtros */}
      <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {vista === 'consumo' ? (
            <div className="form-group" style={{ minWidth: 160, flex: '0 0 auto' }}>
              <label className="form-label">Mes de consumo</label>
              <select value={mesConsumo} onChange={e => setMesConsumo(e.target.value)}>
                {lastMonths(18).map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          ) : (
            <div className="form-group" style={{ minWidth: 160, flex: '0 0 auto' }}>
              <label className="form-label">Período</label>
              <select value={periodoId} onChange={e => setPeriodoId(e.target.value)}>
                <option value="0">Todos los períodos</option>
                {periodos.map(p => (
                  <option key={p.id} value={p.id}>{p.label || `Período ${p.id}`}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group" style={{ minWidth: 130, flex: '0 0 auto' }}>
            <label className="form-label">Forma de pago</label>
            <select value={fpFiltro} onChange={e => setFpFiltro(e.target.value)}>
              <option value="">Todas</option>
              {formasPago.map(fp => <option key={fp}>{fp}</option>)}
            </select>
          </div>

          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Buscar</label>
            <input placeholder="Nombre del comercio..." value={buscar} onChange={e => setBuscar(e.target.value)} />
          </div>

          <div className="form-group" style={{ flex: '0 0 90px' }}>
            <label className="form-label">Mín $</label>
            <input type="number" placeholder="0" value={montoMin} onChange={e => setMontoMin(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '0 0 90px' }}>
            <label className="form-label">Máx $</label>
            <input type="number" placeholder="∞" value={montoMax} onChange={e => setMontoMax(e.target.value)} />
          </div>

          <button className="btn btn-ghost btn-sm" onClick={() => {
            setCatFiltro([]); setFpFiltro(''); setBuscar(''); setMontoMin(''); setMontoMax('')
          }}>Limpiar</button>
        </div>

        {/* Category chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 12 }}>
          {categorias.map(cat => {
            const active = catFiltro.includes(cat)
            return (
              <button key={cat} onClick={() => toggleCat(cat)} style={{
                fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 600,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                padding: '3px 9px', borderRadius: 2, cursor: 'pointer', border: 'none',
                background: active ? catColor(cat) + '28' : 'var(--surface-2)',
                color: active ? catColor(cat) : 'var(--text-3)',
                outline: active ? `1px solid ${catColor(cat)}44` : 'none',
                transition: 'all 0.15s',
              }}>
                {cat}
              </button>
            )
          })}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="loading">CARGANDO</div>
        ) : filas.length === 0 ? (
          <div className="empty-state">Sin movimientos con los filtros aplicados.</div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 76, paddingLeft: 20 }}>
                      {vista === 'consumo' ? 'Consumo' : 'Fecha'}
                    </th>
                    <th>Comercio</th>
                    <th style={{ width: 160 }}>Categoría</th>
                    <th style={{ width: 110 }}>Forma de pago</th>
                    <th style={{ width: 120, textAlign: 'right' }}>Monto</th>
                    <th style={{ width: 50 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map(fila => fila._tipo === 'ingreso' ? (
                    <tr key={`ing-${fila.id}`} style={{ background: '#0d1f0d' }}>
                      <td className="mono" style={{ paddingLeft: 20, color: 'var(--text-3)', fontSize: 11 }}>
                        {fila.fecha ? `${fila.fecha.slice(8)}/${fila.fecha.slice(5,7)}` : ''}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--green)' }}>
                        {fila.nombre || fila.descripcion}
                      </td>
                      <td>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--green)', textTransform: 'uppercase', background: '#1a3a1a', padding: '2px 7px', borderRadius: 2 }}>
                          INGRESO
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-3)', fontSize: 11 }}>—</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--green)' }}>
                        +{fmt(fila.monto)}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-green btn-sm" onClick={() => ingresoAlPeriodo(fila.id)} title="Sumar al ingreso del período" style={{ padding: '3px 7px', fontSize: 9, letterSpacing: '0.06em' }}>
                            +PER
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => resolverIngreso(fila.id)} title="Ignorar" style={{ padding: '3px 7px', fontSize: 9 }}>
                            OK
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={`g-${fila.id}`}
                      onMouseEnter={() => setHoverId(fila.id)}
                      onMouseLeave={() => setHoverId(null)}
                      style={fila.monto < 0 ? { background: '#0a1a0a' } : {}}
                    >
                      <td className="mono" style={{ paddingLeft: 20, color: 'var(--text-3)', fontSize: 11 }}>
                        {vista === 'consumo' && fila.fecha_consumo
                          ? `${fila.fecha_consumo.slice(8)}/${fila.fecha_consumo.slice(5,7)}`
                          : fila.fecha ? `${fila.fecha.slice(8)}/${fila.fecha.slice(5,7)}` : ''}
                      </td>
                      <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                        {fila.nombre || fila.descripcion}
                        {fila.es_cuota ? (
                          <span style={{
                            marginLeft: 6, fontFamily: 'var(--mono)', fontSize: 8,
                            letterSpacing: '0.08em', color: 'var(--text-3)',
                            background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 2,
                          }}>
                            {fila.cuota_numero}/{fila.cuota_total}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        {editCatId === fila.id ? (
                          <select
                            value={editCat}
                            onChange={e => saveCat(fila.id, e.target.value)}
                            style={{ width: 'auto', fontSize: 11, padding: '3px 8px' }}
                            autoFocus
                          >
                            {categorias.map(c => <option key={c}>{c}</option>)}
                          </select>
                        ) : (
                          <span
                            className="badge"
                            style={{
                              background: catColor(fila.categoria) + '18',
                              color: catColor(fila.categoria),
                              cursor: 'pointer',
                              transition: 'opacity 0.15s',
                            }}
                            onClick={() => { setEditCatId(fila.id); setEditCat(fila.categoria) }}
                            title="Clic para editar"
                          >
                            {fila.categoria}
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-3)' }}>
                        {fila.forma_pago || '—'}
                      </td>
                      <td className="amount">
                        {editMontoId === fila.id ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}>
                            <input
                              type="number"
                              value={editMonto}
                              onChange={e => setEditMonto(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveMonto(fila.id)
                                if (e.key === 'Escape') setEditMontoId(null)
                              }}
                              style={{ width: 90, padding: '3px 6px', fontSize: 11, textAlign: 'right' }}
                              autoFocus
                            />
                            <button className="btn btn-primary btn-sm" onClick={() => saveMonto(fila.id)} disabled={saving} style={{ padding: '3px 6px' }}>✓</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditMontoId(null)} style={{ padding: '3px 6px' }}>✕</button>
                          </div>
                        ) : (
                          <span
                            style={{ cursor: 'pointer', color: fila.monto < 0 ? 'var(--green)' : 'var(--text)' }}
                            onClick={() => { setEditMontoId(fila.id); setEditMonto(String(fila.monto)) }}
                            title="Clic para editar monto"
                          >
                            {fila.monto < 0 ? '+' : ''}{fmt(Math.abs(fila.monto))}
                          </span>
                        )}
                      </td>
                      <td>
                        {hoverId === fila.id && (
                          deleteId === fila.id ? (
                            <div style={{ display: 'flex', gap: 3 }}>
                              <button className="btn btn-danger btn-sm" style={{ padding: '3px 7px', fontSize: 10 }} onClick={() => confirmDelete(fila.id)}>Sí</button>
                              <button className="btn btn-ghost btn-sm" style={{ padding: '3px 7px', fontSize: 10 }} onClick={() => setDeleteId(null)}>No</button>
                            </div>
                          ) : (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ padding: '4px 8px', opacity: 0.4 }}
                              onClick={() => setDeleteId(fila.id)}
                            >
                              <Trash2 size={11} />
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: 28,
              padding: '12px 20px', borderTop: '1px solid var(--border)',
              fontFamily: 'var(--mono)', fontSize: 11,
            }}>
              <span style={{ color: 'var(--text-3)' }}>{gastos.length} movimientos</span>
              {hayExcluidas && (
                <span style={{ color: 'var(--text-2)' }}>
                  sin inv: <strong style={{ color: 'var(--text)' }}>{fmt(totalSinExcluidas)}</strong>
                </span>
              )}
              <span style={{ color: 'var(--text-2)' }}>
                total: <strong style={{ color: 'var(--text)', fontSize: 13 }}>{fmt(totalFiltrado)}</strong>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
