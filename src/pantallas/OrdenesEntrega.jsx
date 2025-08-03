import { useState, useEffect } from "react";

function OrdenesEntrega() {
  const [cliente, setCliente] = useState("");
  const [producto, setProducto] = useState("");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [ordenes, setOrdenes] = useState([]);
  const [filtroFecha, setFiltroFecha] = useState("");

  const [ordenEnEdicion, setOrdenEnEdicion] = useState(null);
  const [editCliente, setEditCliente] = useState("");
  const [editProducto, setEditProducto] = useState("");
  const [editMonto, setEditMonto] = useState("");

  const usuarioActivo = JSON.parse(localStorage.getItem("usuarioActivo"));
  const rol = usuarioActivo?.rol;

  useEffect(() => {
  const cargarOrdenes = () => {
    const ordenesGuardadas = JSON.parse(localStorage.getItem("ordenesEntrega")) || [];
    setOrdenes(ordenesGuardadas);
  };

  // Cargar inicialmente
  cargarOrdenes();

  // Escuchar cambios en localStorage
  window.addEventListener("storage", cargarOrdenes);

  return () => {
    window.removeEventListener("storage", cargarOrdenes);
  };
}, []);


  const registrarOrden = () => {
    if (!cliente || !producto || !monto || !fecha || !hora) {
      alert("Por favor completa todos los campos.");
      return;
    }

    const nuevaOrden = {
      id: Date.now(),
      cliente,
      producto,
      monto,
      fecha,
      hora,
      entregado: false,
      recibida: false,
      fechaRecibida: null,
      usuario: usuarioActivo?.nombre,
    };

    const nuevasOrdenes = [...ordenes, nuevaOrden];
    setOrdenes(nuevasOrdenes);
    localStorage.setItem("ordenesEntrega", JSON.stringify(nuevasOrdenes));
    setCliente("");
    setProducto("");
    setMonto("");
    setFecha("");
    setHora("");
  };

  const marcarComoEntregado = (id) => {
    const actualizadas = ordenes.map((orden) =>
      orden.id === id ? { ...orden, entregado: true } : orden
    );
    setOrdenes(actualizadas);
    localStorage.setItem("ordenesEntrega", JSON.stringify(actualizadas));
  };

  const marcarComoRecibida = (id) => {
    const usuarioActivo = JSON.parse(localStorage.getItem("usuarioActivo"));

    const actualizadas = ordenes.map((orden) =>
      orden.id === id
        ? {
            ...orden,
            recibida: true,
            fechaRecibida: new Date().toLocaleString(),
            mensajero: usuarioActivo?.nombre || "sin nombre",
          }
        : orden
    );

    setOrdenes(actualizadas);
    localStorage.setItem("ordenesEntrega", JSON.stringify(actualizadas));
  };

  const eliminarOrden = (id) => {
    const nuevasOrdenes = ordenes.filter((orden) => orden.id !== id);
    setOrdenes(nuevasOrdenes);
    localStorage.setItem("ordenesEntrega", JSON.stringify(nuevasOrdenes));
  };

  const editarOrden = (orden) => {
    setOrdenEnEdicion(orden.id);
    setEditCliente(orden.cliente);
    setEditProducto(orden.producto);
    setEditMonto(orden.monto);
  };

  const guardarEdicion = () => {
    const usuarioEditor = prompt("Nombre del usuario que edita:");
    const fechaHora = new Date().toLocaleString();

    const nuevasOrdenes = ordenes.map((orden) => {
      if (orden.id === ordenEnEdicion) {
        const cambios = [];

        if (orden.cliente !== editCliente) cambios.push("cliente");
        if (orden.producto !== editProducto) cambios.push("producto");
        if (orden.monto !== editMonto) cambios.push("monto");

        const nuevoHistorial = [
          ...(orden.historial || []),
          { usuario: usuarioEditor, fechaHora, cambios },
        ];

        return {
          ...orden,
          cliente: editCliente,
          producto: editProducto,
          monto: editMonto,
          historial: nuevoHistorial,
        };
      }
      return orden;
    });

    setOrdenes(nuevasOrdenes);
    localStorage.setItem("ordenesEntrega", JSON.stringify(nuevasOrdenes));
    setOrdenEnEdicion(null);
  };

  const ordenesFiltradas = filtroFecha
    ? ordenes.filter((orden) => orden.fecha === filtroFecha)
    : ordenes;

  return (
    <div>
      <h2>Registrar Orden de Entrega</h2>
      <input type="text" placeholder="Cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} />
      <input type="text" placeholder="Producto" value={producto} onChange={(e) => setProducto(e.target.value)} />
      <input type="number" placeholder="Monto" value={monto} onChange={(e) => setMonto(e.target.value)} />
      <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
      {(rol === "operador" || rol === "admin") && (
        <button onClick={registrarOrden}>Registrar</button>
      )}

      <h3>Filtrar por Fecha</h3>
      <input type="date" value={filtroFecha} onChange={(e) => setFiltroFecha(e.target.value)} />

      <h3>Órdenes Registradas</h3>
      <ul>
        {ordenesFiltradas.map((orden) => (
          <li key={orden.id}>
            Fecha: {orden.fecha} {orden.hora} | Cliente: {orden.cliente} | Producto: {orden.producto} | Monto: ${orden.monto} | <strong>Registrado por:</strong> {orden.usuario} |{" "}
            {orden.entregado ? (
  <>
    <span>Entregado</span>{" "}
    {orden.recibida ? (
      <span style={{ marginLeft: "10px" }}>
        ✅ Recibida por: {orden.mensajero} ({orden.fechaRecibida})
      </span>
    ) : (
      rol === "mensajero" && (
        <button onClick={() => marcarComoRecibida(orden.id)}>
          Marcar como Recibida
        </button>
      )
    )}
  </>
) : (
  (rol === "operador" || rol === "admin") && (
    <>
      <button onClick={() => marcarComoEntregado(orden.id)}>Marcar como Entregado</button>{" "}
      <button onClick={() => editarOrden(orden)}>Editar</button>
      <button onClick={() => eliminarOrden(orden.id)}>Eliminar</button>
    </>
  )
)}

            {(rol === "operador" || rol === "admin") && !orden.entregado && (
              <>
                <button onClick={() => editarOrden(orden)}>Editar</button>
                <button onClick={() => eliminarOrden(orden.id)}>Eliminar</button>
              </>
            )}

            {orden.historial && (
              <div style={{ fontSize: "0.8em", marginTop: "5px", color: "gray" }}>
                <strong>Historial:</strong>
                <ul>
                  {orden.historial.map((h, i) => (
                    <li key={i}>
                      [{h.fechaHora}] {h.usuario} cambió {h.cambios.join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>

      {filtroFecha && (
        <div style={{ marginTop: "20px" }}>
          <h4>Resumen del día</h4>
          <p>Total órdenes: {ordenesFiltradas.length}</p>
          <p>Entregadas: {ordenesFiltradas.filter((o) => o.entregado).length}</p>
          <p>Pendientes: {ordenesFiltradas.filter((o) => !o.entregado).length}</p>
        </div>
      )}

      {ordenEnEdicion && (
        <div style={{ marginTop: "20px", border: "1px solid gray", padding: "10px" }}>
          <h4>Editar Orden</h4>
          <input
            type="text"
            placeholder="Cliente"
            value={editCliente}
            onChange={(e) => setEditCliente(e.target.value)}
          />
          <input
            type="text"
            placeholder="Producto"
            value={editProducto}
            onChange={(e) => setEditProducto(e.target.value)}
          />
          <input
            type="number"
            placeholder="Monto"
            value={editMonto}
            onChange={(e) => setEditMonto(e.target.value)}
          />
          <button onClick={guardarEdicion}>Guardar Cambios</button>
          <button onClick={() => setOrdenEnEdicion(null)}>Cancelar</button>
        </div>
      )}
    </div>
  );
}

export default OrdenesEntrega;


