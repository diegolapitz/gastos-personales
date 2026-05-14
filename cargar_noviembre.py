"""
Carga resumen de tarjeta Noviembre 2025 (pagado 01/12/2025).
Ejecutar: python cargar_noviembre.py
"""
import sys, os, sqlite3
sys.path.insert(0, os.path.dirname(__file__))
from config import DB_PATH

FORMA_PAGO = "Tarjeta Crédito"
R = "2025-11"
FP = "2025-12-01"
TC = 1050.0  # estimado MEP nov-2025

def usd(monto):
    return round(monto * TC, 2)

def g(i, fc, desc, monto, cat, cuota_n=None, cuota_t=None, moneda="ARS", monto_usd=None):
    return dict(
        source_id=f"tarjeta_{R}_{i:03d}",
        fecha_consumo=fc,
        fecha_pago=FP,
        resumen_mes=R,
        descripcion=desc,
        monto=monto,
        categoria=cat,
        es_cuota=1 if cuota_n else 0,
        cuota_numero=cuota_n,
        cuota_total=cuota_t,
        moneda=moneda,
        monto_usd=monto_usd,
        tc=TC if monto_usd else None,
    )

ITEMS = [
    # Nuevos del período
    g(1,  "2025-11-09", "Spotify",                       usd(3.83),    "Suscripciones",    moneda="USD", monto_usd=3.83),
    g(2,  "2025-11-13", "Flybondi",                      38000.00,     "Transporte/Viajes"),
    g(3,  "2025-11-13", "Flybondi a bordo",               4000.00,     "Transporte/Viajes"),
    g(4,  "2025-11-14", "AEP Ezeiza - Diarios",          37300.00,     "Vacaciones"),
    g(5,  "2025-11-15", "Netflix",                       18118.49,     "Suscripciones"),
    g(6,  "2025-11-15", "Mercado Pago Plus",             18399.00,     "Servicios"),
    g(7,  "2025-11-18", "Camping Center",                36700.00,     "Vacaciones"),
    g(8,  "2025-11-18", "Constantino Hostel",           177597.00,     "Vacaciones"),
    g(9,  "2025-11-20", "Chaltenos",                     48500.00,     "Vacaciones"),
    g(10, "2025-11-20", "TAQSA",                         70000.00,     "Vacaciones"),
    g(11, "2025-11-21", "Mamuschka",                     30700.00,     "Vacaciones"),
    g(12, "2025-11-23", "BuenasArtes",                   22050.00,     "Vacaciones"),
    g(13, "2025-11-23", "Coraza",                        65820.00,     "Vacaciones"),
    g(14, "2025-11-25", "Flybondi",                      38000.00,     "Transporte/Viajes"),
    g(15, "2025-11-26", "PedidosYa",                     22560.00,     "Delivery"),
    # Cuotas en curso
    g(16, "2025-03-18", "2Productos - Freidora de aire", 19303.22,     "Electrónica",      cuota_n=9,  cuota_t=9),
    g(17, "2025-05-13", "Samsung - Celular",             67499.91,     "Electrónica",      cuota_n=7,  cuota_t=12),
    g(18, "2025-05-23", "Ferretería",                    11980.65,     "A Clasificar",     cuota_n=7,  cuota_t=9),
    g(19, "2025-06-27", "Aerolíneas Argentinas",         31541.31,     "Transporte/Viajes",cuota_n=5,  cuota_t=6),
    g(20, "2025-07-01", "Naldo Muebles",                 97999.83,     "Hogar",            cuota_n=5,  cuota_t=6),
    g(21, "2025-09-23", "MercadoLibre - Zapatillas",     28223.21,     "Ropa",             cuota_n=3,  cuota_t=3),
    g(22, "2025-09-25", "Suden Patagonia - Ropa",        17000.00,     "Ropa",             cuota_n=3,  cuota_t=3),
    g(23, "2025-10-01", "DiazHome - Decoración",         28410.89,     "Hogar",            cuota_n=3,  cuota_t=6),
    g(24, "2025-10-01", "MercadoLibre - Mesita",         63801.66,     "Hogar",            cuota_n=3,  cuota_t=3),
    g(25, "2025-10-12", "Market Pto Madryn",             23067.60,     "Supermercado",     cuota_n=2,  cuota_t=3),
    g(26, "2025-11-03", "Pontecsa - Mesitas",            11592.25,     "Hogar",            cuota_n=1,  cuota_t=9),
    g(27, "2025-11-08", "Flybondi",                      58926.83,     "Transporte/Viajes",cuota_n=1,  cuota_t=3),
    g(28, "2025-11-14", "Travel Bag Riñonera",           17000.00,     "Ropa",             cuota_n=1,  cuota_t=3),
    g(29, "2025-11-25", "ShopGallery",                   28050.00,     "Vacaciones",       cuota_n=1,  cuota_t=3),
    # MercadoLibre devolución -$63.801,68 → neteada, no se inserta
    # DXElectronica compra + devolución → se netean, no se insertan
]

def main():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")

    # 1. Borrar el agregado viejo
    old = conn.execute("SELECT id, monto, descripcion FROM gastos WHERE id=647").fetchone()
    if old:
        print(f"Borrando agregado viejo: id={old['id']} ${old['monto']:,.0f} '{old['descripcion']}'")
        conn.execute("DELETE FROM gastos WHERE id=647")
    else:
        print("id=647 no encontrado (ya borrado)")

    # 2. Actualizar ShopGallery en resúmenes posteriores a 'Vacaciones'
    upd = conn.execute("""
        UPDATE gastos SET categoria='Vacaciones'
        WHERE descripcion LIKE '%ShopGallery%' AND fuente='tarjeta_mp'
    """)
    if upd.rowcount:
        print(f"Actualizado ShopGallery -> Vacaciones en {upd.rowcount} fila(s) previas")

    # 3. Insertar items
    ok = skip = 0
    for it in ITEMS:
        try:
            conn.execute("""
                INSERT INTO gastos
                    (fecha, descripcion, monto, categoria, fuente, source_id,
                     forma_pago, categoria_override,
                     fecha_consumo, fecha_pago, es_cuota, cuota_numero, cuota_total,
                     resumen_mes, moneda, monto_usd, tc_aplicado)
                VALUES (?,?,?,?,?,?,?,?, ?,?,?,?,?, ?,?,?,?)
            """, (
                it["fecha_pago"], it["descripcion"], it["monto"], it["categoria"],
                "tarjeta_mp", it["source_id"], FORMA_PAGO, 1,
                it["fecha_consumo"], it["fecha_pago"],
                it["es_cuota"], it.get("cuota_numero"), it.get("cuota_total"),
                it["resumen_mes"], it["moneda"], it.get("monto_usd"), it.get("tc"),
            ))
            ok += 1
        except sqlite3.IntegrityError:
            skip += 1

    conn.commit()

    total = conn.execute(
        "SELECT SUM(monto) FROM gastos WHERE resumen_mes=? AND fuente='tarjeta_mp'", (R,)
    ).fetchone()[0]

    conn.close()
    print(f"\n{ok} insertados, {skip} ya existían")
    print(f"Total resumen {R}: ${total:,.0f} ARS")

if __name__ == "__main__":
    main()
