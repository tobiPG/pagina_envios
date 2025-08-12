// src/pantallas/Entregas.jsx
import { useEffect, useMemo, useState } from "react";
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
  orderBy,
} from "firebase/firestore";

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

  const rol = usuario?.rol || null;

  // Helper: normaliza coordenadas independientemente del shape que venga en Firestore
  const getCoords = (o) => {
    const latRaw = o?.destinoLat ?? o?.address?.lat ?? o?.destino?.lat ?? null;
    const lngRaw = o?.destinoLng ?? o?.address?.lng ?? o?.destino?.lng ?? null;
    const lat =
      typeof latRaw === "number" ? latRaw : latRaw != null ? Number(latRaw) : null;
    const lng =
      typeof lngRaw === "number" ? lngRaw : lngRaw != null ? Number(lngRaw) : null;
    return { lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null };
  };

  // Suscripción en tiempo real
  useEffect(() => {
    const ref = collection(db, "ordenes");

    const uid =
      usuario?.id || usuario?.uid || usuario?.userId || usuario?.usuarioId || null;
    const nombre = usuario?.nombre || null;

    // ADMIN: ve todo, ordenado por creación
    if (rol === "administrador") {
      const qAdmin = query(ref, orderBy("createdAt", "desc"));
      const unsub = onSnapshot(
        qAdmin,
        (snap) => setOrdenes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => console.error("onSnapshot(ordenes admin):", err)
      );
      return () => unsub();
    }

    // MENSAJERO → preferimos UID (usa el índice compuesto)
    if (uid) {
      const qUid = query(
        ref,
        where("asignadoUid", "==", uid),
        where("entregado", "==", false),
        orderBy("createdAt", "desc")
      );

      const unsubUid = onSnapshot(
        qUid,
        (snap) => {
          const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setOrdenes(rows);
        },
        (err) => {
          console.warn(
            "Query por UID falló o requiere índice. Fallback por nombre si hay:",
            err?.message
          );

          // FALLBACK por nombre (sin orderBy para no pedir otro índice)
          if (!nombre) return;
          const qName = query(
            ref,
            where("asignadoNombre", "==", nombre),
            where("entregado", "==", false)
          );
          const unsubName = onSnapshot(
            qName,
            (s2) => setOrdenes(s2.docs.map((d) => ({ id: d.id, ...d.data() }))),
            (e2) => console.error("onSnapshot(fallback nombre):", e2)
          );

          // devolvemos el unsub del fallback
          return () => unsubName();
        }
      );

      return () => unsubUid();
    }

    // Si no hay uid, probamos por nombre (último recurso)
    if (nombre) {
      const qName = query(
        ref,
        where("asignadoNombre", "==", nombre),
        where("entregado", "==", false)
      );
      const unsubName = onSnapshot(
        qName,
        (snap) => setOrdenes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err) => console.error("onSnapshot(nombre sin uid):", err)
      );
      return () => unsubName();
    }

    // Sin uid ni nombre → nada que mostrar
    setOrdenes([]);
    return () => {};
  }, [rol, usuario?.id, usuario?.uid, usuario?.userId, usuario?.usuarioId, usuario?.nombre]);

  // Acciones
  const marcarComoRecibidaYNavegar = async (orden) => {
    try {
      await updateDoc(doc(db, "ordenes", orden.id), {
        recibida: true,
        fechaRecibida: serverTimestamp(),
      });

      const { lat, lng } = getCoords(orden);
      if (lat != null && lng != null) {
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
    } catch (e) {
      console.error("Entregada:", e);
      alert("No pude marcar como entregada.");
    }
  };

  // Helpers UI
  const gmapsUrl = (lat, lng) =>
    lat != null && lng != null ? `https://www.google.com/maps?q=${lat},${lng}` : null;

  // Render
  const titulo =
    rol === "administrador" ? "Órdenes (Administrador)" : "Mis Órdenes Asignadas";

  return (
    <div style={{ padding: 20 }}>
      <h2>{titulo}</h2>

      {ordenes.length === 0 && <p>No hay órdenes pendientes asignadas.</p>}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {ordenes.map((o) => {
          const estado = o.entregado ? "ENTREGADA" : o.recibida ? "RECIBIDA" : "PENDIENTE";

          const dir = o.direccionTexto || o.address?.formatted || "—";
          const { lat, lng } = getCoords(o);
          const coordsText =
            lat != null && lng != null ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : "—";
          const gmaps = lat != null && lng != null ? gmapsUrl(lat, lng) : null;

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
              <div>Dirección: {dir} — Coords: {coordsText}
                {gmaps && (
                  <>
                    {" — "}
                    <a href={gmaps} target="_blank" rel="noopener noreferrer">
                      Abrir en Google Maps
                    </a>
                  </>
                )}
              </div>
              <div>
                Estado: <b>{estado}</b>
              </div>

              {/* Acciones */}
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {/* Ver en mapa: siempre visible para Admin/Operador/Mensajero */}
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
