import { useState } from "react";

function RegistroProductos() {
  const [producto, setProducto] = useState({
    nombre: ""
  });

  const handleChange = (e) => {
    setProducto({
      ...producto,
      [e.target.name]: e.target.value
    });
  };

  const guardarProducto = () => {
    if (producto.nombre) {
      const productosGuardados = JSON.parse(localStorage.getItem("productos")) || [];
      productosGuardados.push(producto);
      localStorage.setItem("productos", JSON.stringify(productosGuardados));
      alert("Producto guardado correctamente");
      setProducto({ nombre: "" });
    } else {
      alert("Por favor, ingrese el nombre del producto");
    }
  };

  return (
    <div>
      <h2>Registro de Productos</h2>
      <input
        type="text"
        name="nombre"
        placeholder="Nombre del producto"
        value={producto.nombre}
        onChange={handleChange}
      />
      <button onClick={guardarProducto}>Guardar Producto</button>
    </div>
  );
}

export default RegistroProductos;
