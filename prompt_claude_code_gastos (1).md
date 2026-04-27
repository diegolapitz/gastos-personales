# Sistema de Control de Gastos Personales

## Qué es esto

Quiero un sistema completo de control de gastos personales que funcione en mi PC con Windows. El sistema tiene tres partes: un bot de Telegram para carga rápida, una base de datos local SQLite, y un dashboard Streamlit para visualización y configuración.

El foco principal es entender mis gastos hormiga y optimizar gastos recurrentes. Las deudas/préstamos son secundarias, algo simple alcanza.

---

## Bot de Telegram

Interfaz principal de carga rápida. Entiende texto libre en español argentino:

- `super 3500` → gasto $3500, descripción "super", se categoriza por reglas
- `netflix 8000` → gasto $8000, descripción "netflix"
- `presté a Juan 5000` / `me prestó María 2000` → registro de deuda simple
- `Juan me devolvió 5000` → cierra/reduce esa deuda
- `/estado` → resumen del mes: gastado, disponible, top 3 categorías
- `/deudas` → lista deudas abiertas
- `/resumen` → desglose por categoría del mes

La categorización usa las reglas configurables de la DB (keyword → categoría). Si no puede inferir la categoría, pregunta al usuario con botones de respuesta rápida.

Token y chat ID van en `.env`.

---

## Base de datos

SQLite local, archivo `gastos.db`.

**gastos**: id, fecha, descripción, monto, categoría, fuente (telegram/csv_mp/manual), categoria_override (bool), source_id (para deduplicación de CSV de MP)

**deudas**: id, fecha, persona, monto, tipo (presté/me_prestaron), estado (abierta/cerrada/parcial)

**presupuesto**: mes (YYYY-MM), monto_disponible

**reglas_categorias**: keyword, categoría, orden (para resolver conflictos)

Siempre guardar la descripción original para poder recategorizar.

---

## Dashboard Streamlit

### Inicio
- Barra de progreso: gastado vs presupuesto del mes
- Gráfico de torta por categoría
- Últimos 10 movimientos
- Deudas abiertas (resumen simple)

### Gastos
- Tabla del mes filtrable por categoría, rango de fechas, fuente
- Editar categoría de cualquier fila (activa categoria_override, esa fila no se toca en recategorizaciones futuras)
- Eliminar registros

### Análisis
- Evolución mensual de gastos (línea de tiempo, últimos 6 meses)
- Comparación entre meses por categoría
- Top gastos del mes (los más altos)
- Detección de gastos recurrentes: movimientos de monto similar con frecuencia semanal/mensual

### Importar MercadoPago
El CSV correcto a usar es el "Resumen de cuenta" (account_statement), NO el de liquidaciones. Tiene estas características:
- Separador: punto y coma (`;`)
- Las primeras 2 filas son un resumen de balance (ignorar), los datos reales empiezan en la fila con header `RELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;TRANSACTION_NET_AMOUNT;PARTIAL_BALANCE`
- `REFERENCE_ID` → ID único para deduplicación
- `RELEASE_DATE` → fecha en formato `DD-MM-YYYY`
- `TRANSACTION_TYPE` → descripción con nombre del comercio (ej: "Pago Supermercado clemente.", "Pago Netflix", "Transferencia enviada Juan Pérez")
- `TRANSACTION_NET_AMOUNT` → monto con formato argentino (puntos como miles, coma como decimal). Negativo = gasto, positivo = ingreso
- Filtrar solo filas con monto negativo para gastos. Ignorar "Rendimientos" (son intereses de la cuenta)
- Ignorar "Transferencia recibida" e "Ingreso de dinero" (no son gastos)
- Deduplicar usando `REFERENCE_ID` contra los ya existentes en la DB

Flujo de importación:
1. Usuario sube el CSV
2. Sistema detecta los movimientos nuevos (no están en DB por SOURCE_ID)
3. Intenta categorizar lo que pueda por monto/patrones conocidos
4. Muestra tabla de preview con categoría sugerida editable por fila
5. Usuario confirma → se insertan en DB
6. Bot manda resumen por Telegram: "X movimientos importados, $Y total"

### Configuración de categorías
- Tabla editable: keyword → categoría, con orden de prioridad
- Botón "Recategorizar toda la base": re-aplica reglas sobre descripción original en todos los gastos sin categoria_override
- Categorías disponibles (editables): Alimentación, Transporte, Servicios, Salud, Entretenimiento, Ropa, Electrónica, Restaurantes, Suscripciones, Otros

### Presupuesto y recurrentes
- Input para presupuesto del mes actual
- Lista de gastos detectados como recurrentes (mismo monto ±5%, misma frecuencia) para que el usuario los confirme o descarte
- Historial de presupuestos anteriores

---

## Alerta automática

Cuando se registra cualquier gasto (Telegram o import), si el acumulado del mes supera el 80% del presupuesto → el bot manda aviso por Telegram.

---

## Deudas (simple)

No necesita pantalla compleja. Una lista con: persona, monto, tipo, fecha, estado. Botón para marcar como saldada. Total neto al pie (me deben menos debo).

---

## Estructura de archivos

```
gastos/
├── bot.py
├── dashboard.py
├── database.py
├── categorizer.py
├── importer_mp.py
├── config.py
├── .env
├── requirements.txt
├── iniciar.bat         ← levanta bot + dashboard con doble clic
└── gastos.db           ← se crea automáticamente
```

---

## Reglas de categorización iniciales (seedear en DB)

| Keyword        | Categoría       |
|----------------|-----------------|
| super          | Alimentación    |
| mercado        | Alimentación    |
| carnicería     | Alimentación    |
| verdulería     | Alimentación    |
| panadería      | Alimentación    |
| nafta          | Transporte      |
| combustible    | Transporte      |
| uber           | Transporte      |
| remis          | Transporte      |
| colectivo      | Transporte      |
| luz            | Servicios       |
| gas            | Servicios       |
| agua           | Servicios       |
| internet       | Servicios       |
| celular        | Servicios       |
| farmacia       | Salud           |
| médico         | Salud           |
| doctor         | Salud           |
| cine           | Entretenimiento |
| spotify        | Suscripciones   |
| netflix        | Suscripciones   |
| disney         | Suscripciones   |
| ropa           | Ropa            |
| zapatillas     | Ropa            |
| restaurant     | Restaurantes    |
| resto          | Restaurantes    |
| pizza          | Restaurantes    |
| delivery       | Restaurantes    |

---

## Restricciones

- Sin APIs externas salvo Telegram
- Sin base de datos en la nube, todo local
- Sin login en el dashboard (uso personal)
- Sin Docker ni dependencias complejas
