// firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyDv4uaabwiRjMwO8nx5qqGoa2UgqWk0k2s",
  authDomain: "envios-realtime.firebaseapp.com",
  projectId: "envios-realtime",
  storageBucket: "envios-realtime.firebasestorage.app",
  messagingSenderId: "18006271860",
  appId: "1:18006271860:web:c404936210a95f2c436e21",
  measurementId: "G-9K0DM6MGQP"
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Inicializa Firestore
const db = getFirestore(app);

// Exporta para que otros archivos puedan usarlo
export { app, db };
