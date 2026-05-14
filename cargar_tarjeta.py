"""
Migración + carga de gastos de tarjeta de crédito Mercado Pago.

Ejecutar desde el directorio raíz del proyecto:
    python cargar_tarjeta.py

Lo que hace:
  1. Agrega columnas nuevas a la tabla gastos (migración idempotente)
  2. Crea categorías y formas de pago necesarias
  3. Inserta los 4 resúmenes de tarjeta (ENE/FEB/MAR/MAY 2026)
  4. Agrega 'vista_gastos' a app_config
"""

import sys, os
sys.path.insert(0, os.path.dirname(__file__))

import sqlite3
from datetime import date
from config import DB_PATH

FORMA_PAGO = "Tarjeta Crédito"

# TC estimados para meses sin TC explícito
TC = {
    "2026-01": 1443.0,   # explícito en el resumen
    "2026-02": 1520.0,   # estimado
    "2026-03": 1700.0,   # estimado
    "2026-05": 1950.0,   # estimado
}


# ─────────────────────────────────────────────────────────────────────────────
# MIGRACIÓN DE SCHEMA
# ─────────────────────────────────────────────────────────────────────────────

def migrar_schema(conn):
    cur = conn.cursor()
    cols = {row[1] for row in cur.execute("PRAGMA table_info(gastos)").fetchall()}

    nuevas = [
        ("fecha_consumo",  "TEXT"),
        ("fecha_pago",     "TEXT"),
        ("es_cuota",       "INTEGER DEFAULT 0"),
        ("cuota_numero",   "INTEGER"),
        ("cuota_total",    "INTEGER"),
        ("resumen_mes",    "TEXT"),
        ("moneda",         "TEXT DEFAULT 'ARS'"),
        ("monto_usd",      "REAL"),
        ("tc_aplicado",    "REAL"),
    ]
    for nombre, tipo in nuevas:
        if nombre not in cols:
            cur.execute(f"ALTER TABLE gastos ADD COLUMN {nombre} {tipo}")
            print(f"  + columna '{nombre}' agregada")
        else:
            print(f"  · columna '{nombre}' ya existe, saltando")

    conn.commit()


# ─────────────────────────────────────────────────────────────────────────────
# CATEGORÍAS Y FORMAS DE PAGO
# ─────────────────────────────────────────────────────────────────────────────

CATEGORIAS_NUEVAS = ["Hogar", "Educación", "Transporte/Viajes"]

def seed_categorias(conn):
    cur = conn.cursor()
    existentes = {r[0] for r in cur.execute("SELECT nombre FROM categorias").fetchall()}

    for nombre in CATEGORIAS_NUEVAS:
        if nombre not in existentes:
            cur.execute("INSERT INTO categorias (nombre, excluir_gastos) VALUES (?, 0)", (nombre,))
            print(f"  + categoría '{nombre}' creada")
        else:
            print(f"  · categoría '{nombre}' ya existe")

    formas = {r[0] for r in cur.execute("SELECT nombre FROM formas_pago").fetchall()}
    if FORMA_PAGO not in formas:
        cur.execute("INSERT INTO formas_pago (nombre) VALUES (?)", (FORMA_PAGO,))
        print(f"  + forma de pago '{FORMA_PAGO}' creada")
    else:
        print(f"  · forma de pago '{FORMA_PAGO}' ya existe")

    conn.commit()


# ─────────────────────────────────────────────────────────────────────────────
# INSERCIÓN
# ─────────────────────────────────────────────────────────────────────────────

def insertar(conn, items):
    cur = conn.cursor()
    ok = 0
    skip = 0
    for it in items:
        try:
            cur.execute("""
                INSERT INTO gastos
                    (fecha, descripcion, monto, categoria, fuente, source_id,
                     forma_pago, categoria_override,
                     fecha_consumo, fecha_pago, es_cuota, cuota_numero, cuota_total,
                     resumen_mes, moneda, monto_usd, tc_aplicado)
                VALUES
                    (?,?,?,?,?,?,?,?,  ?,?,?,?,?,  ?,?,?,?)
            """, (
                it["fecha_pago"],         # fecha = fecha_pago (liquidez, para asignación de período)
                it["descripcion"],
                it["monto"],
                it["categoria"],
                "tarjeta_mp",
                it["source_id"],
                FORMA_PAGO,
                1,                        # categoria_override = 1 (no recategorizar automáticamente)
                it["fecha_consumo"],
                it["fecha_pago"],
                it.get("es_cuota", 0),
                it.get("cuota_numero"),
                it.get("cuota_total"),
                it["resumen_mes"],
                it.get("moneda", "ARS"),
                it.get("monto_usd"),
                it.get("tc"),
            ))
            ok += 1
        except sqlite3.IntegrityError:
            skip += 1
    conn.commit()
    return ok, skip


def usd(monto_usd, resumen_mes):
    """Convierte USD a ARS usando el TC del resumen."""
    return round(monto_usd * TC[resumen_mes], 2)


# ─────────────────────────────────────────────────────────────────────────────
# DATOS — RESUMEN ENERO 2026  (pagado 04/02/2026)
# ─────────────────────────────────────────────────────────────────────────────

def items_enero():
    r = "2026-01"
    fp = "2026-02-04"

    def g(sid_i, fc, desc, monto, cat, **kw):
        return dict(source_id=f"tarjeta_{r}_{sid_i:03d}", fecha_consumo=fc,
                    fecha_pago=fp, resumen_mes=r, descripcion=desc,
                    monto=monto, categoria=cat, **kw)

    return [
        g(1,  "2026-01-04", "Google One",          usd(2.49, r),   "Suscripciones", moneda="USD", monto_usd=2.49,  tc=TC[r]),
        g(2,  "2026-01-09", "Claude.ai",            usd(20.0, r),   "Suscripciones", moneda="USD", monto_usd=20.0,  tc=TC[r]),
        g(3,  "2026-01-09", "Spotify",              usd(3.77, r),   "Suscripciones", moneda="USD", monto_usd=3.77,  tc=TC[r]),
        g(4,  "2026-01-15", "Netflix",              usd(10.32, r),  "Suscripciones", moneda="USD", monto_usd=10.32, tc=TC[r]),
        g(5,  "2026-01-05", "La Anónima",           93092.40,       "Supermercado"),
        g(6,  "2026-01-15", "SERVICOOP - Luz",      237227.37,      "Servicios"),
        g(7,  "2026-01-18", "Red Uno - Internet",   33698.88,       "Servicios"),
        g(8,  "2026-01-23", "PedidosYa",            21235.00,       "Delivery"),
        g(9,  "2026-01-25", "PedidosYa",            8350.00,        "Delivery"),
        g(10, "2026-01-26", "PedidosYa",            550.00,         "Delivery"),
        g(11, "2026-01-27", "PedidosYa",            31400.00,       "Delivery"),
        g(12, "2026-01-25", "ELVIENTOVIENE - Pto Pirámides", 45500.00, "Juntadas/salidas"),
        g(13, "2026-01-25", "VMAREOGRAFO - Pto Pirámides",  119000.00, "Juntadas/salidas"),
        # Cuotas
        g(14, "2025-11-08", "Flybondi",             58926.83,  "Transporte/Viajes", es_cuota=1, cuota_numero=3, cuota_total=3),
        g(15, "2025-11-14", "Travel Bag Riñonera",  17000.00,  "Ropa",              es_cuota=1, cuota_numero=3, cuota_total=3),
        g(16, "2025-11-25", "ShopGallery",          28050.00,  "A Clasificar",      es_cuota=1, cuota_numero=3, cuota_total=3),
        g(17, "2025-12-19", "Eco Music - Guitarra", 107000.00, "Hobbies",           es_cuota=1, cuota_numero=1, cuota_total=3),
        g(18, "2025-12-05", "Naldo Muebles",        38132.32,  "Hogar",             es_cuota=1, cuota_numero=2, cuota_total=6),
        g(19, "2025-12-05", "Naldo Muebles (2)",    12529.82,  "Hogar",             es_cuota=1, cuota_numero=2, cuota_total=6),
        g(20, "2025-12-03", "Mamut - Estantes",     14430.34,  "Hogar",             es_cuota=1, cuota_numero=3, cuota_total=6),
        g(21, "2025-10-01", "DiazHome - Decoración",28410.89,  "Hogar",             es_cuota=1, cuota_numero=5, cuota_total=6),
        g(22, "2025-11-03", "Pontecsa - Mesitas",   11592.18,  "Hogar",             es_cuota=1, cuota_numero=3, cuota_total=9),
        g(23, "2025-05-13", "Samsung - Celular",    67499.91,  "Electrónica",       es_cuota=1, cuota_numero=9, cuota_total=12),
        g(24, "2025-05-23", "Ferretería",           11980.65,  "A Clasificar",      es_cuota=1, cuota_numero=9, cuota_total=9),
        # Devolución MercadoLibre ya neteada — no se inserta
    ]


# ─────────────────────────────────────────────────────────────────────────────
# DATOS — RESUMEN FEBRERO 2026  (pagado 05/03/2026)
# ─────────────────────────────────────────────────────────────────────────────

def items_febrero():
    r = "2026-02"
    fp = "2026-03-05"
    tc = TC[r]

    def g(sid_i, fc, desc, monto, cat, **kw):
        return dict(source_id=f"tarjeta_{r}_{sid_i:03d}", fecha_consumo=fc,
                    fecha_pago=fp, resumen_mes=r, descripcion=desc,
                    monto=monto, categoria=cat, **kw)

    return [
        # Nuevos
        g(1,  "2026-02-03", "Google One",           usd(2.49, r),  "Suscripciones", moneda="USD", monto_usd=2.49,  tc=tc),
        g(2,  "2026-02-09", "Claude.ai",            usd(20.0, r),  "Suscripciones", moneda="USD", monto_usd=20.0,  tc=tc),
        g(3,  "2026-02-09", "Spotify",              usd(3.85, r),  "Suscripciones", moneda="USD", monto_usd=3.85,  tc=tc),
        # Fitia devolución US$-27,99 — neteada con enero, no se inserta
        g(4,  "2026-01-28", "PedidosYa",            700.00,        "Delivery"),
        g(5,  "2026-02-06", "Red Uno - Internet",   37500.01,      "Servicios"),
        g(6,  "2026-02-14", "Mercado Pago Plus",    18399.00,      "Servicios"),
        g(7,  "2026-02-11", "La Anónima",           24100.00,      "Supermercado"),
        # Cuotas en curso (siguiente número)
        g(8,  "2025-12-19", "Eco Music - Guitarra", 107000.00, "Hobbies",           es_cuota=1, cuota_numero=2, cuota_total=3),
        g(9,  "2025-12-05", "Naldo Muebles",        38132.32,  "Hogar",             es_cuota=1, cuota_numero=3, cuota_total=6),
        g(10, "2025-12-05", "Naldo Muebles (2)",    12529.82,  "Hogar",             es_cuota=1, cuota_numero=3, cuota_total=6),
        g(11, "2025-12-03", "Mamut - Estantes",     14430.34,  "Hogar",             es_cuota=1, cuota_numero=4, cuota_total=6),
        g(12, "2025-10-01", "DiazHome - Decoración",28410.89,  "Hogar",             es_cuota=1, cuota_numero=6, cuota_total=6),
        g(13, "2025-11-03", "Pontecsa - Mesitas",   11592.18,  "Hogar",             es_cuota=1, cuota_numero=4, cuota_total=9),
        g(14, "2025-05-13", "Samsung - Celular",    67499.91,  "Electrónica",       es_cuota=1, cuota_numero=10, cuota_total=12),
    ]


# ─────────────────────────────────────────────────────────────────────────────
# DATOS — RESUMEN MARZO 2026  (pagado 01/04/2026)
# ─────────────────────────────────────────────────────────────────────────────

def items_marzo():
    r = "2026-03"
    fp = "2026-04-01"
    tc = TC[r]

    def g(sid_i, fc, desc, monto, cat, **kw):
        return dict(source_id=f"tarjeta_{r}_{sid_i:03d}", fecha_consumo=fc,
                    fecha_pago=fp, resumen_mes=r, descripcion=desc,
                    monto=monto, categoria=cat, **kw)

    return [
        # Nuevos
        g(1,  "2026-03-03", "Google One",            usd(2.49, r),  "Suscripciones", moneda="USD", monto_usd=2.49,  tc=tc),
        g(2,  "2026-03-09", "Claude.ai",             usd(20.0, r),  "Suscripciones", moneda="USD", monto_usd=20.0,  tc=tc),
        g(3,  "2026-03-09", "Spotify",               usd(3.85, r),  "Suscripciones", moneda="USD", monto_usd=3.85,  tc=tc),
        g(4,  "2026-03-08", "Google PictureThis",    usd(19.99, r), "Suscripciones", moneda="USD", monto_usd=19.99, tc=tc),
        g(5,  "2026-03-12", "Demasled - Iluminación",101659.17,     "Hogar"),
        g(6,  "2026-03-16", "Mercado Pago Plus",     18399.00,      "Servicios"),
        g(7,  "2026-02-04", "La Anónima",            24100.00,      "Supermercado"),
        # Nuevas cuotas
        g(8,  "2026-02-27", "Diplomatura UTN",       95000.00,  "Educación",         es_cuota=1, cuota_numero=1, cuota_total=12),
        g(9,  "2026-03-06", "Leutthe - Ropa",        50896.68,  "Ropa",              es_cuota=1, cuota_numero=1, cuota_total=3),
        # Cuotas en curso
        g(10, "2025-12-19", "Eco Music - Guitarra",  107000.00, "Hobbies",           es_cuota=1, cuota_numero=3, cuota_total=3),
        g(11, "2025-12-05", "Naldo Muebles",         38132.32,  "Hogar",             es_cuota=1, cuota_numero=4, cuota_total=6),
        g(12, "2025-12-05", "Naldo Muebles (2)",     12529.82,  "Hogar",             es_cuota=1, cuota_numero=4, cuota_total=6),
        g(13, "2025-12-03", "Mamut - Estantes",      14430.34,  "Hogar",             es_cuota=1, cuota_numero=5, cuota_total=6),
        g(14, "2025-11-03", "Pontecsa - Mesitas",    11592.18,  "Hogar",             es_cuota=1, cuota_numero=5, cuota_total=9),
        g(15, "2025-05-13", "Samsung - Celular",     67499.91,  "Electrónica",       es_cuota=1, cuota_numero=11, cuota_total=12),
        # DiazHome 6/6 fue la última (en Febrero) — no aparece en Marzo
        # Ferretería 9/9 fue la última (en Enero) — no aparece más
    ]


# ─────────────────────────────────────────────────────────────────────────────
# DATOS — RESUMEN MAYO 2026  (pagado 06/05/2026)
# ─────────────────────────────────────────────────────────────────────────────

def items_mayo():
    r = "2026-05"
    fp = "2026-05-06"
    tc = TC[r]

    def g(sid_i, fc, desc, monto, cat, **kw):
        return dict(source_id=f"tarjeta_{r}_{sid_i:03d}", fecha_consumo=fc,
                    fecha_pago=fp, resumen_mes=r, descripcion=desc,
                    monto=monto, categoria=cat, **kw)

    # Para cuotas sin fecha_consumo explícita, usamos fecha aproximada del resumen
    fc_approx = "2026-04-15"

    return [
        # Nuevos
        g(1,  "2026-04-03", "Google One",            usd(2.49, r),  "Suscripciones", moneda="USD", monto_usd=2.49,  tc=tc),
        g(2,  "2026-04-09", "Claude.ai",             usd(20.0, r),  "Suscripciones", moneda="USD", monto_usd=20.0,  tc=tc),
        g(3,  "2026-04-09", "Spotify",               usd(3.95, r),  "Suscripciones", moneda="USD", monto_usd=3.95,  tc=tc),
        g(4,  "2026-04-06", "Red Uno - Internet",    37798.88,      "Servicios"),
        # Temu — ignorado (devolución incluida, neto 0)
        # Mercado Pago Plus — neto 0 con devolución Temu, no se inserta
        g(5,  "2026-04-15", "La Anónima",            24100.00,      "Supermercado"),
        # Cuotas
        g(6,  "2026-03-12", "Demasled - Domótica",   5122.88,   "Hogar",             es_cuota=1, cuota_numero=2, cuota_total=9),
        g(7,  "2026-03-06", "Leutthe - Ropa",        50896.68,  "Ropa",              es_cuota=1, cuota_numero=2, cuota_total=3),
        g(8,  "2026-02-27", "Diplomatura UTN",       95000.00,  "Educación",         es_cuota=1, cuota_numero=2, cuota_total=12),
        g(9,  "2025-05-13", "Samsung - Celular",     67499.91,  "Electrónica",       es_cuota=1, cuota_numero=12, cuota_total=12),
        g(10, "2025-11-03", "Pontecsa - Mesitas",    11592.18,  "Hogar",             es_cuota=1, cuota_numero=6, cuota_total=9),
        g(11, "2025-12-03", "Mamut - Estantes",      14430.34,  "Hogar",             es_cuota=1, cuota_numero=6, cuota_total=6),
        g(12, "2025-12-05", "Naldo Muebles",         38132.32,  "Hogar",             es_cuota=1, cuota_numero=5, cuota_total=6),
        g(13, "2025-12-05", "Naldo Muebles (2)",     12529.82,  "Hogar",             es_cuota=1, cuota_numero=5, cuota_total=6),
    ]


# ─────────────────────────────────────────────────────────────────────────────
# CONFIG: vista_gastos
# ─────────────────────────────────────────────────────────────────────────────

def seed_config(conn):
    conn.execute(
        "INSERT OR IGNORE INTO app_config (clave, valor) VALUES ('vista_gastos', 'liquidez')"
    )
    conn.commit()
    print("  · config 'vista_gastos' = 'liquidez' (default)")


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main():
    print(f"\n{'='*60}")
    print(f"  Migrando: {DB_PATH}")
    print(f"{'='*60}\n")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")

    print("1. Migración de schema...")
    migrar_schema(conn)

    print("\n2. Categorías y formas de pago...")
    seed_categorias(conn)

    print("\n3. Config...")
    seed_config(conn)

    resúmenes = [
        ("ENERO 2026",  items_enero()),
        ("FEBRERO 2026", items_febrero()),
        ("MARZO 2026",  items_marzo()),
        ("MAYO 2026",   items_mayo()),
    ]

    total_ok = 0
    total_skip = 0

    print("\n4. Inserción de gastos de tarjeta...")
    for nombre, items in resúmenes:
        ok, skip = insertar(conn, items)
        total_ok += ok
        total_skip += skip
        print(f"   Resumen {nombre}: {ok} insertados, {skip} ya existían")

    print(f"\n{'='*60}")
    print(f"  TOTAL: {total_ok} gastos nuevos, {total_skip} duplicados ignorados")
    print(f"{'='*60}\n")

    conn.close()


if __name__ == "__main__":
    main()
