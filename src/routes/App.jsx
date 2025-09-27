// src/routes/App.jsx
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate, useNavigate } from "react-router-dom";
import { useEffect, useState, useMemo, Suspense, lazy } from "react";

import Menu from "../components/Menu";

import Login from "../pantallas/Login";
import OrdenesEntrega from "../pantallas/OrdenesEntrega";
import Dashboard from "../pantallas/Dashboard";
import ETA from "../pantallas/ETA";
import RutaOptimizada from "../pantallas/RutaOptimizada";
import HistorialCambios from "../pantallas/HistorialCambios";
import Entregas from "../pantallas/Entregas";
import EstadisticasAdmin from "../pantallas/EstadisticasAdmin";
import EstadisticasOperador from "../pantallas/EstadisticasOperador";
import MapaMensajeros from "../pantallas/MapaMensajeros";
import OrdenForm from "../pantallas/OrdenForm";
import AdminToolsNormalizarFechas from "../pantallas/AdminToolsNormalizarFechas";
import RutaMensajero from "../pantallas/RutaMensajero";
import ProgramarEntregas from "../pantallas/ProgramarEntregas.jsx";
import AlertasSLA from "../pantallas/AlertasSLA.jsx";
import SeguimientoRutas from "../pantallas/SeguimientoRutas.jsx";

import OrdenDetalle from "../pantallas/OrdenDetalle.jsx";
import SeleccionarDestino from "../pantallas/SeleccionarDestino.jsx";
import Reportes from "../pantallas/Reportes.jsx";

// ⚠️ Mantengo tu pantalla legacy y agrego la nueva
import EmpresaRegistro from "../pantallas/Auth/EmpresaRegistro.jsx";

// 🆕 Landing pública
import LandingPreview from "../pantallas/LandingPreview.jsx";

// 🆕 Pantallas públicas
import PlanesPublicos from "../pantallas/Auth/PlanesPublicos.jsx";
import RegistroEmpresa from "../pantallas/Auth/RegistroEmpresa.jsx";
import RegistroAgente from "../pantallas/Auth/RegistroAgente.jsx"; // opcional (mensajero)

// ⛔️ Quitamos Equipo (default) para evitar el error y usamos UsuariosEmpresa
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
    // 🆕 Gerente
    gerente: "gerente",
    manager: "gerente",
  };
  return map[r] || r;
}

function Rutas() {
  const location = useLocation();
  const navigate = useNavigate();

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

  // Menú: oculto en rutas públicas
  const pathname = location.pathname || "/";
  const esPublica =
    pathname === "/" ||                  // Landing pública
    pathname === "/login" ||             // Login público
    pathname === "/crear-empresa" ||     // legacy
    pathname === "/planes-publicos" ||   // catálogo visible sin login
    pathname === "/registro-empresa" ||  // registro admin/empresa
    pathname === "/registro-agente" ||   // registro rápido mensajero
    pathname === "/reclamar-token" ||
    pathname.startsWith("/aceptar-invitacion");

  const mostrarMenu = !!usuario && !esPublica;

  return (
    <>
      {mostrarMenu && <Menu />}

      <Routes>
        {/* 🏠 Home público: Landing con vista previa + CTAs */}
        <Route
          path="/"
          element={
            <LandingPreview
              onLogin={() => navigate("/login")}
              onRegister={() => navigate("/registro-empresa")}
              onDemo={() => navigate("/planes-publicos")}
            />
          }
        />

        {/* Login público */}
        <Route path="/login" element={<Login />} />

        {/* 🔓 Rutas públicas (sin sesión) */}
        <Route path="/planes-publicos" element={<PlanesPublicos />} />
        <Route path="/crear-empresa" element={<EmpresaRegistro />} />
        <Route path="/registro-empresa" element={<RegistroEmpresa />} />
        <Route path="/registro-agente" element={<RegistroAgente />} />
        <Route path="/aceptar-invitacion/:token" element={<AceptarInvitacion />} />
        <Route path="/reclamar-token" element={<ReclamarToken />} />

        {/* Si no hay sesión y no coincidió con públicas → landing */}
        {!usuario && <Route path="*" element={<Navigate to="/" replace />} />}

        {/* ADMIN */}
        {usuario && rol === "administrador" && (
          <>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/estadisticas" element={<EstadisticasAdmin />} />
            <Route path="/estadisticas-operador" element={<EstadisticasOperador />} />
            <Route path="/ordenes" element={<OrdenesEntrega />} />

            {/* Detalle / Mapa / Selección */}
            <Route path="/orden/:id" element={<OrdenDetalle />} />
            <Route path="/mapa/:id" element={<MapaMensajeros />} />
            <Route path="/mapa-mensajeros" element={<MapaMensajeros />} />
            <Route path="/seleccionar-destino/:id" element={<SeleccionarDestino />} />

            {/* Crear / Editar orden */}
            <Route path="/orden/nueva" element={<OrdenForm />} />
            <Route path="/orden/:id/editar" element={<OrdenForm />} />

            <Route path="/historial" element={<HistorialCambios />} />
            <Route path="/reportes" element={<Reportes />} />
            <Route path="/eta" element={<ETA />} />
            <Route path="/ruta" element={<RutaOptimizada />} />
            <Route path="/ruta-mensajero/:id" element={<RutaMensajero />} />
            <Route path="/programas" element={<ProgramarEntregas />} />

            {/* Alias claros */}
            <Route path="/seguimiento-rutas" element={<SeguimientoRutas />} />
            <Route path="/seguimiento" element={<Navigate to="/seguimiento-rutas" replace />} />
            <Route path="/alertas-sla" element={<AlertasSLA />} />
            <Route path="/alertas" element={<Navigate to="/alertas-sla" replace />} />
            <Route path="/planes" element={<PlanSeleccion />} />

            {/* Equipo */}
            <Route path="/equipo" element={<UsuariosEmpresa />} />

            {/* SIEMPRE al final */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </>
        )}

        {/* 🆕 GERENTE (solo lectura/operaciones básicas; sin crear/editar ni /planes) */}
        {usuario && rol === "gerente" && (
          <>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/estadisticas" element={<EstadisticasAdmin />} />
            <Route path="/estadisticas-operador" element={<EstadisticasOperador />} />
            <Route path="/ordenes" element={<OrdenesEntrega />} />

            {/* Detalle / Mapas / Selección (solo ver) */}
            <Route path="/orden/:id" element={<OrdenDetalle />} />
            <Route path="/mapa/:id" element={<MapaMensajeros />} />
            <Route path="/mapa-mensajeros" element={<MapaMensajeros />} />
            <Route path="/seleccionar-destino/:id" element={<SeleccionarDestino />} />

            {/* ❌ No incluimos crear/editar orden ni programar */}
            {/* <Route path="/orden/nueva" element={<OrdenForm />} /> */}
            {/* <Route path="/orden/:id/editar" element={<OrdenForm />} /> */}
            {/* <Route path="/programas" element={<ProgramarEntregas />} /> */}

            <Route path="/historial" element={<HistorialCambios />} />
            <Route path="/reportes" element={<Reportes />} />
            <Route path="/eta" element={<ETA />} />
            <Route path="/ruta" element={<RutaOptimizada />} />
            <Route path="/ruta-mensajero/:id" element={<RutaMensajero />} />

            {/* Alias claros */}
            <Route path="/seguimiento-rutas" element={<SeguimientoRutas />} />
            <Route path="/seguimiento" element={<Navigate to="/seguimiento-rutas" replace />} />
            <Route path="/alertas-sla" element={<AlertasSLA />} />
            <Route path="/alertas" element={<Navigate to="/alertas-sla" replace />} />

            {/* Equipo visible (sin cambiar planes/billing) */}
            <Route path="/equipo" element={<UsuariosEmpresa />} />

            {/* SIEMPRE al final */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </>
        )}

        {/* OPERADOR */}
        {usuario && rol === "operador" && (
          <>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/ordenes" element={<OrdenesEntrega />} />

            {/* Detalle / Mapa / Selección */}
            <Route path="/orden/:id" element={<OrdenDetalle />} />
            <Route path="/mapa/:id" element={<MapaMensajeros />} />
            <Route path="/ruta-mensajero/:id" element={<RutaMensajero />} />
            <Route path="/seleccionar-destino/:id" element={<SeleccionarDestino />} />

            {/* Crear / Editar orden */}
            <Route path="/orden/nueva" element={<OrdenForm />} />
            <Route path="/orden/:id/editar" element={<OrdenForm />} />

            <Route path="/reportes" element={<Reportes />} />
            <Route path="/programas" element={<ProgramarEntregas />} />

            {/* Alias claros */}
            <Route path="/seguimiento-rutas" element={<SeguimientoRutas />} />
            <Route path="/seguimiento" element={<Navigate to="/seguimiento-rutas" replace />} />
            <Route path="/alertas-sla" element={<AlertasSLA />} />
            <Route path="/alertas" element={<Navigate to="/alertas-sla" replace />} />

            {/* SIEMPRE al final */}
            <Route path="*" element={<Navigate to="/ordenes" replace />} />
          </>
        )}

        {/* MENSAJERO */}
        {usuario && rol === "mensajero" && (
          <>
            <Route path="/entregas" element={<Entregas />} />
            <Route path="/orden/:id" element={<OrdenDetalle />} />
            <Route path="/seleccionar-destino/:id" element={<SeleccionarDestino />} />
            <Route path="/ruta-mensajero/:id" element={<RutaMensajero />} />
            <Route path="*" element={<Navigate to="/entregas" replace />} />
          </>
        )}

        {/* Rol no reconocido */}
        {usuario && !["administrador", "gerente", "operador", "mensajero"].includes(rol) && (
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
