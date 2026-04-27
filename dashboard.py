"""
Dashboard Streamlit — Control de Gastos Personales
"""
import asyncio
import pandas as pd
import plotly.express as px
import streamlit as st
from datetime import datetime
from telegram import Bot

import database as db
import importer_mp as imp
from config import TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, CATEGORIA_INVERSION

st.set_page_config(page_title="Gastos", page_icon="💰", layout="wide")

db.init_db()


def mes_actual() -> str:
    return datetime.now().strftime("%Y-%m")


def fmt(m: float) -> str:
    return f"${m:,.0f}".replace(",", ".")


def enviar_telegram(mensaje: str):
    async def _send():
        bot = Bot(token=TELEGRAM_TOKEN)
        await bot.send_message(chat_id=TELEGRAM_CHAT_ID, text=mensaje, parse_mode="Markdown")
    try:
        asyncio.run(_send())
    except Exception as e:
        st.warning(f"No se pudo notificar por Telegram: {e}")


# ── Navegación ────────────────────────────────────────────────────────────────

tab_inicio, tab_gastos, tab_analisis, tab_mp, tab_config, tab_presup = st.tabs([
    "🏠 Inicio", "💳 Gastos", "📈 Análisis", "📥 Importar MP", "⚙️ Config", "🎯 Presupuesto",
])


# ══════════════════════════════════════════════════════════════════════════════
# TAB 1 — INICIO
# ══════════════════════════════════════════════════════════════════════════════
with tab_inicio:
    mes = mes_actual()
    total_gastos = db.get_total_mes(mes)
    total_inv = db.get_inversiones_mes(mes)
    presupuesto = db.get_presupuesto(mes)
    por_cat = db.get_gastos_por_categoria(mes)
    ultimos = db.get_ultimos_gastos(10)
    deudas = db.get_deudas_abiertas()

    st.subheader(f"Resumen de {mes}")

    # Métricas principales
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Gastado", fmt(total_gastos))
    c2.metric("Invertido / Ahorrado", fmt(total_inv))
    if presupuesto:
        c3.metric("Presupuesto", fmt(presupuesto))
        c4.metric("Disponible", fmt(presupuesto - total_gastos), delta_color="inverse")
        pct = min(total_gastos / presupuesto, 1.0)
        st.progress(pct, text=f"{int(pct*100)}% del presupuesto gastado")
    else:
        st.info("Sin presupuesto configurado. Configuralo en 🎯 Presupuesto.")

    st.divider()
    col_izq, col_der = st.columns(2)

    with col_izq:
        st.subheader("Por categoría (gastos)")
        if por_cat:
            fig = px.pie(names=list(por_cat.keys()), values=list(por_cat.values()), hole=0.3)
            fig.update_layout(margin=dict(t=0, b=0, l=0, r=0), height=300)
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.write("Sin gastos este mes.")

    with col_der:
        st.subheader("Últimos movimientos")
        if ultimos:
            df_u = pd.DataFrame(ultimos)[["fecha", "descripcion", "monto", "categoria", "forma_pago"]]
            df_u["monto"] = df_u["monto"].apply(fmt)
            st.dataframe(df_u, use_container_width=True, hide_index=True)
        else:
            st.write("Sin movimientos.")

    if deudas:
        st.divider()
        st.subheader("Deudas abiertas")
        me_deben = sum(d["monto"] for d in deudas if d["tipo"] == "presté")
        debo = sum(d["monto"] for d in deudas if d["tipo"] == "me_prestaron")
        c1, c2, c3 = st.columns(3)
        c1.metric("Me deben", fmt(me_deben))
        c2.metric("Debo", fmt(debo))
        c3.metric("Neto", fmt(me_deben - debo))


# ══════════════════════════════════════════════════════════════════════════════
# TAB 2 — GASTOS
# ══════════════════════════════════════════════════════════════════════════════
with tab_gastos:
    st.subheader("Gastos")

    now = datetime.now()
    opciones_mes = [f"{now.year}-{m:02d}" for m in range(1, 13)]
    mes_sel = st.selectbox("Mes", opciones_mes,
                           index=opciones_mes.index(mes_actual()) if mes_actual() in opciones_mes else 0,
                           key="mes_gastos")
    gastos = db.get_gastos_mes(mes_sel)
    categorias = db.get_categorias()
    formas_pago = ["Todas"] + db.get_formas_pago()

    if not gastos:
        st.info("No hay gastos para este mes.")
    else:
        df = pd.DataFrame(gastos)

        c1, c2, c3, c4 = st.columns(4)
        cats_disp = ["Todas"] + sorted(df["categoria"].unique().tolist())
        cat_fil = c1.selectbox("Categoría", cats_disp, key="fil_cat")
        forma_fil = c2.selectbox("Forma de pago", formas_pago, key="fil_forma")
        fuentes_disp = ["Todas"] + sorted(df["fuente"].unique().tolist())
        fuente_fil = c3.selectbox("Fuente", fuentes_disp, key="fil_fuente")
        buscar = c4.text_input("Buscar", key="fil_buscar")

        df_fil = df.copy()
        if cat_fil != "Todas":
            df_fil = df_fil[df_fil["categoria"] == cat_fil]
        if forma_fil != "Todas":
            df_fil = df_fil[df_fil["forma_pago"] == forma_fil]
        if fuente_fil != "Todas":
            df_fil = df_fil[df_fil["fuente"] == fuente_fil]
        if buscar:
            df_fil = df_fil[df_fil["descripcion"].str.contains(buscar, case=False, na=False)]

        # Separar inversiones del total de gastos
        inv_fil = df_fil[df_fil["categoria"] == CATEGORIA_INVERSION]["monto"].sum()
        gasto_fil = df_fil[df_fil["categoria"] != CATEGORIA_INVERSION]["monto"].sum()
        st.write(f"**{len(df_fil)} movimientos** — Gastos: {fmt(gasto_fil)} | Inversiones: {fmt(inv_fil)}")

        for _, row in df_fil.iterrows():
            label = (
                f"{row['fecha']}  |  {row['descripcion']}  |  {fmt(row['monto'])}"
                f"  |  {row['categoria']}"
                + (f"  |  {row['forma_pago']}" if row.get('forma_pago') else "")
                + ("  🤖" if row.get("ai_categorizado") else "")
            )
            with st.expander(label, expanded=False):
                col_a, col_b, col_c, col_d = st.columns([2, 1, 1, 1])
                nueva_cat = col_a.selectbox(
                    "Categoría",
                    categorias,
                    index=categorias.index(row["categoria"]) if row["categoria"] in categorias else 0,
                    key=f"cat_{row['id']}",
                )
                nueva_forma = col_b.selectbox(
                    "Forma de pago",
                    db.get_formas_pago(),
                    index=db.get_formas_pago().index(row["forma_pago"]) if row.get("forma_pago") in db.get_formas_pago() else 0,
                    key=f"fp_{row['id']}",
                )
                if col_c.button("Guardar", key=f"save_{row['id']}"):
                    conn = db.get_conn()
                    conn.execute(
                        "UPDATE gastos SET categoria=?, categoria_override=1, forma_pago=? WHERE id=?",
                        (nueva_cat, nueva_forma, row["id"]),
                    )
                    conn.commit()
                    conn.close()
                    st.success("Actualizado.")
                    st.rerun()
                if col_d.button("Eliminar", key=f"del_{row['id']}"):
                    db.delete_gasto(row["id"])
                    st.success("Eliminado.")
                    st.rerun()
                if row.get("ai_categorizado") and row.get("ai_razon"):
                    st.caption(f"🤖 IA: {row['ai_razon']}")


# ══════════════════════════════════════════════════════════════════════════════
# TAB 3 — ANÁLISIS
# ══════════════════════════════════════════════════════════════════════════════
with tab_analisis:
    st.subheader("Análisis")

    now = datetime.now()
    meses = []
    for i in range(5, -1, -1):
        m = now.month - i
        y = now.year
        while m <= 0:
            m += 12
            y -= 1
        meses.append(f"{y}-{m:02d}")

    datos_evolucion = []
    for m in meses:
        datos_evolucion.append({
            "mes": m,
            "Gastos": db.get_total_mes(m),
            "Inversiones": db.get_inversiones_mes(m),
        })
    df_evol = pd.DataFrame(datos_evolucion)

    col1, col2 = st.columns(2)
    with col1:
        st.markdown("**Evolución mensual**")
        fig = px.line(df_evol, x="mes", y=["Gastos", "Inversiones"], markers=True)
        fig.update_layout(height=280, margin=dict(t=10, b=10))
        st.plotly_chart(fig, use_container_width=True)

    with col2:
        st.markdown("**Top gastos del mes actual**")
        gastos_mes = db.get_gastos_mes(mes_actual())
        if gastos_mes:
            df_top = pd.DataFrame(gastos_mes)
            df_top = df_top[df_top["categoria"] != CATEGORIA_INVERSION]
            df_top = df_top.nlargest(10, "monto")[["descripcion", "monto", "categoria"]]
            df_top["monto"] = df_top["monto"].apply(fmt)
            st.dataframe(df_top, use_container_width=True, hide_index=True)
        else:
            st.write("Sin datos.")

    st.divider()
    st.markdown("**Comparación por categoría (últimos 6 meses)**")
    datos_cat = []
    for m in meses:
        for cat, total in db.get_gastos_por_categoria(m).items():
            datos_cat.append({"mes": m, "categoria": cat, "total": total})
    if datos_cat:
        df_cat = pd.DataFrame(datos_cat)
        fig2 = px.bar(df_cat, x="mes", y="total", color="categoria", barmode="stack")
        fig2.update_layout(height=320, margin=dict(t=10, b=10))
        st.plotly_chart(fig2, use_container_width=True)

    st.divider()
    st.markdown("**Gastos recurrentes**")
    todos_gastos = []
    for m in meses:
        todos_gastos.extend(db.get_gastos_mes(m))
    if todos_gastos:
        df_rec = pd.DataFrame(todos_gastos)
        df_rec = df_rec[df_rec["categoria"] != CATEGORIA_INVERSION]
        df_rec["desc_norm"] = df_rec["descripcion"].str.lower().str.strip()
        conteos = df_rec.groupby("desc_norm").agg(
            veces=("id", "count"),
            monto_prom=("monto", "mean"),
            descripcion=("descripcion", "first"),
            categoria=("categoria", "first"),
        ).reset_index()
        rec = conteos[conteos["veces"] >= 2].sort_values("veces", ascending=False)
        if not rec.empty:
            rec["monto_prom"] = rec["monto_prom"].apply(fmt)
            st.dataframe(rec[["descripcion", "categoria", "veces", "monto_prom"]],
                         use_container_width=True, hide_index=True)
        else:
            st.write("Sin recurrentes aún.")


# ══════════════════════════════════════════════════════════════════════════════
# TAB 4 — IMPORTAR MERCADOPAGO
# ══════════════════════════════════════════════════════════════════════════════
with tab_mp:
    st.subheader("Importar CSV de MercadoPago")
    st.caption("Usá el **Resumen de cuenta** (account_statement), no el de liquidaciones.")

    archivo = st.file_uploader("Subí el CSV", type=["csv"], key="csv_mp")

    if archivo:
        try:
            df_raw = imp.parsear_csv_estructura(archivo.read())
        except ValueError as e:
            st.error(str(e))
            df_raw = None

        if df_raw is not None:
            nuevos_raw = df_raw[df_raw["es_nuevo"]].reset_index(drop=True)
            ya_existentes = df_raw[~df_raw["es_nuevo"]]
            st.info(f"CSV leído: **{len(df_raw)} movimientos** — **{len(nuevos_raw)} nuevos**, {len(ya_existentes)} ya importados.")

            if nuevos_raw.empty:
                st.info("No hay movimientos nuevos para importar.")
            else:
                if "df_categorizado" not in st.session_state or \
                        st.session_state.get("csv_nombre") != archivo.name:

                    barra = st.progress(0, text="Iniciando categorización…")
                    estado = st.empty()

                    def progress_cb(actual, total, descripcion):
                        if actual < total:
                            barra.progress(actual / total, text=f"Categorizando ({actual+1}/{total})…")
                            estado.caption(f"→ {descripcion[:70]}")
                        else:
                            barra.progress(1.0, text=f"✅ {total} filas categorizadas")
                            estado.empty()

                    df_cat = imp.categorizar_filas(nuevos_raw, progress_cb=progress_cb)
                    n_ia = int(df_cat["ai_categorizado"].sum())
                    n_kw = len(df_cat) - n_ia
                    st.caption(f"Keywords: {n_kw} filas  |  IA: {n_ia} filas  |  Sin clasificar: {int((df_cat['categoria'] == 'A Clasificar').sum())}")

                    st.session_state["df_categorizado"] = df_cat
                    st.session_state["csv_nombre"] = archivo.name

                nuevos = st.session_state["df_categorizado"]
                categorias = db.get_categorias()

                st.markdown("**Preview — editá las categorías antes de confirmar:**")
                categorias_editadas = {}
                for i, row in nuevos.iterrows():
                    col_f, col_d, col_m, col_c = st.columns([1.2, 3, 1, 2])
                    col_f.write(row["fecha"])
                    col_d.write(row["descripcion"])
                    col_m.write(fmt(row["monto"]))
                    cat_idx = categorias.index(row["categoria"]) if row["categoria"] in categorias else 0
                    cat_elegida = col_c.selectbox("", categorias, index=cat_idx,
                                                   key=f"mp_cat_{i}", label_visibility="collapsed")
                    categorias_editadas[i] = cat_elegida
                    if row["ai_categorizado"]:
                        st.caption(f"  🤖 {row['ai_razon']}")

                total_preview = fmt(nuevos["monto"].sum())
                st.markdown(f"**Total a importar: {total_preview}**")

                if st.button("✅ Confirmar importación", type="primary"):
                    df_a_importar = nuevos.copy()
                    for i, cat in categorias_editadas.items():
                        df_a_importar.at[i, "categoria"] = cat
                    insertados = imp.importar_filas(df_a_importar)
                    st.session_state.pop("df_categorizado", None)
                    st.success(f"✅ {insertados} movimientos importados.")
                    enviar_telegram(
                        f"📥 *Importación MP completada*\n{insertados} movimientos, {total_preview} total."
                    )
                    st.rerun()


# ══════════════════════════════════════════════════════════════════════════════
# TAB 5 — CONFIGURACIÓN
# ══════════════════════════════════════════════════════════════════════════════
with tab_config:
    col_izq, col_der = st.columns(2)

    # ── Categorías ──────────────────────────────────────────────────────────
    with col_izq:
        st.subheader("Categorías")
        categorias = db.get_categorias()
        for cat in categorias:
            c1, c2 = st.columns([4, 1])
            c1.write(cat + (" *(excluida de gastos)*" if cat == CATEGORIA_INVERSION else ""))
            if cat not in ("A Clasificar", "Otros", CATEGORIA_INVERSION):
                if c2.button("🗑️", key=f"del_cat_{cat}"):
                    db.delete_categoria(cat)
                    st.rerun()

        st.divider()
        st.markdown("**Agregar categoría**")
        c1, c2, c3 = st.columns([3, 1, 1])
        nueva_cat_nombre = c1.text_input("Nombre", key="nueva_cat_nombre")
        excluir = c2.checkbox("Excluir de gastos", key="excluir_cat")
        if c3.button("Agregar", key="btn_add_cat"):
            if nueva_cat_nombre.strip():
                db.add_categoria(nueva_cat_nombre.strip(), excluir)
                st.success(f"Categoría '{nueva_cat_nombre}' agregada.")
                st.rerun()

    # ── Formas de pago ───────────────────────────────────────────────────────
    with col_der:
        st.subheader("Formas de pago")
        formas = db.get_formas_pago()
        for forma in formas:
            c1, c2 = st.columns([4, 1])
            c1.write(forma)
            if c2.button("🗑️", key=f"del_fp_{forma}"):
                db.delete_forma_pago(forma)
                st.rerun()

        st.divider()
        st.markdown("**Agregar forma de pago**")
        c1, c2 = st.columns([3, 1])
        nueva_forma = c1.text_input("Nombre", key="nueva_forma_pago")
        if c2.button("Agregar", key="btn_add_fp"):
            if nueva_forma.strip():
                db.add_forma_pago(nueva_forma.strip())
                st.success(f"'{nueva_forma}' agregada.")
                st.rerun()

    st.divider()

    # ── Reglas de categorización ─────────────────────────────────────────────
    st.subheader("Reglas de categorización (keywords)")
    reglas = db.get_reglas()
    categorias = db.get_categorias()

    buscar_regla = st.text_input("Buscar keyword", key="buscar_regla")
    reglas_fil = [r for r in reglas if buscar_regla.lower() in r["keyword"].lower()] if buscar_regla else reglas

    for row in reglas_fil:
        c1, c2, c3, c4 = st.columns([2, 2, 1, 1])
        c1.write(f"`{row['keyword']}`")
        c2.write(row["categoria"])
        c3.write(f"#{row['orden']}")
        if c4.button("🗑️", key=f"del_regla_{row['id']}"):
            db.delete_regla(row["id"])
            st.rerun()

    st.divider()
    st.markdown("**Agregar / editar regla**")
    c1, c2, c3, c4 = st.columns([2, 2, 1, 1])
    nuevo_kw = c1.text_input("Keyword", key="new_kw")
    nueva_cat_r = c2.selectbox("Categoría", categorias, key="new_cat_regla")
    nuevo_orden = c3.number_input("Orden", min_value=1, value=len(reglas) + 1, key="new_orden")
    if c4.button("Agregar", key="add_regla"):
        if nuevo_kw.strip():
            db.upsert_regla(nuevo_kw.strip().lower(), nueva_cat_r, int(nuevo_orden))
            st.success(f"Regla '{nuevo_kw}' guardada.")
            st.rerun()

    st.divider()
    st.markdown("**Recategorizar toda la base**")
    st.caption("Re-aplica las reglas sobre todos los gastos sin override manual.")
    if st.button("🔄 Recategorizar", type="secondary"):
        with st.spinner("Recategorizando…"):
            db.recategorizar_todo()
        st.success("Recategorización completada.")


# ══════════════════════════════════════════════════════════════════════════════
# TAB 6 — PRESUPUESTO Y DEUDAS
# ══════════════════════════════════════════════════════════════════════════════
with tab_presup:
    st.subheader("Presupuesto")

    mes = mes_actual()
    presup_actual = db.get_presupuesto(mes)
    col1, col2 = st.columns([2, 1])
    nuevo_presup = col1.number_input(
        f"Presupuesto para {mes}", min_value=0.0,
        value=float(presup_actual or 0), step=1000.0, format="%.0f",
    )
    if col2.button("Guardar presupuesto"):
        if nuevo_presup > 0:
            db.set_presupuesto(mes, nuevo_presup)
            st.success(f"Presupuesto {mes}: {fmt(nuevo_presup)}")
            st.rerun()

    st.divider()
    st.markdown("**Historial**")
    historial = db.get_historial_presupuestos()
    if historial:
        df_hist = pd.DataFrame(historial)
        df_hist["gastado"] = df_hist["mes"].apply(db.get_total_mes)
        df_hist["invertido"] = df_hist["mes"].apply(db.get_inversiones_mes)
        df_hist["% usado"] = (df_hist["gastado"] / df_hist["monto_disponible"] * 100).round(1)
        df_hist["gastado"] = df_hist["gastado"].apply(fmt)
        df_hist["invertido"] = df_hist["invertido"].apply(fmt)
        df_hist["monto_disponible"] = df_hist["monto_disponible"].apply(fmt)
        st.dataframe(df_hist, use_container_width=True, hide_index=True)

    st.divider()
    st.subheader("Deudas")
    todas_deudas = db.get_todas_deudas()
    if todas_deudas:
        df_deudas = pd.DataFrame(todas_deudas)
        me_deben = df_deudas[(df_deudas["tipo"] == "presté") & (df_deudas["estado"] != "cerrada")]["monto"].sum()
        debo = df_deudas[(df_deudas["tipo"] == "me_prestaron") & (df_deudas["estado"] != "cerrada")]["monto"].sum()
        c1, c2, c3 = st.columns(3)
        c1.metric("Me deben", fmt(me_deben))
        c2.metric("Debo", fmt(debo))
        c3.metric("Neto", fmt(me_deben - debo))

        for _, row in df_deudas.iterrows():
            icono = "➡️" if row["tipo"] == "presté" else "⬅️"
            estado_color = "✅" if row["estado"] == "cerrada" else "🔴"
            col_a, col_b = st.columns([5, 1])
            col_a.write(f"{estado_color} {icono} **{row['persona']}** — {fmt(row['monto'])} ({row['tipo']}, {row['fecha']})")
            if row["estado"] != "cerrada":
                if col_b.button("Saldar", key=f"cerrar_{row['id']}"):
                    db.cerrar_deuda(row["id"])
                    st.rerun()
    else:
        st.write("Sin deudas registradas.")
