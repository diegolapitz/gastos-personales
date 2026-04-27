import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from fastapi import APIRouter
from pydantic import BaseModel
import database as db

router = APIRouter()


@router.get("")
def get_presupuestos():
    return db.get_presupuesto_categorias()


@router.put("/{categoria}")
def set_presupuesto(categoria: str, body: dict):
    monto = float(body.get("monto", 0))
    db.set_presupuesto_categoria(categoria, monto)
    return {"ok": True}


@router.put("")
def set_todos(body: dict):
    """Guarda un dict completo {categoria: monto}."""
    for cat, monto in body.items():
        db.set_presupuesto_categoria(cat, float(monto))
    return {"ok": True}
