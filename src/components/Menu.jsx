import { Link } from "react-router-dom";

function Menu() {
  const usuario = JSON.parse(localStorage.getItem("usuarioActivo"));
  const rol = usuario?.rol;

  return (
    <nav>
      <ul>
        {/* Menú para Operador (limpio) */}
        {rol === "operador" && (
          <>
            <li><Link to="/dashboard">Dashboard</Link></li>
            <li><Link to="/ordenes">Órdenes de Entrega</Link></li>
            <li><Link to="/estadisticas-operador">📊 Estadísticas de Operador</Link></li>
          </>
        )}

        {/* Menú para Mensajero (solo pendientes) */}
        {rol === "mensajero" && (
          <>
            <li><Link to="/entregas">Órdenes Pendientes</Link></li>
          </>
        )}

        {/* Menú para Administrador (sin enlaces que no usamos) */}
        {rol === "administrador" && (
          <>
            <li><Link to="/dashboard">Dashboard</Link></li>
            <li><Link to="/estadisticas">📊 Estadísticas</Link></li>
            <li><Link to="/ordenes">Órdenes de Entrega</Link></li>
            <li><Link to="/historial">Historial</Link></li>
            <li><Link to="/estadisticas-operador">📊 Estadísticas de Operador</Link></li>
            <li><Link to="/mapa-mensajeros">🗺️ Mapa de Mensajeros</Link></li>

            {/* Si aún usas estas, avísame y las reactivamos:
                <li><Link to="/clientes">Registrar Clientes</Link></li>
                <li><Link to="/productos">Registrar Productos</Link></li>
                <li><Link to="/eta">Ver Entregas</Link></li>
                <li><Link to="/ruta">Ruta Optimizada</Link></li>
            */}
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
