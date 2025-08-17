// src/pantallas/RutaMensajero.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { db } from "../firebaseConfig";
import { doc, getDoc } from "firebase/firestore";

import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

/** Iconos simples */
const iconDestino = L.divIcon({
  className: "destino-icon",
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#2e7d32;border:2px solid #fff;box-shadow:0 0 2px rgba(0,0,0,.4)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});
const iconOrigen = L.divIcon({
  className: "origen-icon",
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#1565c0;border:2px solid #fff;box-shadow:0 0 2px rgba(0,0,0,.4)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function normNum(v) {
  if (typeof v === "number") return v;
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Ajusta el mapa a los puntos dados */
function FitToPoints({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points || points.length === 0) return;
    const latlngs = points.filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (!latlngs.length) return;
    map.fitBounds(latlngs, { padding: [30, 30] });
  }, [points, map]);
  return null;
}

export default function RutaMensajero() {
  const { id } = useParams(); // id de la orden
  const navigate = useNavigate();
  const { state } = useLocation() || {};

  // datos de usuario (para fallback de origen por doc en ubicacionesMensajeros)
  const usuario = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("usuarioActivo") || "null"); } catch { return null; }
  }, []);
  const mensajeroId =
    usuario?.id || usuario?.uid || usuario?.userId || usuario?.usuarioId || usuario?.usuario || null;

  // destino (desde state o desde la orden en Firestore)
  const [dest, setDest] = useState({ lat: null, lng: null, etiqueta: "" });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // origen: primero intentamos doc de ubicacionesMensajeros (si hay), luego geolocalización
  const [origin, setOrigin] = useState({ lat: null, lng: null, etiqueta: "Tu ubicación" });

  // ruta (polyline), distancia (m) y duración (s)
  const [routeCoords, setRouteCoords] = useState([]);
  const [distM, setDistM] = useState(null);
  const [durS, setDurS] = useState(null);

  const defaultCenter = useMemo(() => [18.4861, -69.9312], []);

  /** Carga orden si no llegó por state */
  useEffect(() => {
    let active = true;
    async function loadOrder() {
      setLoading(true);
      setErr("");
      try {
        // Si trae coords por state, úsalo
        const sLat = normNum(state?.lat);
        const sLng = normNum(state?.lng);
        if (Number.isFinite(sLat) && Number.isFinite(sLng)) {
          if (!active) return;
          setDest({
            lat: sLat,
            lng: sLng,
            etiqueta:
              state?.direccion ||
              state?.address?.formatted ||
              state?.cliente ||
              "Destino",
          });
          setLoading(false);
          return;
        }

        // Sino, leer la orden
        if (!id) {
          setErr("No se proporcionó ID de orden ni coordenadas.");
          setLoading(false);
          return;
        }
        const ref = doc(db, "ordenes", id);
        const snap = await getDoc(ref);
        if (!active) return;
        if (!snap.exists()) {
          setErr("No encontré la orden.");
          setLoading(false);
          return;
        }
        const o = snap.data() || {};
        const lat = normNum(o?.destinoLat ?? o?.address?.lat ?? o?.destino?.lat);
        const lng = normNum(o?.destinoLng ?? o?.address?.lng ?? o?.destino?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          setErr("La orden no tiene coordenadas de destino.");
          setLoading(false);
          return;
        }
        setDest({
          lat, lng,
          etiqueta: o.direccionTexto || o.address?.formatted || o.cliente || "Destino",
        });
        setLoading(false);
      } catch (e) {
        console.error("RutaMensajero loadOrder:", e);
        setErr("Error cargando la orden.");
        setLoading(false);
      }
    }
    loadOrder();
    return () => { active = false; };
  }, [id, state]);

  /** Origen: 1) doc ubicacionesMensajeros/<miId>  2) navigator.geolocation */
  useEffect(() => {
    let cancelled = false;

    async function resolveOrigin() {
      // 1) Firestore (si tenemos id)
      if (mensajeroId) {
        try {
          const ref = doc(db, "ubicacionesMensajeros", mensajeroId);
          const snap = await getDoc(ref);
          if (!cancelled && snap.exists()) {
            const d = snap.data() || {};
            const lat = normNum(d.lat);
            const lng = normNum(d.lng);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
              setOrigin({ lat, lng, etiqueta: d.nombre || "Origen" });
              return;
            }
          }
        } catch (e) {
          console.warn("No pude leer ubicacionesMensajeros:", e?.message);
        }
      }

      // 2) Geolocalización del navegador
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (cancelled) return;
            setOrigin({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              etiqueta: "Tu ubicación",
            });
          },
          () => {
            if (cancelled) return;
            // sin origen → se mostrará solo destino
            setOrigin({ lat: null, lng: null, etiqueta: "" });
          },
          { enableHighAccuracy: true, timeout: 7000 }
        );
      }
    }

    resolveOrigin();
    return () => { cancelled = true; };
  }, [mensajeroId]);

  /** Solicita ruta a OSRM cuando hay origen y destino */
  useEffect(() => {
    async function calcRoute() {
      setRouteCoords([]);
      setDistM(null);
      setDurS(null);

      const oLat = normNum(origin.lat);
      const oLng = normNum(origin.lng);
      const dLat = normNum(dest.lat);
      const dLng = normNum(dest.lng);

      if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) return;
      if (!Number.isFinite(oLat) || !Number.isFinite(oLng)) return; // si no hay origen, no trazamos

      try {
        // OSRM espera lng,lat
        const url = `https://router.project-osrm.org/route/v1/driving/${oLng},${oLat};${dLng},${dLat}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const json = await res.json();
        if (json.code !== "Ok" || !json.routes?.length) return;

        const route = json.routes[0];
        setDistM(route.distance || null);
        setDurS(route.duration || null);

        const coords = (route.geometry?.coordinates || [])
          .map(([lng, lat]) => [lat, lng])
          .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

        setRouteCoords(coords);
      } catch (e) {
        console.warn("No pude calcular la ruta OSRM:", e?.message);
      }
    }
    calcRoute();
  }, [origin, dest]);

  const pointsForBounds = useMemo(() => {
    const pts = [];
    if (Number.isFinite(origin.lat) && Number.isFinite(origin.lng)) pts.push([origin.lat, origin.lng]);
    if (Number.isFinite(dest.lat) && Number.isFinite(dest.lng)) pts.push([dest.lat, dest.lng]);
    return pts;
  }, [origin, dest]);

  const distanceKm = distM != null ? (distM / 1000).toFixed(1) : null;
  const etaMin = durS != null ? Math.round(durS / 60) : null;

  const openGmaps = (useOrigin) => {
    const dOk = Number.isFinite(dest.lat) && Number.isFinite(dest.lng);
    if (!dOk) return;
    const d = `${dest.lat},${dest.lng}`;
    if (useOrigin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng)) {
      const o = `${origin.lat},${origin.lng}`;
      window.open(`https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}&travelmode=driving`, "_blank");
    } else {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${d}&travelmode=driving`, "_blank");
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h2 style={{ margin: 0 }}>🧭 Ruta hacia el destino</h2>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={() => navigate(-1)}>&larr; Volver</button>
          <button onClick={() => openGmaps(true)}>Abrir en Google Maps (con origen)</button>
          <button onClick={() => openGmaps(false)}>Abrir en Google Maps (solo destino)</button>
        </div>
      </div>

      {loading && <div style={{ marginTop: 8 }}>Cargando datos de la orden…</div>}
      {!!err && <div style={{ marginTop: 8, color: "#b00" }}>{err}</div>}

      <div style={{ marginTop: 8, fontSize: 14, color: "#333" }}>
        {Number.isFinite(origin.lat) && Number.isFinite(origin.lng) ? (
          <div><b>Origen:</b> {origin.etiqueta} ({origin.lat.toFixed(5)}, {origin.lng.toFixed(5)})</div>
        ) : (
          <div><b>Origen:</b> — (usa tu GPS o registra tu ubicación en el panel)</div>
        )}
        {Number.isFinite(dest.lat) && Number.isFinite(dest.lng) ? (
          <div><b>Destino:</b> {dest.etiqueta} ({dest.lat.toFixed(5)}, {dest.lng.toFixed(5)})</div>
        ) : (
          <div><b>Destino:</b> —</div>
        )}
        {(distanceKm || etaMin) && (
          <div style={{ marginTop: 4 }}>
            {distanceKm && <span><b>Distancia:</b> {distanceKm} km</span>}
            {etaMin != null && <span> &nbsp;•&nbsp; <b>ETA:</b> {etaMin} min</span>}
          </div>
        )}
      </div>

      <div style={{ height: 560, marginTop: 10 }}>
        <MapContainer center={defaultCenter} zoom={12} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Origen (si hay) */}
          {Number.isFinite(origin.lat) && Number.isFinite(origin.lng) && (
            <Marker position={[origin.lat, origin.lng]} icon={iconOrigen}>
              <Popup>Origen: {origin.etiqueta || "Tu ubicación"}</Popup>
            </Marker>
          )}

          {/* Destino */}
          {Number.isFinite(dest.lat) && Number.isFinite(dest.lng) && (
            <Marker position={[dest.lat, dest.lng]} icon={iconDestino}>
              <Popup>Destino: {dest.etiqueta || "Destino"}</Popup>
            </Marker>
          )}

          {/* Ruta */}
          {routeCoords.length > 1 && (
            <Polyline positions={routeCoords} weight={5} opacity={0.85} />
          )}

          <FitToPoints points={pointsForBounds} />
        </MapContainer>
      </div>
    </div>
  );
}
