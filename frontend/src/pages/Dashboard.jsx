import { useEffect, useState, useMemo } from 'react'
import { api, fmt, fmtFecha } from '../api'

function fmtA(n) {
  if (n == null) return '$0'
  if (Math.abs(n) >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1).replace('.', ',') + 'M'
  if (Math.abs(n) >= 1_000) return '$' + Math.round(n / 1_000) + 'k'
  return '$' + Math.round(n).toLocaleString('es-AR')
}

function LSection({ title, right, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em',
          color: 'var(--dim)', textTransform: 'uppercase', whiteSpace: 'nowrap',
        }}>§ {title}</span>
        <span style={{ flex: 1, borderTop: '1px dotted var(--rule)', marginBottom: 4 }} />
        {right && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--dim)', whiteSpace: 'nowrap' }}>
            {right}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function KPI({ label, value, sub, valueColor }) {
  return (
    <div>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em',
        color: 'var(--dim)', textTransform: 'uppercase', marginBottom: 8,
      }}>{label}</div>
      <div style={{
        fontFamily: 'var(--serif)', fontSize: 42, fontWeight: 400,
        letterSpacing: '-0.025em', lineHeight: 0.95, marginBottom: 10,
        color: valueColor || 'var(--ink)',
      }}>{value}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--dim)' }}>{sub}</div>
    </div>
  )
}

function DailyCurve({ acumulado, burnRate, periodo }) {
  if (!acumulado?.actual?.length) {
    return (
      <div style={{
        height: 110, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 10, color: 'var(--dim)',
      }}>
        Sin datos
      </div>
    )
  }

  const daily = acumulado.actual.map((d, i) => ({
    fecha: d.fecha,
    v: i === 0 ? d.acumulado : d.acumulado - acumulado.actual[i - 1].acumulado,
  }))

  const maxV = Math.max(...daily.map(d => d.v), 1)
  const n    = Math.max(daily.length - 1, 1)

  const svgPts = daily
    .map((d, i) => `${(i / n) * 100},${100 - (d.v / maxV) * 95}`)
    .join(' ')

  const avgY       = burnRate > 0 && burnRate <= maxV ? 100 - (burnRate / maxV) * 95 : null
  const startLabel = daily[0]?.fecha ? `${daily[0].fecha.slice(8)}/${daily[0].fecha.slice(5,7)}` : ''
  const endLabel   = periodo?.fecha_fin ? fmtFecha(periodo.fecha_fin) : ''

  return (
    <>
      <div style={{
        position: 'relative', height: 110, marginBottom: 6,
        borderBottom: '1px solid var(--rule)',
        borderLeft: '1px solid var(--rule)',
      }}>
        {[0.25, 0.5, 0.75].map(p => (
          <div key={p} style={{
            position: 'absolute', left: 0, right: 0,
            top: `${(1 - p) * 100}%`,
            borderTop: '1px dotted var(--rule)',
          }} />
        ))}

        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          {daily.length > 1 && (
            <polyline
              points={svgPts}
              fill="none"
              stroke="var(--ink)"
              strokeWidth="0.6"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {daily.map((d, i) => (
            <circle
              key={i}
              cx={(i / n) * 100}
              cy={100 - (d.v / maxV) * 95}
              r="1.2"
              fill={i === daily.length - 1 ? 'var(--bad)' : 'var(--ink)'}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {avgY != null && (
          <div style={{
            position: 'absolute', left: 0, right: 0,
            top: `${avgY}%`,
            borderTop: '1px dashed var(--accent)',
          }}>
            <span style={{
              position: 'absolute', right: 0, top: -16,
              fontSize: 9, color: 'var(--accent)', fontFamily: 'var(--mono)',
            }}>
              media · {fmtA(burnRate)}
            </span>
          </div>
        )}
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--dim)',
      }}>
        <span>{startLabel}</span>
        <span>hoy</span>
        <span>{endLabel}</span>
      </div>
    </>
  )
}

export default function Dashboard() {
  const [periodo,   setPeriodo]   = useState(null)
  const [hormigas,  setHormigas]  = useState([])
  const [ranking,   setRanking]   = useState(null)
  const [acumulado, setAcumulado] = useState(null)
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    Promise.all([
      api.getPeriodoActual(),
      api.getHormigas(),
      api.getRankingAnalisis(),
      api.getAcumuladoAnalisis(),
    ])
      .then(([p, h, r, a]) => {
        setPeriodo(p)
        setHormigas(Array.isArray(h) ? h : [])
        setRanking(r)
        setAcumulado(a)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // All hooks must be called before any conditional returns
  const rankingMap = useMemo(() => {
    if (!ranking?.categorias) return {}
    return Object.fromEntries(ranking.categorias.map(c => [c.nombre, c]))
  }, [ranking])

  const rankingSet = useMemo(
    () => new Set(ranking?.categorias?.map(c => c.nombre) || []),
    [ranking]
  )

  if (loading) return <div className="loading">CARGANDO</div>

  if (!periodo) return (
    <div style={{ padding: '60px 0', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--dim)', letterSpacing: '0.15em', marginBottom: 12 }}>
        SIN PERÍODOS CONFIGURADOS
      </div>
      <div style={{ fontSize: 12, color: 'var(--dim)' }}>
        Importá tu extracto de MercadoPago para comenzar.
      </div>
    </div>
  )

  const {
    total_gastos, objetivo_ahorro,
    dias_total, dias_transcurridos, por_categoria, presupuestos,
    total_anterior, monto_ingreso,
  } = periodo

  const ingreso    = monto_ingreso || 0
  const diasTrans  = Math.max(dias_transcurridos || 1, 1)
  const diasTotal  = dias_total || 30
  const diasRest   = Math.max(diasTotal - diasTrans, 0)
  const diasPct    = Math.round(diasTrans / diasTotal * 100)

  const burnRate     = total_gastos / diasTrans
  const burnRateLast = (total_anterior || 0) / 30
  const burnDelta    = burnRateLast > 0
    ? Math.round((burnRate - burnRateLast) / burnRateLast * 100)
    : null

  const proyeccion = burnRate * diasTotal
  const disponible = ingreso - total_gastos
  const ahorroProj = ingreso - proyeccion
  const pctIngreso = ingreso > 0 ? (total_gastos / ingreso * 100).toFixed(1) : null
  const maxDiario  = diasRest > 0 ? disponible / diasRest : 0

  const totalPresupuesto = Object.values(presupuestos || {}).reduce((a, b) => a + b, 0)
  const projVsBudget     = proyeccion - totalPresupuesto
  const projOver         = totalPresupuesto > 0 && projVsBudget > 0
  const projColor        = projOver ? 'var(--bad)' : 'var(--accent)'

  const catOrdenadas = Object.entries(por_categoria || {}).sort((a, b) => b[1] - a[1])
  const catNormales  = rankingSet.size > 0
    ? catOrdenadas.filter(([c]) => rankingSet.has(c))
    : catOrdenadas
  const catExcluidas = rankingSet.size > 0
    ? catOrdenadas.filter(([c]) => !rankingSet.has(c))
    : []

  const hormigaTop   = hormigas.slice(0, 6)
  const hormigaTotal = hormigaTop.reduce((a, h) => a + h.total, 0)
  const hormigaOps   = hormigaTop.reduce((a, h) => a + h.veces, 0)
  const hormigaPct   = ingreso > 0 ? Math.round(hormigaTotal / ingreso * 100) : null

  return (
    <div>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 20 }}>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 11,
          letterSpacing: '0.18em', color: 'var(--dim)', textTransform: 'uppercase',
        }}>I</span>
        <span style={{
          fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 400,
          letterSpacing: '-0.01em', color: 'var(--ink)',
        }}>Resumen del período</span>
        <span style={{ flex: 1, borderTop: '1px solid var(--rule)', marginBottom: 6 }} />
      </div>

      {/* Hero KPI row — 4 cells */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        borderTop: '1px solid var(--ink)',
        borderBottom: '1px solid var(--ink)',
        marginBottom: 32,
      }}>
        <div style={{ padding: '24px 20px 22px', borderRight: '1px solid var(--rule)' }}>
          <KPI
            label="Gastado"
            value={fmt(total_gastos)}
            sub={pctIngreso ? `${pctIngreso}% del ingreso` : 'sin ingreso configurado'}
          />
        </div>
        <div style={{ padding: '24px 20px 22px', borderRight: '1px solid var(--rule)' }}>
          <KPI
            label="Disponible"
            value={fmt(disponible)}
            sub="tras objetivo de ahorro"
            valueColor={disponible >= 0 ? 'var(--accent)' : 'var(--bad)'}
          />
        </div>
        <div style={{ padding: '24px 20px 22px', borderRight: '1px solid var(--rule)' }}>
          <KPI
            label="Ritmo diario"
            value={fmtA(burnRate)}
            sub={burnDelta != null ? (
              <span>
                vs{' '}
                <span style={{ color: burnDelta > 0 ? 'var(--bad)' : 'var(--accent)' }}>
                  {fmtA(burnRateLast)}
                </span>
                {' '}per. anterior{' '}
                <span style={{ color: burnDelta > 0 ? 'var(--bad)' : 'var(--accent)' }}>
                  ({burnDelta > 0 ? '+' : ''}{burnDelta}%)
                </span>
              </span>
            ) : 'primer período'}
          />
        </div>
        <div style={{ padding: '24px 20px 22px' }}>
          <KPI
            label="Días restantes"
            value={diasRest}
            sub={`de ${diasTotal} · ${diasPct}% transcurrido`}
          />
        </div>
      </div>

      {/* Projection banner */}
      <div style={{
        marginBottom: 32, padding: '18px 22px',
        background: 'var(--paper)',
        border: `1px solid ${projColor}`,
        display: 'grid', gridTemplateColumns: '1fr auto',
        gap: 24, alignItems: 'center',
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em',
            color: projColor, textTransform: 'uppercase', marginBottom: 6,
          }}>
            Proyección a fin de período
          </div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 28, lineHeight: 1.2, color: 'var(--ink)' }}>
            Al ritmo actual cerrás en{' '}
            <b style={{ fontWeight: 600 }}>{fmt(proyeccion)}</b>
            {totalPresupuesto > 0 ? (
              projOver
                ? <>, <span style={{ color: 'var(--bad)' }}>+{fmtA(projVsBudget)}</span> sobre presupuesto.</>
                : <>, <span style={{ color: 'var(--accent)' }}>{fmtA(-projVsBudget)}</span> bajo presupuesto.</>
            ) : '.'}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--dim)', marginTop: 8 }}>
            Para cumplir objetivo, gastá máximo{' '}
            <span style={{ color: 'var(--warn)' }}>
              {maxDiario > 0 ? fmtA(maxDiario) : '$0'}/día
            </span>
            {' '}el resto del período.
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontFamily: 'var(--serif)', fontSize: 32, fontWeight: 500,
            color: ahorroProj >= (objetivo_ahorro || 0) ? 'var(--accent)' : 'var(--bad)',
            letterSpacing: '-0.02em', lineHeight: 1,
          }}>
            {fmtA(ahorroProj)}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--dim)', marginTop: 4 }}>
            ahorro proyectado · objetivo {fmtA(objetivo_ahorro)}
          </div>
        </div>
      </div>

      {/* Two-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 40 }}>

        {/* LEFT — Category table */}
        <div>
          <LSection
            title="Por categoría"
            right={totalPresupuesto > 0
              ? `${fmtA(total_gastos)} de ${fmtA(totalPresupuesto)}`
              : fmtA(total_gastos)}
          >
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 100px 1fr 100px 60px',
              gap: 14, padding: '6px 0',
              fontFamily: 'var(--mono)', fontSize: 10,
              color: 'var(--dim)', letterSpacing: '0.1em', textTransform: 'uppercase',
              borderBottom: '1px solid var(--ink)',
            }}>
              <span>Categoría</span>
              <span style={{ textAlign: 'right' }}>Gasto</span>
              <span>Avance</span>
              <span style={{ textAlign: 'right' }}>Presupuesto</span>
              <span style={{ textAlign: 'right' }}>Δ ant.</span>
            </div>

            {catNormales.map(([cat, gastado]) => {
              const budget = presupuestos?.[cat] || 0
              const r      = budget > 0 ? gastado / budget : 0
              const over   = r > 1
              const rk     = rankingMap[cat]
              const delta  = rk?.variacion_pp

              return (
                <div key={cat} style={{
                  display: 'grid', gridTemplateColumns: '1fr 100px 1fr 100px 60px',
                  gap: 14, padding: '8px 0',
                  fontFamily: 'var(--mono)', fontSize: 12.5, alignItems: 'center',
                  borderBottom: '1px solid var(--rule-soft)',
                }}>
                  <span style={{ color: 'var(--ink)' }}>{cat}</span>
                  <span style={{
                    textAlign: 'right',
                    color: over ? 'var(--bad)' : 'var(--ink)',
                    fontWeight: over ? 600 : 400,
                  }}>
                    {fmt(gastado)}
                  </span>
                  <div style={{ position: 'relative', height: 8 }}>
                    <div style={{
                      position: 'absolute', left: 0, right: 0,
                      top: 4, height: 1, background: 'var(--rule-soft)',
                    }} />
                    {budget > 0 && (
                      <>
                        <div style={{
                          position: 'absolute', left: 0, top: 0, bottom: 0,
                          width: `${Math.min(100, r * 100)}%`,
                          background: over ? 'var(--bad)' : r > 0.85 ? 'var(--warn)' : 'var(--accent)',
                          height: 8,
                        }} />
                        {over && (
                          <div style={{
                            position: 'absolute',
                            left: `${100 / r}%`,
                            top: -2, bottom: -2,
                            width: 1, background: 'var(--ink)',
                          }} />
                        )}
                      </>
                    )}
                  </div>
                  <span style={{ color: 'var(--dim)', textAlign: 'right' }}>
                    {budget > 0 ? fmt(budget) : '—'}
                  </span>
                  <span style={{
                    textAlign: 'right', fontSize: 11,
                    color: delta == null
                      ? 'var(--dimmer)'
                      : delta > 1 ? 'var(--bad)'
                      : delta < -1 ? 'var(--accent)'
                      : 'var(--dim)',
                  }}>
                    {delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(0)} pp`}
                  </span>
                </div>
              )
            })}

            {catExcluidas.length > 0 && catExcluidas.map(([cat, gastado]) => (
              <div key={cat} style={{
                display: 'grid', gridTemplateColumns: '1fr 100px 1fr 100px 60px',
                gap: 14, padding: '8px 0',
                fontFamily: 'var(--mono)', fontSize: 12, alignItems: 'center',
                borderBottom: '1px solid var(--rule-soft)',
                opacity: 0.45,
              }}>
                <span style={{ color: 'var(--dim)' }}>{cat}</span>
                <span style={{ textAlign: 'right', color: 'var(--dim)' }}>{fmt(gastado)}</span>
                <div />
                <span style={{ textAlign: 'right', color: 'var(--dimmer)', fontSize: 10 }}>excluido</span>
                <span />
              </div>
            ))}

            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 100px 1fr 100px 60px',
              gap: 14, padding: '10px 0 4px',
              fontFamily: 'var(--mono)', fontSize: 12.5, alignItems: 'center',
              borderTop: '1px solid var(--ink)', fontWeight: 600,
            }}>
              <span>Total</span>
              <span style={{ textAlign: 'right' }}>{fmt(total_gastos)}</span>
              <span style={{ color: 'var(--dim)', fontSize: 11, fontWeight: 400 }}>
                {totalPresupuesto > 0
                  ? `${(total_gastos / totalPresupuesto * 100).toFixed(0)}% del total`
                  : ''}
              </span>
              <span style={{ textAlign: 'right' }}>
                {totalPresupuesto > 0 ? fmt(totalPresupuesto) : '—'}
              </span>
              <span />
            </div>
          </LSection>
        </div>

        {/* RIGHT — Daily curve + Hormiga */}
        <div>
          <LSection title="Curva diaria" right={`${diasTrans} días`}>
            <DailyCurve acumulado={acumulado} burnRate={burnRate} periodo={periodo} />
          </LSection>

          <LSection
            title="Gastos hormiga"
            right={hormigaOps > 0
              ? `${hormigaOps} ops${hormigaPct != null ? ` · ${hormigaPct}% del ingreso` : ''}`
              : undefined}
          >
            {hormigaTop.length === 0 ? (
              <div style={{ color: 'var(--dim)', fontSize: 11, fontFamily: 'var(--mono)' }}>
                Sin gastos hormiga detectados
              </div>
            ) : (
              <div>
                {hormigaTop.map((h, i) => (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '1fr 50px 90px',
                    gap: 10, padding: '6px 0',
                    fontFamily: 'var(--mono)', fontSize: 12,
                    borderBottom: i === hormigaTop.length - 1 ? 'none' : '1px solid var(--rule-soft)',
                  }}>
                    <span style={{
                      color: 'var(--ink)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {h.nombre}
                    </span>
                    <span style={{ color: 'var(--dim)', textAlign: 'right' }}>×{h.veces}</span>
                    <span style={{ textAlign: 'right', color: 'var(--warn)' }}>{fmt(h.total)}</span>
                  </div>
                ))}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 50px 90px',
                  gap: 10, padding: '8px 0 0',
                  fontFamily: 'var(--mono)', fontSize: 12.5,
                  borderTop: '1px solid var(--ink)',
                  fontWeight: 600, marginTop: 4,
                }}>
                  <span>Acumulado</span>
                  <span style={{ textAlign: 'right' }}>{hormigaOps}</span>
                  <span style={{ textAlign: 'right' }}>{fmt(hormigaTotal)}</span>
                </div>
              </div>
            )}
          </LSection>
        </div>
      </div>
    </div>
  )
}
