import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import Menu from "../components/Menu";
import Login from "../pantallas/Login";
import RegistroClientes from "../pantallas/RegistroClientes";
import RegistroProductos from "../pantallas/RegistroProductos";
import OrdenesEntrega from "../pantallas/OrdenesEntrega";
import Dashboard from "../pantallas/Dashboard";
import ETA from "../pantallas/ETA";
import RutaOptimizada from "../pantallas/RutaOptimizada";
import HistorialCambios from "../pantallas/HistorialCambios";
import Entregas from "../pantallas/Entregas"; // Asegúrate de importar Entregas
import EstadisticasAdmin from "../pantallas/EstadisticasAdmin"; // 📌 Importar el nuevo archivo
import EstadisticasOperador from "../pantallas/EstadisticasOperador";


function Rutas() {
  const location = useLocation();
  const [usuario, setUsuario] = useState(null);

  useEffect(() => {
    const datos = localStorage.getItem("usuarioActivo");
    if (datos) setUsuario(JSON.parse(datos));
  }, []);

  const mostrarMenu = location.pathname !== "/" && usuario;

  return (
    <>
      {mostrarMenu && <Menu />}

      <Routes>
        <Route path="/" element={<Login />} />

        {usuario?.rol === "administrador" && (
  <>
    <Route path="/dashboard" element={<Dashboard />} />
    <Route path="/estadisticas" element={<EstadisticasAdmin />} /> {/* 📊 Nueva ruta */}
    <Route path="/estadisticas-operador" element={<EstadisticasOperador />} /> {/* 📊 Nueva ruta */}
    <Route path="/ordenes" element={<OrdenesEntrega />} />
    <Route path="/clientes" element={<RegistroClientes />} />
    <Route path="/historial" element={<HistorialCambios />} />
    <Route path="/eta" element={<ETA />} />
    <Route path="/ruta" element={<RutaOptimizada />} />
    <Route path="*" element={<Navigate to="/dashboard" />} />
  </>
)}


        {usuario?.rol === "operador" && (
          <>
            <Route path="/clientes" element={<RegistroClientes />} />
            <Route path="/productos" element={<RegistroProductos />} />
            <Route path="/ordenes" element={<OrdenesEntrega />} />
            <Route path="*" element={<Navigate to="/ordenes" />} />
          </>
        )}

        {usuario?.rol === "mensajero" && (
          <>
            <Route path="/entregas" element={<Entregas />} />
            <Route path="/eta" element={<ETA />} />
            <Route path="/ruta" element={<RutaOptimizada />} />
            <Route path="*" element={<Navigate to="/entregas" />} />
          </>
        )}
      </Routes>
    </>
  );
}

function App() {
  return (
    <Router>
      <Rutas />
    </Router>
  );
}

export default App;
