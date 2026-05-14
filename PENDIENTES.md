# Pendientes del proyecto

## Corto plazo (próxima sesión)

- [ ] Cargar resumen **Abril 2026** — id=996 ($1.168.818 "Pago Tarjeta de crédito") cubre APR+MAY combinado; una vez que tengas el detalle de abril, crear `cargar_abril.py` y borrar id=996
- [ ] Clasificar **id=995** ("Transferencia enviada Adriana Cristina Fumega" $322.000, 06/05/2026) — está como "A Revisar"; puede ser pago de tarjeta o transferencia familiar
- [ ] Investigar **Período 2026-03-27 → 2026-04-27 con ingreso $704.123** — monto muy bajo para ser sueldo, probablemente retiro de inversión que disparó creación automática de período; corregir vía Configuración → Períodos
- [ ] Cargar **Diciembre 2025** — se borró el agregado (id=647, $1.068.000) pero no se cargaron los ítems individuales; faltan los gastos de ese resumen
- [ ] Diseño arquitectura para **ingresos/movimientos internos** — retiros de inversión, transferencias entre cuentas y reintegros de tarjeta no deben afectar totales de gastos; columna `tipo` ya existe ('gasto' | 'movimiento_interno' | 'ajuste'), falta la lógica de UI y backend
- [ ] Regla **"lapitz diego"** fue borrada; verificar que los 2 gastos que tenía quedaron bien en "A Revisar"

## Mediano plazo

- [ ] Tabla `cuentas` — modelar movimientos entre cuentas (MercadoPago, Bull Market, banco, efectivo) para ver saldo real por cuenta
- [ ] Usar columna `tipo` en backend/frontend — filtrar `movimiento_interno` de los totales de gastos, mostrar con estilo diferente en Movimientos
- [ ] Columna `gasto_ref_id` — linkear reintegros al gasto original; bot de Telegram puede usar esto cuando el usuario explica una devolución
- [ ] Backup automático diario de la DB (script + tarea programada Windows)

## Largo plazo

- [ ] **Patrimonio neto real** — deudas abiertas, activos (inversiones con valor de mercado actualizado), efectivo por cuenta; vista resumen
- [ ] **Proyecciones** — basadas en historial de gastos por categoría, estimar cierre del período y próximos meses
- [ ] **Vista mobile** del dashboard — actualmente solo desktop
- [ ] **Resúmenes de tarjeta automáticos** — parsear el PDF/CSV del resumen de Mercado Pago para no cargar a mano cada ítem
