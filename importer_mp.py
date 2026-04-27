"""
Importador de CSV "Resumen de cuenta" de MercadoPago.
"""
import io
import re
import unicodedata
import pandas as pd
from datetime import datetime

import database as db
from categorizer import categorizar

TIPOS_IGNORAR = {"rendimientos", "ingreso de dinero"}
# Positivos que SÍ queremos capturar para preguntar al usuario (no los ignoramos)
TIPOS_IGNORAR_POSITIVOS = {"rendimientos"}

# ── Limpieza de nombres de comercios ─────────────────────────────────────────

_PREFIJOS = [
    "pago con qr ",
    "pago ",
    "transferencia enviada ",
    "débito por deuda ",
    "debito por deuda ",
    "transferencia recibida ",
]

_MAPEOS = {
    "dlo*pedidosya": "Pedidos Ya",
    "pedidosya": "Pedidos Ya",
    "wl *steam": "Steam",
    "openai *chatgpt": "OpenAI ChatGPT",
    "openai": "OpenAI",
    "ilovepdf": "iLovePDF",
    "chess.com": "Chess.com",
}


def limpiar_nombre(descripcion: str) -> str:
    desc = descripcion.strip()
    desc_lower = desc.lower()

    for key, value in _MAPEOS.items():
        if key in desc_lower:
            return value

    for prefijo in _PREFIJOS:
        if desc_lower.startswith(prefijo):
            desc = desc[len(prefijo):]
            break

    desc = re.sub(r'\s+', ' ', desc).strip().rstrip('.')
    # Title case respetando siglas cortas
    return desc.title()


# ── Parseo ────────────────────────────────────────────────────────────────────

def _parsear_monto_ar(valor: str) -> float:
    s = str(valor).strip().replace(".", "").replace(",", ".")
    return float(s)


def _parsear_fecha(valor: str) -> str:
    return datetime.strptime(str(valor).strip(), "%d-%m-%Y").strftime("%Y-%m-%d")


def _es_tipo_ignorado(tipo: str) -> bool:
    tipo_lower = str(tipo).strip().lower()
    return any(ig in tipo_lower for ig in TIPOS_IGNORAR)


def _leer_df_crudo(contenido: bytes | str) -> pd.DataFrame:
    if isinstance(contenido, bytes):
        contenido = contenido.decode("utf-8", errors="replace")

    lineas = contenido.splitlines()
    header_idx = None
    for i, linea in enumerate(lineas):
        if "RELEASE_DATE" in linea and "REFERENCE_ID" in linea:
            header_idx = i
            break

    if header_idx is None:
        raise ValueError("No se encontró el header. ¿Es el archivo de Resumen de cuenta?")

    df = pd.read_csv(io.StringIO("\n".join(lineas[header_idx:])), sep=";", dtype=str)
    df.columns = [c.strip() for c in df.columns]

    requeridas = {"RELEASE_DATE", "TRANSACTION_TYPE", "REFERENCE_ID", "TRANSACTION_NET_AMOUNT"}
    if not requeridas.issubset(set(df.columns)):
        raise ValueError(f"Columnas faltantes. Encontradas: {list(df.columns)}")

    df = df.dropna(subset=["REFERENCE_ID", "TRANSACTION_NET_AMOUNT"])
    df["monto_float"] = df["TRANSACTION_NET_AMOUNT"].apply(_parsear_monto_ar)
    return df


def parsear_csv_estructura(contenido: bytes | str) -> pd.DataFrame:
    """Paso 1 (rápido): filtra gastos sin categorizar."""
    df = _leer_df_crudo(contenido)
    df_gastos = df[df["monto_float"] < 0].copy()
    df_gastos = df_gastos[~df_gastos["TRANSACTION_TYPE"].apply(_es_tipo_ignorado)].copy()

    if df_gastos.empty:
        return pd.DataFrame(columns=["source_id", "fecha", "descripcion", "nombre", "monto", "es_nuevo"])

    existentes = db.source_ids_existentes()
    resultados = []
    for _, row in df_gastos.iterrows():
        source_id = str(row["REFERENCE_ID"]).strip()
        descripcion = str(row["TRANSACTION_TYPE"]).strip()
        try:
            fecha = _parsear_fecha(row["RELEASE_DATE"])
        except ValueError:
            fecha = datetime.now().strftime("%Y-%m-%d")

        resultados.append({
            "source_id": source_id,
            "fecha": fecha,
            "descripcion": descripcion,
            "nombre": limpiar_nombre(descripcion),
            "monto": abs(row["monto_float"]),
            "es_nuevo": source_id not in existentes,
        })

    return pd.DataFrame(resultados)


def detectar_ingresos_menores(contenido: bytes | str, umbral: float = None) -> list[dict]:
    """Detecta transferencias recibidas / devoluciones (positivos que NO son sueldo ni rendimientos)."""
    if umbral is None:
        umbral = float(db.get_config("umbral_sueldo", "3000000"))

    df = _leer_df_crudo(contenido)
    existentes = db.source_ids_existentes()

    # Positivos menores al umbral sueldo, excluyendo rendimientos
    df_pos = df[(df["monto_float"] > 0) & (df["monto_float"] < umbral)].copy()
    df_pos = df_pos[~df_pos["TRANSACTION_TYPE"].apply(
        lambda t: any(ig in str(t).strip().lower() for ig in TIPOS_IGNORAR_POSITIVOS)
    )].copy()

    resultados = []
    for _, row in df_pos.iterrows():
        source_id = str(row["REFERENCE_ID"]).strip()
        if source_id in existentes:
            continue
        try:
            fecha = _parsear_fecha(row["RELEASE_DATE"])
        except ValueError:
            fecha = datetime.now().strftime("%Y-%m-%d")
        descripcion = str(row["TRANSACTION_TYPE"]).strip()
        resultados.append({
            "source_id": source_id,
            "fecha": fecha,
            "descripcion": descripcion,
            "nombre": limpiar_nombre(descripcion),
            "monto": row["monto_float"],
        })

    return sorted(resultados, key=lambda x: x["fecha"])


def detectar_ingresos(contenido: bytes | str, umbral: float = None) -> list[dict]:
    """Detecta posibles ingresos de sueldo (montos positivos > umbral)."""
    if umbral is None:
        umbral = float(db.get_config("umbral_sueldo", "3000000"))

    df = _leer_df_crudo(contenido)
    df_pos = df[df["monto_float"] > umbral].copy()

    resultados = []
    for _, row in df_pos.iterrows():
        try:
            fecha = _parsear_fecha(row["RELEASE_DATE"])
        except ValueError:
            fecha = datetime.now().strftime("%Y-%m-%d")
        resultados.append({
            "fecha": fecha,
            "descripcion": str(row["TRANSACTION_TYPE"]).strip(),
            "monto": row["monto_float"],
        })

    return sorted(resultados, key=lambda x: x["fecha"])


def categorizar_filas(df_raw: pd.DataFrame, progress_cb=None) -> pd.DataFrame:
    """Paso 2: categoriza con keywords + IA (con caché)."""
    resultados = []
    total = len(df_raw)
    for i, row in enumerate(df_raw.itertuples(index=False)):
        if progress_cb:
            progress_cb(i, total, row.descripcion)
        categoria, uso_ia, razon_ia = categorizar(row.descripcion)
        resultados.append({**row._asdict(), "categoria": categoria,
                           "ai_categorizado": uso_ia, "ai_razon": razon_ia})
    if progress_cb:
        progress_cb(total, total, "Listo")
    return pd.DataFrame(resultados)


def importar_filas(df_confirmado: pd.DataFrame) -> int:
    insertados = 0
    for _, row in df_confirmado.iterrows():
        ok = db.add_gasto(
            fecha=row["fecha"],
            descripcion=row["descripcion"],
            monto=row["monto"],
            categoria=row["categoria"],
            fuente="csv_mp",
            source_id=row["source_id"],
            ai_categorizado=bool(row["ai_categorizado"]),
            ai_razon=row.get("ai_razon"),
            forma_pago="MercadoPago",
        )
        if ok:
            insertados += 1
    return insertados
