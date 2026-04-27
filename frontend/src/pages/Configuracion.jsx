import { useEffect, useState } from 'react'
import { api, fmt, catColor, fmtFecha } from '../api'
import { Plus, Trash2, RefreshCw, Save, Pencil, Check, X } from 'lucide-react'

function Section({ title, children }) {
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="section-title">{title}</div>
      {children}
    </div>
  )
}

export default function Configuracion() {
  const [config, setConfig] = useState({})
  const [presupuestos, setPresupuestos] = useState({})
  const [categorias, setCategorias] = useState([])
  const [formasPago, setFormasPago] = useState([])
  const [reglas, setReglas] = useState([])
  const [periodos, setPeriodos] = useState([])
  const [loading, setLoading] = useState(true)

  // Períodos
  const [periodoEdits, setPeriodoEdits] = useState({})   // id -> {fecha_inicio, fecha_fin, monto_ingreso}
  const [periodoEditando, setPeriodoEditando] = useState(null)
  const [newPeriodoFecha, setNewPeriodoFecha] = useState('')
  const [newPeriodoMonto, setNewPeriodoMonto] = useState('')
  const [periodoSaving, setPeriodoSaving] = useState(false)

  // Config local edits
  const [umbral, setUmbral] = useState('')
  const [objAhorro, setObjAhorro] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)
  const [configOk, setConfigOk] = useState(false)

  // Presupuesto edits
  const [presupEdits, setPresupEdits] = useState({})
  const [savingPresup, setSavingPresup] = useState(false)
  const [presupOk, setPresupOk] = useState(false)

  // Nueva categoría
  const [newCat, setNewCat] = useState('')
  const [newCatExcluir, setNewCatExcluir] = useState(false)

  // Nueva forma de pago
  const [newFp, setNewFp] = useState('')

  // Nueva regla
  const [newReglaKeyword, setNewReglaKeyword] = useState('')
  const [newReglaCat, setNewReglaCat] = useState('')
  const [newReglaOrden, setNewReglaOrden] = useState('')

  // Recategorizar
  const [recatLoading, setRecatLoading] = useState(false)
  const [recatResult, setRecatResult] = useState(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const [cfg, cats, pres, pers] = await Promise.all([
      api.getConfig(),
      api.getCategorias(),
      api.getPresupuesto(),
      api.getPeriodos(),
    ])
    setConfig(cfg)
    setUmbral(cfg.umbral_sueldo || '')
    setObjAhorro(cfg.objetivo_ahorro_pct || '')
    setCategorias(cats.categorias_completo || cats.categorias || [])
    setFormasPago(cats.formas_pago || [])
    setReglas(cats.reglas || [])
    setPresupuestos(pres)
    const edits = {}
    Object.entries(pres).forEach(([c, v]) => { edits[c] = v })
    setPresupEdits(edits)
    const nombres = (cats.categorias_completo || []).map(c => c.nombre).filter(Boolean)
    if (nombres.length > 0) setNewReglaCat(nombres[0])
    setPeriodos(pers.sort((a, b) => a.fecha_inicio < b.fecha_inicio ? -1 : 1))
    setLoading(false)
  }

  async function saveConfig() {
    setSavingConfig(true)
    await api.setConfig({
      umbral_sueldo: Number(umbral),
      objetivo_ahorro_pct: Number(objAhorro),
    })
    setSavingConfig(false)
    setConfigOk(true)
    setTimeout(() => setConfigOk(false), 2000)
  }

  async function savePresupuestos() {
    setSavingPresup(true)
    const data = {}
    Object.entries(presupEdits).forEach(([c, v]) => { data[c] = Number(v) || 0 })
    await api.setTodosPresupuestos(data)
    setSavingPresup(false)
    setPresupOk(true)
    setTimeout(() => setPresupOk(false), 2000)
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
    if (!confirm(`¿Eliminar categoría "${nombre}"?`)) return
    await api.deleteCategoria(nombre)
    load()
  }

  async function addFormaPago() {
    if (!newFp.trim()) return
    await api.addFormaPago({ nombre: newFp.trim() })
    setNewFp('')
    load()
  }

  async function deleteFormaPago(nombre) {
    await api.deleteFormaPago(nombre)
    load()
  }

  async function addRegla() {
    if (!newReglaKeyword.trim() || !newReglaCat) return
    await api.addRegla({
      keyword: newReglaKeyword.trim().toLowerCase(),
      categoria: newReglaCat,
      orden: Number(newReglaOrden) || 100,
    })
    setNewReglaKeyword('')
    setNewReglaOrden('')
    load()
  }

  async function deleteRegla(id) {
    await api.deleteRegla(id)
    load()
  }

  function startEditPeriodo(p) {
    setPeriodoEditando(p.id)
    setPeriodoEdits(prev => ({
      ...prev,
      [p.id]: {
        fecha_inicio: p.fecha_inicio,
        fecha_fin: p.fecha_fin || '',
        monto_ingreso: p.monto_ingreso,
      }
    }))
  }

  async function savePeriodo(id) {
    setPeriodoSaving(true)
    const e = periodoEdits[id]
    await api.updatePeriodo(id, {
      fecha_inicio: e.fecha_inicio,
      fecha_fin: e.fecha_fin || null,
      monto_ingreso: Number(e.monto_ingreso) || 0,
    })
    setPeriodoEditando(null)
    setPeriodoSaving(false)
    load()
  }

  async function deletePeriodo(id) {
    if (!confirm('¿Eliminar este período? No se borran los gastos.')) return
    await api.deletePeriodo(id)
    load()
  }

  async function addPeriodo() {
    if (!newPeriodoFecha) return
    await api.crearPeriodo({
      fecha_inicio: newPeriodoFecha,
      monto_ingreso: Number(newPeriodoMonto) || 0,
    })
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
  }

  if (loading) return <div className="loading">Cargando configuración...</div>

  return (
    <div>
      <div className="page-header"><h1>Configuración</h1></div>

      {/* Config general */}
      <Section title="General">
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <div className="form-group">
            <label className="form-label">Umbral detección sueldo ($)</label>
            <input
              type="number"
              value={umbral}
              onChange={e => setUmbral(e.target.value)}
              placeholder="3000000"
            />
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>
              Monto mínimo para detectar un ingreso como sueldo
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Objetivo ahorro (%)</label>
            <input
              type="number"
              value={objAhorro}
              onChange={e => setObjAhorro(e.target.value)}
              placeholder="30"
              min={0} max={100}
            />
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>
              % del sueldo a destinar como objetivo de ahorro
            </div>
          </div>
        </div>
        <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={saveConfig} disabled={savingConfig}>
            <Save size={13} />
            {savingConfig ? 'Guardando...' : 'Guardar'}
          </button>
          {configOk && <span style={{ color: 'var(--success)', fontSize: 13 }}>✓ Guardado</span>}
        </div>
      </Section>

      {/* Presupuestos */}
      <Section title="Presupuestos por categoría">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {categorias
            .filter(c => typeof c === 'object' ? !c.excluir_gastos : !['Ahorro/Inversión', 'A Clasificar'].includes(c))
            .map(c => {
              const nombre = typeof c === 'object' ? c.nombre : c
              return (
                <div key={nombre} className="form-group">
                  <label className="form-label" style={{ color: catColor(nombre) }}>{nombre}</label>
                  <input
                    type="number"
                    value={presupEdits[nombre] ?? 0}
                    onChange={e => setPresupEdits(p => ({ ...p, [nombre]: e.target.value }))}
                    style={{ borderColor: catColor(nombre) + '55' }}
                  />
                </div>
              )
            })}
        </div>
        <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={savePresupuestos} disabled={savingPresup}>
            <Save size={13} />
            {savingPresup ? 'Guardando...' : 'Guardar presupuestos'}
          </button>
          {presupOk && <span style={{ color: 'var(--success)', fontSize: 13 }}>✓ Guardado</span>}
        </div>
      </Section>

      {/* Períodos */}
      <Section title="Períodos de cobro">
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Cada período empieza cuando cobrás el sueldo. Los gastos se asignan automáticamente según la fecha.
        </div>
        <div className="table-wrap" style={{ marginBottom: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Inicio</th>
                <th>Fin</th>
                <th>Cobro</th>
                <th>Gastos</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {periodos.map(p => {
                const editing = periodoEditando === p.id
                const e = periodoEdits[p.id] || {}
                return (
                  <tr key={p.id} style={p.es_actual ? { background: 'var(--accent-soft, #EEF6FF)' } : {}}>
                    <td>
                      {editing
                        ? <input type="date" value={e.fecha_inicio} style={{ width: 130 }}
                            onChange={ev => setPeriodoEdits(d => ({ ...d, [p.id]: { ...d[p.id], fecha_inicio: ev.target.value } }))} />
                        : <span style={{ fontWeight: p.es_actual ? 600 : 400 }}>{fmtFecha(p.fecha_inicio)}</span>
                      }
                    </td>
                    <td>
                      {editing
                        ? <input type="date" value={e.fecha_fin} style={{ width: 130 }}
                            onChange={ev => setPeriodoEdits(d => ({ ...d, [p.id]: { ...d[p.id], fecha_fin: ev.target.value } }))} />
                        : p.fecha_fin ? fmtFecha(p.fecha_fin) : <span style={{ color: 'var(--success)', fontSize: 12 }}>actual</span>
                      }
                    </td>
                    <td>
                      {editing
                        ? <input type="number" value={e.monto_ingreso} style={{ width: 120 }}
                            onChange={ev => setPeriodoEdits(d => ({ ...d, [p.id]: { ...d[p.id], monto_ingreso: ev.target.value } }))} />
                        : fmt(p.monto_ingreso)
                      }
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                      {fmt(p.total_gastos)}
                    </td>
                    <td>
                      {editing ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-primary btn-sm" style={{ padding: '4px 8px' }}
                            onClick={() => savePeriodo(p.id)} disabled={periodoSaving}>
                            <Check size={12} />
                          </button>
                          <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }}
                            onClick={() => setPeriodoEditando(null)}>
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }}
                            onClick={() => startEditPeriodo(p)}>
                            <Pencil size={12} />
                          </button>
                          <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px', opacity: 0.4 }}
                            onClick={() => deletePeriodo(p.id)}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="form-row" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="form-group" style={{ flex: '0 0 160px' }}>
            <label className="form-label">Inicio del período</label>
            <input type="date" value={newPeriodoFecha} onChange={e => setNewPeriodoFecha(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '0 0 160px' }}>
            <label className="form-label">Monto cobrado ($)</label>
            <input type="number" placeholder="0" value={newPeriodoMonto} onChange={e => setNewPeriodoMonto(e.target.value)} />
          </div>
          <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} onClick={addPeriodo}>
            <Plus size={13} /> Agregar período
          </button>
        </div>
      </Section>

      {/* Categorías */}
      <Section title="Categorías">
        <div className="table-wrap" style={{ marginBottom: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Excluir de gastos</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(categorias) ? categorias : []).map(c => {
                const nombre = typeof c === 'object' ? c.nombre : c
                const excluir = typeof c === 'object' ? c.excluir_gastos : false
                return (
                  <tr key={nombre}>
                    <td>
                      <span
                        className="badge"
                        style={{ background: catColor(nombre) + '22', color: catColor(nombre) }}
                      >{nombre}</span>
                    </td>
                    <td style={{ fontSize: 12, color: excluir ? 'var(--success)' : 'var(--text-secondary)' }}>
                      {excluir ? 'Sí' : 'No'}
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '4px 8px', opacity: 0.5 }}
                        onClick={() => deleteCategoria(nombre)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="form-row" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Nueva categoría</label>
            <input
              placeholder="Nombre..."
              value={newCat}
              onChange={e => setNewCat(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCategoria()}
            />
          </div>
          <div className="form-group" style={{ flex: '0 0 auto' }}>
            <label className="form-label">Excluir de gastos</label>
            <div style={{ display: 'flex', alignItems: 'center', height: 36, gap: 6 }}>
              <input
                type="checkbox"
                checked={newCatExcluir}
                onChange={e => setNewCatExcluir(e.target.checked)}
                style={{ width: 'auto' }}
              />
              <span style={{ fontSize: 12 }}>Sí</span>
            </div>
          </div>
          <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} onClick={addCategoria}>
            <Plus size={13} /> Agregar
          </button>
        </div>
      </Section>

      {/* Formas de pago */}
      <Section title="Formas de pago">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {formasPago.map(fp => (
            <div key={fp} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="badge">{fp}</span>
              <button
                className="btn btn-secondary btn-sm"
                style={{ padding: '2px 6px', opacity: 0.5 }}
                onClick={() => deleteFormaPago(fp)}
              >
                <Trash2 size={10} />
              </button>
            </div>
          ))}
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Nueva forma de pago</label>
            <input
              placeholder="Ej: Efectivo, Tarjeta de débito..."
              value={newFp}
              onChange={e => setNewFp(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addFormaPago()}
            />
          </div>
          <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} onClick={addFormaPago}>
            <Plus size={13} /> Agregar
          </button>
        </div>
      </Section>

      {/* Reglas de categorización */}
      <Section title="Reglas de categorización (keywords)">
        <div className="table-wrap" style={{ marginBottom: 16, maxHeight: 320, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Orden</th>
                <th>Keyword</th>
                <th>Categoría</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {reglas.sort((a, b) => a.orden - b.orden).map(r => (
                <tr key={r.id}>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{r.orden}</td>
                  <td><code style={{ fontSize: 12, background: '#F5F5F3', padding: '2px 6px', borderRadius: 4 }}>{r.keyword}</code></td>
                  <td>
                    <span
                      className="badge"
                      style={{ background: catColor(r.categoria) + '22', color: catColor(r.categoria) }}
                    >{r.categoria}</span>
                  </td>
                  <td>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '4px 8px', opacity: 0.5 }}
                      onClick={() => deleteRegla(r.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="form-row" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="form-group" style={{ flex: '0 0 70px' }}>
            <label className="form-label">Orden</label>
            <input
              type="number"
              placeholder="100"
              value={newReglaOrden}
              onChange={e => setNewReglaOrden(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">Keyword</label>
            <input
              placeholder="ej: pedidosya"
              value={newReglaKeyword}
              onChange={e => setNewReglaKeyword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addRegla()}
            />
          </div>
          <div className="form-group" style={{ flex: '1 1 140px' }}>
            <label className="form-label">Categoría</label>
            <select value={newReglaCat} onChange={e => setNewReglaCat(e.target.value)}>
              {(Array.isArray(categorias) ? categorias : []).map(c => {
                const nombre = typeof c === 'object' ? c.nombre : c
                return <option key={nombre}>{nombre}</option>
              })}
            </select>
          </div>
          <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} onClick={addRegla}>
            <Plus size={13} /> Agregar
          </button>
        </div>

        <div className="divider" />

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={recategorizar} disabled={recatLoading}>
            <RefreshCw size={13} style={recatLoading ? { animation: 'spin 1s linear infinite' } : {}} />
            {recatLoading ? 'Recategorizando...' : 'Recategorizar todos los gastos'}
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Aplica las reglas actuales a todos los movimientos que no fueron editados manualmente
          </span>
          {recatResult && (
            <span style={{ color: 'var(--success)', fontSize: 13 }}>
              ✓ {recatResult.actualizados} movimientos recategorizados
            </span>
          )}
        </div>
      </Section>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
