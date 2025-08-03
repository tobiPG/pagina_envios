import { Link } from "react-router-dom";

function Menu() {
  const usuario = JSON.parse(localStorage.getItem("usuarioActivo"));
  const rol = usuario?.rol;

  return (
    <nav>
      <ul>
        {/* Menú común para todos */}
        {rol === "operador" && (
          <>
            <li><Link to="/clientes">Registrar Clientes</Link></li>
            <li><Link to="/productos">Registrar Productos</Link></li>
            <li><Link to="/ordenes">Órdenes de Entrega</Link></li>
            <li><Link to="/historial">Historial</Link></li>
          </>
        )}

        {rol === "mensajero" && (
  <>
    <li><Link to="/ordenes">Órdenes Pendientes</Link></li>
    <li><Link to="/eta">Ver Entregas</Link></li>
    <li><Link to="/ruta">Ruta Optimizada</Link></li>
  </>
)}

        {rol === "admin" && (
          <>
            <li><Link to="/clientes">Registrar Clientes</Link></li>
            <li><Link to="/productos">Registrar Productos</Link></li>
            <li><Link to="/ordenes">Órdenes de Entrega</Link></li>
            <li><Link to="/historial">Historial</Link></li>
            <li><Link to="/eta">Ver Entregas</Link></li>
            <li><Link to="/ruta">Ruta Optimizada</Link></li>
          </>
        )}
      </ul>
      <button onClick={() => {
        localStorage.removeItem("usuarioActivo");
        window.location.href = "/";
      }}>Cerrar sesión</button>
    </nav>
  );
}

export default Menu;

