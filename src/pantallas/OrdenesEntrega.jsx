// src/pantallas/OrdenesEntrega.jsx
import { useEffect, useMemo, useState } from "react";
import { db } from "../firebaseConfig";
import {
  collection,
  addDoc,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import AddressInput from "../components/AddressInput.jsx";
import { logCambioOrden } from "../utils/logCambios";

export default function OrdenesEntrega() {
  // ===== Formulario de creación =====
  const [cliente, setCliente] = useState("");
  const [telefono, setTelefono] = useState("");
  const [numeroFactura, setNumeroFactura] = useState("");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [address, setAddress] = useState(null);

  // ===== Estado general (SIEMPRE desde Firestore) =====
  const [ordenes, setOrdenes] = useState([]);
  const [filtroFecha, setFiltroFecha] = useState("");

  // ===== Edición =====
  const [ordenEnEdicion, setOrdenEnEdicion] = useState(null);
  const [editCliente, setEditCliente] = useState("");
  const [editTelefono, setEditTelefono] = useState("");
  const [editNumeroFactura, setEditNumeroFactura] = useState("");
  const [editMonto, setEditMonto] = useState("");
  const [editAddress, setEditAddress] = useState(null);

  // ===== Mensajeros activos (para asignar) =====
  const [mensajeros, setMensajeros] = useState([]);

  const usuarioActivo = useMemo(
    () => JSON.parse(localStorage.getItem("usuarioActivo") || "null"),
    []
  );
  const rol = usuarioActivo?.rol;

  // ===== Suscripción en tiempo real a Firestore (ordenes) =====
  useEffect(() => {
    const ref = collection(db, "ordenes");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setOrdenes(arr);
      },
      (err) => {
        console.error("onSnapshot(ordenes):", err);
        alert("No se pudieron leer órdenes (revisa reglas/conexión).");
      }
    );
    return () => unsub();
  }, []);

  // ===== Suscripción a mensajeros activos (ubicacionesMensajeros) =====
  useEffect(() => {
    const ref = collection(db, "ubicacionesMensajeros");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const arr = snap.docs.map((d) => {
          const data = d.data() || {};
          return {
            id: d.id,
            nombre: data.nombre || d.id,
          };
        });
        setMensajeros(arr);
      },
      (err) => {
        console.error("onSnapshot(ubicacionesMensajeros):", err);
      }
    );
    return () => unsub();
  }, []);

  // ===== Helpers =====
  function getActor() {
    const u = JSON.parse(localStorage.getItem("usuarioActivo") || "null");
    return {
      id: u?.id || u?.uid || null,
      nombre: u?.nombre || u?.usuario || "desconocido",
      rol: u?.rol || "desconocido",
    };
  }

  // ===== Crear Orden (Firestore) =====
  const registrarOrden = async () => {
    if (!cliente || !telefono || !numeroFactura || !monto || !fecha || !hora || !address) {
      alert("Completa cliente, teléfono, factura, monto, fecha, hora y dirección.");
      return;
    }

    const nuevaOrden = {
      cliente,
      telefono,
      numeroFactura,
      monto,
      fecha,
      hora,

      // Dirección + coordenadas exactas
      address, // { formatted, lat, lng, ... }
      destinoLat: Number(address.lat),
      destinoLng: Number(address.lng),
      direccionTexto: address.formatted,

      // Estados
      entregado: false,
      recibida: false,
      fechaRecibida: null,
      fechaEntregada: null,
      tiempoTotalEntrega: null,

      // Asignación
      asignadoUid: null,
      asignadoNombre: null,

      // Auditoría
      usuario: usuarioActivo?.nombre || "desconocido",
      rolUsuario: rol || "desconocido",
      createdAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, "ordenes"), nuevaOrden);

      // limpiar form
      setCliente("");
      setTelefono("");
      setNumeroFactura("");
      setMonto("");
      setFecha("");
      setHora("");
      setAddress(null);

      alert("Orden registrada en Firestore ✅");
    } catch (e) {
      console.error("❌ Error subiendo a Firestore:", e);
      alert("No pude guardar en Firestore. Revisa tu firebaseConfig o las reglas.");
    }
  };

  // ===== Asignar orden a mensajero =====
  async function asignarOrden(orderId, mensajeroId) {
    try {
      const m = mensajeros.find((x) => x.id === mensajeroId);
      await updateDoc(doc(db, "ordenes", orderId), {
        asignadoUid: mensajeroId,
        asignadoNombre: m?.nombre || mensajeroId,
        asignadoAt: serverTimestamp(),
      });
      alert("Orden asignada ✅");
    } catch (e) {
      console.error("Asignar:", e);
      alert("No pude asignar la orden.");
    }
  }

  // ===== Cambiar estado: Recibida / Entregada (Firestore + log) =====
  const marcarComoRecibida = async (id) => {
    const actor = getActor();
    const orden = ordenes.find((o) => o.id === id);
    if (!orden) return;

    const antes = { ...orden };
    const despues = { ...orden, recibida: true, fechaRecibida: serverTimestamp() };

    try {
      await updateDoc(doc(db, "ordenes", id), {
        recibida: true,
        fechaRecibida: serverTimestamp(),
      });
      await logCambioOrden({ orderId: id, antes, despues, actor });
    } catch (e) {
      console.error("Recibida:", e);
      alert("No pude marcar como recibida.");
    }
  };

  const marcarComoEntregado = async (id) => {
    const actor = getActor();
    const orden = ordenes.find((o) => o.id === id);
    if (!orden) return;

    // calcular minutos desde fechaRecibida si existe
    let minutos = null;
    try {
      const fr = orden.fechaRecibida?.toDate ? orden.fechaRecibida.toDate().getTime() : null;
      if (fr) minutos = ((Date.now() - fr) / 60000).toFixed(2);
    } catch {}

    const antes = { ...orden };
    const despues = {
      ...orden,
      entregado: true,
      fechaEntregada: serverTimestamp(),
      tiempoTotalEntrega: minutos,
    };

    try {
      await updateDoc(doc(db, "ordenes", id), {
        entregado: true,
        fechaEntregada: serverTimestamp(),
        tiempoTotalEntrega: minutos,
      });
      await logCambioOrden({ orderId: id, antes, despues, actor });
    } catch (e) {
      console.error("Entregada:", e);
      alert("No pude marcar como entregada.");
    }
  };

  // ===== Edición =====
  const editarOrden = (orden) => {
    setOrdenEnEdicion(orden.id);
    setEditCliente(orden.cliente);
    setEditTelefono(orden.telefono || "");
    setEditNumeroFactura(orden.numeroFactura);
    setEditMonto(orden.monto);
    setEditAddress(orden.address || null);
  };

  const guardarEdicion = async () => {
    if (!ordenEnEdicion) return;
    const actor = getActor();
    const orden = ordenes.find((o) => o.id === ordenEnEdicion);
    if (!orden) return;

    const antes = { ...orden };
    const cambios = {
      cliente: editCliente,
      telefono: editTelefono,
      numeroFactura: editNumeroFactura,
      monto: editMonto,
      address: editAddress,
      destinoLat: editAddress ? Number(editAddress.lat) : null,
      destinoLng: editAddress ? Number(editAddress.lng) : null,
      direccionTexto: editAddress?.formatted || orden.direccionTexto || null,
    };
    const despues = { ...orden, ...cambios };

    try {
      await updateDoc(doc(db, "ordenes", ordenEnEdicion), cambios);
      await logCambioOrden({ orderId: ordenEnEdicion, antes, despues, actor });

      setOrdenEnEdicion(null);
      alert("Orden actualizada ✅");
    } catch (e) {
      console.error("Editar:", e);
      alert("No pude actualizar la orden.");
    }
  };

  // ===== Render =====
  const ordenesFiltradas = filtroFecha
    ? ordenes.filter((orden) => orden.fecha === filtroFecha)
    : ordenes;

  return (
    <div style={{ padding: 20 }}>
      <h2>Registrar Orden de Entrega</h2>

      {/* Formulario de creación */}
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(3, minmax(220px, 1fr))" }}>
        <input type="text" placeholder="Cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} />
        <input type="text" placeholder="Teléfono del cliente" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        <input type="text" placeholder="Número de Factura" value={numeroFactura} onChange={(e) => setNumeroFactura(e.target.value)} />
        <input type="number" placeholder="Monto" value={monto} onChange={(e) => setMonto(e.target.value)} />
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
      </div>

      <div style={{ marginTop: 10 }}>
        <label style={{ display: "block", marginBottom: 6 }}><b>Dirección (escribir, mapa o importar link)</b></label>
        <AddressInput value={address} onChange={setAddress} />
      </div>

      {(rol === "operador" || rol === "administrador") && (
        <button style={{ marginTop: 10 }} onClick={registrarOrden}>Registrar</button>
      )}

      <h3 style={{ marginTop: 20 }}>Filtrar por Fecha</h3>
      <input type="date" value={filtroFecha} onChange={(e) => setFiltroFecha(e.target.value)} />

      <h3 style={{ marginTop: 20 }}>Órdenes (tiempo real)</h3>
      <ul>
        {ordenesFiltradas.map((orden) => {
          const estado = orden.entregado ? "ENTREGADA" : orden.recibida ? "RECIBIDA" : "PENDIENTE";
          const lat = orden.destinoLat ?? orden.address?.lat;
          const lng = orden.destinoLng ?? orden.address?.lng;

          return (
            <li key={orden.id} style={{ marginBottom: 12 }}>
              Fecha: {orden.fecha} {orden.hora} | Cliente: {orden.cliente} | Tel: {orden.telefono || "—"} | Nº Factura: {orden.numeroFactura} | Monto: ${orden.monto} |{" "}
              Dirección: {orden.direccionTexto || orden.address?.formatted || "—"} | Coords: {lat != null && lng != null ? `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}` : "—"} |{" "}
              Registrado por: {orden.usuario} | Estado: <b>{estado}</b>{" "}

              {orden.entregado ? (
                <span> | ✅ Entregado</span>
              ) : orden.recibida ? (
                (rol === "administrador" || rol === "mensajero") && (
                  <button style={{ marginLeft: 8 }} onClick={() => marcarComoEntregado(orden.id)}>
                    Marcar como Entregado
                  </button>
                )
              ) : (
                (rol === "administrador" || rol === "mensajero") && (
                  <button style={{ marginLeft: 8 }} onClick={() => marcarComoRecibida(orden.id)}>
                    Orden Recibida
                  </button>
                )
              )}

              {(rol === "operador" || rol === "administrador") && !orden.entregado && (
                <>
                  <button style={{ marginLeft: 8 }} onClick={() => editarOrden(orden)}>Editar</button>

                  {/* Selector para asignar mensajero */}
                  <div style={{ marginTop: 6, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                    <span style={{ fontSize: 12, color: "#555" }}>
                      Asignado a: <b>{orden.asignadoNombre || "— Sin asignar —"}</b>
                    </span>

                    <select
                      onChange={(e) => asignarOrden(orden.id, e.target.value)}
                      defaultValue=""
                      style={{ padding: 4 }}
                    >
                      <option value="" disabled>Seleccionar mensajero…</option>
                      {mensajeros.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {filtroFecha && (
        <div style={{ marginTop: 20 }}>
          <h4>Resumen del día</h4>
          <p>Total órdenes: {ordenesFiltradas.length}</p>
          <p>Entregadas: {ordenesFiltradas.filter((o) => o.entregado).length}</p>
          <p>Pendientes: {ordenesFiltradas.filter((o) => !o.entregado).length}</p>
        </div>
      )}

      {ordenEnEdicion && (
        <div style={{ marginTop: 20, border: "1px solid #ccc", padding: 10, borderRadius: 6 }}>
          <h4>Editar Orden</h4>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(3, minmax(220px,1fr))" }}>
            <input type="text" placeholder="Cliente" value={editCliente} onChange={(e) => setEditCliente(e.target.value)} />
            <input type="text" placeholder="Teléfono" value={editTelefono} onChange={(e) => setEditTelefono(e.target.value)} />
            <input type="text" placeholder="Número de Factura" value={editNumeroFactura} onChange={(e) => setEditNumeroFactura(e.target.value)} />
            <input type="number" placeholder="Monto" value={editMonto} onChange={(e) => setEditMonto(e.target.value)} />
          </div>

          <div style={{ marginTop: 10 }}>
            <label style={{ display: "block", marginBottom: 6 }}><b>Dirección</b></label>
            <AddressInput value={editAddress} onChange={setEditAddress} />
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button onClick={guardarEdicion}>Guardar Cambios</button>
            <button onClick={() => setOrdenEnEdicion(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
