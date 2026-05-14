import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Dashboard from './pages/Dashboard'
import Analisis from './pages/Analisis'
import Movimientos from './pages/Movimientos'
import Configuracion from './pages/Configuracion'
import { api, fmtFecha } from './api'
import { VistaProvider, useVista } from './VistaContext'

function VistaToggle() {
  const { vista, setVista } = useVista()

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <span style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', marginRight: 6 }}>
        Vista
      </span>
      {['liquidez', 'consumo'].map(v => (
        <button
          key={v}
          onClick={() => setVista(v)}
          style={{
            padding: '3px 10px',
            fontSize: 10,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontFamily: 'var(--mono)',
            background: vista === v ? 'var(--ink)' : 'transparent',
            color: vista === v ? 'var(--paper)' : 'var(--text-3)',
            border: '1px solid',
            borderColor: vista === v ? 'var(--ink)' : 'var(--border)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          {v === 'liquidez' ? 'Liquidez' : 'Consumo'}
        </button>
      ))}
    </div>
  )
}

function Letterhead({ periodo }) {
  const today = new Date()
  const todayFmt = today.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })

  const periodoLabel = periodo?.fecha_inicio
    ? new Date(periodo.fecha_inicio + 'T12:00:00').toLocaleDateString('es-AR', { month: 'short', year: 'numeric' })
    : null

  return (
    <div className="letterhead">
      <div className="letterhead-inner">
        <div>
          <div className="letterhead-brand-name">Gastos</div>
          <div className="letterhead-brand-sub">Libro de cuentas personales</div>
        </div>
        <div style={{ flex: 1 }} />
        {periodo && (
          <div className="letterhead-meta">
            {periodoLabel && (
              <span>Período <span style={{ color: 'var(--ink)' }}>{periodoLabel}</span></span>
            )}
            <span>
              Día <span style={{ color: 'var(--ink)' }}>{periodo.dias_transcurridos}</span> de {periodo.dias_total || 30}
            </span>
            <span>{todayFmt}</span>
          </div>
        )}
        <VistaToggle />
      </div>
    </div>
  )
}

function TabNav() {
  const tabs = [
    { to: '/',              num: 'I',   label: 'Resumen' },
    { to: '/analisis',      num: 'II',  label: 'Análisis' },
    { to: '/movimientos',   num: 'III', label: 'Movimientos' },
    { to: '/configuracion', num: 'IV',  label: 'Configuración' },
  ]

  return (
    <nav className="tabnav">
      <div className="tabnav-inner">
        {tabs.map(({ to, num, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `tabnav-link${isActive ? ' active' : ''}`}
          >
            <span className="tabnav-num">{num}.</span>
            {label}
          </NavLink>
        ))}
        <div className="tabnav-shortcuts">← →  navegación</div>
      </div>
    </nav>
  )
}

export default function App() {
  const [periodo, setPeriodo] = useState(null)

  useEffect(() => {
    api.getPeriodoActual().then(setPeriodo).catch(() => {})
  }, [])

  return (
    <VistaProvider>
      <BrowserRouter>
        <div className="layout">
          <Letterhead periodo={periodo} />
          <TabNav />
          <main className="main-content">
            <Routes>
              <Route path="/"              element={<Dashboard />} />
              <Route path="/analisis"      element={<Analisis />} />
              <Route path="/movimientos"   element={<Movimientos />} />
              <Route path="/configuracion" element={<Configuracion />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </VistaProvider>
  )
}
