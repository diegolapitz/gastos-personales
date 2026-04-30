"""
Procesador de CSVs de MercadoPago desde inbox/

Uso:
  python procesar_inbox.py            # muestra estado y procesa archivos nuevos
  python procesar_inbox.py --status   # solo muestra estado, no procesa
  python procesar_inbox.py --dry-run  # simula sin escribir en DB
"""
import sys, os, json
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))
import database as db
import importer_mp as imp
from categorizer import categorizar

INBOX = os.path.join(os.path.dirname(__file__), "inbox")
LOG_PATH = os.path.join(INBOX, ".processed.json")

SEP = "-" * 60
sys.stdout.reconfigure(encoding="utf-8", errors="replace") if hasattr(sys.stdout, "reconfigure") else None


def load_log():
    if os.path.exists(LOG_PATH):
        with open(LOG_PATH, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_log(log):
    with open(LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(log, f, indent=2, ensure_ascii=False)


def scan_inbox():
    archivos = []
    for nombre in sorted(os.listdir(INBOX)):
        if not nombre.endswith(".csv"):
            continue
        path = os.path.join(INBOX, nombre)
        with open(path, "rb") as fp:
            contenido = fp.read()
        try:
            df = imp.parsear_csv_estructura(contenido)
            ingresos = imp.detectar_ingresos(contenido)
            fechas = sorted(df["fecha"].tolist()) if not df.empty else []
            archivos.append({
                "nombre": nombre,
                "contenido": contenido,
                "fecha_min": fechas[0] if fechas else None,
                "fecha_max": fechas[-1] if fechas else None,
                "total_filas": len(df),
                "nuevas": int(df["es_nuevo"].sum()) if not df.empty else 0,
                "ingresos": ingresos,
            })
        except Exception as e:
            print(f"  (!)  {nombre}: {e}")
    return sorted(archivos, key=lambda x: x["fecha_min"] or "")


def mostrar_estado(archivos, log):
    import sqlite3
    conn = sqlite3.connect(os.path.join(os.path.dirname(__file__), "gastos.db"))
    conn.row_factory = sqlite3.Row

    print(f"\n{SEP}")
    print("  ESTADO DE GASTOS")
    print(SEP)

    # Gastos en DB
    r = conn.execute(
        "SELECT MIN(fecha) mn, MAX(fecha) mx, COUNT(*) total FROM gastos"
    ).fetchone()
    if r["total"]:
        print(f"\n  Gastos en DB : {r['total']} registros  ({r['mn']} → {r['mx']})")
    else:
        print("\n  Gastos en DB : vacío")

    # Períodos
    periodos = conn.execute(
        "SELECT * FROM periodos ORDER BY fecha_inicio"
    ).fetchall()
    print(f"\n  Períodos     : {len(periodos)}")
    for p in periodos:
        fin = p["fecha_fin"] or "hoy"
        ingreso = f"${p['monto_ingreso']:,.0f}".replace(",", ".") if p["monto_ingreso"] else "sin ingreso"
        marca = " ← ACTUAL" if not p["fecha_fin"] else ""
        print(f"    {p['fecha_inicio']} → {fin}  |  Cobro: {ingreso}{marca}")

    # Cobros conocidos (todos los ingresos detectados en inbox)
    todos_ingresos = []
    for a in archivos:
        for ing in a["ingresos"]:
            todos_ingresos.append(ing)
    todos_ingresos = sorted(todos_ingresos, key=lambda x: x["fecha"])
    if todos_ingresos:
        print(f"\n  Cobros detectados en los CSVs:")
        for ing in todos_ingresos:
            print(f"    {ing['fecha']}  ${ing['monto']:,.0f}".replace(",", "."))

    conn.close()

    # Inbox
    print(f"\n{SEP}")
    print("  ARCHIVOS EN INBOX")
    print(SEP)
    if not archivos:
        print("\n  (carpeta vacía)")
    for a in archivos:
        ya = log.get(a["nombre"])
        if ya:
            estado = f"OK  ya procesado el {ya['procesado_en'][:10]}  ({ya['insertados']} insertados)"
        elif a["nuevas"] == 0:
            estado = "(!)   sin movimientos nuevos (todos ya en DB)"
        else:
            estado = f"...  pendiente  ({a['nuevas']} movimientos nuevos)"

        print(f"\n  {a['nombre']}")
        print(f"    Período  : {a['fecha_min']} → {a['fecha_max']}")
        print(f"    Estado   : {estado}")
        if a["ingresos"]:
            for ing in a["ingresos"]:
                print(f"    $ Cobro : {ing['fecha']}  ${ing['monto']:,.0f}".replace(",", "."))

    print()


def procesar_todos(dry_run=False):
    db.init_db()
    archivos = scan_inbox()
    log = load_log()

    mostrar_estado(archivos, log)

    pendientes = [a for a in archivos if a["nombre"] not in log and a["nuevas"] > 0]

    if not pendientes:
        print("  Nada nuevo para procesar.\n")
        return

    prefijo = "[DRY-RUN] " if dry_run else ""
    print(f"{SEP}")
    print(f"  {prefijo}PROCESANDO {len(pendientes)} ARCHIVO(S)")
    print(SEP)

    for archivo in pendientes:
        print(f"\n  >> {archivo['nombre']}")

        # Crear períodos por cada ingreso detectado
        periodos_existentes = [p["fecha_inicio"] for p in db.get_periodos()]
        for ing in archivo["ingresos"]:
            if ing["fecha"] not in periodos_existentes:
                if not dry_run:
                    new_id = db.crear_periodo(ing["fecha"], ing["monto"])
                    print(f"    $ Período creado (id={new_id})  desde {ing['fecha']}  ${ing['monto']:,.0f}".replace(",", "."))
                    periodos_existentes.append(ing["fecha"])
                else:
                    print(f"    [DRY] Crearía período desde {ing['fecha']}  ${ing['monto']:,.0f}".replace(",", "."))

        # Importar gastos nuevos
        df_raw = imp.parsear_csv_estructura(archivo["contenido"])
        nuevos = df_raw[df_raw["es_nuevo"]].copy().reset_index(drop=True)

        if nuevos.empty:
            print(f"    → Todos los movimientos ya estaban en DB")
            continue

        print(f"    Categorizando {len(nuevos)} movimientos", end="", flush=True)
        filas_cat = []
        for i, (_, row) in enumerate(nuevos.iterrows()):
            cat, uso_ia, razon = categorizar(row["descripcion"])
            filas_cat.append({**row.to_dict(), "categoria": cat,
                               "ai_categorizado": uso_ia, "ai_razon": razon})
            if (i + 1) % 25 == 0:
                print(f" {i+1}", end="", flush=True)
        print(" ✓")

        import pandas as pd
        df_cat = pd.DataFrame(filas_cat)

        if not dry_run:
            insertados = imp.importar_filas(df_cat)
            print(f"    OK {insertados} movimientos insertados")
            log[archivo["nombre"]] = {
                "fecha_min": archivo["fecha_min"],
                "fecha_max": archivo["fecha_max"],
                "insertados": insertados,
                "procesado_en": datetime.now().isoformat(),
            }
            save_log(log)
        else:
            print(f"    [DRY] Insertaría {len(filas_cat)} movimientos")

    if not dry_run:
        _guardar_ingresos_menores(archivos)
        _notificar_ingresos_pendientes()
        _notificar_sin_clasificar()
        print(f"\n  OK Listo. Abrí http://localhost:3000\n")
    else:
        print(f"\n  (dry-run — no se escribió nada)\n")


def _guardar_ingresos_menores(archivos):
    """Detecta transferencias recibidas / devoluciones y las guarda como pendientes."""
    from importer_mp import detectar_ingresos_menores
    total = 0
    for archivo in archivos:
        ingresos = detectar_ingresos_menores(archivo["contenido"])
        for ing in ingresos:
            # Evitar duplicar si ya está en ingresos_pendientes o gastos
            if not db.source_id_en_pendientes(ing["source_id"]):
                db.add_ingreso_pendiente(
                    source_id=ing["source_id"],
                    fecha=ing["fecha"],
                    descripcion=ing["descripcion"],
                    monto=ing["monto"],
                )
                total += 1
    if total:
        print(f"  {total} ingresos/devoluciones guardados para revisar por Telegram.")


def _notificar_ingresos_pendientes():
    """Manda por Telegram solo los ingresos nuevos (no notificados aún)."""
    try:
        import asyncio
        from config import TELEGRAM_TOKEN, TELEGRAM_CHAT_ID
        from telegram import Bot, InlineKeyboardButton, InlineKeyboardMarkup
        from importer_mp import limpiar_nombre

        pendientes = db.get_ingresos_pendientes(solo_nuevos=True)
        if not pendientes:
            return

        print(f"  Enviando {len(pendientes)} ingresos/devoluciones a Telegram...")

        async def _enviar():
            bot = Bot(token=TELEGRAM_TOKEN)
            for ing in pendientes[:15]:
                nombre = limpiar_nombre(ing["descripcion"])
                # Escapar caracteres especiales de Markdown
                nombre_safe = nombre.replace("_", " ").replace("*", "").replace("[", "").replace("]", "")
                teclado = InlineKeyboardMarkup([
                    [InlineKeyboardButton("Devolucion / me devolvieron", callback_data=f"ing:devol:{ing['id']}")],
                    [InlineKeyboardButton("Prestamo que me dieron",      callback_data=f"ing:prestamo:{ing['id']}")],
                    [InlineKeyboardButton("Ignorar",                     callback_data=f"ing:ignorar:{ing['id']}")],
                ])
                await bot.send_message(
                    chat_id=TELEGRAM_CHAT_ID,
                    text=f"+${ing['monto']:,.0f} el {ing['fecha']}\n{nombre_safe}".replace(",", "."),
                    reply_markup=teclado,
                )

        asyncio.run(_enviar())
        db.marcar_ingresos_notificados([i["id"] for i in pendientes])
    except Exception as e:
        print(f"  (Telegram ingresos no disponible: {e})")


def _notificar_sin_clasificar():
    """Encola los gastos 'A Clasificar' para clasificación conversacional por Telegram."""
    try:
        from config import TELEGRAM_TOKEN, TELEGRAM_CHAT_ID
        import asyncio
        from telegram import Bot
        from importer_mp import limpiar_nombre

        periodo = db.get_periodo_actual()
        if not periodo:
            return

        gastos = db.get_gastos_periodo(periodo["id"])
        pendientes = [g for g in gastos if g["categoria"] == "A Clasificar"]

        if not pendientes:
            print("  Todos los movimientos quedaron categorizados.")
            return

        print(f"  {len(pendientes)} movimientos sin clasificar — encolando para Telegram...")

        for g in pendientes:
            db.enqueue_clasificacion(g["id"])

        async def _avisar():
            bot = Bot(token=TELEGRAM_TOKEN)
            primero = pendientes[0]
            nombre = limpiar_nombre(primero["descripcion"]).replace("_", " ").replace("*", "")
            await bot.send_message(
                chat_id=TELEGRAM_CHAT_ID,
                text=(
                    f"*{len(pendientes)} movimientos para clasificar.*\n"
                    f"Te voy preguntando de a uno.\n\n"
                    f"Primero:\n"
                    f"*{nombre}*\n"
                    f"${primero['monto']:,.0f} - {primero['fecha']}\n\n"
                    f"Que fue esto?"
                ).replace(",", "."),
                parse_mode="Markdown",
            )

        asyncio.run(_avisar())
        print(f"  Telegram: {len(pendientes)} gastos encolados.")
    except Exception as e:
        print(f"  (Telegram no disponible: {e})")


if __name__ == "__main__":
    if "--status" in sys.argv:
        db.init_db()
        archivos = scan_inbox()
        log = load_log()
        mostrar_estado(archivos, log)
    else:
        dry_run = "--dry-run" in sys.argv or "--dry" in sys.argv
        procesar_todos(dry_run)
