// src/pantallas/Entregas.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebaseConfig";
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
} from "firebase/firestore";
import PingUbicacion from "../components/PingUbicacion.jsx"; // 👈 NUEVO

export default function Entregas() {
  const navigate = useNavigate();
  const [ordenes, setOrdenes] = useState([]);

  // Usuario activo (desde localStorage)
  const usuario = useMemo(() => {
    try {
      const raw = localStorage.getItem("usuarioActivo");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const rol = (usuario?.rol || "").toLowerCase();
  const empresaId = usuario?.empresaId || null;

  const mensajeroId =
    usuario?.id ||
    usuario?.uid ||
    usuario?.userId ||
    usuario?.usuarioId ||
    usuario?.usuario ||
    "mensajero-desconocido";
  const mensajeroNombre = usuario?.nombre || usuario?.usuario || "Mensajero";

  // Helpers coords seguras
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
      const ref = doc(db, "ubicacionesMensajeros", mensajeroId);
      const snap = await getDoc(ref);
      const data = snap.exists() ? snap.data() : {};
      const estadoActual = (data?.estado || "disponible").toLowerCase();
      const siguiente = estadoActual === "disponible" ? "en_ruta" : "disponible";

      await setDoc(
        ref,
        {
          empresaId, // requerido por reglas
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

  // Suscripción de órdenes (filtrado por empresa)
  useEffect(() => {
    if (!empresaId) {
      setOrdenes([]);
      return;
    }

    const ref = collection(db, "ordenes");
    const uid =
      usuario?.id || usuario?.uid || usuario?.userId || usuario?.usuarioId || null;
    const nombre = usuario?.nombre || null;

    // ADMIN: ve todas las órdenes de su empresa
    if (rol === "administrador") {
      const qAdmin = query(ref, where("empresaId", "==", empresaId));
      const unsub = onSnapshot(
        qAdmin,
        (snap) => {
          const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          // ordeno en cliente por createdAt desc si existe
          arr.sort((a, b) => {
            const ta = a.createdAt?.toMillis?.() || 0;
            const tb = b.createdAt?.toMillis?.() || 0;
            return tb - ta;
          });
          setOrdenes(arr);
        },
        (err) => console.error("onSnapshot(ordenes admin):", err)
      );
      return () => unsub();
    }

    // MENSAJERO → preferimos UID, siempre dentro de la misma empresa
    if (uid) {
      const qUid = query(
        ref,
        where("empresaId", "==", empresaId),
        where("asignadoUid", "==", uid),
        where("entregado", "==", false)
      );

      const unsubUid = onSnapshot(
        qUid,
        (snap) => {
          const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          rows.sort((a, b) => {
            const ta = a.createdAt?.toMillis?.() || 0;
            const tb = b.createdAt?.toMillis?.() || 0;
            return tb - ta;
          });
          setOrdenes(rows);
        },
        (err) => {
          console.warn(
            "Query por UID falló o requiere índice. Fallback por nombre si hay:",
            err?.message
          );

          // FALLBACK por nombre
          if (!nombre) return;
          const qName = query(
            ref,
            where("empresaId", "==", empresaId),
            where("asignadoNombre", "==", nombre),
            where("entregado", "==", false)
          );
          const unsubName = onSnapshot(
            qName,
            (s2) => {
              const rows = s2.docs.map((d) => ({ id: d.id, ...d.data() }));
              rows.sort((a, b) => {
                const ta = a.createdAt?.toMillis?.() || 0;
                const tb = b.createdAt?.toMillis?.() || 0;
                return tb - ta;
              });
              setOrdenes(rows);
            },
            (e2) => console.error("onSnapshot(fallback nombre):", e2)
          );

          return () => unsubName();
        }
      );

      return () => unsubUid();
    }

    // Sin uid, probamos por nombre (último recurso)
    if (nombre) {
      const qName = query(
        ref,
        where("empresaId", "==", empresaId),
        where("asignadoNombre", "==", nombre),
        where("entregado", "==", false)
      );
      const unsubName = onSnapshot(
        qName,
        (snap) => {
          const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          rows.sort((a, b) => {
            const ta = a.createdAt?.toMillis?.() || 0;
            const tb = b.createdAt?.toMillis?.() || 0;
            return tb - ta;
          });
          setOrdenes(rows);
        },
        (err) => console.error("onSnapshot(nombre sin uid):", err)
      );
      return () => unsubName();
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
    if (rol === "administrador") return;
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
      await updateDoc(doc(db, "ordenes", orden.id), {
        recibida: true,
        fechaRecibida: serverTimestamp(),
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
        navigate(`/seleccionar-destino/${orden.id}`, {
          state: { ordenId: orden.id },
        });
      }
    } catch (e) {
      console.error("Recibida:", e);
      alert("No pude marcar como recibida.");
    }
  };

  const marcarComoEntregada = async (id, fechaRecibidaTS) => {
    try {
      let minutos = null;
      try {
        const msRec = fechaRecibidaTS?.toDate
          ? fechaRecibidaTS.toDate().getTime()
          : null;
        if (msRec) minutos = ((Date.now() - msRec) / 60000).toFixed(2);
      } catch {}
      await updateDoc(doc(db, "ordenes", id), {
        entregado: true,
        fechaEntregada: serverTimestamp(),
        tiempoTotalEntrega: minutos,
      });

      try {
        const refM = doc(db, "ubicacionesMensajeros", mensajeroId);
        await setDoc(
          refM,
          {
            empresaId,
            nombre: mensajeroNombre,
            estado: "disponible",
            estadoUpdatedAt: serverTimestamp(),
            lastPingAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (e) {
        console.warn("No pude actualizar estado del mensajero (disponible):", e?.message);
      }
    } catch (e) {
      console.error("Entregada:", e);
      alert("No pude marcar como entregada.");
    }
  };

  // Helpers UI
  const gmapsUrl = (lat, lng) =>
    Number.isFinite(lat) && Number.isFinite(lng)
      ? `https://www.google.com/maps?q=${lat},${lng}`
      : null;

  const titulo =
    rol === "administrador" ? "Órdenes (Administrador)" : "Mis Órdenes Asignadas";

  return (
    <div style={{ padding: 20 }}>
      <h2>{titulo}</h2>

      {rol !== "administrador" && (
        <div style={{ margin: "10px 0", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={toggleEstadoMensajero}>
            🟢 Alternar estado (Disponible / En ruta)
          </button>
          <span style={{ fontSize: 12, color: "#666" }}>
            * Opcional: el sistema también lo ajusta automáticamente según tus órdenes.
          </span>
          {/* 👇 Nuevo: ping de ubicación en vivo (cumple reglas, no toca 'estado') */}
          <PingUbicacion />
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
          const gmaps = gmapsUrl(lat, lng);

          return (
            <li
              key={o.id}
              style={{
                marginBottom: 14,
                padding: 12,
                border: "1px solid #ddd",
                borderRadius: 8,
              }}
            >
              <div>
                <b>{o.cliente || "Cliente"}</b> — Factura: {o.numeroFactura || "—"} — Tel:{" "}
                {o.telefono || "—"}
              </div>
              <div>
                Fecha/Hora: {o.fecha || "—"} {o.hora || ""} — Monto:{" "}
                {o.monto != null ? `$${o.monto}` : "—"}
              </div>
              <div>
                Dirección: {dir} — Coords: {coordsText}
                {gmaps && (
                  <>
                    {" — "}
                    <a href={gmaps} target="_blank" rel="noopener noreferrer">
                      Abrir en Google Maps
                    </a>
                  </>
                )}
              </div>
              <div>Estado: <b>{estado}</b></div>

              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={() =>
                    navigate(`/mapa/${o.id}`, {
                      state: {
                        ordenId: o.id,
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
                    navigate(`/ruta-mensajero/${o.id}`, {
                      state: {
                        ordenId: o.id,
                        lat,
                        lng,
                        direccion: o.direccionTexto || o.address?.formatted || "",
                        cliente: o.cliente || "",
                        numeroFactura: o.numeroFactura || "",
                        address: o.address || null,
                      },
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

                {!o.entregado && o.recibida && (
                  <button onClick={() => marcarComoEntregada(o.id, o.fechaRecibida)}>
                    📬 Marcar como Entregada
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
