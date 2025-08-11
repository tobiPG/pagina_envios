// ==========================
// src/pantallas/Dashboard.jsx
// ==========================

// 1) Importamos cosas de React (para manejar datos y cambios en la pantalla)
import { useState, useEffect, useMemo } from "react";

// 2) Importamos el mapa (Leaflet) y su CSS
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// 3) Importamos Firestore (tu base de datos en la nube)
import { db } from "../firebaseConfig";
import { collection, onSnapshot /*, query, where, orderBy */ } from "firebase/firestore";

// 4) Importamos los "roles" (quién puede ver qué)
import { useRole } from "../hooks/useRole";
import { canSeeAllOrders } from "../utils/roles";

// 5) Icono bonito para el mensajero en el mapa
const mensajeroIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40],
});

// 6) Función para mostrar el estado de la orden con un texto claro
function estadoBadge(orden) {
  if (orden.entregado) return "✅ Entregada";
  if (orden.recibida) return "📦 Recibida";
  return "⏳ Pendiente";
}

// 7) Colores para el tiempo real vs tiempo estimado
function getTiempoRealColor(tiempoReal, tiempoEstimado) {
  if (tiempoReal === null || tiempoReal === undefined) return "black";
  if (!tiempoEstimado) return "black";
  return tiempoReal <= tiempoEstimado ? "green" : "red";
}

// 8) El componente principal: Dashboard (la pantalla que ves)
export default function Dashboard() {
  // a) Leemos el rol del usuario (por ahora está en useRole.js fijo como ADMIN)
  const { role } = useRole();

  // b) Aquí guardamos las órdenes y los mensajeros que vienen de la base de datos
  const [ordenes, setOrdenes] = useState([]);
  const [mensajeros, setMensajeros] = useState([]);

  // c) Cargar las ÓRDENES (por ahora desde localStorage para no romper nada)
  useEffect(() => {
    // ⚠️ HOY: seguimos leyendo de localStorage
    const datos = JSON.parse(localStorage.getItem("ordenesEntrega")) || [];
    setOrdenes(datos);

    // ✅ MAÑANA: cuando migremos, activamos Firestore:
    // const ref = collection(db, "ordenes");
    // const q = ref; // aquí puedes filtrar por empresa, estado, etc.
    // const unsubOrders = onSnapshot(q, (snap) => {
    //   const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    //   setOrdenes(all);
    // });
    // return () => unsubOrders && unsubOrders();
  }, []);

  // d) Cargar UBICACIONES de mensajeros (esto sí ya viene de Firestore en vivo)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "ubicacionesMensajeros"), (snapshot) => {
      const ubicaciones = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      setMensajeros(ubicaciones);
    });
    return () => unsub();
  }, []);

  // e) Definimos qué columnas se ven en la tabla según el rol
  const columnas = useMemo(() => {
    // columnas básicas
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

    // si el rol tiene permisos "grandes", mostramos quién registró la orden
    if (canSeeAllOrders(role)) {
      base.splice(4, 0, { key: "usuario", label: "Registrado por" });
    }
    return base;
  }, [role]);

  // f) Render (lo que se ve)
  return (
    <div style={{ padding: 20 }}>
      <h2>📊 Dashboard</h2>
      <div style={{ marginBottom: 8 }}>
        {/* Mostramos el rol actual para que sepas qué estás probando */}
        <small>Rol activo: <b>{role}</b></small>
      </div>

      {/* === TABLA DE ÓRDENES === */}
      <div style={{ overflowX: "auto" }}>
        <table border="1" cellPadding="8" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ backgroundColor: "#f0f0f0" }}>
            <tr>
              {columnas.map(col => <th key={col.key}>{col.label}</th>)}
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
                      return <td key={col.key}>{orden.tiempoEstimado ? `${orden.tiempoEstimado} min` : "N/A"}</td>;
                    }
                    if (col.key === "tiempoReal") {
                      return (
                        <td
                          key={col.key}
                          style={{ color: getTiempoRealColor(orden.tiempoReal, orden.tiempoEstimado), fontWeight: "bold" }}
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
        <MapContainer
          center={[18.4861, -69.9312]} // Santo Domingo
          zoom={12}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {mensajeros.map((m) => (
            <Marker key={m.id} position={[m.lat, m.lng]} icon={mensajeroIcon}>
              <Popup>
                🚴 Mensajero: {m.nombre || m.id} <br />
                Última actualización:{" "}
                {m.timestamp ? new Date(m.timestamp).toLocaleString() : "N/D"}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
