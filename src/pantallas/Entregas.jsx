import { useState, useEffect } from "react";
import { rutasPredefinidas } from "../data/rutasPredefinidas";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { app } from "../firebaseConfig";

const db = getFirestore(app);

function Entregas() {
  const [ordenes, setOrdenes] = useState([]);
  const usuarioActivo = JSON.parse(localStorage.getItem("usuarioActivo"));

  useEffect(() => {
    const cargarOrdenes = () => {
      const ordenesGuardadas = JSON.parse(localStorage.getItem("ordenesEntrega")) || [];
      setOrdenes(ordenesGuardadas);
    };
    cargarOrdenes();
    window.addEventListener("storage", cargarOrdenes);
    return () => window.removeEventListener("storage", cargarOrdenes);
  }, []);

  // 📍 Geolocalización en tiempo real y guardado en Firestore
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.watchPosition(
        async (position) => {
          const ubicacion = {
            nombre: usuarioActivo?.nombre || "Desconocido",
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            ultimaActualizacion: new Date().toISOString()
          };
          localStorage.setItem("ubicacionMensajero", JSON.stringify(ubicacion));
          await setDoc(doc(db, "ubicacionesMensajeros", usuarioActivo?.nombre || "desconocido"), ubicacion);
        },
        (error) => {
          console.error("Error al obtener ubicación:", error);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
      );
    }
  }, []);

  const marcarComoRecibida = (id) => {
    let vehiculo = prompt("¿Vas en moto o carro? (escribe 'moto' o 'carro')");
    if (!vehiculo) vehiculo = "moto";
    vehiculo = vehiculo.toLowerCase().includes("carro") ? "carro" : "moto";

    const tiempoEstimado = calcularTiempoEstimado(vehiculo);

    const actualizadas = ordenes.map((orden) =>
      orden.id === id
        ? {
            ...orden,
            recibida: true,
            fechaRecibida: new Date().toLocaleString(),
            mensajero: usuarioActivo?.nombre || "Desconocido",
            vehiculo,
            tiempoEstimado,
          }
        : orden
    );
    setOrdenes(actualizadas);
    localStorage.setItem("ordenesEntrega", JSON.stringify(actualizadas));
  };

  const marcarComoEntregada = (id) => {
    const horaEntrega = new Date();
    const actualizadas = ordenes.map((orden) =>
      orden.id === id
        ? {
            ...orden,
            entregado: true,
            horaEntrega: horaEntrega.toISOString(),
            tiempoReal: orden.fechaRecibida
              ? Math.round((horaEntrega - new Date(orden.fechaRecibida)) / 60000)
              : null,
          }
        : orden
    );
    setOrdenes(actualizadas);
    localStorage.setItem("ordenesEntrega", JSON.stringify(actualizadas));
  };

  const calcularTiempoEstimado = (vehiculo) => {
    let tiempoBase = 60;
    if (vehiculo === "moto") {
      tiempoBase = tiempoBase * 0.8;
    }
    return Math.round(tiempoBase);
  };

  const verRutaOptimizada = (rutaId) => {
    const ruta = rutasPredefinidas.find(r => r.id === rutaId);
    if (!ruta) {
      alert("Ruta no encontrada");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latOrigen = pos.coords.latitude;
        const lngOrigen = pos.coords.longitude;
        const urlMapa = `https://www.google.com/maps/dir/?api=1&origin=${latOrigen},${lngOrigen}&destination=${ruta.paradaSD.lat},${ruta.paradaSD.lng}&travelmode=driving`;
        window.open(urlMapa, "_blank");
      },
      (error) => {
        alert("No se pudo obtener la ubicación actual");
        console.error(error);
      }
    );
  };

  const ordenesPendientes = ordenes.filter((orden) => !orden.entregado);

  return (
    <div>
      <h2>Órdenes asignadas</h2>
      {ordenesPendientes.length === 0 && <p>No hay órdenes pendientes.</p>}
      <ul>
        {ordenesPendientes.map((orden) => (
          <li key={orden.id} style={{ marginBottom: "15px" }}>
            📦 <strong>{orden.producto}</strong> para {orden.cliente} — {orden.fecha} {orden.hora}
            <br />
            {orden.vehiculo && (
              <span style={{ color: "blue" }}>
                🚚 Vehículo: {orden.vehiculo} | ⏱ Tiempo estimado: {orden.tiempoEstimado} min
              </span>
            )}
            <br />
            {orden.recibida ? (
              <>
                <span style={{ color: "green" }}>
                  ✅ Recibida por {orden.mensajero} ({orden.fechaRecibida})
                </span>
                {!orden.entregado && (
                  <div>
                    <button onClick={() => marcarComoEntregada(orden.id)}>
                      📬 Marcar como Entregada
                    </button>
                  </div>
                )}
              </>
            ) : (
              <button onClick={() => marcarComoRecibida(orden.id)}>
                ✅ Marcar como Recibida
              </button>
            )}
            {orden.rutaId && (
              <div style={{ marginTop: "5px" }}>
                <button onClick={() => verRutaOptimizada(orden.rutaId)}>
                  📍 Ver ruta optimizada
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Entregas;
