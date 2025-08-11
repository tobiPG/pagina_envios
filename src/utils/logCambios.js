// src/utils/logCambios.js
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { diffOrden } from "./diffOrden";

// ⚠️ Export NOMBRE EXACTO para que funcione:
// import { logCambioOrden } from "../utils/logCambios";
export async function logCambioOrden({ orderId, antes, despues, actor }) {
  const cambios = diffOrden(antes, despues);
  if (!cambios.length) return; // si no cambió nada, no registramos

  const payload = {
    orderId,
    actorId: actor?.id || actor?.uid || null,
    actorNombre: actor?.nombre || actor?.usuario || "desconocido",
    actorRol: actor?.rol || "desconocido",
    cambios,               // [{ campo, antes, despues }]
    ts: serverTimestamp(), // fecha/hora del servidor
    meta: {
      cliente: despues?.cliente ?? antes?.cliente ?? null,
    },
  };

  await addDoc(collection(db, "historialCambios"), payload);
}
