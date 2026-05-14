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


@router.get("/resumen")
def resumen_periodo():
    """Headline metric: current period daily avg vs historical avg."""
    periodos = db.get_periodos()
    today = date.today()
    if not periodos:
        return None

    actual = next((p for p in periodos if p["fecha_fin"] is None), None)
    cerrados = [p for p in periodos if p["fecha_fin"] is not None]
    if not actual:
        return None

    fecha_inicio_actual = date.fromisoformat(actual["fecha_inicio"])
    dias_transcurridos = max((today - fecha_inicio_actual).days, 1)

    dias_total = 30
    if cerrados:
        fi = date.fromisoformat(cerrados[0]["fecha_inicio"])
        ff = date.fromisoformat(cerrados[0]["fecha_fin"])
        dias_total = max((ff - fi).days, 1)

    total_actual = db.get_total_periodo(actual["id"])
    promedio_diario_actual = total_actual / dias_transcurridos

    prom_historicos = []
    for p in cerrados[:5]:
        total = db.get_total_periodo(p["id"])
        fi = date.fromisoformat(p["fecha_inicio"])
        ff = date.fromisoformat(p["fecha_fin"])
        dias = max((ff - fi).days, 1)
        prom_historicos.append(total / dias)

    promedio_diario_historico = sum(prom_historicos) / len(prom_historicos) if prom_historicos else None
    pct_variacion = None
    if promedio_diario_historico:
        pct_variacion = round(
            (promedio_diario_actual - promedio_diario_historico) / promedio_diario_historico * 100, 1
        )

    return {
        "promedio_diario_actual": round(promedio_diario_actual),
        "promedio_diario_historico": round(promedio_diario_historico) if promedio_diario_historico else None,
        "pct_variacion": pct_variacion,
        "proyeccion_cierre": round(promedio_diario_actual * dias_total),
        "dias_transcurridos": dias_transcurridos,
        "dias_total": dias_total,
        "monto_ingreso": actual.get("monto_ingreso") or 0,
    }


@router.get("/ranking")
def ranking_categorias(periodo_id: int = None):
    """Categories ranked by % of sueldo. periodo_id=None → current, 0 → avg all."""
    periodos = db.get_periodos()
    if not periodos:
        return {"categorias": [], "monto_ingreso": 0}

    # Aggregate mode: total + monthly average across all periods
    if periodo_id == 0:
        n = len(periodos)
        totales = defaultdict(float)
        for p in periodos:
            for cat, monto in db.get_gastos_por_categoria_periodo(p["id"]).items():
                totales[cat] += monto
        resultado = [
            {"nombre": cat, "monto": round(total), "promedio_mensual": round(total / n),
             "pct_sueldo": 0, "pct_sueldo_anterior": 0, "variacion_pp": 0}
            for cat, total in totales.items() if total > 0
        ]
        resultado.sort(key=lambda x: x["monto"], reverse=True)
        return {"categorias": resultado, "monto_ingreso": 0, "n_periodos": n}

    sorted_p = sorted(periodos, key=lambda p: p["fecha_inicio"], reverse=True)

    if periodo_id is None:
        actual = next((p for p in sorted_p if p["fecha_fin"] is None), None)
    else:
        actual = next((p for p in sorted_p if p["id"] == periodo_id), None)
    if not actual:
        return {"categorias": [], "monto_ingreso": 0}

    idx = next((i for i, p in enumerate(sorted_p) if p["id"] == actual["id"]), -1)
    anterior = sorted_p[idx + 1] if 0 <= idx < len(sorted_p) - 1 else None

    gastos_actual = db.get_gastos_por_categoria_periodo(actual["id"])
    gastos_anterior = db.get_gastos_por_categoria_periodo(anterior["id"]) if anterior else {}
    monto_ingreso = actual.get("monto_ingreso") or 0
    monto_ingreso_anterior = (anterior.get("monto_ingreso") or 0) if anterior else 0

    resultado = []
    for cat, monto in gastos_actual.items():
        if monto <= 0:
            continue
        pct = round(monto / monto_ingreso * 100, 1) if monto_ingreso > 0 else 0
        monto_ant = gastos_anterior.get(cat, 0)
        pct_ant = round(monto_ant / monto_ingreso_anterior * 100, 1) if monto_ingreso_anterior > 0 else 0
        resultado.append({
            "nombre": cat,
            "monto": round(monto),
            "pct_sueldo": pct,
            "pct_sueldo_anterior": pct_ant,
            "variacion_pp": round(pct - pct_ant, 1),
        })

    resultado.sort(key=lambda x: x["monto"] if monto_ingreso == 0 else x["pct_sueldo"], reverse=True)
    return {"categorias": resultado, "monto_ingreso": monto_ingreso}


@router.get("/acumulado")
def gasto_acumulado(periodo_id: int = None):
    """Cumulative daily spending. periodo_id=None → current, 0 → empty."""
    periodos = db.get_periodos()
    today = date.today()
    empty = {"actual": [], "anterior": [], "dias_total": 30,
             "dias_transcurridos": 0, "proyeccion_fin": 0, "monto_ingreso": 0}

    if not periodos or periodo_id == 0:
        return empty

    sorted_p = sorted(periodos, key=lambda p: p["fecha_inicio"], reverse=True)

    if periodo_id is None:
        actual = next((p for p in sorted_p if p["fecha_fin"] is None), None)
    else:
        actual = next((p for p in sorted_p if p["id"] == periodo_id), None)
    if not actual:
        return empty

    idx = next((i for i, p in enumerate(sorted_p) if p["id"] == actual["id"]), -1)
    anterior = sorted_p[idx + 1] if 0 <= idx < len(sorted_p) - 1 else None

    excluidas = set(db._excluidas_de_gastos())
    fecha_inicio_actual = date.fromisoformat(actual["fecha_inicio"])

    if actual["fecha_fin"]:
        fecha_fin_actual = date.fromisoformat(actual["fecha_fin"])
        dias_total = max((fecha_fin_actual - fecha_inicio_actual).days, 1)
        dias_transcurridos = dias_total
    else:
        dias_transcurridos = max((today - fecha_inicio_actual).days, 1)
        dias_total = 30
        if anterior and anterior.get("fecha_fin"):
            fi = date.fromisoformat(anterior["fecha_inicio"])
            ff = date.fromisoformat(anterior["fecha_fin"])
            dias_total = max((ff - fi).days, 1)

    gastos_actual = db.get_gastos_periodo(actual["id"])
    por_dia = defaultdict(float)
    for g in gastos_actual:
        if g["categoria"] not in excluidas:
            por_dia[g["fecha"]] += g["monto"]

    acum = 0
    acumulado_actual = []
    for i in range(dias_transcurridos + 1):
        fecha_str = (fecha_inicio_actual + timedelta(days=i)).isoformat()
        acum += por_dia.get(fecha_str, 0)
        acumulado_actual.append({"dia": i, "fecha": fecha_str, "acumulado": round(acum)})

    acumulado_anterior = []
    if anterior:
        gastos_ant = db.get_gastos_periodo(anterior["id"])
        fi_ant = date.fromisoformat(anterior["fecha_inicio"])
        ff_ant = date.fromisoformat(anterior["fecha_fin"]) if anterior["fecha_fin"] else today
        dias_ant = (ff_ant - fi_ant).days
        por_dia_ant = defaultdict(float)
        for g in gastos_ant:
            if g["categoria"] not in excluidas:
                por_dia_ant[g["fecha"]] += g["monto"]
        acum = 0
        for i in range(dias_ant + 1):
            fecha_str = (fi_ant + timedelta(days=i)).isoformat()
            acum += por_dia_ant.get(fecha_str, 0)
            acumulado_anterior.append({"dia": i, "acumulado": round(acum)})

    total_actual = acumulado_actual[-1]["acumulado"] if acumulado_actual else 0
    proyeccion_fin = 0 if actual["fecha_fin"] else (
        round(total_actual / dias_transcurridos * dias_total) if dias_transcurridos > 0 else 0
    )

    return {
        "actual": acumulado_actual,
        "anterior": acumulado_anterior,
        "dias_total": dias_total,
        "dias_transcurridos": dias_transcurridos,
        "proyeccion_fin": proyeccion_fin,
        "monto_ingreso": actual.get("monto_ingreso") or 0,
    }


@router.get("/tendencia")
def tendencia():
    """Totales de los últimos 6 períodos."""
    periodos = db.get_periodos()[:6]
    resultado = []
    for p in periodos:
        total = db.get_total_periodo(p["id"])
        inv = db.get_inversiones_periodo(p["id"])
        resultado.append({
            "periodo_id": p["id"],
            "label": p["fecha_inicio"][:7],
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
        monto_ingreso = p.get("monto_ingreso") or 0
        pct_sueldo = round(total_cat / monto_ingreso * 100, 1) if monto_ingreso > 0 else 0
        resultado.append({
            "periodo_id": p["id"],
            "label": p["fecha_inicio"][:7],
            "total": total_cat,
            "presupuesto": presupuesto,
            "sobre_presupuesto": presupuesto > 0 and total_cat > presupuesto,
            "monto_ingreso": monto_ingreso,
            "pct_sueldo": pct_sueldo,
            "es_actual": p["fecha_fin"] is None,
        })
    return list(reversed(resultado))


@router.get("/hormigas")
def gastos_hormiga(periodo_id: int = None):
    """Comercios que más se repiten. periodo_id=None → actual, 0 → todos los períodos."""
    from importer_mp import limpiar_nombre
    excluidas = set(db._excluidas_de_gastos())

    if periodo_id == 0:
        todos_gastos = []
        for p in db.get_periodos():
            todos_gastos.extend(db.get_gastos_periodo(p["id"]))
        gastos = [g for g in todos_gastos if g["categoria"] not in excluidas]
        monto_ingreso = 0
        min_veces = 3
    else:
        if periodo_id is None:
            p = db.get_periodo_actual()
        else:
            p = next((x for x in db.get_periodos() if x["id"] == periodo_id), None)
        if not p:
            return []
        gastos = [g for g in db.get_gastos_periodo(p["id"]) if g["categoria"] not in excluidas]
        monto_ingreso = p.get("monto_ingreso") or 0
        min_veces = 2

    conteo = defaultdict(lambda: {"veces": 0, "total": 0.0, "nombre": ""})
    for g in gastos:
        key = _norm(g["descripcion"])
        conteo[key]["veces"] += 1
        conteo[key]["total"] += g["monto"]
        conteo[key]["nombre"] = limpiar_nombre(g["descripcion"])

    resultado = [
        {
            "nombre": v["nombre"],
            "veces": v["veces"],
            "total": round(v["total"]),
            "promedio": round(v["total"] / v["veces"]),
            "pct_sueldo": round(v["total"] / monto_ingreso * 100, 1) if monto_ingreso > 0 else 0,
        }
        for v in conteo.values() if v["veces"] >= min_veces
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
        apariciones[key].append({
            "fecha": g["fecha"], "monto": g["monto"],
            "nombre": limpiar_nombre(g["descripcion"]),
        })

    resultado = []
    for key, items in apariciones.items():
        if len(items) < 3:
            continue
        fechas = sorted([i["fecha"] for i in items])
        intervalos = [
            (date.fromisoformat(fechas[i + 1]) - date.fromisoformat(fechas[i])).days
            for i in range(len(fechas) - 1)
        ]
        intervalo_prom = sum(intervalos) / len(intervalos)
        if intervalo_prom > 35:
            continue

        if intervalo_prom <= 2:
            frecuencia = "DIARIO"
        elif intervalo_prom <= 10:
            frecuencia = "SEMANAL"
        else:
            frecuencia = "MENSUAL"

        ultima = date.fromisoformat(fechas[-1])
        proxima = ultima + timedelta(days=round(intervalo_prom))
        montos = sorted([i["monto"] for i in items])

        resultado.append({
            "nombre": items[0]["nombre"],
            "frecuencia": frecuencia,
            "veces": len(items),
            "monto_tipico": round(montos[len(items) // 2]),
            "total_gastado": round(sum(i["monto"] for i in items)),
            "proxima_estimada": proxima.isoformat(),
        })

    return sorted(resultado, key=lambda x: x["veces"], reverse=True)


@router.get("/heatmap")
def heatmap():
    """Matriz categoría × período (últimos 5 períodos)."""
    periodos = db.get_periodos()[:5]
    periodos = list(reversed(periodos))
    categorias = [c for c in db.get_categorias()
                  if c not in ("A Clasificar", "Ahorro/Inversión", "Inversiones")]
    actual_label = next((p["fecha_inicio"][:7] for p in periodos if p["fecha_fin"] is None), None)

    matriz = []
    for cat in categorias:
        fila = {"categoria": cat}
        prev = None
        max_cat = 0
        for p in periodos:
            gastos = db.get_gastos_periodo(p["id"])
            total = sum(g["monto"] for g in gastos if g["categoria"] == cat)
            max_cat = max(max_cat, total)
            label = p["fecha_inicio"][:7]
            delta = None
            if prev is not None:
                delta = "sube" if total > prev else "baja" if total < prev else "igual"
            fila[label] = {"total": total, "delta": delta, "es_actual": p["fecha_fin"] is None}
            prev = total
        fila["_max"] = max_cat
        if any(fila[p["fecha_inicio"][:7]]["total"] > 0 for p in periodos):
            matriz.append(fila)

    last_label = periodos[-1]["fecha_inicio"][:7] if periodos else ""
    return {
        "periodos": [p["fecha_inicio"][:7] for p in periodos],
        "datos": sorted(matriz, key=lambda x: x.get(last_label, {}).get("total", 0), reverse=True),
        "actual_label": actual_label,
    }


@router.get("/consumo")
def gasto_por_consumo(meses: int = 12):
    """
    Agrupa cada gasto por su fecha de consumo real (COALESCE(fecha_consumo, fecha)).
    Devuelve los últimos `meses` meses con total y desglose por categoría.
    """
    excluidas = set(db._excluidas_de_gastos())
    conn = db.get_conn()

    rows = conn.execute("""
        SELECT
            substr(COALESCE(fecha_consumo, fecha), 1, 7) AS mes,
            categoria,
            SUM(monto) AS total
        FROM gastos
        WHERE categoria NOT IN ({})
          AND COALESCE(fecha_consumo, fecha) IS NOT NULL
          AND COALESCE(fecha_consumo, fecha) != ''
        GROUP BY mes, categoria
        ORDER BY mes ASC
    """.format(",".join(f"'{e}'" for e in excluidas) or "'__ninguna__'")).fetchall()
    conn.close()

    # Agrupar por mes
    por_mes = defaultdict(lambda: {"total": 0.0, "por_categoria": defaultdict(float)})
    for r in rows:
        mes, cat, total = r["mes"], r["categoria"], r["total"]
        por_mes[mes]["total"] += total
        por_mes[mes]["por_categoria"][cat] += total

    # Tomar los últimos `meses` meses presentes en los datos
    today_mes = date.today().strftime("%Y-%m")
    todos = sorted(por_mes.keys())
    # Incluir siempre el mes actual aunque esté vacío
    if today_mes not in por_mes:
        por_mes[today_mes] = {"total": 0.0, "por_categoria": {}}
        todos = sorted(por_mes.keys())

    ultimos = todos[-meses:]

    resultado = []
    for mes in ultimos:
        d = por_mes[mes]
        por_cat = dict(sorted(d["por_categoria"].items(), key=lambda x: x[1], reverse=True))
        resultado.append({
            "mes": mes,
            "total": round(d["total"]),
            "por_categoria": {k: round(v) for k, v in por_cat.items()},
            "es_actual": mes == today_mes,
        })

    return resultado
