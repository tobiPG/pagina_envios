// ==========================
// src/pantallas/Dashboard.jsx
// ==========================

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { db } from "../../../shared/services/firebase.js";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  doc,
  limit,
} from "firebase/firestore";

import { useRole } from "../../../shared/hooks/useRole";
import { canSeeAllOrders } from "../../../shared/utils/roles";
import { ensureUsuarioActivo } from "../../../shared/utils/ensureUsuario";

/* ──────────────────────────────────────────────────────────────
   🎨 PALETA PASTEL (EDITA AQUÍ TUS COLORES)
   ----------------------------------------------------------------
   - bg:         Fondo general de la app/página.
   - surface:    Fondo de tarjetas (cards) y contenedores.
   - text:       Color de texto principal.
   - muted:      Texto secundario/ayuda.
   - border:     Bordes suaves (cards, tablas, inputs).
   - brand:      Color principal de marca (botón primario).
   - brandHover: Versión un poco más marcada para hover (sólida).
   - accent:     Acento verdoso para elementos informativos.
   - danger:     Fondo rojo pastel para acciones de peligro.
   - dangerHover:Rojo pastel un poco más marcado (hover).
   - chipLavender/Green/Orange/Red: fondos de las “pills” por estado.
   - chip*Text:  texto dentro de las pills de cada estado.
   - menuActive: fondo del link activo (o resaltes suaves).
   ────────────────────────────────────────────────────────────── */
const PALETA = {
  bg: "#f9fafb",
  surface: "#fdfafaff",
  text: "#212936",
  muted: "#6b7280",
  border: "#000000ff",

  brand: "#6271b6ff",       // Botón primario
  brandHover: "#93a2fa",  // Hover sólido del primario (no transparente)

  accent: "#a7f3d0",      // Acentos positivos

  danger: "#fecaca",      // Botón/estado de peligro pastel
  dangerHover: "#fca5a5", // Hover sólido del peligro (no transparente)

  // Pills por estado
  chipLavender: "#eef2ff",
  chipLavenderBorder: "#dde3ff",
  chipLavenderText: "#3742a6",

  chipGreen: "#e8fff4",
  chipGreenBorder: "#c8f4df",
  chipGreenText: "#0f5132",

  chipOrange: "#fff3e6",
  chipOrangeBorder: "#ffd9b8",
  chipOrangeText: "#8a3b12",

  chipRed: "#ffe9e9",
  chipRedBorder: "#ffcfcf",
  chipRedText: "#7f1d1d",

  menuActive: "#929dbfff",  // Fondeado suave para items activos
};

/* ──────────────────────────────────────────────────────────────
   💅 Inyección de CSS pastel (solo una vez)
   - Usa los colores de la paleta de arriba
   - Hover SIEMPRE sólido, sin cambios de opacidad
   - Evitamos botones “invisibles” sobre blanco
   ────────────────────────────────────────────────────────────── */
(function ensurePastelCss() {
  if (typeof document === "undefined") return;
  if (document.getElementById("pastelDashboardCSS")) return;

  const css = `
    :root {
      --bg: ${PALETA.bg};
      --surface: ${PALETA.surface};
      --text: ${PALETA.text};
      --muted: ${PALETA.muted};
      --border: ${PALETA.border};

      --brand: ${PALETA.brand};
      --brand-hover: ${PALETA.brandHover};

      --accent: ${PALETA.accent};

      --danger: ${PALETA.danger};
      --danger-hover: ${PALETA.dangerHover};

      --chip-lavender: ${PALETA.chipLavender};
      --chip-lavender-border: ${PALETA.chipLavenderBorder};
      --chip-lavender-text: ${PALETA.chipLavenderText};

      --chip-green: ${PALETA.chipGreen};
      --chip-green-border: ${PALETA.chipGreenBorder};
      --chip-green-text: ${PALETA.chipGreenText};

      --chip-orange: ${PALETA.chipOrange};
      --chip-orange-border: ${PALETA.chipOrangeBorder};
      --chip-orange-text: ${PALETA.chipOrangeText};

      --chip-red: ${PALETA.chipRed};
      --chip-red-border: ${PALETA.chipRedBorder};
      --chip-red-text: ${PALETA.chipRedText};

      --menu-active: ${PALETA.menuActive};
      --radius: 12px;
      --shadow: 0 10px 25px rgba(0, 0, 0, 0)
    }

    body { background: var(--bg); color: var(--text); }

    /* Tarjetas y secciones */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
    }
    .section { padding: 24px; }
    .section-title { margin: 0 0 12px; font-size: 20px; }

    /* Botones — SIEMPRE sólidos (sin opacity en hover) */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: 12px;
      border: 1px solid transparent;
      background: #ced7f9ff;            /* base suave para que nunca quede “invisible” */
      color: var(--text);
      font-weight: 700;
      cursor: pointer;
      transition: background .2s ease, color .2s ease, border-color .2s ease, transform .04s ease;
      text-decoration: none;
    }
    .btn:active { transform: translateY(1px); }

    /* Primario pastel (marca) */
    .btn-primary {
      background: var(--brand);
      color: #171f49ff;                 /* texto con contraste sobre pastel */
      border-color: var(--brand-hover);
    }
    .btn-primary:hover {
      background: var(--brand-hover); /* hover sólido, NO transparencia */
      border-color: #7f91f7;
      color: #272f4dff;
    }

    /* Secundario con borde visible y fondo pastel (no blanco puro) */
    .btn-outline {
      background: #f5f7ff;            /* pastel sólido */
      border-color: var(--border);
      color: #496076ff;
    }
    .btn-outline:hover {
      background: #e9edff;            /* un tono más marcado, PERO sólido */
      border-color: var(--brand-hover);
      color: #2a3350;
    }

    /* Peligro pastel (eliminar, etc.) */
    .btn-danger {
      background: var(--danger);
      border-color: var(--danger-hover);
      color: #5b1212;
    }
    .btn-danger:hover {
      background: var(--danger-hover);
      border-color: var(--danger-hover);
      color: #4b0f0f;
    }

    /* Pills / etiquetas de estado */
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      border-radius: 999px;
      font-weight: 700;
      font-size: 12px;
      letter-spacing: .2px;
      border: 1px solid var(--border);
      background: #f3f4f6;
      color: var(--muted);
      white-space: nowrap;
    }
    .pill.blue   { background: var(--chip-lavender); border-color: var(--chip-lavender-border); color: var(--chip-lavender-text); }
    .pill.green  { background: var(--chip-green);    border-color: var(--chip-green-border);    color: var(--chip-green-text); }
    .pill.orange { background: var(--chip-orange);   border-color: var(--chip-orange-border);   color: var(--chip-orange-text); }
    .pill.red    { background: var(--chip-red);      border-color: var(--chip-red-border);      color: var(--chip-red-text); }

    .chips { display: flex; gap: 8px; flex-wrap: wrap; }

    /* Tabla */
    .table { width: 100%; border-collapse: collapse; }
    .table th, .table td { padding: 10px 8px; border-bottom: 1px solid var(--border); }
    .table thead th { color: var(--muted); font-weight: 700; background: #fbfcff; }

    /* Bloque KPIs */
    .kpis { display: flex; gap: 12px; flex-wrap: wrap; }
    .kpi {
      border: 1px dashed #e6eaf5;
      border-radius: var(--radius);
      padding: 12px 14px;
      min-width: 150px;
      background: var(--surface);
    }
    .kpi .lbl { font-size: 12px; color: var(--muted); }
    .kpi .val { font-size: 22px; font-weight: 800; color: #374151; }

    /* Títulos y bloques */
    .title { display: flex; align-items: center; gap: 10px; }
    .muted { color: var(--muted); }

    /* Links activos o resaltados */
    .is-active { background: var(--menu-active); border-radius: var(--radius); }
  `;

  const el = document.createElement("style");
  el.id = "pastelDashboardCSS";
  el.innerHTML = css;
  document.head.appendChild(el);
})();

// ───────────────── Helpers ─────────────────
const todayISO = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
};
function tsToMs(ts) {
  try {
    if (!ts) return NaN;
    if (typeof ts?.toDate === "function") return ts.toDate().getTime();
    if (typeof ts?.seconds === "number") {
      return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
    }
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts === "number") return ts;
    if (typeof ts === "string") {
      const m = new Date(ts).getTime();
      if (Number.isFinite(m)) return m;
    }
  } catch {}
  return NaN;
}
function msProgramada(o) {
  const f = (o?.fecha || "").trim();
  const h = (o?.hora || "").trim();
  if (!f) return NaN;
  const hhmm = /^\d{2}:\d{2}$/.test(h) ? h : "00:00";
  const ms = new Date(`${f}T${hhmm}:00`).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}
const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(0)}%` : "—");

// ───────────────── Componente ─────────────────
export default function Dashboard() {
  const { role } = useRole();
  const navigate = useNavigate();

  // Sesión
  let usuario = null;
  try {
    usuario = JSON.parse(localStorage.getItem("usuarioActivo") || "null");
  } catch {}
  const empresaId =
    usuario?.empresaId != null && usuario?.empresaId !== ""
      ? String(usuario.empresaId)
      : null;
  if (!empresaId) {
    return (
      <div className="section" style={{ color: "var(--danger)" }}>
        Falta <code>empresaId</code> en sesión.
      </div>
    );
  }

  // Estado
  const [ordenes, setOrdenes] = useState([]);
  const [cambios, setCambios] = useState([]);
  const [mensajeros, setMensajeros] = useState([]);
  const [err, setErr] = useState("");

  // Ajustes (para on-time)
  const [toleranciaMin, setToleranciaMin] = useState(15);
  useEffect(() => {
    const ref = doc(db, "ajustesEmpresa", empresaId);
    const unsub = onSnapshot(ref, (snap) => {
      const d = snap.data();
      const t = d?.alertas?.toleranciaMin;
      if (Number.isFinite(t)) setToleranciaMin(t);
    });
    return () => unsub();
  }, [empresaId]);

  // Reloj (para “por vencer”)
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  // Suscripciones
  useEffect(() => {
    let unsubOrders = null;
    (async () => {
      const ok = await ensureUsuarioActivo();
      if (!ok) {
        setErr("Sesión inválida.");
        return;
      }
      try {
        const ref = collection(db, "ordenes");
        unsubOrders = onSnapshot(
          query(ref, where("empresaId", "==", empresaId), orderBy("createdAt", "desc")),
          (snap) => setOrdenes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
          (e) => setErr(e?.message || "No pude leer órdenes.")
        );
      } catch (e) {
        setErr(e?.message || "No pude iniciar suscripción de órdenes.");
      }
    })();
    return () => unsubOrders && unsubOrders();
  }, [empresaId]);

  useEffect(() => {
    let unsubUbi = null;
    (async () => {
      const ok = await ensureUsuarioActivo();
      if (!ok) return;
      try {
        const ref = collection(db, "ubicacionesMensajeros");
        unsubUbi = onSnapshot(
          query(ref, where("empresaId", "==", empresaId)),
          (snap) =>
            setMensajeros(
              snap.docs.map((d) => {
                const x = d.data() || {};
                return {
                  id: d.id,
                  nombre: x.nombre || d.id,
                  estado: (x.estado || "disponible").toLowerCase(),
                  lastPingAt: x.lastPingAt?.toDate ? x.lastPingAt.toDate() : null,
                };
              })
            ),
          () => {}
        );
      } catch {}
    })();
    return () => unsubUbi && unsubUbi();
  }, [empresaId]);

  useEffect(() => {
    let unsubCambios = null;
    (async () => {
      const ok = await ensureUsuarioActivo();
      if (!ok) return;
      try {
        const ref = collection(db, "cambiosOrden");
        unsubCambios = onSnapshot(
          query(ref, where("empresaId", "==", empresaId), orderBy("createdAt", "desc"), limit(12)),
          (snap) =>
            setCambios(
              snap.docs.map((d) => {
                const data = d.data() || {};
                return {
                  id: d.id,
                  createdAt: data.createdAt,
                  orderId: data.orderId || "—",
                  actor: data.actorNombre || "desconocido",
                  rol: data.actorRol || "—",
                  cambios: Array.isArray(data.cambios) ? data.cambios : [],
                  motivo: data.motivo || "",
                };
              })
            ),
          () => {}
        );
      } catch {}
    })();
    return () => unsubCambios && unsubCambios();
  }, [empresaId]);

  // Datos “hoy”
  const hoy = todayISO();
  const hoyMs0 = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);
  const hoyMsEnd = useMemo(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }, []);

  const ordenesHoy = useMemo(() => {
    const list = [];
    for (const o of ordenes) {
      if (o?.fecha === hoy) {
        list.push(o);
      } else {
        const c = tsToMs(o.createdAt);
        if (Number.isFinite(c) && c >= hoyMs0 && c <= hoyMsEnd) list.push(o);
        else {
          const p = msProgramada(o);
          if (Number.isFinite(p) && p >= hoyMs0 && p <= hoyMsEnd) list.push(o);
        }
      }
    }
    return list;
  }, [ordenes, hoy, hoyMs0, hoyMsEnd]);

  const { pendHoy, entrHoy, onTimeEntrHoy, porVencerHoy, kpi } = useMemo(() => {
    const tolMs = (Number.isFinite(toleranciaMin) ? toleranciaMin : 15) * 60000;
    const pend = [];
    const entr = [];
    let onTime = 0;

    const porVencer = [];
    const porVencerWin = 30 * 60000;

    for (const o of ordenesHoy) {
      if (o.entregado) {
        entr.push(o);
        const entMs = tsToMs(o.fechaEntregada);
        const prog = msProgramada(o);
        if (Number.isFinite(entMs) && Number.isFinite(prog) && entMs <= prog + tolMs) {
          onTime++;
        }
      } else {
        pend.push(o);
        const prog = msProgramada(o);
        const rem = Number.isFinite(prog) ? prog + tolMs - nowMs : null;
        if (rem != null && rem <= porVencerWin && rem > 0) porVencer.push(o);
      }
    }

    const k = {
      totalHoy: ordenesHoy.length,
      pendientes: pend.length,
      entregadas: entr.length,
      onTime: onTime,
      onTimePct: pct(onTime, entr.length || 0),
      porVencer: porVencer.length,
    };
    return { pendHoy: pend, entrHoy: entr, onTimeEntrHoy: onTime, porVencerHoy: porVencer, kpi: k };
  }, [ordenesHoy, toleranciaMin, nowMs]);

  // Mensajeros activos: ping en últimos 10 min
  const mensActivos = useMemo(() => {
    const tenMin = 10 * 60 * 1000;
    const act = mensajeros.filter((m) => {
      const t = m.lastPingAt instanceof Date ? m.lastPingAt.getTime() : NaN;
      return Number.isFinite(t) && nowMs - t <= tenMin;
    });
    return {
      activos: act.length,
      total: mensajeros.length,
      detalle: act.slice(0, 12),
    };
  }, [mensajeros, nowMs]);

  // Columnas
  const colsPend = useMemo(() => {
    const base = [
      { key: "cliente", label: "Cliente", min: 160 },
      { key: "numeroFactura", label: "Factura/Doc" },
      { key: "hora", label: "Hora" },
      { key: "asignadoNombre", label: "Asignado" },
      { key: "zona", label: "Zona" },
      { key: "estado", label: "Estado" },
      { key: "acciones", label: "Acciones" },
    ];
    if (canSeeAllOrders(role)) base.splice(5, 0, { key: "usuario", label: "Registrado por" });
    return base;
  }, [role]);

  const colsEnt = useMemo(() => {
    const base = [
      { key: "cliente", label: "Cliente", min: 160 },
      { key: "numeroFactura", label: "Factura/Doc" },
      { key: "hora", label: "Hora prog." },
      { key: "entregada", label: "Entregada" },
      { key: "onTime", label: "On-time" },
      { key: "asignadoNombre", label: "Asignado" },
      { key: "acciones", label: "Acciones" },
    ];
    if (canSeeAllOrders(role)) base.splice(5, 0, { key: "usuario", label: "Registrado por" });
    return base;
  }, [role]);

  return (
    <div className="container" style={{ paddingTop: 16, paddingBottom: 24 }}>
      {/* ╭──────────────── Header (botones de navegación) ───────────────╮
         │ - Colores de botones: .btn-outline (pastel sólido)           │
         │ - Botón principal: .btn-primary (marca pastel)               │
         │ - Cambia los colores en PALETA (arriba), NO aquí             │
         ╰──────────────────────────────────────────────────────────────╯ */}
      <div className="card section" style={{ display: "flex", gap: 12 }}>
        <div className="title" style={{ justifyContent: "space-between", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 className="section-title" style={{ margin: 0 }}>📊 Panel</h2>
            {/* Pill azul lavanda → usa chipLavender* en PALETA */}
            <span className="pill blue">Rol: <b>{role}</b></span>
          </div>
          <div className="chips">
            <Link className="btn btn-outline" to="/ordenes">📋 Órdenes</Link>
            <Link className="btn btn-outline" to="/alertas-sla">⏱️ Alertas SLA</Link>
            <Link className="btn btn-outline" to="/mapa">🗺️ Mapa</Link>
            <Link className="btn btn-outline" to="/historial-cambios">🗂️ Historial</Link>
            {/* Botón primario usa brand/brandHover */}
            <Link className="btn btn-primary" to="/nueva-orden">➕ Nueva orden</Link>
          </div>
        </div>
        {err && <div style={{ color: "var(--danger)" }}>{err}</div>}
      </div>

      {/* ╭──────────────── KPIs ─────────────────────────────────────────╮
         │ - Colores de texto/labels desde --text / --muted             │
         │ - Bordes de KPIs usan --border (pastel)                      │
         ╰──────────────────────────────────────────────────────────────╯ */}
      <div className="card section" style={{ marginTop: 12 }}>
        <div className="kpis">
          <div className="kpi">
            <div className="lbl">Órdenes de hoy</div>
            <div className="val">{kpi.totalHoy}</div>
          </div>
          <div className="kpi">
            <div className="lbl">Pendientes</div>
            <div className="val">{kpi.pendientes}</div>
          </div>
          <div className="kpi">
            <div className="lbl">Entregadas</div>
            <div className="val">{kpi.entregadas}</div>
          </div>
          <div className="kpi">
            <div className="lbl">On-time (hoy)</div>
            <div className="val">{`${kpi.onTime} (${kpi.onTimePct})`}</div>
          </div>
          <div className="kpi">
            <div className="lbl">Por vencer (≤30m)</div>
            <div className="val">{kpi.porVencer}</div>
          </div>
          <div className="kpi">
            <div className="lbl">Mensajeros activos</div>
            <div className="val">
              {mensActivos.activos} <span className="muted">/ {mensActivos.total}</span>
            </div>
          </div>
          <div className="muted" style={{ marginLeft: "auto", alignSelf: "center" }}>
            {new Date(nowMs).toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* ╭──────────────── Mensajeros activos ───────────────────────────╮
         │ - Pills verdes/azules usan chipGreen/chipLavender            │
         │ - Botón “Abrir mapa” es .btn-outline                         │
         ╰──────────────────────────────────────────────────────────────╯ */}
      <section className="card section" style={{ marginTop: 12 }}>
        <div className="title" style={{ justifyContent: "space-between" }}>
          <h3 className="section-title">🚴 Mensajeros activos</h3>
          <Link className="btn btn-outline" to="/mapa">Abrir mapa</Link>
        </div>
        {mensActivos.detalle.length ? (
          <div className="chips" style={{ marginTop: 6 }}>
            {mensActivos.detalle.map((m) => (
              <span key={m.id} className={`pill ${m.estado === "en_ruta" ? "green" : "blue"}`}>
                {m.nombre} · {m.estado}
              </span>
            ))}
          </div>
        ) : (
          <div className="muted">Sin pings recientes (&lt; 10 min).</div>
        )}
      </section>

      {/* ╭──────────────── Pendientes de hoy ────────────────────────────╮
         │ - Pills SLA: .pill.orange (por vencer) / .pill.red (vencida) │
         │ - Links acción: .btn-outline (hover sólido)                  │
         ╰──────────────────────────────────────────────────────────────╯ */}
      <section className="card section" style={{ marginTop: 12 }}>
        <div className="title" style={{ justifyContent: "space-between" }}>
          <h3 className="section-title">⏳ Pendientes de hoy</h3>
          <div className="chips">
            <span className="pill orange">Por vencer: <b>{porVencerHoy.length}</b></span>
            <Link className="btn btn-outline" to="/alertas-sla">Ver en Alertas SLA</Link>
          </div>
        </div>
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table className="table">
            <thead>
              <tr>
                {colsPend.map((c) => (
                  <th key={c.key} style={{ minWidth: c.min || undefined }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pendHoy.length ? (
                pendHoy.slice(0, 50).map((o) => {
                  const prog = msProgramada(o);
                  const tolMs = (Number.isFinite(toleranciaMin) ? toleranciaMin : 15) * 60000;
                  const rem = Number.isFinite(prog) ? prog + tolMs - nowMs : null;
                  const slaTxt =
                    rem == null
                      ? "—"
                      : rem <= 0
                      ? "Vencida"
                      : rem <= 30 * 60000
                      ? "Por vencer"
                      : "En tiempo";
                  const slaClass =
                    rem == null ? "" : rem <= 0 ? "red" : rem <= 30 * 60000 ? "orange" : "green";

                  return (
                    <tr key={o.id}>
                      <td style={{ minWidth: 160 }}>{o.cliente || "—"}</td>
                      <td>{o.numeroFactura || "—"}</td>
                      <td>{o.hora || "—"}</td>
                      <td>{o.asignadoNombre || "—"}</td>
                      <td>{o.zona || "—"}</td>
                      {canSeeAllOrders(role) && <td>{o.usuario || "—"}</td>}
                      <td>
                        <span className={`pill ${slaClass}`}>{slaTxt}</span>
                      </td>
                      <td>
                        <div className="chips">
                          <Link className="btn btn-outline" to={`/orden/${o.id}`}>Ver orden</Link>
                          <Link className="btn btn-outline" to={`/mapa/${o.id}`}>Ver en mapa</Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={colsPend.length} className="muted">
                    No hay pendientes hoy.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ╭──────────────── Entregadas hoy ───────────────────────────────╮
         │ - Pill verde (on-time) / roja (fuera SLA)                    │
         │ - “Analizar SLA” botón outline pastel                        │
         ╰──────────────────────────────────────────────────────────────╯ */}
      <section className="card section" style={{ marginTop: 12 }}>
        <div className="title" style={{ justifyContent: "space-between" }}>
          <h3 className="section-title">✅ Entregadas hoy</h3>
          <div className="chips">
            <span className="pill green">
              On-time: <b>
                {onTimeEntrHoy} ({pct(onTimeEntrHoy, Math.max(1, kpi.entregadas))})
              </b>
            </span>
            <Link className="btn btn-outline" to="/alertas-sla">Analizar SLA</Link>
          </div>
        </div>
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table className="table">
            <thead>
              <tr>
                {colsEnt.map((c) => (
                  <th key={c.key} style={{ minWidth: c.min || undefined }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entrHoy.length ? (
                entrHoy.slice(0, 50).map((o) => {
                  const entMs = tsToMs(o.fechaEntregada);
                  const entStr = Number.isFinite(entMs) ? new Date(entMs).toLocaleTimeString() : "—";
                  const prog = msProgramada(o);
                  const tolMs = (Number.isFinite(toleranciaMin) ? toleranciaMin : 15) * 60000;
                  const onTime =
                    Number.isFinite(prog) && Number.isFinite(entMs) && entMs <= prog + tolMs;

                  return (
                    <tr key={o.id}>
                      <td style={{ minWidth: 160 }}>{o.cliente || "—"}</td>
                      <td>{o.numeroFactura || "—"}</td>
                      <td>{o.hora || "—"}</td>
                      {canSeeAllOrders(role) && <td>{o.usuario || "—"}</td>}
                      <td>{entStr}</td>
                      <td>
                        <span className={`pill ${onTime ? "green" : "red"}`}>
                          {onTime ? "On-time" : "Fuera SLA"}
                        </span>
                      </td>
                      <td>{o.asignadoNombre || "—"}</td>
                      <td>
                        <div className="chips">
                          <Link className="btn btn-outline" to={`/orden/${o.id}`}>Ver orden</Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={colsEnt.length} className="muted">
                    No hay entregas hoy.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ╭──────────────── Actividad reciente ───────────────────────────╮
         │ - Pills neutrales con borde pastel                           │
         │ - Botón outline (hover sólido)                               │
         ╰──────────────────────────────────────────────────────────────╯ */}
      <section className="card section" style={{ marginTop: 12 }}>
        <div className="title" style={{ justifyContent: "space-between" }}>
          <h3 className="section-title">🗂️ Actividad reciente</h3>
          <Link className="btn btn-outline" to="/historial-cambios">Abrir historial</Link>
        </div>
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Orden</th>
                <th>Actor</th>
                <th>Rol</th>
                <th>Cambios</th>
                <th>Motivo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cambios.length ? (
                cambios.map((x) => {
                  const ms = tsToMs(x.createdAt);
                  const fecha = Number.isFinite(ms) ? new Date(ms).toLocaleString() : "—";
                  return (
                    <tr key={x.id}>
                      <td>{fecha}</td>
                      <td style={{ whiteSpace: "nowrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                        {x.orderId}
                      </td>
                      <td>{x.actor}</td>
                      <td><span className="pill">{x.rol}</span></td>
                      <td>
                        {x.cambios && x.cambios.length ? (
                          <div className="chips">
                            {x.cambios.slice(0, 4).map((c, i) => (
                              <span key={`${x.id}-${i}`} className="pill">{c?.campo || "—"}</span>
                            ))}
                            {x.cambios.length > 4 && (
                              <span className="pill muted">+{x.cambios.length - 4}</span>
                            )}
                          </div>
                        ) : "—"}
                      </td>
                      <td>{x.motivo || "—"}</td>
                      <td>
                        <div className="chips">
                          <Link className="btn btn-outline" to={`/orden/${x.orderId}`}>Ver orden</Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="muted">
                    Sin actividad reciente.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
