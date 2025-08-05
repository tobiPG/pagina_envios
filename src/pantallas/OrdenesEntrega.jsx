import { useState, useEffect } from "react";
import { rutasPredefinidas } from "../data/rutasPredefinidas"; // 📌 Importamos las rutas

function OrdenesEntrega() {
  const [cliente, setCliente] = useState("");
  const [numeroFactura, setNumeroFactura] = useState(""); // 📌 cambiado
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [rutaSeleccionada, setRutaSeleccionada] = useState("");
  const [ordenes, setOrdenes] = useState([]);
  const [filtroFecha, setFiltroFecha] = useState("");

  const [ordenEnEdicion, setOrdenEnEdicion] = useState(null);
  const [editCliente, setEditCliente] = useState("");
  const [editNumeroFactura, setEditNumeroFactura] = useState(""); // 📌 cambiado
  const [editMonto, setEditMonto] = useState("");

  const usuarioActivo = JSON.parse(localStorage.getItem("usuarioActivo"));
  const rol = usuarioActivo?.rol;

  useEffect(() => {
    const cargarOrdenes = () => {
      const ordenesGuardadas = JSON.parse(localStorage.getItem("ordenesEntrega")) || [];
      setOrdenes(ordenesGuardadas);
    };
    cargarOrdenes();
    window.addEventListener("storage", cargarOrdenes);
    return () => window.removeEventListener("storage", cargarOrdenes);
  }, []);

  const registrarOrden = () => {
    if (!cliente || !numeroFactura || !monto || !fecha || !hora || !rutaSeleccionada) {
      alert("Por favor completa todos los campos.");
      return;
    }

    const nuevaOrden = {
      id: Date.now(),
      cliente,
      numeroFactura, // 📌 cambiado
      monto,
      fecha,
      hora,
      entregado: false,
      recibida: false,
      fechaRecibida: null,
      fechaEntregada: null,
      tiempoTotalEntrega: null,
      rutaId: parseInt(rutaSeleccionada),
      usuario: usuarioActivo?.nombre,
      rolUsuario: rol,
      horaRegistro: new Date().toISOString(),
    };

    const nuevasOrdenes = [...ordenes, nuevaOrden];
    setOrdenes(nuevasOrdenes);
    localStorage.setItem("ordenesEntrega", JSON.stringify(nuevasOrdenes));

    setCliente("");
    setNumeroFactura(""); // 📌 cambiado
    setMonto("");
    setFecha("");
    setHora("");
    setRutaSeleccionada("");
  };

  const marcarComoEntregado = (id) => {
    const actualizadas = ordenes.map((orden) => {
      if (orden.id === id) {
        const fechaEntregada = new Date().toISOString();
        let tiempoTotal = null;
        if (orden.fechaRecibida) {
          const inicio = new Date(orden.fechaRecibida).getTime();
          const fin = new Date(fechaEntregada).getTime();
          tiempoTotal = ((fin - inicio) / 60000).toFixed(2);
        }
        return { ...orden, entregado: true, fechaEntregada, tiempoTotalEntrega: tiempoTotal };
      }
      return orden;
    });
    setOrdenes(actualizadas);
    localStorage.setItem("ordenesEntrega", JSON.stringify(actualizadas));
  };

  const marcarComoRecibida = (id) => {
    const actualizadas = ordenes.map((orden) =>
      orden.id === id
        ? {
            ...orden,
            recibida: true,
            fechaRecibida: new Date().toISOString(),
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
    setEditNumeroFactura(orden.numeroFactura); // 📌 cambiado
    setEditMonto(orden.monto);
  };

  const guardarEdicion = () => {
    const usuarioEditor = prompt("Nombre del usuario que edita:");
    const fechaHora = new Date().toLocaleString();
    const nuevasOrdenes = ordenes.map((orden) => {
      if (orden.id === ordenEnEdicion) {
        const cambios = [];
        if (orden.cliente !== editCliente) cambios.push("cliente");
        if (orden.numeroFactura !== editNumeroFactura) cambios.push("numeroFactura"); // 📌 cambiado
        if (orden.monto !== editMonto) cambios.push("monto");
        const nuevoHistorial = [
          ...(orden.historial || []),
          { usuario: usuarioEditor, fechaHora, cambios },
        ];
        return {
          ...orden,
          cliente: editCliente,
          numeroFactura: editNumeroFactura, // 📌 cambiado
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
      <input type="text" placeholder="Número de Factura" value={numeroFactura} onChange={(e) => setNumeroFactura(e.target.value)} /> {/* 📌 cambiado */}
      <input type="number" placeholder="Monto" value={monto} onChange={(e) => setMonto(e.target.value)} />
      <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />

      <select value={rutaSeleccionada} onChange={(e) => setRutaSeleccionada(e.target.value)}>
        <option value="">Selecciona una ruta</option>
        {rutasPredefinidas.map((ruta) => (
          <option key={ruta.id} value={ruta.id}>
            {ruta.origen} → {ruta.destino}
          </option>
        ))}
      </select>

      {(rol === "operador" || rol === "administrador") && (
        <button onClick={registrarOrden}>Registrar</button>
      )}

      <h3>Filtrar por Fecha</h3>
      <input type="date" value={filtroFecha} onChange={(e) => setFiltroFecha(e.target.value)} />

      <h3>Órdenes Registradas</h3>
      <ul>
        {ordenesFiltradas.map((orden) => (
          <li key={orden.id}>
            Fecha: {orden.fecha} {orden.hora} | Cliente: {orden.cliente} | Nº Factura: {orden.numeroFactura} | {/* 📌 cambiado */}
            Monto: ${orden.monto} | Registrado por: {orden.usuario} |{" "}
            Ruta: {rutasPredefinidas.find(r => r.id === orden.rutaId)?.origen} →
            {rutasPredefinidas.find(r => r.id === orden.rutaId)?.destino}{" "}
            {orden.entregado ? (
              <span>Entregado</span>
            ) : orden.recibida ? (
              (rol === "admin" || rol === "mensajero") && (
                <button onClick={() => marcarComoEntregado(orden.id)}>Marcar como Entregado</button>
              )
            ) : (
              (rol === "admin" || rol === "mensajero") && (
                <button onClick={() => marcarComoRecibida(orden.id)}>Orden Recibida</button>
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
          <input type="text" placeholder="Cliente" value={editCliente} onChange={(e) => setEditCliente(e.target.value)} />
          <input type="text" placeholder="Número de Factura" value={editNumeroFactura} onChange={(e) => setEditNumeroFactura(e.target.value)} /> {/* 📌 cambiado */}
          <input type="number" placeholder="Monto" value={editMonto} onChange={(e) => setEditMonto(e.target.value)} />
          <button onClick={guardarEdicion}>Guardar Cambios</button>
          <button onClick={() => setOrdenEnEdicion(null)}>Cancelar</button>
        </div>
      )}
    </div>
  );
}

export default OrdenesEntrega;
