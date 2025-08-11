// src/pantallas/HistorialCambios.jsx
import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../firebaseConfig";

export default function HistorialCambios() {
  const [cambios, setCambios] = useState([]);

  useEffect(() => {
    // Lee la colección historialCambios en tiempo real, ordenada por fecha/hora
    const ref = collection(db, "historialCambios");
    const q = query(ref, orderBy("ts", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCambios(data);
    });
    return () => unsub();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2>📜 Historial de Cambios</h2>

      <table border="1" cellPadding="8" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead style={{ background: "#f0f0f0" }}>
          <tr>
            <th>Fecha/Hora</th>
            <th>Usuario</th>
            <th>Rol</th>
            <th>Orden</th>
            <th>Cambios</th>
          </tr>
        </thead>
        <tbody>
          {cambios.length === 0 && (
            <tr>
              <td colSpan="5" style={{ textAlign: "center" }}>
                No hay cambios registrados
              </td>
            </tr>
          )}

          {cambios.map((cambio) => (
            <tr key={cambio.id}>
              <td>{fmtTs(cambio.ts)}</td>
              <td>{cambio.actorNombre || "Desconocido"}</td>
              <td>{cambio.actorRol || "-"}</td>
              <td>{cambio.orderId}{cambio?.meta?.cliente ? ` — ${cambio.meta.cliente}` : ""}</td>
              <td>
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {cambio.cambios?.map((c, i) => (
                    <li key={i}>
                      <b>{c.campo}</b>: <i>{valStr(c.antes)}</i> → <i>{valStr(c.despues)}</i>
                    </li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fmtTs(ts) {
  if (!ts) return "N/D";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString();
  } catch {
    return "N/D";
  }
}

function valStr(v) {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}
