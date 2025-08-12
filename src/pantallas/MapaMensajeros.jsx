// src/pantallas/MapaMensajeros.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { db } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  getDoc,
} from "firebase/firestore";

import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Íconos (mensajero conserva tu imagen)
const iconMensajero = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -30],
});

// ====== NUEVO: iconos de destino por estado (circulitos de color) ======
const mkDestino = (color) =>
  L.divIcon({
    className: "destino-dot",
    html: `<span style="
      display:inline-block;width:18px;height:18px;border-radius:50%;
      border:2px solid #fff;box-shadow:0 0 2px rgba(0,0,0,.4);background:${color};
    "></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });

const ICON_PENDIENTE = mkDestino("#e53935");  // rojo
const ICON_RECIBIDA  = mkDestino("#fb8c00");  // naranja
const ICON_ENTREGADA = mkDestino("#43a047");  // verde

function iconPorEstado(o) {
  if (o?.entregado) return ICON_ENTREGADA;
  if (o?.recibida)  return ICON_RECIBIDA;
  return ICON_PENDIENTE;
}
// ======================================================================

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

// Ajustar mapa a bounds
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

// (Opcional) Leyenda de colores
function Legend() {
  const item = (color, label) => (
    <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4}}>
      <span style={{
        display:"inline-block",width:12,height:12,borderRadius:"50%",
        background:color,border:"1px solid #fff",boxShadow:"0 0 1px rgba(0,0,0,.5)"
      }} />
      <span>{label}</span>
    </div>
  );
  return (
    <div style={{
      position:"absolute", bottom:12, left:12, zIndex:1000,
      background:"#fff", border:"1px solid #ddd", borderRadius:8, padding:"6px 10px",
      fontSize:12, color:"#333"
    }}>
      <div style={{fontWeight:600, marginBottom:4}}>Estados</div>
      
      {item("#fb8e00ff","Pendiente")}
      {item("#43a047","Entregada")}
    </div>
  );
}

// Normaliza coordenadas desde una orden
function getCoords(o) {
  const latRaw = o?.address?.lat ?? o?.destino?.lat ?? o?.destinoLat ?? null;
  const lngRaw = o?.address?.lng ?? o?.destino?.lng ?? o?.destinoLng ?? null;
  const lat =
    typeof latRaw === "number" ? latRaw : latRaw != null ? Number(latRaw) : null;
  const lng =
    typeof lngRaw === "number" ? lngRaw : lngRaw != null ? Number(lngRaw) : null;
  return {
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

export default function MapaMensajeros() {
  // Navegación / ruta / state
  const navigate = useNavigate();
  const { id } = useParams(); // /mapa/:id  → id de orden
  const { state } = useLocation() || {};

  // Modo enfocado si vienen coords por state o si hay :id en la URL
  const stateLat =
    typeof state?.lat === "number" ? state.lat : state?.lat != null ? Number(state.lat) : null;
  const stateLng =
    typeof state?.lng === "number" ? state.lng : state?.lng != null ? Number(state.lng) : null;
  const hasStateCoords = Number.isFinite(stateLat) && Number.isFinite(stateLng);
  const focusOrderId = id || state?.ordenId || null;
  const isFocusMode = !!(hasStateCoords || focusOrderId);

  // Datos
  const [mensajeros, setMensajeros] = useState([]);
  const [ordenesAll, setOrdenesAll] = useState([]);

  // Para focus mode, guardamos la orden enfocada (si hay que cargarla)
  const [focusOrder, setFocusOrder] = useState(
    hasStateCoords
      ? {
          id: focusOrderId || "sin-id",
          cliente: state?.cliente || "",
          numeroFactura: state?.numeroFactura || "",
          direccionTexto: state?.direccion || state?.address?.formatted || "",
          address: state?.address || (hasStateCoords ? { lat: stateLat, lng: stateLng } : null),
        }
      : null
  );
  const [loadingFocus, setLoadingFocus] = useState(false);
  const [errorFocus, setErrorFocus] = useState("");

  // Filtros UI (solo para vista general)
  const [soloHoy, setSoloHoy] = useState(true);
  const [soloPendientes, setSoloPendientes] = useState(true);

  const centro = useMemo(() => [18.4861, -69.9312], []);
  const fechaHoy = hoyYYYYMMDD();

  // Realtime: ubicacionesMensajeros (siempre; útiles en focus también)
  useEffect(() => {
    const ref = collection(db, "ubicacionesMensajeros");
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

  // Realtime: ordenes (solo si estamos en vista general; en focus no hace falta todo)
  useEffect(() => {
    if (isFocusMode) return;
    const ref = collection(db, "ordenes");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setOrdenesAll(arr);
      },
      (err) => console.error("onSnapshot ordenes:", err)
    );
    return () => unsub();
  }, [isFocusMode]);

  // Focus: si no llegaron coords por state pero tenemos :id, cargamos la orden puntual
  useEffect(() => {
    let mounted = true;
    async function loadFocusOrder() {
      if (!isFocusMode) return;
      if (hasStateCoords) return; // ya tenemos coords
      if (!focusOrderId) return;

      setLoadingFocus(true);
      setErrorFocus("");
      try {
        const ref = doc(db, "ordenes", focusOrderId);
        const snap = await getDoc(ref);
        if (!mounted) return;

        if (!snap.exists()) {
          setErrorFocus("No encontré la orden en la base de datos.");
          setFocusOrder(null);
          return;
        }
        const data = snap.data();
        setFocusOrder({ id: focusOrderId, ...data });
      } catch (e) {
        console.error("MapaMensajeros loadFocusOrder:", e);
        setErrorFocus("Error al cargar la orden.");
      } finally {
        setLoadingFocus(false);
      }
    }
    loadFocusOrder();
    return () => {
      mounted = false;
    };
  }, [isFocusMode, hasStateCoords, focusOrderId]);

  // Ordenes filtradas (solo vista general)
  const ordenes = useMemo(() => {
    if (isFocusMode) return [];
    return ordenesAll.filter((o) => {
      if (soloPendientes && o.entregado) return false;
      if (soloHoy && o.fecha !== fechaHoy) return false;
      const { lat, lng } = getCoords(o);
      if (lat == null || lng == null) return false;
      return true;
    });
  }, [isFocusMode, ordenesAll, soloPendientes, soloHoy, fechaHoy]);

  // Bounds (vista general = todos; focus = solo la orden + opcional riders)
  const bounds = useMemo(() => {
    const pts = [];
    if (isFocusMode) {
      const o = focusOrder;
      if (o) {
        const { lat, lng } = getCoords(o);
        if (lat != null && lng != null) pts.push([lat, lng]);
      } else if (hasStateCoords) {
        pts.push([stateLat, stateLng]);
      }
      // También agregamos mensajeros para que el “Ajustar vista” compare ambos
      mensajeros.forEach((m) => {
        if (m.lat != null && m.lng != null) pts.push([Number(m.lat), Number(m.lng)]);
      });
      return pts;
    }
    // Vista general
    mensajeros.forEach((m) => {
      if (m.lat != null && m.lng != null) pts.push([Number(m.lat), Number(m.lng)]);
    });
    ordenes.forEach((o) => {
      const { lat, lng } = getCoords(o);
      if (lat != null && lng != null) pts.push([lat, lng]);
    });
    return pts;
  }, [isFocusMode, focusOrder, hasStateCoords, stateLat, stateLng, mensajeros, ordenes]);

  // Última ubicación local del mensajero (solo info)
  const lastLoc = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("ubicacionMensajero") || "null");
    } catch {
      return null;
    }
  }, []);

  // Datos de la orden enfocada
  const focusCoords = useMemo(() => {
    if (hasStateCoords) return { lat: stateLat, lng: stateLng };
    if (focusOrder) return getCoords(focusOrder);
    return { lat: null, lng: null };
  }, [hasStateCoords, stateLat, stateLng, focusOrder]);

  const focusDireccion =
    state?.direccion ||
    state?.address?.formatted ||
    focusOrder?.direccionTexto ||
    focusOrder?.address?.formatted ||
    "";

  const focusCliente = state?.cliente || focusOrder?.cliente || "";
  const focusFactura = state?.numeroFactura || focusOrder?.numeroFactura || "";

  const puedeMostrarFocus =
    isFocusMode && Number.isFinite(focusCoords.lat) && Number.isFinite(focusCoords.lng);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>
          {isFocusMode ? "🧭 Mapa de entrega (enfocado)" : "🗺️ Mapa: Mensajeros + Destinos"}
        </h2>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={() => navigate(-1)}>&larr; Volver</button>
          {!isFocusMode && (
            <button
              onClick={() => window.dispatchEvent(new Event("ajustar-vista"))}
              title="Ajustar mapa a mensajeros y destinos"
            >
              Ajustar vista
            </button>
          )}
        </div>
      </div>

      {/* Filtros (solo vista general) */}
      {!isFocusMode && (
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            marginTop: 6,
            marginBottom: 10,
          }}
        >
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={soloHoy} onChange={(e) => setSoloHoy(e.target.checked)} />
            Solo hoy ({hoyYYYYMMDD()})
          </label>
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={soloPendientes}
              onChange={(e) => setSoloPendientes(e.target.checked)}
            />
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
      )}

      {/* Info orden enfocada */}
      {isFocusMode && (
        <div style={{ padding: "8px 0", fontSize: 14, color: "#333" }}>
          {loadingFocus && <div>Cargando orden…</div>}
          {!loadingFocus && errorFocus && (
            <div style={{ color: "#b00", marginBottom: 6 }}>{errorFocus}</div>
          )}
          {focusCliente && <span><b>Cliente:</b> {focusCliente} &nbsp;•&nbsp; </span>}
          {focusFactura && <span><b>Factura:</b> {focusFactura} &nbsp;•&nbsp; </span>}
          {focusDireccion && <span><b>Dirección:</b> {focusDireccion}</span>}
          {!puedeMostrarFocus && !loadingFocus && (
            <div style={{ marginTop: 8 }}>
              No hay coordenadas para esta orden.
              {focusOrderId && (
                <button
                  style={{ marginLeft: 8 }}
                  onClick={() =>
                    navigate(`/seleccionar-destino/${focusOrderId}`, {
                      state: { ordenId: focusOrderId },
                    })
                  }
                >
                  Seleccionar/Confirmar destino
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mapa */}
      <div style={{ height: 560, position: "relative" }}>
        <Legend />
        <MapContainer center={centro} zoom={isFocusMode ? 15 : 12} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Mensajeros (en ambos modos) */}
          {mensajeros.map((m) => {
            if (m.lat == null || m.lng == null) return null;
            const pos = [Number(m.lat), Number(m.lng)];
            const fecha = m.timestamp
              ? new Date(m.timestamp).toLocaleString()
              : m.ultimaActualizacion || m.ultima_actualizacion || "";
            return (
              <Marker key={`rider-${m.id}`} position={pos} icon={iconMensajero}>
                {/* Nombre del mensajero visible siempre */}
                <Tooltip permanent direction="top" offset={[0, -18]}>
                  {m.nombre || m.id}
                </Tooltip>
                <Popup>
                  <div style={{ fontSize: 14 }}>
                    <b>Mensajero:</b> {m.nombre || m.id}<br />
                    <b>Lat/Lng:</b> {pos[0].toFixed(5)}, {pos[1].toFixed(5)}<br />
                    <b>Última actualización:</b> {fecha || "—"}
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Vista general: todos los destinos (con color por estado) */}
          {!isFocusMode &&
            ordenes.map((o) => {
              const { lat, lng } = getCoords(o);
              if (lat == null || lng == null) return null;
              const estado = o.entregado ? "ENTREGADA" : o.recibida ? "RECIBIDA" : "PENDIENTE";
              return (
                <Marker key={`ord-${o.id}`} position={[lat, lng]} icon={iconPorEstado(o)}>
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
                        <button onClick={() => abrirRutaGoogle(lat, lng, true)} style={{ padding: "4px 8px" }}>
                          Ruta desde aquí
                        </button>
                        <button onClick={() => abrirRutaGoogle(lat, lng, false)} style={{ padding: "4px 8px" }}>
                          Solo destino
                        </button>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

          {/* Vista enfocada: solo la orden actual (con color por estado) */}
          {isFocusMode && puedeMostrarFocus && (
            <Marker position={[focusCoords.lat, focusCoords.lng]} icon={iconPorEstado(focusOrder)}>
              <Popup>
                <div style={{ fontSize: 14, minWidth: 220 }}>
                  {focusCliente && <div><b>Cliente:</b> {focusCliente}</div>}
                  {focusFactura && <div><b>Factura:</b> {focusFactura}</div>}
                  {focusDireccion && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>
                      {focusDireccion}
                    </div>
                  )}
                  <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                    <button
                      onClick={() => abrirRutaGoogle(focusCoords.lat, focusCoords.lng, true)}
                      style={{ padding: "4px 8px" }}
                    >
                      Ruta desde aquí
                    </button>
                    <button
                      onClick={() => abrirRutaGoogle(focusCoords.lat, focusCoords.lng, false)}
                      style={{ padding: "4px 8px" }}
                    >
                      Solo destino
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Control de FitBounds */}
          <AutoFitBounds bounds={bounds} />
          <FitBoundsBtn bounds={bounds} />
        </MapContainer>
      </div>
    </div>
  );
}

// Auto fit al montar y cuando cambian bounds (incluye escuchar un evento manual)
function AutoFitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [bounds, map]);

  useEffect(() => {
    function onAdjust() {
      if (bounds && bounds.length > 0) {
        map.fitBounds(bounds, { padding: [30, 30] });
      }
    }
    window.addEventListener("ajustar-vista", onAdjust);
    return () => window.removeEventListener("ajustar-vista", onAdjust);
  }, [bounds, map]);

  return null;
}
