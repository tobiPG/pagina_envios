// src/helpers/subirPOD.js
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage, db } from "../firebaseConfig";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";

/**
 * Sube una imagen de prueba de entrega (POD) a:
 *   empresas/{empresaId}/ordenes/{ordenId}/POD_{timestamp}.ext
 * y guarda en la orden: proofUrl, proofAt, proofType, proofStoragePath, proofByUid, proofByNombre
 *
 * @param {Object} params
 * @param {string} params.ordenId        - ID del documento en /ordenes
 * @param {File|Blob} params.file        - Archivo image/* seleccionado
 * @param {string=} params.empresaId     - Si no lo pasas, lo toma de localStorage.usuarioActivo.empresaId
 * @param {Object=} params.usuarioActivo - Si no lo pasas, lo toma de localStorage.usuarioActivo
 * @param {(p:number)=>void=} params.onProgress - Callback de 0..1 para progreso
 * @returns {Promise<{url:string, path:string, contentType:string}>}
 */
export async function subirPruebaEntrega({
  ordenId,
  file,
  empresaId,
  usuarioActivo,
  onProgress,
}) {
  if (!ordenId) throw new Error("Falta ordenId.");
  if (!file) throw new Error("Selecciona un archivo de imagen.");

  // Lee usuario/empresa si no se pasan explícitos
  let ua = usuarioActivo;
  try {
    if (!ua) ua = JSON.parse(localStorage.getItem("usuarioActivo") || "null");
  } catch {}
  const empresa = empresaId ?? (ua?.empresaId != null ? String(ua.empresaId) : null);
  if (!empresa) throw new Error("Falta empresaId (en params o en usuarioActivo).");

  // Forzar contentType (requisito de reglas)
  const contentType = file.type || "image/jpeg";
  if (!/^image\//i.test(contentType)) {
    throw new Error("El archivo debe ser una imagen (image/*).");
  }

  const ext = (file.name?.split(".").pop() || "jpg").toLowerCase();
  const fileName = `POD_${Date.now()}.${ext}`;
  const path = `empresas/${empresa}/ordenes/${ordenId}/${fileName}`;
  const storageRef = ref(storage, path);

  // Subida con metadata y progreso
  const task = uploadBytesResumable(storageRef, file, { contentType });
  await new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => {
        if (onProgress) {
          const p = snap.totalBytes ? snap.bytesTransferred / snap.totalBytes : 0;
          try { onProgress(p); } catch {}
        }
      },
      reject,
      resolve
    );
  });

  const url = await getDownloadURL(storageRef);

  // Guarda los metadatos de la prueba en la orden
  await updateDoc(doc(db, "ordenes", ordenId), {
    proofUrl: url,
    proofAt: serverTimestamp(),
    proofType: contentType,
    proofStoragePath: path,
    proofByUid: ua?.uid || ua?.id || null,
    proofByNombre: ua?.nombre || ua?.usuario || null,
  });

  return { url, path, contentType };
}
