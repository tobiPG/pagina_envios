// src/pantallas/OrdenesEntrega.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db, storage } from "../firebaseConfig";
import {
  collection,
  addDoc,                    // (se deja aunque ya no se usa directamente)
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  setDoc,
  query,
  where,
  orderBy,
  getDocs,
  arrayUnion,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import AddressInput from "../components/AddressInput.jsx";
import { logCambioOrden } from "../utils/logCambios";
import { ensureUsuarioActivo } from "../utils/ensureUsuario";
import { getFunctions, httpsCallable } from "firebase/functions";   // 👈 NUEVO
import { usePlanGate } from "../hooks/usePlanGate";                 // 👈 NUEVO

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
    // 🆕 Gerente
    gerente: "gerente",
    manager: "gerente",
  };
  return map[r] || r;
}

// ====== Helpers NUEVOS (para permitir asignar en_ruta) ======
function normalizeStr(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
function normalizeEstado(raw) {
  return normalizeStr(raw).replace(/[-\s]+/g, "_"); // "En Ruta" -> "en_ruta"
}
const OK_ESTADOS_ASIGNAR = new Set(["disponible", "listo_para_ruta", "en_ruta"]);

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
const createdMs = (o) => o?.createdAt?.toMillis?.() ?? 0;

/* ===== UI ===== */
function Chip({ children, tone = "default" }) {
  const bg =
    tone === "ok"
      ? "var(--ok-bg)"
      : tone === "warn"
      ? "var(--warn-bg)"
      : tone === "danger"
      ? "var(--danger-bg)"
      : "var(--chip)";
  const bd =
    tone === "ok"
      ? "var(--ok-bd)"
      : tone === "warn"
      ? "var(--warn-bd)"
      : tone === "danger"
      ? "var(--danger-bd)"
      : "var(--border)";
  const tx =
    tone === "ok"
      ? "var(--ok-tx)"
      : tone === "warn"
      ? "var(--warn-tx)"
      : tone === "danger"
      ? "var(--danger-tx)"
      : "var(--text-muted)";
  return (
    <span
      style={{
        display: "inline-block",
        background: bg,
        border: `1px solid ${bd}`,
        color: tx,
        borderRadius: 999,
        padding: "4px 10px",
        fontSize: 12,
        lineHeight: 1,
      }}
    >
      {children}
    </span>
  );
}

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

  // progreso de subida por orden { [ordenId]: porcentaje }
  const [podSubiendo, setPodSubiendo] = useState({});

  // pestañas Pendientes/Entregadas
  const [tab, setTab] = useState("pendientes"); // pendientes | entregadas

  // Usuario activo
  const usuarioActivo = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("usuarioActivo") || "null");
    } catch {
      return null;
    }
  }, []);
  const rolOriginal = usuarioActivo?.rol || "desconocido";
  const rol = normalizeRole(rolOriginal);
  const empresaIdRaw = usuarioActivo?.empresaId ?? null;
  const empresaId = empresaIdRaw != null ? String(empresaIdRaw) : null;

  // 🔒 Gating por plan/consumo (para el botón Registrar)
  const planGate = usePlanGate();            // 👈 NUEVO
  const blockedByPlan = !!planGate?.blocked; // true si alcanzó límite

  // Functions
  const functions = getFunctions();          // 👈 NUEVO
  const createOrderFn = httpsCallable(functions, "createOrder"); // 👈 NUEVO

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
      let setEmpresa = 0,
        setCreated = 0,
        fail = 0;
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
        } catch (e) {
          console.warn("Backfill fallo:", d.id, e?.code, e?.message);
          fail++;
        }
      }
      alert(
        `Backfill: empresaId(${setEmpresa}), createdAt(${setCreated}), fallas(${fail})`
      );
    } catch (e) {
      console.error("Backfill error:", e);
      alert("Error en backfill. Revisa reglas y consola.");
    }
  }

  // ===== Suscripciones =====
  useEffect(() => {
    let unsubOrdenes = null,
      unsubFallback = null,
      unsubUbic = null;

    (async () => {
      const ok = await ensureUsuarioActivo();
      if (!ok || !empresaId) return;

      // Órdenes
      try {
        const ref = collection(db, COLEC);
        const q1 = query(
          ref,
          where("empresaId", "==", empresaId),
          orderBy("createdAt", "desc")
        );
        unsubOrdenes = onSnapshot(
          q1,
          (snap) =>
            setOrdenes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
          (err) => {
            console.error("onSnapshot(ordenes):", err?.code, err?.message);
            if (err?.code === "failed-precondition") {
              const q2 = query(ref, where("empresaId", "==", empresaId));
              unsubFallback = onSnapshot(
                q2,
                (snap2) => {
                  const rows = snap2.docs.map((d) => ({
                    id: d.id,
                    ...d.data(),
                  }));
                  rows.sort(
                    (a, b) =>
                      (b?.createdAt?.toMillis?.() ?? 0) -
                      (a?.createdAt?.toMillis?.() ?? 0)
                  );
                  setOrdenes(rows);
                },
                (e2) =>
                  alert(
                    e2?.message || "No se pudieron leer órdenes (fallback)."
                  )
              );
              alert(
                "Falta índice compuesto (empresaId + createdAt). Usando fallback temporal."
              );
            } else if (err?.code === "permission-denied") {
              alert("Permiso denegado al leer órdenes. Revisa reglas/empresaId.");
            } else {
              alert(err?.message || "No se pudieron leer órdenes.");
            }
          }
        );
      } catch (e) {
        console.error("query(ordenes) error:", e);
      }

      // Ubicaciones
      try {
        const refU = collection(db, "usuarios");
        const qU = query(
          refU,
          where("empresaId", "==", empresaId),
          where("rol", "==", "mensajero") // solo los mensajeros del equipo
        );
        unsubUbic = onSnapshot(
          qU,
          (snap) => {
            const arr = snap.docs.map((d) => {
              const data = d.data() || {};
              return {
                id: d.id,
                nombre: data.nombre || data.email || d.id,
                estado: "disponible", // por defecto, si no manejas estados aquí
              };
            });
            setMensajeros(arr);
          },
          (err) => {
            console.error("onSnapshot(usuarios - mensajeros):", err?.code, err?.message);
            alert("No se pudieron leer los mensajeros del equipo.");
          }
        );
      } catch (e) {
        console.error("query(usuarios - mensajeros) error:", e);
      }
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

  // ===== Crear Orden (ahora vía Cloud Function con gating de plan) =====
  const registrarOrden = async () => {
    // 🔒 Solo Admin/Operador
    if (!(rol === "administrador" || rol === "operador")) {
      alert("No tienes permisos para crear órdenes.");
      return;
    }

    if (!empresaId) return alert("No tienes empresa asignada.");
    if (!cliente || !telefono || !numeroFactura || !monto || !fecha || !hora || !address) {
      alert("Completa cliente, teléfono, factura, monto, fecha, hora y dirección.");
      return;
    }
    if (blockedByPlan) {
      if (confirm("Alcanzaste el límite de órdenes del plan. ¿Deseas revisar/actualizar tu plan ahora?")) {
        navigate("/planes");
      }
      return;
    }

    const latN = toNumOrNull(address?.lat);
    const lngN = toNumOrNull(address?.lng);
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
      alert("La dirección debe tener coordenadas válidas.");
      return;
    }

    // payload mínimo alineado con OrdenForm -> createOrder (Functions)
    const nuevaOrdenPayload = {
      cliente,
      telefono,
      numeroFactura,
      monto: toNumOrNull(monto),
      fecha,
      hora,
      direccionTexto: address?.formatted || "",
      address: { ...address, lat: latN, lng: lngN, formatted: address?.formatted || undefined },
      prioridad: 3,
      ventanaInicioStop: "",
      ventanaFinStop: "",
      programacionId: "",
      empresaId, // en Functions lo validas contra userDoc
    };

    try {
      setSaving(true);
      const ok = await ensureUsuarioActivo();
      if (!ok) throw new Error("No autenticado.");

      // 👉 Crear por Cloud Function (aplica límites/consumo)
      const res = await createOrderFn(nuevaOrdenPayload);
      const newId = res?.data?.id;
      if (!newId) throw new Error("No se recibió el ID de la nueva orden.");

      // reset UI
      setCliente("");
      setTelefono("");
      setNumeroFactura("");
      setMonto("");
      setFecha("");
      setHora("");
      setAddress(null);

      alert("Orden registrada ✅");
    } catch (e) {
      console.error("❌ Error creando orden:", e);
      const msg = e?.message || "";
      if (/resource-exhausted|quota|límite|limite|plan/i.test(msg)) {
        alert("No se pudo crear: alcanzaste el límite de órdenes del plan.");
      } else if (/permission|auth/i.test(msg)) {
        alert("Permiso denegado o sesión inválida.");
      } else {
        alert(msg || "No se pudo crear la orden.");
      }
    } finally {
      setSaving(false);
    }
  };

  // ===== Subir POD (foto de entrega) =====
  async function subirPOD(orden, file) {
    if (!empresaId) return alert("Falta empresaId en sesión.");
    if (!file) return;

    // 🔒 Solo Admin o Mensajero pueden subir POD (Gerente queda bloqueado)
    if (!(rol === "administrador" || rol === "mensajero")) {
      alert("No tienes permisos para subir prueba de entrega.");
      return;
    }

    const ok = await ensureUsuarioActivo();
    if (!ok) return alert("Sesión inválida.");

    try {
      const actor = getActor();
      const safe = (file.name || "foto.jpg").replace(/\s+/g, "_");
      const path = `empresas/${empresaId}/ordenes/${orden.id}/pod/${Date.now()}_${safe}`;
      const storageRef = ref(storage, path);
      const metadata = {
        contentType: file.type || "image/jpeg",
        cacheControl: "public,max-age=31536000",
      };

      setPodSubiendo((m) => ({ ...m, [orden.id]: 0 }));

      const task = uploadBytesResumable(storageRef, file, metadata);

      task.on(
        "state_changed",
        (snap) => {
          const pct = Math.round(
            (snap.bytesTransferred / snap.totalBytes) * 100
          );
          setPodSubiendo((m) => ({ ...m, [orden.id]: pct }));
        },
        (err) => {
          console.error("POD upload error:", err);
          setPodSubiendo((m) => {
            const cp = { ...m };
            delete cp[orden.id];
            return cp;
          });
          alert(err?.message || "No pude subir la imagen.");
        },
        async () => {
          try {
            const url = await getDownloadURL(task.snapshot.ref);
            await updateDoc(doc(db, COLEC, orden.id), {
              fotosPodUrls: arrayUnion(url),
              proofUrl: url,
              proofAt: serverTimestamp(),
              proofType: file.type || "image/jpeg",
              proofStoragePath: path,
              proofByUid: actor.id,
              proofByNombre: actor.nombre,
            });

            setPodSubiendo((m) => {
              const cp = { ...m };
              delete cp[orden.id];
              return cp;
            });
            alert("Foto subida y guardada ✅");
          } catch (e) {
            console.error("getDownloadURL/guardar URL:", e);
            setPodSubiendo((m) => {
              const cp = { ...m };
              delete cp[orden.id];
              return cp;
            });
            alert(e?.message || "Subí la imagen pero no pude guardar la URL.");
          }
        }
      );
    } catch (e) {
      console.error("subirPOD() fallo:", e);
      setPodSubiendo((m) => {
        const cp = { ...m };
        delete cp[orden.id];
        return cp;
      });
      alert(e?.message || "Error inesperado al subir la foto.");
    }
  }

  // ===== Asignar =====
  async function asignarOrden(orderId, mensajeroId) {
    // 🔒 Solo Admin/Operador
    if (!(rol === "administrador" || rol === "operador")) {
      alert("No tienes permisos para asignar órdenes.");
      return;
    }

    if (!empresaId) return alert("Falta empresaId en sesión.");
    if (!mensajeroId) return;
    try {
      const m = mensajeros.find((x) => x.id === mensajeroId);

      const estadoActual = normalizeEstado(m?.estado || "disponible");
      const proximoEstado = estadoActual === "en_ruta" ? "en_ruta" : "listo_para_ruta";

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
          estado: proximoEstado,
          estadoUpdatedAt: serverTimestamp(),
          lastPingAt: serverTimestamp(),
        },
        { merge: true }
      );
      alert("Orden asignada ✅");
    } catch (e) {
      console.error("Asignar:", e?.code, e?.message);
      alert("No pude asignar la orden.");
    }
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
      await updateDoc(doc(db, COLEC, id), {
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
      await logCambioOrden({
        orderId: id,
        empresaId,
        antes,
        despues,
        actor,
        motivo: "Orden recibida",
      });
    } catch (e) {
      console.error("Recibida:", e?.code, e?.message);
      alert("No pude marcar como recibida.");
    }
  };

  const marcarComoEntregado = async (id) => {
    if (!empresaId) return alert("Falta empresaId en sesión.");
    if (!(rol === "administrador" || rol === "mensajero")) {
      return alert("Solo mensajero o administrador pueden marcar como entregado.");
    }

    const actor = getActor();
    const orden = ordenes.find((o) => o.id === id);
    if (!orden) return;

    const proofUrlEnDoc =
      orden?.proofUrl ||
      (Array.isArray(orden?.fotosPodUrls) &&
        orden.fotosPodUrls[orden.fotosPodUrls.length - 1]) ||
      null;
    if (!proofUrlEnDoc) {
      alert("Debes subir una foto de prueba de entrega antes de marcar como entregado.");
      return;
    }

    let minutos = null;
    try {
      const fr = orden.fechaRecibida?.toDate
        ? orden.fechaRecibida.toDate().getTime()
        : null;
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
      await updateDoc(doc(db, COLEC, id), {
        entregado: true,
        fechaEntregada: serverTimestamp(),
        tiempoTotalEntrega: minutos,
        proofUrl: proofUrlEnDoc, // importante para reglas
      });
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
      await logCambioOrden({
        orderId: id,
        empresaId,
        antes,
        despues,
        actor,
        motivo: "Orden entregada",
      });
    } catch (e) {
      console.error("Entregada:", e?.code, e?.message);
      alert("No pude marcar como entregada.");
    }
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
    // 🔒 Solo Admin/Operador
    if (!(rol === "administrador" || rol === "operador")) {
      alert("No tienes permisos para editar órdenes.");
      return;
    }

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
    };
    const despues = { ...orden, ...cambios };

    try {
      await updateDoc(doc(db, COLEC, ordenEnEdicion), cambios);
      await logCambioOrden({
        orderId: ordenEnEdicion,
        empresaId,
        antes,
        despues,
        actor,
        motivo: "Edición de orden",
      });
      setOrdenEnEdicion(null);
      alert("Orden actualizada ✅");
    } catch (e) {
      console.error("Editar:", e?.code, e?.message);
      alert("No pude actualizar la orden.");
    }
  };

  // ===== Búsqueda/Orden local =====
  const ordenesFiltradas = useMemo(() => {
    let base = filtroFecha
      ? ordenes.filter((o) => o.fecha === filtroFecha)
      : [...ordenes];

    const q = busqueda.trim().toLowerCase();
    if (q) {
      base = base.filter((o) => {
        const str = [o.cliente, o.telefono, o.numeroFactura, o.direccionTexto, o.address?.formatted]
          .map((v) => String(v || "").toLowerCase())
          .join(" | ");
        return str.includes(q);
      });
    }

    if (ordenarPor === "createdDesc") {
      base.sort((a, b) => createdMs(b) - createdMs(a));
    } else if (ordenarPor === "createdAsc") {
      base.sort((a, b) => createdMs(a) - createdMs(b));
    } else if (ordenarPor === "estado") {
      const weight = (o) => (o.entregado ? 2 : o.recibida ? 1 : 0);
      base.sort((a, b) => weight(a) - weight(b) || createdMs(b) - createdMs(a));
    }

    return base;
  }, [ordenes, filtroFecha, busqueda, ordenarPor]);

  // separar pendientes/entregadas para tabs
  const pendientes = useMemo(
    () => ordenesFiltradas.filter((o) => !o.entregado),
    [ordenesFiltradas]
  );
  const entregadas = useMemo(
    () => ordenesFiltradas.filter((o) => o.entregado),
    [ordenesFiltradas]
  );

  return (
    <div style={{ padding: 16 }}>
      {/* Encabezado */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h2 style={{ margin: 0 }}>📦 Órdenes de Entrega</h2>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn-ghost" onClick={() => navigate("/historial")}>📝 Historial</button>
          <button className="btn-ghost" onClick={() => navigate("/reportes")}>📊 Reportes</button>
          <button className="btn-ghost" onClick={() => navigate("/estadisticas")}>📈 Estadísticas</button>
        </div>
      </div>

      {/* Aviso de límite del plan (si aplica) */}
      {blockedByPlan && (
        <section className="card" style={{ marginTop: 12, borderColor: "#fde68a", background: "#fffbeb" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>⚠️ Alcanzaste el límite de órdenes de tu plan.</span>
            <button className="btn-ghost" onClick={() => navigate("/planes")}>Ver/Actualizar plan</button>
          </div>
        </section>
      )}

      {/* Formulario en card */}
      <section className="card" style={{ marginTop: 12 }}>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(3, minmax(220px, 1fr))" }}>
          <input type="text" placeholder="Cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} />
          <input type="text" placeholder="Teléfono del cliente" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          <input type="text" placeholder="Número de Factura" value={numeroFactura} onChange={(e) => setNumeroFactura(e.target.value)} />
          <input type="number" placeholder="Monto" value={monto} onChange={(e) => setMonto(e.target.value)} />
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
        </div>
        <div style={{ marginTop: 10 }}>
          <label className="muted" style={{ display: "block", marginBottom: 6 }}>
            <b>Dirección (escribir, mapa o importar link)</b>
          </label>
          <AddressInput value={address} onChange={setAddress} />
        </div>
        {(rol === "operador" || rol === "administrador") && (
          <button
            className="btn-primary"
            style={{ marginTop: 12 }}
            onClick={registrarOrden}
            disabled={saving || !address || blockedByPlan}
            title={blockedByPlan ? "Límite del plan alcanzado" : "Registrar orden"}
          >
            {saving ? "Guardando…" : (blockedByPlan ? "Límite alcanzado" : "Registrar orden")}
          </button>
        )}

        {rol === "administrador" && empresaId && (
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button className="btn-ghost" onClick={backfillEmpresaIdYCreatedAt} title="Rellena empresaId/createdAt a órdenes antiguas (una vez)">
              🛠️ Backfill empresaId & createdAt (una vez)
            </button>
            <span className="muted">Úsalo solo si migraste datos antiguos.</span>
          </div>
        )}
      </section>

      {/* Filtros */}
      <section className="card" style={{ marginTop: 12 }}>
        <h3 style={{ margin: "0 0 8px 0", fontSize: 16 }}>🔎 Filtros</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input type="date" value={filtroFecha} onChange={(e) => setFiltroFecha(e.target.value)} style={{ minWidth: 170 }} />
          <input type="text" placeholder="Buscar (cliente / factura / teléfono / dirección)…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
          <select value={ordenarPor} onChange={(e) => setOrdenarPor(e.target.value)}>
            <option value="createdDesc">Orden: más recientes</option>
            <option value="createdAsc">Orden: más antiguas</option>
            <option value="estado">Orden: por estado</option>
          </select>
        </div>
      </section>

      {/* Tabs */}
      <div
        style={{
          marginTop: 16,
          display: "flex",
          gap: 8,
          borderBottom: "1px solid var(--border)",
          paddingBottom: 8,
          alignItems: "flex-end",
        }}
      >
        <button
          onClick={() => setTab("pendientes")}
          className={tab === "pendientes" ? "tab tab-active" : "tab"}
          title="Órdenes que aún no están entregadas"
        >
          Pendientes ({pendientes.length})
        </button>
        <button
          onClick={() => setTab("entregadas")}
          className={tab === "entregadas" ? "tab tab-active" : "tab"}
          title="Órdenes ya entregadas"
        >
          Entregadas ({entregadas.length})
        </button>
      </div>

      {/* Listados */}
      {tab === "pendientes" ? (
        <>
          <h3 style={{ marginTop: 12, fontSize: 16 }}>⚡ En curso</h3>
          <ListaOrdenes
            items={pendientes}
            rol={rol}
            navigate={navigate}
            mensajeros={mensajeros}
            podSubiendo={podSubiendo}
            subirPOD={subirPOD}
            asignarOrden={asignarOrden}
            marcarComoRecibida={marcarComoRecibida}
            marcarComoEntregado={marcarComoEntregado}
            editarOrden={editarOrden}
          />
        </>
      ) : (
        <>
          <h3 style={{ marginTop: 12, fontSize: 16 }}>✅ Completadas</h3>
          <ListaOrdenes
            items={entregadas}
            rol={rol}
            navigate={navigate}
            mensajeros={mensajeros}
            podSubiendo={podSubiendo}
            subirPOD={subirPOD}
            asignarOrden={asignarOrden}
            marcarComoRecibida={marcarComoRecibida}
            marcarComoEntregado={marcarComoEntregado}
            editarOrden={editarOrden}
            esEntregadas
          />
        </>
      )}

      {/* Panel de edición */}
      {ordenEnEdicion && (
        <section className="card" style={{ marginTop: 16 }}>
          <h4 style={{ marginTop: 0 }}>✏️ Editar Orden</h4>
          <div
            style={{
              display: "grid",
              gap: 8,
              gridTemplateColumns: "repeat(3, minmax(220px,1fr))",
            }}
          >
            <input
              type="text"
              placeholder="Cliente"
              value={editCliente}
              onChange={(e) => setEditCliente(e.target.value)}
            />
            <input
              type="text"
              placeholder="Teléfono"
              value={editTelefono}
              onChange={(e) => setEditTelefono(e.target.value)}
            />
            <input
              type="text"
              placeholder="Número de Factura"
              value={editNumeroFactura}
              onChange={(e) => setEditNumeroFactura(e.target.value)}
            />
            <input
              type="number"
              placeholder="Monto"
              value={editMonto}
              onChange={(e) => setEditMonto(e.target.value)}
            />
          </div>

          <div style={{ marginTop: 10 }}>
            <label className="muted" style={{ display: "block", marginBottom: 6 }}>
              <b>Dirección</b>
            </label>
            <AddressInput value={editAddress} onChange={setEditAddress} />
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button className="btn-primary" onClick={guardarEdicion}>Guardar Cambios</button>
            <button className="btn-ghost" onClick={() => setOrdenEnEdicion(null)}>Cancelar</button>
          </div>
        </section>
      )}
    </div>
  );
}

/** Sub-lista reutilizable (pendientes / entregadas) — en TABLA limpia */
function ListaOrdenes({
  items,
  rol,
  navigate,
  mensajeros,
  podSubiendo,
  subirPOD,
  asignarOrden,
  marcarComoRecibida,
  marcarComoEntregado,
  editarOrden,
  esEntregadas = false,
}) {
  const gmapsUrl = (lat, lng) =>
    Number.isFinite(lat) && Number.isFinite(lng)
      ? `https://www.google.com/maps?q=${lat},${lng}`
      : null;
  const toNumOrNull = (v) => {
    const n = typeof v === "number" ? v : v != null ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const getCoords = (o) => {
    const lat = toNumOrNull(o?.destinoLat ?? o?.address?.lat);
    const lng = toNumOrNull(o?.destinoLng ?? o?.address?.lng);
    return { lat, lng };
  };
  const estadoOrden = (o) => (o.entregado ? "ENTREGADA" : o.recibida ? "RECIBIDA" : "PENDIENTE");

  return (
    <div style={{ marginTop: 8, overflowX: "auto" }}>
      {items.length ? (
        <table className="nice-table">
          <thead>
            <tr>
              <th>Fecha/Hora</th>
              <th>Cliente</th>
              <th>Factura</th>
              <th>Asignado</th>
              <th>Estado</th>
              <th>Dirección</th>
              <th>Mapa</th>
              <th style={{ width: 360 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((orden) => {
              const { lat, lng } = getCoords(orden);
              const sinCoords = !Number.isFinite(lat) || !Number.isFinite(lng);
              const gmaps = gmapsUrl(lat, lng);
              const estado = estadoOrden(orden);
              const tone =
                estado === "ENTREGADA" ? "ok" : estado === "RECIBIDA" ? "warn" : "danger";

              return (
                <tr key={orden.id}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {(orden.fecha || "—") + (orden.hora ? ` ${orden.hora}` : "")}
                  </td>
                  <td style={{ minWidth: 160, fontWeight: 600 }}>{orden.cliente || "—"}</td>
                  <td>{orden.numeroFactura || "—"}</td>
                  <td>{orden.asignadoNombre || <span className="muted">—</span>}</td>
                  <td><Chip tone={tone}>{estado}</Chip></td>
                  <td style={{ minWidth: 220 }}>
                    {orden.direccionTexto || orden.address?.formatted || "—"}
                  </td>
                  <td>
                    {!sinCoords ? (
                      <a href={gmaps} target="_blank" rel="noopener noreferrer">
                        Abrir
                      </a>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button className="btn-ghost" onClick={() => navigate(`/orden/${orden.id}`)}>👁️ Ver</button>

                      {!sinCoords ? (
                        <>
                          <button
                            className="btn-ghost"
                            onClick={() =>
                              navigate(`/mapa/${orden.id}`, {
                                state: {
                                  ordenId: orden.id,
                                  lat,
                                  lng,
                                  direccion:
                                    orden.direccionTexto ||
                                    orden.address?.formatted ||
                                    "",
                                  cliente: orden.cliente || "",
                                  numeroFactura: orden.numeroFactura || "",
                                  address: orden.address || null,
                                },
                              })
                            }
                          >
                            🗺️ Mapa
                          </button>
                          <button
                            className="btn-ghost"
                            onClick={() =>
                              navigate(`/ruta-mensajero/${orden.id}`, {
                                state: {
                                  ordenId: orden.id,
                                  lat,
                                  lng,
                                  direccion:
                                    orden.direccionTexto ||
                                    orden.address?.formatted ||
                                    "",
                                  cliente: orden.cliente || "",
                                  numeroFactura: orden.numeroFactura || "",
                                  address: orden.address || null,
                                },
                              })
                            }
                          >
                            🧭 Navegar
                          </button>
                        </>
                      ) : (
                        (rol === "operador" || rol === "administrador") && !orden.entregado && (
                          <button
                            className="btn-ghost"
                            onClick={() =>
                              navigate(`/seleccionar-destino/${orden.id}`, {
                                state: {
                                  ordenId: orden.id,
                                  direccion:
                                    orden.direccionTexto ||
                                    orden.address?.formatted ||
                                    "",
                                  address: orden.address || null,
                                },
                              })
                            }
                          >
                            📍 Fijar destino
                          </button>
                        )
                      )}

                      {/* Estado */}
                      {orden.entregado ? (
                        <span>✅</span>
                      ) : orden.recibida ? (
                        (rol === "administrador" || rol === "mensajero") && (
                          <button className="btn-primary" onClick={() => marcarComoEntregado(orden.id)}>
                            📬 Entregado
                          </button>
                        )
                      ) : (
                        (rol === "administrador" || rol === "mensajero") && (
                          <button className="btn-primary" onClick={() => marcarComoRecibida(orden.id)}>
                            ✅ Recibida
                          </button>
                        )
                      )}

                      {/* Subir POD */}
                      {(rol === "administrador" || rol === "mensajero") && !esEntregadas && (
                        <>
                          <input
                            id={`pod-file-${orden.id}`}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            style={{ display: "none" }}
                            onChange={(e) => {
                              const f = e.target.files?.[0] || null;
                              if (f) subirPOD(orden, f);
                              e.target.value = "";
                            }}
                          />
                          <button
                            className="btn-ghost"
                            onClick={() =>
                              document
                                .getElementById(`pod-file-${orden.id}`)
                                ?.click()
                            }
                            disabled={!!podSubiendo[orden.id]}
                            title="Subir prueba de entrega"
                          >
                            📷 POD {podSubiendo[orden.id] ? `(${podSubiendo[orden.id]}%)` : ""}
                          </button>
                        </>
                      )}

                      {/* Editar / Asignar */}
                      {(rol === "operador" || rol === "administrador") && !orden.entregado && (
                        <>
                          <button className="btn-ghost" onClick={() => editarOrden(orden)}>✏️ Editar</button>
                          <select
                            onChange={(e) => asignarOrden(orden.id, e.target.value)}
                            defaultValue=""
                            style={{ padding: 6, borderRadius: 8, border: "1px solid var(--border)" }}
                            title="Asignar a mensajero"
                          >
                            <option value="" disabled>
                              Asignar mensajero (disponible/en_ruta)…
                            </option>
                            {mensajeros
                              .filter((m) =>
                                OK_ESTADOS_ASIGNAR.has(normalizeEstado(m.estado))
                              )
                              .map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.nombre} — {normalizeEstado(m.estado)}
                                </option>
                              ))}
                          </select>
                        </>
                      )}

                      {Array.isArray(orden.fotosPodUrls) && orden.fotosPodUrls.length > 0 && (
                        <span className="muted">Fotos: {orden.fotosPodUrls.length}</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <section className="card" style={{ padding: 16, textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
            Sin resultados
          </div>
          <div className="muted">
            Ajusta los filtros o verifica que existan órdenes en este rango.
          </div>
        </section>
      )}
    </div>
  );
}

/* ===== Estilos suaves (inyectados una sola vez) ===== */
if (!document.getElementById("ordenes-entrega-soft-styles")) {
  const css = document.createElement("style");
  css.id = "ordenes-entrega-soft-styles";
  css.innerHTML = `
:root{
  --bg:#f7fafc;
  --card:#ffffff;
  --border:#eaecef;
  --text:#111827;
  --text-muted:#6b7280;
  --chip:#f5f7fa;

  --ok-bg:#ecfdf5; --ok-bd:#a7f3d0; --ok-tx:#047857;
  --warn-bg:#fff7ed; --warn-bd:#fed7aa; --warn-tx:#9a3412;
  --danger-bg:#fef2f2; --danger-bd:#fecaca; --danger-tx:#991b1b;
}
body{ background: var(--bg); color: var(--text); }

.card{
  border:1px solid var(--border);
  border-radius:12px;
  background:var(--card);
  padding:12px;
}

.muted{ color: var(--text-muted); font-size:12px; }

.btn-primary{
  background:#2563eb; color:#fff; border:none; padding:8px 12px; border-radius:8px; cursor:pointer;
}
.btn-primary:disabled{ opacity:.6; cursor:not-allowed; }
.btn-ghost{
  background:#ffffff; color:#111827; border:1px solid var(--border); padding:8px 12px; border-radius:8px; cursor:pointer;
}

.tab{
  background:transparent; border:none; padding:8px 12px; border-bottom:3px solid transparent; cursor:pointer;
}
.tab-active{ border-bottom-color:#2563eb; font-weight:700; }

table.nice-table{ width:100%; border-collapse:collapse; font-size:14px; }
.nice-table thead th{
  text-align:left; background:#fafafa; position:sticky; top:0; z-index:1;
  border-bottom:1px solid var(--border); padding:8px 10px;
}
.nice-table tbody td{
  border-bottom:1px solid #000000ff; padding:8px 10px;
}
input, select{
  padding:8px 10px; border:1px solid var(--border); border-radius:8px; width:100%; background:#fff;
}
`;
  document.head.appendChild(css);
}
