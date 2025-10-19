// src/features/orders/pages/OrderFormPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db, functions } from "../../../shared/services/firebase.js"; // 👈 usa la instancia centralizada (con región)
import { ensureUsuarioActivo } from "../../../shared/utils/ensureUsuario";
import { httpsCallable } from "firebase/functions";

/** Estilos suaves reutilizables */
function injectCssOnce() {
  try {
    if (document.getElementById("ordenFormCss")) return;
    const css = document.createElement("style");
    css.id = "ordenFormCss";
    css.innerHTML = `
      .card{border:1px solid #e5e7eb;border-radius:12px;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.04);padding:12px}
      .row{display:grid;gap:12px}
      .row.cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}
      .row.cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}
      .row.cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}
      label{font-size:12px;color:#475569;font-weight:600}
      input[type="text"],input[type="tel"],input[type="number"],input[type="date"],input[type="time"],input[type="datetime-local"],textarea,select{
        width:100%;padding:8px 10px;border-radius:10px;border:1px solid #e5e7eb;background:#fff;color:#111827
      }
      .help{font-size:12px;color:#64748b}
      .btn{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px 14px;cursor:pointer}
      .btn:hover{background:#f8fafc}
      .btn.primary{background:#6366f1;border-color:#6366f1;color:#fff}
      .btn.danger{background:#ef4444;border-color:#ef4444;color:#fff}
      .pill{display:inline-block;padding:6px 10px;border-radius:999px;border:1px solid #e5e7eb;background:#f8fafc;color:#374151;font-size:12px;font-weight:600}
      .pill.info{background:#eef2ff;border-color:#c7d2fe;color:#3730a3}
      .err{color:#b91c1c;font-size:13px}
      .ok{color:#065f46;font-size:13px}
      .toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    `;
    document.head.appendChild(css);
  } catch {}
}
injectCssOnce();

/** Helpers */
const toNumOrNull = (v) => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const nonEmpty = (s) => String(s || "").trim() !== "";

/** Mejor presentación de errores Firebase */
function humanFirebaseError(e, fallback = "No se pudo completar la operación") {
  const code = e?.code || "";
  const msg  = e?.message || "";
  const det  = e?.details ? ` | details: ${JSON.stringify(e.details)}` : "";
  if (code.includes("permission-denied")) return "Permiso denegado. Revisa reglas o tu rol.";
  if (code.includes("unauthenticated"))   return "Debes iniciar sesión.";
  if (code.includes("not-found"))         return "Recurso/función no encontrado (despliega createOrder).";
  if (code.includes("unavailable"))       return "Servicio no disponible (intenta de nuevo).";
  if (code.includes("invalid-argument"))  return `Datos inválidos: ${msg.replace(/^.*: /,"")}`;
  if (/cors|preflight|access-control-allow-origin/i.test(msg)) return "CORS/Región: usa getFunctions(app, 'us-central1') en firebaseConfig.";
  if (code.includes("internal"))          return `Error interno en Cloud Functions. ${msg}${det}`;
  return `${fallback}${code ? ` (${code})` : ""}${msg ? `: ${msg}` : ""}`;
}

/** Registro de cambios (opcional si tienes util global) */
async function safeLogCambio({ orderId, empresaId, antes, despues, actor }) {
  try {
    if (typeof window?.logCambioOrden === "function") {
      const campos = [
        "cliente","telefono","numeroFactura","monto",
        "direccionTexto","address","destinoLat","destinoLng",
        "fecha","hora","prioridad","ventanaInicioStop","ventanaFinStop",
        "programacionId","programaEntregaId","ordenIndex"
      ];
      const cambios = [];
      for (const k of campos) {
        const a = antes?.[k];
        const b = despues?.[k];
        const sa = JSON.stringify(a ?? null);
        const sb = JSON.stringify(b ?? null);
        if (sa !== sb) cambios.push({ campo: k, antes: a ?? null, despues: b ?? null });
      }
      await window.logCambioOrden({
        orderId, empresaId, cambios,
        actorNombre: actor?.nombre || "",
        actorRol: actor?.rol || "",
        motivo: actor?.motivo || "",
      });
    }
  } catch (e) {
    console.warn("safeLogCambio (ignorado):", e);
  }
}

export default function OrdenForm() {
  const navigate = useNavigate();
  const { id } = useParams(); // si existe => edición
  const isEdit = !!id;

  // Usuario & permisos
  const usuario = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("usuarioActivo") || "null"); } catch { return null; }
  }, []);
  const empresaId = usuario?.empresaId != null ? String(usuario.empresaId) : null;
  const rol = String(usuario?.rol || "").toLowerCase();
  const puedeEditar =
    ["admin","administrador","administrator","operador","operator"].includes(rol);

  // Estado del formulario
  const [form, setForm] = useState({
    cliente: "",
    telefono: "",
    numeroFactura: "",
    monto: "",
    direccionTexto: "",
    addressLat: "",
    addressLng: "",
    fecha: "",
    hora: "",
    prioridad: 3, // 1-5
    ventanaInicioStop: "", // datetime-local
    ventanaFinStop: "",    // datetime-local
    programacionId: "",
  });
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [motivoCambio, setMotivoCambio] = useState(""); // sólo edición

  // Cloud Function onCall centralizada (con región correcta desde firebaseConfig)
  const createOrderFn = useMemo(() => httpsCallable(functions, "createOrder"), []);

  // Cargar documento si edición
  useEffect(() => {
    (async () => {
      if (!isEdit) return;
      const ok = await ensureUsuarioActivo();
      if (!ok) { setError("No autenticado."); setLoading(false); return; }
      try {
        const ref = doc(db, "ordenes", id);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setError("No encontré la orden.");
          setLoading(false);
          return;
        }
        const d = snap.data();
        setForm({
          cliente: d.cliente || "",
          telefono: d.telefono || "",
          numeroFactura: d.numeroFactura || "",
          monto: d.monto ?? "",
          direccionTexto: d.direccionTexto || d.address?.formatted || "",
          addressLat: d.address?.lat ?? d.destinoLat ?? "",
          addressLng: d.address?.lng ?? d.destinoLng ?? "",
          fecha: d.fecha || "",
          hora: d.hora || "",
          prioridad: d.prioridad ?? 3,
          ventanaInicioStop: d.ventanaInicioStop || "",
          ventanaFinStop: d.ventanaFinStop || "",
          programacionId: d.programacionId || d.programaEntregaId || "",
        });
      } catch (e) {
        console.error(e);
        setError(humanFirebaseError(e, "Error cargando orden"));
      } finally {
        setLoading(false);
      }
    })();
  }, [isEdit, id]);

  // Validaciones
  const errs = useMemo(() => {
    const e = {};
    if (!nonEmpty(form.cliente)) e.cliente = "Requerido";
    if (!nonEmpty(form.numeroFactura)) e.numeroFactura = "Requerido";
    if (form.monto !== "" && toNumOrNull(form.monto) == null) e.monto = "Monto inválido";
    if (form.prioridad != null) {
      const p = Number(form.prioridad);
      if (!Number.isFinite(p) || p < 1 || p > 5) e.prioridad = "Prioridad debe estar entre 1 y 5";
    }
    if (nonEmpty(form.ventanaInicioStop) && nonEmpty(form.ventanaFinStop)) {
      const a = new Date(form.ventanaInicioStop).getTime();
      const b = new Date(form.ventanaFinStop).getTime();
      if (Number.isFinite(a) && Number.isFinite(b) && a > b) e.ventanas = "Inicio no puede ser mayor que Fin";
    }
    return e;
  }, [form]);

  const canSave = puedeEditar && !saving && Object.keys(errs).length === 0;
  const setF = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  async function onSubmit(e) {
    e?.preventDefault?.();
    setError("");
    setOkMsg("");

    if (!puedeEditar) { setError("Tu rol no puede crear/editar órdenes."); return; }
    if (Object.keys(errs).length) return;

    // 👇 si no hay empresaId, más vale avisar antes de llamar CF (evita INTERNAL del backend)
    if (!empresaId) { setError("Falta empresaId en tu perfil. Crea tu empresa o vuelve a iniciar sesión."); return; }

    const base = {
      cliente: form.cliente.trim(),
      telefono: form.telefono.trim(),
      numeroFactura: form.numeroFactura.trim(),
      monto: toNumOrNull(form.monto),
      direccionTexto: form.direccionTexto.trim(),
      address: {
        lat: toNumOrNull(form.addressLat),
        lng: toNumOrNull(form.addressLng),
        formatted: form.direccionTexto.trim() || undefined,
      },
      fecha: form.fecha || "",
      hora: form.hora || "",
      prioridad: Number(form.prioridad),
      ventanaInicioStop: form.ventanaInicioStop || "",
      ventanaFinStop: form.ventanaFinStop || "",
      programacionId: form.programacionId || "",
      empresaId: empresaId,
    };

    try {
      setSaving(true);
      const ok = await ensureUsuarioActivo();
      if (!ok) throw new Error("No autenticado.");

      if (!isEdit) {
        // === CREAR (por Cloud Function: respeta límites del plan) ===
        const res = await createOrderFn(base);
        const newId = res?.data?.id;
        if (!newId) throw new Error("La función createOrder no devolvió el ID de la nueva orden.");

        setOkMsg("Orden creada ✅");
        await safeLogCambio({
          orderId: newId,
          empresaId,
          antes: {},
          despues: base,
          actor: { nombre: usuario?.nombre, rol: usuario?.rol, motivo: "Creación" },
        });

        navigate(`/orden/${newId}`, { replace: true });
      } else {
        // === EDITAR (update directo) ===
        const ref = doc(db, "ordenes", id);
        const snap = await getDoc(ref);
        const before = snap.exists() ? snap.data() : {};

        const update = {
          cliente: base.cliente,
          telefono: base.telefono,
          numeroFactura: base.numeroFactura,
          monto: base.monto,
          direccionTexto: base.direccionTexto,
          address: base.address,
          fecha: base.fecha,
          hora: base.hora,
          prioridad: base.prioridad,
          ventanaInicioStop: base.ventanaInicioStop,
          ventanaFinStop: base.ventanaFinStop,
          programacionId: base.programacionId,
          programaEntregaId: base.programacionId || "",
          editadoAt: serverTimestamp(),
          editadoPorUid: usuario?.uid || null,
          editadoPorNombre: usuario?.nombre || null,
        };

        await updateDoc(ref, update);
        setOkMsg("Orden actualizada ✅");

        await safeLogCambio({
          orderId: id,
          empresaId,
          antes: before,
          despues: { ...before, ...update },
          actor: { nombre: usuario?.nombre, rol: usuario?.rol, motivo: motivoCambio?.trim() || "Edición de datos" },
        });
      }
    } catch (e) {
      console.error(e);
      const msg = e?.message || "";
      if (/resource-exhausted|quota|límite|limite|plan/i.test(msg)) {
        setError("No se pudo crear: alcanzaste el límite de órdenes del plan.");
      } else if (/permission|auth/i.test(msg)) {
        setError("Permiso denegado o sesión inválida.");
      } else {
        setError(humanFirebaseError(e, "No se pudo guardar la orden"));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 1000, margin: "0 auto" }}>
      <div className="toolbar" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>{isEdit ? "✏️ Editar orden" : "➕ Nueva orden"}</h2>
        <span className="pill info">Prioridad · ventanas de atención · datos del cliente</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Link className="btn" to="/ordenes">&larr; Volver</Link>
          {isEdit && <Link className="btn" to={`/orden/${id}`}>Ver detalle</Link>}
        </div>
      </div>

      {!puedeEditar && <div className="err" style={{ marginBottom: 8 }}>Tu rol no puede crear/editar órdenes.</div>}
      {error && <div className="err" style={{ marginBottom: 8 }}>{error}</div>}
      {okMsg && <div className="ok" style={{ marginBottom: 8 }}>{okMsg}</div>}

      {loading ? (
        <div>Cargando…</div>
      ) : (
        <form onSubmit={onSubmit} className="card">
          <div className="row cols-3">
            <div>
              <label>Cliente *</label>
              <input type="text" value={form.cliente} onChange={(e) => setF("cliente", e.target.value)} />
              {errs.cliente && <div className="err">{errs.cliente}</div>}
            </div>
            <div>
              <label>Teléfono</label>
              <input type="tel" value={form.telefono} onChange={(e) => setF("telefono", e.target.value)} />
            </div>
            <div>
              <label>Factura *</label>
              <input type="text" value={form.numeroFactura} onChange={(e) => setF("numeroFactura", e.target.value)} />
              {errs.numeroFactura && <div className="err">{errs.numeroFactura}</div>}
            </div>
          </div>

          <div className="row cols-3" style={{ marginTop: 12 }}>
            <div>
              <label>Monto</label>
              <input type="number" step="0.01" value={form.monto} onChange={(e) => setF("monto", e.target.value)} />
              {errs.monto && <div className="err">{errs.monto}</div>}
            </div>
            <div>
              <label>Fecha</label>
              <input type="date" value={form.fecha} onChange={(e) => setF("fecha", e.target.value)} />
            </div>
            <div>
              <label>Hora</label>
              <input type="time" value={form.hora} onChange={(e) => setF("hora", e.target.value)} />
            </div>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <div>
              <label>Dirección (texto)</label>
              <input
                type="text"
                placeholder="Calle, número, referencias…"
                value={form.direccionTexto}
                onChange={(e) => setF("direccionTexto", e.target.value)}
              />
              <div className="help">Puedes seleccionar coordenadas más abajo o desde el mapa del detalle.</div>
            </div>
          </div>

          <div className="row cols-3" style={{ marginTop: 12 }}>
            <div>
              <label>Latitud</label>
              <input type="number" step="any" value={form.addressLat} onChange={(e) => setF("addressLat", e.target.value)} />
            </div>
            <div>
              <label>Longitud</label>
              <input type="number" step="any" value={form.addressLng} onChange={(e) => setF("addressLng", e.target.value)} />
            </div>
            <div>
              <label>Prioridad (1–5)</label>
              <input type="number" min={1} max={5} value={form.prioridad} onChange={(e) => setF("prioridad", e.target.value)} />
              {errs.prioridad && <div className="err">{errs.prioridad}</div>}
            </div>
          </div>

          <div className="row cols-2" style={{ marginTop: 12 }}>
            <div>
              <label>Ventana: inicio</label>
              <input
                type="datetime-local"
                value={form.ventanaInicioStop}
                onChange={(e) => setF("ventanaInicioStop", e.target.value)}
              />
            </div>
            <div>
              <label>Ventana: fin</label>
              <input
                type="datetime-local"
                value={form.ventanaFinStop}
                onChange={(e) => setF("ventanaFinStop", e.target.value)}
              />
            </div>
            {errs.ventanas && <div className="err" style={{ gridColumn: "1 / -1" }}>{errs.ventanas}</div>}
          </div>

          <div className="row cols-2" style={{ marginTop: 12 }}>
            <div>
              <label>ID de Programación (opcional)</label>
              <input type="text" value={form.programacionId} onChange={(e) => setF("programacionId", e.target.value)} />
            </div>
            {isEdit ? (
              <div>
                <label>Motivo del cambio (auditoría)</label>
                <input
                  type="text"
                  placeholder="Ej: Corrección de horario"
                  value={motivoCambio}
                  onChange={(e) => setMotivoCambio(e.target.value)}
                />
              </div>
            ) : (
              <div className="help" style={{ display: "flex", alignItems: "end" }}>
                La creación valida el plan y queda auditada.
              </div>
            )}
          </div>

          <div className="toolbar" style={{ marginTop: 16 }}>
            <button type="submit" className={`btn primary`} disabled={!canSave}>
              {saving ? "Guardando…" : (isEdit ? "Guardar cambios" : "Crear orden")}
            </button>
            {isEdit && (
              <Link className="btn" to={`/mapa/${id}`}>Ver en mapa</Link>
            )}
            <div style={{ marginLeft: "auto" }} className="help">
              Empresa: <b>{empresaId || "—"}</b> · Rol: <b>{usuario?.rol || "—"}</b>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
