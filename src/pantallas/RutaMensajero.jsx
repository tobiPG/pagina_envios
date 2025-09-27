// src/pantallas/RutaMensajero.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { db } from "../firebaseConfig";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
} from "firebase/firestore";

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
const iconSelected = L.divIcon({
  className: "sel-icon",
  html: `<div style="width:22px;height:22px;border-radius:50%;background:#f59e0b;border:3px solid #fff;box-shadow:0 0 3px rgba(0,0,0,.5)"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
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
  const { id } = useParams(); // puede ser id de RUTA o de ORDEN (modo dual)
  const navigate = useNavigate();
  const { state } = useLocation() || {};

  // datos de usuario (para origen y filtros)
  const usuario = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("usuarioActivo") || "null"); } catch { return null; }
  }, []);
  const mensajeroId =
    usuario?.id || usuario?.uid || usuario?.userId || usuario?.usuarioId || usuario?.usuario || null;
  const empresaId =
    usuario?.empresaId != null ? String(usuario.empresaId) : null;

  // modo: "order" o "route"
  const [mode, setMode] = useState("order");

  // ===== ORDEN destino selecionado (para trazar) =====
  const [dest, setDest] = useState({ lat: null, lng: null, etiqueta: "", orderId: null });

  // ===== INFO RUTA + LISTA DE ÓRDENES (modo route) =====
  const [ruta, setRuta] = useState(null); // { id, nombre, fecha, estado, mensajeroUid, ... }
  const [ordenesRuta, setOrdenesRuta] = useState([]); // órdenes con rutaId == id

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // origen: primero ubicacionesMensajeros/<miUid>, luego geolocalización
  const [origin, setOrigin] = useState({ lat: null, lng: null, etiqueta: "Tu ubicación" });

  // polyline, distancia (m) y duración (s) de ORIGEN -> DESTINO seleccionado
  const [routeCoords, setRouteCoords] = useState([]);
  const [distM, setDistM] = useState(null);
  const [durS, setDurS] = useState(null);

  const defaultCenter = useMemo(() => [18.4861, -69.9312], []);

  // ========= DETECCIÓN DE MODO (RUTA vs ORDEN) =========
  useEffect(() => {
    let active = true;
    async function detectModeAndLoad() {
      setLoading(true);
      setErr("");

      // 1) Si vienen coords por state → tratamos como ORDEN (single)
      const sLat = normNum(state?.lat);
      const sLng = normNum(state?.lng);
      if (Number.isFinite(sLat) && Number.isFinite(sLng)) {
        if (!active) return;
        setMode("order");
        setRuta(null);
        setOrdenesRuta([]);
        setDest({
          lat: sLat,
          lng: sLng,
          etiqueta:
            state?.direccion ||
            state?.address?.formatted ||
            state?.cliente ||
            "Destino",
          orderId: state?.ordenId || null,
        });
        setLoading(false);
        return;
      }

      // 2) Intentar cargar RUTA con id
      try {
        const rRef = doc(db, "rutas", id);
        const rSnap = await getDoc(rRef);
        if (rSnap.exists()) {
          // MODO RUTA
          const r = { id: rSnap.id, ...rSnap.data() };
          if (!active) return;
          setMode("route");
          setRuta(r);
          // suscribimos órdenes de esa ruta
          if (empresaId) {
            const refO = collection(db, "ordenes");
            const q = query(
              refO,
              where("empresaId", "==", empresaId),
              where("rutaId", "==", id),
              // si quieres orden específico: orderBy("prioridad","desc") o createdAt
              // orderBy("createdAt","desc")
            );
            const unsub = onSnapshot(
              q,
              (snap) => {
                if (!active) return;
                const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setOrdenesRuta(arr);

                // Si no hay destino seleccionado, elegimos el primero con coords válidas
                const first = arr.find(o => {
                  const lat = normNum(o?.destinoLat ?? o?.address?.lat);
                  const lng = normNum(o?.destinoLng ?? o?.address?.lng);
                  return Number.isFinite(lat) && Number.isFinite(lng);
                });
                if (first && !dest.orderId) {
                  const lat = normNum(first?.destinoLat ?? first?.address?.lat);
                  const lng = normNum(first?.destinoLng ?? first?.address?.lng);
                  setDest({
                    lat, lng,
                    etiqueta: first.direccionTexto || first.address?.formatted || first.cliente || "Destino",
                    orderId: first.id,
                  });
                }
              },
              (e) => {
                if (!active) return;
                console.error("onSnapshot(ordenes ruta):", e);
                setErr("No pude cargar órdenes de la ruta.");
              }
            );
            // cleanup del snapshot
            return () => { unsub(); };
          }
          setLoading(false);
          return;
        }
      } catch (e) {
        console.warn("Intento leer ruta:", e?.message);
      }

      // 3) Fallback: cargar ORDEN por id
      try {
        const ref = doc(db, "ordenes", id);
        const snap = await getDoc(ref);
        if (!active) return;
        if (!snap.exists()) {
          setErr("No encontré la orden ni la ruta indicada.");
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
        setMode("order");
        setRuta(null);
        setOrdenesRuta([]);
        setDest({
          lat, lng,
          etiqueta: o.direccionTexto || o.address?.formatted || o.cliente || "Destino",
          orderId: snap.id,
        });
        setLoading(false);
      } catch (e) {
        console.error("RutaMensajero load order fallback:", e);
        setErr("Error cargando la orden.");
        setLoading(false);
      }
    }
    detectModeAndLoad();
    return () => { active = false; };
  }, [id, state, empresaId]); // reintenta si cambia empresaId

  // ========= ORIGEN: ubicacionesMensajeros/<uid>  -> navigator.geolocation =========
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
            setOrigin({ lat: null, lng: null, etiqueta: "" });
          },
          { enableHighAccuracy: true, timeout: 7000 }
        );
      }
    }

    resolveOrigin();
    return () => { cancelled = true; };
  }, [mensajeroId]);

  // ========= OSRM: ORIGEN -> DESTINO SELECCIONADO =========
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
      if (!Number.isFinite(oLat) || !Number.isFinite(oLng)) return; // sin origen, no trazamos

      try {
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

  // ========= Bounds (origen + todos los destinos o destino único) =========
  const pointsForBounds = useMemo(() => {
    const pts = [];
    if (Number.isFinite(origin.lat) && Number.isFinite(origin.lng)) pts.push([origin.lat, origin.lng]);

    if (mode === "route" && Array.isArray(ordenesRuta)) {
      for (const o of ordenesRuta) {
        const lat = normNum(o?.destinoLat ?? o?.address?.lat);
        const lng = normNum(o?.destinoLng ?? o?.address?.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) pts.push([lat, lng]);
      }
    } else {
      if (Number.isFinite(dest.lat) && Number.isFinite(dest.lng)) pts.push([dest.lat, dest.lng]);
    }
    return pts;
  }, [origin, dest, mode, ordenesRuta]);

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

  // ========= Helpers UI =========
  function estadoOrden(o) {
    return o.entregado ? "ENTREGADA" : o.recibida ? "RECIBIDA" : "PENDIENTE";
  }
  function toneOrden(o) {
    const e = estadoOrden(o);
    return e === "ENTREGADA" ? "ok" : e === "RECIBIDA" ? "warn" : "danger";
  }
  function Chip({ children, tone = "default" }) {
    const bg =
      tone === "ok"
        ? "var(--ok-bg)"
        : tone === "warn"
        ? "var(--warn-bg)"
        : tone === "danger"
        ? "var(--danger-bg)"
        : "var(--chip)";
    const bd =
      tone === "ok"
        ? "var(--ok-bd)"
        : tone === "warn"
        ? "var(--warn-bd)"
        : tone === "danger"
        ? "var(--danger-bd)"
        : "var(--border)";
    const tx =
      tone === "ok"
        ? "var(--ok-tx)"
        : tone === "warn"
        ? "var(--warn-tx)"
        : tone === "danger"
        ? "var(--danger-tx)"
        : "var(--text-muted)";
    return (
      <span
        style={{
          display: "inline-block",
          background: bg,
          border: `1px solid ${bd}`,
          color: tx,
          borderRadius: 999,
          padding: "4px 10px",
          fontSize: 12,
          lineHeight: 1,
        }}
      >
        {children}
      </span>
    );
  }

  // ========= UI =========
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>
          {mode === "route" ? `🧭 ${ruta?.nombre || "Ruta"} (${ruta?.fecha || "—"})` : "🧭 Ruta hacia el destino"}
        </h2>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={() => navigate(-1)}>&larr; Volver</button>
          <button onClick={() => openGmaps(true)} disabled={!Number.isFinite(dest.lat)}>Abrir en Google Maps (con origen)</button>
          <button onClick={() => openGmaps(false)} disabled={!Number.isFinite(dest.lat)}>Abrir en Google Maps (solo destino)</button>
        </div>
      </div>

      {mode === "route" && (
        <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {ruta?.mensajeroNombre && <span className="pill">Mensajero: <b>{ruta.mensajeroNombre}</b></span>}
          {ruta?.estado && <span className="pill">Estado ruta: <b>{String(ruta.estado).toUpperCase()}</b></span>}
          <span className="pill">Órdenes: <b>{ordenesRuta.length}</b></span>
        </div>
      )}

      {loading && <div style={{ marginTop: 8 }}>Cargando…</div>}
      {!!err && <div style={{ marginTop: 8, color: "#b00" }}>{err}</div>}

      <div style={{ marginTop: 8, fontSize: 14, color: "#333" }}>
        {Number.isFinite(origin.lat) && Number.isFinite(origin.lng) ? (
          <div><b>Origen:</b> {origin.etiqueta} ({origin.lat?.toFixed(5)}, {origin.lng?.toFixed(5)})</div>
        ) : (
          <div><b>Origen:</b> — (activa tu GPS o registra tu ubicación)</div>
        )}
        {Number.isFinite(dest.lat) && Number.isFinite(dest.lng) ? (
          <div><b>Destino seleccionado:</b> {dest.etiqueta} ({dest.lat?.toFixed(5)}, {dest.lng?.toFixed(5)})</div>
        ) : (
          <div><b>Destino seleccionado:</b> —</div>
        )}
        {(distanceKm || etaMin) && (
          <div style={{ marginTop: 4 }}>
            {distanceKm && <span><b>Distancia:</b> {distanceKm} km</span>}
            {etaMin != null && <span> &nbsp;•&nbsp; <b>ETA:</b> {etaMin} min</span>}
          </div>
        )}
      </div>

      {/* MAPA */}
      <div style={{ height: 560, marginTop: 10 }}>
        <MapContainer center={defaultCenter} zoom={12} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Origen */}
          {Number.isFinite(origin.lat) && Number.isFinite(origin.lng) && (
            <Marker position={[origin.lat, origin.lng]} icon={iconOrigen}>
              <Popup>Origen: {origin.etiqueta || "Tu ubicación"}</Popup>
            </Marker>
          )}

          {/* Destinos — modo ruta: todos; modo orden: único */}
          {mode === "route" ? (
            ordenesRuta.map(o => {
              const lat = normNum(o?.destinoLat ?? o?.address?.lat);
              const lng = normNum(o?.destinoLng ?? o?.address?.lng);
              if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
              const isSel = dest.orderId === o.id;
              return (
                <Marker key={o.id} position={[lat, lng]} icon={isSel ? iconSelected : iconDestino}>
                  <Popup>
                    <div style={{ minWidth: 180 }}>
                      <div style={{ fontWeight: 700 }}>{o.cliente || "Cliente"}</div>
                      <div style={{ fontSize: 12, color: "#555" }}>{o.numeroFactura || "—"}</div>
                      <div style={{ fontSize: 12, marginTop: 4 }}>
                        {o.direccionTexto || o.address?.formatted || "Sin dirección"}
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <button
                          onClick={() => {
                            setDest({
                              lat,
                              lng,
                              etiqueta: o.direccionTexto || o.address?.formatted || o.cliente || "Destino",
                              orderId: o.id,
                            });
                          }}
                        >
                          Trazar hasta aquí
                        </button>{" "}
                        <button onClick={() => navigate(`/orden/${o.id}`)}>Ver orden</button>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })
          ) : (
            Number.isFinite(dest.lat) && Number.isFinite(dest.lng) && (
              <Marker position={[dest.lat, dest.lng]} icon={iconDestino}>
                <Popup>Destino: {dest.etiqueta || "Destino"}</Popup>
              </Marker>
            )
          )}

          {/* Polyline ORIGEN -> DESTINO seleccionado */}
          {routeCoords.length > 1 && (
            <Polyline positions={routeCoords} weight={5} opacity={0.85} />
          )}

          <FitToPoints points={pointsForBounds} />
        </MapContainer>
      </div>

      {/* LISTA DE ÓRDENES DE LA RUTA */}
      {mode === "route" && (
        <section className="card" style={{ marginTop: 14 }}>
          <h3 style={{ margin: "0 0 8px 0", fontSize: 16 }}>Órdenes de la ruta</h3>
          <div style={{ overflowX: "auto" }}>
            {ordenesRuta.length ? (
              <table className="nice-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #eee" }}>Cliente</th>
                    <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #eee" }}>Factura</th>
                    <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #eee" }}>Dirección</th>
                    <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #eee" }}>Estado</th>
                    <th style={{ width: 280, padding: "8px 10px", borderBottom: "1px solid #eee" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {ordenesRuta.map((o) => {
                    const lat = normNum(o?.destinoLat ?? o?.address?.lat);
                    const lng = normNum(o?.destinoLng ?? o?.address?.lng);
                    const e = estadoOrden(o);
                    const t = toneOrden(o);
                    return (
                      <tr key={o.id}>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f2f2ff", fontWeight: 600 }}>
                          {o.cliente || "—"}
                        </td>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f2f2ff" }}>
                          {o.numeroFactura || "—"}
                        </td>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f2f2ff", minWidth: 220 }}>
                          {o.direccionTexto || o.address?.formatted || "—"}
                        </td>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f2f2ff" }}>
                          <Chip tone={t}>{e}</Chip>
                        </td>
                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #f3f2f2ff" }}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button onClick={() => navigate(`/orden/${o.id}`)}>👁️ Ver</button>
                            <button
                              onClick={() => {
                                if (Number.isFinite(lat) && Number.isFinite(lng)) {
                                  setDest({
                                    lat,
                                    lng,
                                    etiqueta: o.direccionTexto || o.address?.formatted || o.cliente || "Destino",
                                    orderId: o.id,
                                  });
                                  // scroll near map if needed
                                  window.scrollTo({ top: 0, behavior: "smooth" });
                                } else {
                                  alert("Esta orden no tiene coordenadas.");
                                }
                              }}
                            >
                              🧭 Trazar
                            </button>
                            {Number.isFinite(lat) && Number.isFinite(lng) && (
                              <button
                                onClick={() => {
                                  const d = `${lat},${lng}`;
                                  if (Number.isFinite(origin.lat) && Number.isFinite(origin.lng)) {
                                    const oStr = `${origin.lat},${origin.lng}`;
                                    window.open(
                                      `https://www.google.com/maps/dir/?api=1&origin=${oStr}&destination=${d}&travelmode=driving`,
                                      "_blank"
                                    );
                                  } else {
                                    window.open(
                                      `https://www.google.com/maps/dir/?api=1&destination=${d}&travelmode=driving`,
                                      "_blank"
                                    );
                                  }
                                }}
                              >
                                📍 Google Maps
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="muted">No hay órdenes asignadas a esta ruta.</div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/* ===== Estilos suaves mínimos (si no existen globales) ===== */
if (!document.getElementById("ruta-mensajero-soft-styles")) {
  const css = document.createElement("style");
  css.id = "ruta-mensajero-soft-styles";
  css.innerHTML = `
  :root{
    --border:#e5e7eb;
    --text-muted:#6b7280;
    --chip:#f5f7fa;
    --ok-bg:#ecfdf5; --ok-bd:#a7f3d0; --ok-tx:#047857;
    --warn-bg:#fff7ed; --warn-bd:#fed7aa; --warn-tx:#9a3412;
    --danger-bg:#fef2f2; --danger-bd:#fecaca; --danger-tx:#991b1b;
  }
  .pill{
    display:inline-block;padding:6px 10px;border-radius:999px;
    border:1px solid var(--border);background:#f8fafc;color:#374151;
    font-size:12px;font-weight:600
  }
  .muted{ color: var(--text-muted); font-size: 13px; }
  `;
  document.head.appendChild(css);
}
