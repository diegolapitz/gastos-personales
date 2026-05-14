# Gastos Personales — Documento completo del proyecto

Sistema personal de tracking de gastos con importación automática desde MercadoPago, categorización con IA, bot de Telegram conversacional y dashboard web React.

---

## 1. Arquitectura general

```
[MercadoPago CSV] → procesar_inbox.py → gastos.db (SQLite)
                                       ↓
                              [Bot Telegram] ← usuario clasifica
                                       ↓
                              [FastAPI backend]
                                       ↓
                              [React frontend] ← localhost:3000
```

### Stack técnico

| Capa | Tecnología |
|------|-----------|
| DB | SQLite con WAL mode |
| Backend | FastAPI (Python), uvicorn |
| Frontend | React + Vite (npm run dev en dev, dist/ en prod) |
| Bot | python-telegram-bot v20 (async) |
| IA categorización | Claude Haiku via Anthropic API |
| IA interpretación | Claude Haiku (texto libre en bot) |

### Estructura de archivos

```
Gastos/
├── bot.py                  # Bot Telegram — clasificación conversacional + ingresos
├── database.py             # Toda la lógica SQLite (único punto de acceso a DB)
├── categorizer.py          # Keyword rules → fallback Claude Haiku
├── importer_mp.py          # Parser CSV MercadoPago
├── procesar_inbox.py       # Script principal: procesa inbox/ y notifica por Telegram
├── config.py               # Tokens (Telegram, Anthropic), DB_PATH — NO en git
├── gastos.db               # SQLite WAL mode
├── iniciar.bat             # Abre 3 terminales: bot, backend, frontend
├── inbox/                  # CSVs de MP van acá
│   └── .processed.json     # Log de archivos ya procesados (evita reimportar)
├── backend/
│   ├── main.py
│   └── routes/
│       ├── gastos.py       # GET/PUT/DELETE /api/gastos
│       ├── periodos.py     # GET/POST/PUT/DELETE /api/periodos
│       ├── categorias.py   # Categorías, formas de pago, reglas keyword
│       ├── presupuestos.py
│       ├── analisis.py     # Tendencias, heatmap, hormigas, recurrentes
│       ├── config.py       # umbral_sueldo, objetivo_ahorro_pct
│       ├── importar.py     # Preview + confirmar CSV manual
│       └── ingresos.py     # GET /api/ingresos, POST resolver, POST al-periodo
└── frontend/src/
    ├── App.jsx
    ├── api.js              # Todas las llamadas al backend
    └── pages/
        ├── Dashboard.jsx   # Resumen del período actual
        ├── Movimientos.jsx # Lista editable: gastos + ingresos pendientes mezclados
        ├── Analisis.jsx
        ├── Importar.jsx
        └── Configuracion.jsx  # Categorías, períodos, reglas, presupuestos
```

---

## 2. Base de datos

### Tablas principales

**gastos**
```sql
id, fecha TEXT (YYYY-MM-DD), descripcion TEXT, monto REAL (siempre positivo),
categoria TEXT, fuente TEXT, categoria_override INTEGER (0/1),
source_id TEXT UNIQUE, ai_categorizado INTEGER, ai_razon TEXT, forma_pago TEXT
```
- `fuente`: `csv_mp` | `manual_csv` | `telegram` | `reintegro`
- `categoria_override=1`: editado manualmente, el recategorizador no lo toca
- `monto` siempre positivo — si hay devolución, se edita el monto neto directamente

**periodos**
```sql
id, fecha_inicio TEXT, fecha_fin TEXT (NULL = período actual),
monto_ingreso REAL, objetivo_ahorro REAL
```
- Un gasto pertenece al período donde `fecha_inicio <= gasto.fecha < fecha_fin`
- Se crea automáticamente cuando se detecta un ingreso > umbral_sueldo en el CSV

**ingresos_pendientes**
```sql
id, source_id TEXT UNIQUE, fecha TEXT, descripcion TEXT, monto REAL,
resuelto INTEGER (0/1), notificado INTEGER (0/1)
```
- Transferencias recibidas detectadas en el CSV (menores al umbral de sueldo)
- `notificado=1`: ya se mandó por Telegram, no re-enviar
- Se resuelven desde el bot o desde el dashboard (Movimientos)

**clasificacion_queue**
```sql
gasto_id INTEGER PK REFERENCES gastos(id), enviado_en TEXT
```
- Cola de gastos "A Clasificar" para el bot
- El bot los pregunta de a uno con texto libre + IA

**categorias**
```sql
id, nombre TEXT, excluir_gastos INTEGER (0/1)
```
- `excluir_gastos=1`: no cuenta en el total (ej: Ahorro/Inversión, Inversiones)

**reglas_categorias** *(nombre real en DB — ojo: el código referencia a veces `reglas_categorizacion`)*
```sql
id, keyword TEXT, categoria TEXT, orden INTEGER
```
- Se aplican en orden ascendente, primera que matchea gana
- Se agregan desde el dashboard o automáticamente cuando el bot clasifica un gasto

**config / app_config** *(hay dos tablas similares — ver database.py)*
```sql
clave, valor
```
- `umbral_sueldo`: monto mínimo para detectar sueldo (default $3.000.000)
- `objetivo_ahorro_pct`: porcentaje objetivo de ahorro

---

## 3. Flujo de trabajo

### Importación mensual (con cowork)

1. Cowork descarga el CSV desde MercadoPago automáticamente y lo deja en `inbox/`
2. Cowork ejecuta `python procesar_inbox.py`
3. El script:
   - Detecta CSVs nuevos no procesados (via `.processed.json`)
   - Crea período si detecta ingreso > umbral_sueldo
   - Categoriza con keyword rules → fallback Claude Haiku
   - Inserta gastos nuevos (deduplicación por `source_id`)
   - Detecta ingresos/devoluciones → `ingresos_pendientes`
   - Encola gastos "A Clasificar" → `clasificacion_queue`
   - Envía notificación Telegram con resumen de pendientes
4. Usuario responde en Telegram cuando tiene tiempo

### Clasificación de gastos (bot)

- Bot pregunta de a uno los gastos en `clasificacion_queue`
- Usuario responde en texto libre ("fue delivery de la cena", "supermercado")
- Claude Haiku interpreta y asigna categoría
- Si dice "no me acuerdo" → categoría "A Revisar"
- Se guarda regla keyword automáticamente para futuros imports
- `/cancelar`: para el flujo sin perder datos

### Resolución de ingresos (bot + dashboard)

- `/ingresos`: inicia el flujo de revisión de `ingresos_pendientes`
- Bot pregunta cada uno con texto libre
- Claude Haiku interpreta si es devolución (y ajusta el gasto original) o capital
- Desde el dashboard (Movimientos): botón **+ Período** suma al `monto_ingreso` del período, botón **✓ Ok** ignora

### Corrección manual (dashboard)

- **Movimientos**: clic en badge de categoría → dropdown → seleccionar → guarda solo
- **Movimientos**: clic en el monto → input → Enter o ✓ para guardar
- **Movimientos**: ingresos pendientes aparecen en verde mezclados por fecha
- **Configuración → Períodos**: editar fechas y monto cobrado inline

---

## 4. Categorización automática

`categorizer.py`:
1. Carga reglas keyword de DB (orden ascendente)
2. Si matchea → categoría directa
3. Si no matchea → Claude Haiku con descripción del comercio
4. Resultado se cachea en `categorizer_cache.json`

Categorías actuales:
- Alimentación, Supermercado, Delivery, Restaurantes
- Transporte, Vivienda, Servicios, Suscripciones
- Salud, Farmacia, Deporte, Entretenimiento
- Juntadas/salidas, Ropa, Compras, Electrónica
- Hobbies, Mascota, Regalos, Vacaciones
- Financieros, Tarjetas, Préstamos, Inversiones
- Ahorro/Inversión *(excluida del total de gastos)*
- Otros, A Revisar, A Clasificar *(pendiente de clasificar)*

---

## 5. Bot de Telegram — detalles

### Comandos
| Comando | Acción |
|---------|--------|
| `/resumen` | Total del período actual + breakdown por categoría |
| `/ingresos` | Inicia flujo de revisión de ingresos pendientes |
| `/cancelar` | Cancela el flujo activo (datos seguros) |

### Prioridad de mensajes de texto
1. Si hay gastos en `clasificacion_queue` → clasifica el próximo
2. Si hay ingreso activo en memoria (`/ingresos` fue ejecutado) → interpreta como explicación del ingreso
3. Sino → mensaje de ayuda

### Comportamiento on_startup
Al iniciar el bot, envía Telegram con conteo de pendientes:
- N gastos para clasificar
- N ingresos pendientes

---

## 6. Estado actual (Mayo 2026)

### Datos en DB
- **546 gastos** desde Nov 2025
- **7 períodos**: Nov 27 → hoy
- Nov 27 – Mar 8: importado del CSV manual histórico (`fuente=manual_csv`)
- Mar 9 en adelante: CSVs de MercadoPago (`fuente=csv_mp`)
- **23 ingresos pendientes** (todos de Mar-Abr 2026)
- **32 gastos en clasificacion_queue**

### Funciona OK
- [x] Importación automática de CSVs MP
- [x] Categorización keyword + IA
- [x] Bot conversacional (sin botones masivos)
- [x] Dashboard: movimientos con edición inline
- [x] Dashboard: ingresos pendientes mezclados por fecha
- [x] Botón "+ Período" para ingresos que son capital propio
- [x] Períodos: creación, edición, eliminación desde dashboard
- [x] SQLite WAL mode (más resiliente a crashes)
- [x] Notificación startup con pendientes

### Conocidos bugs / deuda técnica
- [ ] Inconsistencia de nombres: `reglas_categorizacion` en código vs `reglas_categorias` en DB — las reglas keyword del dashboard no se guardan correctamente
- [ ] Hay dos tablas de config (`config` y `app_config`) — unificar
- [ ] Sin backup automático de la DB
- [ ] `Suscripciones` y `Subscripciones` duplicadas como categorías
- [ ] El recategorizador masivo (dashboard → Configuración) usa el nombre incorrecto de tabla de reglas

---

## 7. API endpoints

```
GET    /api/periodos              Lista períodos con totales y label
GET    /api/periodos/actual       Período actual con breakdown por categoría
POST   /api/periodos              Crear {fecha_inicio, monto_ingreso}
PUT    /api/periodos/{id}         Editar {fecha_inicio, fecha_fin, monto_ingreso}
DELETE /api/periodos/{id}

GET    /api/gastos                Filtros: periodo_id, categoria, forma_pago, buscar, monto_min/max
PUT    /api/gastos/{id}           {categoria?, monto?, forma_pago?}
DELETE /api/gastos/{id}

GET    /api/ingresos              Lista ingresos pendientes no resueltos
POST   /api/ingresos/{id}/resolver   Marcar resuelto (ignorar)
POST   /api/ingresos/{id}/al-periodo Sumar monto al monto_ingreso del período + resolver

POST   /api/importar/preview      Preview CSV
POST   /api/importar/confirmar

GET    /api/categorias            {categorias, formas_pago, reglas}
POST   /api/categorias
POST   /api/categorias/reglas/recategorizar

GET    /api/config                {umbral_sueldo, objetivo_ahorro_pct}
PUT    /api/config
```

---

## 8. Estética del dashboard

### Paleta de colores
- Fondo: blanco / gris muy claro (`#f5f5f5`)
- Cards: blanco con borde sutil y sombra leve
- Acento primario: azul oscuro (variable CSS `--accent`)
- Texto secundario: gris medio
- Ingresos pendientes: verde (`#2e7d32` con fondo `#f0fdf4`)
- Botón "+ Período": azul (`#1565c0`)

### Componentes principales
- **Badges de categoría**: pill con color por categoría (`catColor()` en api.js), fondo semitransparente
- **Tabla de movimientos**: compacta, fecha en gris pequeño, nombre truncado a 220px, monto a la derecha
- **Edición inline**: clic en badge → dropdown nativo; clic en monto → input con Enter/Escape
- **Chips de filtro**: pills clicables para filtrar por categoría
- **Cards del dashboard**: métricas de ahorro con porcentaje y barra de progreso

### Qué le falta estéticamente
- Modo oscuro
- Gráficos más visuales en Dashboard (actualmente solo números)
- Vista mobile — no está adaptada
- Favicon / título de browser personalizado
- Skeleton loaders en lugar de "Cargando..."
- Feedback visual al guardar (toast/snackbar en lugar de silencio)
- El header de la app no tiene navegación activa resaltada de forma obvia

---

## 9. Setup desde cero

```bash
# 1. Dependencias Python
pip install -r requirements.txt

# 2. Credenciales
cp config.example.py config.py
# Editar: TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, ANTHROPIC_API_KEY, DB_PATH

# 3. Frontend
cd frontend && npm install && cd ..

# 4. Inicializar DB
python -c "import database; database.init_db()"

# 5. Arrancar
iniciar.bat
```

Dashboard: http://localhost:3000  
API docs: http://localhost:8000/docs

---

## 10. Mejoras prioritarias sugeridas

1. **Corregir nombre de tabla reglas** — bug crítico: las reglas keyword no se persisten
2. **Backup automático diario** de gastos.db (cp con timestamp)
3. **Toast notifications** en el frontend al guardar/error
4. **Vista mobile** básica — al menos la tabla de movimientos responsive
5. **Gráfico de torta** por categoría en el Dashboard
6. **Fusionar** Suscripciones/Subscripciones y config/app_config
7. **Exportar CSV** de gastos filtrados desde Movimientos
