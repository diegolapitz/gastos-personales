import { useEffect, useState } from 'react'
import { api, fmt, catColor, fmtFecha } from '../api'
import { Plus, Trash2, RefreshCw, Save } from 'lucide-react'

function Section({ title, children }) {
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="section-label">{title}</div>
      {children}
    </div>
  )
}

function Modal({ title, message, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>{title}</h3>
        <p>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-danger" onClick={onConfirm}>Confirmar</button>
        </div>
      </div>
    </div>
  )
}

function Ok({ show }) {
  if (!show) return null
  return <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)', letterSpacing: '0.1em' }}>✓ GUARDADO</span>
}

export default function Configuracion() {
  const [config, setConfig] = useState({})
  const [presupuestos, setPresupuestos] = useState({})
  const [categorias, setCategorias] = useState([])
  const [formasPago, setFormasPago] = useState([])
  const [reglas, setReglas] = useState([])
  const [periodos, setPeriodos] = useState([])
  const [loading, setLoading] = useState(true)

  const [periodoEdits, setPeriodoEdits] = useState({})
  const [periodoEditando, setPeriodoEditando] = useState(null)
  const [newPeriodoFecha, setNewPeriodoFecha] = useState('')
  const [newPeriodoMonto, setNewPeriodoMonto] = useState('')

  const [umbral, setUmbral] = useState('')
  const [objAhorro, setObjAhorro] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)
  const [configOk, setConfigOk] = useState(false)

  const [presupEdits, setPresupEdits] = useState({})
  const [savingPresup, setSavingPresup] = useState(false)
  const [presupOk, setPresupOk] = useState(false)

  const [newCat, setNewCat] = useState('')
  const [newCatExcluir, setNewCatExcluir] = useState(false)
  const [catEditando, setCatEditando] = useState(null) // nombre original
  const [catEditNombre, setCatEditNombre] = useState('')
  const [newFp, setNewFp] = useState('')
  const [newReglaKeyword, setNewReglaKeyword] = useState('')
  const [newReglaCat, setNewReglaCat] = useState('')
  const [newReglaOrden, setNewReglaOrden] = useState('50')

  const [recatLoading, setRecatLoading] = useState(false)
  const [recatResult, setRecatResult] = useState(null)
  const [showRecatModal, setShowRecatModal] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [cfg, cats, pres, pers] = await Promise.all([
      api.getConfig(), api.getCategorias(), api.getPresupuesto(), api.getPeriodos(),
    ])
    setConfig(cfg)
    setUmbral(cfg.umbral_sueldo || '')
    setObjAhorro(cfg.objetivo_ahorro_pct || '')
    const catsFull = cats.categorias_completo || cats.categorias || []
    setCategorias(catsFull)
    setFormasPago(cats.formas_pago || [])
    setReglas(cats.reglas || [])
    setPresupuestos(pres)
    const edits = {}
    Object.entries(pres).forEach(([c, v]) => { edits[c] = v })
    setPresupEdits(edits)
    const nombres = catsFull.map(c => c.nombre || c).filter(Boolean)
    if (nombres.length > 0) setNewReglaCat(nombres[0])
    setPeriodos(pers.sort((a, b) => a.fecha_inicio < b.fecha_inicio ? -1 : 1))
    setLoading(false)
  }

  async function saveConfig() {
    setSavingConfig(true)
    await api.setConfig({ umbral_sueldo: Number(umbral), objetivo_ahorro_pct: Number(objAhorro) })
    setSavingConfig(false)
    setConfigOk(true)
    setTimeout(() => setConfigOk(false), 2500)
  }

  async function savePresupuestos() {
    setSavingPresup(true)
    const data = {}
    Object.entries(presupEdits).forEach(([c, v]) => { data[c] = Number(v) || 0 })
    await api.setTodosPresupuestos(data)
    setSavingPresup(false)
    setPresupOk(true)
    setTimeout(() => setPresupOk(false), 2500)
    load()
  }

  async function addCategoria() {
    if (!newCat.trim()) return
    await api.addCategoria({ nombre: newCat.trim(), excluir_gastos: newCatExcluir })
    setNewCat('')
    setNewCatExcluir(false)
    load()
  }

  async function deleteCategoria(nombre) {
    if (!confirm(`¿Eliminar "${nombre}"?`)) return
    await api.deleteCategoria(nombre)
    load()
  }

  function startEditCat(nombre) {
    setCatEditando(nombre)
    setCatEditNombre(nombre)
  }

  async function saveEditCat(nombreOriginal) {
    const nuevo = catEditNombre.trim()
    if (!nuevo) return
    if (nuevo !== nombreOriginal) {
      await api.updateCategoria(nombreOriginal, { nuevo_nombre: nuevo })
    }
    setCatEditando(null)
    load()
  }

  async function toggleExcluir(nombre, excluir) {
    await api.updateCategoria(nombre, { excluir_gastos: !excluir })
    load()
  }

  async function addFormaPago() {
    if (!newFp.trim()) return
    await api.addFormaPago({ nombre: newFp.trim() })
    setNewFp('')
    load()
  }

  async function addRegla() {
    if (!newReglaKeyword.trim() || !newReglaCat) return
    await api.addRegla({ keyword: newReglaKeyword.trim().toLowerCase(), categoria: newReglaCat, orden: Number(newReglaOrden) || 50 })
    setNewReglaKeyword('')
    setNewReglaOrden('50')
    load()
  }

  function startEditPeriodo(p) {
    setPeriodoEditando(p.id)
    setPeriodoEdits(prev => ({
      ...prev,
      [p.id]: { fecha_inicio: p.fecha_inicio, fecha_fin: p.fecha_fin || '', monto_ingreso: p.monto_ingreso }
    }))
  }

  async function savePeriodo(id) {
    const e = periodoEdits[id]
    await api.updatePeriodo(id, { fecha_inicio: e.fecha_inicio, fecha_fin: e.fecha_fin || null, monto_ingreso: Number(e.monto_ingreso) || 0 })
    setPeriodoEditando(null)
    load()
  }

  async function addPeriodo() {
    if (!newPeriodoFecha) return
    await api.crearPeriodo({ fecha_inicio: newPeriodoFecha, monto_ingreso: Number(newPeriodoMonto) || 0 })
    setNewPeriodoFecha('')
    setNewPeriodoMonto('')
    load()
  }

  async function recategorizar() {
    setRecatLoading(true)
    setRecatResult(null)
    const r = await api.recategorizar()
    setRecatLoading(false)
    setRecatResult(r)
    setShowRecatModal(false)
    load()
  }

  if (loading) return <div className="loading">CARGANDO</div>

  const catNombres = categorias.map(c => c.nombre || c)

  const inp = (val, onChange, props = {}) => (
    <input value={val} onChange={e => onChange(e.target.value)} {...props} />
  )

  return (
    <div>
      <div className="page-header"><h1>Configuración</h1></div>

      {showRecatModal && (
        <Modal
          title="RECATEGORIZAR GASTOS"
          message="Esto va a re-aplicar todas las reglas keyword a los gastos que no fueron editados manualmente. Los gastos con override manual no se tocan."
          onConfirm={recategorizar}
          onCancel={() => setShowRecatModal(false)}
        />
      )}

      {/* General */}
      <Section title="General">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label">Umbral detección sueldo ($)</label>
            {inp(umbral, setUmbral, { type: 'number', placeholder: '3000000' })}
          </div>
          <div className="form-group" style={{ flex: '1 1 140px' }}>
            <label className="form-label">Objetivo ahorro (%)</label>
            {inp(objAhorro, setObjAhorro, { type: 'number', placeholder: '50', min: 0, max: 100 })}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingBottom: 1 }}>
            <button className="btn btn-primary btn-sm" onClick={saveConfig} disabled={savingConfig}>
              <Save size={11} /> {savingConfig ? 'Guardando...' : 'Guardar'}
            </button>
            <Ok show={configOk} />
          </div>
        </div>
      </Section>

      {/* Presupuestos */}
      <Section title="Presupuestos por categoría">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 16 }}>
          {categorias
            .filter(c => !(c.excluir_gastos) && !['A Clasificar', 'A Revisar'].includes(c.nombre || c))
            .map(c => {
              const nombre = c.nombre || c
              return (
                <div key={nombre} className="form-group">
                  <label className="form-label" style={{ color: catColor(nombre) + 'cc' }}>{nombre}</label>
                  <input
                    type="number"
                    value={presupEdits[nombre] ?? 0}
                    onChange={e => setPresupEdits(p => ({ ...p, [nombre]: e.target.value }))}
                    style={{ fontFamily: 'var(--mono)', borderColor: catColor(nombre) + '33' }}
                  />
                </div>
              )
            })}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn btn-primary btn-sm" onClick={savePresupuestos} disabled={savingPresup}>
            <Save size={11} /> {savingPresup ? 'Guardando...' : 'Guardar presupuestos'}
          </button>
          <Ok show={presupOk} />
        </div>
      </Section>

      {/* Períodos */}
      <Section title="Períodos de cobro">
        <div className="table-wrap" style={{ marginBottom: 14 }}>
          <table>
            <thead>
              <tr>
                <th>Inicio</th><th>Fin</th><th style={{ textAlign: 'right' }}>Ingreso</th>
                <th style={{ textAlign: 'right' }}>Gastos</th><th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {periodos.map(p => {
                const editing = periodoEditando === p.id
                const e = periodoEdits[p.id] || {}
                const isActual = p.es_actual || !p.fecha_fin
                return (
                  <tr key={p.id} style={isActual ? { background: '#0d1520' } : {}}>
                    <td className="mono">
                      {editing
                        ? <input type="date" value={e.fecha_inicio} style={{ width: 130, fontFamily: 'var(--mono)', fontSize: 11 }}
                            onChange={ev => setPeriodoEdits(d => ({ ...d, [p.id]: { ...d[p.id], fecha_inicio: ev.target.value } }))} />
                        : <span style={{ color: isActual ? 'var(--blue)' : 'var(--text)' }}>{fmtFecha(p.fecha_inicio)}{isActual ? ' ←' : ''}</span>
                      }
                    </td>
                    <td className="mono" style={{ color: 'var(--text-2)' }}>
                      {editing
                        ? <input type="date" value={e.fecha_fin || ''} style={{ width: 130, fontFamily: 'var(--mono)', fontSize: 11 }}
                            onChange={ev => setPeriodoEdits(d => ({ ...d, [p.id]: { ...d[p.id], fecha_fin: ev.target.value } }))} />
                        : (p.fecha_fin ? fmtFecha(p.fecha_fin) : 'HOY')
                      }
                    </td>
                    <td className="amount">
                      {editing
                        ? <input type="number" value={e.monto_ingreso || ''} style={{ width: 120, fontFamily: 'var(--mono)', fontSize: 11, textAlign: 'right' }}
                            onChange={ev => setPeriodoEdits(d => ({ ...d, [p.id]: { ...d[p.id], monto_ingreso: ev.target.value } }))} />
                        : fmt(p.monto_ingreso || 0)
                      }
                    </td>
                    <td className="amount" style={{ color: 'var(--text-2)' }}>{fmt(p.total_gastos || 0)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                        {editing ? (
                          <>
                            <button className="btn btn-primary btn-sm" onClick={() => savePeriodo(p.id)}>✓</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setPeriodoEditando(null)}>✕</button>
                          </>
                        ) : (
                          <button className="btn btn-ghost btn-sm" onClick={() => startEditPeriodo(p)}>Editar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: '0 0 auto' }}>
            <label className="form-label">Fecha inicio</label>
            <input type="date" value={newPeriodoFecha} onChange={e => setNewPeriodoFecha(e.target.value)} style={{ width: 140 }} />
          </div>
          <div className="form-group" style={{ flex: '0 0 auto' }}>
            <label className="form-label">Ingreso ($)</label>
            <input type="number" value={newPeriodoMonto} onChange={e => setNewPeriodoMonto(e.target.value)} placeholder="0" style={{ width: 130 }} />
          </div>
          <button className="btn btn-ghost btn-sm" onClick={addPeriodo} style={{ marginBottom: 1 }}>
            <Plus size={11} /> Agregar período
          </button>
        </div>
      </Section>

      {/* Categorías + Formas de pago */}
      <div className="two-col" style={{ marginBottom: 14 }}>
        <Section title="Categorías">
          <div style={{ marginBottom: 12 }}>
            {categorias.map(c => {
              const nombre = c.nombre || c
              const excluir = c.excluir_gastos || false
              const editando = catEditando === nombre
              return (
                <div key={nombre} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 0', borderBottom: '1px solid var(--border)',
                  gap: 8,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: catColor(nombre), flexShrink: 0 }} />
                    {editando ? (
                      <input
                        autoFocus
                        value={catEditNombre}
                        onChange={e => setCatEditNombre(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveEditCat(nombre)
                          if (e.key === 'Escape') setCatEditando(null)
                        }}
                        onBlur={() => saveEditCat(nombre)}
                        style={{ fontSize: 12, padding: '2px 6px', flex: 1, minWidth: 0 }}
                      />
                    ) : (
                      <span
                        style={{ fontSize: 12, color: excluir ? 'var(--text-2)' : 'var(--text)', cursor: 'text', flex: 1 }}
                        onClick={() => startEditCat(nombre)}
                        title="Clic para renombrar"
                      >
                        {nombre}
                      </span>
                    )}
                    {excluir && !editando && (
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '0.1em', color: 'var(--text-3)', textTransform: 'uppercase', flexShrink: 0 }}>EXCL.</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      title={excluir ? 'Incluir en gastos' : 'Excluir de gastos'}
                      style={{ opacity: excluir ? 0.9 : 0.3, padding: '3px 6px', fontSize: 9, fontFamily: 'var(--mono)', letterSpacing: '0.05em' }}
                      onClick={() => toggleExcluir(nombre, excluir)}
                    >
                      {excluir ? 'EXCL' : 'excl'}
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ opacity: 0.35, padding: '3px 6px' }} onClick={() => deleteCategoria(nombre)}>
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Nueva categoría</label>
              <input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Nombre" onKeyDown={e => e.key === 'Enter' && addCategoria()} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 1 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={newCatExcluir} onChange={e => setNewCatExcluir(e.target.checked)} style={{ width: 'auto' }} />
                excluir
              </label>
              <button className="btn btn-ghost btn-sm" onClick={addCategoria}><Plus size={11} /></button>
            </div>
          </div>
        </Section>

        <Section title="Formas de pago">
          <div style={{ marginBottom: 12 }}>
            {formasPago.map(fp => (
              <div key={fp} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '7px 0', borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 12 }}>{fp}</span>
                <button className="btn btn-ghost btn-sm" style={{ opacity: 0.4, padding: '3px 6px' }} onClick={() => api.deleteFormaPago(fp).then(load)}>
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Nueva forma de pago</label>
              <input value={newFp} onChange={e => setNewFp(e.target.value)} placeholder="Ej: Efectivo" onKeyDown={e => e.key === 'Enter' && addFormaPago()} />
            </div>
            <button className="btn btn-ghost btn-sm" onClick={addFormaPago} style={{ marginBottom: 1 }}><Plus size={11} /></button>
          </div>
        </Section>
      </div>

      {/* Reglas keyword */}
      <Section title="Reglas de categorización (keywords)">
        <div className="table-wrap" style={{ marginBottom: 14 }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 60 }}>Orden</th>
                <th>Keyword</th>
                <th>Categoría</th>
                <th style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {reglas.map(r => (
                <tr key={r.id}>
                  <td className="mono" style={{ color: 'var(--text-3)' }}>{r.orden}</td>
                  <td className="mono">{r.keyword}</td>
                  <td>
                    <span className="badge" style={{ background: catColor(r.categoria) + '18', color: catColor(r.categoria) }}>
                      {r.categoria}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" style={{ opacity: 0.35, padding: '3px 6px' }} onClick={() => api.deleteRegla(r.id).then(load)}>
                      <Trash2 size={10} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '0 0 60px' }}>
            <label className="form-label">Orden</label>
            <input type="number" value={newReglaOrden} onChange={e => setNewReglaOrden(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Keyword</label>
            <input value={newReglaKeyword} onChange={e => setNewReglaKeyword(e.target.value)} placeholder="ej: pedidosya" />
          </div>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Categoría</label>
            <select value={newReglaCat} onChange={e => setNewReglaCat(e.target.value)}>
              {catNombres.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={addRegla} style={{ marginBottom: 1 }}>
            <Plus size={11} /> Agregar regla
          </button>
        </div>
      </Section>

      {/* Recategorizar */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 4 }}>
            Recategorización masiva
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Re-aplica todas las reglas keyword a los gastos no editados manualmente.
          </div>
          {recatResult && (
            <div style={{ marginTop: 6, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--green)' }}>
              ✓ {recatResult.actualizados ?? JSON.stringify(recatResult)}
            </div>
          )}
        </div>
        <button className="btn btn-ghost" onClick={() => setShowRecatModal(true)} disabled={recatLoading}>
          <RefreshCw size={12} /> {recatLoading ? 'Procesando...' : 'Recategorizar'}
        </button>
      </div>
    </div>
  )
}
