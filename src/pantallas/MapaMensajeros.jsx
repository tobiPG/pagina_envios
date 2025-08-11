import { useEffect, useMemo, useRef, useState } from "react";
import { db } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Íconos
const iconMensajero = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -30],
});

const iconDestino = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [0, -30],
});

// Util: hoy en formato YYYY-MM-DD (zona local)
function hoyYYYYMMDD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Util: abrir Google Maps con coords exactas
function abrirRutaGoogle(destLat, destLng, useOrigin = true) {
  const destino = `${Number(destLat)},${Number(destLng)}`;

  const abrir = (origin) => {
    const url = origin
      ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destino}&travelmode=driving`
      : `https://www.google.com/maps/dir/?api=1&destination=${destino}&travelmode=driving`;
    window.open(url, "_blank");
  };

  if (!useOrigin) return abrir(null);

  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => abrir(`${pos.coords.latitude},${pos.coords.longitude}`),
      () => abrir(null),
      { enableHighAccuracy: true, timeout: 6000 }
    );
  } else {
    abrir(null);
  }
}

// Botón para ajustar mapa a todos los marcadores
function FitBoundsBtn({ bounds }) {
  const map = useMap();
  return (
    <button
      onClick={() => {
        if (!bounds || bounds.length === 0) return;
        map.fitBounds(bounds, { padding: [30, 30] });
      }}
      style={{
        position: "absolute",
        zIndex: 1000,
        top: 12,
        right: 12,
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: "6px 10px",
        cursor: "pointer",
      }}
      title="Ajustar mapa a mensajeros y destinos"
    >
      Ajustar vista
    </button>
  );
}

export default function MapaMensajeros() {
  const [mensajeros, setMensajeros] = useState([]);
  const [ordenesAll, setOrdenesAll] = useState([]);

  // Filtros UI
  const [soloHoy, setSoloHoy] = useState(true);
  const [soloPendientes, setSoloPendientes] = useState(true);

  const centro = useMemo(() => [18.4861, -69.9312], []);
  const fechaHoy = hoyYYYYMMDD();

  // Leer ubicacionesMensajeros (en tiempo real)
  useEffect(() => {
    const ref = collection(db, "ubicacionesMensajeros");
    // si guardas timestamp, ordenar ayuda a traer lo más reciente
    const q = query(ref, orderBy("timestamp", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMensajeros(arr);
      },
      (err) => console.error("onSnapshot ubicacionesMensajeros:", err)
    );
    return () => unsub();
  }, []);

  // Leer ordenes (en tiempo real)
  useEffect(() => {
    const ref = collection(db, "ordenes");
    // sin filtros en servidor para evitar índices al inicio
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setOrdenesAll(arr);
      },
      (err) => console.error("onSnapshot ordenes:", err)
    );
    return () => unsub();
  }, []);

  // Aplicar filtros en cliente
  const ordenes = ordenesAll.filter((o) => {
    if (soloPendientes && o.entregado) return false;
    if (soloHoy && o.fecha !== fechaHoy) return false;
    // necesitamos coords válidas
    const lat = (o.destinoLat ?? o.address?.lat);
    const lng = (o.destinoLng ?? o.address?.lng);
    if (lat == null || lng == null) return false;
    return true;
  });

  // Calcular bounds
  const bounds = useMemo(() => {
    const pts = [];
    mensajeros.forEach((m) => {
      if (m.lat != null && m.lng != null) pts.push([Number(m.lat), Number(m.lng)]);
    });
    ordenes.forEach((o) => {
      const lat = Number(o.destinoLat ?? o.address?.lat);
      const lng = Number(o.destinoLng ?? o.address?.lng);
      if (!isNaN(lat) && !isNaN(lng)) pts.push([lat, lng]);
    });
    return pts;
  }, [mensajeros, ordenes]);

  // Guardar última ubicación de mensajero local (para info)
  const lastLoc = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("ubicacionMensajero") || "null"); }
    catch { return null; }
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h2>🗺️ Mapa: Mensajeros + Destinos</h2>

      <div style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap",
        marginTop: 6,
        marginBottom: 10
      }}>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={soloHoy} onChange={e => setSoloHoy(e.target.checked)} />
          Solo hoy ({fechaHoy})
        </label>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={soloPendientes} onChange={e => setSoloPendientes(e.target.checked)} />
          Solo pendientes
        </label>

        <div style={{ marginLeft: "auto", fontSize: 12, color: "#555" }}>
          <span style={{ marginRight: 10 }}>📍 Mensajero</span>
          <span>📦 Destino</span>
          {lastLoc && (
            <div style={{ marginTop: 2 }}>
              Mi última ubicación: {Number(lastLoc.lat).toFixed(5)}, {Number(lastLoc.lng).toFixed(5)}
            </div>
          )}
        </div>
      </div>

      <div style={{ height: 560, position: "relative" }}>
        <MapContainer center={centro} zoom={12} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Mensajeros */}
          {mensajeros.map((m) => {
            if (m.lat == null || m.lng == null) return null;
            const fecha = m.timestamp
              ? new Date(m.timestamp).toLocaleString()
              : (m.ultimaActualizacion || m.ultima_actualizacion || "");
            return (
              <Marker
                key={`rider-${m.id}`}
                position={[Number(m.lat), Number(m.lng)]}
                icon={iconMensajero}
              >
                <Popup>
                  <div style={{ fontSize: 14 }}>
                    <b>Mensajero:</b> {m.nombre || m.id}<br />
                    <b>Lat/Lng:</b> {Number(m.lat).toFixed(5)}, {Number(m.lng).toFixed(5)}<br />
                    <b>Última actualización:</b> {fecha || "—"}
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Destinos de órdenes */}
          {ordenes.map((o) => {
            const lat = Number(o.destinoLat ?? o.address?.lat);
            const lng = Number(o.destinoLng ?? o.address?.lng);
            const coordsOk = !isNaN(lat) && !isNaN(lng);
            if (!coordsOk) return null;

            const estado = o.entregado ? "ENTREGADA" : o.recibida ? "RECIBIDA" : "PENDIENTE";
            return (
              <Marker
                key={`ord-${o.id}`}
                position={[lat, lng]}
                icon={iconDestino}
              >
                <Popup>
                  <div style={{ fontSize: 14, minWidth: 220 }}>
                    <div><b>Cliente:</b> {o.cliente}</div>
                    <div><b>Tel:</b> {o.telefono || "—"}</div>
                    <div><b>Factura:</b> {o.numeroFactura}</div>
                    <div><b>Fecha/Hora:</b> {o.fecha} {o.hora}</div>
                    <div><b>Estado:</b> {estado}</div>
                    <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>
                      {o.direccionTexto || o.address?.formatted}
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                      <button
                        onClick={() => abrirRutaGoogle(lat, lng, true)}
                        style={{ padding: "4px 8px" }}
                      >
                        Ruta desde aquí
                      </button>
                      <button
                        onClick={() => abrirRutaGoogle(lat, lng, false)}
                        style={{ padding: "4px 8px" }}
                      >
                        Solo destino
                      </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Control para ajustar bounds */}
          <FitBoundsBtn bounds={bounds} />
        </MapContainer>
      </div>
    </div>
  );
}
