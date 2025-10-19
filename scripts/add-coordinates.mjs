// Script para agregar coordenadas a las órdenes existentes
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, query, where } from 'firebase/firestore';

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

// Coordenadas de ejemplo para diferentes ubicaciones
const coordenadasEjemplo = [
  { lat: 10.4806, lng: -66.9036, direccion: "Plaza Venezuela, Caracas" },
  { lat: 10.4880, lng: -66.8792, direccion: "Centro Comercial Sambil, Caracas" },
  { lat: 10.5020, lng: -66.9152, direccion: "Universidad Central de Venezuela, Caracas" }
];

async function addCoordinatesToOrders() {
  try {
    // Obtener órdenes de la empresa-test-001
    const q = query(
      collection(db, "ordenes"),
      where("empresaId", "==", "empresa-test-001")
    );
    
    const querySnapshot = await getDocs(q);
    console.log(`Encontradas ${querySnapshot.docs.length} órdenes`);
    
    let index = 0;
    
    for (const orderDoc of querySnapshot.docs) {
      const orderData = orderDoc.data();
      const coordenadas = coordenadasEjemplo[index % coordenadasEjemplo.length];
      
      const updateData = {
        destinoLat: coordenadas.lat,
        destinoLng: coordenadas.lng,
        direccionTexto: coordenadas.direccion,
        address: {
          lat: coordenadas.lat,
          lng: coordenadas.lng,
          formatted: coordenadas.direccion
        }
      };
      
      await updateDoc(doc(db, "ordenes", orderDoc.id), updateData);
      
      console.log(`✅ Orden ${orderDoc.id} actualizada con coordenadas:`, coordenadas);
      index++;
    }
    
    console.log("🎉 Todas las órdenes actualizadas con coordenadas!");
    
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

addCoordinatesToOrders();