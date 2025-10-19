// src/features/routes/pages/MultiStopCourierMapPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db } from "../../../shared/services/firebase.js";
import {
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  collection,
  updateDoc
} from "firebase/firestore";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Inject CSS once
function injectCssOnce() {
  if (document.getElementById("multiStopMapCss")) return;
  const css = document.createElement("style");
  css.id = "multiStopMapCss";
  css.innerHTML = `
    .multi-stop-map-container { 
      height: 100vh; 
      width: 100%; 
      position: relative; 
      background: #f8fafc; 
    }
    
    .map-header {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      padding: 16px 20px;
      border-bottom: 1px solid #e5e7eb;
      z-index: 1000;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .map-title {
      font-size: 18px;
      font-weight: 600;
      color: #111827;
      margin: 0;
    }
    
    .order-info {
      display: flex;
      align-items: center;
      gap: 16px;
      font-size: 14px;
      color: #6b7280;
    }
    
    .stops-sidebar {
      position: absolute;
      left: 20px;
      top: 100px;
      bottom: 20px;
      width: 320px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
      z-index: 1000;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    
    .sidebar-header {
      padding: 16px 20px;
      background: #6366f1;
      color: white;
      font-weight: 600;
      font-size: 16px;
    }
    
    .stops-list {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }
    
    .stop-item {
      background: #f8fafc;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
      cursor: pointer;
      transition: all 0.2s;
      position: relative;
    }
    
    .stop-item:hover {
      background: #f1f5f9;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }
    
    .stop-item.completed {
      background: #d1fae5;
      border-color: #10b981;
    }
    
    .stop-item.current {
      background: #fef3c7;
      border-color: #f59e0b;
      box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2);
    }
    
    .stop-number {
      position: absolute;
      top: -8px;
      left: -8px;
      background: #6366f1;
      color: white;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 600;
      border: 2px solid white;
    }
    
    .stop-number.completed {
      background: #10b981;
    }
    
    .stop-number.current {
      background: #f59e0b;
    }
    
    .stop-type {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      font-weight: 500;
      color: #6b7280;
      margin-bottom: 8px;
    }
    
    .stop-address {
      font-weight: 600;
      color: #111827;
      margin-bottom: 4px;
      font-size: 14px;
    }
    
    .stop-contact {
      font-size: 13px;
      color: #6b7280;
      margin-bottom: 8px;
    }
    
    .stop-actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    
    .btn-stop {
      flex: 1;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }
    
    .btn-complete {
      background: #10b981;
      color: white;
    }
    
    .btn-complete:hover {
      background: #059669;
    }
    
    .btn-navigate {
      background: #3b82f6;
      color: white;
    }
    
    .btn-navigate:hover {
      background: #2563eb;
    }
    
    .btn-call {
      background: #8b5cf6;
      color: white;
    }
    
    .btn-call:hover {
      background: #7c3aed;
    }
    
    .btn-completed {
      background: #6b7280;
      color: white;
      cursor: not-allowed;
    }
    
    .leaflet-container {
      margin-top: 80px;
      height: calc(100vh - 80px);
    }
    
    .route-progress {
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: white;
      padding: 16px 24px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      z-index: 1000;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    
    .progress-bar {
      width: 200px;
      height: 8px;
      background: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
    }
    
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #10b981, #06d6a0);
      transition: width 0.3s ease;
    }
    
    .progress-text {
      font-size: 14px;
      font-weight: 600;
      color: #111827;
    }
  `;
  document.head.appendChild(css);
}

// Icons for different stop types and states
const createStopIcon = (number, type, status) => {
  let backgroundColor = "#6366f1"; // default blue
  
  if (status === "completed") {
    backgroundColor = "#10b981"; // green
  } else if (status === "current") {
    backgroundColor = "#f59e0b"; // yellow
  }
  
  const emoji = type === "pickup" ? "📦" : "🚚";
  
  return L.divIcon({
    className: "stop-marker",
    html: `
      <div style="
        background: ${backgroundColor};
        color: white;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        font-weight: bold;
      ">
        ${number}
      </div>
      <div style="
        position: absolute;
        top: -8px;
        right: -8px;
        font-size: 12px;
        background: white;
        border-radius: 50%;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid ${backgroundColor};
      ">
        ${emoji}
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });
};

// Courier location icon
const courierIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40],
});

export default function MultiStopCourierMapPage() {
  injectCssOnce();
  
  const { id } = useParams(); // order ID
  const navigate = useNavigate();
  
  // ALL HOOKS MUST BE DECLARED BEFORE ANY CONDITIONAL RETURNS
  const [usuario, setUsuario] = useState(null);
  const [userLoading, setUserLoading] = useState(true);
  const [order, setOrder] = useState(null);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [courierLocation, setCourierLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Check user on component mount
  useEffect(() => {
    try {
      const usuarioLS = JSON.parse(localStorage.getItem("usuarioActivo") || "null");
      if (!usuarioLS || !usuarioLS.uid) {
        navigate("/login");
        return;
      }
      setUsuario(usuarioLS);
    } catch (error) {
      console.error("Error parsing user data:", error);
      navigate("/login");
      return;
    } finally {
      setUserLoading(false);
    }
  }, [navigate]);

  // Load order data
  useEffect(() => {
    if (!id) return;

    const unsubscribe = onSnapshot(doc(db, "ordenes", id), (doc) => {
      if (doc.exists()) {
        const orderData = { id: doc.id, ...doc.data() };
        setOrder(orderData);
        
        // Find current stop index
        const stops = orderData.stops || [];
        const currentIndex = stops.findIndex(stop => stop.estado !== "completed");
        setCurrentStopIndex(currentIndex >= 0 ? currentIndex : stops.length - 1);
      } else {
        setError("Orden no encontrada");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [id]);

  // Watch courier location if order is assigned
  useEffect(() => {
    if (!order?.mensajeroId) return;

    const q = query(
      collection(db, "ubicacionesMensajeros"),
      where("usuarioId", "==", order.mensajeroId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const location = snapshot.docs[0].data();
        setCourierLocation({
          lat: location.lat,
          lng: location.lng,
          timestamp: location.timestamp
        });
      }
    });

    return () => unsubscribe();
  }, [order?.mensajeroId]);

  // Mark stop as completed
  const completeStop = async (stopIndex) => {
    if (!order) return;

    try {
      const updatedStops = [...order.stops];
      updatedStops[stopIndex] = {
        ...updatedStops[stopIndex],
        estado: "completed",
        fechaCompletado: new Date().toISOString()
      };

      await updateDoc(doc(db, "ordenes", order.id), {
        stops: updatedStops
      });

      // If all stops completed, mark order as completed
      const allCompleted = updatedStops.every(stop => stop.estado === "completed");
      if (allCompleted) {
        await updateDoc(doc(db, "ordenes", order.id), {
          estado: "completado",
          fechaCompletado: new Date().toISOString()
        });
      }

    } catch (error) {
      console.error("Error completing stop:", error);
      setError("Error al completar la parada");
    }
  };

  // Navigate to external map app
  const openNavigation = (stop) => {
    if (stop.addressLat && stop.addressLng) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${stop.addressLat},${stop.addressLng}`;
      window.open(url, "_blank");
    }
  };

  // Call contact
  const callContact = (phone) => {
    if (phone) {
      window.open(`tel:${phone}`, "_self");
    }
  };

  // CONDITIONAL RETURNS AFTER ALL HOOKS
  if (userLoading) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <p>Verificando usuario...</p>
      </div>
    );
  }

  if (!usuario) {
    navigate("/login");
    return null;
  }

  if (loading) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <p>Cargando información de la entrega...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "20px", textAlign: "center", color: "#ef4444" }}>
        <p>{error}</p>
        <button onClick={() => navigate(-1)} style={{ marginTop: "10px" }}>
          Volver
        </button>
      </div>
    );
  }

  if (!order) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <p>No se encontró la orden</p>
      </div>
    );
  }

  const stops = order.stops || [];
  const completedStops = stops.filter(stop => stop.estado === "completed").length;
  const progressPercentage = stops.length > 0 ? (completedStops / stops.length) * 100 : 0;

  // Calculate map center and bounds
  const validStops = stops.filter(stop => stop.addressLat && stop.addressLng);
  const centerLat = validStops.length > 0 
    ? validStops.reduce((sum, stop) => sum + parseFloat(stop.addressLat), 0) / validStops.length
    : -12.0464; // Lima default
  const centerLng = validStops.length > 0 
    ? validStops.reduce((sum, stop) => sum + parseFloat(stop.addressLng), 0) / validStops.length
    : -77.0428; // Lima default

  // Create route polyline
  const routeCoordinates = validStops.map(stop => [
    parseFloat(stop.addressLat),
    parseFloat(stop.addressLng)
  ]);

  return (
    <div className="multi-stop-map-container">
      {/* Header */}
      <div className="map-header">
        <h1 className="map-title">
          🗺️ Entrega Multi-Stop
        </h1>
        <div className="order-info">
          <span><strong>Orden:</strong> #{order.id}</span>
          <span><strong>Cliente:</strong> {order.cliente}</span>
          <span><strong>Paradas:</strong> {completedStops}/{stops.length}</span>
        </div>
      </div>

      {/* Stops Sidebar */}
      <div className="stops-sidebar">
        <div className="sidebar-header">
          📋 Lista de Paradas
        </div>
        <div className="stops-list">
          {stops.map((stop, index) => {
            const isCompleted = stop.estado === "completed";
            const isCurrent = index === currentStopIndex && !isCompleted;
            
            return (
              <div
                key={index}
                className={`stop-item ${isCompleted ? "completed" : ""} ${isCurrent ? "current" : ""}`}
              >
                <div className={`stop-number ${isCompleted ? "completed" : ""} ${isCurrent ? "current" : ""}`}>
                  {index + 1}
                </div>
                
                <div className="stop-type">
                  {stop.tipo === "pickup" ? "📦 Recogida" : "🚚 Entrega"}
                </div>
                
                <div className="stop-address">
                  {stop.direccionTexto}
                </div>
                
                {stop.contacto && (
                  <div className="stop-contact">
                    👤 {stop.contacto}
                    {stop.telefonoContacto && ` • 📞 ${stop.telefonoContacto}`}
                  </div>
                )}

                {stop.instrucciones && (
                  <div className="stop-contact">
                    💬 {stop.instrucciones}
                  </div>
                )}

                <div className="stop-actions">
                  {!isCompleted ? (
                    <>
                      <button
                        className="btn-stop btn-complete"
                        onClick={() => completeStop(index)}
                      >
                        ✅ Completar
                      </button>
                      {stop.addressLat && stop.addressLng && (
                        <button
                          className="btn-stop btn-navigate"
                          onClick={() => openNavigation(stop)}
                        >
                          🧭 Navegar
                        </button>
                      )}
                      {stop.telefonoContacto && (
                        <button
                          className="btn-stop btn-call"
                          onClick={() => callContact(stop.telefonoContacto)}
                        >
                          📞 Llamar
                        </button>
                      )}
                    </>
                  ) : (
                    <button className="btn-stop btn-completed">
                      ✅ Completado
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Map */}
      <MapContainer
        center={[centerLat, centerLng]}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {/* Route polyline */}
        {routeCoordinates.length > 1 && (
          <Polyline
            positions={routeCoordinates}
            color="#6366f1"
            weight={4}
            opacity={0.7}
            dashArray="10, 10"
          />
        )}
        
        {/* Stop markers */}
        {validStops.map((stop, index) => {
          const isCompleted = stop.estado === "completed";
          const isCurrent = index === currentStopIndex && !isCompleted;
          
          let status = "pending";
          if (isCompleted) status = "completed";
          else if (isCurrent) status = "current";
          
          return (
            <Marker
              key={index}
              position={[parseFloat(stop.addressLat), parseFloat(stop.addressLng)]}
              icon={createStopIcon(index + 1, stop.tipo, status)}
            >
              <Popup>
                <div style={{ minWidth: "200px" }}>
                  <h3 style={{ margin: "0 0 8px 0", fontSize: "14px" }}>
                    Parada {index + 1} - {stop.tipo === "pickup" ? "📦 Recogida" : "🚚 Entrega"}
                  </h3>
                  <p style={{ margin: "4px 0", fontSize: "12px" }}>
                    <strong>Dirección:</strong><br />
                    {stop.direccionTexto}
                  </p>
                  {stop.contacto && (
                    <p style={{ margin: "4px 0", fontSize: "12px" }}>
                      <strong>Contacto:</strong> {stop.contacto}
                    </p>
                  )}
                  {stop.telefonoContacto && (
                    <p style={{ margin: "4px 0", fontSize: "12px" }}>
                      <strong>Teléfono:</strong> {stop.telefonoContacto}
                    </p>
                  )}
                  {stop.instrucciones && (
                    <p style={{ margin: "4px 0", fontSize: "12px" }}>
                      <strong>Instrucciones:</strong><br />
                      {stop.instrucciones}
                    </p>
                  )}
                  <p style={{ margin: "8px 0 0 0", fontSize: "12px", fontWeight: "bold" }}>
                    Estado: {isCompleted ? "✅ Completado" : isCurrent ? "📍 Actual" : "⏳ Pendiente"}
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}
        
        {/* Courier location */}
        {courierLocation && (
          <Marker
            position={[courierLocation.lat, courierLocation.lng]}
            icon={courierIcon}
          >
            <Popup>
              <div>
                <h3 style={{ margin: "0 0 8px 0", fontSize: "14px" }}>
                  🚚 Ubicación del Mensajero
                </h3>
                <p style={{ margin: "0", fontSize: "12px" }}>
                  Última actualización: {courierLocation.timestamp ? 
                    new Date(courierLocation.timestamp.toDate()).toLocaleTimeString() : 
                    "Desconocida"
                  }
                </p>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Progress bar */}
      <div className="route-progress">
        <div className="progress-text">
          Progreso: {completedStops}/{stops.length}
        </div>
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        <div className="progress-text">
          {Math.round(progressPercentage)}%
        </div>
      </div>
    </div>
  );
}