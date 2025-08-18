// src/pantallas/SeleccionarDestino.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { db } from "../firebaseConfig";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";

import AddressInput from "../components/AddressInput.jsx";
import { ensureUsuarioActivo } from "../utils/ensureUsuario";
import { logCambioOrden } from "../utils/logCambios"; // 👈 NUEVO

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

const iconDestino = L.divIcon({
  className: "destino-icon",
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#2e7d32;border:2px solid #fff;box-shadow:0 0 2px rgba(0,0,0,.4)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function normNum(v) {
  if (typeof v === "number") return v;
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function FitToPoint({ center }) {
  const map = useMap();
  useEffect(() => {
    if (!center) return;
    const { lat, lng } = center;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.setView([lat, lng], 16);
    }
  }, [center, map]);
  return null;
}

function getActor() {
  let u = null; try { u = JSON.parse(localStorage.getItem("usuarioActivo") || "null"); } catch {}
  return {
    id: u?.id || u?.uid || null,
    nombre: u?.nombre || u?.usuario || "desconocido",
    rol: (u?.rol || "desconocido").toLowerCase(),
    empresaId: u?.empresaId != null ? String(u.empresaId) : null,
  };
}

export default function SeleccionarDestino() {
  const { id } = useParams(); // id de la orden
  const navigate = useNavigate();
  const { state } = useLocation() || {};

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [orden, setOrden] = useState(null);

  // Dirección editable (AddressInput)
  const [address, setAddress] = useState(null);

  const defaultCenter = useMemo(() => [18.4861, -69.9312], []);

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      setErr("");

      const ok = await ensureUsuarioActivo();
      if (!ok) {
        setErr("No hay sesión válida. Inicia sesión de nuevo.");
        setLoading(false);
        return;
      }

      try {
        const sLat = normNum(state?.lat);
        const sLng = normNum(state?.lng);

        const ref = doc(db, "ordenes", id);
        const snap = await getDoc(ref);
        if (!active) return;

        if (!snap.exists()) {
          setErr("No encontré la orden.");
          setLoading(false);
          return;
        }

        const o = snap.data() || {};
        setOrden({ id, ...o });

        const lat = normNum(o?.destinoLat ?? o?.address?.lat ?? sLat);
        const lng = normNum(o?.destinoLng ?? o?.address?.lng ?? sLng);
        const formatted =
          o?.direccionTexto ||
          o?.address?.formatted ||
          state?.direccion ||
          state?.address?.formatted ||
          "";

        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          setAddress({ lat, lng, formatted });
        } else {
          setAddress(null);
        }

        setLoading(false);
      } catch (e) {
        console.error("SeleccionarDestino load:", e);
        setErr("Error cargando la orden.");
        setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [id, state]);

  async function guardar() {
    if (!orden) return;
    if (!address || !Number.isFinite(Number(address.lat)) || !Number.isFinite(Number(address.lng))) {
      alert("Selecciona una ubicación válida (lat/lng).");
      return;
    }

    try {
      await ensureUsuarioActivo();

      // ⚠️ No tocar empresaId ni createdAt para no chocar con reglas
      const patch = {
        address: {
          ...(address || {}),
          lat: Number(address.lat),
          lng: Number(address.lng),
        },
        destinoLat: Number(address.lat),
        destinoLng: Number(address.lng),
        direccionTexto: address?.formatted || orden?.direccionTexto || null,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "ordenes", orden.id), patch);

      // 👇 Registrar cambio en historial (compatible con reglas)
      try {
        const actor = getActor();
        const empresaIdStr = String(orden?.empresaId ?? actor?.empresaId ?? "");
        const despues = { ...orden, ...patch };
        await logCambioOrden({
          orderId: orden.id,
          empresaId: empresaIdStr,
          antes: orden,
          despues,
          actor,
          motivo: "Actualizar destino",
          extraMeta: { direccion: patch.direccionTexto || "" },
        });
      } catch (e) {
        console.warn("No pude escribir en historialCambios (continuo):", e?.message);
      }

      alert("Destino guardado ✅");
      // Navega al mapa enfocado de esa orden
      navigate(`/mapa/${orden.id}`, {
        state: {
          ordenId: orden.id,
          lat: Number(address.lat),
          lng: Number(address.lng),
          direccion: address?.formatted || "",
          cliente: orden?.cliente || "",
          numeroFactura: orden?.numeroFactura || "",
          address,
        },
      });
    } catch (e) {
      console.error("Guardar destino:", e);
      alert("No pude guardar el destino. Revisa conexión/reglas.");
    }
  }

  const center = Number.isFinite(Number(address?.lat)) && Number.isFinite(Number(address?.lng))
    ? [Number(address.lat), Number(address.lng)]
    : defaultCenter;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>📍 Seleccionar/Confirmar destino</h2>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={() => navigate(-1)}>&larr; Volver</button>
          <button onClick={guardar} disabled={loading}>Guardar destino</button>
        </div>
      </div>

      {loading && <div>Cargando…</div>}
      {!!err && <div style={{ color: "#b00" }}>{err}</div>}

      {orden && (
        <div style={{ marginBottom: 10, fontSize: 14, color: "#333" }}>
          <div><b>Cliente:</b> {orden.cliente || "—"}</div>
          <div><b>Factura:</b> {orden.numeroFactura || "—"}</div>
          <div><b>Fecha/Hora:</b> {orden.fecha || "—"} {orden.hora || ""}</div>
        </div>
      )}

      <div style={{ marginBottom: 10 }}>
        <label style={{ display: "block", marginBottom: 6 }}>
          <b>Dirección</b>
        </label>
        <AddressInput value={address} onChange={setAddress} />
      </div>

      <div style={{ height: 520 }}>
        <MapContainer center={center} zoom={15} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {Number.isFinite(Number(address?.lat)) && Number.isFinite(Number(address?.lng)) && (
            <Marker position={[Number(address.lat), Number(address.lng)]} icon={iconDestino}>
              <Popup>Destino seleccionado</Popup>
            </Marker>
          )}
          <FitToPoint center={
            Number.isFinite(Number(address?.lat)) && Number.isFinite(Number(address?.lng))
              ? { lat: Number(address.lat), lng: Number(address.lng) }
              : null
          } />
        </MapContainer>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
        * No modificamos <code>empresaId</code> ni <code>createdAt</code> para cumplir tus reglas.
      </div>
    </div>
  );
}
