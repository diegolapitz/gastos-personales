import { useEffect, useState } from 'react'
import { api, fmt, fmtFecha, catColor } from '../api'
import { ArrowUp, ArrowDown, Minus } from 'lucide-react'

function MetricCard({ label, value, delta, deltaLabel, color }) {
  const sign = delta > 0 ? 'up' : delta < 0 ? 'down' : null
  const DeltaIcon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value" style={color ? { color } : {}}>{value}</div>
      {delta != null && (
        <div className={`metric-delta ${sign}`}>
          <DeltaIcon size={11} style={{ display: 'inline', marginRight: 3 }} />
          {deltaLabel}
        </div>
      )}
    </div>
  )
}

function CatBar({ nombre, gastado, presupuesto }) {
  const pct = presupuesto > 0 ? Math.min(gastado / presupuesto, 1) : 0
  const pctNum = Math.round(pct * 100)
  const cls = pct >= 1 ? 'danger' : pct >= 0.8 ? 'warn' : ''
  const fillColor = pct >= 1 ? 'var(--danger)' : pct >= 0.8 ? 'var(--warning)' : catColor(nombre)
  return (
    <div className="cat-bar-item">
      <div className="cat-bar-header">
        <span className="cat-bar-name">{nombre}</span>
        <span className="cat-bar-amounts">
          {fmt(gastado)}{presupuesto > 0 ? ` / ${fmt(presupuesto)} (${pctNum}%)` : ''}
        </span>
      </div>
      <div className="cat-bar-track">
        <div className="cat-bar-fill" style={{ width: `${pctNum}%`, background: fillColor }} />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [periodo, setPeriodo] = useState(null)
  const [recientes, setRecientes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.getPeriodoActual(), api.getRecientes(10)])
      .then(([p, r]) => { setPeriodo(p); setRecientes(r) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading">Cargando...</div>

  if (!periodo) return (
    <div>
      <div className="page-header"><h1>Dashboard</h1></div>
      <div className="alert alert-warn">
        No hay períodos configurados. Importá tu extracto de MercadoPago para comenzar.
        El sistema detectará tu ingreso de sueldo automáticamente.
      </div>
    </div>
  )

  const {
    total_gastos, total_inversiones, objetivo_ahorro, ahorro_real,
    dias_total, dias_transcurridos, por_categoria, presupuestos,
    total_anterior, monto_ingreso,
  } = periodo

  const deltaPct = total_anterior > 0
    ? Math.round((total_gastos - total_anterior) / total_anterior * 100)
    : null

  const presupTotal = Object.values(presupuestos || {}).reduce((a, b) => a + b, 0)
  const disponible = presupTotal - total_gastos
  const diasPct = dias_total > 0 ? Math.round(dias_transcurridos / dias_total * 100) : 0
  const ahorroPct = objetivo_ahorro > 0 ? Math.round(ahorro_real / objetivo_ahorro * 100) : 0

  const catOrdenadas = Object.entries(por_categoria || {})
    .sort((a, b) => b[1] - a[1])

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Período desde {fmtFecha(periodo.fecha_inicio)} · día {dias_transcurridos} de ~{dias_total}</p>
      </div>

      <div className="metrics-grid">
        <MetricCard
          label="Gastado en el período"
          value={fmt(total_gastos)}
          delta={deltaPct}
          deltaLabel={deltaPct != null ? `${Math.abs(deltaPct)}% vs período anterior` : null}
        />
        <MetricCard
          label="Disponible"
          value={fmt(disponible)}
          color={disponible < 0 ? 'var(--danger)' : undefined}
        />
        <MetricCard
          label="Objetivo de ahorro"
          value={fmt(objetivo_ahorro)}
          delta={null}
          deltaLabel={`Llevo ${fmt(ahorro_real)} ahorrado (${ahorroPct}%)`}
          color="var(--success)"
        />
        <MetricCard label="Invertido" value={fmt(total_inversiones)} color="var(--success)" />
      </div>

      <div className="progress-wrap card" style={{ marginBottom: 20 }}>
        <div className="progress-label">
          <span>Progreso del período</span>
          <span>{diasPct}% — día {dias_transcurridos}</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${diasPct}%` }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
          <span>Presupuesto total: {fmt(presupTotal)}</span>
          <span>Gastado: {fmt(total_gastos)}</span>
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="section-title">Gasto por categoría</div>
          {catOrdenadas.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Sin gastos aún.</div>}
          {catOrdenadas.map(([cat, gastado]) => (
            <CatBar
              key={cat}
              nombre={cat}
              gastado={gastado}
              presupuesto={presupuestos?.[cat] || 0}
            />
          ))}
        </div>

        <div className="card">
          <div className="section-title">Últimos movimientos</div>
          {recientes.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Sin movimientos.</div>}
          <div>
            {recientes.map(g => (
              <div key={g.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 0', borderBottom: '1px solid var(--border)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {g.nombre}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {fmtFecha(g.fecha)}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, marginLeft: 12 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{fmt(g.monto)}</span>
                  <span className="badge" style={{
                    background: catColor(g.categoria) + '22',
                    color: catColor(g.categoria),
                    fontSize: 10,
                  }}>{g.categoria}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
