// src/components/PingUbicacion.jsx
import { useEffect, useRef, useState } from "react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebaseConfig";

export default function PingUbicacion() {
  const [status, setStatus] = useState("inactivo");
  const [coords, setCoords] = useState({ lat: null, lng: null });
  const [err, setErr] = useState("");

  const watcherIdRef = useRef(null);
  const lastWriteRef = useRef(0);

  // Datos del usuario actual
  let u = null;
  try {
    u = JSON.parse(localStorage.getItem("usuarioActivo") || "null");
  } catch {}
  const empresaId = u?.empresaId != null ? String(u.empresaId) : null;
  const mensajeroId =
    u?.id || u?.uid || u?.userId || u?.usuarioId || u?.usuario || "mensajero-desconocido";
  const nombre = u?.nombre || u?.usuario || "Mensajero";

  async function escribir(lat, lng) {
    if (!empresaId) return; // requerido por reglas
    try {
      await setDoc(
        doc(db, "ubicacionesMensajeros", mensajeroId),
        {
          empresaId,             // 👈 requerido por create en reglas
          nombre,                // útil para mostrar en mapa
          lat: Number(lat),
          lng: Number(lng),
          lastPingAt: serverTimestamp(),
          // NO tocamos 'estado' para no violar reglas de update
        },
        { merge: true }
      );
    } catch (e) {
      setErr(e?.message || "No pude escribir ubicación");
    }
  }

  function onPos(pos) {
    const lat = Number(pos.coords.latitude);
    const lng = Number(pos.coords.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    setCoords({ lat, lng });
    setStatus("activo");
    setErr("");

    // Throttle: máx 1 write cada 15s
    const now = Date.now();
    if (now - lastWriteRef.current < 15000) return;
    lastWriteRef.current = now;
    escribir(lat, lng);
  }

  function onErr(e) {
    setStatus("denegado");
    setErr(e?.message || "Permiso de ubicación denegado");
  }

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setStatus("no_soportado");
      setErr("Este dispositivo/navegador no soporta geolocalización.");
      return;
    }
    setStatus("pidiendo_permiso");
    watcherIdRef.current = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 10000,
    });

    return () => {
      if (watcherIdRef.current != null) {
        navigator.geolocation.clearWatch(watcherIdRef.current);
        watcherIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pingManual() {
    if (!("geolocation" in navigator)) return;
    setStatus("ping_manual");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onPos(pos); // onPos ya hace el write (con throttle)
        setStatus("activo");
      },
      onErr,
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  return (
    <div style={{ fontSize: 12, color: "#333", display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span>
        📍 {status}
        {Number.isFinite(coords.lat) && Number.isFinite(coords.lng)
          ? ` (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`
          : ""}
      </span>
      <button onClick={pingManual} style={{ padding: "2px 8px" }}>Ping ahora</button>
      {err && <span style={{ color: "#b00" }}>· {err}</span>}
    </div>
  );
}
