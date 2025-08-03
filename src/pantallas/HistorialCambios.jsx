function HistorialCambios() {
  // Datos simulados de ejemplo
  const cambios = [
    { id: 1, accion: "Creó una orden", usuario: "oziel", fecha: "2025-07-21 10:30" },
    { id: 2, accion: "Modificó monto de orden", usuario: "Keny", fecha: "2025-07-21 11:00" },
    { id: 3, accion: "Marcó entrega como realizada", usuario: "Carlos", fecha: "2025-07-21 11:45" },
  ];

  return (
    <div>
      <h2>Historial de Cambios</h2>
      <table>
        <thead>
          <tr>
            <th>Acción</th>
            <th>Usuario</th>
            <th>Fecha</th>
          </tr>
        </thead>
        <tbody>
          {cambios.map((cambio) => (
            <tr key={cambio.id}>
              <td>{cambio.accion}</td>
              <td>{cambio.usuario}</td>
              <td>{cambio.fecha}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default HistorialCambios;
