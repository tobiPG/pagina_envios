// ==========================
// src/pantallas/Dashboard.jsx
// ==========================

import { useState, useEffect, useMemo } from "react";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import { db } from "../firebaseConfig";
import { collection, onSnapshot /*, query, where, orderBy */ } from "firebase/firestore";

import { useRole } from "../hooks/useRole";
import { canSeeAllOrders } from "../utils/roles";

// ───────────────── Helpers de coords seguras ─────────────────
const toNumOrNull = (v) => {
  const n = typeof v === "number" ? v : (v != null ? Number(v) : NaN);
  return Number.isFinite(n) ? n : null;
};

// Marker que solo pinta si hay coords válidas
const SafeMarker = ({ position, debugId, children, ...rest }) => {
  const [lat, lng] = position || [];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    // Útil para detectar docs malos en Firestore
    console.warn("Marker ignorado por coords inválidas:", { lat, lng, debugId });
    return null;
  }
  return (
    <Marker position={[lat, lng]} {...rest}>
      {children}
    </Marker>
  );
};

// ─────────────── Icono para mensajeros ───────────────
const mensajeroIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40],
});

// Estado legible de órdenes
function estadoBadge(orden) {
  if (orden.entregado) return "✅ Entregada";
  if (orden.recibida) return "📦 Recibida";
  return "⏳ Pendiente";
}

function getTiempoRealColor(tiempoReal, tiempoEstimado) {
  if (tiempoReal === null || tiempoReal === undefined) return "black";
  if (!tiempoEstimado) return "black";
  return tiempoReal <= tiempoEstimado ? "green" : "red";
}

// ───────────────── Componente principal ─────────────────
export default function Dashboard() {
  const { role } = useRole();

  const [ordenes, setOrdenes] = useState([]);
  const [mensajeros, setMensajeros] = useState([]);

  // Órdenes (hoy aún desde localStorage)
  useEffect(() => {
    const datos = JSON.parse(localStorage.getItem("ordenesEntrega")) || [];
    setOrdenes(datos);

    // Firestore (cuando migremos):
    // const ref = collection(db, "ordenes");
    // const unsubOrders = onSnapshot(ref, (snap) => {
    //   const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    //   setOrdenes(all);
    // });
    // return () => unsubOrders && unsubOrders();
  }, []);

  // Ubicaciones mensajeros (tiempo real)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "ubicacionesMensajeros"), (snapshot) => {
      const ubicaciones = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setMensajeros(ubicaciones);
    });
    return () => unsub();
  }, []);

  // Normaliza coords de mensajeros y filtra inválidos (pero sin perder el log de SafeMarker)
  const mensajerosConCoords = useMemo(() => {
    return (mensajeros || []).map((m) => {
      const lat = toNumOrNull(m.lat);
      const lng = toNumOrNull(m.lng);
      return { ...m, _latNum: lat, _lngNum: lng };
    });
  }, [mensajeros]);

  // Columnas por rol
  const columnas = useMemo(() => {
    const base = [
      { key: "cliente", label: "Cliente" },
      { key: "producto", label: "Factura/Producto" },
      { key: "fecha", label: "Fecha" },
      { key: "hora", label: "Hora" },
      { key: "estado", label: "Estado" },
      { key: "mensajero", label: "Mensajero" },
      { key: "vehiculo", label: "Vehículo" },
      { key: "tiempoEstimado", label: "T. Estimado" },
      { key: "tiempoReal", label: "T. Real" },
    ];
    if (canSeeAllOrders(role)) {
      base.splice(4, 0, { key: "usuario", label: "Registrado por" });
    }
    return base;
  }, [role]);

  return (
    <div style={{ padding: 20 }}>
      <h2>📊 Dashboard</h2>
      <div style={{ marginBottom: 8 }}>
        <small>Rol activo: <b>{role}</b></small>
      </div>

      {/* === TABLA DE ÓRDENES === */}
      <div style={{ overflowX: "auto" }}>
        <table border="1" cellPadding="8" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ backgroundColor: "#f0f0f0" }}>
            <tr>
              {columnas.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordenes.length === 0 && (
              <tr>
                <td colSpan={columnas.length} style={{ textAlign: "center" }}>
                  No hay órdenes registradas
                </td>
              </tr>
            )}

            {ordenes.map((orden) => {
              const estado = estadoBadge(orden);
              return (
                <tr key={orden.id || `${orden.cliente}-${orden.fecha}-${orden.hora}`}>
                  {columnas.map((col) => {
                    if (col.key === "estado") {
                      return <td key={col.key}>{estado}</td>;
                    }
                    if (col.key === "tiempoEstimado") {
                      return (
                        <td key={col.key}>
                          {orden.tiempoEstimado ? `${orden.tiempoEstimado} min` : "N/A"}
                        </td>
                      );
                    }
                    if (col.key === "tiempoReal") {
                      return (
                        <td
                          key={col.key}
                          style={{
                            color: getTiempoRealColor(orden.tiempoReal, orden.tiempoEstimado),
                            fontWeight: "bold",
                          }}
                        >
                          {orden.tiempoReal !== undefined && orden.tiempoReal !== null
                            ? `${orden.tiempoReal} min`
                            : orden.entregado
                            ? "No calculado"
                            : "Pendiente"}
                        </td>
                      );
                    }
                    return <td key={col.key}>{orden[col.key] ?? "N/A"}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* === MAPA EN TIEMPO REAL === */}
      <h3 style={{ marginTop: 30 }}>🗺 Ubicación de Mensajeros</h3>
      <div style={{ height: 500, width: "100%", marginTop: 10 }}>
        <MapContainer center={[18.4861, -69.9312]} zoom={12} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {mensajerosConCoords.map((m) => (
            <SafeMarker
              key={m.id}
              position={[m._latNum, m._lngNum]}
              icon={mensajeroIcon}
              debugId={`rider-${m.id}`}
            >
              <Popup>
                🚴 Mensajero: {m.nombre || m.id} <br />
                Última actualización:{" "}
                {m.timestamp ? new Date(m.timestamp).toLocaleString() : "N/D"}
              </Popup>
            </SafeMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
