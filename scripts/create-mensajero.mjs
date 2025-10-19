// Script para CORREGIR mensajero existente
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc, getDoc } from 'firebase/firestore';

// Configuración de Firebase  
const firebaseConfig = {
  apiKey: "AIzaSyAqZJr44ZIrk1m7BtJU4LjJe2lNJd6Hk9s",
  authDomain: "envios-realtime.firebaseapp.com",
  projectId: "envios-realtime", 
  storageBucket: "envios-realtime.firebasestorage.app",
  messagingSenderId: "751500243869",
  appId: "1:751500243869:web:d0767ad15e7370986c7f31"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function fixMensajero() {
  try {
    const mensajeroUID = "XMNgglAfi7NSuDRSpJy3JcsFpGJ3";
    
    // Verificar datos actuales
    const docRef = doc(db, "usuarios", mensajeroUID);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      console.log("📋 Datos actuales:", docSnap.data());
    }
    
    // Corregir los datos
    const correctData = {
      rol: "mensajero",  // ❗ Cambiar de 'administrador' a 'mensajero'
      empresaId: "empresa-test-001",  // ❗ Cambiar de 'gomez' a 'empresa-test-001'
      nombre: "Mensajero Test",
      email: "mensajero@test.com",
      activo: true,
      updatedAt: new Date()
    };

    console.log("🔧 Corrigiendo con datos:", correctData);
    
    await updateDoc(docRef, correctData);
    
    console.log("✅ Mensajero corregido exitosamente!");
    
    // Verificar resultado
    const updatedSnap = await getDoc(docRef);
    if (updatedSnap.exists()) {
      console.log("📋 Datos corregidos:", updatedSnap.data());
    }
    
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

fixMensajero();