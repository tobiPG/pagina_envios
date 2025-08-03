import { useState } from "react";

function RegistroClientes() {
  const [cliente, setCliente] = useState({
    nombre: "",
    direccion: "",
    telefono: "",
    codigo: ""
  });

  const handleChange = (e) => {
    setCliente({
      ...cliente,
      [e.target.name]: e.target.value
    });
  };

  const guardarCliente = () => {
  if (cliente.nombre && cliente.direccion && cliente.telefono && cliente.codigo) {
    const clientesExistentes = JSON.parse(localStorage.getItem("clientes")) || [];
    clientesExistentes.push(cliente);
    localStorage.setItem("clientes", JSON.stringify(clientesExistentes));
    alert("Cliente guardado correctamente");
    setCliente({ nombre: "", direccion: "", telefono: "", codigo: "" });
  } else {
    alert("Por favor, complete todos los campos");
  }
};


  return (
    <div>
      <h2>Registro de Clientes</h2>
      <input
        type="text"
        name="nombre"
        placeholder="Nombre"
        value={cliente.nombre}
        onChange={handleChange}
      />
      <input
        type="text"
        name="direccion"
        placeholder="Dirección"
        value={cliente.direccion}
        onChange={handleChange}
      />
      <input
        type="text"
        name="telefono"
        placeholder="Teléfono"
        value={cliente.telefono}
        onChange={handleChange}
      />
      <input
        type="text"
        name="codigo"
        placeholder="Código"
        value={cliente.codigo}
        onChange={handleChange}
      />
      <button onClick={guardarCliente}>Guardar Cliente</button>
    </div>
  );
}

export default RegistroClientes;
