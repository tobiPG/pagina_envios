import { useEffect, useState } from "react";
import { Bar, Pie } from "react-chartjs-2";
import "chart.js/auto";

function Reportes() {
  const [ordenes, setOrdenes] = useState([]);

  useEffect(() => {
    const datos = JSON.parse(localStorage.getItem("ordenesEntrega")) || [];
    setOrdenes(datos);
  }, []);

  // 1️⃣ Órdenes por franja horaria
  const horas = {};
  ordenes.forEach((orden) => {
    if (orden.horaRegistro) {
      const hora = new Date(orden.horaRegistro).getHours();
      const franja = `${hora}-${hora + 1}`;
      horas[franja] = (horas[franja] || 0) + 1;
    }
  });

  const dataHoras = {
    labels: Object.keys(horas),
    datasets: [
      {
        label: "Órdenes por franja horaria",
        data: Object.values(horas),
        backgroundColor: "rgba(54, 162, 235, 0.6)",
      },
    ],
  };

  // 2️⃣ Tiempo estimado vs tiempo real
  const etiquetasRutas = [];
  const tiemposEstimados = [];
  const tiemposReales = [];

  ordenes.forEach((orden) => {
    if (orden.tiempoEstimado && orden.tiempoReal) {
      etiquetasRutas.push(`Orden ${orden.id}`);
      tiemposEstimados.push(orden.tiempoEstimado);
      tiemposReales.push(orden.tiempoReal);
    }
  });

  const dataTiempos = {
    labels: etiquetasRutas,
    datasets: [
      {
        label: "Tiempo Estimado (min)",
        data: tiemposEstimados,
        backgroundColor: "rgba(255, 206, 86, 0.6)",
      },
      {
        label: "Tiempo Real (min)",
        data: tiemposReales,
        backgroundColor: "rgba(75, 192, 192, 0.6)",
      },
    ],
  };

  // 3️⃣ Órdenes por tipo de vehículo
  const vehiculos = { moto: 0, carro: 0, otro: 0 };
  ordenes.forEach((orden) => {
    if (orden.vehiculo === "moto") vehiculos.moto++;
    else if (orden.vehiculo === "carro") vehiculos.carro++;
    else vehiculos.otro++;
  });

  const dataVehiculos = {
    labels: ["Moto", "Carro", "Otro"],
    datasets: [
      {
        data: [vehiculos.moto, vehiculos.carro, vehiculos.otro],
        backgroundColor: ["#36A2EB", "#FF6384", "#FFCE56"],
      },
    ],
  };

  return (
    <div>
      <h2>📊 Reportes de Envíos</h2>

      {/* Órdenes por hora */}
      <div style={{ marginBottom: "40px" }}>
        <h3>Órdenes por franja horaria</h3>
        <Bar data={dataHoras} />
      </div>

      {/* Tiempo estimado vs real */}
      <div style={{ marginBottom: "40px" }}>
        <h3>Tiempo estimado vs tiempo real</h3>
        <Bar data={dataTiempos} />
      </div>

      {/* Vehículos */}
      <div style={{ marginBottom: "40px" }}>
        <h3>Órdenes por tipo de vehículo</h3>
        <Pie data={dataVehiculos} />
      </div>
    </div>
  );
}

export default Reportes;
