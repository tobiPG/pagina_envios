import { useState } from "react";
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

  async function handleGeocode() {
    if (!text.trim()) return;
    const hit = await geocodeText(text.trim());
    if (hit) onChange(hit);
  }

  async function handleMapPick(lat, lng) {
    setMapLatLng({ lat, lng });
    const rev = await reverseGeocode(lat, lng);
    if (rev) onChange(rev);
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
          <div><b>Dirección:</b> {value.formatted}</div>
          <div><b>Coords:</b> {value.lat?.toFixed(6)}, {value.lng?.toFixed(6)}</div>
          <div><b>Proveedor:</b> {value.provider} / <b>Origen:</b> {value.source}</div>
        </div>
      )}
    </div>
  );
}

export default AddressInput;
