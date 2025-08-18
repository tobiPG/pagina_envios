import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebaseConfig";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { ensureUsuarioActivo } from "../utils/ensureUsuario";

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
      const d = new Date(ts);
      const m = d.getTime();
      if (Number.isFinite(m)) return m;
    }
  } catch {}
  return NaN;
}
const diffMin = (a, b) => {
  const A = tsToMs(a), B = tsToMs(b);
  return Number.isFinite(A) && Number.isFinite(B) ? (A - B) / 60000 : null;
};
const fmtMin = (n) => (Number.isFinite(n) ? `${n.toFixed(1)} min` : "—");

export default function OrdenDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();

  const usuario = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("usuarioActivo") || "null"); } catch { return null; }
  }, []);
  const empresaId = usuario?.empresaId != null ? String(usuario.empresaId) : null;

  const [orden, setOrden] = useState(null);
  const [cambios, setCambios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let unsubCambios1 = null;
    let unsubCambios2 = null;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr("");

      const ok = await ensureUsuarioActivo();
      if (!ok) {
        setErr("No hay sesión válida (usuarios/{uid} sin empresaId).");
        setLoading(false);
        return;
      }
      if (!empresaId) {
        setErr("Falta empresaId en tu sesión.");
        setLoading(false);
        return;
      }

      try {
        // 1) Orden
        const ref = doc(db, "ordenes", id);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setErr("No encontré la orden.");
          setLoading(false);
          return;
        }
        if (cancelled) return;
        setOrden({ id, ...snap.data() });

        // 2) Cambios — suscríbete a AMBAS colecciones y fusiona
        const mergeAndSet = (arr1, arr2) => {
          const byId = new Map();
          [...arr1, ...arr2].forEach((r) => byId.set(r.id, r));
          const merged = Array.from(byId.values())
            .sort((a, b) => tsToMs(b.createdAt) - tsToMs(a.createdAt));
          setCambios(merged);
          // si había error previo de permisos y ahora hay data, limpialo
          if (merged.length && err) setErr("");
        };

        const refCambios = collection(db, "cambiosOrden");
        const q1 = query(refCambios, where("empresaId", "==", empresaId), where("orderId", "==", id));
        let cache1 = [];
        unsubCambios1 = onSnapshot(
          q1,
          (s) => {
            cache1 = s.docs.map(d => ({ id: d.id, ...d.data() }));
            mergeAndSet(cache1, cache2);
          },
          (e) => {
            console.warn("onSnapshot(cambiosOrden):", e?.code, e?.message);
            setErr(e?.message || "No pude leer cambios (cambiosOrden).");
          }
        );

        const refLegacy = collection(db, "historialCambios");
        const q2 = query(refLegacy, where("empresaId", "==", empresaId), where("orderId", "==", id));
        let cache2 = [];
        unsubCambios2 = onSnapshot(
          q2,
          (s) => {
            cache2 = s.docs.map(d => ({ id: d.id, ...d.data() }));
            mergeAndSet(cache1, cache2);
          },
          (e) => {
            // No lo tratamos como error duro, solo aviso
            console.warn("onSnapshot(historialCambios):", e?.code, e?.message);
          }
        );

        setLoading(false);
      } catch (e) {
        console.error("OrdenDetalle:", e?.code, e?.message);
        setErr(e?.message || "Error cargando el detalle.");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (unsubCambios1) unsubCambios1();
      if (unsubCambios2) unsubCambios2();
    };
  }, [id, empresaId]); // eslint-disable-line

  const sinCoords =
    !Number.isFinite(Number(orden?.destinoLat ?? orden?.address?.lat)) ||
    !Number.isFinite(Number(orden?.destinoLng ?? orden?.address?.lng));

  const tCR = diffMin(orden?.fechaRecibida, orden?.createdAt);
  const tRE = diffMin(orden?.fechaEntregada, orden?.fechaRecibida);
  const tTOT = diffMin(orden?.fechaEntregada, orden?.createdAt);

  return (
    <div style={{ padding: 16 }}>
      <h2>🔎 Detalle de Orden</h2>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => navigate(-1)}>← Volver</button>
        <button
          onClick={() =>
            navigate(`/seleccionar-destino/${id}`, {
              state: {
                ordenId: id,
                direccion: orden?.direccionTexto || orden?.address?.formatted || "",
                address: orden?.address || null,
                lat: Number(orden?.destinoLat ?? orden?.address?.lat),
                lng: Number(orden?.destinoLng ?? orden?.address?.lng),
              },
            })
          }
        >
          📍 Fijar destino
        </button>
      </div>

      {loading && <div style={{ marginTop: 8 }}>Cargando…</div>}
      {!!err && <div style={{ marginTop: 8, color: "#b00" }}>{err}</div>}

      {orden && (
        <div style={{ marginTop: 12 }}>
          <div><b>Cliente:</b> {orden.cliente || "—"}</div>
          <div><b>Factura:</b> {orden.numeroFactura || "—"}</div>
          <div><b>Teléfono:</b> {orden.telefono || "—"}</div>
          <div><b>Fecha/Hora:</b> {orden.fecha || "—"} {orden.hora || ""}</div>
          <div><b>Dirección:</b> {orden.direccionTexto || orden.address?.formatted || "—"}</div>

          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: 8 }}>
            <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 8 }}>
              <div style={{ fontSize: 12, color: "#666" }}>Creación → Recibida</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtMin(tCR)}</div>
            </div>
            <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 8 }}>
              <div style={{ fontSize: 12, color: "#666" }}>Recibida → Entregada</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtMin(tRE)}</div>
            </div>
            <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 8 }}>
              <div style={{ fontSize: 12, color: "#666" }}>Total</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtMin(tTOT)}</div>
            </div>
          </div>
        </div>
      )}

      <h3 style={{ marginTop: 20 }}>📝 Historial de cambios</h3>
      {!cambios.length ? (
        <div>No hay cambios registrados para esta orden.</div>
      ) : (
        <ul style={{ paddingLeft: 18 }}>
          {cambios.map((c) => (
            <li key={c.id} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: "#666" }}>
                {new Date(tsToMs(c.createdAt)).toLocaleString()} — {c.actorNombre || "desconocido"} ({c.actorRol || "—"})
                {c.motivo ? ` — Motivo: ${c.motivo}` : ""}
              </div>
              <ul>
                {(c.cambios || []).map((chg, i) => (
                  <li key={i}>
                    <b>{chg.campo}:</b> <i>{String(chg.antes ?? "—")}</i> → <i>{String(chg.despues ?? "—")}</i>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
