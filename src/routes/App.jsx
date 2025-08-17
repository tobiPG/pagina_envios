// src/routes/App.jsx
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { useEffect, useState, useMemo, Suspense, lazy } from "react";

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
import AdminToolsNormalizarFechas from "../pantallas/AdminToolsNormalizarFechas";
import RutaMensajero from "../pantallas/RutaMensajero";

// 👇 Onboarding multiempresa (públicas + admin)
// ⚠️ IMPORTS con ruta y extensión exacta (.jsx) y mayúsculas correctas
import EmpresaRegistro from "../pantallas/Auth/EmpresaRegistro.jsx";
const PlanSeleccion = lazy(() => import("../pantallas/Auth/PlanSeleccion.jsx"));
import UsuariosEmpresa from "../pantallas/Admin/UsuariosEmpresa.jsx";
import AceptarInvitacion from "../pantallas/Auth/AceptarInvitacion.jsx";
import ReclamarToken from "../pantallas/Auth/ReclamarToken.jsx";

// Normaliza alias de roles
function normalizeRole(raw) {
  const r = String(raw || "").trim().toLowerCase();
  const map = {
    admin: "administrador",
    administrador: "administrador",
    administrator: "administrador",

    operador: "operador",
    operator: "operador",

    mensajero: "mensajero",
    rider: "mensajero",
    courier: "mensajero",
    delivery: "mensajero",
    deliveryman: "mensajero",
    repartidor: "mensajero",
  };
  return map[r] || r;
}

function Rutas() {
  const location = useLocation();

  // Sesión
  const [usuario, setUsuario] = useState(() => {
    try {
      const raw = localStorage.getItem("usuarioActivo");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // Sync entre pestañas
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "usuarioActivo") {
        try {
          const raw = localStorage.getItem("usuarioActivo");
          setUsuario(raw ? JSON.parse(raw) : null);
        } catch {
          setUsuario(null);
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const rol = useMemo(() => normalizeRole(usuario?.rol), [usuario?.rol]);

  // Menú: oculto en rutas públicas (login / crear-empresa / aceptar-invitacion / reclamar-token)
  const pathname = location.pathname || "/";
  const esPublica =
    pathname === "/" ||
    pathname === "/crear-empresa" ||
    pathname === "/reclamar-token" ||
    pathname.startsWith("/aceptar-invitacion");
  const mostrarMenu = !!usuario && !esPublica;

  return (
    <>
      {mostrarMenu && <Menu />}

      <Routes>
        {/* Login siempre */}
        <Route path="/" element={<Login />} />

        {/* 🔓 Rutas públicas (sin sesión) */}
        <Route path="/crear-empresa" element={<EmpresaRegistro />} />
        <Route path="/aceptar-invitacion/:token" element={<AceptarInvitacion />} />
        <Route path="/reclamar-token" element={<ReclamarToken />} /> {/* 👈 NUEVA */}

        {/* Si no hay sesión y no coincidió con públicas → login */}
        {!usuario && <Route path="*" element={<Navigate to="/" replace />} />}

        {/* ADMIN */}
        {usuario && rol === "administrador" && (
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
            <Route path="/mapa/:id" element={<MapaMensajeros />} />
            <Route path="/ruta-mensajero/:id" element={<RutaMensajero />} />
            {/* Herramienta temporal */}
            <Route path="/admin-tools-fechas" element={<AdminToolsNormalizarFechas />} />
            {/* Multiempresa */}
            <Route path="/plan" element={<PlanSeleccion />} />
            <Route path="/usuarios-empresa" element={<UsuariosEmpresa />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </>
        )}

        {/* OPERADOR */}
        {usuario && rol === "operador" && (
          <>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/ordenes" element={<OrdenesEntrega />} />
            <Route path="/mapa/:id" element={<MapaMensajeros />} />
            <Route path="/ruta-mensajero/:id" element={<RutaMensajero />} />
            <Route path="*" element={<Navigate to="/ordenes" replace />} />
          </>
        )}

        {/* MENSAJERO */}
        {usuario && rol === "mensajero" && (
          <>
            <Route path="/entregas" element={<Entregas />} />
            <Route path="/ruta-mensajero/:id" element={<RutaMensajero />} />
            <Route path="*" element={<Navigate to="/entregas" replace />} />
          </>
        )}

        {/* Rol no reconocido */}
        {usuario && !["administrador", "operador", "mensajero"].includes(rol) && (
          <Route
            path="*"
            element={
              <div style={{ padding: 20 }}>
                Rol no reconocido: <b>{String(usuario?.rol)}</b>
                <br />
                (Normalizado: <code>{String(rol)}</code>). Corrige el rol en el perfil o en el guardado de sesión.
              </div>
            }
          />
        )}
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <Router>
      <Suspense fallback={<div style={{ padding: 20 }}>Cargando…</div>}>
        <Rutas />
      </Suspense>
    </Router>
  );
}
