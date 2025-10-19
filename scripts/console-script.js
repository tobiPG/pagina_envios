// create-test-data.js - Script simple para crear datos de prueba
// Ejecutar desde la consola del navegador en la página de tu aplicación

// 1. Crear planes
const planes = [
  {
    nombre: "Plan Básico",
    descripcion: "Plan básico para pequeñas empresas",
    precio: 29.99,
    limiteOrdenes: 100,
    limiteMensajeros: 5,
    activo: true
  },
  {
    nombre: "Plan Profesional",
    descripcion: "Plan profesional para empresas medianas", 
    precio: 59.99,
    limiteOrdenes: 500,
    limiteMensajeros: 20,
    activo: true
  }
];

// 2. Crear empresa
const empresa = {
  nombre: "Empresa Test",
  email: "admin@test.com",
  planActual: "Plan Profesional",
  activa: true,
  fechaCreacion: new Date()
};

// Ejecutar en la consola del navegador:
console.log('Copia este código y ejecútalo en la consola del navegador:');
console.log(`
// Importar Firebase (ya está disponible en tu app)
import { db } from './src/shared/services/firebase.js';
import { collection, addDoc, doc, setDoc } from 'firebase/firestore';

// Crear planes
const planes = ${JSON.stringify(planes, null, 2)};

for (const plan of planes) {
  await addDoc(collection(db, 'planesCatalogo'), plan);
  console.log('Plan creado:', plan.nombre);
}

// Crear empresa
await setDoc(doc(db, 'empresas', 'empresa-test-001'), ${JSON.stringify(empresa, null, 2)});
console.log('Empresa creada');

console.log('¡Datos básicos creados! Ahora puedes registrar usuarios normalmente.');
`);