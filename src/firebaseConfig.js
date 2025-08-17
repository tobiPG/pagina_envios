// src/firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";

const tidy = v => (typeof v === "string" ? v.trim() : v);

const cfg = {
  apiKey: tidy(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: tidy(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: tidy(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: tidy(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: tidy(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: tidy(import.meta.env.VITE_FIREBASE_APP_ID),
};

// Logs de verificación (seguros)
console.log("[Firebase cfg] PID:", cfg.projectId || "(vacío)");
console.log("[Firebase cfg] API:", cfg.apiKey ? cfg.apiKey.slice(0, 8) + "..." : "(vacía)");

// Validación dura
const missing = Object.entries(cfg).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  throw new Error(
    `Faltan variables Firebase en .env.local: ${missing.join(", ")}.
     Verifica prefijo VITE_ y reinicia Vite (Ctrl+C, npm run dev).`
  );
}
if (!cfg.apiKey.startsWith("AIza")) {
  throw new Error("apiKey no parece válida (debe iniciar con 'AIza'). Revisa .env.local.");
}

const app = initializeApp(cfg);
export const db = getFirestore(app);
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});
