// src/features/orders/pages/OrderHistoryPage.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { db } from "../../../shared/services/firebase.js";
import { collection, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { ensureUsuarioActivo } from "../../../shared/utils/ensureUsuario";

/** Helpers fecha/ts */
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
      const d = new Date(ts).getTime();
      if (Number.isFinite(d)) return d;
    }
  } catch {}
  return NaN;
}
function msToLocal(ms) {
  return Number.isFinite(ms) ? new Date(ms).toLocaleString() : "—";
}
function fmt(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
}
function equalish(a, b) {
  try {
    if (a === b) return true;
    const sa = typeof a === "object" ? JSON.stringify(a) : String(a ?? "");
    const sb = typeof b === "object" ? JSON.stringify(b) : String(b ?? "");
    return sa === sb;
  } catch { return false; }
}
function exportCSV(filename, rows) {
  if (!rows?.length) return;
  const cols = Object.keys(rows[0]);
  const csv = [
    cols.join(","),
    ...rows.map((r) =>
      cols.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Estilos de tabla ──
const th = { textAlign: "left", borderBottom: "1px solid #eee", padding: "8px 10px", background: "#fafafa" };
const td = { borderBottom: "1px solid #f2f2f2", padding: "8px 10px" };
const tdMono = { ...td, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };
const tdCenter = { ...td, textAlign: "center" };

// ── Clasificación de roles “mensajero” ──
const ROLES_MENSAJERO = new Set([
  "mensajero","mensajeros","rider","riders","courier",
  "delivery","deliveryman","repartidor","repartidores",
  "conductor","driver"
]);
const norm = (s) => String(s || "").trim().toLowerCase();
const actorTipoByRol = (rol) => (ROLES_MENSAJERO.has(norm(rol)) ? "mensajero" : "operador");

// ── CSS inyectado ──
try {
  if (!document.getElementById("historialCambiosCss")) {
    const css = document.createElement("style");
    css.id = "historialCambiosCss";
    css.innerHTML = `
      .card{border:1px solid #e5e7eb;border-radius:12px;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.04);padding:12px}
      .tbl{border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;background:#fff}
      .tbl tbody tr:nth-child(odd) td{background:#fbfdff}
      .tbl tbody tr:hover td{background:#eef2ff}
      .pill{display:inline-block;padding:6px 10px;border-radius:999px;border:1px solid #e5e7eb;background:#f8fafc;color:#374151;font-size:12px;font-weight:600;line-height:1}
      .pill.blue{background:#eef2ff;border-color:#c7d2fe;color:#3730a3}
      .pill.green{background:#ecfdf5;border-color:#bbf7d0;color:#065f46}
      .pill.gray{background:#f1f5f9;border-color:#e2e8f0;color:#334155}
      .pill.orange{background:#fff7ed;border-color:#fed7aa;color:#9a3412}
      .pill.purple{background:#f5f3ff;border-color:#ddd6fe;color:#6d28d9}
      .tag{display:inline-block;padding:4px 8px;border-radius:999px;border:1px solid #e5e7eb;background:#f8fafc;font-size:11px;color:#475569;margin:2px 4px 0 0}
      .btn{background:#fff;color:#374151;border:1px solid #e5e7eb;border-radius:10px;padding:8px 12px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
      .btn:hover{background:#f8fafc}
      .btn.primary{background:#6366f1;border-color:#6366f1;color:#fff}
      .btn.primary:hover{filter:brightness(.96)}
      .actions{display:flex;gap:8px;flex-wrap:wrap}
      .row-msg td{box-shadow: inset 4px 0 0 0 #16a34a66}
      .row-op td{box-shadow: inset 4px 0 0 0 #6d28d966}
    `;
    document.head.appendChild(css);
  }
} catch {}

export default function HistorialCambios() {
  const [searchParams] = useSearchParams();

  // Sesión / empresa
  let usuario = null;
  try { usuario = JSON.parse(localStorage.getItem("usuarioActivo") || "null"); } catch {}
  const empresaId =
    usuario?.empresaId != null && usuario?.empresaId !== "" ? String(usuario.empresaId) : null;

  // Filtros (mes actual por defecto)
  const hoy = new Date();
  const defaultDesde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const [desde, setDesde] = useState(defaultDesde.toISOString().slice(0, 10));
  const [hasta, setHasta] = useState(hoy.toISOString().slice(0, 10));

  // Filtro por OrderID (?orderId=...)
  const qpOrderId = (searchParams.get("orderId") || "").trim();
  const [orderId, setOrderId] = useState(qpOrderId);

  // Ver sólo diferencias reales
  const [soloDiferencias, setSoloDiferencias] = useState(true);

  // Filtro por “quién editó”
  const [actorFiltro, setActorFiltro] = useState("todos");

  // Datos
  const [logs, setLogs] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [liveMeta, setLiveMeta] = useState({ fromCache: false, pendingLocal: 0, total: 0 });

  // Ver todo
  function handleVerTodos() {
    setOrderId("");
    setDesde("2000-01-01");
    setHasta(new Date().toISOString().slice(0, 10));
    setActorFiltro("todos");
  }

  // ==== Lectura estricta (sin fallbacks) ====
  useEffect(() => {
    let unsub = null;
    (async () => {
      setCargando(true);
      setError("");
      const ok = await ensureUsuarioActivo();
      if (!ok || !empresaId) {
        setError("Sesión inválida o falta empresaId.");
        setCargando(false);
        return;
      }
      try {
        const ref = collection(db, "cambiosOrden");
        const q1 = query(ref, where("empresaId", "==", empresaId), orderBy("createdAt", "desc"));
        unsub = onSnapshot(
          q1,
          (snap) => {
            const rows = snap.docs.map((d) => ({
              id: d.id,
              ...d.data(),
              __pending: d.metadata.hasPendingWrites === true,
            }));
            setLogs(rows);
            const pendingLocal = rows.reduce((n, r) => n + (r.__pending ? 1 : 0), 0);
            setLiveMeta({ fromCache: snap.metadata.fromCache, pendingLocal, total: rows.length });
            setCargando(false);
          },
          (err) => {
            console.error("onSnapshot(cambiosOrden):", err?.code, err?.message);
            setError(err?.message || "No se pudo leer el historial (verifica índice empresaId+createdAt y reglas).");
            setCargando(false);
          }
        );
      } catch (e) {
        console.error("query(cambiosOrden) error:", e);
        setError(e?.message || "No se pudo iniciar la suscripción.");
        setCargando(false);
      }
    })();
    return () => { if (unsub) unsub(); };
  }, [empresaId]);

  // PRE-cálculo: órdenes “mixto”
  const ordenesMixtas = useMemo(() => {
    const d = new Date(desde); d.setHours(0,0,0,0);
    const h = new Date(hasta); h.setHours(23,59,59,999);
    const msD = d.getTime(), msH = h.getTime();
    const targetOrder = (orderId || "").trim().toLowerCase();

    const map = new Map(); // orderId -> {m:true?, o:true?}
    for (const log of logs) {
      const ms = tsToMs(log.createdAt);
      if (Number.isFinite(ms) && (ms < msD || ms > msH)) continue;
      const oid = String(log.orderId || "—");
      if (targetOrder && oid.toLowerCase() !== targetOrder) continue;
      const tipo = actorTipoByRol(log.actorRol);
      const cur = map.get(oid) || { m:false, o:false };
      if (tipo === "mensajero") cur.m = true; else cur.o = true;
      map.set(oid, cur);
    }
    const setOut = new Set();
    for (const [oid, v] of map.entries()) if (v.m && v.o) setOut.add(oid);
    return setOut;
  }, [logs, desde, hasta, orderId]);

  // DETALLE
  const filas = useMemo(() => {
    if (!Array.isArray(logs)) return [];
    const d = new Date(desde); d.setHours(0, 0, 0, 0);
    const h = new Date(hasta); h.setHours(23, 59, 59, 999);
    const msD = d.getTime(), msH = h.getTime();
    const targetOrder = (orderId || "").trim().toLowerCase();

    const out = [];
    for (const log of logs) {
      const ms = tsToMs(log.createdAt);
      if (Number.isFinite(ms) && (ms < msD || ms > msH)) continue;
      const oid = String(log.orderId || "—");
      if (targetOrder && oid.toLowerCase() !== targetOrder) continue;

      const actorTipo = actorTipoByRol(log.actorRol);
      if (actorFiltro === "mensajero" && actorTipo !== "mensajero") continue;
      if (actorFiltro === "operador" && actorTipo !== "operador") continue;
      if (actorFiltro === "mixto" && !ordenesMixtas.has(oid)) continue;

      const base = {
        _logId: log.id,
        orderId: oid,
        actor: log.actorNombre || "desconocido",
        rol: log.actorRol || "—",
        actorTipo,
        createdAtMs: ms,
        createdAtStr: msToLocal(ms),
        motivo: log.motivo || "",
      };

      const arrCambios = Array.isArray(log.cambios) ? log.cambios : [];
      if (!arrCambios.length) {
        out.push({ ...base, campo: "(sin detalle)", antes: "", despues: "" });
      } else {
        for (const c of arrCambios) {
          if (soloDiferencias && equalish(c?.antes, c?.despues)) continue;
          out.push({ ...base, campo: c?.campo || "—", antes: fmt(c?.antes), despues: fmt(c?.despues) });
        }
      }
    }
    out.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    return out;
  }, [logs, desde, hasta, orderId, soloDiferencias, actorFiltro, ordenesMixtas]);

  // RESUMEN por orden
  const ordenesAgrupadas = useMemo(() => {
    if (!Array.isArray(logs)) return [];
    const d = new Date(desde); d.setHours(0, 0, 0, 0);
    const h = new Date(hasta); h.setHours(23, 59, 59, 999);
    const msD = d.getTime(), msH = h.getTime();
    const targetOrder = (orderId || "").trim().toLowerCase();

    const map = new Map();
    for (const log of logs) {
      const ms = tsToMs(log.createdAt);
      if (Number.isFinite(ms) && (ms < msD || ms > msH)) continue;
      const oid = String(log.orderId || "—");
      if (targetOrder && oid.toLowerCase() !== targetOrder) continue;

      if (!map.has(oid)) {
        map.set(oid, {
          orderId: oid, totalCambios: 0, firstMs: Number.POSITIVE_INFINITY, lastMs: 0,
          campos: new Set(), actores: new Set(), motivos: new Set(),
          editsMensajero: 0, editsOperador: 0, ultActor: null, ultRol: null,
        });
      }
      const rec = map.get(oid);

      const tipo = actorTipoByRol(log.actorRol);
      if (tipo === "mensajero") rec.editsMensajero += 1; else rec.editsOperador += 1;

      const arrCambios = Array.isArray(log.cambios) && log.cambios.length ? log.cambios : [{ campo: "(sin detalle)" }];
      for (const c of arrCambios) {
        rec.totalCambios += 1;
        if (c?.campo) rec.campos.add(String(c.campo));
      }
      if (log.actorNombre) rec.actores.add(String(log.actorNombre));
      if (log.motivo) rec.motivos.add(String(log.motivo));

      if (Number.isFinite(ms)) {
        if (ms < rec.firstMs) rec.firstMs = ms;
        if (ms > rec.lastMs) { rec.lastMs = ms; rec.ultActor = log.actorNombre || null; rec.ultRol = log.actorRol || null; }
      }
    }

    let out = Array.from(map.values()).map((r) => ({
      orderId: r.orderId,
      totalCambios: r.totalCambios,
      camposCount: r.campos.size,
      campos: Array.from(r.campos),
      actores: Array.from(r.actores),
      motivos: Array.from(r.motivos),
      firstMs: r.firstMs,
      lastMs: r.lastMs,
      firstStr: msToLocal(r.firstMs),
      lastStr: msToLocal(r.lastMs),
      editsMensajero: r.editsMensajero,
      editsOperador: r.editsOperador,
      mixto: r.editsMensajero > 0 && r.editsOperador > 0,
      ultActor: r.ultActor,
      ultRol: r.ultRol,
    }));

    if (actorFiltro === "mensajero") out = out.filter((r) => r.editsMensajero > 0 && r.editsOperador === 0);
    else if (actorFiltro === "operador") out = out.filter((r) => r.editsOperador > 0 && r.editsMensajero === 0);
    else if (actorFiltro === "mixto") out = out.filter((r) => r.mixto);

    out.sort((a, b) => (b.lastMs || 0) - (a.lastMs || 0));
    return out;
  }, [logs, desde, hasta, orderId, actorFiltro]);

  const totalLogs = logs.length;
  const totalFilas = filas.length;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>🗂️ Historial de cambios</h2>
        <button className="btn" onClick={handleVerTodos}>👁️ Ver TODOS los cambios</button>
        <div style={{ marginLeft: "auto" }}>
          <Link className="btn" to="/ordenes">&larr; Volver a Órdenes</Link>
        </div>
      </div>

      {/* Estado vivo */}
      <div className="card" style={{ marginTop: 10 }}>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
          <span className="pill gray">cache: <b>{String(liveMeta.fromCache)}</b></span>
          <span className="pill blue">pendientes: <b>{liveMeta.pendingLocal}</b></span>
          <span className="pill green">docs: <b>{liveMeta.total}</b></span>
        </div>
      </div>

      {/* Filtros */}
      <h3 style={{ marginTop: 16 }}>Filtros</h3>
      <div className="card" style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap", marginTop: 6 }}>
        <div>
          <label>Desde</label><br />
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div>
          <label>Hasta</label><br />
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div>
          <label>Order ID</label><br />
          <input
            type="text"
            placeholder="abc123…"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            style={{ minWidth: 180 }}
          />
        </div>

        <label style={{ marginLeft: 8 }}>
          <input type="checkbox" checked={soloDiferencias} onChange={(e) => setSoloDiferencias(e.target.checked)} />{" "}
          Sólo diferencias (antes ≠ después)
        </label>

        <div style={{ marginLeft: 8 }}>
          <label>Quién editó</label><br />
          <select value={actorFiltro} onChange={(e) => setActorFiltro(e.target.value)}>
            <option value="todos">Todos</option>
            <option value="mensajero">Solo mensajero</option>
            <option value="operador">Solo operador</option>
            <option value="mixto">Órdenes mixtas (ambos)</option>
          </select>
        </div>

        <div style={{ marginLeft: "auto" }} className="actions">
          <button
            className="btn"
            onClick={() =>
              exportCSV(
                `cambios_${desde}_a_${hasta}${orderId ? "_order_" + orderId : ""}.csv`,
                filas.map((r) => ({
                  fecha: r.createdAtStr,
                  orderId: r.orderId,
                  campo: r.campo,
                  antes: r.antes,
                  despues: r.despues,
                  actor: r.actor,
                  rol: r.rol,
                  actorTipo: r.actorTipo,
                  motivo: r.motivo,
                }))
              )
            }
            disabled={!filas.length}
          >
            ⬇️ Exportar CSV (detalle)
          </button>
          <button
            className="btn"
            onClick={() =>
              exportCSV(
                `ordenes_cambiadas_${desde}_a_${hasta}${orderId ? "_order_" + orderId : ""}.csv`,
                ordenesAgrupadas.map((r) => ({
                  orderId: r.orderId,
                  totalCambios: r.totalCambios,
                  camposTocados: r.campos.join(" | "),
                  actores: r.actores.join(" | "),
                  motivos: r.motivos.join(" | "),
                  primerCambio: r.firstStr,
                  ultimoCambio: r.lastStr,
                  editsMensajero: r.editsMensajero,
                  editsOperador: r.editsOperador,
                  mixto: r.mixto ? "sí" : "no",
                  ultimoEditor: r.ultActor,
                  ultimoRol: r.ultRol,
                }))
              )
            }
            disabled={!ordenesAgrupadas.length}
          >
            ⬇️ Exportar CSV (resumen)
          </button>
        </div>
      </div>

      {/* Estado de carga / error */}
      {cargando && <div style={{ marginTop: 8 }}>Cargando…</div>}
      {!!error && <div style={{ marginTop: 8, color: "#b00" }}>{error}</div>}

      <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
        Logs totales: <b>{totalLogs}</b> · Filas visibles (detalle): <b>{filas.length}</b> · Órdenes cambiadas (resumen): <b>{ordenesAgrupadas.length}</b>
      </div>

      {/* Resumen */}
      <section style={{ marginTop: 16 }}>
        <h3 style={{ margin: "8px 0" }}>▶ Órdenes cambiadas (resumen)</h3>
        <div style={{ overflowX: "auto" }}>
          {ordenesAgrupadas.length ? (
            <table className="tbl" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Orden</th>
                  <th style={th}>Total cambios</th>
                  <th style={th}>Tipo de ediciones</th>
                  <th style={th}>Campos tocados</th>
                  <th style={th}>Actores</th>
                  <th style={th}>Motivos</th>
                  <th style={th}>Primer cambio</th>
                  <th style={th}>Último cambio</th>
                  <th style={th}>Último editor</th>
                  <th style={th}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ordenesAgrupadas.map((r) => (
                  <tr key={`grp-${r.orderId}`}>
                    <td style={{ ...tdMono, whiteSpace: "nowrap" }}>{r.orderId}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{r.totalCambios}</td>
                    <td style={td}>
                      {r.editsMensajero > 0 && <span className="pill green">Mensajero: {r.editsMensajero}</span>}{" "}
                      {r.editsOperador > 0 && <span className="pill purple">Operador: {r.editsOperador}</span>}{" "}
                      {r.mixto && <span className="pill blue">Mixto</span>}
                    </td>
                    <td style={td}>
                      {r.campos.length ? r.campos.map((c) => <span className="tag" key={`${r.orderId}-c-${c}`}>{c}</span>) : "—"}
                    </td>
                    <td style={td}>
                      {r.actores.length ? r.actores.map((a) => <span className="tag" key={`${r.orderId}-a-${a}`}>{a}</span>) : "—"}
                    </td>
                    <td style={td}>
                      {r.motivos.length ? r.motivos.map((m) => <span className="tag" key={`${r.orderId}-m-${m}`}>{m}</span>) : "—"}
                    </td>
                    <td style={td}>{r.firstStr}</td>
                    <td style={td}>{r.lastStr}</td>
                    <td style={td}>
                      {r.ultActor ? (
                        <>
                          <div><b>{r.ultActor}</b></div>
                          <div className="pill purple" style={{ display: "inline-block", marginTop: 4 }}>
                            {r.ultRol || "—"}
                          </div>
                        </>
                      ) : "—"}
                    </td>
                    <td style={td}>
                      <div className="actions">
                        <button className="btn" title="Filtrar la vista detallada por esta orden" onClick={() => setOrderId(r.orderId)}>
                          Ver cambios
                        </button>
                        <Link className="btn" to={`/orden/${r.orderId}`}>Ver orden</Link>
                        <Link className="btn primary" to={`/mapa/${r.orderId}`}>Ver mapa</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="card">No hay órdenes con cambios en el rango/criterio.</div>
          )}
        </div>
      </section>

      {/* Detalle */}
      <section style={{ marginTop: 22 }}>
        <h3 style={{ margin: "8px 0" }}>▶ Cambios detallados</h3>
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table className="tbl" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Fecha</th>
                <th style={th}>Orden</th>
                <th style={th}>Campo</th>
                <th style={th}>Antes</th>
                <th style={th}>Después</th>
                <th style={th}>Actor</th>
                <th style={th}>Rol</th>
                <th style={th}>Motivo</th>
                <th style={th}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filas.length ? (
                filas.map((r, i) => (
                  <tr key={`${r._logId}-${i}`} className={r.actorTipo === "mensajero" ? "row-msg" : "row-op"}>
                    <td style={td}>{r.createdAtStr}</td>
                    <td style={{ ...tdMono, whiteSpace: "nowrap" }}>{r.orderId}</td>
                    <td style={td}>{r.campo}</td>
                    <td style={tdMono}>{r.antes}</td>
                    <td style={tdMono}>{r.despues}</td>
                    <td style={td}>{r.actor}</td>
                    <td style={tdCenter}>
                      {r.actorTipo === "mensajero"
                        ? <span className="pill green">{r.rol || "Mensajero"}</span>
                        : <span className="pill purple">{r.rol || "Operador"}</span>}
                    </td>
                    <td style={td}>{r.motivo ? <span className="pill blue">{r.motivo}</span> : "—"}</td>
                    <td style={td}>
                      <div className="actions">
                        <Link className="btn" to={`/orden/${r.orderId}`}>Ver orden</Link>
                        <Link className="btn primary" to={`/mapa/${r.orderId}`}>Ver mapa</Link>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td style={td} colSpan={9}>No hay cambios en el rango/criterio seleccionado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div style={{ marginTop: 20, fontSize: 12, color: "#666" }}>
        * Este módulo solo <b>lee</b> <code>cambiosOrden</code> de tu empresa (<code>empresaId</code> coincide). Para registrar cambios, usa <code>logCambioOrden()</code>.
      </div>
    </div>
  );
}
