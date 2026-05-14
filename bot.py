"""
Bot de Telegram para control de gastos personales.
Corre con python-telegram-bot v20+ (async).
"""
import re
import logging
from datetime import datetime

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    ContextTypes,
    filters,
)

import json
import anthropic
import database as db
from categorizer import categorizar
from config import TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, ANTHROPIC_API_KEY

# Gastos pendientes de clasificar: {chat_id: {descripcion, monto, fecha}}
_pendientes: dict[int, dict] = {}
# Ingreso pendiente de resolver: {chat_id: {ingreso_id, descripcion, monto, fecha}}
_ingresos_pendientes: dict[int, dict] = {}

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def hoy() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def mes_actual() -> str:
    return datetime.now().strftime("%Y-%m")


def formatear_monto(m: float) -> str:
    return f"${m:,.0f}".replace(",", ".")


def solo_mi_chat(update: Update) -> bool:
    return update.effective_chat.id == TELEGRAM_CHAT_ID


def parsear_monto(texto: str) -> float | None:
    """Extrae un número del texto, acepta formatos: 3500 / 3.500 / 3,500 / 3500,50"""
    texto = texto.strip()
    # Quitar puntos de miles si hay coma decimal: 3.500,50 → 3500.50
    if re.search(r'\d\.\d{3},\d', texto):
        texto = texto.replace(".", "").replace(",", ".")
    # Solo coma como decimal: 3500,50 → 3500.50
    elif "," in texto and "." not in texto:
        texto = texto.replace(",", ".")
    # Punto como miles (3.500) → 3500
    elif re.match(r'^\d{1,3}(\.\d{3})+$', texto):
        texto = texto.replace(".", "")
    try:
        return float(texto)
    except ValueError:
        return None


# ── Parseo de mensajes ────────────────────────────────────────────────────────

PATRON_PRESTE = re.compile(
    r'^prest[eé]\s+a\s+([a-záéíóúüñA-ZÁÉÍÓÚÜÑ][a-záéíóúüñA-ZÁÉÍÓÚÜÑ]*)\s+([\d.,]+)',
    re.IGNORECASE,
)
PATRON_ME_PRESTO = re.compile(
    r'^me\s+prest[oó]\s+([a-záéíóúüñA-ZÁÉÍÓÚÜÑ][a-záéíóúüñA-ZÁÉÍÓÚÜÑ]*)\s+([\d.,]+)',
    re.IGNORECASE,
)
PATRON_DEVOLUCION = re.compile(
    r'^([a-záéíóúüñA-ZÁÉÍÓÚÜÑ][a-záéíóúüñA-ZÁÉÍÓÚÜÑ]*)\s+me\s+devolvi[oó]\s+([\d.,]+)',
    re.IGNORECASE,
)
PATRON_GASTO = re.compile(
    r'^(.+?)\s+([\d.,]+)\s*$'
)


async def _alerta_presupuesto(context: ContextTypes.DEFAULT_TYPE):
    mes = mes_actual()
    presupuesto = db.get_presupuesto(mes)
    if not presupuesto:
        return
    total = db.get_total_mes(mes)
    porcentaje = total / presupuesto
    if porcentaje >= 0.8:
        usado = formatear_monto(total)
        limite = formatear_monto(presupuesto)
        pct = int(porcentaje * 100)
        await context.bot.send_message(
            chat_id=TELEGRAM_CHAT_ID,
            text=(
                f"⚠️ *Alerta de presupuesto*\n"
                f"Gastaste {usado} de {limite} ({pct}% del mes)\n"
                f"{'🔴 Superaste el presupuesto!' if porcentaje >= 1 else '🟡 Cerca del límite.'}"
            ),
            parse_mode="Markdown",
        )


# ── Comandos ──────────────────────────────────────────────────────────────────

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not solo_mi_chat(update):
        return
    await update.message.reply_text(
        "👋 *Bot de gastos activo.*\n\n"
        "Enviame un gasto así:\n"
        "  `super 3500`\n"
        "  `netflix 8000`\n\n"
        "Deudas:\n"
        "  `presté a Juan 5000`\n"
        "  `me prestó María 2000`\n"
        "  `Juan me devolvió 5000`\n\n"
        "Comandos: /estado /resumen /deudas",
        parse_mode="Markdown",
    )


async def cmd_estado(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not solo_mi_chat(update):
        return
    mes = mes_actual()
    total = db.get_total_mes(mes)
    presupuesto = db.get_presupuesto(mes)
    por_cat = db.get_gastos_por_categoria(mes)

    top3 = list(por_cat.items())[:3]
    top3_txt = "\n".join(
        f"  • {cat}: {formatear_monto(monto)}" for cat, monto in top3
    ) or "  (sin gastos aún)"

    if presupuesto:
        pct = int(total / presupuesto * 100)
        disponible = presupuesto - total
        bar = "█" * (pct // 10) + "░" * (10 - pct // 10)
        presup_txt = (
            f"\n*Presupuesto:* {formatear_monto(presupuesto)}\n"
            f"*Disponible:* {formatear_monto(disponible)}\n"
            f"`[{bar}] {pct}%`"
        )
    else:
        presup_txt = "\n_(Sin presupuesto configurado)_"

    await update.message.reply_text(
        f"📊 *Resumen {mes}*\n"
        f"*Total gastado:* {formatear_monto(total)}"
        f"{presup_txt}\n\n"
        f"*Top categorías:*\n{top3_txt}",
        parse_mode="Markdown",
    )


async def cmd_resumen(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not solo_mi_chat(update):
        return
    resumen = _resumen_periodo()
    if resumen:
        await update.message.reply_text(resumen, parse_mode="Markdown")
    else:
        await update.message.reply_text("No hay datos del período actual.")


async def cmd_cancelar(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not solo_mi_chat(update):
        return
    chat_id = update.effective_chat.id
    _ingresos_pendientes.pop(chat_id, None)
    await update.message.reply_text("Listo, salí del flujo de ingresos. Los pendientes siguen guardados, retomá cuando quieras con /ingresos.")


async def cmd_ingresos(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Activa el flujo conversacional para resolver ingresos pendientes."""
    if not solo_mi_chat(update):
        return
    pendientes = db.get_ingresos_pendientes()
    if not pendientes:
        await update.message.reply_text("No hay ingresos pendientes.")
        return
    chat_id = update.effective_chat.id
    primero = pendientes[0]
    _ingresos_pendientes[chat_id] = primero
    from importer_mp import limpiar_nombre
    nombre = limpiar_nombre(primero["descripcion"]).replace("*","").replace("_"," ")
    await update.message.reply_text(
        f"{len(pendientes)} ingresos pendientes. Empecemos:\n\n"
        f"+${primero['monto']:,.0f} el {primero['fecha']}\n"
        f"{nombre}\n\n"
        f"Que fue esto?".replace(",", ".")
    )


async def cmd_deudas(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not solo_mi_chat(update):
        return
    deudas = db.get_deudas_abiertas()
    if not deudas:
        await update.message.reply_text("No hay deudas abiertas. 🎉")
        return

    me_deben = sum(d["monto"] for d in deudas if d["tipo"] == "presté")
    debo = sum(d["monto"] for d in deudas if d["tipo"] == "me_prestaron")

    lineas = []
    for d in deudas:
        icono = "➡️" if d["tipo"] == "presté" else "⬅️"
        lineas.append(f"  {icono} {d['persona']}: {formatear_monto(d['monto'])} ({d['estado']})")

    neto = me_deben - debo
    neto_txt = (
        f"Me deben {formatear_monto(neto)}"
        if neto > 0
        else f"Debo {formatear_monto(abs(neto))}"
        if neto < 0
        else "Estamos a mano"
    )

    await update.message.reply_text(
        f"💸 *Deudas abiertas*\n"
        + "\n".join(lineas)
        + f"\n\n*Neto:* {neto_txt}",
        parse_mode="Markdown",
    )


# ── Mensajes de texto libre ───────────────────────────────────────────────────

async def handle_mensaje(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not solo_mi_chat(update):
        return

    # Gastos en cola tienen prioridad absoluta
    if db.count_clasificacion_queue() > 0:
        if await handle_clasificacion_texto(update, context):
            return

    # Ingresos solo si el usuario activó el flujo con /ingresos
    if _ingresos_pendientes.get(update.effective_chat.id):
        if await handle_ingreso_texto(update, context):
            return

    texto = update.message.text.strip()

    # — Presté a Juan 5000
    m = PATRON_PRESTE.match(texto)
    if m:
        persona, monto_str = m.group(1).capitalize(), m.group(2)
        monto = parsear_monto(monto_str)
        if monto:
            db.add_deuda(hoy(), persona, monto, "presté")
            await update.message.reply_text(
                f"✅ Registrado: prestaste {formatear_monto(monto)} a *{persona}*",
                parse_mode="Markdown",
            )
        else:
            await update.message.reply_text("No pude leer el monto. Ejemplo: `presté a Juan 5000`", parse_mode="Markdown")
        return

    # — Me prestó María 2000
    m = PATRON_ME_PRESTO.match(texto)
    if m:
        persona, monto_str = m.group(1).capitalize(), m.group(2)
        monto = parsear_monto(monto_str)
        if monto:
            db.add_deuda(hoy(), persona, monto, "me_prestaron")
            await update.message.reply_text(
                f"✅ Registrado: *{persona}* te prestó {formatear_monto(monto)}",
                parse_mode="Markdown",
            )
        else:
            await update.message.reply_text("No pude leer el monto.", parse_mode="Markdown")
        return

    # — Juan me devolvió 5000
    m = PATRON_DEVOLUCION.match(texto)
    if m:
        persona, monto_str = m.group(1).capitalize(), m.group(2)
        monto = parsear_monto(monto_str)
        if monto:
            resultado = db.resolver_deuda(persona, monto)
            await update.message.reply_text(
                f"✅ *{persona}* devolvió {formatear_monto(monto)}. {resultado}",
                parse_mode="Markdown",
            )
        else:
            await update.message.reply_text("No pude leer el monto.", parse_mode="Markdown")
        return

    # — Gasto genérico: descripcion monto
    m = PATRON_GASTO.match(texto)
    if m:
        descripcion, monto_str = m.group(1).strip(), m.group(2)
        monto = parsear_monto(monto_str)
        if not monto or monto <= 0:
            await update.message.reply_text(
                "No entendí el monto. Ejemplo: `super 3500`", parse_mode="Markdown"
            )
            return

        # El bot nunca llama a la IA — si no matchea keyword pregunta al usuario
        categoria, _, _ = categorizar(descripcion, usar_ia=False)

        if categoria == "A Clasificar":
            # Guardar como pendiente y preguntar con botones
            _pendientes[update.effective_chat.id] = {
                "descripcion": descripcion,
                "monto": monto,
                "fecha": hoy(),
            }
            cats_botones = [c for c in db.get_categorias_gasto() if c != "A Clasificar"]
            teclado = [
                [InlineKeyboardButton(c, callback_data=f"cat:{c}")]
                for c in cats_botones
            ]
            await update.message.reply_text(
                f"❓ No reconocí *{descripcion}*. ¿Qué categoría es?",
                reply_markup=InlineKeyboardMarkup(teclado),
                parse_mode="Markdown",
            )
            return

        db.add_gasto(
            fecha=hoy(),
            descripcion=descripcion,
            monto=monto,
            categoria=categoria,
            fuente="telegram",
            forma_pago="Efectivo",
        )
        await update.message.reply_text(
            f"✅ Registrado {formatear_monto(monto)} — _{descripcion}_\n"
            f"📂 Categoría: *{categoria}*",
            parse_mode="Markdown",
        )
        await _alerta_presupuesto(context)
        return

    await update.message.reply_text(
        "No entendí. Ejemplos:\n`super 3500`\n`presté a Juan 5000`\n`/estado`",
        parse_mode="Markdown",
    )


async def handle_categoria_elegida(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Callback cuando el usuario toca un botón de categoría.

    Dos formatos posibles:
    - cat:{categoria}         → gasto nuevo desde texto (bot)
    - cat:{gasto_id}:{cat}   → actualizar gasto existente del CSV + guardar regla
    """
    query = update.callback_query
    await query.answer()

    if query.data.startswith("ing:"):
        await handle_ingreso_callback(query, query.data.split(":"))
        return

    if not query.data.startswith("cat:"):
        return

    partes = query.data.split(":", 2)

    # ── Caso 1: actualizar gasto existente (desde procesar_inbox) ──
    if len(partes) == 3:
        _, gasto_id_str, categoria = partes
        gasto_id = int(gasto_id_str)

        import sqlite3
        conn = sqlite3.connect(__import__('config').DB_PATH)
        conn.row_factory = sqlite3.Row
        gasto = conn.execute("SELECT * FROM gastos WHERE id=?", (gasto_id,)).fetchone()
        conn.close()

        if not gasto:
            await query.edit_message_text("Gasto no encontrado.")
            return

        # Actualizar este gasto
        db.update_gasto(gasto_id, categoria=categoria)

        # Guardar keyword y recategorizar todos los iguales
        descripcion = gasto["descripcion"]
        keyword = descripcion.lower().strip()
        db.upsert_regla(keyword, categoria, orden=50)
        actualizados = _recategorizar_descripcion(descripcion, categoria)

        texto_extra = f"\n_Regla guardada — {actualizados} movimiento(s) actualizados._" if actualizados > 1 else "\n_Regla guardada para próximas importaciones._"
        await query.edit_message_text(
            f"✅ *{__import__('importer_mp').limpiar_nombre(descripcion)}* → *{categoria}*{texto_extra}",
            parse_mode="Markdown",
        )
        return

    # ── Caso 2: gasto nuevo desde texto libre ──
    categoria = partes[1]
    chat_id = update.effective_chat.id
    pendiente = _pendientes.pop(chat_id, None)

    if not pendiente:
        await query.edit_message_text("No encontré el gasto pendiente. Volvé a enviarlo.")
        return

    db.add_gasto(
        fecha=pendiente["fecha"],
        descripcion=pendiente["descripcion"],
        monto=pendiente["monto"],
        categoria=categoria,
        fuente="telegram",
        forma_pago="Efectivo",
    )

    # Guardar keyword para el futuro
    db.upsert_regla(pendiente["descripcion"].lower().strip(), categoria, orden=50)

    await query.edit_message_text(
        f"✅ {formatear_monto(pendiente['monto'])} — _{pendiente['descripcion']}_\n"
        f"📂 *{categoria}* _(regla guardada)_",
        parse_mode="Markdown",
    )
    await _alerta_presupuesto(context)


async def preguntar_ingreso(bot, ingreso: dict):
    """Manda a Telegram una pregunta sobre un ingreso recibido."""
    from importer_mp import limpiar_nombre
    nombre = limpiar_nombre(ingreso["descripcion"])
    teclado = InlineKeyboardMarkup([
        [InlineKeyboardButton("Es una devolución / me devolvieron", callback_data=f"ing:devol:{ingreso['id']}")],
        [InlineKeyboardButton("Es un préstamo que me dieron", callback_data=f"ing:prestamo:{ingreso['id']}")],
        [InlineKeyboardButton("Ignorar (no afecta mis gastos)", callback_data=f"ing:ignorar:{ingreso['id']}")],
    ])
    await bot.send_message(
        chat_id=TELEGRAM_CHAT_ID,
        text=(
            f"💸 *Recibiste ${ingreso['monto']:,.0f}* el {ingreso['fecha']}\n"
            f"De: _{nombre}_\n\n"
            f"¿Qué fue esto? (o explicame con texto libre)"
        ).replace(",", "."),
        parse_mode="Markdown",
        reply_markup=teclado,
    )


async def interpretar_con_ia(texto_usuario: str, ingreso: dict) -> dict:
    """Usa Claude para entender la explicación del usuario sobre un ingreso."""
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    categorias = db.get_categorias()

    gastos_recientes = db.get_ultimos_gastos(30)
    gastos_txt = "\n".join(
        f"- id={g['id']} {g['fecha']} ${g['monto']:,.0f} {g['descripcion'][:40]} [{g['categoria']}]"
        for g in gastos_recientes
    )

    prompt = f"""El usuario recibió una transferencia y la está explicando con texto libre.

Transferencia recibida: ${ingreso['monto']:,.0f} el {ingreso['fecha']} de "{ingreso['descripcion']}"

Explicación del usuario: "{texto_usuario}"

Gastos recientes del usuario:
{gastos_txt}

Analizá la explicación y respondé SOLO con JSON válido:
{{
  "tipo": "devolucion" | "prestamo" | "ingreso_laboral" | "otro",
  "categoria": "<categoría más apropiada de esta lista: {', '.join(categorias)}>",
  "gasto_id_referencia": <id del gasto al que corresponde esta devolución, o null>,
  "monto_neto_gasto": <cuánto quedó pagando el usuario realmente, o null si no se puede calcular>,
  "resumen": "<descripción corta de qué fue, para mostrarle al usuario>"
}}"""

    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = msg.content[0].text.strip()
    start, end = raw.find("{"), raw.rfind("}") + 1
    return json.loads(raw[start:end])


async def categorizar_con_ia(texto_usuario: str, gasto: dict) -> str:
    """Usa Claude Haiku para categorizar un gasto a partir de texto libre del usuario."""
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    categorias = db.get_categorias_gasto()
    from importer_mp import limpiar_nombre
    nombre = limpiar_nombre(gasto["descripcion"])

    prompt = f"""El usuario está clasificando un gasto de su extracto bancario.

Gasto: "{nombre}" — ${gasto['monto']:,.0f} el {gasto['fecha']}
Explicación del usuario: "{texto_usuario}"

Categorías disponibles: {', '.join(categorias)}

Si el usuario dice que no recuerda, no sabe, no se acuerda, no tiene idea, o algo similar, respondé exactamente: A Revisar
Respondé SOLO con el nombre exacto de la categoría más apropiada (sin explicación, sin comillas)."""

    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=50,
        messages=[{"role": "user", "content": prompt}],
    )
    categoria = msg.content[0].text.strip().strip('"').strip("'")
    if categoria not in categorias:
        categoria = "A Revisar"
    return categoria


async def handle_clasificacion_texto(update: Update, context: ContextTypes.DEFAULT_TYPE) -> bool:
    """Maneja la clasificación conversacional de gastos en cola."""
    gasto = db.get_next_clasificacion()
    if not gasto:
        return False

    texto = update.message.text.strip()
    msg_espera = await update.message.reply_text("Procesando...")

    try:
        categoria = await categorizar_con_ia(texto, gasto)
    except Exception as e:
        await msg_espera.edit_text(f"No pude interpretar eso: {e}")
        return True

    db.update_gasto(gasto["id"], categoria=categoria)
    db.upsert_regla(gasto["descripcion"].lower().strip(), categoria, orden=50)
    db.dequeue_clasificacion(gasto["id"])

    siguiente = db.get_next_clasificacion()
    resto = db.count_clasificacion_queue()

    from importer_mp import limpiar_nombre

    def safe(s):
        return str(s).replace("*","").replace("_"," ").replace("`","").replace("[","").replace("]","")

    nombre_actual = safe(limpiar_nombre(gasto["descripcion"]))

    try:
        if siguiente:
            nombre_sig = safe(limpiar_nombre(siguiente["descripcion"]))
            await msg_espera.edit_text(
                f"OK {nombre_actual} -> {categoria}\n\n"
                f"Siguiente ({resto} restantes):\n"
                f"{nombre_sig}\n"
                f"${siguiente['monto']:,.0f} - {siguiente['fecha']}\n\n"
                f"Que fue esto?".replace(",", "."),
            )
        else:
            await msg_espera.edit_text(
                f"OK {nombre_actual} -> {categoria}\n\nListo, clasificacion completa."
            )
            resumen = _resumen_periodo()
            if resumen:
                await update.message.reply_text(resumen)
    except Exception as e:
        logger.error(f"Error editando mensaje clasificacion: {e}")
    return True


async def handle_ingreso_texto(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """El usuario explicó en texto libre qué fue un ingreso pendiente."""
    chat_id = update.effective_chat.id
    pendiente = _ingresos_pendientes.get(chat_id)
    if not pendiente:
        return False

    texto = update.message.text.strip()
    msg_espera = await update.message.reply_text("Procesando...")

    try:
        resultado = await interpretar_con_ia(texto, pendiente)
    except Exception as e:
        await msg_espera.edit_text(f"No pude interpretar eso: {e}")
        return True

    db.resolver_ingreso(
        ingreso_id=pendiente["id"],
        gasto_id_referencia=resultado.get("gasto_id_referencia"),
        categoria=resultado.get("categoria", "Otros"),
        monto_neto=resultado.get("monto_neto_gasto"),
    )
    _ingresos_pendientes.pop(chat_id, None)

    resumen = resultado.get("resumen", "Registrado")
    neto_txt = ""
    if resultado.get("monto_neto_gasto"):
        neto_txt = f"\nGasto neto ajustado a *${resultado['monto_neto_gasto']:,.0f}*".replace(",", ".")

    _ingresos_pendientes.pop(chat_id, None)
    siguientes = db.get_ingresos_pendientes()
    siguiente = next((i for i in siguientes if i["id"] != pendiente["id"]), None)
    if siguiente:
        _ingresos_pendientes[chat_id] = siguiente

    def safe(s):
        return str(s).replace("*","").replace("_"," ").replace("`","").replace("[","").replace("]","")

    try:
        if siguiente:
            from importer_mp import limpiar_nombre as _ln
            nombre_sig = safe(_ln(siguiente["descripcion"]))
            resto = len(siguientes) - 1
            await msg_espera.edit_text(
                f"OK: {safe(resumen)}{neto_txt}\n\n"
                f"Siguiente ({resto} restantes):\n"
                f"+${siguiente['monto']:,.0f} el {siguiente['fecha']}\n"
                f"{nombre_sig}\n\n"
                f"Que fue esto?".replace(",", "."),
            )
        else:
            await msg_espera.edit_text(
                f"OK: {safe(resumen)}{neto_txt}\n\nListo, no hay mas ingresos pendientes."
            )
    except Exception as e:
        logger.error(f"Error editando mensaje ingreso: {e}")
    return True


async def handle_ingreso_callback(query, partes):
    """Maneja los botones rápidos de ingresos (devol/prestamo/ignorar)."""
    accion = partes[1]
    ingreso_id = int(partes[2])

    ingresos = db.get_ingresos_pendientes()
    ingreso = next((i for i in ingresos if i["id"] == ingreso_id), None)
    if not ingreso:
        await query.edit_message_text("Ya estaba resuelto.")
        return

    chat_id = query.message.chat_id

    if accion == "ignorar":
        db.resolver_ingreso(ingreso_id, None, "Otros", None)
        await query.edit_message_text("Ignorado — no afecta tus gastos.")
        return

    if accion == "prestamo":
        db.resolver_ingreso(ingreso_id, None, "Prestamos", None)
        await query.edit_message_text(
            f"✅ Registrado como préstamo recibido de ${ingreso['monto']:,.0f}".replace(",", ".")
        )
        return

    # devol → pedir explicación con texto libre
    _ingresos_pendientes[chat_id] = ingreso
    from importer_mp import limpiar_nombre
    nombre = limpiar_nombre(ingreso["descripcion"])
    await query.edit_message_text(
        f"*${ingreso['monto']:,.0f}* de _{nombre}_\n\n"
        f"Contame qué fue — por ejemplo:\n"
        f"  _\"me devolvieron la juntada del viernes\"_\n"
        f"  _\"devolución del asado del sábado, yo puse $360k y éramos 10\"_".replace(",", "."),
        parse_mode="Markdown",
    )


def _resumen_periodo() -> str | None:
    """Genera un resumen del período actual: total, por categoría y promedio diario."""
    from datetime import date
    periodo = db.get_periodo_actual()
    if not periodo:
        return None

    gastos = db.get_gastos_periodo(periodo["id"])
    if not gastos:
        return None

    total = sum(g["monto"] for g in gastos)
    por_cat = {}
    for g in gastos:
        cat = g["categoria"]
        if cat not in ("A Clasificar", "Ahorro/Inversión"):
            por_cat[cat] = por_cat.get(cat, 0) + g["monto"]

    dias = max((date.today() - date.fromisoformat(periodo["fecha_inicio"])).days, 1)
    promedio_diario = total / dias

    top = sorted(por_cat.items(), key=lambda x: x[1], reverse=True)[:6]
    lineas_cat = "\n".join(f"  {cat}: *{formatear_monto(m)}*" for cat, m in top)

    ingreso = periodo.get("monto_ingreso") or 0
    ahorro_txt = ""
    if ingreso:
        ahorro = ingreso - total
        pct = int((1 - total / ingreso) * 100) if ingreso else 0
        ahorro_txt = f"\nAhorro estimado: *{formatear_monto(ahorro)}* ({pct}%)"

    return (
        f"Resumen del periodo actual ({periodo['fecha_inicio']} hasta hoy)\n\n"
        f"Total gastado: *{formatear_monto(total)}*\n"
        f"Promedio diario: *{formatear_monto(promedio_diario)}*{ahorro_txt}\n\n"
        f"Por categoria:\n{lineas_cat}"
    )


def _recategorizar_descripcion(descripcion: str, categoria: str) -> int:
    """Actualiza todos los gastos con la misma descripción que no fueron editados a mano."""
    import sqlite3
    conn = sqlite3.connect(__import__('config').DB_PATH)
    conn.execute(
        "UPDATE gastos SET categoria=?, ai_categorizado=0 WHERE descripcion=? AND categoria_override=0",
        (categoria, descripcion),
    )
    n = conn.execute(
        "SELECT changes()"
    ).fetchone()[0]
    conn.commit()
    conn.close()
    return n


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    db.init_db()
    app = Application.builder().token(TELEGRAM_TOKEN).build()

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("estado", cmd_estado))
    app.add_handler(CommandHandler("resumen", cmd_resumen))
    app.add_handler(CommandHandler("deudas", cmd_deudas))
    app.add_handler(CommandHandler("ingresos", cmd_ingresos))
    app.add_handler(CommandHandler("cancelar", cmd_cancelar))
    app.add_handler(CallbackQueryHandler(handle_categoria_elegida, pattern=r"^cat:"))
    app.add_handler(CallbackQueryHandler(handle_categoria_elegida, pattern=r"^ing:"))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_mensaje))

    async def on_startup(app):
        pendientes_ing = len(db.get_ingresos_pendientes())
        pendientes_cat = db.count_clasificacion_queue()
        partes = []
        if pendientes_cat:
            partes.append(f"{pendientes_cat} gasto(s) para clasificar — escribi cualquier cosa para empezar")
        if pendientes_ing:
            partes.append(f"{pendientes_ing} ingreso(s) pendientes — manda /ingresos cuando quieras")
        texto = "Bot iniciado." + ("\n\n" + "\n".join(partes) if partes else " Sin pendientes.")
        try:
            await app.bot.send_message(chat_id=TELEGRAM_CHAT_ID, text=texto)
        except Exception as e:
            logger.warning(f"No pude mandar aviso de inicio: {e}")

    app.post_init = on_startup
    logger.info("Bot iniciado.")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
