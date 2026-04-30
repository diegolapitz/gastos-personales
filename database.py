import sqlite3
from datetime import datetime
from config import DB_PATH, CATEGORIAS_DEFAULT, FORMAS_PAGO_DEFAULT, CATEGORIA_INVERSION


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_conn()
    c = conn.cursor()

    c.executescript("""
        CREATE TABLE IF NOT EXISTS gastos (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha            TEXT    NOT NULL,
            descripcion      TEXT    NOT NULL,
            monto            REAL    NOT NULL,
            categoria        TEXT    NOT NULL,
            fuente           TEXT    DEFAULT 'telegram',
            categoria_override INTEGER DEFAULT 0,
            source_id        TEXT    UNIQUE,
            ai_categorizado  INTEGER DEFAULT 0,
            ai_razon         TEXT,
            forma_pago       TEXT
        );

        CREATE TABLE IF NOT EXISTS clasificacion_queue (
            gasto_id   INTEGER PRIMARY KEY REFERENCES gastos(id) ON DELETE CASCADE,
            enviado_en TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ingresos_pendientes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id   TEXT UNIQUE,
            fecha       TEXT NOT NULL,
            descripcion TEXT NOT NULL,
            monto       REAL NOT NULL,
            resuelto    INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS deudas (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha    TEXT NOT NULL,
            persona  TEXT NOT NULL,
            monto    REAL NOT NULL,
            tipo     TEXT NOT NULL,
            estado   TEXT DEFAULT 'abierta'
        );

        CREATE TABLE IF NOT EXISTS presupuesto (
            mes              TEXT PRIMARY KEY,
            monto_disponible REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS reglas_categorias (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            keyword   TEXT NOT NULL UNIQUE,
            categoria TEXT NOT NULL,
            orden     INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS categorias (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre         TEXT NOT NULL UNIQUE,
            excluir_gastos INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS formas_pago (
            id     INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS periodos (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha_inicio    TEXT NOT NULL,
            fecha_fin       TEXT,
            monto_ingreso   REAL,
            objetivo_ahorro REAL
        );

        CREATE TABLE IF NOT EXISTS presupuesto_categoria (
            categoria TEXT PRIMARY KEY,
            monto     REAL NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS app_config (
            clave TEXT PRIMARY KEY,
            valor TEXT NOT NULL
        );
    """)

    # Migraciones de columnas
    cols = [row[1] for row in c.execute("PRAGMA table_info(gastos)").fetchall()]
    if "forma_pago" not in cols:
        c.execute("ALTER TABLE gastos ADD COLUMN forma_pago TEXT")

    # Seed categorías
    for nombre in CATEGORIAS_DEFAULT:
        excluir = 1 if nombre == CATEGORIA_INVERSION else 0
        c.execute(
            "INSERT OR IGNORE INTO categorias (nombre, excluir_gastos) VALUES (?, ?)",
            (nombre, excluir),
        )

    # Seed formas de pago
    for nombre in FORMAS_PAGO_DEFAULT:
        c.execute("INSERT OR IGNORE INTO formas_pago (nombre) VALUES (?)", (nombre,))

    # Seed app_config
    defaults = {
        "umbral_sueldo": "3000000",
        "forma_pago_bot": "Efectivo",
    }
    for clave, valor in defaults.items():
        c.execute("INSERT OR IGNORE INTO app_config (clave, valor) VALUES (?, ?)", (clave, valor))

    # Seed presupuesto por categoría
    presupuestos_default = {
        "Alimentación": 400000,
        "Restaurantes": 250000,
        "Suscripciones": 80000,
        "Servicios": 120000,
        "Vivienda": 350000,
        "Compras": 150000,
        "Transporte": 60000,
        "Deporte": 80000,
        "Entretenimiento": 60000,
        "Salud": 40000,
        "Ropa": 80000,
        "Delivery": 30000,
        "Otros": 50000,
        "Electrónica": 50000,
    }
    for cat, monto in presupuestos_default.items():
        c.execute(
            "INSERT OR IGNORE INTO presupuesto_categoria (categoria, monto) VALUES (?, ?)",
            (cat, monto),
        )

    # Seed reglas
    c.execute("SELECT COUNT(*) FROM reglas_categorias")
    if c.fetchone()[0] == 0:
        c.executemany(
            "INSERT INTO reglas_categorias (keyword, categoria, orden) VALUES (?, ?, ?)",
            _REGLAS_COMPLETAS,
        )
    else:
        for kw, cat, orden in _REGLAS_COMPLETAS:
            c.execute(
                "INSERT OR IGNORE INTO reglas_categorias (keyword, categoria, orden) VALUES (?, ?, ?)",
                (kw, cat, orden),
            )

    conn.commit()
    conn.close()


_REGLAS_COMPLETAS = [
    ("bull market", "Ahorro/Inversión", 1),
    ("lapitz diego", "Ahorro/Inversión", 2),
    ("paola cristina", "Vivienda", 3),
    ("super", "Alimentación", 10),
    ("mercado", "Alimentación", 11),
    ("carnicería", "Alimentación", 12),
    ("verdulería", "Alimentación", 13),
    ("panadería", "Alimentación", 14),
    ("panaderia", "Alimentación", 15),
    ("clemente", "Alimentación", 16),
    ("carrefour", "Alimentación", 17),
    ("dia", "Alimentación", 18),
    ("coto", "Alimentación", 19),
    ("jumbo", "Alimentación", 20),
    ("disco", "Alimentación", 21),
    ("vea", "Alimentación", 22),
    ("walmart", "Alimentación", 23),
    ("kiosko", "Alimentación", 24),
    ("kiosco", "Alimentación", 25),
    ("almacen", "Alimentación", 26),
    ("almacén", "Alimentación", 27),
    ("todo en uno", "Alimentación", 28),
    ("sur market", "Alimentación", 29),
    ("nafta", "Transporte", 40),
    ("combustible", "Transporte", 41),
    ("uber", "Transporte", 42),
    ("remis", "Transporte", 43),
    ("colectivo", "Transporte", 44),
    ("ypf", "Transporte", 45),
    ("shell", "Transporte", 46),
    ("axion", "Transporte", 47),
    ("peaje", "Transporte", 48),
    ("estacionamiento", "Transporte", 49),
    ("cabify", "Transporte", 50),
    ("luz", "Servicios", 60),
    ("gas", "Servicios", 61),
    ("agua", "Servicios", 62),
    ("internet", "Servicios", 63),
    ("celular", "Servicios", 64),
    ("camuzzi", "Servicios", 65),
    ("red uno", "Servicios", 66),
    ("tuenti", "Servicios", 67),
    ("farmacia", "Salud", 70),
    ("farmacity", "Salud", 71),
    ("médico", "Salud", 72),
    ("doctor", "Salud", 73),
    ("droguería", "Salud", 74),
    ("cine", "Entretenimiento", 80),
    ("steam", "Entretenimiento", 81),
    ("teatro", "Entretenimiento", 82),
    ("museo", "Entretenimiento", 83),
    ("recital", "Entretenimiento", 84),
    ("padel", "Deporte", 90),
    ("cancha", "Deporte", 91),
    ("gimnasio", "Deporte", 92),
    ("gym", "Deporte", 93),
    ("nike", "Deporte", 94),
    ("adidas", "Deporte", 95),
    ("ropa", "Ropa", 100),
    ("zapatillas", "Ropa", 101),
    ("restaurant", "Restaurantes", 110),
    ("resto", "Restaurantes", 111),
    ("pizza", "Restaurantes", 112),
    ("delivery", "Restaurantes", 113),
    ("pedidosya", "Restaurantes", 114),
    ("rappi", "Restaurantes", 115),
    ("burger", "Restaurantes", 116),
    ("mcdonalds", "Restaurantes", 117),
    ("mcdonald", "Restaurantes", 118),
    ("subway", "Restaurantes", 119),
    ("starbucks", "Restaurantes", 120),
    ("cafe", "Restaurantes", 121),
    ("café", "Restaurantes", 122),
    ("chicho", "Restaurantes", 123),
    ("spotify", "Suscripciones", 130),
    ("netflix", "Suscripciones", 131),
    ("disney", "Suscripciones", 132),
    ("openai", "Suscripciones", 133),
    ("google", "Suscripciones", 134),
    ("microsoft", "Suscripciones", 135),
    ("apple", "Suscripciones", 136),
    ("amazon", "Suscripciones", 137),
    ("youtube", "Suscripciones", 138),
    ("hbo", "Suscripciones", 139),
    ("paramount", "Suscripciones", 140),
    ("star+", "Suscripciones", 141),
    ("ilovepdf", "Suscripciones", 142),
    ("chess", "Suscripciones", 143),
    ("alquiler", "Vivienda", 150),
    ("expensas", "Vivienda", 151),
    ("consorcio", "Vivienda", 152),
    ("home store", "Compras", 160),
    ("multicompras", "Compras", 161),
    ("muebles", "Compras", 162),
    ("transferencia enviada", "A Clasificar", 999),
]


# ── app_config ────────────────────────────────────────────────────────────────

def get_config(clave: str, default=None):
    conn = get_conn()
    row = conn.execute("SELECT valor FROM app_config WHERE clave=?", (clave,)).fetchone()
    conn.close()
    return row["valor"] if row else default


def set_config(clave: str, valor: str):
    conn = get_conn()
    conn.execute(
        "INSERT OR REPLACE INTO app_config (clave, valor) VALUES (?, ?)", (clave, valor)
    )
    conn.commit()
    conn.close()


def get_all_config() -> dict:
    conn = get_conn()
    rows = conn.execute("SELECT clave, valor FROM app_config").fetchall()
    conn.close()
    return {r["clave"]: r["valor"] for r in rows}


# ── Períodos ──────────────────────────────────────────────────────────────────

def get_periodos() -> list:
    conn = get_conn()
    rows = conn.execute("SELECT * FROM periodos ORDER BY fecha_inicio DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_periodo_actual() -> dict | None:
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM periodos WHERE fecha_fin IS NULL ORDER BY fecha_inicio DESC LIMIT 1"
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_periodo_por_id(periodo_id: int) -> dict | None:
    conn = get_conn()
    row = conn.execute("SELECT * FROM periodos WHERE id=?", (periodo_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def crear_periodo(fecha_inicio: str, monto_ingreso: float) -> int:
    """Cierra el período anterior y crea uno nuevo. Retorna el nuevo id."""
    objetivo = round(monto_ingreso * 0.5)
    conn = get_conn()
    conn.execute(
        "UPDATE periodos SET fecha_fin=? WHERE fecha_fin IS NULL",
        (fecha_inicio,),
    )
    cur = conn.execute(
        "INSERT INTO periodos (fecha_inicio, monto_ingreso, objetivo_ahorro) VALUES (?, ?, ?)",
        (fecha_inicio, monto_ingreso, objetivo),
    )
    new_id = cur.lastrowid
    conn.commit()
    conn.close()
    return new_id


def update_periodo(periodo_id: int, fecha_inicio: str, fecha_fin: str | None, monto_ingreso: float):
    objetivo = round(monto_ingreso * 0.5)
    conn = get_conn()
    conn.execute(
        "UPDATE periodos SET fecha_inicio=?, fecha_fin=?, monto_ingreso=?, objetivo_ahorro=? WHERE id=?",
        (fecha_inicio, fecha_fin or None, monto_ingreso, objetivo, periodo_id),
    )
    conn.commit()
    conn.close()


def delete_periodo(periodo_id: int):
    conn = get_conn()
    conn.execute("DELETE FROM periodos WHERE id=?", (periodo_id,))
    conn.commit()
    conn.close()


def get_gastos_periodo(periodo_id: int) -> list:
    periodo = get_periodo_por_id(periodo_id)
    if not periodo:
        return []
    fecha_inicio = periodo["fecha_inicio"]
    fecha_fin = periodo["fecha_fin"] or "9999-12-31"
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM gastos WHERE fecha >= ? AND fecha < ? ORDER BY fecha DESC",
        (fecha_inicio, fecha_fin),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_total_periodo(periodo_id: int) -> float:
    """Total de gastos del período, excluyendo Ahorro/Inversión."""
    excluidas = _excluidas_de_gastos()
    gastos = get_gastos_periodo(periodo_id)
    return sum(g["monto"] for g in gastos if g["categoria"] not in excluidas)


def get_inversiones_periodo(periodo_id: int) -> float:
    gastos = get_gastos_periodo(periodo_id)
    return sum(g["monto"] for g in gastos if g["categoria"] == CATEGORIA_INVERSION)


def get_gastos_por_categoria_periodo(periodo_id: int) -> dict:
    excluidas = _excluidas_de_gastos()
    gastos = get_gastos_periodo(periodo_id)
    result = {}
    for g in gastos:
        if g["categoria"] not in excluidas:
            result[g["categoria"]] = result.get(g["categoria"], 0) + g["monto"]
    return dict(sorted(result.items(), key=lambda x: x[1], reverse=True))


# ── Presupuesto por categoría ─────────────────────────────────────────────────

def get_presupuesto_categorias() -> dict:
    conn = get_conn()
    rows = conn.execute("SELECT categoria, monto FROM presupuesto_categoria").fetchall()
    conn.close()
    return {r["categoria"]: r["monto"] for r in rows}


def set_presupuesto_categoria(categoria: str, monto: float):
    conn = get_conn()
    conn.execute(
        "INSERT OR REPLACE INTO presupuesto_categoria (categoria, monto) VALUES (?, ?)",
        (categoria, monto),
    )
    conn.commit()
    conn.close()


# ── Categorías ────────────────────────────────────────────────────────────────

def get_categorias() -> list:
    conn = get_conn()
    rows = conn.execute("SELECT nombre FROM categorias ORDER BY nombre").fetchall()
    conn.close()
    return [r["nombre"] for r in rows]


def get_categorias_completo() -> list:
    conn = get_conn()
    rows = conn.execute("SELECT nombre, excluir_gastos FROM categorias ORDER BY nombre").fetchall()
    conn.close()
    return [{"nombre": r["nombre"], "excluir_gastos": bool(r["excluir_gastos"])} for r in rows]


def get_categorias_gasto() -> list:
    conn = get_conn()
    rows = conn.execute(
        "SELECT nombre FROM categorias WHERE excluir_gastos=0 ORDER BY nombre"
    ).fetchall()
    conn.close()
    return [r["nombre"] for r in rows]


def add_categoria(nombre: str, excluir_gastos: bool = False):
    conn = get_conn()
    conn.execute(
        "INSERT OR IGNORE INTO categorias (nombre, excluir_gastos) VALUES (?, ?)",
        (nombre, int(excluir_gastos)),
    )
    conn.commit()
    conn.close()


def delete_categoria(nombre: str):
    conn = get_conn()
    conn.execute("DELETE FROM categorias WHERE nombre=?", (nombre,))
    conn.commit()
    conn.close()


def _excluidas_de_gastos() -> list:
    conn = get_conn()
    rows = conn.execute("SELECT nombre FROM categorias WHERE excluir_gastos=1").fetchall()
    conn.close()
    return [r["nombre"] for r in rows]


# ── Formas de pago ────────────────────────────────────────────────────────────

def get_formas_pago() -> list:
    conn = get_conn()
    rows = conn.execute("SELECT nombre FROM formas_pago ORDER BY id").fetchall()
    conn.close()
    return [r["nombre"] for r in rows]


def add_forma_pago(nombre: str):
    conn = get_conn()
    conn.execute("INSERT OR IGNORE INTO formas_pago (nombre) VALUES (?)", (nombre,))
    conn.commit()
    conn.close()


def delete_forma_pago(nombre: str):
    conn = get_conn()
    conn.execute("DELETE FROM formas_pago WHERE nombre=?", (nombre,))
    conn.commit()
    conn.close()


# ── Gastos ────────────────────────────────────────────────────────────────────

def add_gasto(fecha, descripcion, monto, categoria, fuente="telegram",
              source_id=None, ai_categorizado=False, ai_razon=None, forma_pago=None):
    conn = get_conn()
    try:
        conn.execute(
            """INSERT INTO gastos
               (fecha, descripcion, monto, categoria, fuente, source_id,
                ai_categorizado, ai_razon, forma_pago)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (fecha, descripcion, monto, categoria, fuente,
             source_id, int(ai_categorizado), ai_razon, forma_pago),
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()


def get_gastos_mes(mes: str):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM gastos WHERE fecha LIKE ? ORDER BY fecha DESC",
        (f"{mes}%",),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_total_mes(mes: str) -> float:
    excluidas = _excluidas_de_gastos()
    placeholders = ",".join("?" * len(excluidas)) if excluidas else "'__ninguna__'"
    query = f"SELECT COALESCE(SUM(monto), 0) FROM gastos WHERE fecha LIKE ? AND categoria NOT IN ({placeholders})"
    conn = get_conn()
    row = conn.execute(query, [f"{mes}%"] + excluidas).fetchone()
    conn.close()
    return row[0]


def get_inversiones_mes(mes: str) -> float:
    conn = get_conn()
    row = conn.execute(
        "SELECT COALESCE(SUM(monto), 0) FROM gastos WHERE fecha LIKE ? AND categoria=?",
        (f"{mes}%", CATEGORIA_INVERSION),
    ).fetchone()
    conn.close()
    return row[0]


def get_gastos_por_categoria(mes: str) -> dict:
    excluidas = _excluidas_de_gastos()
    placeholders = ",".join("?" * len(excluidas)) if excluidas else "'__ninguna__'"
    query = f"""SELECT categoria, SUM(monto) as total FROM gastos
                WHERE fecha LIKE ? AND categoria NOT IN ({placeholders})
                GROUP BY categoria ORDER BY total DESC"""
    conn = get_conn()
    rows = conn.execute(query, [f"{mes}%"] + excluidas).fetchall()
    conn.close()
    return {r["categoria"]: r["total"] for r in rows}


def get_ultimos_gastos(n=10) -> list:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM gastos ORDER BY fecha DESC, id DESC LIMIT ?", (n,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_gasto(gasto_id: int, categoria: str = None, forma_pago: str = None, monto: float = None):
    conn = get_conn()
    if categoria:
        conn.execute(
            "UPDATE gastos SET categoria=?, categoria_override=1 WHERE id=?",
            (categoria, gasto_id),
        )
    if forma_pago:
        conn.execute(
            "UPDATE gastos SET forma_pago=? WHERE id=?",
            (forma_pago, gasto_id),
        )
    if monto is not None:
        conn.execute(
            "UPDATE gastos SET monto=? WHERE id=?",
            (monto, gasto_id),
        )
    conn.commit()
    conn.close()


def update_gasto_categoria(gasto_id: int, categoria: str):
    update_gasto(gasto_id, categoria=categoria)


def delete_gasto(gasto_id: int):
    conn = get_conn()
    conn.execute("DELETE FROM gastos WHERE id=?", (gasto_id,))
    conn.commit()
    conn.close()


# ── Ingresos pendientes (devoluciones / transferencias recibidas) ──────────────

def add_ingreso_pendiente(source_id: str, fecha: str, descripcion: str, monto: float):
    conn = get_conn()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO ingresos_pendientes (source_id, fecha, descripcion, monto) VALUES (?,?,?,?)",
            (source_id, fecha, descripcion, monto),
        )
        conn.commit()
    finally:
        conn.close()


def get_ingresos_pendientes() -> list:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM ingresos_pendientes WHERE resuelto=0 ORDER BY fecha DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def resolver_ingreso(ingreso_id: int, gasto_id_referencia: int | None, categoria: str, monto_neto: float | None = None):
    """
    Marca el ingreso como resuelto.
    Si hay gasto de referencia y monto_neto, actualiza el monto de ese gasto.
    Si no, registra el ingreso como descuento en los gastos del período (monto negativo).
    """
    conn = get_conn()
    ing = conn.execute("SELECT * FROM ingresos_pendientes WHERE id=?", (ingreso_id,)).fetchone()
    if not ing:
        conn.close()
        return

    if gasto_id_referencia and monto_neto is not None:
        conn.execute("UPDATE gastos SET monto=? WHERE id=?", (monto_neto, gasto_id_referencia))
    else:
        # Registrar como gasto negativo (descuenta del total del período)
        conn.execute(
            """INSERT OR IGNORE INTO gastos (fecha, descripcion, monto, categoria, fuente, source_id)
               VALUES (?,?,?,?,?,?)""",
            (ing["fecha"], ing["descripcion"], -ing["monto"], categoria, "reintegro", ing["source_id"]),
        )

    conn.execute("UPDATE ingresos_pendientes SET resuelto=1 WHERE id=?", (ingreso_id,))
    conn.commit()
    conn.close()


def source_id_en_pendientes(source_id: str) -> bool:
    conn = get_conn()
    r = conn.execute("SELECT 1 FROM ingresos_pendientes WHERE source_id=?", (source_id,)).fetchone()
    conn.close()
    return r is not None


def recategorizar_todo() -> int:
    from categorizer import categorizar_por_reglas
    conn = get_conn()
    gastos = conn.execute(
        "SELECT id, descripcion FROM gastos WHERE categoria_override=0"
    ).fetchall()
    count = 0
    for g in gastos:
        cat = categorizar_por_reglas(g["descripcion"])
        if cat:
            conn.execute(
                "UPDATE gastos SET categoria=?, ai_categorizado=0, ai_razon=NULL WHERE id=?",
                (cat, g["id"]),
            )
            count += 1
    conn.commit()
    conn.close()
    return count


def source_ids_existentes() -> set:
    conn = get_conn()
    rows = conn.execute(
        "SELECT source_id FROM gastos WHERE source_id IS NOT NULL"
    ).fetchall()
    conn.close()
    return {r["source_id"] for r in rows}


# ── Deudas ────────────────────────────────────────────────────────────────────

def add_deuda(fecha, persona, monto, tipo):
    conn = get_conn()
    conn.execute(
        "INSERT INTO deudas (fecha, persona, monto, tipo) VALUES (?, ?, ?, ?)",
        (fecha, persona, monto, tipo),
    )
    conn.commit()
    conn.close()


def get_deudas_abiertas() -> list:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM deudas WHERE estado != 'cerrada' ORDER BY fecha DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_todas_deudas() -> list:
    conn = get_conn()
    rows = conn.execute("SELECT * FROM deudas ORDER BY fecha DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def resolver_deuda(persona: str, monto_devuelto: float) -> str:
    conn = get_conn()
    deudas = conn.execute(
        "SELECT * FROM deudas WHERE persona=? AND estado != 'cerrada' ORDER BY fecha ASC",
        (persona,),
    ).fetchall()
    if not deudas:
        conn.close()
        return f"No encontré deudas abiertas con {persona}."
    pendiente = monto_devuelto
    msgs = []
    for d in deudas:
        if pendiente <= 0:
            break
        if d["monto"] <= pendiente:
            conn.execute("UPDATE deudas SET estado='cerrada' WHERE id=?", (d["id"],))
            pendiente -= d["monto"]
            msgs.append(f"Deuda ${d['monto']:,.0f} cerrada.")
        else:
            nuevo = d["monto"] - pendiente
            conn.execute(
                "UPDATE deudas SET monto=?, estado='parcial' WHERE id=?",
                (nuevo, d["id"]),
            )
            msgs.append(f"Deuda reducida a ${nuevo:,.0f}.")
            pendiente = 0
    conn.commit()
    conn.close()
    return " ".join(msgs)


def cerrar_deuda(deuda_id: int):
    conn = get_conn()
    conn.execute("UPDATE deudas SET estado='cerrada' WHERE id=?", (deuda_id,))
    conn.commit()
    conn.close()


# ── Presupuesto (legacy - bot) ────────────────────────────────────────────────

def set_presupuesto(mes: str, monto: float):
    conn = get_conn()
    conn.execute(
        "INSERT OR REPLACE INTO presupuesto (mes, monto_disponible) VALUES (?, ?)",
        (mes, monto),
    )
    conn.commit()
    conn.close()


def get_presupuesto(mes: str) -> float | None:
    conn = get_conn()
    row = conn.execute(
        "SELECT monto_disponible FROM presupuesto WHERE mes=?", (mes,)
    ).fetchone()
    conn.close()
    return row["monto_disponible"] if row else None


def get_historial_presupuestos() -> list:
    conn = get_conn()
    rows = conn.execute("SELECT * FROM presupuesto ORDER BY mes DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Reglas ────────────────────────────────────────────────────────────────────

def get_reglas() -> list:
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM reglas_categorias ORDER BY orden ASC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def upsert_regla(keyword: str, categoria: str, orden: int):
    conn = get_conn()
    conn.execute(
        """INSERT INTO reglas_categorias (keyword, categoria, orden) VALUES (?, ?, ?)
           ON CONFLICT(keyword) DO UPDATE SET categoria=excluded.categoria, orden=excluded.orden""",
        (keyword, categoria, orden),
    )
    conn.commit()
    conn.close()


def delete_regla(regla_id: int):
    conn = get_conn()
    conn.execute("DELETE FROM reglas_categorias WHERE id=?", (regla_id,))
    conn.commit()
    conn.close()


# ── Cola de clasificación por Telegram ───────────────────────────────────────

def enqueue_clasificacion(gasto_id: int):
    from datetime import datetime
    conn = get_conn()
    conn.execute(
        "INSERT OR IGNORE INTO clasificacion_queue (gasto_id, enviado_en) VALUES (?, ?)",
        (gasto_id, datetime.now().isoformat()),
    )
    conn.commit()
    conn.close()


def get_next_clasificacion() -> dict | None:
    conn = get_conn()
    row = conn.execute(
        """SELECT g.* FROM clasificacion_queue q
           JOIN gastos g ON g.id = q.gasto_id
           ORDER BY q.enviado_en ASC LIMIT 1"""
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def dequeue_clasificacion(gasto_id: int):
    conn = get_conn()
    conn.execute("DELETE FROM clasificacion_queue WHERE gasto_id=?", (gasto_id,))
    conn.commit()
    conn.close()


def count_clasificacion_queue() -> int:
    conn = get_conn()
    n = conn.execute("SELECT COUNT(*) FROM clasificacion_queue").fetchone()[0]
    conn.close()
    return n
