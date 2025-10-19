import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// 📍 Ícono personalizado para mensajero
const iconMensajero = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

function RutaOptimizada() {
  const [ordenes, setOrdenes] = useState([]);
  const usuarioActivo = JSON.parse(localStorage.getItem("usuarioActivo"));

  useEffect(() => {
    const ordenesGuardadas = JSON.parse(localStorage.getItem("ordenesEntrega")) || [];
    // 📌 Filtrar solo las órdenes asignadas a este mensajero y que no estén entregadas
    const ordenesMensajero = ordenesGuardadas.filter(
      (orden) => orden.mensajero === usuarioActivo?.nombre && !orden.entregado
    );
    setOrdenes(ordenesMensajero);
  }, [usuarioActivo?.nombre]);

  return (
    <div>
      <h2>Ruta Optimizada</h2>

      {ordenes.length === 0 ? (
        <p>No tienes paradas asignadas.</p>
      ) : (
        <>
          <ul>
            {ordenes.map((orden) => (
              <li key={orden.id}>
                📦 {orden.producto} — {orden.cliente} <br />
                📍 {orden.direccion || "Dirección no especificada"}
              </li>
            ))}
          </ul>

          {/* 🗺 Mapa */}
          <MapContainer
            center={[18.4861, -69.9312]} // Centro en Santo Domingo
            zoom={12}
            style={{ height: "400px", width: "100%", marginTop: "20px" }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />

            {/* 📍 Marcadores */}
            {ordenes.map((orden, idx) =>
              orden.coordenadas ? (
                <Marker
                  key={idx}
                  position={orden.coordenadas}
                  icon={iconMensajero}
                >
                  <Popup>
                    <strong>{orden.producto}</strong>
                    <br />
                    Cliente: {orden.cliente}
                    <br />
                    Dirección: {orden.direccion}
                  </Popup>
                </Marker>
              ) : null
            )}

            {/* 🔗 Línea de la ruta */}
            {ordenes.length > 1 && (
              <Polyline
                positions={ordenes
                  .filter((o) => o.coordenadas)
                  .map((o) => o.coordenadas)}
                color="blue"
              />
            )}
          </MapContainer>
        </>
      )}
    </div>
  );
}

export default RutaOptimizada;

