"""
Importa el CSV manual como fuente de verdad para el período histórico.
Borra gastos Nov 27 2025 – Mar 8 2026 y los reemplaza con el CSV manual.
"""
import csv, sys, sqlite3, os
from datetime import datetime

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(__file__))
import database as db

FNAME = os.path.join(os.path.dirname(__file__), "Hoja de cálculo sin título - Hoja 1.csv")
FECHA_INICIO = "2025-11-27"
FECHA_FIN    = "2026-03-08"

MAPEO_CATS = {
    "Deportes":       "Deporte",
    "Gimnasio":       "Deporte",
    "Supermercado":   "Alimentación",
    "Transferencia":  "Otros",
    "":               "A Clasificar",
}

def parsear_monto(s):
    s = s.strip().replace("$", "").replace(" ", "").replace(".", "").replace(",", ".")
    return float(s)

def parsear_fecha(s):
    return datetime.strptime(s.strip(), "%d/%m/%Y").strftime("%Y-%m-%d")


def main():
    db.init_db()

    # 1. Asegurar período Nov 27 (sueldo anterior al primer período cargado)
    periodos = {p["fecha_inicio"]: p for p in db.get_periodos()}
    if "2025-11-27" not in periodos:
        pid = db.crear_periodo("2025-11-27", 2798000)
        print(f"  Período creado: 2025-11-27  $2.798.000  (id={pid})")
    else:
        print("  Período 2025-11-27 ya existe, ok.")

    # 2. Borrar gastos del período histórico
    conn = sqlite3.connect(os.path.join(os.path.dirname(__file__), "gastos.db"))
    cur = conn.execute(
        "SELECT COUNT(*) FROM gastos WHERE fecha >= ? AND fecha <= ?",
        (FECHA_INICIO, FECHA_FIN)
    )
    n_borrar = cur.fetchone()[0]
    conn.execute(
        "DELETE FROM gastos WHERE fecha >= ? AND fecha <= ?",
        (FECHA_INICIO, FECHA_FIN)
    )
    conn.commit()
    conn.close()
    print(f"  Borrados {n_borrar} gastos del período histórico ({FECHA_INICIO} → {FECHA_FIN})")

    # 3. Leer CSV manual
    with open(FNAME, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    gastos = [r for r in rows if r["Tipo"] == "Gasto"]
    print(f"  Filas Tipo=Gasto en CSV: {len(gastos)}")

    # 4. Asegurar categorías nuevas en DB
    cats_db = set(db.get_categorias_gasto())
    nuevas = set()
    for r in gastos:
        cat = MAPEO_CATS.get(r["Categoría"].strip(), r["Categoría"].strip())
        if cat and cat not in cats_db and cat != "A Clasificar":
            nuevas.add(cat)
    if nuevas:
        conn2 = sqlite3.connect(os.path.join(os.path.dirname(__file__), "gastos.db"))
        for c in sorted(nuevas):
            conn2.execute("INSERT OR IGNORE INTO categorias (nombre) VALUES (?)", (c,))
            print(f"  Categoria nueva creada: {c}")
        conn2.commit()
        conn2.close()

    # 5. Importar
    insertados = 0
    errores = 0
    for i, r in enumerate(gastos):
        try:
            fecha = parsear_fecha(r["Fecha"])
            monto = parsear_monto(r["Monto"])
            desc  = r["Descripción"].strip()
            cat   = MAPEO_CATS.get(r["Categoría"].strip(), r["Categoría"].strip())
            if not cat:
                cat = "A Clasificar"
            source_id = f"manual_{fecha}_{i:04d}"

            ok = db.add_gasto(
                fecha=fecha,
                descripcion=desc,
                monto=monto,
                categoria=cat,
                fuente="manual_csv",
                source_id=source_id,
                ai_categorizado=False,
                ai_razon=None,
                forma_pago="Manual",
            )
            if ok:
                insertados += 1
        except Exception as e:
            print(f"  Error fila {i}: {r} → {e}")
            errores += 1

    print(f"\n  OK {insertados} gastos importados  |  {errores} errores")

    # 6. Resumen final
    conn3 = sqlite3.connect(os.path.join(os.path.dirname(__file__), "gastos.db"))
    conn3.row_factory = sqlite3.Row
    r2 = conn3.execute("SELECT MIN(fecha) mn, MAX(fecha) mx, COUNT(*) tot FROM gastos").fetchone()
    print(f"  DB ahora: {r2['tot']} gastos  ({r2['mn']} → {r2['mx']})")

    print("\n  Gastos por categoria (historico):")
    for row in conn3.execute(
        "SELECT categoria, COUNT(*) n, SUM(monto) total FROM gastos "
        "WHERE fecha >= ? AND fecha <= ? GROUP BY categoria ORDER BY total DESC",
        (FECHA_INICIO, FECHA_FIN)
    ).fetchall():
        print(f"    {row['n']:3d}  ${row['total']:>12,.0f}  {row['categoria']}".replace(",","."))
    conn3.close()


if __name__ == "__main__":
    main()
