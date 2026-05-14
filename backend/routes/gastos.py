import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
import database as db
from importer_mp import limpiar_nombre

router = APIRouter()


def enriquecer(g: dict) -> dict:
    return {**g, "nombre": limpiar_nombre(g["descripcion"])}


@router.get("")
def listar_gastos(
    periodo_id: Optional[int] = None,
    categoria: Optional[str] = None,
    forma_pago: Optional[str] = None,
    buscar: Optional[str] = None,
    mes: Optional[str] = None,
    mes_consumo: Optional[str] = None,
    monto_min: Optional[float] = None,
    monto_max: Optional[float] = None,
):
    if mes_consumo:
        gastos = db.get_gastos_por_consumo(mes_consumo)
    elif periodo_id == 0:
        gastos = db.get_todos_gastos()
    elif periodo_id:
        gastos = db.get_gastos_periodo(periodo_id)
    elif mes:
        gastos = db.get_gastos_mes(mes)
    else:
        p = db.get_periodo_actual()
        gastos = db.get_gastos_periodo(p["id"]) if p else []

    if categoria:
        cats = [c.strip() for c in categoria.split(",")]
        gastos = [g for g in gastos if g["categoria"] in cats]
    if forma_pago:
        gastos = [g for g in gastos if g.get("forma_pago") == forma_pago]
    if buscar:
        buscar_lower = buscar.lower()
        gastos = [g for g in gastos if buscar_lower in g["descripcion"].lower()]
    if monto_min is not None:
        gastos = [g for g in gastos if g["monto"] >= monto_min]
    if monto_max is not None:
        gastos = [g for g in gastos if g["monto"] <= monto_max]

    return [enriquecer(g) for g in gastos]


@router.get("/recientes")
def recientes(n: int = 10):
    return [enriquecer(g) for g in db.get_ultimos_gastos(n)]


@router.put("/{gasto_id}")
def actualizar_gasto(gasto_id: int, body: dict):
    categoria = body.get("categoria")
    forma_pago = body.get("forma_pago")
    monto = body.get("monto")
    if not categoria and not forma_pago and monto is None:
        raise HTTPException(400, "Nada que actualizar")
    db.update_gasto(gasto_id, categoria=categoria, forma_pago=forma_pago, monto=monto)
    return {"ok": True}


@router.delete("/{gasto_id}")
def eliminar_gasto(gasto_id: int):
    db.delete_gasto(gasto_id)
    return {"ok": True}
