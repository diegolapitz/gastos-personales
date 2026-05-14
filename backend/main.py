import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import database as db

from backend.routes import gastos, periodos, presupuestos, importar, categorias, config, analisis, ingresos

app = FastAPI(title="Gastos API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

db.init_db()

app.include_router(gastos.router,       prefix="/api/gastos",       tags=["gastos"])
app.include_router(periodos.router,     prefix="/api/periodos",     tags=["periodos"])
app.include_router(presupuestos.router, prefix="/api/presupuesto",  tags=["presupuesto"])
app.include_router(importar.router,     prefix="/api/importar",     tags=["importar"])
app.include_router(categorias.router,   prefix="/api/categorias",   tags=["categorias"])
app.include_router(config.router,       prefix="/api/config",       tags=["config"])
app.include_router(analisis.router,     prefix="/api/analisis",     tags=["analisis"])
app.include_router(ingresos.router,     prefix="/api/ingresos",     tags=["ingresos"])

@app.get("/api/health")
def health():
    return {"ok": True}
