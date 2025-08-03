import { useState } from "react";
import { useNavigate } from "react-router-dom";

function Login() {
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState("mensajero");
  const navigate = useNavigate();

  const iniciarSesion = () => {
    if (!nombre || !rol) {
      alert("Por favor completa todos los campos");
      return;
    }

    const usuario = { nombre, rol };
    localStorage.setItem("usuarioActivo", JSON.stringify(usuario));

    // Redirección según rol
    switch (rol) {
      case "administrador":
        navigate("/dashboard");
        break;
      case "operador":
        navigate("/ordenes");
        break;
      case "mensajero":
        navigate("/eta");
        break;
      default:
        navigate("/");
    }
  };

  return (
    <div style={{ padding: "20px" }}>
      <h1>Bienvenido al sistema de entregas</h1>
      <input
        type="text"
        placeholder="Nombre de usuario"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        style={{ display: "block", margin: "10px 0" }}
      />
      <select
        value={rol}
        onChange={(e) => setRol(e.target.value)}
        style={{ display: "block", marginBottom: "10px" }}
      >
        <option value="administrador">Administrador</option>
        <option value="operador">Operador</option>
        <option value="mensajero">Mensajero</option>
      </select>
      <button onClick={iniciarSesion}>Iniciar sesión</button>
    </div>
  );
}

export default Login;
