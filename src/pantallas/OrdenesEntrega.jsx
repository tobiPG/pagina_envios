// src/pantallas/OrdenesEntrega.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebaseConfig";
import {
  collection,
  addDoc,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  setDoc,
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";
import AddressInput from "../components/AddressInput.jsx";
import { logCambioOrden } from "../utils/logCambios";
import { ensureUsuarioActivo } from "../utils/ensureUsuario";

// 👇 Colección permitida por tus reglas
const COLEC = "ordenes";

/** Normaliza alias de roles (igual que en App.jsx) */
function normalizeRole(raw) {
  const r = String(raw || "").trim().toLowerCase();
  const map = {
    admin: "administrador",
    administrador: "administrador",
    administrator: "administrador",
    operador: "operador",
    operator: "operador",
    mensajero: "mensajero",
    rider: "mensajero",
    courier: "mensajero",
    delivery: "mensajero",
    deliveryman: "mensajero",
    repartidor: "mensajero",
  };
  return map[r] || r;
}

// Helpers locales
const toNumOrNull = (v) => {
  const n = typeof v === "number" ? v : v != null ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const getCoords = (o) => {
  const lat = toNumOrNull(o?.destinoLat ?? o?.address?.lat);
  const lng = toNumOrNull(o?.destinoLng ?? o?.address?.lng);
  return { lat, lng };
};
const hasCoords = (o) => {
  const { lat, lng } = getCoords(o);
  return Number.isFinite(lat) && Number.isFinite(lng);
};
const createdMs = (o) => o?.createdAt?.toMillis?.() ?? 0;

export default function OrdenesEntrega() {
  const navigate = useNavigate();

  // ===== Formulario de creación =====
  const [cliente, setCliente] = useState("");
  const [telefono, setTelefono] = useState("");
  const [numeroFactura, setNumeroFactura] = useState("");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [address, setAddress] = useState(null);

  // ===== Estado general =====
  const [ordenes, setOrdenes] = useState([]);
  const [filtroFecha, setFiltroFecha] = useState("");
  const [saving, setSaving] = useState(false);

  // 🔎 Buscador + ordenamiento (todo en memoria)
  const [busqueda, setBusqueda] = useState("");
  const [ordenarPor, setOrdenarPor] = useState("createdDesc"); // createdDesc | createdAsc | estado

  // ===== Edición =====
  const [ordenEnEdicion, setOrdenEnEdicion] = useState(null);
  const [editCliente, setEditCliente] = useState("");
  const [editTelefono, setEditTelefono] = useState("");
  const [editNumeroFactura, setEditNumeroFactura] = useState("");
  const [editMonto, setEditMonto] = useState("");
  const [editAddress, setEditAddress] = useState(null);

  // ===== Mensajeros activos =====
  const [mensajeros, setMensajeros] = useState([]);

  // Usuario activo
  const usuarioActivo = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("usuarioActivo") || "null"); } catch { return null; }
  }, []);
  const rolOriginal = usuarioActivo?.rol || "desconocido";
  const rol = normalizeRole(rolOriginal);
  const empresaIdRaw = usuarioActivo?.empresaId ?? null;
  const empresaId = empresaIdRaw != null ? String(empresaIdRaw) : null;

  useEffect(() => {
    if (!empresaId) {
      console.warn("No hay empresaId en usuarioActivo.");
      alert("Falta empresaId en tu sesión. Cierra sesión e inicia de nuevo.");
    }
  }, [empresaId]);

  // ===== Backfill opcional =====
  async function backfillEmpresaIdYCreatedAt() {
    if (!empresaId) return alert("No hay empresaId en sesión.");
    try {
      const snap = await getDocs(collection(db, COLEC));
      let setEmpresa = 0, setCreated = 0, fail = 0;
      for (const d of snap.docs) {
        const data = d.data() || {};
        const patch = {};
        if (!data.empresaId) patch.empresaId = empresaId;
        if (!data.createdAt) patch.createdAt = serverTimestamp();
        if (!Object.keys(patch).length) continue;
        try {
          await updateDoc(doc(db, COLEC, d.id), patch);
          if (patch.empresaId) setEmpresa++;
          if (patch.createdAt) setCreated++;
        } catch (e) { console.warn("Backfill fallo:", d.id, e?.code, e?.message); fail++; }
      }
      alert(`Backfill: empresaId(${setEmpresa}), createdAt(${setCreated}), fallas(${fail})`);
    } catch (e) {
      console.error("Backfill error:", e);
      alert("Error en backfill. Revisa reglas y consola.");
    }
  }

  // ===== Suscripciones =====
  useEffect(() => {
    let unsubOrdenes = null, unsubFallback = null, unsubUbic = null;

    (async () => {
      const ok = await ensureUsuarioActivo();
      if (!ok || !empresaId) return;

      // Órdenes
      try {
        const ref = collection(db, COLEC);
        const q1 = query(ref, where("empresaId", "==", empresaId), orderBy("createdAt", "desc"));
        unsubOrdenes = onSnapshot(
          q1,
          (snap) => setOrdenes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
          (err) => {
            console.error("onSnapshot(ordenes):", err?.code, err?.message);
            if (err?.code === "failed-precondition") {
              const q2 = query(ref, where("empresaId", "==", empresaId));
              unsubFallback = onSnapshot(
                q2,
                (snap2) => {
                  const rows = snap2.docs.map((d) => ({ id: d.id, ...d.data() }));
                  rows.sort((a,b)=>(b?.createdAt?.toMillis?.()??0)-(a?.createdAt?.toMillis?.()??0));
                  setOrdenes(rows);
                },
                (e2) => alert(e2?.message || "No se pudieron leer órdenes (fallback).")
              );
              alert("Falta índice compuesto (empresaId + createdAt). Usando fallback temporal.");
            } else if (err?.code === "permission-denied") {
              alert("Permiso denegado al leer órdenes. Revisa reglas/empresaId.");
            } else {
              alert(err?.message || "No se pudieron leer órdenes.");
            }
          }
        );
      } catch (e) { console.error("query(ordenes) error:", e); }

      // Ubicaciones
      try {
        const refU = collection(db, "ubicacionesMensajeros");
        const qU = query(refU, where("empresaId", "==", empresaId));
        unsubUbic = onSnapshot(
          qU,
          (snap) => {
            const arr = snap.docs.map((d) => {
              const data = d.data() || {};
              return {
                id: d.id,
                nombre: data.nombre || d.id,
                estado: (data.estado || "disponible").toLowerCase(),
              };
            });
            setMensajeros(arr);
          },
          (err) => {
            console.error("onSnapshot(ubicacionesMensajeros):", err?.code, err?.message);
            if (err?.code === "permission-denied") {
              alert("Permiso denegado al leer ubicaciones. Revisa reglas/empresaId.");
            }
          }
        );
      } catch (e) { console.error("query(ubicacionesMensajeros) error:", e); }
    })();

    return () => {
      if (unsubOrdenes) unsubOrdenes();
      if (unsubFallback) unsubFallback();
      if (unsubUbic) unsubUbic();
    };
  }, [empresaId]);

  // ===== Helpers =====
  function getActor() {
    const u = JSON.parse(localStorage.getItem("usuarioActivo") || "null");
    return {
      id: u?.id || u?.uid || null,
      nombre: u?.nombre || u?.usuario || "desconocido",
      rol: normalizeRole(u?.rol || "desconocido"),
      empresaId: u?.empresaId != null ? String(u.empresaId) : null,
    };
  }

  const gmapsUrl = (lat, lng) =>
    Number.isFinite(lat) && Number.isFinite(lng)
      ? `https://www.google.com/maps?q=${lat},${lng}`
      : null;

  // ===== Crear Orden =====
  const registrarOrden = async () => {
    if (!empresaId) return alert("No tienes empresa asignada.");
    if (!cliente || !telefono || !numeroFactura || !monto || !fecha || !hora || !address) {
      alert("Completa cliente, teléfono, factura, monto, fecha, hora y dirección.");
      return;
    }
    const latN = toNumOrNull(address?.lat);
    const lngN = toNumOrNull(address?.lng);
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
      alert("La dirección debe tener coordenadas válidas.");
      return;
    }

    const nuevaOrden = {
      empresaId,
      cliente, telefono, numeroFactura, monto, fecha, hora,
      address: { ...address, lat: latN, lng: lngN },
      destinoLat: latN,
      destinoLng: lngN,
      direccionTexto: address.formatted,
      entregado: false,
      recibida: false,
      fechaRecibida: null,
      fechaEntregada: null,
      tiempoTotalEntrega: null,
      asignadoUid: null,
      asignadoNombre: null,
      usuario: usuarioActivo?.nombre || "desconocido",
      rolUsuario: rol || "desconocido",
      createdAt: serverTimestamp(),
    };

    try {
      setSaving(true);
      await ensureUsuarioActivo();
      const ref = await addDoc(collection(db, COLEC), nuevaOrden);
      console.log("Orden creada:", ref.id);
      setCliente(""); setTelefono(""); setNumeroFactura("");
      setMonto(""); setFecha(""); setHora(""); setAddress(null);
      alert("Orden registrada en Firestore ✅");
    } catch (e) {
      console.error("❌ Error subiendo a Firestore:", e?.code, e?.message);
      alert(`No pude guardar en Firestore.\n${e?.code || ""} ${e?.message || ""}`.trim());
    } finally {
      setSaving(false);
    }
  };

  // ===== Asignar =====
  async function asignarOrden(orderId, mensajeroId) {
    if (!empresaId) return alert("Falta empresaId en sesión.");
    if (!mensajeroId) return;
    try {
      const m = mensajeros.find((x) => x.id === mensajeroId);
      await updateDoc(doc(db, COLEC, orderId), {
        asignadoUid: mensajeroId,
        asignadoNombre: m?.nombre || mensajeroId,
        asignadoAt: serverTimestamp(),
      });
      await setDoc(
        doc(db, "ubicacionesMensajeros", mensajeroId),
        {
          empresaId,
          nombre: m?.nombre || mensajeroId,
          estado: "listo_para_ruta",
          estadoUpdatedAt: serverTimestamp(),
          lastPingAt: serverTimestamp(),
        },
        { merge: true }
      );
      alert("Orden asignada ✅");
    } catch (e) { console.error("Asignar:", e?.code, e?.message); alert("No pude asignar la orden."); }
  }

  // ===== Cambios de estado =====
  const marcarComoRecibida = async (id) => {
    if (!empresaId) return alert("Falta empresaId en sesión.");
    const actor = getActor();
    const orden = ordenes.find((o) => o.id === id);
    if (!orden) return;

    const antes = { ...orden };
    const despues = { ...orden, recibida: true, fechaRecibida: serverTimestamp() };

    try {
      await updateDoc(doc(db, COLEC, id), { recibida: true, fechaRecibida: serverTimestamp() });
      if (orden.asignadoUid) {
        await setDoc(
          doc(db, "ubicacionesMensajeros", orden.asignadoUid),
          { empresaId, estado: "en_ruta", estadoUpdatedAt: serverTimestamp(), lastPingAt: serverTimestamp() },
          { merge: true }
        );
      }
      await logCambioOrden({ orderId: id, empresaId, antes, despues, actor, motivo: "Orden recibida" });
    } catch (e) { console.error("Recibida:", e?.code, e?.message); alert("No pude marcar como recibida."); }
  };

  const marcarComoEntregado = async (id) => {
    if (!empresaId) return alert("Falta empresaId en sesión.");
    const actor = getActor();
    const orden = ordenes.find((o) => o.id === id);
    if (!orden) return;

    let minutos = null;
    try {
      const fr = orden.fechaRecibida?.toDate ? orden.fechaRecibida.toDate().getTime() : null;
      if (fr) minutos = ((Date.now() - fr) / 60000).toFixed(2);
    } catch {}

    const antes = { ...orden };
    const despues = { ...orden, entregado: true, fechaEntregada: serverTimestamp(), tiempoTotalEntrega: minutos };

    try {
      await updateDoc(doc(db, COLEC, id), {
        entregado: true,
        fechaEntregada: serverTimestamp(),
        tiempoTotalEntrega: minutos,
      });
      if (orden.asignadoUid) {
        await setDoc(
          doc(db, "ubicacionesMensajeros", orden.asignadoUid),
          { empresaId, estado: "disponible", estadoUpdatedAt: serverTimestamp(), lastPingAt: serverTimestamp() },
          { merge: true }
        );
      }
      await logCambioOrden({ orderId: id, empresaId, antes, despues, actor, motivo: "Orden entregada" });
    } catch (e) { console.error("Entregada:", e?.code, e?.message); alert("No pude marcar como entregada."); }
  };

  // ===== Edición =====
  const editarOrden = (orden) => {
    setOrdenEnEdicion(orden.id);
    setEditCliente(orden.cliente || "");
    setEditTelefono(orden.telefono || "");
    setEditNumeroFactura(orden.numeroFactura || "");
    setEditMonto(orden.monto || "");
    setEditAddress(orden.address || null);
  };

  const guardarEdicion = async () => {
    if (!empresaId) return alert("Falta empresaId en sesión.");
    if (!ordenEnEdicion) return;

    const actor = getActor();
    const orden = ordenes.find((o) => o.id === ordenEnEdicion);
    if (!orden) return;

    const latN = editAddress ? toNumOrNull(editAddress.lat) : null;
    const lngN = editAddress ? toNumOrNull(editAddress.lng) : null;

    const antes = { ...orden };
    const cambios = {
      cliente: editCliente,
      telefono: editTelefono,
      numeroFactura: editNumeroFactura,
      monto: editMonto,
      address: editAddress ? { ...editAddress, lat: latN, lng: lngN } : null,
      destinoLat: editAddress ? latN : null,
      destinoLng: editAddress ? lngN : null,
      direccionTexto: editAddress?.formatted || orden.direccionTexto || null,
      // empresaId/createdAt NO se tocan
    };
    const despues = { ...orden, ...cambios };

    try {
      await updateDoc(doc(db, COLEC, ordenEnEdicion), cambios);
      await logCambioOrden({ orderId: ordenEnEdicion, empresaId, antes, despues, actor, motivo: "Edición de orden" });
      setOrdenEnEdicion(null);
      alert("Orden actualizada ✅");
    } catch (e) { console.error("Editar:", e?.code, e?.message); alert("No pude actualizar la orden."); }
  };

  // ===== Búsqueda/Orden local =====
  const ordenesFiltradas = useMemo(() => {
    let base = filtroFecha ? ordenes.filter((o) => o.fecha === filtroFecha) : [...ordenes];

    const q = busqueda.trim().toLowerCase();
    if (q) {
      base = base.filter((o) => {
        const str = [
          o.cliente,
          o.telefono,
          o.numeroFactura,
          o.direccionTexto,
          o.address?.formatted,
        ].map(v => String(v || "").toLowerCase()).join(" | ");
        return str.includes(q);
      });
    }

    if (ordenarPor === "createdDesc") {
      base.sort((a,b) => createdMs(b) - createdMs(a));
    } else if (ordenarPor === "createdAsc") {
      base.sort((a,b) => createdMs(a) - createdMs(b));
    } else if (ordenarPor === "estado") {
      const weight = (o) => (o.entregado ? 2 : o.recibida ? 1 : 0);
      base.sort((a,b) => (weight(a) - weight(b)) || (createdMs(b) - createdMs(a)));
    }

    return base;
  }, [ordenes, filtroFecha, busqueda, ordenarPor]);

  return (
    <div style={{ padding: 20 }}>
      <h2>Registrar Orden de Entrega</h2>

      {/* Formulario */}
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(3, minmax(220px, 1fr))" }}>
        <input type="text" placeholder="Cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} />
        <input type="text" placeholder="Teléfono del cliente" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        <input type="text" placeholder="Número de Factura" value={numeroFactura} onChange={(e) => setNumeroFactura(e.target.value)} />
        <input type="number" placeholder="Monto" value={monto} onChange={(e) => setMonto(e.target.value)} />
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
      </div>

      <div style={{ marginTop: 10 }}>
        <label style={{ display: "block", marginBottom: 6 }}>
          <b>Dirección (escribir, mapa o importar link)</b>
        </label>
        <AddressInput value={address} onChange={setAddress} />
      </div>

      {(rol === "operador" || rol === "administrador") && (
        <button style={{ marginTop: 10 }} onClick={registrarOrden} disabled={saving || !address}>
          {saving ? "Guardando..." : "Registrar"}
        </button>
      )}

      {rol === "administrador" && empresaId && (
        <div style={{ margin: "10px 0" }}>
          <button onClick={backfillEmpresaIdYCreatedAt} title="Rellena empresaId/createdAt a órdenes antiguas (una vez)">
            🛠️ Backfill empresaId & createdAt (una vez)
          </button>
          <span style={{ marginLeft: 8, fontSize: 12, color: "#666" }}>
            Úsalo solo si migraste datos antiguos.
          </span>
        </div>
      )}

      {/* Filtros / Búsqueda / Orden */}
      <h3 style={{ marginTop: 20 }}>Filtros</h3>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="date"
          value={filtroFecha}
          onChange={(e) => setFiltroFecha(e.target.value)}
          style={{ minWidth: 170 }}
        />
        <input
          type="text"
          placeholder="Buscar (cliente / factura / teléfono / dirección)…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ flex: 1, minWidth: 220 }}
        />
        <select value={ordenarPor} onChange={(e) => setOrdenarPor(e.target.value)}>
          <option value="createdDesc">Orden: más recientes</option>
          <option value="createdAsc">Orden: más antiguas</option>
          <option value="estado">Orden: por estado</option>
        </select>
      </div>

      {/* Listado */}
      <h3 style={{ marginTop: 20 }}>Órdenes (tiempo real)</h3>
      <ul>
        {ordenesFiltradas.map((orden) => {
          const estado = orden.entregado ? "ENTREGADA" : orden.recibida ? "RECIBIDA" : "PENDIENTE";
          const { lat, lng } = getCoords(orden);
          const sinCoords = !Number.isFinite(lat) || !Number.isFinite(lng);
          const coordsTxt = Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : "—";
          const gmaps = gmapsUrl(lat, lng);

          return (
            <li key={orden.id} style={{ marginBottom: 12 }}>
              Fecha: {orden.fecha} {orden.hora} | Cliente: {orden.cliente} | Tel: {orden.telefono || "—"} | Nº Factura: {orden.numeroFactura} | Monto: ${orden.monto}{" "}
              | Dirección: {orden.direccionTexto || orden.address?.formatted || "—"} | Coords: {coordsTxt} | Registrado por: {orden.usuario} | Estado: <b>{estado}</b>{" "}
              {sinCoords && <span style={{ color: "#b00" }}> • ⚠️ Sin destino</span>}
              {gmaps && <> · <a href={gmaps} target="_blank" rel="noopener noreferrer">Abrir en Google Maps</a></>}

              {/* Acciones rápidas */}
              <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {/* Detalle */}
                <button onClick={() => navigate(`/orden/${orden.id}`)}>🔎 Ver detalle</button>

                {/* Mapa y navegación */}
                {!sinCoords && (
                  <>
                    <button
                      onClick={() =>
                        navigate(`/mapa/${orden.id}`, {
                          state: {
                            ordenId: orden.id,
                            lat,
                            lng,
                            direccion: orden.direccionTexto || orden.address?.formatted || "",
                            cliente: orden.cliente || "",
                            numeroFactura: orden.numeroFactura || "",
                            address: orden.address || null,
                          },
                        })
                      }
                    >
                      🗺️ Ver en mapa
                    </button>

                    <button
                      onClick={() =>
                        navigate(`/ruta-mensajero/${orden.id}`, {
                          state: {
                            ordenId: orden.id,
                            lat,
                            lng,
                            direccion: orden.direccionTexto || orden.address?.formatted || "",
                            cliente: orden.cliente || "",
                            numeroFactura: orden.numeroFactura || "",
                            address: orden.address || null,
                          },
                        })
                      }
                    >
                      🧭 Navegar (en app)
                    </button>
                  </>
                )}

                {/* Fijar destino si falta */}
                {(rol === "operador" || rol === "administrador") && !orden.entregado && sinCoords && (
                  <button
                    onClick={() =>
                      navigate(`/seleccionar-destino/${orden.id}`, {
                        state: {
                          ordenId: orden.id,
                          direccion: orden.direccionTexto || orden.address?.formatted || "",
                          address: orden.address || null,
                        },
                      })
                    }
                  >
                    📍 Fijar destino
                  </button>
                )}

                {/* Estado */}
                {orden.entregado ? (
                  <span>✅ Entregado</span>
                ) : orden.recibida ? (
                  (rol === "administrador" || rol === "mensajero") && (
                    <button onClick={() => marcarComoEntregado(orden.id)}>📬 Marcar como Entregado</button>
                  )
                ) : (
                  (rol === "administrador" || rol === "mensajero") && (
                    <button onClick={() => marcarComoRecibida(orden.id)}>✅ Orden Recibida</button>
                  )
                )}
              </div>

              {/* Edición + Asignación (solo si no está entregada) */}
              {(rol === "operador" || rol === "administrador") && !orden.entregado && (
                <>
                  <button style={{ marginTop: 6 }} onClick={() => editarOrden(orden)}>✏️ Editar</button>
                  <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: "#555" }}>
                      Asignado a: <b>{orden.asignadoNombre || "— Sin asignar —"}</b>
                    </span>

                    <select onChange={(e) => asignarOrden(orden.id, e.target.value)} defaultValue="" style={{ padding: 4 }}>
                      <option value="" disabled>Seleccionar mensajero (solo disponibles)…</option>
                      {mensajeros
                        .filter((m) => m.estado === "disponible")
                        .map((m) => (
                          <option key={m.id} value={m.id}>{m.nombre}</option>
                        ))}
                    </select>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {/* Resumen por día (cuando filtras por fecha) */}
      {filtroFecha && (
        <div style={{ marginTop: 20 }}>
          <h4>Resumen del día</h4>
          <p>Total órdenes: {ordenesFiltradas.length}</p>
          <p>Entregadas: {ordenesFiltradas.filter((o) => o.entregado).length}</p>
          <p>Pendientes: {ordenesFiltradas.filter((o) => !o.entregado).length}</p>
        </div>
      )}

      {/* Panel de edición */}
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
            <label style={{ display: "block", marginBottom: 6 }}>
              <b>Dirección</b>
            </label>
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
