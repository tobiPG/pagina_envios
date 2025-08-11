// src/lib/parseAddress.js
// Extrae lat/lng o texto de enlaces (WhatsApp, Google, Waze) o coords sueltas.
export function parseAddressFromText(input) {
  const text = (input || "").trim();

  // Coords sueltas: "18.4861,-69.9312" o "18.4861  -69.9312"
  const coordMatch = text.match(/(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/);
  if (coordMatch) {
    return {
      type: "coords",
      lat: parseFloat(coordMatch[1]),
      lng: parseFloat(coordMatch[2]),
      formatted: `${coordMatch[1]}, ${coordMatch[2]}`,
      provider: "parsed",
    };
  }

  // Google Maps con @lat,lng (https://www.google.com/maps/@18.48,-69.93,17z)
  const gAt = text.match(/maps\/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/i);
  if (gAt) {
    return {
      type: "coords",
      lat: parseFloat(gAt[1]),
      lng: parseFloat(gAt[2]),
      formatted: `${gAt[1]}, ${gAt[2]}`,
      provider: "parsed",
    };
  }

  // Google Maps con q=...
  const gQ = text.match(/[?&]q=([^&]+)/i);
  if (gQ) {
    const q = decodeURIComponent(gQ[1].replace(/\+/g, " "));
    const c2 = q.match(/(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/);
    if (c2) {
      return {
        type: "coords",
        lat: parseFloat(c2[1]),
        lng: parseFloat(c2[2]),
        formatted: q,
        provider: "parsed",
      };
    }
    return { type: "query", query: q, provider: "parsed" };
  }

  // Waze: https://waze.com/ul?ll=18.48,-69.93&navigate=yes
  const wazeLL = text.match(/[?&]ll=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/i);
  if (wazeLL) {
    return {
      type: "coords",
      lat: parseFloat(wazeLL[1]),
      lng: parseFloat(wazeLL[2]),
      formatted: `${wazeLL[1]}, ${wazeLL[2]}`,
      provider: "parsed",
    };
  }

  // Si nada coincide, tratamos todo como consulta de texto
  return { type: "query", query: text, provider: "parsed" };
}
