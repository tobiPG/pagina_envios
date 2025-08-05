import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { db } from "../firebaseConfig";
import { collection, onSnapshot } from "firebase/firestore";

// Icono personalizado para el mensajero
const mensajeroIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40]
});

function Dashboard() {
  const [ordenes, setOrdenes] = useState([]);
  const [mensajeros, setMensajeros] = useState([]);

  useEffect(() => {
    // Escuchar cambios en órdenes desde localStorage (puedes migrar a Firestore luego)
    const datos = JSON.parse(localStorage.getItem("ordenesEntrega")) || [];
    setOrdenes(datos);

    // Escuchar ubicaciones en tiempo real desde Firestore
    const unsub = onSnapshot(collection(db, "ubicacionesMensajeros"), (snapshot) => {
      const ubicaciones = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMensajeros(ubicaciones);
    });

    return () => unsub();
  }, []);

  // Color del tiempo real comparado con el estimado
  const getTiempoRealColor = (tiempoReal, tiempoEstimado) => {
    if (tiempoReal === null || tiempoReal === undefined) return "black";
    if (!tiempoEstimado) return "black";
    return tiempoReal <= tiempoEstimado ? "green" : "red";
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2>📊 Dashboard del Administrador</h2>

      {/* Tabla de órdenes */}
      <table border="1" cellPadding="8" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead style={{ backgroundColor: "#f0f0f0" }}>
          <tr>
            <th>Cliente</th>
            <th>Factura</th>
            <th>Fecha</th>
            <th>Hora</th>
            <th>Registrado por</th>
            <th>Estado</th>
            <th>Mensajero</th>
            <th>Vehículo</th>
            <th>Tiempo Estimado</th>
            <th>Tiempo Real</th>
          </tr>
        </thead>
        <tbody>
          {ordenes.length === 0 && (
            <tr>
              <td colSpan="10" style={{ textAlign: "center" }}>No hay órdenes registradas</td>
            </tr>
          )}
          {ordenes.map((orden) => (
            <tr key={orden.id}>
              <td>{orden.cliente}</td>
              <td>{orden.producto}</td>
              <td>{orden.fecha}</td>
              <td>{orden.hora}</td>
              <td>{orden.usuario}</td>
              <td>
                {orden.entregado
                  ? "✅ Entregado"
                  : orden.recibida
                  ? "📦 Recibida"
                  : "⏳ Pendiente"}
              </td>
              <td>{orden.mensajero || "N/A"}</td>
              <td>{orden.vehiculo || "N/A"}</td>
              <td>
                {orden.tiempoEstimado
                  ? `${orden.tiempoEstimado} min`
                  : "N/A"}
              </td>
              <td style={{ color: getTiempoRealColor(orden.tiempoReal, orden.tiempoEstimado), fontWeight: "bold" }}>
                {orden.tiempoReal !== undefined && orden.tiempoReal !== null
                  ? `${orden.tiempoReal} min`
                  : orden.entregado
                  ? "No calculado"
                  : "Pendiente"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mapa en tiempo real */}
      <h3 style={{ marginTop: "30px" }}>🗺 Ubicación de Mensajeros</h3>
      <div style={{ height: "500px", width: "100%", marginTop: "10px" }}>
        <MapContainer
          center={[18.4861, -69.9312]} // Centro en Santo Domingo
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
                🚴 Mensajero: {m.nombre} <br />
                Última actualización: {new Date(m.timestamp).toLocaleString()}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

export default Dashboard;
