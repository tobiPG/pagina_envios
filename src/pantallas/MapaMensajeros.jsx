// src/pantallas/MapaMensajeros.jsx
import { useEffect, useMemo, useState, Fragment } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
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

import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap, CircleMarker, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { ensureUsuarioActivo } from "../utils/ensureUsuario";

// ===== Config =====
const COLEC_UBI = "ubicacionesMensajeros";
const COLEC_ORD = "ordenes";

// Ícono del mensajero
const iconMensajero = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -30],
});

// Ícono “mi ubicación”
const iconYo = L.divIcon({
  className: "yo-dot",
  html: `<span class="mm-yo"></span>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -10],
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

// helper para volar el mapa a coords
function FlyToBtn({ to, children = "Centrar mensajero", zoom = 15 }) {
  const map = useMap();
  if (!to || !Number.isFinite(to[0]) || !Number.isFinite(to[1])) return null;
  return (
    <button className="mm-btn" style={{ padding: "4px 8px" }} onClick={() => map.flyTo(to, zoom)}>
      {children}
    </button>
  );
}

// Botón “Ajustar vista”
function FitBoundsBtn({ bounds }) {
  const map = useMap();
  return (
    <button
      onClick={() => {
        if (!bounds || bounds.length === 0) return;
        map.fitBounds(bounds, { padding: [30, 30] });
      }}
      className="mm-btn mm-fab"
      style={{ position: "absolute", zIndex: 1000, top: 12, right: 12 }}
      title="Ajustar mapa a mensajeros y destinos"
    >
      Ajustar vista
    </button>
  );
}

// Botón “Mi ubicación”
function MiUbicBtn({ onFound }) {
  const map = useMap();
  return (
    <button
      className="mm-btn mm-fab"
      style={{ position: "absolute", zIndex: 1000, top: 56, right: 12 }}
      onClick={() => {
        if (!("geolocation" in navigator)) return alert("Geolocalización no soportada");
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            onFound && onFound({ lat, lng });
            map.setView([lat, lng], 15);
          },
          (err) => alert(err?.message || "No pude obtener tu ubicación"),
          { enableHighAccuracy: true, timeout: 7000 }
        );
      }}
      title="Centrar en mi ubicación"
    >
      Mi ubicación
    </button>
  );
}

function BadgeEstado({ estado }) {
  const e = (estado || "").toLowerCase();
  const color = e === "en_ruta" ? "#22c55e" : e === "disponible" ? "#3b82f6" : e === "listo_para_ruta" ? "#6d28d9" : "#999";
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
    <div className="mm-card" style={{
      position:"absolute", bottom:12, left:12, zIndex:1000,
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

  // Estilo de mapa base
  const [baseMap, setBaseMap] = useState("carto"); // "carto" | "osm"
  const baseTile = baseMap === "carto"
    ? {
        url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        attribution: '&copy; OpenStreetMap &copy; CARTO',
      }
    : {
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: '&copy; OpenStreetMap contributors',
      };

  // Mi ubicación
  const [miUbic, setMiUbic] = useState(null);

  const centro = useMemo(() => [18.4861, -69.9312], []);

  // ===== Asegurar sesión antes de leer Firestore =====
  useEffect(() => {
    (async () => {
      const ok = await ensureUsuarioActivo();
      if (!ok) {
        setErrMsg("No hay sesión de Firebase. Inicia sesión nuevamente.");
      }
    })();
  }, []);

  // Realtime: ubicacionesMensajeros
  useEffect(() => {
    let unsub = null;
    (async () => {
      const ok = await ensureUsuarioActivo();
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

  // Realtime: ordenes (vista general) — SIN FALLBACK
  useEffect(() => {
    if (isFocusMode) return;
    let unsub = null;
    (async () => {
      const ok = await ensureUsuarioActivo();
      if (!ok) { setErrMsg("No autenticado."); return; }
      if (!empresaId) { setErrMsg("Falta empresaId."); return; }

      const ref = collection(db, COLEC_ORD);
      const qO = query(ref, where("empresaId", "==", empresaId), orderBy("createdAt", "desc"));
      unsub = onSnapshot(
        qO,
        (snap) => {
          const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setOrdenesAll(arr);
          setErrMsg("");
        },
        (err) => setErrMsg(err?.message || "No pude leer órdenes.")
      );
    })();
    return () => { if (unsub) unsub(); };
  }, [isFocusMode, empresaId]);

  // Focus: cargar la orden puntual
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!isFocusMode || hasStateCoords || !focusOrderId) return;
      const ok = await ensureUsuarioActivo();
      if (!ok) { setErrorFocus("No autenticado."); return; }
      setLoadingFocus(true);
      setErrorFocus("");
      try {
        const ref = doc(db, COLEC_ORD, focusOrderId);
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
    if (miUbic && Number.isFinite(miUbic.lat) && Number.isFinite(miUbic.lng)) {
      pts.push([miUbic.lat, miUbic.lng]);
    }
    return pts;
  }, [isFocusMode, focusOrder, hasStateCoords, stateLat, stateLng, mensajeros, ordenes, miUbic]);

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

  // KPIs
  const kpis = useMemo(() => {
    const mens = {
      total: mensajeros.length,
      disponible: mensajeros.filter(m => m.estado === "disponible").length,
      en_ruta: mensajeros.filter(m => m.estado === "en_ruta").length,
      listo_para_ruta: mensajeros.filter(m => m.estado === "listo_para_ruta").length,
      otros: mensajeros.filter(m => !["disponible","en_ruta","listo_para_ruta"].includes(m.estado)).length,
    };
    const dest = {
      total: ordenes.length,
      pendientes: ordenes.filter(o => !o.entregado && !o.recibida).length,
      recibidas: ordenes.filter(o => o.recibida && !o.entregado).length,
      entregadas: ordenes.filter(o => o.entregado).length,
    };
    return { mens, dest };
  }, [mensajeros, ordenes]);

  // ===== CSS inyectado =====
  try {
    if (!document.getElementById("mapaMensajerosCss")) {
      const css = document.createElement("style");
      css.id = "mapaMensajerosCss";
      css.innerHTML = `
        .mm-card{border:1px solid #e5e7eb;border-radius:12px;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.04);padding:10px}
        .mm-kpis{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
        .pill{display:inline-block;padding:6px 10px;border-radius:999px;border:1px solid #e5e7eb;background:#f8fafc;color:#374151;font-size:12px;font-weight:600;line-height:1}
        .pill.blue{background:#eef2ff;border-color:#c7d2fe;color:#3730a3}
        .pill.green{background:#ecfdf5;border-color:#bbf7d0;color:#065f46}
        .pill.gray{background:#f1f5f9;border-color:#e2e8f0;color:#334155}
        .pill.orange{background:#fff7ed;border-color:#fed7aa;color:#9a3412}
        .mm-btn{background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:8px 12px;cursor:pointer;color:#374151}
        .mm-btn:hover{background:#f8fafc}
        .mm-fab{box-shadow:0 1px 4px rgba(0,0,0,.08)}
        .mm-topbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:6px;margin-bottom:10px}
        .mm-yo{display:inline-block;width:18px;height:18px;border-radius:50%;background:#2563eb;border:2px solid #fff;box-shadow:0 0 0 4px rgba(37,99,235,.15)}
      `;
      document.head.appendChild(css);
    }
  } catch {}

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

      {/* KPIs y selector de mapa base */}
      {!isFocusMode && (
        <div className="mm-card">
          <div className="mm-kpis">
            <span className="pill gray">Mensajeros: <b>{kpis.mens.total}</b></span>
            <span className="pill blue">Disponibles: <b>{kpis.mens.disponible}</b></span>
            <span className="pill green">En ruta: <b>{kpis.mens.en_ruta}</b></span>
            <span className="pill gray">Listos: <b>{kpis.mens.listo_para_ruta}</b></span>
            <span className="pill gray">Otros: <b>{kpis.mens.otros}</b></span>
            <span className="pill gray" style={{ marginLeft: 12 }}>Destinos: <b>{kpis.dest.total}</b></span>
            <span className="pill orange">Pendientes: <b>{kpis.dest.pendientes}</b></span>
            <span className="pill blue">Recibidas: <b>{kpis.dest.recibidas}</b></span>
            <span className="pill green">Entregadas: <b>{kpis.dest.entregadas}</b></span>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 12, color: "#334155" }}>Mapa base</label>
              <select
                value={baseMap}
                onChange={(e) => setBaseMap(e.target.value)}
                className="mm-btn"
                style={{ padding: "6px 8px" }}
              >
                <option value="carto">Claro (recomendado)</option>
                <option value="osm">Clásico OSM</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {!isFocusMode && (
        <div className="mm-topbar">
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
          <TileLayer attribution={baseTile.attribution} url={baseTile.url} />

          {/* Mensajeros */}
          {mensajeros.map((m) => {
            const latN = Number(m.lat);
            const lngN = Number(m.lng);
            if (!Number.isFinite(latN) || !Number.isFinite(lngN)) return null;
            const pos = [latN, lngN];
            const fecha = m.lastPingAt ? m.lastPingAt.toLocaleString() : "";

            const auraColor =
              m.estado === "en_ruta" ? "#22c55e" :
              m.estado === "disponible" ? "#3b82f6" :
              m.estado === "listo_para_ruta" ? "#6d28d9" : "#94a3b8";

            return (
              <Fragment key={`rider-wrap-${m.id}`}>
                <CircleMarker
                  center={pos}
                  radius={14}
                  pathOptions={{ color: auraColor, fillColor: auraColor, fillOpacity: 0.12, weight: 1 }}
                />
                <Marker position={pos} icon={iconMensajero}>
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
                      <div><b>Lat/Lng:</b> {latN.toFixed(5)}, {lngN.toFixed(5)}</div>
                      <div><b>Último ping:</b> {fecha || "—"}</div>
                    </div>
                  </Popup>
                </Marker>
              </Fragment>
            );
          })}

          {/* Vista general: destinos */}
          {!isFocusMode &&
            ordenes.map((o) => {
              const { lat, lng } = getCoords(o);
              if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
              const estado = o.entregado ? "ENTREGADA" : o.recibida ? "RECIBIDA" : "PENDIENTE";

              const asignadoUid = o.asignadoUid || null;
              const asignadoNombre = o.asignadoNombre || "—";
              const mensa = asignadoUid ? mensajeros.find(m => String(m.id) === String(asignadoUid)) : null;
              const mensaPos = mensa && Number.isFinite(Number(mensa.lat)) && Number.isFinite(Number(mensa.lng))
                ? [Number(mensa.lat), Number(mensa.lng)]
                : null;

              return (
                <Marker key={`ord-${o.id}`} position={[lat, lng]} icon={iconPorEstado(o)}>
                  <Popup>
                    <div style={{ fontSize: 14, minWidth: 240 }}>
                      <div><b>Cliente:</b> {o.cliente}</div>
                      <div><b>Tel:</b> {o.telefono || "—"}</div>
                      <div><b>Factura:</b> {o.numeroFactura}</div>
                      <div><b>Fecha/Hora:</b> {o.fecha} {o.hora}</div>
                      <div><b>Estado:</b> {estado}</div>

                      <div style={{ marginTop: 6 }}>
                        <b>Mensajero asignado:</b> {asignadoNombre}
                        {asignadoUid && (
                          <span style={{ fontSize: 12, color: "#6b7280" }}> ({String(asignadoUid).slice(0,6)}…)</span>
                        )}{" "}
                        {mensa && <BadgeEstado estado={mensa.estado} />}
                      </div>

                      <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>
                        {o.direccionTexto || o.address?.formatted}
                      </div>
                      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button onClick={() => abrirRutaGoogle(lat, lng, true)} className="mm-btn" style={{ padding: "4px 8px" }}>
                          Ruta desde aquí
                        </button>
                        <button onClick={() => abrirRutaGoogle(lat, lng, false)} className="mm-btn" style={{ padding: "4px 8px" }}>
                          Solo destino
                        </button>
                        {mensaPos && <FlyToBtn to={mensaPos}>Centrar mensajero</FlyToBtn>}
                        <Link className="mm-btn" style={{ padding: "4px 8px" }} to={`/orden/${o.id}`}>
                          Ver orden
                        </Link>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

          {/* Vista enfocada: solo la orden actual */}
          {isFocusMode && puedeMostrarFocus && (
            <>
              <Marker position={[focusCoords.lat, focusCoords.lng]} icon={iconPorEstado(focusOrder)}>
                <Popup>
                  <div style={{ fontSize: 14, minWidth: 240 }}>
                    {state?.cliente || focusOrder?.cliente ? <div><b>Cliente:</b> {state?.cliente || focusOrder?.cliente}</div> : null}
                    {state?.numeroFactura || focusOrder?.numeroFactura ? <div><b>Factura:</b> {state?.numeroFactura || focusOrder?.numeroFactura}</div> : null}

                    {(focusOrder?.asignadoNombre || focusOrder?.asignadoUid) && (
                      <div style={{ marginTop: 6 }}>
                        <b>Mensajero asignado:</b> {focusOrder.asignadoNombre || "—"}
                        {focusOrder.asignadoUid && (
                          <span style={{ fontSize: 12, color: "#6b7280" }}> ({String(focusOrder.asignadoUid).slice(0,6)}…)</span>
                        )}
                        {(() => {
                          const m = focusOrder?.asignadoUid
                            ? mensajeros.find(mm => String(mm.id) === String(focusOrder.asignadoUid))
                            : null;
                          return m ? <span style={{ marginLeft: 6 }}><BadgeEstado estado={m.estado} /></span> : null;
                        })()}
                      </div>
                    )}

                    {state?.direccion || state?.address?.formatted || focusOrder?.direccionTexto || focusOrder?.address?.formatted ? (
                      <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>
                        {state?.direccion || state?.address?.formatted || focusOrder?.direccionTexto || focusOrder?.address?.formatted}
                      </div>
                    ) : null}
                    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        onClick={() => abrirRutaGoogle(focusCoords.lat, focusCoords.lng, true)}
                        className="mm-btn"
                        style={{ padding: "4px 8px" }}
                      >
                        Ruta desde aquí
                      </button>
                      <button
                        onClick={() => abrirRutaGoogle(focusCoords.lat, focusCoords.lng, false)}
                        className="mm-btn"
                        style={{ padding: "4px 8px" }}
                      >
                        Solo destino
                      </button>
                      {(() => {
                        const m = focusOrder?.asignadoUid
                          ? mensajeros.find(mm => String(mm.id) === String(focusOrder.asignadoUid))
                          : null;
                        const p = m && Number.isFinite(Number(m.lat)) && Number.isFinite(Number(m.lng)) ? [Number(m.lat), Number(m.lng)] : null;
                        return p ? <FlyToBtn to={p}>Centrar mensajero</FlyToBtn> : null;
                      })()}
                      {focusOrder?.id && (
                        <Link className="mm-btn" style={{ padding: "4px 8px" }} to={`/orden/${focusOrder.id}`}>
                          Ver orden
                        </Link>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>

              {/* línea mensajero ↔ destino (enfocado) */}
              {(() => {
                const m = focusOrder?.asignadoUid
                  ? mensajeros.find(mm => String(mm.id) === String(focusOrder.asignadoUid))
                  : null;
                const p = m && Number.isFinite(Number(m.lat)) && Number.isFinite(Number(m.lng)) ? [Number(m.lat), Number(m.lng)] : null;
                if (!p) return null;
                return (
                  <Polyline
                    positions={[p, [focusCoords.lat, focusCoords.lng]]}
                    pathOptions={{ color: "#64748b", weight: 3, opacity: 0.7, dashArray: "6 6" }}
                  />
                );
              })()}
            </>
          )}

          {/* Mi ubicación */}
          {miUbic && Number.isFinite(miUbic.lat) && Number.isFinite(miUbic.lng) && (
            <Marker position={[miUbic.lat, miUbic.lng]} icon={iconYo}>
              <Tooltip direction="top" offset={[0, -8]}>Mi ubicación</Tooltip>
            </Marker>
          )}

          <AutoFitBounds bounds={bounds} />
          <FitBoundsBtn bounds={bounds} />
          <MiUbicBtn onFound={setMiUbic} />
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
