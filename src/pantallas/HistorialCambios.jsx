// src/pantallas/HistorialCambios.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { db } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { ensureUsuarioActivo } from "../utils/ensureUsuario";

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
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}
function exportCSV(filename, rows) {
  if (!rows?.length) return;
  const cols = Object.keys(rows[0]);
  const csv = [
    cols.join(","),
    ...rows.map((r) =>
      cols
        .map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`)
        .join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const th = {
  textAlign: "left",
  borderBottom: "1px solid #eee",
  padding: "8px 10px",
  background: "#fafafa",
};
const td = { borderBottom: "1px solid #f2f2f2", padding: "8px 10px" };
const tdMono = { ...td, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };
const tdCenter = { ...td, textAlign: "center" };

export default function HistorialCambios() {
  const [searchParams] = useSearchParams();

  // Sesión / empresa
  let usuario = null;
  try {
    usuario = JSON.parse(localStorage.getItem("usuarioActivo") || "null");
  } catch {}
  const empresaId =
    usuario?.empresaId != null && usuario?.empresaId !== ""
      ? String(usuario.empresaId)
      : null;

  // Filtros (mes actual por defecto)
  const hoy = new Date();
  const defaultDesde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const [desde, setDesde] = useState(defaultDesde.toISOString().slice(0, 10));
  const [hasta, setHasta] = useState(hoy.toISOString().slice(0, 10));

  // Filtro por OrderID (también vía query param ?orderId=...)
  const qpOrderId = (searchParams.get("orderId") || "").trim();
  const [orderId, setOrderId] = useState(qpOrderId);

  // Datos
  const [logs, setLogs] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [liveMeta, setLiveMeta] = useState({
    fromCache: false,
    pendingLocal: 0,
    total: 0,
  });

  useEffect(() => {
    let unsub = null;
    let unsubFallback = null;

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
        const q1 = query(
          ref,
          where("empresaId", "==", empresaId),
          orderBy("createdAt", "desc")
        );
        unsub = onSnapshot(
          q1,
          (snap) => {
            const rows = snap.docs.map((d) => ({
              id: d.id,
              ...d.data(),
              __pending: d.metadata.hasPendingWrites === true,
            }));
            setLogs(rows);
            const pendingLocal = rows.reduce(
              (n, r) => n + (r.__pending ? 1 : 0),
              0
            );
            setLiveMeta({
              fromCache: snap.metadata.fromCache,
              pendingLocal,
              total: rows.length,
            });
            setCargando(false);
          },
          (err) => {
            console.error("onSnapshot(cambiosOrden):", err?.code, err?.message);
            if (err?.code === "failed-precondition") {
              // Fallback sin orderBy (ordenamos en cliente)
              const q2 = query(ref, where("empresaId", "==", empresaId));
              unsubFallback = onSnapshot(
                q2,
                (snap2) => {
                  const r2 = snap2.docs.map((d) => ({
                    id: d.id,
                    ...d.data(),
                    __pending: d.metadata.hasPendingWrites === true,
                  }));
                  r2.sort(
                    (a, b) =>
                      (b?.createdAt?.toMillis?.() ?? 0) -
                      (a?.createdAt?.toMillis?.() ?? 0)
                  );
                  setLogs(r2);
                  const pendingLocal = r2.reduce(
                    (n, r) => n + (r.__pending ? 1 : 0),
                    0
                  );
                  setLiveMeta({
                    fromCache: snap2.metadata.fromCache,
                    pendingLocal,
                    total: r2.length,
                  });
                  setCargando(false);
                },
                (e2) => {
                  setError(
                    e2?.message ||
                      "No se pudieron leer cambios (fallback). Revisa índice/reglas."
                  );
                  setCargando(false);
                }
              );
              alert(
                "Sugerido: índice compuesto en cambiosOrden (empresaId + createdAt). Usando fallback temporal."
              );
            } else if (err?.code === "permission-denied") {
              setError(
                "Permiso denegado al leer cambios. Revisa reglas o empresaId en usuarios/{uid}."
              );
              setCargando(false);
            } else {
              setError(err?.message || "No se pudo leer el historial.");
              setCargando(false);
            }
          }
        );
      } catch (e) {
        console.error("query(cambiosOrden) error:", e);
        setError(e?.message || "No se pudo iniciar la suscripción.");
        setCargando(false);
      }
    })();

    return () => {
      if (unsub) unsub();
      if (unsubFallback) unsubFallback();
    };
  }, [empresaId]);

  // Aplanar cambios a filas
  const filas = useMemo(() => {
    if (!Array.isArray(logs)) return [];
    const d = new Date(desde);
    d.setHours(0, 0, 0, 0);
    const h = new Date(hasta);
    h.setHours(23, 59, 59, 999);
    const msD = d.getTime();
    const msH = h.getTime();

    const targetOrder = (orderId || "").trim().toLowerCase();

    const out = [];
    for (const log of logs) {
      const ms = tsToMs(log.createdAt);
      // Filtro por rango
      if (Number.isFinite(ms) && (ms < msD || ms > msH)) continue;
      // Filtro por orderId si aplica
      if (targetOrder && String(log.orderId || "").toLowerCase() !== targetOrder)
        continue;

      const base = {
        _logId: log.id,
        orderId: log.orderId || "—",
        actor: log.actorNombre || "desconocido",
        rol: log.actorRol || "—",
        createdAtMs: ms,
        createdAtStr: msToLocal(ms),
        motivo: log.motivo || "",
      };

      const arrCambios = Array.isArray(log.cambios) ? log.cambios : [];
      if (!arrCambios.length) {
        out.push({ ...base, campo: "(sin detalle)", antes: "", despues: "" });
      } else {
        for (const c of arrCambios) {
          out.push({
            ...base,
            campo: c?.campo || "—",
            antes: fmt(c?.antes),
            despues: fmt(c?.despues),
          });
        }
      }
    }
    // Orden descendente por fecha
    out.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    return out;
  }, [logs, desde, hasta, orderId]);

  const totalLogs = logs.length;
  const totalFilas = filas.length;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h2 style={{ margin: 0 }}>🗂️ Historial de cambios</h2>
        <div style={{ marginLeft: "auto" }}>
          <Link to="/ordenes">&larr; Volver a Órdenes</Link>
        </div>
      </div>

      <div style={{ marginTop: 6, fontSize: 12, color: "#444" }}>
        <b>Estado en vivo:</b>{" "}
        cache: <code>{String(liveMeta.fromCache)}</code>{" · "}
        pendientes: <code>{liveMeta.pendingLocal}</code>{" · "}
        docs: <code>{liveMeta.total}</code>
      </div>

      <div
        style={{
          marginTop: 8,
          padding: 10,
          background: "#fff8e1",
          border: "1px solid #ffe082",
          borderRadius: 8,
          fontSize: 12,
        }}
      >
        <div>
          <b>Consejo:</b> si ves aviso de índice, crea{" "}
          <code>cambiosOrden (empresaId ASC, createdAt DESC)</code>. Este
          listado funciona con fallback mientras tanto.
        </div>
      </div>

      {/* Filtros */}
      <h3 style={{ marginTop: 16 }}>Filtros</h3>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "end",
          flexWrap: "wrap",
          marginTop: 6,
        }}
      >
        <div>
          <label>Desde</label>
          <br />
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        </div>
        <div>
          <label>Hasta</label>
          <br />
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
        </div>
        <div>
          <label>Order ID</label>
          <br />
          <input
            type="text"
            placeholder="abc123…"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            style={{ minWidth: 180 }}
          />
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={() =>
              exportCSV(
                `cambios_${desde}_a_${hasta}${orderId ? "_order_" + orderId : ""
                }.csv`,
                filas.map((r) => ({
                  fecha: r.createdAtStr,
                  orderId: r.orderId,
                  campo: r.campo,
                  antes: r.antes,
                  despues: r.despues,
                  actor: r.actor,
                  rol: r.rol,
                  motivo: r.motivo,
                }))
              )
            }
            disabled={!filas.length}
          >
            ⬇️ Exportar CSV
          </button>
        </div>
      </div>

      {/* Estado de carga / error */}
      {cargando && <div style={{ marginTop: 8 }}>Cargando…</div>}
      {!!error && (
        <div style={{ marginTop: 8, color: "#b00" }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
        Logs totales: <b>{totalLogs}</b> · Filas visibles: <b>{totalFilas}</b>
      </div>

      {/* Tabla */}
      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
                <tr key={`${r._logId}-${i}`}>
                  <td style={td}>{r.createdAtStr}</td>
                  <td style={{ ...tdMono, whiteSpace: "nowrap" }}>{r.orderId}</td>
                  <td style={td}>{r.campo}</td>
                  <td style={tdMono}>{r.antes}</td>
                  <td style={tdMono}>{r.despues}</td>
                  <td style={td}>{r.actor}</td>
                  <td style={tdCenter}>{r.rol}</td>
                  <td style={td}>{r.motivo || "—"}</td>
                  <td style={td}>
                    <Link to={`/orden/${r.orderId}`}>Ver orden</Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td style={td} colSpan={9}>
                  No hay cambios en el rango/criterio seleccionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 20, fontSize: 12, color: "#666" }}>
        * Este módulo solo **lee** <code>cambiosOrden</code> de tu empresa (
        <code>empresaId</code> coincide). Para registrar cambios, ya estás usando{" "}
        <code>logCambioOrden()</code>.
      </div>
    </div>
  );
}
