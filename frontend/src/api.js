const BASE = '/api'

async function req(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || res.statusText)
  }
  return res.json()
}

export const api = {
  // Períodos
  getPeriodoActual: () => req('/periodos/actual'),
  getPeriodos: () => req('/periodos'),
  crearPeriodo: (data) => req('/periodos', { method: 'POST', body: JSON.stringify(data) }),
  updatePeriodo: (id, data) => req(`/periodos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePeriodo: (id) => req(`/periodos/${id}`, { method: 'DELETE' }),

  // Gastos
  getGastos: (params = {}) => req('/gastos?' + new URLSearchParams(params)),
  getRecientes: (n = 10) => req(`/gastos/recientes?n=${n}`),
  updateGasto: (id, data) => req(`/gastos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteGasto: (id) => req(`/gastos/${id}`, { method: 'DELETE' }),

  // Presupuesto
  getPresupuesto: () => req('/presupuesto'),
  setTodosPresupuestos: (data) => req('/presupuesto', { method: 'PUT', body: JSON.stringify(data) }),
  setPresupuesto: (cat, monto) => req(`/presupuesto/${encodeURIComponent(cat)}`, {
    method: 'PUT', body: JSON.stringify({ monto })
  }),

  // Importar
  previewCSV: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return fetch(BASE + '/importar/preview', { method: 'POST', body: fd }).then(r => r.json())
  },
  confirmarImport: (data) => req('/importar/confirmar', { method: 'POST', body: JSON.stringify(data) }),

  // Categorías y reglas
  getCategorias: () => req('/categorias'),
  addCategoria: (data) => req('/categorias', { method: 'POST', body: JSON.stringify(data) }),
  deleteCategoria: (nombre) => req(`/categorias/${encodeURIComponent(nombre)}`, { method: 'DELETE' }),
  addFormaPago: (data) => req('/categorias/formas_pago', { method: 'POST', body: JSON.stringify(data) }),
  deleteFormaPago: (nombre) => req(`/categorias/formas_pago/${encodeURIComponent(nombre)}`, { method: 'DELETE' }),
  addRegla: (data) => req('/categorias/reglas', { method: 'POST', body: JSON.stringify(data) }),
  deleteRegla: (id) => req(`/categorias/reglas/${id}`, { method: 'DELETE' }),
  recategorizar: () => req('/categorias/reglas/recategorizar', { method: 'POST' }),

  // Config
  getConfig: () => req('/config'),
  setConfig: (data) => req('/config', { method: 'PUT', body: JSON.stringify(data) }),

  // Análisis
  getTendencia: () => req('/analisis/tendencia'),
  getCategoriaTendencia: (cat) => req(`/analisis/categoria?categoria=${encodeURIComponent(cat)}`),
  getHormigas: () => req('/analisis/hormigas'),
  getRecurrentes: () => req('/analisis/recurrentes'),
  getHeatmap: () => req('/analisis/heatmap'),
}

export function fmt(n) {
  if (n == null) return '$0'
  return '$' + Math.round(n).toLocaleString('es-AR')
}

export function fmtFecha(f) {
  if (!f) return ''
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y}`
}

export const CAT_COLORS = {
  'Alimentación': '#4CAF50',
  'Restaurantes': '#FF9800',
  'Suscripciones': '#9C27B0',
  'Servicios': '#2196F3',
  'Vivienda': '#795548',
  'Compras': '#F44336',
  'Transporte': '#00BCD4',
  'Deporte': '#8BC34A',
  'Entretenimiento': '#E91E63',
  'Salud': '#009688',
  'Ropa': '#FF5722',
  'Delivery': '#FFC107',
  'Otros': '#9E9E9E',
  'Electrónica': '#3F51B5',
  'Ahorro/Inversión': '#1D9E75',
  'A Clasificar': '#BDBDBD',
}

export function catColor(cat) {
  return CAT_COLORS[cat] || '#9E9E9E'
}
