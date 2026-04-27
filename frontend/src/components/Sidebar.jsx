import { NavLink } from 'react-router-dom'
import { LayoutDashboard, TrendingUp, List, Settings } from 'lucide-react'

const links = [
  { to: '/',              label: 'Dashboard',    icon: LayoutDashboard },
  { to: '/analisis',      label: 'Análisis',     icon: TrendingUp },
  { to: '/movimientos',   label: 'Movimientos',  icon: List },
  { to: '/configuracion', label: 'Configuración',icon: Settings },
]

export default function Sidebar() {
  return (
    <aside style={{
      position: 'fixed', top: 0, left: 0, bottom: 0,
      width: 'var(--sidebar-w)',
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      padding: '0',
      zIndex: 100,
    }}>
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>💰 Gastos</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>Control personal</div>
      </div>
      <nav style={{ padding: '12px 8px', flex: 1 }}>
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 12px',
              borderRadius: 7,
              marginBottom: 2,
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 500,
              color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
              background: isActive ? '#EBF4FF' : 'transparent',
              transition: 'all .15s',
            })}
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
