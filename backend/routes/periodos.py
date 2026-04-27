import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime, date
import database as db

router = APIRouter()


class CrearPeriodoRequest(BaseModel):
    fecha_inicio: str
    monto_ingreso: float


class UpdatePeriodoRequest(BaseModel):
    fecha_inicio: str
    fecha_fin: str | None = None
    monto_ingreso: float


@router.get("")
def listar_periodos():
    periodos = db.get_periodos()
    hoy = date.today().isoformat()
    resultado = []
    for p in periodos:
        fecha_fin = p["fecha_fin"] or hoy
        try:
            dias_total = (date.fromisoformat(fecha_fin) - date.fromisoformat(p["fecha_inicio"])).days
            dias_transcurridos = (date.today() - date.fromisoformat(p["fecha_inicio"])).days
        except Exception:
            dias_total = dias_transcurridos = 0

        total = db.get_total_periodo(p["id"])
        inversiones = db.get_inversiones_periodo(p["id"])
        label = f"Desde {p['fecha_inicio']}" + (" (actual)" if p["fecha_fin"] is None else "")
        resultado.append({
            **p,
            "label": label,
            "dias_total": max(dias_total, 1),
            "dias_transcurridos": max(min(dias_transcurridos, dias_total), 0),
            "total_gastos": total,
            "total_inversiones": inversiones,
            "es_actual": p["fecha_fin"] is None,
        })
    return resultado


@router.get("/actual")
def periodo_actual():
    p = db.get_periodo_actual()
    if not p:
        return None

    hoy = date.today().isoformat()
    try:
        dias_total = (date.today() - date.fromisoformat(p["fecha_inicio"])).days or 1
        dias_transcurridos = dias_total
    except Exception:
        dias_total = dias_transcurridos = 1

    total = db.get_total_periodo(p["id"])
    inversiones = db.get_inversiones_periodo(p["id"])
    por_cat = db.get_gastos_por_categoria_periodo(p["id"])
    presupuestos = db.get_presupuesto_categorias()
    objetivo = p["objetivo_ahorro"] or 0
    ahorro_real = (p["monto_ingreso"] or 0) - total

    # Período anterior para comparación
    todos = db.get_periodos()
    anterior = None
    for i, x in enumerate(todos):
        if x["id"] == p["id"] and i + 1 < len(todos):
            anterior = todos[i + 1]
            break

    total_anterior = db.get_total_periodo(anterior["id"]) if anterior else None

    return {
        **p,
        "dias_total": dias_total,
        "dias_transcurridos": dias_transcurridos,
        "total_gastos": total,
        "total_inversiones": inversiones,
        "ahorro_real": ahorro_real,
        "por_categoria": por_cat,
        "presupuestos": presupuestos,
        "total_anterior": total_anterior,
    }


@router.post("")
def crear_periodo(req: CrearPeriodoRequest):
    new_id = db.crear_periodo(req.fecha_inicio, req.monto_ingreso)
    return {"id": new_id, "ok": True}


@router.put("/{periodo_id}")
def actualizar_periodo(periodo_id: int, req: UpdatePeriodoRequest):
    db.update_periodo(periodo_id, req.fecha_inicio, req.fecha_fin, req.monto_ingreso)
    return {"ok": True}


@router.delete("/{periodo_id}")
def eliminar_periodo(periodo_id: int):
    db.delete_periodo(periodo_id)
    return {"ok": True}
