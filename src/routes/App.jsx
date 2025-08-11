// src/routes/App.jsx
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
import Entregas from "../pantallas/Entregas";
import EstadisticasAdmin from "../pantallas/EstadisticasAdmin";
import EstadisticasOperador from "../pantallas/EstadisticasOperador";
import MapaMensajeros from "../pantallas/MapaMensajeros";

function Rutas() {
  const location = useLocation();

  // ✅ Leemos usuarioActivo una vez al montar (sincrónico)
  const [usuario, setUsuario] = useState(() => {
    const raw = localStorage.getItem("usuarioActivo");
    return raw ? JSON.parse(raw) : null;
  });

  // (opcional) si cambia en otra pestaña/ventana, nos actualizamos
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "usuarioActivo") {
        const raw = localStorage.getItem("usuarioActivo");
        setUsuario(raw ? JSON.parse(raw) : null);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const mostrarMenu = location.pathname !== "/" && usuario;

  return (
    <>
      {mostrarMenu && <Menu />}

      <Routes>
        {/* LOGIN */}
        <Route path="/" element={<Login />} />

        {/* ADMINISTRADOR */}
        {usuario?.rol === "administrador" && (
          <>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/estadisticas" element={<EstadisticasAdmin />} />
            <Route path="/estadisticas-operador" element={<EstadisticasOperador />} />
            <Route path="/ordenes" element={<OrdenesEntrega />} />
            <Route path="/clientes" element={<RegistroClientes />} />
            <Route path="/productos" element={<RegistroProductos />} />
            <Route path="/historial" element={<HistorialCambios />} />
            <Route path="/eta" element={<ETA />} />
            <Route path="/ruta" element={<RutaOptimizada />} />
            <Route path="/mapa-mensajeros" element={<MapaMensajeros />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </>
        )}

        {/* OPERADOR */}
        {usuario?.rol === "operador" && (
          <>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/ordenes" element={<OrdenesEntrega />} />
            <Route path="/estadisticas-operador" element={<EstadisticasOperador />} />
            <Route path="*" element={<Navigate to="/ordenes" replace />} />
          </>
        )}

        {/* MENSAJERO */}
        {usuario?.rol === "mensajero" && (
          <>
            <Route path="/entregas" element={<Entregas />} />
            <Route path="*" element={<Navigate to="/entregas" replace />} />
          </>
        )}
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <Router>
      <Rutas />
    </Router>
  );
}
