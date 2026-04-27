# Sistema de control de gastos personales — app web completa

## Contexto

Tengo un sistema de control de gastos con bot de Telegram y SQLite ya funcionando. Quiero que construyas una aplicación web profesional y moderna para visualizar y gestionar esos datos. El resultado tiene que verse y sentirse como una producto real.

---

## Stack

**Backend:** Python + FastAPI. Expone una API REST que lee y escribe en `gastos.db` (SQLite). Reutiliza la lógica existente de `database.py`, `categorizer.py`, `importer_mp.py`.

**Frontend:** React + Recharts para gráficos. Sin frameworks CSS de terceros — escribí CSS propio limpio y profesional. El diseño tiene que ser de nivel producto: tipografía cuidada, espaciado generoso, colores consistentes, sin bordes innecesarios, sin sombras excesivas.

**Paleta:**
- Fondo: #F8F8F6 (página), #FFFFFF (cards)
- Acento primario: #378ADD (azul)
- Alerta: #D85A30 (naranja/rojo)
- Éxito: #1D9E75 (verde)
- Texto primario: #1A1A1A, secundario: #6B6B6B
- Bordes: #E8E8E4

**Estructura de archivos:**
```
gastos/
├── backend/
│   ├── main.py          ← FastAPI app
│   ├── routes/
│   │   ├── gastos.py
│   │   ├── periodos.py
│   │   ├── presupuestos.py
│   │   └── importar.py
│   └── (reutiliza database.py, categorizer.py, importer_mp.py del nivel superior)
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Analisis.jsx
│   │   │   ├── Movimientos.jsx
│   │   │   ├── Importar.jsx
│   │   │   └── Configuracion.jsx
│   │   └── components/
│   └── package.json
├── bot.py
├── database.py
├── categorizer.py
├── importer_mp.py
├── config.py
├── .env
└── iniciar.bat          ← levanta backend + frontend + bot con doble clic
```

---

## Lógica de período

El "mes" no es el mes calendario. Es el período entre cobros de sueldo. El sistema detecta automáticamente el inicio de un nuevo período cuando entra una transferencia con monto positivo mayor al umbral configurado (default: $1.000.000). Ese día arranca el período. El período activo va desde ese día hasta hoy, o hasta el próximo ingreso grande si ya llegó. Toda la lógica de "período actual" usa esto, no el mes calendario.

Cuando se detecta un nuevo ingreso grande:
- Se registra como inicio de período
- Se calcula el objetivo de ahorro: 50% del monto ingresado
- Se guarda ese objetivo para el período

---

## Página — dashboard

**4 métricas superiores:**
- Gastado en el período (con delta vs período anterior)
- Disponible (suma de presupuestos por categoría - gastado)
- Objetivo de ahorro del período (50% del sueldo detectado) con progreso actual
- Días transcurridos / días del período

**Barra de progreso global del período:** días transcurridos sobre total del período estimado.

**Dos columnas:**
- Izquierda: barras horizontales por categoría, ordenadas de mayor a menor gasto. Cada barra muestra el gasto real vs el presupuesto de esa categoría — la barra es naranja si supera el 80% del presupuesto, roja si lo supera.
- Derecha: últimos 10 movimientos. Nombre del comercio, fecha, monto, badge de categoría coloreado, badge de medio de pago (MP / Tarjeta / Efectivo).

---

## Página — análisis

**Gráfico de control por categoría:**
- Selector de categoría (dropdown)
- Gráfico de barras verticales: una barra por período (últimos 6), mostrando el gasto en esa categoría
- Línea horizontal de referencia con el presupuesto objetivo de esa categoría
- Barras en verde si están por debajo del objetivo, en rojo si lo superan
- Título dinámico según la categoría seleccionada

**Tendencia general:** barras verticales con gasto total de los últimos 6 períodos. Barra del período actual con color distinto. Línea de referencia con el presupuesto total (suma de categorías).

**Gastos hormiga:** tabla con los comercios/descripciones que más se repiten en el período actual. Columnas: nombre, frecuencia, monto total, promedio por vez. Ordenado por frecuencia descendente.

**Recurrentes detectados:** análisis automático en Python en el backend. Lógica: normalizar descripciones (lowercase, sin caracteres especiales, sin números), agrupar, calcular intervalo promedio entre apariciones. Si aparece 3+ veces con intervalo promedio menor a 35 días → recurrente. Mostrar: nombre, frecuencia estimada (diario / semanal / mensual), monto típico, próxima aparición estimada.

**Comparación entre períodos por categoría:** heatmap o tabla visual donde filas = categorías, columnas = últimos 4 períodos, celdas = monto gastado. Verde si bajó vs período anterior, naranja si subió.

---

## Página — movimientos

Tabla completa con búsqueda y filtros:
- Selector de período
- Multiselect de categorías
- Filtro de medio de pago
- Rango de monto (slider)

Cada fila tiene un botón de edición inline para cambiar la categoría manualmente (activa `categoria_override = true`).

Totales al pie: suma filtrada, cantidad de movimientos.

---

## Página — importar MP

Área de drag & drop para subir el CSV.

**Formato del CSV (Resumen de cuenta de MercadoPago):**
- Separador: punto y coma (`;`)
- Primeras 2 filas son resumen de balance — ignorar
- Headers reales: `RELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;TRANSACTION_NET_AMOUNT;PARTIAL_BALANCE`
- `RELEASE_DATE`: formato `DD-MM-YYYY`
- `TRANSACTION_TYPE`: descripción con nombre del comercio
- `TRANSACTION_NET_AMOUNT`: formato argentino (puntos=miles, coma=decimal). Negativo = gasto.
- Deduplicar por `REFERENCE_ID`
- Ignorar filas: Rendimientos, Transferencia recibida, Ingreso de dinero
- Solo procesar montos negativos como gastos
- Los montos positivos grandes (> umbral) → detectar como posible ingreso de sueldo, preguntar al usuario si confirma nuevo período

**Flujo:**
1. Drag & drop del CSV
2. Barra de progreso de procesamiento
3. Categorización automática por keywords; los que no matchean → Claude Haiku (con caché por descripción)
4. Tabla de preview editable por fila antes de confirmar
5. Confirmar → inserta en DB, re-evalúa períodos, bot Telegram manda resumen

---

## Página — configuración

**Presupuesto por categoría:** tabla editable con categoría y monto objetivo por período. Total al pie (presupuesto global = suma). Los montos se usan en todos los gráficos de control.

**Objetivo de ahorro:** mostrar el 50% del último sueldo detectado como referencia. Permitir override manual si querés ajustarlo.

**Umbral de detección de sueldo:** input numérico (default $1.000.000).

**Reglas de categorización:** tabla editable keyword → categoría con orden de prioridad. Botón "Recategorizar toda la base" — re-aplica reglas sobre descripción original en todos los gastos sin `categoria_override = true`.

**Categorías disponibles** (editables): Alimentación, Transporte, Servicios, Salud, Entretenimiento, Ropa, Electrónica, Restaurantes, Suscripciones, Ahorro/Inversión, Otros.

**Medio de pago por defecto** para carga manual vía bot.

---

## Reglas de negocio importantes

**Ahorro/Inversión:** categoría especial excluida del total de gastos en todos los cálculos y gráficos. Aparece separada. Keywords preconfiguradas: "bull market", "lapitz diego rodolfo".

**Alertas por Telegram:** cuando cualquier import o carga nueva hace que el gasto de una categoría supere el 80% de su presupuesto → el bot manda aviso: "Delivery al 85% del presupuesto — $68.000 de $80.000".

**categoria_override:** si el usuario editó manualmente la categoría de un gasto, ese campo es true y la recategorización automática nunca lo toca.

**Medio de pago:** campo en cada gasto. Import CSV de MP → "MercadoPago" automático. Carga bot → configurable, default "Efectivo".

---

## Calidad esperada

- Diseño de nivel producto, no prototipo
- Transiciones suaves entre páginas (React Router)
- Estados de carga mientras el backend responde
- Gráficos interactivos con tooltips detallados (Recharts)
- Sidebar de navegación fija a la izquierda con íconos y labels
- Totalmente funcional en escritorio (no necesita ser mobile)
- El CSS tiene que estar bien organizado, con variables CSS para la paleta
