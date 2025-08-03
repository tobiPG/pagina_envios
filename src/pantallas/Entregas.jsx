import { useState, useEffect } from "react";

function Entregas() {
  const [ordenes, setOrdenes] = useState([]);
  const usuarioActivo = JSON.parse(localStorage.getItem("usuarioActivo"));

  const cargarOrdenes = () => {
    const data = localStorage.getItem("ordenesEntrega");
    if (data) {
      try {
        const todas = JSON.parse(data);
        const pendientes = todas.filter((orden) => !orden.entregado);
        setOrdenes(pendientes);
        console.log("Órdenes cargadas:", pendientes); // ✅ Verificación en consola
      } catch (error) {
        console.error("Error al cargar órdenes:", error);
      }
    } else {
      setOrdenes([]);
    }
  };

  useEffect(() => {
    cargarOrdenes();

    // Escuchar cambios en localStorage hechos por otras pestañas/usuarios
    window.addEventListener("storage", cargarOrdenes);

    // Opcional: recargar cada cierto tiempo por seguridad
    const intervalo = setInterval(() => {
      cargarOrdenes();
    }, 3000); // cada 3 segundos

    return () => {
      window.removeEventListener("storage", cargarOrdenes);
      clearInterval(intervalo);
    };
  }, []);

  const marcarComoRecibida = (id) => {
    const actualizadas = JSON.parse(localStorage.getItem("ordenesEntrega")).map((orden) =>
      orden.id === id
        ? {
            ...orden,
            recibida: true,
            fechaRecibida: new Date().toLocaleString(),
            mensajero: usuarioActivo?.nombre || "Desconocido",
          }
        : orden
    );

    localStorage.setItem("ordenesEntrega", JSON.stringify(actualizadas));
    cargarOrdenes();
  };

  const marcarComoEntregada = (id) => {
    const actualizadas = JSON.parse(localStorage.getItem("ordenesEntrega")).map((orden) =>
      orden.id === id ? { ...orden, entregado: true } : orden
    );

    localStorage.setItem("ordenesEntrega", JSON.stringify(actualizadas));
    cargarOrdenes();
  };

  return (
    <div>
      <h2>Órdenes asignadas</h2>
      {ordenes.length === 0 ? (
        <p>No hay órdenes pendientes.</p>
      ) : (
        <ul>
          {ordenes.map((orden) => (
            <li key={orden.id} style={{ marginBottom: "10px" }}>
              📦 <strong>{orden.producto}</strong> para {orden.cliente} — {orden.fecha} {orden.hora}
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Entregas;
