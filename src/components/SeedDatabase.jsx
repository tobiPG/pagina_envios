// Componente temporal para poblar la base de datos
import { useState } from 'react';
import { db, auth } from '../shared/services/firebase.js';
import { collection, addDoc, doc, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';

export default function SeedDatabase() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const seedData = async () => {
    setLoading(true);
    setMessage('');

    try {
      // 1. Crear planes del catálogo
      const planes = [
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
          limiteOrdenes: -1,
          limiteMensajeros: -1,
          caracteristicas: ["Gestión completa", "API access", "Soporte 24/7", "Multi-stop", "Analytics avanzados"],
          activo: true
        }
      ];

      for (const plan of planes) {
        await addDoc(collection(db, 'planesCatalogo'), plan);
        console.log('Plan creado:', plan.nombre);
      }

      // 2. Crear empresa de prueba
      const empresa = {
        nombre: "Empresa Test",
        direccion: "Calle Principal 123",
        telefono: "+1234567890",
        email: "admin@test.com",
        planActual: "Plan Profesional",
        fechaCreacion: new Date(),
        activa: true
      };

      await setDoc(doc(db, 'empresas', 'empresa-test-001'), empresa);
      console.log('Empresa creada');

      setMessage('✅ Datos básicos creados exitosamente!');

    } catch (error) {
      console.error('Error:', error);
      setMessage(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const createTestUsers = async () => {
    setLoading(true);
    setMessage('');

    try {
      const usuarios = [
        {
          email: "admin@test.com",
          password: "password123",
          userData: {
            nombre: "Admin",
            apellido: "Test",
            email: "admin@test.com",
            rol: "administrador",
            empresaId: "empresa-test-001",
            activo: true,
            fechaCreacion: new Date()
          }
        },
        {
          email: "operador@test.com", 
          password: "password123",
          userData: {
            nombre: "Operador",
            apellido: "Test",
            email: "operador@test.com", 
            rol: "operador",
            empresaId: "empresa-test-001",
            activo: true,
            fechaCreacion: new Date()
          }
        },
        {
          email: "mensajero@test.com",
          password: "password123", 
          userData: {
            nombre: "Mensajero",
            apellido: "Test",
            email: "mensajero@test.com",
            rol: "mensajero", 
            empresaId: "empresa-test-001",
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
          
          // Sign out para evitar problemas
          await signOut(auth);
          
        } catch (error) {
          console.log(`⚠️ Usuario ${usuario.email}: ${error.message}`);
        }
      }

      setMessage('✅ Usuarios de prueba creados exitosamente!\n\nCredenciales:\n• admin@test.com / password123\n• operador@test.com / password123\n• mensajero@test.com / password123');

    } catch (error) {
      console.error('Error:', error);
      setMessage(`❌ Error creando usuarios: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h2>🌱 Poblar Base de Datos</h2>
      <p>Este componente temporal creará los datos básicos necesarios para el funcionamiento de la aplicación.</p>
      
      <div style={{ marginBottom: '20px' }}>
        <h3>Paso 1 - Datos básicos:</h3>
        <ul>
          <li>3 Planes en el catálogo (Básico, Profesional, Empresarial)</li>
          <li>1 Empresa de prueba (empresa-test-001)</li>
        </ul>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button 
          onClick={seedData}
          disabled={loading}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: loading ? '#ccc' : '#3B82F6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? '🔄 Creando...' : '🚀 1. Crear Datos Básicos'}
        </button>

        <button 
          onClick={createTestUsers}
          disabled={loading}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: loading ? '#ccc' : '#059669',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? '🔄 Creando...' : '👥 2. Crear Usuarios'}
        </button>
      </div>

      {message && (
        <div style={{ 
          marginTop: '20px', 
          padding: '12px', 
          backgroundColor: message.includes('✅') ? '#D1FAE5' : '#FEE2E2',
          border: `1px solid ${message.includes('✅') ? '#059669' : '#DC2626'}`,
          borderRadius: '6px',
          color: message.includes('✅') ? '#059669' : '#DC2626',
          whiteSpace: 'pre-line'
        }}>
          {message}
        </div>
      )}

      <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#F3F4F6', borderRadius: '6px' }}>
        <h3>📝 Flujo de prueba:</h3>
        <ol>
          <li><strong>Ejecutar Paso 1:</strong> Crear datos básicos (planes y empresa)</li>
          <li><strong>Ejecutar Paso 2:</strong> Crear usuarios de prueba</li>
          <li><strong>Login como operador:</strong> operador@test.com / password123</li>
          <li><strong>Crear órdenes:</strong> Básicas y multi-stop en "Gestión Órdenes"</li>
          <li><strong>Asignar mensajero:</strong> Usar botón "Asignar" en las órdenes</li>
          <li><strong>Login como mensajero:</strong> mensajero@test.com / password123</li>
          <li><strong>Verificar entregas:</strong> Ver órdenes asignadas en "Entregas"</li>
        </ol>
      </div>
    </div>
  );
}