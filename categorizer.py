"""
Categorización en dos pasos:
1. Reglas keyword (DB) — ordenadas por `orden` ASC
2. Fallback a Claude Haiku solo en imports CSV (usar_ia=True)
   El bot nunca usa IA — si no matchea, retorna "A Clasificar" y pregunta al usuario.
"""
import json
import unicodedata
import anthropic

from config import ANTHROPIC_API_KEY, CATEGORIA_INVERSION
import database as db


def _normalizar(texto: str) -> str:
    texto = texto.lower().strip()
    return unicodedata.normalize("NFD", texto).encode("ascii", "ignore").decode("ascii")


def categorizar_por_reglas(descripcion: str) -> str | None:
    """Retorna categoría si alguna keyword matchea, None si no."""
    desc_norm = _normalizar(descripcion)
    reglas = db.get_reglas()
    for regla in reglas:
        if _normalizar(regla["keyword"]) in desc_norm:
            return regla["categoria"]
    return None


def categorizar_con_ia(descripcion: str) -> tuple[str, str]:
    """Llama a Claude Haiku. Retorna (categoria, razon)."""
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    _excluir = {"A Clasificar", "A Revisar"}
    categorias = [c for c in db.get_categorias() if c not in _excluir]

    prompt = (
        f'Eres un asistente de finanzas personales. '
        f'Dado el siguiente gasto, asignale la categoría más apropiada '
        f'y explicá brevemente (máximo 8 palabras) por qué.\n\n'
        f'Descripción: "{descripcion}"\n\n'
        f'Categorías disponibles: {", ".join(categorias)}\n\n'
        f'Respondé SOLO con JSON válido, sin texto extra:\n'
        f'{{"categoria": "...", "razon": "..."}}'
    )

    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=120,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    start = raw.find("{")
    end = raw.rfind("}") + 1
    data = json.loads(raw[start:end])

    categorias_validas = db.get_categorias()
    categoria = data.get("categoria", "A Clasificar")
    if categoria not in categorias_validas or categoria in ("Otros", "A Revisar", "A Clasificar"):
        categoria = "A Clasificar"
    razon = data.get("razon", "")
    return categoria, razon


_cache_ia: dict[str, tuple[str, str]] = {}


def categorizar(descripcion: str, usar_ia: bool = True) -> tuple[str, bool, str | None]:
    """
    Retorna (categoria, usó_ia, razon_ia).
    Flujo: reglas keyword → si no hay match firme, IA → si falla, "A Clasificar".
    "A Clasificar" desde reglas (catch-all) no corta el flujo: igual pasa a la IA.
    usar_ia=False → modo bot, nunca llama a la API.
    """
    cat_regla = categorizar_por_reglas(descripcion)

    # Si la regla devuelve una categoría real (no el catch-all), usarla
    if cat_regla and cat_regla != "A Clasificar":
        return cat_regla, False, None

    # Sin match firme: intentar IA (si está habilitada)
    if not usar_ia:
        return "A Clasificar", False, None

    desc_norm = _normalizar(descripcion)
    if desc_norm in _cache_ia:
        cat, razon = _cache_ia[desc_norm]
        return cat, True, razon

    try:
        cat, razon = categorizar_con_ia(descripcion)
        _cache_ia[desc_norm] = (cat, razon)
        return cat, True, razon
    except Exception:
        return "A Clasificar", False, None
