import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, LineChart, Line, Legend,
} from 'recharts'
import { api, fmt, catColor } from '../api'

const fmtY = (v) => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`
const TooltipCustom = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color }}>{p.name}: {fmt(p.value)}</div>
      ))}
    </div>
  )
}

export default function Analisis() {
  const [tendencia, setTendencia] = useState([])
  const [categorias, setCategorias] = useState([])
  const [catSel, setCatSel] = useState('')
  const [catData, setCatData] = useState([])
  const [hormigas, setHormigas] = useState([])
  const [recurrentes, setRecurrentes] = useState([])
  const [heatmap, setHeatmap] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.getTendencia(),
      api.getCategorias(),
      api.getHormigas(),
      api.getRecurrentes(),
      api.getHeatmap(),
    ]).then(([t, cats, h, r, hm]) => {
      setTendencia(t)
      const lista = cats.categorias.filter(c => !['A Clasificar', 'Ahorro/Inversión'].includes(c))
      setCategorias(lista)
      if (lista.length > 0) setCatSel(lista[0])
      setHormigas(h)
      setRecurrentes(r)
      setHeatmap(hm)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (catSel) api.getCategoriaTendencia(catSel).then(setCatData)
  }, [catSel])

  if (loading) return <div className="loading">Cargando análisis...</div>

  return (
    <div>
      <div className="page-header"><h1>Análisis</h1></div>

      {/* Tendencia general */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="section-title">Tendencia general — últimos 6 períodos</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={tendencia} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={fmtY} tick={{ fontSize: 11 }} width={60} />
            <Tooltip content={<TooltipCustom />} />
            <Bar dataKey="total_gastos" name="Gastos" radius={[4,4,0,0]}>
              {tendencia.map((entry, i) => (
                <Cell key={i} fill={entry.es_actual ? 'var(--accent)' : '#C8DDF5'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Control por categoría */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div className="section-title" style={{ margin: 0 }}>Control de categoría</div>
          <select value={catSel} onChange={e => setCatSel(e.target.value)} style={{ width: 'auto', minWidth: 160 }}>
            {categorias.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={catData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={fmtY} tick={{ fontSize: 11 }} width={60} />
            <Tooltip content={<TooltipCustom />} />
            {catData[0]?.presupuesto > 0 && (
              <ReferenceLine y={catData[0].presupuesto} stroke="var(--text-secondary)" strokeDasharray="6 3" label={{ value: 'Presupuesto', position: 'insideTopRight', fontSize: 11, fill: 'var(--text-secondary)' }} />
            )}
            <Bar dataKey="total" name="Gasto" radius={[4,4,0,0]}>
              {catData.map((entry, i) => (
                <Cell key={i} fill={entry.sobre_presupuesto ? 'var(--danger)' : 'var(--success)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="two-col" style={{ marginBottom: 20 }}>
        {/* Gastos hormiga */}
        <div className="card">
          <div className="section-title">Gastos hormiga</div>
          {hormigas.length === 0 ? <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Sin datos suficientes.</div> : (
            <table>
              <thead>
                <tr>
                  <th>Comercio</th><th style={{ textAlign: 'right' }}>Veces</th>
                  <th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Promedio</th>
                </tr>
              </thead>
              <tbody>
                {hormigas.map((h, i) => (
                  <tr key={i}>
                    <td>{h.nombre}</td>
                    <td style={{ textAlign: 'right' }}>{h.veces}x</td>
                    <td className="amount">{fmt(h.total)}</td>
                    <td className="amount" style={{ color: 'var(--text-secondary)' }}>{fmt(h.promedio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recurrentes */}
        <div className="card">
          <div className="section-title">Recurrentes detectados</div>
          {recurrentes.length === 0 ? <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Sin recurrentes detectados aún.</div> : (
            <table>
              <thead>
                <tr>
                  <th>Nombre</th><th>Frecuencia</th>
                  <th style={{ textAlign: 'right' }}>Monto típico</th><th>Próxima est.</th>
                </tr>
              </thead>
              <tbody>
                {recurrentes.map((r, i) => (
                  <tr key={i}>
                    <td>{r.nombre}</td>
                    <td><span className="badge">{r.frecuencia}</span></td>
                    <td className="amount">{fmt(r.monto_tipico)}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.proxima_estimada}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Heatmap */}
      {heatmap && heatmap.datos?.length > 0 && (
        <div className="card">
          <div className="section-title">Comparación entre períodos por categoría</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Categoría</th>
                  {heatmap.periodos.map(p => <th key={p} style={{ textAlign: 'right' }}>{p}</th>)}
                </tr>
              </thead>
              <tbody>
                {heatmap.datos.map((row, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 500 }}>{row.categoria}</td>
                    {heatmap.periodos.map(p => {
                      const cell = row[p]
                      return (
                        <td key={p}>
                          <div className={`heatmap-cell ${cell?.delta || ''}`}>
                            {fmt(cell?.total || 0)}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
