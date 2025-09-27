// src/pantallas/OrdenDetalle.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { db, storage } from "../firebaseConfig";
import {
  doc,
  onSnapshot,
  updateDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { ensureUsuarioActivo } from "../utils/ensureUsuario";
import { logCambioOrden } from "../utils/logCambios";
import AsignarMensajero from "../components/AsignarMensajero"; // 👈 se mantiene

const COLEC = "ordenes";

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
    // 🆕 Gerente (solo lectura)
    gerente: "gerente",
    manager: "gerente",
  };
  return map[r] || r;
}

function tsToMs(ts) {
  try {
    if (!ts) return NaN;
    if (typeof ts?.toDate === "function") return ts.toDate().getTime();
    if (typeof ts?.seconds === "number") {
      return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
    }
    if (ts instanceof Date) return ts.getTime();
  } catch {}
  return NaN;
}
function minutesFrom(startTs, endTs) {
  const a = tsToMs(startTs);
  const b = tsToMs(endTs);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const m = (b - a) / 60000;
  return Number.isFinite(m) && m >= 0 ? Number(m.toFixed(2)) : null;
}
function fmtHora(h) {
  if (!h) return "—";
  const s = String(h);
  // admite HH:mm o HHmm
  if (/^\d{4}$/.test(s)) return s.slice(0, 2) + ":" + s.slice(2);
  return s;
}

export default function OrdenDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();

  // sesión
  const usuario = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("usuarioActivo") || "null"); } catch { return null; }
  }, []);
  const rol = normalizeRole(usuario?.rol || "desconocido");
  const empresaId = usuario?.empresaId != null ? String(usuario.empresaId) : null;

  // estado
  const [orden, setOrden] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  // POD (foto)
  const [proofFile, setProofFile] = useState(null);
  const [proofPreview, setProofPreview] = useState(null);
  const [recibeNombre, setRecibeNombre] = useState("");
  const [subiendo, setSubiendo] = useState(false);

  // suscripción a la orden
  useEffect(() => {
    let unsub = null;
    (async () => {
      const ok = await ensureUsuarioActivo();
      if (!ok || !empresaId) {
        setError("Sesión inválida o falta empresaId.");
        setCargando(false);
        return;
      }
      try {
        const refDoc = doc(db, COLEC, id);
        unsub = onSnapshot(
          refDoc,
          (snap) => {
            if (!snap.exists()) {
              setError("No existe la orden.");
              setCargando(false);
              return;
            }
            setOrden({ id: snap.id, ...snap.data() });
            setError("");
            setCargando(false);
          },
          (e) => {
            console.error("onSnapshot(orden):", e);
            setError(e?.message || "No se pudo leer la orden.");
            setCargando(false);
          }
        );
      } catch (e) {
        console.error("suscripción orden error:", e);
        setError(e?.message || "No se pudo suscribir.");
        setCargando(false);
      }
    })();
    return () => { if (unsub) unsub(); };
  }, [id, empresaId]);

  function getActor() {
    const u = usuario || {};
    return {
      id: u?.id || u?.uid || null,
      nombre: u?.nombre || u?.usuario || "desconocido",
      rol: normalizeRole(u?.rol || "desconocido"),
      empresaId: u?.empresaId != null ? String(u.empresaId) : null,
    };
  }

  async function marcarRecibida() {
    if (!orden) return;
    // solo Admin o Mensajero (coincide con OrdenesEntrega)
    if (!(rol === "administrador" || rol === "mensajero")) {
      alert("No tienes permisos para cambiar este estado.");
      return;
    }

    const actor = getActor();
    const antes = { ...orden };
    const despues = { ...orden, recibida: true, fechaRecibida: serverTimestamp() };

    try {
      await updateDoc(doc(db, COLEC, orden.id), {
        recibida: true,
        fechaRecibida: serverTimestamp(),
      });
      if (orden.asignadoUid) {
        await setDoc(
          doc(db, "ubicacionesMensajeros", orden.asignadoUid),
          {
            empresaId,
            estado: "en_ruta",
            estadoUpdatedAt: serverTimestamp(),
            lastPingAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
      await logCambioOrden({ orderId: orden.id, empresaId, antes, despues, actor, motivo: "Orden recibida" });
      alert("Orden marcada como recibida.");
    } catch (e) {
      console.error("marcarRecibida:", e);
      alert("No se pudo marcar como recibida.");
    }
  }

  // POD + entregar
  function onFileChange(e) {
    const f = e.target.files?.[0] || null;
    setProofFile(f || null);
    setProofPreview(f ? URL.createObjectURL(f) : null);
  }

  async function registrarPODyEntregar() {
    if (!orden) return;
    // solo Admin o Mensajero (guard adicional por si alguien manipula la UI)
    if (!(rol === "administrador" || rol === "mensajero")) {
      alert("No tienes permisos para registrar prueba/entregar.");
      return;
    }
    if (!proofFile) return alert("Selecciona una foto de prueba.");
    if (!empresaId) return alert("Falta empresaId en sesión.");

    const actor = getActor();
    const antes = { ...orden };

    try {
      setSubiendo(true);

      // sube a Storage
      const safeName = (proofFile.name || "proof.jpg").replace(/\s+/g, "_");
      const path = `proofs/${actor.id || "uid"}/${orden.id}/${Date.now()}_${safeName}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, proofFile, {
        contentType: proofFile.type || "image/jpeg",
        customMetadata: {
          orderId: orden.id,
          empresaId: empresaId,
          actorUid: actor.id || "",
          actorNombre: actor.nombre || "",
        },
      });
      const url = await getDownloadURL(storageRef);

      // calcula minutos desde recibida o creación
      const start = orden.fechaRecibida || orden.createdAt;
      const mins = minutesFrom(start, new Date());

      // actualiza la orden con POD + entrega
      const cambios = {
        proofUrl: url,
        proofStoragePath: path,
        proofType: "photo",
        proofAt: serverTimestamp(),
        recibeNombre: recibeNombre || null,

        entregado: true,
        fechaEntregada: serverTimestamp(),
        tiempoTotalEntrega: mins,

        proofByUid: actor.id || null,
        proofByNombre: actor.nombre || null,
      };
      await updateDoc(doc(db, COLEC, orden.id), cambios);

      // liberar mensajero si aplica
      if (orden.asignadoUid) {
        await setDoc(
          doc(db, "ubicacionesMensajeros", orden.asignadoUid),
          {
            empresaId,
            estado: "disponible",
            estadoUpdatedAt: serverTimestamp(),
            lastPingAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      const despues = { ...antes, ...cambios };
      await logCambioOrden({
        orderId: orden.id,
        empresaId,
        antes,
        despues,
        actor,
        motivo: "Prueba de entrega (foto) y cierre",
      });

      alert("Prueba registrada y orden entregada ✅");
      setProofFile(null);
      setProofPreview(null);
      setRecibeNombre("");
    } catch (e) {
      console.error("registrarPODyEntregar:", e);
      alert(e?.message || "No se pudo registrar la prueba.");
    } finally {
      setSubiendo(false);
    }
  }

  if (cargando) return <div style={{ padding: 16 }}>Cargando…</div>;
  if (error) return (
    <div style={{ padding: 16, color: "#b00" }}>
      {error} <div style={{ marginTop: 8 }}><Link to="/ordenes">← Volver</Link></div>
    </div>
  );
  if (!orden) return <div style={{ padding: 16 }}>No existe la orden.</div>;

  const estado = orden.entregado ? "ENTREGADA" : orden.recibida ? "RECIBIDA" : "PENDIENTE";

  // ventanas y prioridad (opcionales)
  const ventanaIni = orden.ventanaInicio ?? orden.ventanaInicioStop ?? null;
  const ventanaFin = orden.ventanaFin ?? orden.ventanaFinStop ?? null;
  const prioridad = orden.prioridad ?? orden.prioridadEntrega ?? null;

  const puedeEditar = rol === "administrador" || rol === "operador"; // 👈 gerente NO
  const puedeAsignar = puedeEditar;                                   // 👈 gerente NO

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h2 style={{ margin: 0 }}>🔎 Detalle de Orden</h2>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn" to="/ordenes">← Volver</Link>
          <Link className="btn" to={`/mapa/${orden.id}`}>🗺️ Ver en mapa</Link>
          {puedeEditar && <Link className="btn" to={`/orden/${orden.id}/editar`}>✏️ Editar</Link>}
          {puedeEditar && <Link className="btn" to={`/seleccionar-destino/${orden.id}`}>📍 Seleccionar destino</Link>}
        </div>
      </div>

      {/* Datos base */}
      <div style={{ marginTop: 10, padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
        <div><b>Orden:</b> {orden.id}</div>
        <div><b>Cliente:</b> {orden.cliente} — <b>Tel:</b> {orden.telefono || "—"}</div>
        <div><b>Factura:</b> {orden.numeroFactura} — <b>Monto:</b> ${orden.monto}</div>
        <div><b>Fecha/Hora:</b> {orden.fecha} {orden.hora}</div>
        <div><b>Dirección:</b> {orden.direccionTexto || orden.address?.formatted || "—"}</div>
        <div><b>Asignado a:</b> {orden.asignadoNombre || "—"}</div>
        <div><b>Estado:</b> {estado}</div>

        {/* Opcionales: prioridad y ventanas */}
        <div style={{ marginTop: 6, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 14, color: "#444" }}>
          <div><b>Prioridad:</b> {prioridad ?? "—"}</div>
          <div><b>Ventana:</b> {ventanaIni || ventanaFin ? `${fmtHora(ventanaIni)} — ${fmtHora(ventanaFin)}` : "—"}</div>
        </div>
      </div>

      {/* Acciones de estado simples */}
      {!orden.recibida && !orden.entregado && (rol === "administrador" || rol === "mensajero") && (
        <div style={{ marginTop: 10 }}>
          <button onClick={marcarRecibida}>✅ Marcar como Recibida</button>
        </div>
      )}

      {/* Panel de asignación (solo Admin/Operador) */}
      {puedeAsignar ? (
        <AsignarMensajero orden={orden} onUpdated={() => { /* onSnapshot ya refresca */ }} />
      ) : null}

      {/* Sección POD con foto */}
      <div style={{ marginTop: 16, padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
        <h3 style={{ marginTop: 0 }}>📷 Prueba de Entrega (foto)</h3>

        {orden.proofUrl ? (
          <div>
            <div style={{ marginBottom: 8 }}>
              <b>Registrada:</b>{" "}
              {orden.proofAt?.toDate ? orden.proofAt.toDate().toLocaleString() : "—"}
            </div>
            <div style={{ marginBottom: 8 }}>
              <b>Recibido por:</b> {orden.recibeNombre || "—"}
            </div>
            <a href={orden.proofUrl} target="_blank" rel="noopener noreferrer">
              <img
                src={orden.proofUrl}
                alt="Prueba de entrega"
                style={{ maxWidth: 360, maxHeight: 360, borderRadius: 8, border: "1px solid #ddd" }}
              />
            </a>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(2, minmax(220px,1fr))" }}>
              <div>
                <label><b>Foto (cámara o galería)</b></label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={onFileChange}
                  disabled={subiendo || !(rol === "administrador" || rol === "mensajero")}
                />
                {proofPreview && (
                  <div style={{ marginTop: 8 }}>
                    <img
                      src={proofPreview}
                      alt="preview"
                      style={{ maxWidth: 240, maxHeight: 240, borderRadius: 8, border: "1px solid #ddd" }}
                    />
                  </div>
                )}
              </div>

              <div>
                <label><b>Recibe (nombre opcional)</b></label>
                <input
                  type="text"
                  placeholder="Nombre de quien recibe"
                  value={recibeNombre}
                  onChange={(e)=>setRecibeNombre(e.target.value)}
                  disabled={subiendo || !(rol === "administrador" || rol === "mensajero")}
                  style={{ width: "100%" }}
                />
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              {(rol === "administrador" || rol === "mensajero") && !orden.entregado && (
                <button onClick={registrarPODyEntregar} disabled={subiendo || !proofFile}>
                  {subiendo ? "Subiendo…" : "Registrar prueba y ENTREGAR"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
