// src/utils/logCambios.js
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { diffOrden } from "./diffOrden";

/**
 * Registra cambios de orden en /cambiosOrden cumpliendo reglas:
 * - Debe incluir empresaId (hasCompanyIdInCreate).
 * - Colección correcta: cambiosOrden.
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
    createdAt: serverTimestamp(),
    meta: {
      cliente: despues?.cliente ?? antes?.cliente ?? null,
    },
  };

  await addDoc(collection(db, "cambiosOrden"), payload);
}
