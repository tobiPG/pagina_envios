// src/pantallas/Entregas.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db, storage } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  where,
  query,
  setDoc,
  getDoc,
  orderBy,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import PingUbicacion from "../components/PingUbicacion.jsx";
import { logCambioOrden } from "../utils/logCambios";

const FILE_LIMIT_MB = 10;

const normalizeRole = (raw) => String(raw || "").trim().toLowerCase();
const isAdminRole = (r) => ["admin", "administrador", "administrator"].includes(normalizeRole(r));

function tsToMs(ts) {
  try {
    if (!ts) return NaN;
    if (typeof ts?.toDate === "function") return ts.toDate().getTime();
    if (typeof ts?.seconds === "number") {
      return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
    }
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts === "number") return ts;
  } catch {}
  return NaN;
}
function todayYMD(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function Entregas() {
  const navigate = useNavigate();
  const [ordenes, setOrdenes] = useState([]);
  const [error, setError] = useState("");

  // Rutas del mensajero (del día)
  const [rutas, setRutas] = useState([]);
  const [rutasError, setRutasError] = useState("");

  // Estados para POD por orden
  const [files, setFiles] = useState({});       // { [orderId]: File }
  const [recibe, setRecibe] = useState({});     // { [orderId]: string }
  const [subiendo, setSubiendo] = useState({}); // { [orderId]: boolean }

  // Usuario activo
  const usuario = useMemo(() => {
    try {
      const raw = localStorage.getItem("usuarioActivo");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const rol = normalizeRole(usuario?.rol);
  const empresaId = usuario?.empresaId || null;

  const mensajeroId =
    usuario?.id ||
    usuario?.uid ||
    usuario?.userId ||
    usuario?.usuarioId ||
    usuario?.usuario ||
    "mensajero-desconocido";
  const mensajeroNombre = usuario?.nombre || usuario?.usuario || "Mensajero";

  // Helpers coords
  const toNumOrNull = (v) => {
    const n = typeof v === "number" ? v : v != null ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const getCoords = (o) => {
    const lat =
      toNumOrNull(o?.destinoLat) ??
      toNumOrNull(o?.address?.lat) ??
      toNumOrNull(o?.destino?.lat);
    const lng =
      toNumOrNull(o?.destinoLng) ??
      toNumOrNull(o?.address?.lng) ??
      toNumOrNull(o?.destino?.lng);
    return { lat, lng };
  };

  // Toggle manual de estado
  async function toggleEstadoMensajero() {
    try {
      const refM = doc(db, "ubicacionesMensajeros", mensajeroId);
      const snap = await getDoc(refM);
      const data = snap.exists() ? snap.data() : {};
      const estadoActual = (data?.estado || "disponible").toLowerCase();
      const siguiente = estadoActual === "disponible" ? "en_ruta" : "disponible";

      await setDoc(
        refM,
        {
          empresaId,
          nombre: data?.nombre || mensajeroNombre,
          estado: siguiente,
          estadoUpdatedAt: serverTimestamp(),
          lastPingAt: serverTimestamp(),
        },
        { merge: true }
      );

      alert(`Estado actualizado: ${siguiente.toUpperCase()}`);
    } catch (e) {
      console.error("toggleEstadoMensajero:", e);
      alert("No pude actualizar tu estado.");
    }
  }

  // ===== Rutas del mensajero (hoy) con fallback robusto =====
  useEffect(() => {
    setRutasError("");
    if (!empresaId) {
      setRutas([]);
      return;
    }
    const hoy = todayYMD();
    const col = collection(db, "rutas");

    let cleanup = () => {};

    const attachByName = () => {
      const q2 = query(
        col,
        where("empresaId", "==", empresaId),
        where("mensajeroNombre", "==", mensajeroNombre),
        where("fecha", "==", hoy),
        orderBy("createdAt", "desc")
      );
      const un2 = onSnapshot(
        q2,
        (s2) => setRutas(s2.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (e2) => setRutasError(e2?.message || "No se pudieron leer rutas.")
      );
      const prev = cleanup;
      cleanup = () => {
        try { prev(); } catch {}
        try { un2(); } catch {}
      };
    };

    const q1 = query(
      col,
      where("empresaId", "==", empresaId),
      where("mensajeroUid", "==", mensajeroId),
      where("fecha", "==", hoy),
      orderBy("createdAt", "desc")
    );
    const un1 = onSnapshot(
      q1,
      (snap) => {
        if (!snap.empty) {
          setRutas(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          setRutasError("");
        } else {
          attachByName();
        }
      },
      (err) => {
        setRutasError(err?.message || "No se pudieron leer rutas.");
        attachByName();
      }
    );
    cleanup = () => un1();

    return () => cleanup();
  }, [empresaId, mensajeroId, mensajeroNombre]);

  // ===== Órdenes asignadas (con fallback robusto + cleanup) =====
  useEffect(() => {
    setError("");
    if (!empresaId) {
      setOrdenes([]);
      return;
    }

    const refCol = collection(db, "ordenes");
    const uid =
      usuario?.id || usuario?.uid || usuario?.userId || usuario?.usuarioId || null;
    const nombre = usuario?.nombre || null;

    const sortByCreatedDesc = (rows) => {
      rows.sort((a, b) => (b?.createdAt?.toMillis?.() ?? 0) - (a?.createdAt?.toMillis?.() ?? 0));
      return rows;
    };

    let cleanup = () => {};

    if (isAdminRole(rol)) {
      const qAdmin = query(refCol, where("empresaId", "==", empresaId));
      const unsub = onSnapshot(
        qAdmin,
        (snap) => setOrdenes(sortByCreatedDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
        (err) => setError(err?.message || "No se pudieron leer órdenes.")
      );
      cleanup = () => unsub();
      return () => cleanup();
    }

    const attachByName = () => {
      if (!nombre) return;
      const qName = query(
        refCol,
        where("empresaId", "==", empresaId),
        where("asignadoNombre", "==", nombre),
        where("entregado", "==", false)
      );
      const un2 = onSnapshot(
        qName,
        (s2) => setOrdenes(sortByCreatedDesc(s2.docs.map((d) => ({ id: d.id, ...d.data() })))),
        (e2) => setError(e2?.message || "No se pudieron leer órdenes.")
      );
      const prev = cleanup;
      cleanup = () => {
        try { prev(); } catch {}
        try { un2(); } catch {}
      };
    };

    if (uid) {
      const qUid = query(
        refCol,
        where("empresaId", "==", empresaId),
        where("asignadoUid", "==", uid),
        where("entregado", "==", false)
      );

      const un1 = onSnapshot(
        qUid,
        (snap) => setOrdenes(sortByCreatedDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
        (err) => {
          console.warn("Query por UID falló o requiere índice. Activando fallback por nombre.", err?.message);
          attachByName();
        }
      );

      cleanup = () => un1();
      return () => cleanup();
    }

    if (nombre) {
      const qName = query(
        refCol,
        where("empresaId", "==", empresaId),
        where("asignadoNombre", "==", nombre),
        where("entregado", "==", false)
      );
      const un = onSnapshot(
        qName,
        (snap) => setOrdenes(sortByCreatedDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
        (err) => setError(err?.message || "No se pudieron leer órdenes.")
      );
      cleanup = () => un();
      return () => cleanup();
    }

    setOrdenes([]);
    return () => {};
  }, [
    empresaId,
    rol,
    usuario?.id,
    usuario?.uid,
    usuario?.userId,
    usuario?.usuarioId,
    usuario?.nombre,
  ]);

  // Auto-estado del mensajero
  const lastEstadoRef = useRef(null);
  useEffect(() => {
    if (isAdminRole(rol)) return;
    if (!mensajeroId || !empresaId) return;

    const tieneRecibidas = ordenes.some((o) => !!o.recibida && !o.entregado);
    const tieneAsignadasNoRecibidas = ordenes.some((o) => !o.recibida && !o.entregado);

    let estadoCalculado = "disponible";
    if (tieneRecibidas) estadoCalculado = "en_ruta";
    else if (tieneAsignadasNoRecibidas) estadoCalculado = "listo_para_ruta";

    if (lastEstadoRef.current === estadoCalculado) return;
    lastEstadoRef.current = estadoCalculado;

    (async () => {
      try {
        const refM = doc(db, "ubicacionesMensajeros", mensajeroId);
        await setDoc(
          refM,
          {
            empresaId,
            nombre: mensajeroNombre,
            estado: estadoCalculado,
            estadoUpdatedAt: serverTimestamp(),
            lastPingAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (e) {
        console.warn("Auto-estado mensajero falló:", e?.message);
      }
    })();
  }, [ordenes, rol, mensajeroId, mensajeroNombre, empresaId]);

  // Acciones
  const marcarComoRecibidaYNavegar = async (orden) => {
    try {
      const antes = { ...orden };
      const patch = { recibida: true, fechaRecibida: serverTimestamp() };

      await updateDoc(doc(db, "ordenes", orden.id), patch);

      await logCambioOrden({
        orderId: orden.id,
        empresaId,
        antes,
        despues: { ...orden, ...patch },
        actor: { id: mensajeroId, nombre: mensajeroNombre, rol, empresaId },
        motivo: "Orden recibida (mensajero)",
      });

      try {
        const refM = doc(db, "ubicacionesMensajeros", mensajeroId);
        await setDoc(
          refM,
          {
            empresaId,
            nombre: mensajeroNombre,
            estado: "en_ruta",
            estadoUpdatedAt: serverTimestamp(),
            lastPingAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (e) {
        console.warn("No pude actualizar estado del mensajero (en_ruta):", e?.message);
      }

      const { lat, lng } = getCoords(orden);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        navigate(`/mapa/${orden.id}`, {
          state: {
            ordenId: orden.id,
            lat,
            lng,
            direccion: orden.direccionTexto || orden.address?.formatted || "",
            cliente: orden.cliente || "",
            numeroFactura: orden.numeroFactura || "",
            asignadoUid: orden.asignadoUid || null,
            address: orden.address || null,
          },
        });
      } else {
        navigate(`/seleccionar-destino/${orden.id}`, { state: { ordenId: orden.id } });
      }
    } catch (e) {
      console.error("Recibida:", e);
      alert("No pude marcar como recibida.");
    }
  };

  // POD
  const setFile = (orderId, file) => setFiles((m) => ({ ...m, [orderId]: file || null }));
  const setRecibeNombre = (orderId, nombre) => setRecibe((m) => ({ ...m, [orderId]: nombre }));

  async function subirPODyEntregar(orden) {
    if (!empresaId) return alert("Falta empresaId en sesión.");
    const orderId = orden.id;
    const file = files[orderId];
    if (!file) return alert("Selecciona una foto primero.");
    if (!file.type?.startsWith("image/")) return alert("El archivo debe ser una imagen.");
    if (file.size > FILE_LIMIT_MB * 1024 * 1024) {
      return alert(`La imagen supera ${FILE_LIMIT_MB} MB.`);
    }

    try {
      setSubiendo((m) => ({ ...m, [orderId]: true }));

      // 1) Subir a Storage
      const ext = (file.name?.split(".").pop() || "jpg").toLowerCase();
      const ts = Date.now();
      const path = `empresas/${empresaId}/ordenes/${orderId}/POD_${ts}.${ext}`;
      const sref = ref(storage, path);
      await uploadBytes(sref, file, {
        contentType: file.type || "image/jpeg",
        customMetadata: { empresaId, orderId, actorId: String(mensajeroId) },
      });
      const url = await getDownloadURL(sref);

      // 2) Calcular minutos totales
      const startMs = tsToMs(orden.fechaRecibida) || tsToMs(orden.createdAt) || Date.now();
      const minutos = Number(((Date.now() - startMs) / 60000).toFixed(2));

      // 3) Update de la orden
      const patch = {
        proofUrl: url,
        proofStoragePath: path,
        proofAt: serverTimestamp(),
        proofType: "foto",
        recibeNombre: (recibe[orderId] || "").trim() || null,
        entregado: true,
        fechaEntregada: serverTimestamp(),
        tiempoTotalEntrega: minutos,
      };
      const antes = { ...orden };
      const despues = { ...orden, ...patch };

      await updateDoc(doc(db, "ordenes", orderId), patch);

      // 4) Mensajero a disponible
      if (orden.asignadoUid) {
        await setDoc(
          doc(db, "ubicacionesMensajeros", orden.asignadoUid),
          {
            empresaId,
            nombre: mensajeroNombre,
            estado: "disponible",
            estadoUpdatedAt: serverTimestamp(),
            lastPingAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      // 5) Auditoría
      await logCambioOrden({
        orderId,
        empresaId,
        antes,
        despues,
        actor: { id: mensajeroId, nombre: mensajeroNombre, rol, empresaId },
        motivo: "POD foto + marcado como entregado",
      });

      // 6) Limpieza UI
      setFile(orderId, null);
      setRecibeNombre(orderId, "");
      alert("Foto subida y orden marcada como ENTREGADA ✅");
    } catch (e) {
      console.error("subirPODyEntregar:", e);
      alert(e?.message || "No pude subir la foto / marcar entregada.");
    } finally {
      setSubiendo((m) => ({ ...m, [orderId]: false }));
    }
  }

  // Helpers UI
  const gmapsUrl = (lat, lng) =>
    Number.isFinite(lat) && Number.isFinite(lng)
      ? `https://www.google.com/maps?q=${lat},${lng}`
      : null;

  const titulo = isAdminRole(rol) ? "Órdenes (Administrador)" : "Mis Órdenes Asignadas";

  return (
    <div style={{ padding: 20 }}>
      {/* Cabecera + Rutas del Día */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>{isAdminRole(rol) ? "Panel de Entregas" : "Mis Entregas"}</h2>
        {!isAdminRole(rol) && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={toggleEstadoMensajero}>🟢 Alternar estado (Disponible / En ruta)</button>
            <span style={{ fontSize: 12, color: "#666" }}>* Auto-ajuste según tus órdenes.</span>
            <PingUbicacion />
          </div>
        )}
      </div>

      {/* Rutas del mensajero (hoy) */}
      {!isAdminRole(rol) && (
        <section className="card" style={{ marginTop: 12, padding: 12, border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>🚦 Mis rutas de hoy</h3>
            <span style={{ color: "#6b7280", fontSize: 12 }}>({todayYMD()})</span>
          </div>

          {rutasError && <div style={{ color: "#b91c1c", marginBottom: 6 }}>{rutasError}</div>}

          {rutas.length ? (
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
              {rutas.map((r, idx) => {
                const nombre = r?.nombre || `Ruta ${idx + 1}`;
                const estado = String(r?.estado || "pendiente").toUpperCase();
                const count = r?.ordenesCount ?? r?.totalOrdenes ?? "—";
                return (
                  <div key={r.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#fafafa" }}>
                    <div style={{ fontWeight: 700 }}>{nombre}</div>
                    <div style={{ fontSize: 12, color: "#555" }}>
                      Fecha: {r?.fecha || todayYMD()} &nbsp;•&nbsp; Estado: <b>{estado}</b>
                    </div>
                    <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
                      Órdenes: <b>{count}</b>
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                      <button onClick={() => navigate(`/ruta-mensajero/${r.id}`)}>🧭 Ver ruta</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              No tienes rutas asignadas hoy. Si te asignan una, aparecerá aquí.
            </div>
          )}
        </section>
      )}

      {/* Órdenes asignadas */}
      <h3 style={{ marginTop: 16 }}>{titulo}</h3>
      {!!error && <div style={{ color: "#b00", marginBottom: 8 }}>{error}</div>}

      {!isAdminRole(rol) && rutas.length === 0 && (
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
          También puedes trabajar por órdenes sueltas mientras no tengas una ruta.
        </div>
      )}

      {ordenes.length === 0 && <p>No hay órdenes pendientes asignadas.</p>}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {ordenes.map((o) => {
          const estado = o.entregado ? "ENTREGADA" : o.recibida ? "RECIBIDA" : "PENDIENTE";
          const dir = o.direccionTexto || o.address?.formatted || "—";
          const { lat, lng } = getCoords(o);
          const coordsText =
            Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : "—";
          const gmaps =
            Number.isFinite(lat) && Number.isFinite(lng)
              ? `https://www.google.com/maps?q=${lat},${lng}`
              : null;
          const orderId = o.id;

          return (
            <li key={orderId} style={{ marginBottom: 14, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
              <div>
                <b>{o.cliente || "Cliente"}</b> — Factura: {o.numeroFactura || "—"} — Tel: {o.telefono || "—"}
              </div>
              <div>
                Fecha/Hora: {o.fecha || "—"} {o.hora || ""} — Monto: {o.monto != null ? `$${o.monto}` : "—"}
              </div>
              <div>
                Dirección: {dir} — Coords: {coordsText}
                {gmaps && (
                  <>
                    {" — "}
                    <a href={gmaps} target="_blank" rel="noopener noreferrer">Abrir en Google Maps</a>
                  </>
                )}
              </div>
              <div>Estado: <b>{estado}</b></div>

              {/* Acciones básicas */}
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={() =>
                    navigate(`/mapa/${orderId}`, {
                      state: {
                        ordenId: orderId,
                        lat,
                        lng,
                        direccion: o.direccionTexto || o.address?.formatted || "",
                        cliente: o.cliente || "",
                        numeroFactura: o.numeroFactura || "",
                        asignadoUid: o.asignadoUid || null,
                        address: o.address || null,
                      },
                    })
                  }
                >
                  🗺️ Ver en mapa
                </button>

                <button
                  onClick={() =>
                    navigate(`/ruta-mensajero/${orderId}`, {
                      state: { ordenId: orderId, lat, lng, direccion: o.direccionTexto || o.address?.formatted || "" },
                    })
                  }
                >
                  🧭 Navegar (en app)
                </button>

                {!o.entregado && !o.recibida && (
                  <button onClick={() => marcarComoRecibidaYNavegar(o)}>
                    ✅ Marcar como Recibida
                  </button>
                )}
              </div>

              {/* 📷 POD: para mensajero cuando NO está entregada */}
              {!o.entregado && o.recibida && rol === "mensajero" && (
                <div style={{ marginTop: 10, padding: 10, border: "1px dashed #ccc", borderRadius: 8 }}>
                  <b>📷 Subir prueba de entrega</b>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => setFile(orderId, e.target.files?.[0] || null)}
                    />
                    <input
                      type="text"
                      placeholder="Nombre de quien recibe (opcional)"
                      value={recibe[orderId] || ""}
                      onChange={(e) => setRecibeNombre(orderId, e.target.value)}
                      style={{ minWidth: 220 }}
                    />
                    <button
                      onClick={() => subirPODyEntregar(o)}
                      disabled={!files[orderId] || subiendo[orderId]}
                    >
                      {subiendo[orderId] ? "Subiendo..." : "Subir foto y marcar entregada"}
                    </button>
                  </div>
                  {!!files[orderId] && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                      Archivo seleccionado: <code>{files[orderId].name}</code>
                    </div>
                  )}
                </div>
              )}

              {/* Vista de POD si ya está entregada */}
              {o.entregado && o.proofUrl && (
                <div style={{ marginTop: 10 }}>
                  <b>📎 Prueba de Entrega</b>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginTop: 6 }}>
                    <img
                      src={o.proofUrl}
                      alt="POD"
                      style={{ maxWidth: 240, borderRadius: 8, border: "1px solid #eee" }}
                    />
                    <div style={{ fontSize: 12, color: "#444" }}>
                      <div><b>Recibido por:</b> {o.recibeNombre || "—"}</div>
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
