function ETA() {
  // Datos simulados de entregas
  const entregas = [
    { id: 1, parada: "Av. Duarte #120", producto: "Paquete 1", eta: "12:45 PM" },
    { id: 2, parada: "Calle 15 de Agosto", producto: "Paquete 2", eta: "1:10 PM" },
    { id: 3, parada: "Zona Franca, Nave 4", producto: "Paquete 3", eta: "1:40 PM" },
  ];

  return (
    <div>
      <h2>Hora Estimada de Llegada (ETA)</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Parada</th>
            <th>Producto</th>
            <th>ETA</th>
          </tr>
        </thead>
        <tbody>
          {entregas.map((entrega) => (
            <tr key={entrega.id}>
              <td>{entrega.id}</td>
              <td>{entrega.parada}</td>
              <td>{entrega.producto}</td>
              <td>{entrega.eta}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ETA;
