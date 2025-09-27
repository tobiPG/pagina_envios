// src/firebaseConfig.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { getStorage, connectStorageEmulator } from "firebase/storage";

// Config desde .env.local (Vite)
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

// ⚠️ Debe coincidir con tu backend (functions.region(...))
// Tu index.js usa us-central1, así que lo ponemos como default.
const FUNCTIONS_REGION =
  (import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "us-central1").trim();

// Evita doble inicialización en hot-reload
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Servicios
export const auth = getAuth(app);
export const db = getFirestore(app);

// Usa la MISMA región que el backend
export const functions = getFunctions(app, FUNCTIONS_REGION);

export const storage = getStorage(app);

// (Opcional) Emuladores localmente
const useEmu = import.meta.env.DEV && String(import.meta.env.VITE_USE_FIREBASE_EMULATORS) === "1";
if (useEmu) {
  try {
    connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "localhost", 8080);
    connectFunctionsEmulator(functions, "localhost", 5001);
    connectStorageEmulator(storage, "localhost", 9199);
    console.log("[Firebase] Emuladores conectados (auth:9099, db:8080, funcs:5001, storage:9199).");
  } catch (e) {
    console.warn("[Firebase] No se pudieron conectar emuladores:", e);
  }
}

// Log útil para depurar región
console.log("[Firebase] Functions region:", FUNCTIONS_REGION);

export default app;
