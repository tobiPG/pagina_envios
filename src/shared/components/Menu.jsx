import { Link, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import ThemeSwitch from "./ThemeSwitch";
import PlanBadge from "./PlanBadge";
import { usePlanGate } from "../hooks/usePlanGate";

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
    gerente: "gerente",
    manager: "gerente",
  };
  return map[r] || r;
}

export default function Menu() {
  let usuario = null;
  try { usuario = JSON.parse(localStorage.getItem("usuarioActivo") || "null"); } catch {}
  const rol = normalizeRole(usuario?.rol);
  const location = useLocation();

  const isAdminOrOp = rol === "administrador" || rol === "operador";

  const planGate = usePlanGate();
  const nuevaOrdenBloqueada = !!planGate?.blocked;

  // estado dropdown
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  // cierra al cambiar de ruta
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // cierra al hacer clic fuera
  useEffect(() => {
    function onClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const isActive = (to, { prefixes = [], exact = true } = {}) => {
    const path = location.pathname || "/";
    if (!exact && path.startsWith(to)) return true;
    if (prefixes.some(p => path.startsWith(p))) return true;
    return path === to;
  };

  const Item = ({ to, children, activePrefixes = [], exact = true }) => {
    const active = isActive(to, { prefixes: activePrefixes, exact });
    return (
      <Link
        to={to}
        style={{
          display: "block",
          textDecoration: "none",
          padding: "8px 12px",
          borderRadius: 8,
          fontWeight: active ? 700 : 500,
          background: active ? "var(--menu-active-bg, #f3f4f6)" : "transparent"
        }}
      >
        {children}
      </Link>
    );
  };

  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: 10,
        borderBottom: "1px solid #050505ff",
        background: "var(--menu-bg, #ffffffff)",
        position: "sticky",
        top: 0,
        zIndex: 10
      }}
    >
      {/* Izquierda: solo Dashboard + botón Menú */}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {/* Siempre visible */}
        {(rol === "administrador" || rol === "operador" || rol === "gerente") && (
          <Link
            to="/dashboard"
            style={{
              textDecoration: "none",
              padding: "6px 10px",
              borderRadius: 8,
              fontWeight: isActive("/dashboard") ? 700 : 500,
              background: isActive("/dashboard") ? "var(--menu-active-bg, #f3f4f6)" : "transparent"
            }}
          >
            Dashboard
          </Link>
        )}

        {/* Botón Menú (despliega todas las secciones según rol) */}
        <div ref={dropdownRef} style={{ position: "relative" }}>
          <button
            onClick={() => setOpen(o => !o)}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #000000ff",
              background: "#56a299ff",
              cursor: "pointer",
              fontWeight: 600
            }}
            aria-expanded={open}
            aria-haspopup="menu"
          >
            Menú ▾
          </button>

          {open && (
            <div
              role="menu"
              style={{
                position: "absolute",
                top: "110%",
                left: 0,
                minWidth: 260,
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
                padding: 8
              }}
            >
              {/* OPERADOR */}
              {rol === "operador" && (
                <>
                  <Item to="/ordenes" exact={false} activePrefixes={["/orden/", "/orden/nueva", "/seleccionar-destino/"]}>📦 Gestión de Órdenes</Item>
                  <Item to="/programas">🚚 Programar Entregas</Item>
                  <Item to="/seguimiento-rutas" exact={false} activePrefixes={["/seguimiento"]}>🚦 Seguimiento de Rutas</Item>
                  <Item to="/alertas-sla" exact={false} activePrefixes={["/alertas"]}>📣 Alertas SLA</Item>
                  <Item to="/estadisticas-operador">📈 Estadísticas de Operador</Item>
                  <Item to="/reportes">📑 Reportes</Item>
                  <Item to="/planes">💳 Planes</Item>
                </>
              )}

              {/* MENSAJERO */}
              {rol === "mensajero" && (
                <>
                  <Item to="/entregas" exact={false} activePrefixes={["/orden/", "/ruta-mensajero/"]}>📝 Órdenes Pendientes</Item>
                </>
              )}

              {/* ADMINISTRADOR */}
              {rol === "administrador" && (
                <>
                  <Item to="/estadisticas">📊 Estadísticas</Item>
                  <Item to="/ordenes" exact={false} activePrefixes={["/orden/", "/orden/nueva", "/seleccionar-destino/"]}>📦 Gestión de Órdenes</Item>
                  <Item to="/programas">🚚 Programar Entregas</Item>
                  <Item to="/seguimiento-rutas" exact={false} activePrefixes={["/seguimiento"]}>🚦 Seguimiento de Rutas</Item>
                  <Item to="/alertas-sla" exact={false} activePrefixes={["/alertas"]}>📣 Alertas SLA</Item>
                  <Item to="/historial">📜 Historial</Item>
                  <Item to="/estadisticas-operador">📈 Estadísticas de Operador</Item>
                  <Item to="/mapa-mensajeros" exact={false} activePrefixes={["/mapa/"]}>🗺️ Mapa de Mensajeros</Item>
                  <Item to="/reportes">📑 Reportes</Item>
                  <Item to="/planes">💳 Planes</Item>
                  <Item to="/equipo">👥 Equipo</Item>
                </>
              )}

              {/* GERENTE */}
              {rol === "gerente" && (
                <>
                  <Item to="/estadisticas">📊 Estadísticas</Item>
                  <Item to="/ordenes" exact={false} activePrefixes={["/orden/", "/seleccionar-destino/"]}>📦 Órdenes de Entrega</Item>
                  <Item to="/seguimiento-rutas" exact={false} activePrefixes={["/seguimiento"]}>🚦 Seguimiento de Rutas</Item>
                  <Item to="/alertas-sla" exact={false} activePrefixes={["/alertas"]}>📣 Alertas SLA</Item>
                  <Item to="/historial">📜 Historial</Item>
                  <Item to="/estadisticas-operador">📈 Estadísticas de Operador</Item>
                  <Item to="/mapa-mensajeros" exact={false} activePrefixes={["/mapa/"]}>🗺️ Mapa de Mensajeros</Item>
                  <Item to="/reportes">📑 Reportes</Item>
                  <Item to="/equipo">👥 Equipo</Item>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Derecha: PlanBadge, Nueva orden (si aplica), Tema, Logout */}
      <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
        <PlanBadge />

        {isAdminOrOp && (
          <Link
            to={nuevaOrdenBloqueada ? "/planes" : "/ordenes"}
            onClick={(e) => {
              if (nuevaOrdenBloqueada) {
                e.preventDefault();
                window.alert("Alcanzaste el límite de órdenes del plan. Revisa/actualiza tu plan.");
              }
            }}
            style={{
              textDecoration: "none",
              padding: "8px 12px",
              borderRadius: 10,
              background: nuevaOrdenBloqueada ? "#000000ff" : "#221fd3ff",
              color: "#69b1adff",
              border: "1px solid " + (nuevaOrdenBloqueada ? "#5b6677ff" : "#345baeff"),
              fontWeight: 600,
              cursor: "pointer",
              opacity: nuevaOrdenBloqueada ? 0.85 : 1
            }}
            title={nuevaOrdenBloqueada ? "Límite alcanzado" : "Crear una nueva orden"}
          >
            + Nueva orden
          </Link>
        )}

        <ThemeSwitch />
        <button
          onClick={() => {
            localStorage.removeItem("usuarioActivo");
            window.location.href = "/";
          }}
          style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #000000ff", background: "#810606ff", cursor: "pointer", color: "#fff" }}
        >
          Cerrar sesión
        </button>
      </div>
    </nav>
  );
}
