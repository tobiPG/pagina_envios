// src/utils/operadorActual.js
export function operadorActual() {
  let u = null;
  try { u = JSON.parse(localStorage.getItem("usuarioActivo") || "null"); } catch {}
  return {
    uid: u?.uid || null,
    nombre: u?.nombre || u?.usuario || "operador",
    rol: (u?.rol || "operador").toLowerCase(),
    email: u?.email || null,
    empresaId: u?.empresaId != null ? String(u.empresaId) : null,
  };
}
