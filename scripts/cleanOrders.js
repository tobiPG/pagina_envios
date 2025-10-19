// Script to clean all orders from Firestore
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';

// Firebase config (using the same config from your project)
const firebaseConfig = {
  apiKey: "AIzaSyBpVImRFdUdJ4_sePCZmJXHhDfWs0tCZHU",
  authDomain: "envios-realtime.firebaseapp.com",
  projectId: "envios-realtime",
  storageBucket: "envios-realtime.firebasestorage.app",
  messagingSenderId: "563584335869",
  appId: "1:563584335869:web:fgrhgmd47bqnekij5i8b5p"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function cleanAllOrders() {
  try {
    console.log('🧹 Iniciando limpieza de órdenes...');
    
    // Get all orders
    const ordersSnapshot = await getDocs(collection(db, 'ordenes'));
    console.log(`📊 Encontradas ${ordersSnapshot.size} órdenes para eliminar`);
    
    // Delete each order
    const deletePromises = ordersSnapshot.docs.map(orderDoc => {
      console.log(`🗑️ Eliminando orden: ${orderDoc.id}`);
      return deleteDoc(doc(db, 'ordenes', orderDoc.id));
    });
    
    await Promise.all(deletePromises);
    
    console.log('✅ ¡Limpieza completada! Todas las órdenes han sido eliminadas.');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error durante la limpieza:', error);
    process.exit(1);
  }
}

cleanAllOrders();