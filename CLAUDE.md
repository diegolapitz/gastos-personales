# Gastos Personales — Guía completa para Claude Code

Sistema de seguimiento de gastos personales con importación automática de extractos de MercadoPago, categorización con IA, notificaciones por Telegram y dashboard web React.

---

## Stack y arquitectura

```
Gastos/
├── bot.py                  # Bot de Telegram (python-telegram-bot)
├── database.py             # Toda la lógica SQLite (único archivo de DB)
├── categorizer.py          # Reglas keyword + fallback Claude Haiku
├── importer_mp.py          # Parser de CSVs de MercadoPago
├── procesar_inbox.py       # Script principal: procesa inbox/ y notifica
├── config.py               # Tokens/claves (NO subir a git, ver config.example.py)
├── gastos.db               # SQLite — se crea al inicializar
├── iniciar.bat             # Arranca bot + backend + frontend
├── inbox/                  # Carpeta donde se dejan los CSVs de MP
│   └── .processed.json     # Log de archivos ya procesados
├── backend/
│   ├── main.py             # FastAPI app, monta todos los routers
│   └── routes/
│       ├── gastos.py       # GET/PUT/DELETE /api/gastos
│       ├── periodos.py     # GET/POST/PUT/DELETE /api/periodos
│       ├── categorias.py   # Categorías, formas de pago, reglas keyword
│       ├── presupuestos.py # Presupuesto por categoría
│       ├── analisis.py     # Tendencias, heatmap, hormigas, recurrentes
│       ├── config.py       # Configuración general (umbral sueldo, etc.)
│       └── importar.py     # Preview + confirmar importación de CSV
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   ├── api.js          # Todas las llamadas al backend
    │   ├── pages/
    │   │   ├── Dashboard.jsx
    │   │   ├── Movimientos.jsx   # Lista editable de gastos
    │   │   ├── Analisis.jsx
    │   │   ├── Importar.jsx
    │   │   └── Configuracion.jsx # Categorías, períodos, reglas, presupuestos
    │   └── styles/
    └── dist/               # Build de producción (servido por FastAPI)
```

---

## Base de datos (gastos.db)

### Tablas principales

**gastos**
```sql
id, fecha (YYYY-MM-DD), descripcion, monto (positivo), categoria,
fuente (csv_mp | manual_csv | telegram), source_id (único por origen),
ai_categorizado (0/1), ai_razon, forma_pago, categoria_override (0/1)
```
- `monto` siempre positivo. El gasto neto real se edita directamente si hay devolución.
- `categoria_override=1` indica que fue editado manualmente → el recategorizador automático no lo toca.
- `fuente='manual_csv'` = importado desde el CSV manual histórico.

**periodos**
```sql
id, fecha_inicio (YYYY-MM-DD), fecha_fin (YYYY-MM-DD | NULL),
monto_ingreso, objetivo_ahorro
```
- El período con `fecha_fin IS NULL` es el actual.
- Los gastos se asignan a un período por rango de fecha: `fecha_inicio <= gasto.fecha < fecha_fin`.
- Se crean automáticamente cuando se detecta un ingreso > umbral_sueldo en un CSV de MP.

**categorias**
```sql
id, nombre, excluir_gastos (0/1)
```
- `excluir_gastos=1`: la categoría no cuenta para el total de gastos (ej: Ahorro/Inversión).

**reglas_categorizacion**
```sql
id, keyword, categoria, orden
```
- Se aplican en orden ascendente. La primera que matchea gana.
- Se pueden agregar desde el dashboard o automáticamente cuando se edita un gasto por Telegram.

**ingresos_pendientes**
```sql
id, source_id, fecha, descripcion, monto, resuelto (0/1)
```
- Transferencias recibidas / devoluciones detectadas en el CSV de MP.
- Se preguntan por Telegram y se resuelven ahí.

**config**
```sql
clave, valor
```
- `umbral_sueldo`: monto mínimo para detectar un ingreso como sueldo (default 3.000.000).
- `objetivo_ahorro_pct`: porcentaje objetivo de ahorro.

---

## Flujo de trabajo normal (cada mes)

### Cargar nuevo extracto de MercadoPago

1. Descargar el CSV desde MercadoPago → "Resumen de cuenta" (formato semicolon, DD-MM-YYYY).
2. Copiar el archivo a `inbox/`.
3. Correr desde la terminal:
   ```bash
   python procesar_inbox.py
   ```
   Esto hace automáticamente:
   - Detecta archivos nuevos no procesados.
   - Crea el período si detecta un sueldo nuevo (monto > umbral).
   - Categoriza con keywords → fallback a Claude Haiku si no matchea.
   - Inserta los gastos nuevos en la DB.
   - Guarda los ingresos/devoluciones en `ingresos_pendientes`.
   - Envía por Telegram los gastos "A Clasificar" para revisión.
   - Envía por Telegram los ingresos pendientes con botones de acción.

4. Responder en Telegram a cada mensaje (botones o texto libre).

### Ver y corregir gastos

- Abrir `http://localhost:3000` (o correr `iniciar.bat`).
- En **Movimientos**: clic en el badge de categoría para editarla inline. El campo de monto también es editable (útil cuando una transferencia tenía devoluciones parciales).
- En **Configuración → Períodos**: editar fechas de inicio/fin y monto cobrado.

### Flujo con devoluciones

Cuando alguien te devuelve parte de un gasto colectivo:
- El MP CSV registra el gasto grande (ej: -$92.000 pagaste por todos) y luego ingresos (ej: +$18.400, +$5.600, +$3.000 devueltos).
- El sistema detecta esos ingresos y los manda a Telegram.
- Respondés en Telegram: bot interpreta con IA si explicás en texto libre (ej: "me devolvieron de la juntada del viernes").
- Alternativa manual: en Movimientos, editar el monto del gasto original al neto ($92.000 - $27.000 = $65.000).

---

## Iniciar el sistema

```bash
iniciar.bat        # Abre 3 terminales: bot, backend (puerto 8000), frontend (puerto 3000)
```

O manualmente:
```bash
# Terminal 1
python bot.py

# Terminal 2
python -m uvicorn backend.main:app --reload --port 8000

# Terminal 3
cd frontend && npm run dev
```

Dashboard en: `http://localhost:3000`
API en: `http://localhost:8000`

---

## Bot de Telegram

### Callbacks (botones inline)

| Formato | Acción |
|---------|--------|
| `cat:{categoria}` | Nuevo gasto → asigna categoría y guarda en DB |
| `cat:{id}:{categoria}` | Gasto existente → actualiza categoría, guarda regla keyword |
| `ing:devol:{id}` | Ingreso pendiente → marca como devolución |
| `ing:prestamo:{id}` | Ingreso pendiente → marca como préstamo recibido |
| `ing:ignorar:{id}` | Ingreso pendiente → ignora sin registrar |

### Texto libre

Cuando hay un ingreso pendiente activo para el chat, el bot intercepta el texto y lo envía a Claude Haiku con contexto de los últimos gastos. La IA devuelve:
```json
{
  "tipo": "devolucion",
  "categoria": "Juntadas/salidas",
  "gasto_id_referencia": 234,
  "monto_neto_gasto": 48500,
  "resumen": "Devolución de la cena del viernes"
}
```
Y ajusta el gasto original al monto neto.

---

## Categorización automática

`categorizer.py` funciona en dos pasos:

1. **Reglas keyword** (`reglas_categorizacion` en DB): se cargan dinámicamente. Si hay match firme (no "A Clasificar"), se usa directamente.
2. **Claude Haiku** (si no hay match firme): llama a la API con la descripción del comercio y devuelve la categoría + razón. Resultado se cachea en `categorizer_cache.json`.

Para forzar re-categorización de todos los gastos no editados manualmente:
- Dashboard → Configuración → "Recategorizar todos los gastos"
- O directamente: `api.recategorizar()` → `POST /api/categorias/reglas/recategorizar`

---

## API endpoints relevantes

```
GET    /api/periodos              Lista todos los períodos con totales
GET    /api/periodos/actual       Período actual con breakdown por categoría
POST   /api/periodos              Crear período {fecha_inicio, monto_ingreso}
PUT    /api/periodos/{id}         Editar {fecha_inicio, fecha_fin, monto_ingreso}
DELETE /api/periodos/{id}         Eliminar (no borra gastos)

GET    /api/gastos                Lista gastos con filtros (periodo_id, categoria, buscar, monto_min/max)
PUT    /api/gastos/{id}           Editar {categoria?, monto?, forma_pago?}
DELETE /api/gastos/{id}           Eliminar gasto

POST   /api/importar/preview      Preview de un CSV antes de importar
POST   /api/importar/confirmar    Confirmar importación

GET    /api/categorias            Categorías + formas de pago + reglas
POST   /api/categorias/reglas/recategorizar   Re-aplica reglas a todos los gastos no manuales

GET    /api/config                {umbral_sueldo, objetivo_ahorro_pct}
PUT    /api/config                Actualizar config
```

---

## Setup desde cero

```bash
# 1. Clonar repo
git clone <repo_url>
cd Gastos

# 2. Dependencias Python
pip install -r requirements.txt

# 3. Credenciales
cp config.example.py config.py
# Editar config.py con TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, ANTHROPIC_API_KEY

# 4. Frontend
cd frontend && npm install && npm run build && cd ..

# 5. Inicializar DB
python -c "import database; database.init_db()"

# 6. Arrancar
iniciar.bat   # Windows
# o manualmente los 3 procesos (ver sección Iniciar)
```

---

## Detalles de implementación importantes

### Períodos y asignación de gastos
- Un gasto pertenece al período donde `periodo.fecha_inicio <= gasto.fecha < periodo.fecha_fin`.
- El período actual (fecha_fin=NULL) usa `9999-12-31` como límite superior.
- Si se inserta un período histórico con fecha anterior a los existentes, hay que actualizar manualmente `fecha_fin` del nuevo período para que no absorba todos los gastos. Usar el dashboard → Configuración → Períodos.

### Detección de sueldo vs. devolución
- Cualquier ingreso > `umbral_sueldo` (default $3.000.000) en el CSV de MP → crea período nuevo.
- Cualquier ingreso < umbral → va a `ingresos_pendientes` para preguntar por Telegram.
- Rendimientos → siempre ignorados (`TIPOS_IGNORAR_POSITIVOS`).

### Source IDs y deduplicación
- Cada gasto tiene `source_id` único: el `REFERENCE_ID` del CSV de MP, o `manual_FECHA_INDEX` para importados del CSV manual.
- Al procesar un CSV, solo se insertan filas cuyo `source_id` no exista ya en la DB.

### CSV de MercadoPago — formato esperado
- Separador: `;`
- Fechas: `DD-MM-YYYY` en columna `RELEASE_DATE`
- Montos: formato argentino (`1.234,56`) en columna `TRANSACTION_NET_AMOUNT`
- Negativos = gastos, positivos = ingresos
- El header empieza cuando aparece `RELEASE_DATE` y `REFERENCE_ID` en la misma línea

---

## Estado actual (abril 2026)

- **534 gastos** en DB desde Nov 2025 a la fecha
- **6 períodos** configurados (Nov 27 → hoy)
- Histórico Nov 27 – Mar 8 importado del CSV manual del usuario (fuente=manual_csv)
- MP CSV cubre Mar 9 en adelante con categorización automática
- Todas las categorías del CSV manual están mapeadas en DB

## Archivos que NO están en git (sensibles o generados)

- `config.py` → credenciales (Telegram, Anthropic)
- `gastos.db` → datos personales
- `inbox/*.csv` → extractos bancarios
- `inbox/.processed.json` → log de procesamiento
- `frontend/node_modules/`, `frontend/dist/`
