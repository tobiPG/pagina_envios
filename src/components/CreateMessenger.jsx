// Componente temporal para crear mensajero
import { useState } from "react";
import { db } from "../shared/services/firebase.js";
import { doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc } from "firebase/firestore";

export default function CreateMessenger() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  const createMensajero = async () => {
    setLoading(true);
    try {
      const mensajeroUID = "XMNgglAfi7NSuDRSpJy3JcsFpGJ3";
      
      // CORREGIR los datos del mensajero existente
      const userData = {
        rol: "mensajero",  // ❗ CORREGIR: era 'administrador' 
        empresaId: "empresa-test-001",  // ❗ CORREGIR: era 'gomez'
        nombre: "Mensajero Test",
        email: "mensajero@test.com", 
        activo: true,
        updatedAt: new Date()
      };

      console.log("CORRIGIENDO documento con datos:", userData);
      
      // Usar updateDoc para actualizar específicamente estos campos
      const docRef = doc(db, "usuarios", mensajeroUID);
      await updateDoc(docRef, userData);
      
      // Verificar que se actualizó
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        console.log("Documento verificado:", docSnap.data());
        
        // También guardarlo en localStorage para poder hacer login
        localStorage.setItem("usuarioActivo", JSON.stringify(userData));
        
        setResult("✅ Mensajero creado y verificado exitosamente! Puedes hacer login con mensajero@test.com");
      } else {
        setResult("❌ Error: El documento no se encontró después de crearlo");
      }
    } catch (error) {
      console.error("Error:", error);
      setResult(`❌ Error: ${error.message}`);
    }
    setLoading(false);
  };

  const checkMensajeros = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, "usuarios"),
        where("empresaId", "==", "empresa-test-001"),
        where("rol", "==", "mensajero")
      );
      
      const querySnapshot = await getDocs(q);
      const mensajeros = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      console.log("Mensajeros encontrados:", mensajeros);
      setResult(`📋 Mensajeros en empresa-test-001: ${JSON.stringify(mensajeros, null, 2)}`);
    } catch (error) {
      console.error("Error:", error);
      setResult(`❌ Error: ${error.message}`);
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
      <h2>Crear Mensajero Test</h2>
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button 
          onClick={createMensajero} 
          disabled={loading}
          style={{
            padding: "10px 20px",
            background: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer"
          }}
        >
          {loading ? "Creando..." : "Crear Mensajero"}
        </button>
        <button 
          onClick={checkMensajeros} 
          disabled={loading}
          style={{
            padding: "10px 20px",
            background: "#28a745",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer"
          }}
        >
          {loading ? "Verificando..." : "Verificar Mensajeros"}
        </button>
      </div>
      {result && (
        <div style={{
          marginTop: "20px",
          padding: "10px",
          border: "1px solid #ddd",
          borderRadius: "5px",
          background: result.includes("✅") ? "#d4edda" : "#f8d7da",
          whiteSpace: "pre-wrap"
        }}>
          {result}
        </div>
      )}
    </div>
  );
}