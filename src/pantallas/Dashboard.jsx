import React, { useEffect, useState } from "react";

function Dashboard() {
  const [resumen, setResumen] = useState({
    totalOrdenes: 0,
    totalProductos: 0,
    totalClientes: 0,
    ultimaEntrega: "No disponible",
  });

  useEffect(() => {
    const ordenes = JSON.parse(localStorage.getItem("ordenesEntrega")) || [];
    const productos = JSON.parse(localStorage.getItem("productos")) || [];
    const clientes = JSON.parse(localStorage.getItem("clientes")) || [];

    const ultimaEntrega = ordenes.length > 0 ? ordenes[ordenes.length - 1].fecha : "No disponible";

    setResumen({
      totalOrdenes: ordenes.length,
      totalProductos: productos.length,
      totalClientes: clientes.length,
      ultimaEntrega,
    });
  }, []);

  return (
    <div style={{ padding: "20px" }}>
      <h2>Resumen de Entregas</h2>
      <div style={{ display: "flex", gap: "20px", marginTop: "20px" }}>
        <div style={cardStyle}>
          <h3>Total Órdenes</h3>
          <p>{resumen.totalOrdenes}</p>
        </div>
        <div style={cardStyle}>
          <h3>Total Productos</h3>
          <p>{resumen.totalProductos}</p>
        </div>
        <div style={cardStyle}>
          <h3>Total Clientes</h3>
          <p>{resumen.totalClientes}</p>
        </div>
        <div style={cardStyle}>
          <h3>Última Entrega</h3>
          <p>{resumen.ultimaEntrega}</p>
        </div>
      </div>
    </div>
  );
}

const cardStyle = {
  background: "#f0f0f0",
  padding: "20px",
  borderRadius: "8px",
  flex: 1,
  boxShadow: "0 2px 5px rgba(0, 0, 0, 0.1)",
  textAlign: "center",
};

export default Dashboard;
