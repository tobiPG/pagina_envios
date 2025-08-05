import { useEffect, useState } from "react";
import { rutasPredefinidas } from "../data/rutasPredefinidas";
import { Bar, Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

function EstadisticasAdmin() {
  const [ordenes, setOrdenes] = useState([]);

  useEffect(() => {
    const ordenesGuardadas = JSON.parse(localStorage.getItem("ordenesEntrega")) || [];
    setOrdenes(ordenesGuardadas);
  }, []);

  // 📊 Envíos por franja horaria
  const franjas = [
    "9-10",
    "10-11",
    "11-12",
    "12-13",
    "13-14",
    "14-15",
    "15-16",
    "16-17",
    "17-18",
    "18-19",
    "19-20",
  ];
  const enviosPorFranja = franjas.map((franja) => {
    const [inicio] = franja.split("-");
    return ordenes.filter((o) => parseInt(o.hora.split(":")[0]) === parseInt(inicio)).length;
  });

  // 📊 Rutas más usadas
  const rutas = rutasPredefinidas.map((r) => `${r.origen} → ${r.destino}`);
  const conteoRutas = rutasPredefinidas.map(
    (r) => ordenes.filter((o) => o.rutaId === r.id).length
  );

  // 📊 Tiempo estimado promedio por ruta (simulado)
  const tiemposPromedio = rutasPredefinidas.map(() => Math.floor(Math.random() * 60) + 20);

  return (
    <div>
      <h2>📊 Estadísticas Administrador</h2>

      {/* Envíos por Franja Horaria */}
      <h3>Envíos por Franja Horaria</h3>
      <div style={{ maxWidth: "800px", height: "700px" }}>
        <Bar
          data={{
            labels: franjas,
            datasets: [
              {
                label: "Envíos",
                data: enviosPorFranja,
                backgroundColor: "rgba(54, 162, 235, 0.6)",
              },
            ],
          }}
          options={{ maintainAspectRatio: false }}
        />
      </div>

      {/* Rutas más usadas */}
      <h3>Rutas más usadas</h3>
      <div style={{ maxWidth: "800px", height: "700px" }}>
        <Pie
          data={{
            labels: rutas,
            datasets: [
              {
                label: "Rutas",
                data: conteoRutas,
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
          options={{ maintainAspectRatio: false }}
        />
      </div>

      {/* Tiempo promedio por ruta */}
      <h3>Tiempo Promedio por Ruta (minutos)</h3>
      <div style={{ maxWidth: "800px", height: "700px" }}>
        <Bar
          data={{
            labels: rutas,
            datasets: [
              {
                label: "Tiempo promedio (min)",
                data: tiemposPromedio,
                backgroundColor: "rgba(75, 192, 192, 0.6)",
              },
            ],
          }}
          options={{ maintainAspectRatio: false }}
        />
      </div>
    </div>
  );
}

export default EstadisticasAdmin;
