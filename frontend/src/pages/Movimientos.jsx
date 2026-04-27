import { useEffect, useState, useRef } from 'react'
import { api, fmt, fmtFecha, catColor } from '../api'
import { Pencil, Check, X, Trash2 } from 'lucide-react'

export default function Movimientos() {
  const [periodos, setPeriodos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [formasPago, setFormasPago] = useState([])
  const [gastos, setGastos] = useState([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const [periodoId, setPeriodoId] = useState('')
  const [catFiltro, setCatFiltro] = useState([])
  const [fpFiltro, setFpFiltro] = useState('')
  const [buscar, setBuscar] = useState('')
  const [montoMin, setMontoMin] = useState('')
  const [montoMax, setMontoMax] = useState('')

  // Inline edit
  const [editId, setEditId] = useState(null)
  const [editCat, setEditCat] = useState('')
  const [editMonto, setEditMonto] = useState('')
  const [saving, setSaving] = useState(false)

  // Delete confirm
  const [deleteId, setDeleteId] = useState(null)

  const searchTimer = useRef(null)

  useEffect(() => {
    Promise.all([api.getPeriodos(), api.getCategorias()]).then(([ps, cats]) => {
      setPeriodos(ps)
      if (ps.length > 0) setPeriodoId(ps[0].id.toString())
      const todas = cats.categorias || []
      setCategorias(todas)
      setFormasPago(cats.formas_pago || [])
    })
  }, [])

  useEffect(() => {
    if (!periodoId) return
    fetchGastos()
  }, [periodoId, catFiltro, fpFiltro])

  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(fetchGastos, 350)
    return () => clearTimeout(searchTimer.current)
  }, [buscar, montoMin, montoMax])

  async function fetchGastos() {
    if (!periodoId) return
    setLoading(true)
    const params = { periodo_id: periodoId }
    if (catFiltro.length > 0) params.categoria = catFiltro.join(',')
    if (fpFiltro) params.forma_pago = fpFiltro
    if (buscar.trim()) params.buscar = buscar.trim()
    if (montoMin) params.monto_min = montoMin
    if (montoMax) params.monto_max = montoMax
    const data = await api.getGastos(params).finally(() => setLoading(false))
    setGastos(data)
  }

  function toggleCat(cat) {
    setCatFiltro(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    )
  }

  function startEdit(g) {
    setEditId(g.id)
    setEditCat(g.categoria)
    setEditMonto(String(g.monto))
  }

  async function saveEdit(id) {
    if (!editCat) return
    setSaving(true)
    const payload = { categoria: editCat }
    const m = parseFloat(editMonto)
    if (!isNaN(m) && m > 0) payload.monto = m
    await api.updateGasto(id, payload)
    setSaving(false)
    setEditId(null)
    fetchGastos()
  }

  async function confirmDelete(id) {
    await api.deleteGasto(id)
    setDeleteId(null)
    fetchGastos()
  }

  const totalFiltrado = gastos.reduce((s, g) => s + g.monto, 0)
  const totalExcluyendo = gastos
    .filter(g => !['Ahorro/Inversión'].includes(g.categoria))
    .reduce((s, g) => s + g.monto, 0)

  return (
    <div>
      <div className="page-header"><h1>Movimientos</h1></div>

      {/* Filtros */}
      <div className="card" style={{ marginBottom: 20, padding: '16px 24px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ minWidth: 160, flex: '0 0 auto' }}>
            <label className="form-label">Período</label>
            <select value={periodoId} onChange={e => setPeriodoId(e.target.value)}>
              {periodos.map(p => (
                <option key={p.id} value={p.id}>
                  {p.label || `Período ${p.id}`}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ minWidth: 140, flex: '0 0 auto' }}>
            <label className="form-label">Forma de pago</label>
            <select value={fpFiltro} onChange={e => setFpFiltro(e.target.value)}>
              <option value="">Todas</option>
              {formasPago.map(fp => <option key={fp}>{fp}</option>)}
            </select>
          </div>

          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Buscar</label>
            <input
              placeholder="Nombre del comercio..."
              value={buscar}
              onChange={e => setBuscar(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ flex: '0 0 100px' }}>
            <label className="form-label">Monto mín</label>
            <input type="number" placeholder="0" value={montoMin} onChange={e => setMontoMin(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '0 0 100px' }}>
            <label className="form-label">Monto máx</label>
            <input type="number" placeholder="∞" value={montoMax} onChange={e => setMontoMax(e.target.value)} />
          </div>

          <button className="btn btn-secondary btn-sm" style={{ marginBottom: 1 }} onClick={() => {
            setCatFiltro([])
            setFpFiltro('')
            setBuscar('')
            setMontoMin('')
            setMontoMax('')
          }}>Limpiar</button>
        </div>

        {/* Chips de categorías */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {categorias.map(cat => {
            const active = catFiltro.includes(cat)
            return (
              <button
                key={cat}
                onClick={() => toggleCat(cat)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 500,
                  cursor: 'pointer', border: 'none',
                  background: active ? catColor(cat) + '33' : '#eee',
                  color: active ? catColor(cat) : '#666',
                  outline: active ? `1px solid ${catColor(cat)}` : 'none',
                  transition: 'all .15s',
                }}
              >
                {cat}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tabla */}
      <div className="card">
        {loading ? (
          <div className="loading">Cargando...</div>
        ) : gastos.length === 0 ? (
          <div className="empty-state">Sin movimientos con los filtros aplicados.</div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Nombre</th>
                    <th>Categoría</th>
                    <th>Forma de pago</th>
                    <th style={{ textAlign: 'right' }}>Monto</th>
                    <th style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {gastos.map(g => (
                    <tr key={g.id}>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {fmtFecha(g.fecha)}
                      </td>
                      <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {g.nombre || g.descripcion}
                      </td>
                      <td>
                        {editId === g.id ? (
                          <select
                            value={editCat}
                            onChange={e => setEditCat(e.target.value)}
                            style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
                            autoFocus
                          >
                            {categorias.map(c => <option key={c}>{c}</option>)}
                          </select>
                        ) : (
                          <span
                            className="badge"
                            style={{
                              background: catColor(g.categoria) + '22',
                              color: catColor(g.categoria),
                              cursor: 'pointer',
                            }}
                            onClick={() => startEdit(g)}
                            title="Clic para editar"
                          >
                            {g.categoria}
                            {g.categoria_override ? ' ✎' : ''}
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {g.forma_pago || '—'}
                      </td>
                      <td className="amount">
                        {editId === g.id ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}>
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>$</span>
                            <input
                              type="number"
                              value={editMonto}
                              onChange={e => setEditMonto(e.target.value)}
                              style={{ width: 100, padding: '4px 6px', fontSize: 12, textAlign: 'right' }}
                            />
                            <button className="btn btn-primary btn-sm" onClick={() => saveEdit(g.id)} disabled={saving} style={{ padding: '4px 8px' }}>
                              <Check size={12} />
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={() => setEditId(null)} style={{ padding: '4px 8px' }}>
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          fmt(g.monto)
                        )}
                      </td>
                      <td>
                        {deleteId === g.id ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-danger btn-sm" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => confirmDelete(g.id)}>Sí</button>
                            <button className="btn btn-secondary btn-sm" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setDeleteId(null)}>No</button>
                          </div>
                        ) : (
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px 8px', opacity: 0.5 }}
                            onClick={() => setDeleteId(g.id)}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totales */}
            <div style={{
              display: 'flex', justifyContent: 'flex-end', gap: 32,
              paddingTop: 14, marginTop: 4, borderTop: '1px solid var(--border)',
              fontSize: 13,
            }}>
              <span style={{ color: 'var(--text-secondary)' }}>{gastos.length} movimientos</span>
              {gastos.some(g => g.categoria === 'Ahorro/Inversión') && (
                <span style={{ color: 'var(--text-secondary)' }}>
                  Sin inv.: <strong>{fmt(totalExcluyendo)}</strong>
                </span>
              )}
              <span>Total: <strong style={{ fontSize: 15 }}>{fmt(totalFiltrado)}</strong></span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
