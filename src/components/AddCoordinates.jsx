// Componente para agregar coordenadas a órdenes
import { useState } from "react";
import { db } from "../shared/services/firebase.js";
import { collection, getDocs, doc, updateDoc, query, where } from "firebase/firestore";

export default function AddCoordinates() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  const coordenadasEjemplo = [
    { lat: 10.4806, lng: -66.9036, direccion: "Plaza Venezuela, Caracas" },
    { lat: 10.4880, lng: -66.8792, direccion: "Centro Comercial Sambil, Caracas" },
    { lat: 10.5020, lng: -66.9152, direccion: "Universidad Central de Venezuela, Caracas" }
  ];

  const addCoordinates = async () => {
    setLoading(true);
    try {
      // Obtener órdenes de empresa-test-001
      const q = query(
        collection(db, "ordenes"),
        where("empresaId", "==", "empresa-test-001")
      );
      
      const querySnapshot = await getDocs(q);
      console.log(`Encontradas ${querySnapshot.docs.length} órdenes`);
      
      let updatedCount = 0;
      
      for (const orderDoc of querySnapshot.docs) {
        const orderData = orderDoc.data();
        const coordenadas = coordenadasEjemplo[updatedCount % coordenadasEjemplo.length];
        
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
        
        console.log(`✅ Orden ${orderDoc.id} actualizada con:`, coordenadas);
        updatedCount++;
      }
      
      setResult(`✅ ${updatedCount} órdenes actualizadas con coordenadas exitosamente!`);
      
    } catch (error) {
      console.error("Error:", error);
      setResult(`❌ Error: ${error.message}`);
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
      <h2>Agregar Coordenadas a Órdenes</h2>
      <p>Las órdenes actualmente no tienen coordenadas de destino. Este componente agregará coordenadas de ejemplo.</p>
      
      <button 
        onClick={addCoordinates} 
        disabled={loading}
        style={{
          padding: "15px 30px",
          background: "#28a745",
          color: "white",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
          fontSize: "16px"
        }}
      >
        {loading ? "Agregando coordenadas..." : "Agregar Coordenadas"}
      </button>
      
      {result && (
        <div style={{
          marginTop: "20px",
          padding: "15px",
          border: "1px solid #ddd",
          borderRadius: "8px",
          background: result.includes("✅") ? "#d4edda" : "#f8d7da"
        }}>
          {result}
        </div>
      )}
      
      <div style={{ marginTop: "20px", fontSize: "14px", color: "#666" }}>
        <h3>Coordenadas que se agregarán:</h3>
        <ul>
          <li>Plaza Venezuela, Caracas (10.4806, -66.9036)</li>
          <li>Centro Comercial Sambil, Caracas (10.4880, -66.8792)</li>
          <li>Universidad Central de Venezuela, Caracas (10.5020, -66.9152)</li>
        </ul>
      </div>
    </div>
  );
}