import { useState } from "react";

function RutaOptimizada() {
  const [entregasSeleccionadas, setEntregasSeleccionadas] = useState([]);

  const entregasDisponibles = [
    { id: 1, direccion: "Av. Bolívar, Santo Domingo" },
    { id: 2, direccion: "Calle El Conde, Zona Colonial" },
    { id: 3, direccion: "Av. Winston Churchill, Piantini" },
  ];

  const toggleEntrega = (id) => {
    setEntregasSeleccionadas((prev) =>
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id]
    );
  };

  const generarRuta = () => {
    const direcciones = entregasSeleccionadas
      .map((id) => {
        const entrega = entregasDisponibles.find((e) => e.id === id);
        return entrega?.direccion;
      })
      .filter(Boolean)
      .join("/");

    return `https://www.google.com/maps/dir/${encodeURI(direcciones)}`;
  };

  return (
    <div>
      <h2>Ruta Optimizada</h2>
      <ul>
        {entregasDisponibles.map((entrega) => (
          <li key={entrega.id}>
            <label>
              <input
                type="checkbox"
                checked={entregasSeleccionadas.includes(entrega.id)}
                onChange={() => toggleEntrega(entrega.id)}
              />
              {entrega.direccion}
            </label>
          </li>
        ))}
      </ul>
      {entregasSeleccionadas.length > 1 && (
        <a href={generarRuta()} target="_blank" rel="noopener noreferrer">
          Ver ruta optimizada en Google Maps
        </a>
      )}
    </div>
  );
}

export default RutaOptimizada;
