import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import Optional
import asyncio
import database as db
import importer_mp as imp
from config import TELEGRAM_TOKEN, TELEGRAM_CHAT_ID

router = APIRouter()


@router.post("/preview")
async def preview(file: UploadFile = File(...)):
    contenido = await file.read()
    try:
        df_raw = imp.parsear_csv_estructura(contenido)
        ingresos = imp.detectar_ingresos(contenido)
    except ValueError as e:
        raise HTTPException(400, str(e))

    nuevos = df_raw[df_raw["es_nuevo"]].reset_index(drop=True)
    existentes_count = int((~df_raw["es_nuevo"]).sum())

    # Categorizar (IA solo donde no hay keyword match)
    from categorizer import categorizar
    filas = []
    for _, row in nuevos.iterrows():
        from categorizer import categorizar
        cat, uso_ia, razon = categorizar(row["descripcion"])
        filas.append({
            "source_id": row["source_id"],
            "fecha": row["fecha"],
            "descripcion": row["descripcion"],
            "nombre": row["nombre"],
            "monto": row["monto"],
            "categoria": cat,
            "ai_categorizado": uso_ia,
            "ai_razon": razon,
        })

    return {
        "gastos": filas,
        "existentes_omitidos": existentes_count,
        "ingresos_detectados": ingresos,
    }


class ConfirmarItem(BaseModel):
    source_id: str
    fecha: str
    descripcion: str
    monto: float
    categoria: str
    ai_categorizado: bool = False
    ai_razon: str | None = None


class ConfirmarRequest(BaseModel):
    gastos: list[ConfirmarItem]
    nuevo_periodo: Optional[dict] = None  # {fecha_inicio, monto_ingreso}


@router.post("/confirmar")
async def confirmar(req: ConfirmarRequest):
    # Crear período si viene uno nuevo
    if req.nuevo_periodo:
        db.crear_periodo(
            req.nuevo_periodo["fecha_inicio"],
            req.nuevo_periodo["monto_ingreso"],
        )

    insertados = 0
    for item in req.gastos:
        ok = db.add_gasto(
            fecha=item.fecha,
            descripcion=item.descripcion,
            monto=item.monto,
            categoria=item.categoria,
            fuente="csv_mp",
            source_id=item.source_id,
            ai_categorizado=item.ai_categorizado,
            ai_razon=item.ai_razon,
            forma_pago="MercadoPago",
        )
        if ok:
            insertados += 1

    # Alerta de presupuesto por categoría via Telegram
    asyncio.create_task(_alertas_presupuesto())

    total = sum(i.monto for i in req.gastos)
    try:
        from telegram import Bot
        bot = Bot(token=TELEGRAM_TOKEN)
        await bot.send_message(
            chat_id=TELEGRAM_CHAT_ID,
            text=f"📥 *Importación MP*\n{insertados} movimientos — ${total:,.0f}".replace(",", "."),
            parse_mode="Markdown",
        )
    except Exception:
        pass

    return {"insertados": insertados, "ok": True}


async def _alertas_presupuesto():
    try:
        from telegram import Bot
        periodo = db.get_periodo_actual()
        if not periodo:
            return
        por_cat = db.get_gastos_por_categoria_periodo(periodo["id"])
        presups = db.get_presupuesto_categorias()
        bot = Bot(token=TELEGRAM_TOKEN)
        for cat, gastado in por_cat.items():
            presup = presups.get(cat, 0)
            if presup > 0:
                pct = gastado / presup
                if pct >= 0.8:
                    emoji = "🔴" if pct >= 1 else "🟡"
                    await bot.send_message(
                        chat_id=TELEGRAM_CHAT_ID,
                        text=f"{emoji} *{cat}* al {int(pct*100)}% del presupuesto — "
                             f"${gastado:,.0f} de ${presup:,.0f}".replace(",", "."),
                        parse_mode="Markdown",
                    )
    except Exception:
        pass
