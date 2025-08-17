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
  where,
} from "firebase/firestore";

import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { ensureUsuarioActivo } from "../utils/ensureUsuario"; // 👈 IMPORTANTE

// ===== Config =====
const COLEC_UBI = "ubicacionesMensajeros";
const COLEC_ORD = "ordenes"; // 👈 usar la colección que permiten tus reglas

// Ícono del mensajero
const iconMensajero = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -30],
});

// ====== Íconos de destino por estado ======
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

// Util: hoy en formato YYYY-MM-DD
function hoyYYYYMMDD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Util: abrir Google Maps
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

function BadgeEstado({ estado }) {
  const e = (estado || "").toLowerCase();
  const color = e === "en_ruta" ? "#0a7" : e === "disponible" ? "#09f" : e === "listo_para_ruta" ? "#6a5acd" : "#999";
  const label =
    e === "en_ruta" ? "En ruta" :
    e === "disponible" ? "Disponible" :
    e === "listo_para_ruta" ? "Listo para ruta" :
    "Inactivo";
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 12,
      background: color,
      color: "#fff",
      fontSize: 12
    }}>
      {label}
    </span>
  );
}

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
      <div style={{fontWeight:600, marginBottom:4}}>Estados del destino</div>
      {item("#e53935","Pendiente")}
      {item("#fb8c00","Recibida")}
      {item("#43a047","Entregada")}
    </div>
  );
}

// Normaliza coordenadas desde una orden
function getCoords(o) {
  const latRaw = o?.address?.lat ?? o?.destino?.lat ?? o?.destinoLat ?? null;
  const lngRaw = o?.address?.lng ?? o?.destino?.lng ?? o?.destinoLng ?? null;
  const latNum = typeof latRaw === "number" ? latRaw : (latRaw != null ? Number(latRaw) : NaN);
  const lngNum = typeof lngRaw === "number" ? lngRaw : (lngRaw != null ? Number(lngRaw) : NaN);
  const lat = Number.isFinite(latNum) ? latNum : null;
  const lng = Number.isFinite(lngNum) ? lngNum : null;
  return { lat, lng };
}

export default function MapaMensajeros() {
  const navigate = useNavigate();
  const { id } = useParams(); // /mapa/:id  → id de orden
  const { state } = useLocation() || {};

  // Usuario y empresa
  const usuario = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("usuarioActivo") || "null"); } catch { return null; }
  }, []);
  const empresaId = usuario?.empresaId != null ? String(usuario.empresaId) : null;

  const stateLat =
    typeof state?.lat === "number" ? state.lat : state?.lat != null ? Number(state.lat) : null;
  const stateLng =
    typeof state?.lng === "number" ? state.lng : state?.lng != null ? Number(state.lng) : null;
  const hasStateCoords = Number.isFinite(stateLat) && Number.isFinite(stateLng);
  const focusOrderId = id || state?.ordenId || null;
  const isFocusMode = !!(hasStateCoords || focusOrderId);

  const [mensajeros, setMensajeros] = useState([]);
  const [ordenesAll, setOrdenesAll] = useState([]);
  const [errMsg, setErrMsg] = useState("");

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

  const [soloHoy, setSoloHoy] = useState(true);
  const [soloPendientes, setSoloPendientes] = useState(true);

  const centro = useMemo(() => [18.4861, -69.9312], []);
  const fechaHoy = hoyYYYYMMDD();

  // ===== Asegurar sesión antes de leer Firestore =====
  useEffect(() => {
    (async () => {
      const ok = await ensureUsuarioActivo(); // 👈 importante
      if (!ok) {
        setErrMsg("No hay sesión de Firebase. Inicia sesión nuevamente.");
      }
    })();
  }, []);

  // Realtime: ubicacionesMensajeros
  useEffect(() => {
    let unsub = null;
    (async () => {
      const ok = await ensureUsuarioActivo(); // 👈 garantiza request.auth
      if (!ok) { setErrMsg("No autenticado."); return; }
      if (!empresaId) { setErrMsg("Falta empresaId."); return; }

      const ref = collection(db, COLEC_UBI);
      const qU = query(ref, where("empresaId", "==", empresaId));
      unsub = onSnapshot(
        qU,
        (snap) => {
          const arr = snap.docs.map((d) => {
            const x = d.data() || {};
            return {
              id: d.id,
              nombre: x.nombre || d.id,
              estado: (x.estado || "disponible").toLowerCase(),
              lat: x.lat,
              lng: x.lng,
              lastPingAt: x.lastPingAt?.toDate ? x.lastPingAt.toDate() : null,
            };
          });
          setMensajeros(arr);
          setErrMsg("");
        },
        (err) => {
          console.error("onSnapshot ubicacionesMensajeros:", err);
          if (err?.code === "permission-denied") {
            setErrMsg("Permiso denegado al leer ubicaciones. Verifica reglas y que los docs tengan empresaId.");
          } else {
            setErrMsg(err?.message || "No pude leer ubicaciones.");
          }
        }
      );
    })();
    return () => { if (unsub) unsub(); };
  }, [empresaId]);

  // Realtime: ordenes (vista general)
  useEffect(() => {
    if (isFocusMode) return;
    let unsub = null, unsubFallback = null;
    (async () => {
      const ok = await ensureUsuarioActivo();
      if (!ok) { setErrMsg("No autenticado."); return; }
      if (!empresaId) { setErrMsg("Falta empresaId."); return; }

      const ref = collection(db, COLEC_ORD);
      unsub = onSnapshot(
        query(ref, where("empresaId", "==", empresaId), orderBy("createdAt", "desc")),
        (snap) => {
          const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setOrdenesAll(arr);
          setErrMsg("");
        },
        (err) => {
          console.error("onSnapshot ordenes:", err);
          if (err?.code === "failed-precondition") {
            // Fallback sin orderBy si falta índice
            unsubFallback = onSnapshot(
              query(ref, where("empresaId", "==", empresaId)),
              (snap2) => {
                const arr2 = snap2.docs.map((d) => ({ id: d.id, ...d.data() }));
                arr2.sort((a, b) => (b?.createdAt?.toMillis?.() ?? 0) - (a?.createdAt?.toMillis?.() ?? 0));
                setOrdenesAll(arr2);
                setErrMsg("Falta índice (empresaId + createdAt). Usando fallback temporal.");
              },
              (e2) => setErrMsg(e2?.message || "No pude leer órdenes (fallback).")
            );
          } else if (err?.code === "permission-denied") {
            setErrMsg("Permiso denegado al leer órdenes. Verifica reglas y empresaId en cada doc.");
          } else {
            setErrMsg(err?.message || "No pude leer órdenes.");
          }
        }
      );
    })();
    return () => { if (unsub) unsub(); if (unsubFallback) unsubFallback(); };
  }, [isFocusMode, empresaId]);

  // Focus: cargar la orden puntual (desde 'ordenes', no 'ordenesEntrega')
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!isFocusMode || hasStateCoords || !focusOrderId) return;
      const ok = await ensureUsuarioActivo();
      if (!ok) { setErrorFocus("No autenticado."); return; }
      setLoadingFocus(true);
      setErrorFocus("");
      try {
        const ref = doc(db, COLEC_ORD, focusOrderId); // 👈 colección correcta
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
    })();
    return () => { mounted = false; };
  }, [isFocusMode, hasStateCoords, focusOrderId]);

  const ordenes = useMemo(() => {
    if (isFocusMode) return [];
    const hoy = hoyYYYYMMDD();
    return ordenesAll.filter((o) => {
      if (soloPendientes && o.entregado) return false;
      if (soloHoy && o.fecha !== hoy) return false;
      const { lat, lng } = getCoords(o);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
      return true;
    });
  }, [isFocusMode, ordenesAll, soloPendientes, soloHoy]);

  const bounds = useMemo(() => {
    const pts = [];
    if (isFocusMode) {
      const o = focusOrder;
      if (o) {
        const { lat, lng } = getCoords(o);
        if (Number.isFinite(lat) && Number.isFinite(lng)) pts.push([lat, lng]);
      } else if (hasStateCoords) {
        if (Number.isFinite(stateLat) && Number.isFinite(stateLng)) pts.push([stateLat, stateLng]);
      }
      mensajeros.forEach((m) => {
        const latN = Number(m.lat), lngN = Number(m.lng);
        if (Number.isFinite(latN) && Number.isFinite(lngN)) pts.push([latN, lngN]);
      });
      return pts;
    }
    mensajeros.forEach((m) => {
      const latN = Number(m.lat), lngN = Number(m.lng);
      if (Number.isFinite(latN) && Number.isFinite(lngN)) pts.push([latN, lngN]);
    });
    ordenes.forEach((o) => {
      const { lat, lng } = getCoords(o);
      if (Number.isFinite(lat) && Number.isFinite(lng)) pts.push([lat, lng]);
    });
    return pts;
  }, [isFocusMode, focusOrder, hasStateCoords, stateLat, stateLng, mensajeros, ordenes]);

  const lastLoc = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("ubicacionMensajero") || "null"); } catch { return null; }
  }, []);

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
            {lastLoc && Number.isFinite(Number(lastLoc.lat)) && Number.isFinite(Number(lastLoc.lng)) && (
              <div style={{ marginTop: 2 }}>
                Mi última ubicación: {Number(lastLoc.lat).toFixed(5)}, {Number(lastLoc.lng).toFixed(5)}
              </div>
            )}
          </div>
        </div>
      )}

      {errMsg && <div style={{ color: "#b00", marginBottom: 8 }}>{errMsg}</div>}

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

      <div style={{ height: 560, position: "relative" }}>
        <Legend />
        <MapContainer center={centro} zoom={isFocusMode ? 15 : 12} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Mensajeros */}
          {mensajeros.map((m) => {
            const latN = Number(m.lat);
            const lngN = Number(m.lng);
            if (!Number.isFinite(latN) || !Number.isFinite(lngN)) return null;
            const pos = [latN, lngN];
            const fecha = m.lastPingAt ? m.lastPingAt.toLocaleString() : "";
            return (
              <Marker key={`rider-${m.id}`} position={pos} icon={iconMensajero}>
                <Tooltip permanent direction="top" offset={[0, -18]}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <b>{m.nombre || m.id}</b> <BadgeEstado estado={m.estado} />
                  </div>
                </Tooltip>
                <Popup>
                  <div style={{ fontSize: 14 }}>
                    <div style={{ marginBottom: 4 }}>
                      <b>Mensajero:</b> {m.nombre || m.id} &nbsp; <BadgeEstado estado={m.estado} />
                    </div>
                    <div><b>Lat/Lng:</b> {pos[0].toFixed(5)}, {pos[1].toFixed(5)}</div>
                    <div><b>Último ping:</b> {fecha || "—"}</div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Vista general: destinos */}
          {!isFocusMode &&
            ordenes.map((o) => {
              const { lat, lng } = getCoords(o);
              if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
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

          {/* Vista enfocada: solo la orden actual */}
          {isFocusMode && puedeMostrarFocus && (
            <Marker position={[focusCoords.lat, focusCoords.lng]} icon={iconPorEstado(focusOrder)}>
              <Popup>
                <div style={{ fontSize: 14, minWidth: 220 }}>
                  {state?.cliente || focusOrder?.cliente ? <div><b>Cliente:</b> {state?.cliente || focusOrder?.cliente}</div> : null}
                  {state?.numeroFactura || focusOrder?.numeroFactura ? <div><b>Factura:</b> {state?.numeroFactura || focusOrder?.numeroFactura}</div> : null}
                  {state?.direccion || state?.address?.formatted || focusOrder?.direccionTexto || focusOrder?.address?.formatted ? (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>
                      {state?.direccion || state?.address?.formatted || focusOrder?.direccionTexto || focusOrder?.address?.formatted}
                    </div>
                  ) : null}
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

          <AutoFitBounds bounds={bounds} />
          <FitBoundsBtn bounds={bounds} />
        </MapContainer>
      </div>
    </div>
  );
}

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
