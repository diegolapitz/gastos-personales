import { useEffect, useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, LineChart, Line, LabelList,
} from 'recharts'
import { api, fmt, fmtFecha, catColor } from '../api'

// ── Formatters ─────────────────────────────────────────────────────────────────
const fmtY = v =>
  v >= 1000000 ? `${(v / 1000000).toFixed(1)}M`
  : v >= 1000 ? `${(v / 1000).toFixed(0)}k`
  : `${v}`

const FREQ_COLOR = {
  MENSUAL: 'var(--blue)',
  SEMANAL: 'var(--orange)',
  DIARIO: 'var(--red)',
}

// Heatmap cell intensity: 0–1 ratio → background + text (light theme)
function heatCell(total, max) {
  if (!total || !max) return { bg: 'transparent', fg: 'var(--dimmer)' }
  const r = total / max
  if (r < 0.15) return { bg: '#eaf2ec', fg: 'var(--dim)' }
  if (r < 0.3)  return { bg: '#cde4d2', fg: 'var(--ink2)' }
  if (r < 0.5)  return { bg: '#a8cdb1', fg: 'var(--ink2)' }
  if (r < 0.7)  return { bg: '#f5e0c8', fg: 'var(--ink2)' }
  if (r < 0.85) return { bg: '#ecc49a', fg: 'var(--ink)' }
  return { bg: '#dea07a', fg: 'var(--ink)' }
}

// ── Shared Styles ──────────────────────────────────────────────────────────────
const SEC = { padding: '28px 0', borderTop: '1px solid var(--border)' }
const LABEL = {
  fontFamily: 'var(--mono)',
  fontSize: 10,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--text-3)',
  marginBottom: 18,
}
const EMPTY = {
  fontSize: 12,
  color: 'var(--text-3)',
  padding: '20px 0',
  fontFamily: 'var(--mono)',
}

// ── Primitives ─────────────────────────────────────────────────────────────────
function Sk({ w = '100%', h = 16, mb = 10, delay = 0 }) {
  return (
    <div style={{
      width: w, height: h, marginBottom: mb, borderRadius: 2,
      background: 'var(--surface)',
      animation: `skPulse 1.4s ${delay}s ease-in-out infinite`,
    }} />
  )
}

function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid #3a3a3a',
      borderRadius: 3, padding: '10px 14px',
      fontFamily: 'var(--mono)', fontSize: 11,
    }}>
      <div style={{ color: 'var(--text-3)', marginBottom: 6 }}>{label}</div>
      {payload.map(p => p.value != null && (
        <div key={p.name} style={{ color: p.color || 'var(--text)', fontWeight: 600, marginTop: 2 }}>
          {p.name}: {fmt(p.value)}
        </div>
      ))}
    </div>
  )
}

function CatTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid #3a3a3a',
      borderRadius: 3, padding: '10px 14px',
      fontFamily: 'var(--mono)', fontSize: 11,
    }}>
      <div style={{ color: 'var(--text-3)', marginBottom: 6 }}>{label}</div>
      <div style={{ color: 'var(--text)', fontWeight: 600 }}>{fmt(d?.total)}</div>
      {d?.monto_ingreso > 0 && (
        <div style={{ color: 'var(--text-2)', marginTop: 2 }}>{d.pct_sueldo}% del sueldo</div>
      )}
      {d?.presupuesto > 0 && (
        <div style={{ color: d?.sobre_presupuesto ? 'var(--red)' : 'var(--text-3)', marginTop: 2 }}>
          Presup: {fmt(d.presupuesto)}
        </div>
      )}
    </div>
  )
}

function SortableTable({ cols, data, defaultSort, highlight }) {
  const [sort, setSort] = useState(defaultSort || cols[0]?.key)
  const [asc, setAsc] = useState(false)

  const sorted = [...data].sort((a, b) => {
    const av = a[sort], bv = b[sort]
    return asc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
  })

  function toggle(key) {
    if (sort === key) setAsc(a => !a)
    else { setSort(key); setAsc(false) }
  }

  return (
    <table>
      <thead>
        <tr>
          {cols.map(c => (
            <th key={c.key} onClick={() => toggle(c.key)}
              style={{ cursor: 'pointer', userSelect: 'none', textAlign: c.right ? 'right' : 'left' }}>
              {c.label}{sort === c.key ? (asc ? ' ↑' : ' ↓') : ''}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((row, i) => (
          <tr key={i} style={highlight?.(row) ? {
            borderLeft: '2px solid var(--orange)',
            paddingLeft: 6,
          } : {}}>
            {cols.map(c => (
              <td key={c.key}
                className={c.mono ? 'mono' : c.amount ? 'amount' : ''}
                style={c.right && !c.amount ? { textAlign: 'right' } : {}}>
                {c.render ? c.render(row) : row[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Bar label for % del sueldo ─────────────────────────────────────────────────
function BarPctLabel({ x, y, width, value }) {
  if (!value) return null
  return (
    <text x={x + width / 2} y={y - 4} fill="var(--text-3)"
      textAnchor="middle" fontSize={9} fontFamily="var(--mono)">
      {value}%
    </text>
  )
}

// ── Section 1: Headline Metric ─────────────────────────────────────────────────
function HeadlineMetric({ resumen }) {
  if (!resumen) {
    return (
      <div style={{ padding: '32px 0 28px' }}>
        <Sk h={52} w="60%" mb={12} />
        <Sk h={16} w="45%" mb={8} />
        <Sk h={12} w="70%" />
      </div>
    )
  }

  const { pct_variacion, promedio_diario_actual, promedio_diario_historico, proyeccion_cierre } = resumen

  if (pct_variacion == null) {
    return (
      <div style={{ padding: '32px 0 28px' }}>
        <div style={{ fontSize: 13, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
          Se necesitan al menos 2 períodos para comparar.
        </div>
      </div>
    )
  }

  const mejor = pct_variacion < 0
  const color = mejor ? 'var(--green)' : pct_variacion > 0 ? 'var(--red)' : 'var(--text-2)'
  const absPct = Math.abs(pct_variacion).toFixed(1)

  return (
    <div style={{ padding: '32px 0 28px' }}>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 56, fontWeight: 700,
        lineHeight: 1, color, letterSpacing: '-0.02em',
      }}>
        {mejor ? '−' : '+'}{absPct}%
      </div>
      <div style={{ marginTop: 10, fontSize: 15, color: 'var(--text)', fontWeight: 500 }}>
        Este período vas {mejor ? 'mejor' : 'peor'} que tu promedio histórico
      </div>
      <div style={{
        marginTop: 6, fontSize: 12, color: 'var(--text-3)',
        fontFamily: 'var(--mono)', letterSpacing: '0.02em',
      }}>
        Promedio histórico: {fmt(promedio_diario_historico)}/día
        · Este período: {fmt(promedio_diario_actual)}/día
        · Proyección al cierre: {fmt(proyeccion_cierre)}
      </div>
    </div>
  )
}

// ── Section 2: Ranking por % del sueldo ──────────────────────────────────────
function RankingRow({ item, rank, maxPct }) {
  const barW = maxPct > 0 ? (item.pct_sueldo / maxPct * 100).toFixed(1) + '%' : '0%'
  const vpp = item.variacion_pp
  const arrow = vpp > 0 ? '↑' : vpp < 0 ? '↓' : '·'
  const varColor = vpp > 0 ? 'var(--red)' : vpp < 0 ? 'var(--green)' : 'var(--text-3)'

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '28px 170px 1fr 100px 100px 68px',
      alignItems: 'center',
      gap: 12,
      padding: '9px 0',
      borderBottom: '1px solid var(--border)',
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)', textAlign: 'right' }}>
        {typeof rank === 'string' ? rank : `#${rank}`}
      </div>
      <div style={{ fontSize: 12, color: catColor(item.nombre), fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.nombre}
      </div>
      <div style={{ height: 4, background: 'var(--border)' }}>
        <div style={{ height: '100%', width: barW, background: 'var(--blue)', transition: 'width 0.4s ease' }} />
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-2)', textAlign: 'right' }}>
        {item.pct_sueldo > 0 ? `${item.pct_sueldo}%` : '—'}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)', textAlign: 'right' }}>
        {item.monto > 0 ? fmt(item.monto) : '—'}
        {item.promedio_mensual > 0 && (
          <div style={{ fontSize: 9, color: 'var(--dimmer)', marginTop: 1 }}>
            ~{fmt(item.promedio_mensual)}/mes
          </div>
        )}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: varColor, textAlign: 'right' }}>
        {vpp !== 0 ? `${arrow} ${Math.abs(vpp)}pp` : '·'}
      </div>
    </div>
  )
}

function RankingSection({ ranking, allCategorias }) {
  const [sortKey, setSortKey] = useState('pct_sueldo')
  const [sortAsc, setSortAsc] = useState(false)

  function toggleSort(key) {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(false) }
  }

  // Returns a header cell div — called as {hdrCell(...)} not as <HdrCell>
  function hdrCell(k, label, right = false) {
    const active = sortKey === k
    return (
      <div
        onClick={() => toggleSort(k)}
        style={{
          textAlign: right ? 'right' : 'left', cursor: 'pointer', userSelect: 'none',
          color: active ? 'var(--text-2)' : 'var(--text-3)', transition: 'color 0.15s',
        }}
      >
        {label}
        <span style={{ marginLeft: 3, fontSize: 8, opacity: active ? 1 : 0.4 }}>
          {active ? (sortAsc ? '↑' : '↓') : '↕'}
        </span>
      </div>
    )
  }

  if (!ranking) {
    return (
      <div style={SEC}>
        <div style={LABEL}>Ranking por categoría</div>
        {[...Array(6)].map((_, i) => <Sk key={i} h={32} mb={2} delay={i * 0.08} />)}
      </div>
    )
  }

  const { categorias: rankCats, monto_ingreso } = ranking

  // Merge ranking data with ALL known categories — zero-spend ones get dimmed rows
  const rankMap = new Map(rankCats.map(c => [c.nombre, c]))
  const merged = [
    ...rankCats,
    ...(allCategorias || [])
      .filter(n => !rankMap.has(n))
      .map(n => ({ nombre: n, monto: 0, pct_sueldo: 0, pct_sueldo_anterior: 0, variacion_pp: 0 })),
  ]

  const maxPct = merged.reduce((m, c) => Math.max(m, c.pct_sueldo), 0)

  const sorted = [...merged].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey]
    if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
    return sortAsc ? av - bv : bv - av
  })

  let rankCounter = 0
  const withRank = sorted.map(cat => ({
    ...cat,
    _displayRank: cat.monto > 0 ? ++rankCounter : '—',
  }))

  return (
    <div style={SEC}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <div style={LABEL}>Ranking por categoría — % del sueldo</div>
        {monto_ingreso === 0 && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--orange)', letterSpacing: '0.06em' }}>
            Sin ingreso configurado — ordenado por monto
          </div>
        )}
      </div>
      {merged.filter(c => c.monto > 0).length === 0
        ? <div style={EMPTY}>Sin gastos en el período actual.</div>
        : (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '28px 170px 1fr 100px 100px 68px',
              gap: 12, padding: '6px 0',
              fontFamily: 'var(--mono)', fontSize: 9,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              borderBottom: '1px solid var(--border)',
            }}>
              <div />
              {hdrCell('nombre', 'Categoría')}
              <div />
              {hdrCell('pct_sueldo', '% sueldo', true)}
              {hdrCell('monto', 'Monto', true)}
              {hdrCell('variacion_pp', 'Var.', true)}
            </div>
            {withRank.map(cat => (
              <div key={cat.nombre} style={{ opacity: cat.monto === 0 ? 0.32 : 1, transition: 'opacity 0.15s' }}>
                <RankingRow item={cat} rank={cat._displayRank} maxPct={maxPct} />
              </div>
            ))}
          </>
        )}
    </div>
  )
}

// ── Section 3: Evolución por categoría ────────────────────────────────────────
function CatEvolution({ categorias, catData, catSel, setCatSel, loading }) {
  const catFrase = useMemo(() => {
    if (!catData.length) return null
    const conDatos = catData.filter(d => d.total > 0)
    if (!conDatos.length) return `Sin gastos en esta categoría en los últimos ${catData.length} períodos.`
    const prom = Math.round(conDatos.reduce((s, d) => s + d.total, 0) / conDatos.length)
    const maxP = [...conDatos].sort((a, b) => b.total - a.total)[0]
    const pctsArr = conDatos.filter(d => d.monto_ingreso > 0).map(d => d.pct_sueldo)
    const promPct = pctsArr.length
      ? (pctsArr.reduce((a, b) => a + b, 0) / pctsArr.length).toFixed(1)
      : null
    return `Promedio ${fmt(prom)}${promPct ? ` (${promPct}% del sueldo)` : ''} en ${conDatos.length} períodos. Período más caro: ${maxP.label}.`
  }, [catData])

  return (
    <div style={SEC}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ ...LABEL, marginBottom: 0 }}>Evolución por categoría</div>
        <select
          value={catSel}
          onChange={e => setCatSel(e.target.value)}
          style={{ width: 'auto', minWidth: 160, fontSize: 11 }}
        >
          {categorias.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {loading || !catData.length ? (
        <Sk h={180} />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={catData} margin={{ top: 22, right: 0, left: -10, bottom: 0 }} barSize={28}>
              <CartesianGrid strokeDasharray="1 4" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-3)', fontFamily: 'var(--mono)' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtY} tick={{ fontSize: 10, fill: 'var(--text-3)', fontFamily: 'var(--mono)' }} axisLine={false} tickLine={false} width={52} />
              <Tooltip content={<CatTooltip />} cursor={{ fill: 'var(--surface-2)' }} />
              {catData[0]?.presupuesto > 0 && (
                <ReferenceLine y={catData[0].presupuesto} stroke="var(--orange)" strokeDasharray="4 4"
                  label={{ value: 'PRESUP', position: 'insideTopRight', fontSize: 9, fill: 'var(--orange)', fontFamily: 'var(--mono)', letterSpacing: '0.1em' }}
                />
              )}
              <Bar dataKey="total" name="Gasto" radius={[2, 2, 0, 0]}>
                <LabelList dataKey="pct_sueldo" content={BarPctLabel} />
                {catData.map((e, i) => (
                  <Cell key={i}
                    fill={e.sobre_presupuesto ? 'var(--red)' : e.presupuesto > 0 ? 'var(--green)' : 'var(--blue)'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {catFrase && (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--mono)', letterSpacing: '0.02em' }}>
              {catFrase}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Section 4: Gasto acumulado ─────────────────────────────────────────────────
function AcumuladoSection({ acumulado }) {
  const lineData = useMemo(() => {
    if (!acumulado?.actual?.length) return []

    const map = new Map()
    const maxDia = Math.max(
      acumulado.dias_total,
      acumulado.actual.length - 1,
      (acumulado.anterior?.length ?? 0) - 1,
    )
    for (let i = 0; i <= maxDia; i++) map.set(i, { dia: i })

    acumulado.actual.forEach(d => {
      const e = map.get(d.dia) || { dia: d.dia }
      e.actual = d.acumulado
      map.set(d.dia, e)
    })
    ;(acumulado.anterior || []).forEach(d => {
      const e = map.get(d.dia) || { dia: d.dia }
      e.anterior = d.acumulado
      map.set(d.dia, e)
    })

    const lastIdx = acumulado.actual.length - 1
    const startVal = acumulado.actual[lastIdx]?.acumulado ?? 0
    const endVal = acumulado.proyeccion_fin
    const startDia = lastIdx
    const endDia = acumulado.dias_total

    if (endDia > startDia && startVal > 0) {
      for (let d = startDia; d <= endDia; d++) {
        const prog = endDia > startDia ? (d - startDia) / (endDia - startDia) : 1
        const e = map.get(d) || { dia: d }
        e.proyeccion = Math.round(startVal + (endVal - startVal) * prog)
        map.set(d, e)
      }
    }

    return Array.from(map.values()).sort((a, b) => a.dia - b.dia)
  }, [acumulado])

  if (!acumulado) {
    return (
      <div style={SEC}>
        <div style={LABEL}>Ritmo de gasto</div>
        <Sk h={200} />
      </div>
    )
  }

  if (!lineData.length) {
    return (
      <div style={SEC}>
        <div style={LABEL}>Ritmo de gasto</div>
        <div style={EMPTY}>Sin datos suficientes.</div>
      </div>
    )
  }

  return (
    <div style={SEC}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <div style={{ ...LABEL, marginBottom: 0 }}>Ritmo de gasto — acumulado diario</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)' }}>
          <span style={{ color: 'var(--blue)' }}>— actual</span>
          {acumulado.anterior?.length > 0 && <span style={{ color: 'var(--text-3)' }}>  - - período anterior</span>}
          {acumulado.proyeccion_fin > 0 && <span style={{ color: 'var(--orange)' }}>  · · · proyección</span>}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={lineData} margin={{ top: 8, right: 0, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="1 4" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="dia" tick={{ fontSize: 10, fill: 'var(--text-3)', fontFamily: 'var(--mono)' }} axisLine={false} tickLine={false}
            label={{ value: 'día', position: 'insideBottomRight', offset: 0, fontSize: 9, fill: 'var(--text-3)', fontFamily: 'var(--mono)' }} />
          <YAxis tickFormatter={fmtY} tick={{ fontSize: 10, fill: 'var(--text-3)', fontFamily: 'var(--mono)' }} axisLine={false} tickLine={false} width={52} />
          <Tooltip content={<DarkTooltip />} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} />
          {acumulado.monto_ingreso > 0 && (
            <ReferenceLine y={acumulado.monto_ingreso} stroke="var(--red)" strokeDasharray="2 6" strokeOpacity={0.5}
              label={{ value: 'INGRESO', position: 'insideTopRight', fontSize: 9, fill: 'var(--red)', fontFamily: 'var(--mono)' }}
            />
          )}
          {acumulado.anterior?.length > 0 && (
            <Line type="monotone" dataKey="anterior" name="Anterior" stroke="var(--text-3)"
              strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls />
          )}
          <Line type="monotone" dataKey="proyeccion" name="Proyección" stroke="var(--orange)"
            strokeWidth={1} strokeDasharray="4 4" dot={false} connectNulls />
          <Line type="monotone" dataKey="actual" name="Actual" stroke="var(--blue)"
            strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
      <div style={{ marginTop: 10, display: 'flex', gap: 24, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>
        <span>Proyección al cierre: <span style={{ color: acumulado.proyeccion_fin > acumulado.monto_ingreso && acumulado.monto_ingreso > 0 ? 'var(--red)' : 'var(--text)' }}>{fmt(acumulado.proyeccion_fin)}</span></span>
        {acumulado.monto_ingreso > 0 && <span>Ingreso del período: {fmt(acumulado.monto_ingreso)}</span>}
      </div>
    </div>
  )
}

// ── Section 5: Radiografía ─────────────────────────────────────────────────────
function RadiografiaRow({ item, dir }) {
  const isUp = dir === 'up'
  const color = isUp ? 'var(--red)' : 'var(--green)'
  const absPP = Math.abs(item.variacion_pp)
  const maxPct = Math.max(item.pct_sueldo, item.pct_sueldo_anterior) || 1
  const curW = (item.pct_sueldo / maxPct * 100).toFixed(1) + '%'
  const prevX = (item.pct_sueldo_anterior / maxPct * 100).toFixed(1) + '%'

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
        <div style={{ fontSize: 12 }}>{item.nombre}</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color }}>
          {isUp ? '↑' : '↓'} {absPP}pp
        </div>
      </div>
      <div style={{ height: 4, background: 'var(--border)', position: 'relative' }}>
        <div style={{ height: '100%', width: curW, background: color, opacity: 0.75 }} />
        <div style={{ position: 'absolute', top: 0, left: prevX, width: 1, height: '100%', background: 'var(--text-3)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-3)' }}>
        <span>ant: {item.pct_sueldo_anterior}%</span>
        <span>act: {item.pct_sueldo}%</span>
      </div>
    </div>
  )
}

function RadiografiaSection({ ranking }) {
  const subieron = useMemo(() =>
    (ranking?.categorias || [])
      .filter(c => c.variacion_pp > 0)
      .sort((a, b) => b.variacion_pp - a.variacion_pp)
      .slice(0, 3),
    [ranking])

  const bajaron = useMemo(() =>
    (ranking?.categorias || [])
      .filter(c => c.variacion_pp < 0)
      .sort((a, b) => a.variacion_pp - b.variacion_pp)
      .slice(0, 3),
    [ranking])

  if (!ranking) {
    return (
      <div style={SEC}>
        <div style={LABEL}>Movimiento vs período anterior</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
          <div>{[...Array(3)].map((_, i) => <Sk key={i} h={58} mb={2} delay={i * 0.08} />)}</div>
          <div>{[...Array(3)].map((_, i) => <Sk key={i} h={58} mb={2} delay={i * 0.08} />)}</div>
        </div>
      </div>
    )
  }

  if (subieron.length === 0 && bajaron.length === 0) {
    return (
      <div style={SEC}>
        <div style={LABEL}>Movimiento vs período anterior</div>
        <div style={EMPTY}>Sin variaciones detectadas.</div>
      </div>
    )
  }

  return (
    <div style={SEC}>
      <div style={LABEL}>Movimiento vs período anterior</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--red)', textTransform: 'uppercase', marginBottom: 10 }}>
            Las que más subieron
          </div>
          {subieron.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Ninguna</div>
            : subieron.map(c => <RadiografiaRow key={c.nombre} item={c} dir="up" />)
          }
        </div>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--green)', textTransform: 'uppercase', marginBottom: 10 }}>
            Las que más bajaron
          </div>
          {bajaron.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Ninguna</div>
            : bajaron.map(c => <RadiografiaRow key={c.nombre} item={c} dir="down" />)
          }
        </div>
      </div>
    </div>
  )
}

// ── Section 6: Gastos Hormiga ─────────────────────────────────────────────────
function HormigaSection({ hormigas, montoIngreso }) {
  if (!hormigas) {
    return (
      <div style={SEC}>
        <div style={LABEL}>Gastos hormiga — período actual</div>
        <Sk h={160} />
      </div>
    )
  }

  return (
    <div style={SEC}>
      <div style={LABEL}>Gastos hormiga — período actual</div>
      {hormigas.length === 0
        ? <div style={EMPTY}>Sin gastos repetidos este período.</div>
        : (
          <SortableTable
            defaultSort="veces"
            data={hormigas}
            highlight={r => r.pct_sueldo > 3}
            cols={[
              { key: 'nombre', label: 'Comercio' },
              { key: 'veces', label: 'Veces', right: true, mono: true, render: r => `${r.veces}×` },
              { key: 'total', label: 'Total', amount: true, render: r => fmt(r.total) },
              { key: 'promedio', label: 'Promedio/vez', amount: true, render: r => <span style={{ color: 'var(--text-2)' }}>{fmt(r.promedio)}</span> },
              {
                key: 'pct_sueldo', label: '% sueldo', right: true, mono: true,
                render: r => r.pct_sueldo > 0
                  ? <span style={{ color: r.pct_sueldo > 3 ? 'var(--orange)' : 'var(--text-3)' }}>{r.pct_sueldo}%</span>
                  : <span style={{ color: 'var(--text-3)' }}>—</span>,
              },
            ]}
          />
        )}
    </div>
  )
}

// ── Section 7: Recurrentes ────────────────────────────────────────────────────
function RecurrenteSection({ recurrentes }) {
  if (!recurrentes) {
    return (
      <div style={SEC}>
        <div style={LABEL}>Recurrentes detectados</div>
        <Sk h={140} />
      </div>
    )
  }

  const hoy = new Date().toISOString().split('T')[0]
  const totalMensual = recurrentes
    .filter(r => r.frecuencia === 'MENSUAL')
    .reduce((s, r) => s + r.monto_tipico, 0)

  return (
    <div style={SEC}>
      <div style={LABEL}>Recurrentes detectados</div>
      {recurrentes.length === 0
        ? <div style={EMPTY}>Sin recurrentes detectados.</div>
        : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Frecuencia</th>
                  <th style={{ textAlign: 'right' }}>Monto típico</th>
                  <th style={{ textAlign: 'right' }}>Total histórico</th>
                  <th>Próxima est.</th>
                </tr>
              </thead>
              <tbody>
                {recurrentes.map((r, i) => {
                  const vencido = r.proxima_estimada < hoy
                  return (
                    <tr key={i}>
                      <td style={{ fontSize: 12 }}>{r.nombre}</td>
                      <td>
                        <span style={{
                          fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.1em',
                          fontWeight: 600, padding: '2px 7px', borderRadius: 2,
                          textTransform: 'uppercase',
                          background: (FREQ_COLOR[r.frecuencia] || 'var(--text-3)') + '18',
                          color: FREQ_COLOR[r.frecuencia] || 'var(--text-3)',
                        }}>
                          {r.frecuencia}
                        </span>
                      </td>
                      <td className="amount">{fmt(r.monto_tipico)}</td>
                      <td className="amount" style={{ color: 'var(--text-2)' }}>{fmt(r.total_gastado)}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
                        {vencido
                          ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>VENCIDO</span>
                          : <span style={{ color: 'var(--text-3)' }}>{r.proxima_estimada}</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {totalMensual > 0 && (
              <div style={{ marginTop: 14, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-3)' }}>
                Compromisos mensuales estimados: <span style={{ color: 'var(--text)' }}>{fmt(totalMensual)}/período</span>
              </div>
            )}
          </>
        )}
    </div>
  )
}

// ── Section 8: Heatmap ────────────────────────────────────────────────────────
function HeatmapSection({ heatmap }) {
  if (!heatmap) {
    return (
      <div style={SEC}>
        <div style={LABEL}>Historial por categoría</div>
        <Sk h={220} />
      </div>
    )
  }

  if (!heatmap.datos?.length) return null

  const { periodos, datos, actual_label } = heatmap

  return (
    <div style={SEC}>
      <div style={LABEL}>Historial por categoría — últimos {periodos.length} períodos</div>
      <div className="table-wrap">
        <table style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', paddingRight: 16 }}>Categoría</th>
              {periodos.map(p => (
                <th key={p} style={{
                  textAlign: 'right', padding: '0 4px 8px',
                  fontFamily: 'var(--mono)', fontSize: 10,
                  color: p === actual_label ? 'var(--blue)' : 'var(--text-3)',
                }}>
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {datos.map((row, i) => (
              <tr key={i}>
                <td style={{ fontSize: 12, fontWeight: 500, paddingRight: 16, whiteSpace: 'nowrap' }}>
                  {row.categoria}
                </td>
                {periodos.map(p => {
                  const cell = row[p]
                  const total = cell?.total || 0
                  const { bg, fg } = heatCell(total, row._max)
                  const isActual = p === actual_label

                  return (
                    <td key={p} style={{ padding: '2px 3px' }}>
                      <div style={{
                        background: bg, color: fg,
                        borderRadius: 2, padding: '5px 10px',
                        textAlign: 'right',
                        fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 500,
                        minWidth: 90,
                        outline: isActual ? '1px solid var(--border-bright)' : 'none',
                      }}>
                        {total ? fmt(total) : ''}
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
  )
}

// ── Consumo por mes ────────────────────────────────────────────────────────────
const MESES_SHORT = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']

function mesLabel(yyyymm) {
  if (!yyyymm) return ''
  const [y, m] = yyyymm.split('-')
  return `${MESES_SHORT[parseInt(m) - 1]} ${y.slice(2)}`
}

function ConsumoSection({ consumo }) {
  const [mesSel, setMesSel] = useState(null)

  useEffect(() => {
    if (consumo?.length) setMesSel(consumo[consumo.length - 1].mes)
  }, [consumo])

  if (!consumo) return (
    <div style={SEC}>
      <div style={LABEL}>Gasto real — por mes de consumo</div>
      <Sk h={220} />
    </div>
  )
  if (!consumo.length) return null

  const maxTotal = Math.max(...consumo.map(d => d.total), 1)
  const selData  = consumo.find(d => d.mes === mesSel)

  return (
    <div style={SEC}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 18 }}>
        <div style={LABEL}>Gasto real — por mes de consumo</div>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
          usa fecha de compra, no fecha de pago del resumen
        </span>
      </div>

      {/* Bar chart */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 140, marginBottom: 8 }}>
        {consumo.map(d => {
          const pct   = d.total / maxTotal
          const active = d.mes === mesSel
          return (
            <div
              key={d.mes}
              onClick={() => setMesSel(d.mes)}
              style={{ flex: 1, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}
              title={`${mesLabel(d.mes)}: ${fmt(d.total)}`}
            >
              <div style={{
                width: '100%',
                height: `${Math.max(pct * 100, d.total > 0 ? 2 : 0)}%`,
                background: d.es_actual
                  ? 'var(--blue)'
                  : active
                    ? 'var(--ink2)'
                    : 'var(--border-bright)',
                borderRadius: '2px 2px 0 0',
                transition: 'background 0.15s',
                outline: active ? '1px solid var(--ink)' : 'none',
              }} />
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '0.06em',
                color: active ? 'var(--text)' : 'var(--text-3)',
                textAlign: 'center', whiteSpace: 'nowrap',
              }}>
                {mesLabel(d.mes)}
              </span>
            </div>
          )
        })}
      </div>

      {/* Detail for selected month */}
      {selData && (
        <div style={{ display: 'flex', gap: 24, marginTop: 8 }}>
          {/* Total */}
          <div style={{ minWidth: 160 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
              {mesLabel(selData.mes)} {selData.es_actual ? '· actual' : ''}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
              {fmt(selData.total)}
            </div>
          </div>

          {/* Category breakdown */}
          <div style={{ flex: 1 }}>
            {Object.entries(selData.por_categoria).slice(0, 10).map(([cat, monto]) => {
              const pct = selData.total > 0 ? monto / selData.total : 0
              return (
                <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{
                    fontSize: 11, color: 'var(--text-2)', minWidth: 140,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{cat}</span>
                  <div style={{ flex: 1, height: 4, background: 'var(--surface-2)', borderRadius: 2 }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      width: `${pct * 100}%`,
                      background: catColor(cat),
                    }} />
                  </div>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)', minWidth: 80, textAlign: 'right' }}>
                    {fmt(monto)}
                  </span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-3)', minWidth: 34, textAlign: 'right' }}>
                    {Math.round(pct * 100)}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Period Selector ────────────────────────────────────────────────────────────
const MESES = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']

function periodoLabel(p) {
  if (!p.fecha_fin) return 'ACTUAL'
  if (!p.fecha_inicio) return 'HIST'
  const parts = p.fecha_inicio.split('-')
  if (parts.length < 3 || !parts[1]) return 'HIST'
  const [, m, d] = parts
  return `${d} ${MESES[parseInt(m) - 1]}`
}

function PeriodoSelector({ periodos, sel, onChange }) {
  if (!periodos.length) return null

  const options = [
    { key: null,  label: 'ACTUAL' },
    ...periodos
      .filter(p => p.fecha_fin)
      .map(p => ({ key: p.id, label: periodoLabel(p) })),
    { key: 0, label: 'TODOS' },
  ]

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0,
      borderBottom: '1px solid var(--border)',
      marginBottom: 0, overflowX: 'auto',
    }}>
      {options.map(({ key, label }) => {
        const active = sel === key
        return (
          <button
            key={String(key)}
            onClick={() => onChange(key)}
            style={{
              fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em',
              padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
              color: active ? 'var(--ink)' : 'var(--dim)',
              borderBottom: active ? '2px solid var(--ink)' : '2px solid transparent',
              marginBottom: -1, transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function Analisis() {
  const [periodos, setPeriodos] = useState([])
  const [periodoSel, setPeriodoSel] = useState(null) // null=actual, 0=todos, n=id
  const [resumen, setResumen] = useState(null)
  const [ranking, setRanking] = useState(null)
  const [acumulado, setAcumulado] = useState(null)
  const [categorias, setCategorias] = useState([])
  const [catSel, setCatSel] = useState('')
  const [catData, setCatData] = useState([])
  const [catLoading, setCatLoading] = useState(false)
  const [hormigas, setHormigas] = useState(null)
  const [recurrentes, setRecurrentes] = useState(null)
  const [heatmap, setHeatmap] = useState(null)
  const [consumo, setConsumo] = useState(null)
  const [loading, setLoading] = useState(true)

  // Static data — load once
  useEffect(() => {
    Promise.all([
      api.getPeriodos(),
      api.getCategorias(),
      api.getRecurrentes(),
      api.getHeatmap(),
      api.getConsumo(14),
    ]).then(([pList, cats, r, hm, cons]) => {
      setPeriodos(pList)
      const lista = cats.categorias.filter(
        c => !['A Clasificar', 'Ahorro/Inversión', 'Inversiones'].includes(c)
      )
      setCategorias(lista)
      if (lista.length > 0) setCatSel(lista[0])
      setRecurrentes(r)
      setHeatmap(hm)
      setConsumo(cons)
    })
  }, [])

  // Period-specific data — reload on selector change
  useEffect(() => {
    setLoading(true)
    setRanking(null)
    setAcumulado(null)
    setHormigas(null)
    if (periodoSel === null) setResumen(null)

    const fetches = [
      periodoSel === null ? api.getResumenAnalisis() : Promise.resolve(null),
      api.getRankingAnalisis(periodoSel),
      api.getAcumuladoAnalisis(periodoSel),
      api.getHormigas(periodoSel),
    ]

    Promise.all(fetches).then(([res, rank, acum, h]) => {
      if (periodoSel === null) setResumen(res)
      setRanking(rank)
      setAcumulado(acum)
      setHormigas(h)
    }).finally(() => setLoading(false))
  }, [periodoSel])

  useEffect(() => {
    if (!catSel) return
    setCatLoading(true)
    api.getCategoriaTendencia(catSel)
      .then(setCatData)
      .finally(() => setCatLoading(false))
  }, [catSel])

  const montoIngreso = ranking?.monto_ingreso ?? 0
  const isTodos = periodoSel === 0

  if (loading && !ranking) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <style>{`@keyframes skPulse { 0%,100%{opacity:1} 50%{opacity:.3} }`}</style>
        <div className="page-header"><h1>Análisis</h1></div>
        <Sk h={32} mb={24} />
        {[80, 240, 220, 220, 130, 180, 140, 220].map((h, i) => (
          <div key={i} style={{ padding: '24px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
            <Sk h={10} w={100} mb={16} delay={i * 0.08} />
            <Sk h={h} delay={i * 0.12} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <style>{`@keyframes skPulse { 0%,100%{opacity:1} 50%{opacity:.3} }`}</style>
      <div className="page-header"><h1>Análisis</h1></div>

      <PeriodoSelector periodos={periodos} sel={periodoSel} onChange={setPeriodoSel} />

      {periodoSel === null && <HeadlineMetric resumen={resumen} />}
      {isTodos && (
        <div style={{
          padding: '20px 0 4px',
          fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--dim)',
          letterSpacing: '0.06em',
        }}>
          Total histórico acumulado · {ranking?.n_periodos ?? '?'} períodos · promedio mensual debajo de cada monto
        </div>
      )}
      <RankingSection ranking={ranking} allCategorias={categorias} />
      <CatEvolution
        categorias={categorias}
        catData={catData}
        catSel={catSel}
        setCatSel={setCatSel}
        loading={catLoading}
      />
      {!isTodos && <AcumuladoSection acumulado={acumulado} />}
      {periodoSel === null && <RadiografiaSection ranking={ranking} />}
      <HormigaSection hormigas={hormigas} montoIngreso={montoIngreso} />
      {!isTodos && <RecurrenteSection recurrentes={recurrentes} />}
      <ConsumoSection consumo={consumo} />
      <HeatmapSection heatmap={heatmap} />
    </div>
  )
}
