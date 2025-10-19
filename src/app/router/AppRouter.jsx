// src/app/router/AppRouter.jsx
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate, useNavigate } from "react-router-dom";
import { useEffect, useState, useMemo } from "react";

// Shared components
import Menu from "../../shared/components/Menu";

// Temporary component for seeding database
import SeedDatabase from "../../components/SeedDatabase";
import CreateMessenger from "../../components/CreateMessenger";
import AddCoordinates from "../../components/AddCoordinates";

// Feature imports - Auth
import {
  LoginPage,
  LandingPage,
  RegistroEmpresa,
  RegistroAgente,
  AceptarInvitacion,
  ReclamarToken,
  PlanesPublicos,
  EmpresaRegistro,
  PlanSeleccion
} from "../../features/auth";

// Feature imports - Dashboard
import {
  DashboardPage,
  AdminStatsPage,
  OperatorStatsPage
} from "../../features/dashboard";

// Feature imports - Orders
import {
  OrdersListPage,
  OrderFormPage,
  OrderDetailsPage,
  OrderHistoryPage,
  UnifiedOrdersPage
} from "../../features/orders";

// Feature imports - Deliveries
import {
  DeliveriesPage,
  ScheduleDeliveriesPage
} from "../../features/deliveries";

// Feature imports - Routes
import {
  OptimizedRoutePage,
  CourierRoutePage,
  CourierMapPage,
  RouteTrackingPage,
  SelectDestinationPage,
  ETAPage,
  MultiStopCourierMapPage
} from "../../features/routes";

// Feature imports - Users
import {
  TeamPage,
  CompanyUsersPage
} from "../../features/users";

// Feature imports - Billing
import {
  BillingPlansPage
} from "../../features/billing";

// Feature imports - Reports
import {
  ReportsPage
} from "../../features/reports";

// Feature imports - Notifications
import {
  SLAAlertsPage
} from "../../features/notifications";

// Legacy components have been migrated

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
        {/* � Temporary route for seeding database */}
        <Route path="/seed-database" element={<SeedDatabase />} />
        <Route path="/create-messenger" element={<CreateMessenger />} />
        <Route path="/add-coordinates" element={<AddCoordinates />} />
        
        {/* �🏠 Home público: Landing con vista previa + CTAs */}
        <Route
          path="/"
          element={
            <LandingPage
              onLogin={() => navigate("/login")}
              onRegister={() => navigate("/registro-empresa")}
              onDemo={() => navigate("/planes-publicos")}
            />
          }
        />

        {/* Login público */}
        <Route path="/login" element={<LoginPage />} />

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
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/estadisticas" element={<AdminStatsPage />} />
            <Route path="/estadisticas-operador" element={<OperatorStatsPage />} />
            <Route path="/ordenes" element={<UnifiedOrdersPage />} />

            {/* Detalle / Mapa / Selección */}
            <Route path="/orden/:id" element={<OrderDetailsPage />} />
            <Route path="/mapa/:id" element={<CourierMapPage />} />
            <Route path="/mapa-multi-stop/:id" element={<MultiStopCourierMapPage />} />
            <Route path="/mapa-mensajeros" element={<CourierMapPage />} />
            <Route path="/seleccionar-destino/:id" element={<SelectDestinationPage />} />

            {/* Crear / Editar orden - DEPRECATED, now handled in UnifiedOrdersPage */}
            {/* <Route path="/orden/nueva" element={<OrderFormPage />} />
            <Route path="/orden/:id/editar" element={<OrderFormPage />} /> */}

            <Route path="/historial" element={<OrderHistoryPage />} />
            <Route path="/reportes" element={<ReportsPage />} />
            <Route path="/eta" element={<ETAPage />} />
            <Route path="/ruta" element={<OptimizedRoutePage />} />
            <Route path="/ruta-mensajero/:id" element={<CourierRoutePage />} />
            <Route path="/programas" element={<ScheduleDeliveriesPage />} />

            {/* Alias claros */}
            <Route path="/seguimiento-rutas" element={<RouteTrackingPage />} />
            <Route path="/seguimiento" element={<Navigate to="/seguimiento-rutas" replace />} />
            <Route path="/alertas-sla" element={<SLAAlertsPage />} />
            <Route path="/alertas" element={<Navigate to="/alertas-sla" replace />} />
            <Route path="/planes" element={<PlanSeleccion />} />

            {/* Equipo */}
            <Route path="/equipo" element={<CompanyUsersPage />} />

            {/* SIEMPRE al final */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </>
        )}

        {/* 🆕 GERENTE (solo lectura/operaciones básicas; sin crear/editar ni /planes) */}
        {usuario && rol === "gerente" && (
          <>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/estadisticas" element={<AdminStatsPage />} />
            <Route path="/estadisticas-operador" element={<OperatorStatsPage />} />
            <Route path="/ordenes" element={<UnifiedOrdersPage />} />

            {/* Detalle / Mapas / Selección (solo ver) */}
            <Route path="/orden/:id" element={<OrderDetailsPage />} />
            <Route path="/mapa/:id" element={<CourierMapPage />} />
            <Route path="/mapa-multi-stop/:id" element={<MultiStopCourierMapPage />} />
            <Route path="/mapa-mensajeros" element={<CourierMapPage />} />
            <Route path="/seleccionar-destino/:id" element={<SelectDestinationPage />} />

            {/* ❌ No incluimos crear/editar orden ni programar - handled in UnifiedOrdersPage now */}
            {/* <Route path="/orden/nueva" element={<OrderFormPage />} /> */}
            {/* <Route path="/orden/:id/editar" element={<OrderFormPage />} /> */}
            {/* <Route path="/programas" element={<ScheduleDeliveriesPage />} /> */}

            <Route path="/historial" element={<OrderHistoryPage />} />
            <Route path="/reportes" element={<ReportsPage />} />
            <Route path="/eta" element={<ETAPage />} />
            <Route path="/ruta" element={<OptimizedRoutePage />} />
            <Route path="/ruta-mensajero/:id" element={<CourierRoutePage />} />

            {/* Alias claros */}
            <Route path="/seguimiento-rutas" element={<RouteTrackingPage />} />
            <Route path="/seguimiento" element={<Navigate to="/seguimiento-rutas" replace />} />
            <Route path="/alertas-sla" element={<SLAAlertsPage />} />
            <Route path="/alertas" element={<Navigate to="/alertas-sla" replace />} />

            {/* Equipo visible (sin cambiar planes/billing) */}
            <Route path="/equipo" element={<CompanyUsersPage />} />

            {/* SIEMPRE al final */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </>
        )}

        {/* OPERADOR */}
        {usuario && rol === "operador" && (
          <>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/ordenes" element={<UnifiedOrdersPage />} />

            {/* Detalle / Mapa / Selección */}
            <Route path="/orden/:id" element={<OrderDetailsPage />} />
            <Route path="/mapa/:id" element={<CourierMapPage />} />
            <Route path="/mapa-multi-stop/:id" element={<MultiStopCourierMapPage />} />
            <Route path="/ruta-mensajero/:id" element={<CourierRoutePage />} />
            <Route path="/seleccionar-destino/:id" element={<SelectDestinationPage />} />

            {/* Crear / Editar orden - now handled in UnifiedOrdersPage */}
            {/* <Route path="/orden/nueva" element={<OrderFormPage />} />
            <Route path="/orden/:id/editar" element={<OrderFormPage />} /> */}

            <Route path="/reportes" element={<ReportsPage />} />
            <Route path="/programas" element={<ScheduleDeliveriesPage />} />

            {/* Alias claros */}
            <Route path="/seguimiento-rutas" element={<RouteTrackingPage />} />
            <Route path="/seguimiento" element={<Navigate to="/seguimiento-rutas" replace />} />
            <Route path="/alertas-sla" element={<SLAAlertsPage />} />
            <Route path="/alertas" element={<Navigate to="/alertas-sla" replace />} />

            {/* SIEMPRE al final */}
            <Route path="*" element={<Navigate to="/ordenes" replace />} />
          </>
        )}

        {/* MENSAJERO */}
        {usuario && rol === "mensajero" && (
          <>
            <Route path="/entregas" element={<DeliveriesPage />} />
            <Route path="/orden/:id" element={<OrderDetailsPage />} />
            <Route path="/mapa/:id" element={<CourierMapPage />} />
            <Route path="/mapa-multi-stop/:id" element={<MultiStopCourierMapPage />} />
            <Route path="/seleccionar-destino/:id" element={<SelectDestinationPage />} />
            <Route path="/ruta-mensajero/:id" element={<CourierRoutePage />} />
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
      <Rutas />
    </Router>
  );
}
