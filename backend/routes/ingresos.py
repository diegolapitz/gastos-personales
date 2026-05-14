import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from fastapi import APIRouter, HTTPException
import database as db
from importer_mp import limpiar_nombre

router = APIRouter()


@router.get("")
def listar_ingresos():
    rows = db.get_ingresos_pendientes()
    return [
        {**r, "nombre": limpiar_nombre(r["descripcion"]), "_tipo": "ingreso"}
        for r in rows
    ]


@router.post("/{ingreso_id}/resolver")
def resolver(ingreso_id: int):
    conn = db.get_conn()
    row = conn.execute("SELECT 1 FROM ingresos_pendientes WHERE id=?", (ingreso_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Ingreso no encontrado")
    conn.execute("UPDATE ingresos_pendientes SET resuelto=1 WHERE id=?", (ingreso_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@router.post("/{ingreso_id}/al-periodo")
def al_periodo(ingreso_id: int):
    conn = db.get_conn()
    ing = conn.execute("SELECT * FROM ingresos_pendientes WHERE id=?", (ingreso_id,)).fetchone()
    if not ing:
        conn.close()
        raise HTTPException(404, "Ingreso no encontrado")
    periodo = conn.execute(
        "SELECT * FROM periodos WHERE fecha_inicio <= ? AND (fecha_fin IS NULL OR fecha_fin > ?) ORDER BY fecha_inicio DESC LIMIT 1",
        (ing["fecha"], ing["fecha"]),
    ).fetchone()
    if periodo:
        nuevo = (periodo["monto_ingreso"] or 0) + ing["monto"]
        conn.execute("UPDATE periodos SET monto_ingreso=? WHERE id=?", (nuevo, periodo["id"]))
    conn.execute("UPDATE ingresos_pendientes SET resuelto=1 WHERE id=?", (ingreso_id,))
    conn.commit()
    conn.close()
    return {"ok": True}
