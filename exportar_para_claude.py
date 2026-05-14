"""
Exporta los gastos a un CSV limpio para análisis en Claude web.
Ejecutar: python exportar_para_claude.py
Genera: gastos_export.csv en el mismo directorio.
"""

import sys, os, csv
sys.path.insert(0, os.path.dirname(__file__))
import database as db
from importer_mp import limpiar_nombre
from datetime import date

def main():
    conn = db.get_conn()

    # Traer períodos para etiquetar cada gasto
    periodos = conn.execute(
        "SELECT id, fecha_inicio, fecha_fin, monto_ingreso FROM periodos ORDER BY fecha_inicio"
    ).fetchall()

    def periodo_de(fecha):
        for p in periodos:
            fi = p["fecha_inicio"] or ""
            ff = p["fecha_fin"] or "9999-12-31"
            if fi <= fecha < ff:
                return p["fecha_inicio"][:7] if fi else "hist"
        return ""

    # Traer todos los gastos relevantes
    rows = conn.execute("""
        SELECT
            id,
            COALESCE(fecha_consumo, fecha)  AS fecha_real,
            fecha                           AS fecha_pago,
            fecha_consumo,
            descripcion,
            monto,
            categoria,
            forma_pago,
            fuente,
            es_cuota,
            cuota_numero,
            cuota_total,
            resumen_mes,
            moneda,
            monto_usd,
            tc_aplicado
        FROM gastos
        ORDER BY fecha_real ASC, id ASC
    """).fetchall()

    outfile = os.path.join(os.path.dirname(__file__), "gastos_export.csv")

    with open(outfile, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow([
            "id", "fecha_consumo", "fecha_pago_periodo",
            "descripcion", "monto_ars",
            "categoria", "forma_pago", "fuente",
            "es_cuota", "cuota", "resumen_mes",
            "moneda", "monto_usd", "tc",
            "periodo_sueldo",
        ])
        for r in rows:
            nombre = limpiar_nombre(r["descripcion"])
            cuota = f'{r["cuota_numero"]}/{r["cuota_total"]}' if r["es_cuota"] else ""
            periodo_label = periodo_de(r["fecha_pago"] or "")
            w.writerow([
                r["id"],
                r["fecha_real"],
                r["fecha_pago"],
                nombre,
                round(r["monto"]),
                r["categoria"],
                r["forma_pago"] or "",
                r["fuente"],
                1 if r["es_cuota"] else 0,
                cuota,
                r["resumen_mes"] or "",
                r["moneda"] or "ARS",
                r["monto_usd"] or "",
                r["tc_aplicado"] or "",
                periodo_label,
            ])

    n = len(rows)
    print(f"Exportado: {outfile}")
    print(f"Total filas: {n}")

    # Resumen rápido por categoría
    print("\n--- Resumen por categoría (top 15) ---")
    cats = {}
    for r in rows:
        if r["monto"] > 0:
            cats[r["categoria"]] = cats.get(r["categoria"], 0) + r["monto"]
    for cat, total in sorted(cats.items(), key=lambda x: x[1], reverse=True)[:15]:
        print(f"  {cat:<25} ${total:>12,.0f}")

    conn.close()

if __name__ == "__main__":
    main()
