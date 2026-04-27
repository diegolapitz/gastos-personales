import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from fastapi import APIRouter
import database as db

router = APIRouter()


@router.get("")
def listar():
    return {
        "categorias": db.get_categorias(),
        "categorias_completo": db.get_categorias_completo(),
        "formas_pago": db.get_formas_pago(),
        "reglas": db.get_reglas(),
    }


@router.post("")
def agregar_categoria(body: dict):
    db.add_categoria(body["nombre"], body.get("excluir_gastos", False))
    return {"ok": True}


@router.delete("/{nombre}")
def eliminar_categoria(nombre: str):
    db.delete_categoria(nombre)
    return {"ok": True}


@router.post("/formas_pago")
def agregar_forma(body: dict):
    db.add_forma_pago(body["nombre"])
    return {"ok": True}


@router.delete("/formas_pago/{nombre}")
def eliminar_forma(nombre: str):
    db.delete_forma_pago(nombre)
    return {"ok": True}


@router.get("/reglas")
def listar_reglas():
    return db.get_reglas()


@router.post("/reglas")
def agregar_regla(body: dict):
    db.upsert_regla(body["keyword"], body["categoria"], int(body.get("orden", 100)))
    return {"ok": True}


@router.delete("/reglas/{regla_id}")
def eliminar_regla(regla_id: int):
    db.delete_regla(regla_id)
    return {"ok": True}


@router.post("/reglas/recategorizar")
def recategorizar():
    actualizados = db.recategorizar_todo()
    return {"ok": True, "actualizados": actualizados}
