import { Link } from "react-router-dom";

function Menu() {
  const usuario = JSON.parse(localStorage.getItem("usuarioActivo"));
  const rol = usuario?.rol;

  return (
    <nav>
      <ul>
        {/* Menú para Operador */}
        {rol === "operador" && (
          <>
            <li><Link to="/clientes">Registrar Clientes</Link></li>
            <li><Link to="/numeroFactura">Registrar Productos</Link></li>
            <li><Link to="/ordenes">Órdenes de Entrega</Link></li>
            <li><Link to="/historial">Historial</Link></li>
          </>
        )}

        {/* Menú para Mensajero */}
        {rol === "mensajero" && (
          <>
            <li><Link to="/ordenes">Órdenes Pendientes</Link></li>
            <li><Link to="/eta">Ver Entregas</Link></li>
            <li><Link to="/ruta">Ruta Optimizada</Link></li>
          </>
        )}

        {/* Menú para Administrador */}
        {rol === "administrador" && (
          <>
            <li><Link to="/dashboard">Dashboard</Link></li>
            <li><Link to="/estadisticas">📊 Estadísticas</Link></li> {/* Nuevo botón */}
            <li><Link to="/clientes">Registrar Clientes</Link></li>
            <li><Link to="/numeroFactura">Registrar Productos</Link></li>
            <li><Link to="/ordenes">Órdenes de Entrega</Link></li>
            <li><Link to="/historial">Historial</Link></li>
            <li><Link to="/eta">Ver Entregas</Link></li>
            <li><Link to="/ruta">Ruta Optimizada</Link></li>
            <li><Link to="/estadisticas-operador">📊 Estadísticas de Operador</Link></li>

          </>
        )}
      </ul>
      <button
        onClick={() => {
          localStorage.removeItem("usuarioActivo");
          window.location.href = "/";
        }}
      >
        Cerrar sesión
      </button>
    </nav>
  );
}

export default Menu;
