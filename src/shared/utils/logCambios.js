// src/shared/utils/logCambios.js
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../services/firebase";
import { diffOrden } from "./diffOrden";

/**
 * Registra cambios de orden en /historialCambios cumpliendo reglas:
 * - Debe incluir empresaId (hasCompanyIdInCreate).
 * - Campo de timestamp: ts (lo espera tu HistorialCambios.jsx).
 */
export async function logCambioOrden({ orderId, empresaId, antes, despues, actor, motivo }) {
  if (!empresaId) throw new Error("logCambioOrden: falta empresaId");

  const cambios = diffOrden(antes, despues) || [];
  if (!cambios.length) return;

  const payload = {
    empresaId,
    orderId,
    cambios, // [{ campo, antes, despues }]
    actorId: actor?.id || actor?.uid || null,
    actorNombre: actor?.nombre || actor?.usuario || "desconocido",
    actorRol: actor?.rol || "desconocido",
    motivo: motivo ?? null,
    ts: serverTimestamp(),            // 👈 usa 'ts' (tu pantalla lo muestra)
    meta: {
      cliente: despues?.cliente ?? antes?.cliente ?? null,
    },
  };

  // 👇 colección alineada con tus reglas y tu pantalla
  await addDoc(collection(db, "historialCambios"), payload);
}
