// src/shared/utils/diffOrden.js
// Compara "antes" vs "después" y devuelve solo lo que cambió.
export function diffOrden(antes = {}, despues = {}) {
  const camposInteres = [
    "cliente", "numeroFactura", "monto",
    "fecha", "hora",
    "mensajero", "vehiculo",
    "estado", "entregado", "recibida",
    "tiempoEstimado", "tiempoReal", "tiempoTotalEntrega",

    // 👇 Para registrar cambios de destino/dirección
    "direccionTexto",
    "destinoLat", "destinoLng",
    "address.formatted", "address.lat", "address.lng",
  ];

  const cambios = [];

  for (const campo of camposInteres) {
    const a = getDeep(antes, campo);
    const b = getDeep(despues, campo);
    if (normalize(a) !== normalize(b)) {
      cambios.push({ campo, antes: a ?? null, despues: b ?? null });
    }
  }
  return cambios;
}

function getDeep(obj, path) {
  return path.split(".").reduce((acc, k) => (acc ? acc[k] : undefined), obj);
}

function normalize(v) {
  if (v === undefined) return null;
  return typeof v === "string" ? v.trim() : v;
}
