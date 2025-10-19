// Script to seed the database with initial data
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, doc, setDoc } from 'firebase/firestore';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';

// Firebase config - reemplaza con tu configuración real
const firebaseConfig = {
  apiKey: "AIzaSyBpVImRFdUdJ4_sePCZmJXHhDfWs0tCZHU",
  authDomain: "envios-realtime.firebaseapp.com", 
  projectId: "envios-realtime",
  storageBucket: "envios-realtime.firebasestorage.app",
  messagingSenderId: "563584335869",
  appId: "1:563584335869:web:fgrhgmd47bqnekij5i8b5p"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function seedDatabase() {
  try {
    console.log('🌱 Iniciando poblado de base de datos...');

    // 1. Crear planes del catálogo
    console.log('📋 Creando planes del catálogo...');
    const planesCatalogo = [
      {
        nombre: "Plan Básico",
        descripcion: "Plan básico para pequeñas empresas",
        precio: 29.99,
        limiteOrdenes: 100,
        limiteMensajeros: 5,
        caracteristicas: ["Gestión básica de órdenes", "Tracking básico", "Soporte por email"],
        activo: true
      },
      {
        nombre: "Plan Profesional", 
        descripcion: "Plan profesional para empresas medianas",
        precio: 59.99,
        limiteOrdenes: 500,
        limiteMensajeros: 20,
        caracteristicas: ["Gestión avanzada de órdenes", "Tracking en tiempo real", "Soporte prioritario", "Multi-stop"],
        activo: true
      },
      {
        nombre: "Plan Empresarial",
        descripcion: "Plan empresarial para grandes organizaciones", 
        precio: 99.99,
        limiteOrdenes: -1, // Ilimitado
        limiteMensajeros: -1, // Ilimitado
        caracteristicas: ["Gestión completa", "API access", "Soporte 24/7", "Multi-stop", "Analytics avanzados"],
        activo: true
      }
    ];

    for (const plan of planesCatalogo) {
      await addDoc(collection(db, 'planesCatalogo'), plan);
      console.log(`✅ Plan creado: ${plan.nombre}`);
    }

    // 2. Crear empresa de prueba
    console.log('🏢 Creando empresa de prueba...');
    const empresaId = 'empresa-prueba-001';
    const empresaData = {
      nombre: "Empresa Prueba",
      direccion: "Calle Principal 123",
      telefono: "+1234567890",
      email: "admin@empresaprueba.com",
      planActual: "Plan Profesional",
      fechaCreacion: new Date(),
      activa: true
    };

    await setDoc(doc(db, 'empresas', empresaId), empresaData);
    console.log('✅ Empresa creada: Empresa Prueba');

    // 3. Crear usuarios de prueba
    console.log('👥 Creando usuarios de prueba...');
    
    const usuarios = [
      {
        email: "admin@test.com",
        password: "admin123",
        userData: {
          nombre: "Administrador",
          apellido: "Prueba", 
          email: "admin@test.com",
          rol: "administrador",
          empresaId: empresaId,
          activo: true,
          fechaCreacion: new Date()
        }
      },
      {
        email: "operador@test.com", 
        password: "operador123",
        userData: {
          nombre: "Operador",
          apellido: "Prueba",
          email: "operador@test.com", 
          rol: "operador",
          empresaId: empresaId,
          activo: true,
          fechaCreacion: new Date()
        }
      },
      {
        email: "mensajero@test.com",
        password: "mensajero123", 
        userData: {
          nombre: "Mensajero",
          apellido: "Prueba",
          email: "mensajero@test.com",
          rol: "mensajero", 
          empresaId: empresaId,
          activo: true,
          fechaCreacion: new Date()
        }
      }
    ];

    for (const usuario of usuarios) {
      try {
        // Crear usuario en Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, usuario.email, usuario.password);
        const uid = userCredential.user.uid;
        
        // Crear documento de usuario en Firestore
        await setDoc(doc(db, 'usuarios', uid), usuario.userData);
        
        console.log(`✅ Usuario creado: ${usuario.userData.nombre} (${usuario.userData.rol})`);
      } catch (error) {
        console.log(`⚠️ Usuario ${usuario.email} ya existe o error: ${error.message}`);
      }
    }

    console.log('🎉 ¡Base de datos poblada exitosamente!');
    console.log('');
    console.log('📧 Credenciales de acceso:');
    console.log('Admin: admin@test.com / admin123');
    console.log('Operador: operador@test.com / operador123'); 
    console.log('Mensajero: mensajero@test.com / mensajero123');
    
  } catch (error) {
    console.error('❌ Error poblando la base de datos:', error);
  }
}

seedDatabase();