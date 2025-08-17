// src/pantallas/Auth/PlanSeleccion.jsx
import { useMemo, useState, useEffect } from "react";
import { db } from "../../firebaseConfig";
import { doc, getDoc, setDoc } from "firebase/firestore";

function PlanSeleccion() {
  const usuario = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("usuarioActivo") || "null"); }
    catch { return null; }
  }, []);

  const empresaId = usuario?.empresaId || null;
  const rol = String(usuario?.rol || "").toLowerCase();

  const [plan, setPlan] = useState("basic");
  const [nombreEmpresa, setNombreEmpresa] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!empresaId) { setLoading(false); return; }
      setError("");
      try {
        const ref = doc(db, "empresas", empresaId);
        const snap = await getDoc(ref);
        if (mounted) {
          const data = snap.data() || {};
          setPlan(data.plan || "basic");
          setNombreEmpresa(data.nombre || "");
        }
      } catch (e) {
        if (mounted) setError("No pude leer los datos de la empresa.");
        console.error("PlanSeleccion getDoc:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [empresaId]);

  const guardar = async () => {
    if (!empresaId) return alert("No hay empresa asociada a tu sesión.");
    if (rol !== "administrador") return alert("Solo el administrador puede cambiar el plan.");
    setSaving(true);
    setError("");
    try {
      await setDoc(
        doc(db, "empresas", empresaId),
        { plan, updatedAt: new Date() },
        { merge: true }
      );
      alert("Plan actualizado ✅");
    } catch (e) {
      console.error("PlanSeleccion setDoc:", e);
      setError("No pude actualizar el plan. Revisa permisos/reglas.");
    } finally {
      setSaving(false);
    }
  };

  if (!empresaId) return <div style={{ padding: 20 }}>Debes iniciar sesión para ver esta página.</div>;
  if (rol !== "administrador") return <div style={{ padding: 20 }}>403 — Solo el <b>administrador</b> puede gestionar el plan.</div>;

  return (
    <div style={{ maxWidth: 560, margin: "30px auto", padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Plan de la empresa</h2>
      {loading ? (
        <div>Cargando…</div>
      ) : (
        <>
          <div style={{ marginBottom: 8 }}>
            <div><b>Empresa:</b> {nombreEmpresa || <i>(sin nombre)</i>}</div>
            <div><b>ID:</b> <code>{empresaId}</code></div>
          </div>

          {error && <div style={{ color: "#b00", margin: "8px 0" }}>{error}</div>}

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr auto", alignItems: "center", maxWidth: 520 }}>
            <div>
              <label style={{ display: "block", marginBottom: 6 }}><b>Selecciona un plan</b></label>
              <select value={plan} onChange={(e) => setPlan(e.target.value)} disabled={saving} style={{ padding: 8, width: "100%" }}>
                <option value="basic">Basic — para empezar</option>
                <option value="pro">Pro — más volumen y funciones</option>
                <option value="enterprise">Enterprise — multi-sucursales y SLAs</option>
              </select>
              <p style={{ fontSize: 12, color: "#666", marginTop: 6 }}>(* La integración de pago con Stripe se añadirá después.)</p>
            </div>

            <button onClick={guardar} disabled={saving} style={{ height: 40 }}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default PlanSeleccion; // 👈 exportación por defecto asegurada
