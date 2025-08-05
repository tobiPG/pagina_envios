import { useEffect, useState } from "react";
import { rutasPredefinidas } from "../data/rutasPredefinidas";
import { Bar, Pie, Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  ArcElement,
  BarElement,
  LineElement,
  PointElement,
} from "chart.js";

// 📌 Registro de componentes de Chart.js
ChartJS.register(
  Title,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  ArcElement,
  BarElement,
  LineElement,
  PointElement
);

function EstadisticasOperador() {
  const [ordenesOperador, setOrdenesOperador] = useState([]);

  useEffect(() => {
    const todasLasOrdenes = JSON.parse(localStorage.getItem("ordenesEntrega")) || [];
    const filtradas = todasLasOrdenes.filter((o) => o.rolUsuario === "operador");
    setOrdenesOperador(filtradas);
  }, []);

  // 1️⃣ Envíos por franja horaria
  const horas = Array.from({ length: 24 }, (_, i) => `${i}:00`);
  const enviosPorHora = horas.map((hora) =>
    ordenesOperador.filter((o) => new Date(o.horaRegistro).getHours() === parseInt(hora)).length
  );

  // 2️⃣ Rutas más usadas
  const rutasContadas = rutasPredefinidas.map((ruta) => {
    const cantidad = ordenesOperador.filter((o) => o.rutaId === ruta.id).length;
    return { ruta: `${ruta.origen} → ${ruta.destino}`, cantidad };
  });

  // 3️⃣ Tiempo promedio de entrega
  const tiemposEntrega = ordenesOperador
    .filter((o) => o.tiempoTotalEntrega)
    .map((o) => parseFloat(o.tiempoTotalEntrega));
  const tiempoPromedioEntrega =
    tiemposEntrega.length > 0
      ? (tiemposEntrega.reduce((a, b) => a + b, 0) / tiemposEntrega.length).toFixed(2)
      : 0;

  // 4️⃣ Órdenes entregadas vs pendientes
  const entregadas = ordenesOperador.filter((o) => o.entregado).length;
  const pendientes = ordenesOperador.length - entregadas;

  // 5️⃣ Envíos por día de la semana
  const diasSemana = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const enviosPorDia = diasSemana.map((_, i) =>
    ordenesOperador.filter((o) => new Date(o.fecha).getDay() === i).length
  );

  return (
    <div style={{ padding: "20px" }}>
      <h2>📊 Estadísticas del Operador</h2>

      {/* 1️⃣ Envíos por franja horaria */}
      <div style={{ maxWidth: "800px", height: "700px", margin: "auto" }}>
        <h3>Envíos por franja horaria</h3>
        <Bar
          data={{
            labels: horas,
            datasets: [
              {
                label: "Órdenes",
                data: enviosPorHora,
                backgroundColor: "rgba(54, 162, 235, 0.6)",
              },
            ],
          }}
        />
      </div>

      {/* 2️⃣ Rutas más usadas */}
      <div style={{ maxWidth: "800px", height: "700px", margin: "auto" }}>
        <h3>Rutas más usadas</h3>
        <Pie
          data={{
            labels: rutasContadas.map((r) => r.ruta),
            datasets: [
              {
                data: rutasContadas.map((r) => r.cantidad),
                backgroundColor: [
                  "rgba(255, 99, 132, 0.6)",
                  "rgba(54, 162, 235, 0.6)",
                  "rgba(255, 206, 86, 0.6)",
                  "rgba(75, 192, 192, 0.6)",
                  "rgba(153, 102, 255, 0.6)",
                  "rgba(255, 159, 64, 0.6)",
                ],
              },
            ],
          }}
        />
      </div>

      {/* 3️⃣ Tiempo promedio de entrega */}
      <div style={{ maxWidth: "800px", height: "700px", margin: "auto" }}>
        <h3>Tiempo promedio de entrega</h3>
        <p style={{ fontSize: "20px", fontWeight: "bold" }}>
          {tiempoPromedioEntrega} minutos
        </p>
      </div>

      {/* 4️⃣ Órdenes entregadas vs pendientes */}
      <div style={{ maxWidth: "800px", height: "700px", margin: "auto" }}>
        <h3>Órdenes entregadas vs pendientes</h3>
        <Pie
          data={{
            labels: ["Entregadas", "Pendientes"],
            datasets: [
              {
                data: [entregadas, pendientes],
                backgroundColor: ["rgba(75, 192, 192, 0.6)", "rgba(255, 99, 132, 0.6)"],
              },
            ],
          }}
        />
      </div>

      {/* 5️⃣ Envíos por día de la semana */}
      <div style={{ maxWidth: "800px", height: "700px", margin: "auto" }}>
        <h3>Envíos por día de la semana</h3>
        <Bar
          data={{
            labels: diasSemana,
            datasets: [
              {
                label: "Órdenes",
                data: enviosPorDia,
                backgroundColor: "rgba(153, 102, 255, 0.6)",
              },
            ],
          }}
        />
      </div>
    </div>
  );
}

export default EstadisticasOperador;
