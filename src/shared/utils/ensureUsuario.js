// src/shared/utils/ensureUsuario.js
import { auth } from "../services/firebase.js";
import { db } from "../services/firebase.js";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";

/**
 * Asegura /usuarios/{uid} con empresaId (string) y guarda usuarioActivo en localStorage.
 * Retorna true si todo OK, false si falta uid o empresaId.
 */
export async function ensureUsuarioActivo() {
  // 1) UID desde Auth
  const u = auth.currentUser || null;
  const uidFromAuth = u?.uid || null;

  // 2) Respaldo desde localStorage
  let ls = null;
  try { ls = JSON.parse(localStorage.getItem("usuarioActivo") || "null"); } catch { ls = null; }

  const uidFromLS = ls?.uid || ls?.id || null;
  const empresaRaw = ls?.empresaId ?? null;

  // 3) Resolver uid definitivo y normalizar empresaId a string
  const uid = uidFromAuth || uidFromLS || null;
  const empresaId = empresaRaw != null ? String(empresaRaw) : null;

  if (!uid || !empresaId) {
    console.warn("ensureUsuarioActivo: falta uid o empresaId", { uid, empresaId });
    return false;
  }

  // 4) Asegurar /usuarios/{uid}
  const ref = doc(db, "usuarios", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      uid,
      empresaId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } else {
    const data = snap.data() || {};
    if (!data.empresaId || String(data.empresaId) !== empresaId) {
      await updateDoc(ref, {
        empresaId,
        updatedAt: serverTimestamp(),
      });
    }
  }

  // 5) Regrabar localStorage con uid asegurado
  const nuevo = { ...(ls || {}), uid, empresaId };
  localStorage.setItem("usuarioActivo", JSON.stringify(nuevo));
  return true;
}
