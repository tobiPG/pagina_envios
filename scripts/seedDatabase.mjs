// seedDatabase.mjs - Script para poblar la base de datos
import admin from 'firebase-admin';

// Configurar Firebase Admin usando las credenciales del proyecto
const serviceAccount = {
  "type": "service_account",
  "project_id": "envios-realtime",
  "private_key_id": "YOUR_PRIVATE_KEY_ID",
  "private_key": "YOUR_PRIVATE_KEY",
  "client_email": "YOUR_CLIENT_EMAIL",
  "client_id": "YOUR_CLIENT_ID",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs"
};

// En lugar de usar credenciales, usaremos la configuración local de Firebase CLI
admin.initializeApp({
  projectId: 'envios-realtime'
});

const db = admin.firestore();

async function seedDatabase() {
  try {
    console.log('🌱 Iniciando poblado de base de datos...');

    // 1. Crear planes del catálogo
    console.log('📋 Creando planes del catálogo...');
    
    await db.collection('planesCatalogo').doc('plan-basico').set({
      nombre: "Plan Básico",
      descripcion: "Plan básico para pequeñas empresas",
      precio: 29.99,
      limiteOrdenes: 100,
      limiteMensajeros: 5,
      caracteristicas: ["Gestión básica de órdenes", "Tracking básico", "Soporte por email"],
      activo: true
    });

    await db.collection('planesCatalogo').doc('plan-profesional').set({
      nombre: "Plan Profesional",
      descripcion: "Plan profesional para empresas medianas", 
      precio: 59.99,
      limiteOrdenes: 500,
      limiteMensajeros: 20,
      caracteristicas: ["Gestión avanzada de órdenes", "Tracking en tiempo real", "Soporte prioritario", "Multi-stop"],
      activo: true
    });

    await db.collection('planesCatalogo').doc('plan-empresarial').set({
      nombre: "Plan Empresarial",
      descripcion: "Plan empresarial para grandes organizaciones",
      precio: 99.99,
      limiteOrdenes: -1,
      limiteMensajeros: -1, 
      caracteristicas: ["Gestión completa", "API access", "Soporte 24/7", "Multi-stop", "Analytics avanzados"],
      activo: true
    });

    console.log('✅ Planes del catálogo creados');

    // 2. Crear empresa de prueba
    console.log('🏢 Creando empresa de prueba...');
    const empresaId = 'empresa-test-001';
    await db.collection('empresas').doc(empresaId).set({
      nombre: "Empresa Test",
      direccion: "Calle Principal 123",
      telefono: "+1234567890", 
      email: "admin@test.com",
      planActual: "Plan Profesional",
      fechaCreacion: admin.firestore.FieldValue.serverTimestamp(),
      activa: true
    });

    console.log('✅ Empresa creada');

    // 3. Crear usuarios de prueba (solo documentos, no auth)
    console.log('👥 Creando documentos de usuarios...');

    // Admin user
    await db.collection('usuarios').doc('admin-uid-001').set({
      nombre: "Admin",
      apellido: "Test",
      email: "admin@test.com",
      rol: "administrador",
      empresaId: empresaId,
      activo: true,
      fechaCreacion: admin.firestore.FieldValue.serverTimestamp()
    });

    // Operator user  
    await db.collection('usuarios').doc('operator-uid-001').set({
      nombre: "Operador", 
      apellido: "Test",
      email: "operador@test.com",
      rol: "operador",
      empresaId: empresaId,
      activo: true,
      fechaCreacion: admin.firestore.FieldValue.serverTimestamp()
    });

    // Messenger user
    await db.collection('usuarios').doc('messenger-uid-001').set({
      nombre: "Mensajero",
      apellido: "Test", 
      email: "mensajero@test.com",
      rol: "mensajero",
      empresaId: empresaId,
      activo: true,
      fechaCreacion: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('✅ Documentos de usuarios creados');

    console.log('🎉 ¡Base de datos poblada exitosamente!');
    console.log('');
    console.log('🔧 Próximos pasos:');
    console.log('1. Crear usuarios en Firebase Auth con estos emails');
    console.log('2. admin@test.com / operador@test.com / mensajero@test.com');
    console.log('3. Restaurar las reglas de seguridad normales');
    
    process.exit(0);

  } catch (error) {
    console.error('❌ Error poblando la base de datos:', error);
    process.exit(1);
  }
}

seedDatabase();