import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Analisis from './pages/Analisis'
import Movimientos from './pages/Movimientos'
import Configuracion from './pages/Configuracion'

export default function App() {
  return (
    <BrowserRouter>
      <div className="layout">
        <Sidebar />
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
  )
}
