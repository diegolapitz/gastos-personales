import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

import re
import unicodedata
from datetime import date, timedelta
from collections import defaultdict
from fastapi import APIRouter
import database as db

router = APIRouter()


def _norm(texto: str) -> str:
    t = texto.lower().strip()
    t = unicodedata.normalize("NFD", t).encode("ascii", "ignore").decode("ascii")
    t = re.sub(r'[^a-z\s]', '', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t


@router.get("/tendencia")
def tendencia():
    """Totales de los últimos 6 períodos."""
    periodos = db.get_periodos()[:6]
    resultado = []
    for p in periodos:
        total = db.get_total_periodo(p["id"])
        inv = db.get_inversiones_periodo(p["id"])
        label = p["fecha_inicio"][:7]
        resultado.append({
            "periodo_id": p["id"],
            "label": label,
            "fecha_inicio": p["fecha_inicio"],
            "total_gastos": total,
            "total_inversiones": inv,
            "es_actual": p["fecha_fin"] is None,
        })
    return list(reversed(resultado))


@router.get("/categoria")
def por_categoria(categoria: str):
    """Gasto en una categoría a lo largo de los últimos 6 períodos."""
    periodos = db.get_periodos()[:6]
    presups = db.get_presupuesto_categorias()
    presupuesto = presups.get(categoria, 0)
    resultado = []
    for p in periodos:
        gastos = db.get_gastos_periodo(p["id"])
        total_cat = sum(g["monto"] for g in gastos if g["categoria"] == categoria)
        resultado.append({
            "periodo_id": p["id"],
            "label": p["fecha_inicio"][:7],
            "total": total_cat,
            "presupuesto": presupuesto,
            "sobre_presupuesto": total_cat > presupuesto,
        })
    return list(reversed(resultado))


@router.get("/hormigas")
def gastos_hormiga():
    """Comercios que más se repiten en el período actual."""
    p = db.get_periodo_actual()
    if not p:
        return []
    gastos = db.get_gastos_periodo(p["id"])
    excluidas = {"Ahorro/Inversión"}
    gastos = [g for g in gastos if g["categoria"] not in excluidas]

    conteo = defaultdict(lambda: {"veces": 0, "total": 0.0, "nombre": ""})
    from importer_mp import limpiar_nombre
    for g in gastos:
        key = _norm(g["descripcion"])
        conteo[key]["veces"] += 1
        conteo[key]["total"] += g["monto"]
        conteo[key]["nombre"] = limpiar_nombre(g["descripcion"])

    resultado = [
        {
            "nombre": v["nombre"],
            "veces": v["veces"],
            "total": v["total"],
            "promedio": v["total"] / v["veces"],
        }
        for v in conteo.values() if v["veces"] >= 2
    ]
    return sorted(resultado, key=lambda x: x["veces"], reverse=True)[:20]


@router.get("/recurrentes")
def recurrentes():
    """Detecta gastos recurrentes en los últimos 6 períodos."""
    periodos = db.get_periodos()[:6]
    todos = []
    for p in periodos:
        todos.extend(db.get_gastos_periodo(p["id"]))

    from importer_mp import limpiar_nombre
    apariciones = defaultdict(list)
    for g in todos:
        key = _norm(g["descripcion"])
        apariciones[key].append({"fecha": g["fecha"], "monto": g["monto"],
                                  "nombre": limpiar_nombre(g["descripcion"])})

    resultado = []
    for key, items in apariciones.items():
        if len(items) < 3:
            continue
        fechas = sorted([i["fecha"] for i in items])
        intervalos = [
            (date.fromisoformat(fechas[i+1]) - date.fromisoformat(fechas[i])).days
            for i in range(len(fechas)-1)
        ]
        intervalo_prom = sum(intervalos) / len(intervalos)
        if intervalo_prom > 35:
            continue

        if intervalo_prom <= 2:
            frecuencia = "Diario"
        elif intervalo_prom <= 10:
            frecuencia = "Semanal"
        else:
            frecuencia = "Mensual"

        ultima = date.fromisoformat(fechas[-1])
        proxima = ultima + timedelta(days=round(intervalo_prom))

        resultado.append({
            "nombre": items[0]["nombre"],
            "frecuencia": frecuencia,
            "veces": len(items),
            "monto_tipico": sorted([i["monto"] for i in items])[len(items)//2],
            "proxima_estimada": proxima.isoformat(),
        })

    return sorted(resultado, key=lambda x: x["veces"], reverse=True)


@router.get("/heatmap")
def heatmap():
    """Matriz categoría × período (últimos 4 períodos)."""
    periodos = db.get_periodos()[:4]
    periodos = list(reversed(periodos))
    categorias = [c for c in db.get_categorias() if c not in ("A Clasificar", "Ahorro/Inversión")]

    matriz = []
    for cat in categorias:
        fila = {"categoria": cat}
        prev = None
        for p in periodos:
            gastos = db.get_gastos_periodo(p["id"])
            total = sum(g["monto"] for g in gastos if g["categoria"] == cat)
            label = p["fecha_inicio"][:7]
            delta = None
            if prev is not None:
                delta = "sube" if total > prev else "baja" if total < prev else "igual"
            fila[label] = {"total": total, "delta": delta}
            prev = total
        if any(fila[p["fecha_inicio"][:7]]["total"] > 0 for p in periodos):
            matriz.append(fila)

    return {
        "periodos": [p["fecha_inicio"][:7] for p in periodos],
        "datos": sorted(matriz, key=lambda x: x[periodos[-1]["fecha_inicio"][:7]]["total"], reverse=True),
    }
