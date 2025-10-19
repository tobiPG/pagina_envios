import { useState, useEffect } from "react";
import { parseAddressFromText } from "../lib/parseAddress";
import { geocodeText, reverseGeocode } from "../lib/geoProvider/nominatim";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

const icon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconSize: [25, 41], iconAnchor: [12, 41],
});

function ClickPicker({ onPick }) {
  useMapEvents({
    click(e) { onPick(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

function AddressInput({ value, onChange }) {
  const [tab, setTab] = useState("TEXT"); // TEXT | MAP | IMPORT
  const [text, setText] = useState("");
  const [mapLatLng, setMapLatLng] = useState(null);
  const [importStr, setImportStr] = useState("");

  // Sincronizar estado interno con valor externo
  useEffect(() => {
    if (value) {
      if (value.texto || value.formatted) {
        setText(value.texto || value.formatted || "");
      }
      if (value.lat && value.lng) {
        setMapLatLng({
          lat: parseFloat(value.lat),
          lng: parseFloat(value.lng)
        });
      }
    }
  }, [value]);

  async function handleGeocode() {
    if (!text.trim()) return;
    try {
      const hit = await geocodeText(text.trim());
      console.log("🔍 DEBUG - Geocode result:", hit);
      if (hit && hit.display_name) {
        // Normalizar la respuesta del servicio
        const normalizedData = {
          lat: hit.lat,
          lng: hit.lng,
          texto: hit.display_name,
          formatted: hit.display_name,
          provider: "nominatim",
          source: "TEXT_INPUT"
        };
        console.log("✅ DEBUG - Sending normalized geocode result:", normalizedData);
        onChange(normalizedData);
      } else {
        // Si no se puede geocodificar, al menos guardar el texto
        const fallbackData = {
          texto: text.trim(),
          formatted: text.trim(),
          lat: "",
          lng: "",
          provider: "manual",
          source: "TEXT_INPUT"
        };
        console.log("📝 DEBUG - Sending text fallback:", fallbackData);
        onChange(fallbackData);
      }
    } catch (error) {
      console.error("❌ DEBUG - Error in geocoding:", error);
      // En caso de error, guardar al menos el texto
      const errorFallbackData = {
        texto: text.trim(),
        formatted: text.trim(),
        lat: "",
        lng: "",
        provider: "manual",
        source: "TEXT_INPUT"
      };
      console.log("🔧 DEBUG - Sending text error fallback:", errorFallbackData);
      onChange(errorFallbackData);
    }
  }

  async function handleMapPick(lat, lng) {
    console.log("🗺️ DEBUG - Map clicked:", { lat, lng });
    setMapLatLng({ lat, lng });
    try {
      const rev = await reverseGeocode(lat, lng);
      console.log("🌍 DEBUG - Reverse geocode result:", rev);
      if (rev && rev.display_name) {
        // Normalizar la respuesta del servicio
        const normalizedData = {
          lat: lat,
          lng: lng,
          texto: rev.display_name,
          formatted: rev.display_name,
          provider: "nominatim",
          source: "MAP_CLICK"
        };
        console.log("✅ DEBUG - Sending normalized reverse geocode result:", normalizedData);
        onChange(normalizedData);
      } else {
        // Si el reverse geocoding falla, al menos enviar las coordenadas
        const fallbackData = {
          lat: lat,
          lng: lng,
          texto: `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`,
          formatted: `Coordenadas: ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          provider: "manual",
          source: "MAP_CLICK"
        };
        console.log("📍 DEBUG - Sending fallback data:", fallbackData);
        onChange(fallbackData);
      }
    } catch (error) {
      console.error("❌ DEBUG - Error in reverse geocoding:", error);
      // En caso de error, enviar al menos las coordenadas
      const errorFallbackData = {
        lat: lat,
        lng: lng,
        texto: `Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}`,
        formatted: `Coordenadas: ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
        provider: "manual",
        source: "MAP_CLICK"
      };
      console.log("🔧 DEBUG - Sending error fallback data:", errorFallbackData);
      onChange(errorFallbackData);
    }
  }

  async function handleImport() {
    const parsed = parseAddressFromText(importStr);
    if (!parsed) return;
    if (parsed.type === "coords") {
      const rev = await reverseGeocode(parsed.lat, parsed.lng);
      if (rev) onChange({ ...rev, source: "LINK_IMPORT", source_text: importStr });
    } else if (parsed.type === "query") {
      const hit = await geocodeText(parsed.query);
      if (hit) onChange({ ...hit, source: "LINK_IMPORT", source_text: importStr });
    }
  }

  return (
    <div className="address-input" style={{ display:"grid", gap:8 }}>
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={() => setTab("TEXT")} disabled={tab==="TEXT"}>Escribir</button>
        <button onClick={() => setTab("MAP")} disabled={tab==="MAP"}>Mapa</button>
        <button onClick={() => setTab("IMPORT")} disabled={tab==="IMPORT"}>Importar</button>
      </div>

      {tab === "TEXT" && (
        <div style={{ display:"flex", gap:8 }}>
          <input
            placeholder="C/ Dirección, ciudad, país"
            value={text}
            onChange={e=>setText(e.target.value)}
            style={{ flex:1 }}
          />
          <button onClick={handleGeocode}>Geocodificar</button>
        </div>
      )}

      {tab === "MAP" && (
        <div>
          <MapContainer center={[18.4861, -69.9312]} zoom={12} style={{ height: 300 }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
            <ClickPicker onPick={handleMapPick}/>
            {mapLatLng && <Marker position={[mapLatLng.lat, mapLatLng.lng]} icon={icon} />}
          </MapContainer>
          <small>Haz clic en el mapa para fijar la ubicación.</small>
          {mapLatLng && (
            <div style={{ 
              marginTop: 8, 
              padding: 8, 
              background: "#e8f5e8", 
              border: "1px solid #4caf50", 
              borderRadius: 4,
              fontSize: "12px"
            }}>
              ✅ Ubicación seleccionada: {mapLatLng.lat.toFixed(6)}, {mapLatLng.lng.toFixed(6)}
            </div>
          )}
        </div>
      )}

      {tab === "IMPORT" && (
        <div style={{ display:"flex", gap:8 }}>
          <input
            placeholder="Pega aquí un enlace o texto (WhatsApp / Google / Waze / coords)"
            value={importStr}
            onChange={e=>setImportStr(e.target.value)}
            style={{ flex:1 }}
          />
          <button onClick={handleImport}>Procesar</button>
        </div>
      )}

      {value && (
        <div style={{ marginTop:8, padding:8, border:"1px solid #ddd", borderRadius:6 }}>
          <div><b>Dirección:</b> {value.formatted || value.texto || ''}</div>
          <div><b>Coords:</b> {
            value.lat && value.lng 
              ? `${parseFloat(value.lat).toFixed(6)}, ${parseFloat(value.lng).toFixed(6)}`
              : 'No disponibles'
          }</div>
          <div><b>Proveedor:</b> {value.provider || 'N/A'} / <b>Origen:</b> {value.source || 'N/A'}</div>
        </div>
      )}
    </div>
  );
}

export default AddressInput;
