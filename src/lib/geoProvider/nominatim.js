const NOM_BASE = "https://nominatim.openstreetmap.org";
const HEADERS = { "Accept-Language": "es", "User-Agent": "proyecto-envios/1.0 (demo)" };

export async function geocodeText(text) {
  const url = new URL(`${NOM_BASE}/search`);
  url.searchParams.set("q", text);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "1");
  const res = await fetch(url, { headers: HEADERS });
  const json = await res.json();
  if (!json?.length) return null;
  const p = json[0];
  return normalize(p, "nominatim");
}

export async function reverseGeocode(lat, lng) {
  const url = new URL(`${NOM_BASE}/reverse`);
  url.searchParams.set("lat", lat);
  url.searchParams.set("lon", lng);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  const res = await fetch(url, { headers: HEADERS });
  const p = await res.json();
  if (!p) return null;
  return normalize(p, "nominatim", true);
}

function normalize(p, provider, isReverse = false) {
  const lat = parseFloat(p.lat || p?.lat);
  const lng = parseFloat(p.lon || p?.lon);
  const formatted = p.display_name || p?.address?.road || "Dirección sin nombre";
  const place_id = String(p.place_id || "");
  return {
    source: isReverse ? "MAP_PICK" : "TEXT",
    provider,
    formatted,
    lat, lng,
    place_id,
    accuracy: "APPROXIMATE",
    raw: p,
    createdAt: Date.now(),
  };
}
