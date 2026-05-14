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
  updateCategoria: (nombre, data) => req(`/categorias/${encodeURIComponent(nombre)}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategoria: (nombre) => req(`/categorias/${encodeURIComponent(nombre)}`, { method: 'DELETE' }),
  addFormaPago: (data) => req('/categorias/formas_pago', { method: 'POST', body: JSON.stringify(data) }),
  deleteFormaPago: (nombre) => req(`/categorias/formas_pago/${encodeURIComponent(nombre)}`, { method: 'DELETE' }),
  addRegla: (data) => req('/categorias/reglas', { method: 'POST', body: JSON.stringify(data) }),
  deleteRegla: (id) => req(`/categorias/reglas/${id}`, { method: 'DELETE' }),
  recategorizar: () => req('/categorias/reglas/recategorizar', { method: 'POST' }),

  // Config
  getConfig: () => req('/config'),
  setConfig: (data) => req('/config', { method: 'PUT', body: JSON.stringify(data) }),
  getVista: () => req('/config').then(c => c.vista_gastos || 'liquidez'),
  setVista: (v) => req('/config', { method: 'PUT', body: JSON.stringify({ vista_gastos: v }) }),

  // Ingresos pendientes
  getIngresos: () => req('/ingresos'),
  resolverIngreso: (id) => req(`/ingresos/${id}/resolver`, { method: 'POST' }),
  ingresoAlPeriodo: (id) => req(`/ingresos/${id}/al-periodo`, { method: 'POST' }),

  // Análisis
  getTendencia: () => req('/analisis/tendencia'),
  getCategoriaTendencia: (cat) => req(`/analisis/categoria?categoria=${encodeURIComponent(cat)}`),
  getHormigas: (periodoId = null) => req('/analisis/hormigas' + (periodoId != null ? `?periodo_id=${periodoId}` : '')),
  getRecurrentes: () => req('/analisis/recurrentes'),
  getHeatmap: () => req('/analisis/heatmap'),
  getConsumo: (meses = 12) => req(`/analisis/consumo?meses=${meses}`),
  getResumenAnalisis: () => req('/analisis/resumen'),
  getRankingAnalisis: (periodoId = null) => req('/analisis/ranking' + (periodoId != null ? `?periodo_id=${periodoId}` : '')),
  getAcumuladoAnalisis: (periodoId = null) => req('/analisis/acumulado' + (periodoId != null ? `?periodo_id=${periodoId}` : '')),
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
  // Finanzas
  'Tarjetas':          '#1e3f7a',
  'Inversiones':       '#14532d',
  'Ahorro/Inversión':  '#14532d',

  // Comida & mercado
  'Supermercado':      '#15803d',
  'Alimentación':      '#b45309',
  'Comida':            '#c2410c',
  'Restaurantes':      '#b91c1c',
  'Delivery':          '#9a6700',

  // Casa
  'Vivienda':          '#7c2d12',
  'Servicios':         '#1e40af',
  'Mantenimiento':     '#44403c',
  'Decoración':        '#581c87',

  // Salidas & social
  'Vacaciones':        '#075985',
  'Juntadas/salidas':  '#92400e',
  'Entretenimiento':   '#6b21a8',
  'Regalos':           '#9d174d',

  // Deporte & hobbies
  'Deporte':           '#3f6212',
  'Hobbies':           '#065f46',
  'Mascota':           '#78350f',

  // Personal & compras
  'Compras':           '#831843',
  'Ropa':              '#be185d',
  'Salud':             '#0e7490',
  'Electrónica':       '#1e3a8a',

  // Servicios digitales
  'Suscripciones':     '#5b21b6',
  'Subscripciones':    '#5b21b6',

  // Transporte
  'Transporte':        '#0f766e',
  'Transporte/Viajes': '#134e4a',

  // Casa / compras del hogar
  'Hogar':             '#92400e',

  // Educación
  'Educación':         '#1e40af',

  // Catch-all
  'Otros':             '#6b7280',

  // Sin clasificar → siempre gris
  'A Clasificar':      '#9ca3af',
  'A Revisar':         '#9ca3af',
  'Sin Clasificar':    '#9ca3af',
}

export function catColor(cat) {
  return CAT_COLORS[cat] || '#6b7280'
}
