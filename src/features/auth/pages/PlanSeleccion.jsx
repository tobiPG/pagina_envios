// src/pantallas/Auth/PlanSeleccion.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { db, functions } from "../../../shared/services/firebase.js";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { ensureUsuarioActivo } from "../../../shared/utils/ensureUsuario";
import { httpsCallable } from "firebase/functions";

// --- CSS once ---
let cssInjected = false;
function injectCss() {
  if (cssInjected) return;
  cssInjected = true;
  const css = document.createElement("style");
  css.innerHTML = `
    .plan-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
    .card{border:1px solid #e5e7eb;border-radius:12px;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.04);padding:14px}
    .price{font-size:28px;font-weight:700}
    .subprice{font-size:12px;color:#64748b;margin-top:-6px}
    .btn{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px 14px;cursor:pointer}
    .btn:hover{background:#f8fafc}
    .btn.primary{background:#6366f1;border-color:#6366f1;color:#fff}
    .pill{display:inline-block;padding:6px 10px;border-radius:999px;border:1px solid #e5e7eb;background:#f8fafc;color:#374151;font-size:12px;font-weight:600}
    .ok{color:#065f46}
    .err{color:#b91c1c}
    .meter{height:8px;border-radius:999px;background:#eef2ff;overflow:hidden}
    .meter > span{display:block;height:100%;background:#6366f1}
    .toggle{display:inline-flex;border:1px solid #e5e7eb;border-radius:999px;overflow:hidden}
    .toggle > button{padding:6px 12px;border:none;background:#fff;cursor:pointer}
    .toggle > button.active{background:#6366f1;color:#fff}
  `;
  document.head.appendChild(css);
}
injectCss();

// Normaliza números/campos del catálogo
function getPrecio(p) {
  const v = p?.precioUSD ?? p?.precioUsd ?? 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function getLimitOrders(p) {
  const v = p?.limites?.ordersPerMonth ?? p?.limites?.ordenesMes ?? null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Etiquetas de precio según ciclo (anual = 10× mensual -> 2 meses gratis)
function priceLabels(monthlyPrice, billingCycle) {
  if (!monthlyPrice) return { main: "Gratis", sub: "" };
  if (billingCycle === "annual") {
    const yearly = Math.round(monthlyPrice * 10);     // 12 - 2 meses
    const monthlyEq = Math.round(yearly / 12);
    return { main: `$${yearly}/año`, sub: `≈ $${monthlyEq}/mes (2 meses gratis)` };
  }
  return { main: `$${monthlyPrice}/mes`, sub: "" };
}

export default function PlanSeleccion() {
  const navigate = useNavigate();

  // sesión
  const usuario = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("usuarioActivo") || "null"); } catch { return null; }
  }, []);
  const empresaId = usuario?.empresaId != null ? String(usuario.empresaId) : null;
  const rol = String(usuario?.rol || "").toLowerCase();
  const isAdmin = ["admin","administrador","administrator"].includes(rol);

  const [planes, setPlanes] = useState([]);
  const [myPlan, setMyPlan] = useState(null); // { ok, plan, catalog, consumo }
  const [loading, setLoading] = useState(true);
  const [choosing, setChoosing] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [billingCycle, setBillingCycle] = useState("monthly"); // 'monthly' | 'annual'

  // Callables (una sola vez)
  const ensurePlansCatalog = httpsCallable(functions, "ensurePlansCatalog");
  const getMyPlanFn       = httpsCallable(functions, "getMyPlan");
  const choosePlanFn      = httpsCallable(functions, "choosePlan");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");
      const ok = await ensureUsuarioActivo();
      if (!ok) { setErr("No autenticado."); setLoading(false); return; }

      try {
        // 1) Catálogo
        const ref = collection(db, "planesCatalogo");
        let arr = [];
        try {
          const snap = await getDocs(query(ref, orderBy("orden","asc")));
          arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch {
          const snap = await getDocs(ref);
          arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
        setPlanes(arr);

        // 2) Plan actual (CF)
        const res = await getMyPlanFn({});
        if (res?.data?.ok) {
          setMyPlan(res.data);
        } else {
          setErr("No se pudo obtener el plan actual.");
        }
      } catch (e) {
        console.error(e);
        const msg = String(e?.message || "");
        if (/cors|failed|preflight|access-control-allow-origin/i.test(msg)) {
          setErr("No pude consultar Cloud Functions (CORS). Revisa que las funciones estén desplegadas y que la región coincida.");
        } else if (/internal/i.test(msg)) {
          setErr("Error interno al consultar funciones. Verifica que 'getMyPlan' esté desplegada en la región correcta.");
        } else {
          setErr(msg || "Error cargando planes.");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function ensureCatalog() {
    try {
      await ensurePlansCatalog({});
      alert("Catálogo asegurado ✅");
      // recargar catálogo
      const ref = collection(db, "planesCatalogo");
      const snap = await getDocs(query(ref, orderBy("orden","asc")));
      setPlanes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      setErr(e?.message || "No pude sembrar el catálogo");
    }
  }

  async function choose(planId, cycle) {
    if (!isAdmin) return alert("Solo el administrador puede elegir plan.");
    if (!confirm(`¿Confirmas activar este plan (${cycle === "annual" ? "ANUAL - 2 meses gratis" : "MENSUAL"}) para tu empresa?`)) return;
    try {
      setChoosing(true);
      const res = await choosePlanFn({ planId, cycle }); // el backend puede ignorar 'cycle' si aún no lo usas
      if (res?.data?.ok) {
        setMsg("Plan activado correctamente ✅");
        const r2 = await getMyPlanFn({});
        if (r2?.data?.ok) setMyPlan(r2.data);
      } else {
        setErr("No se pudo activar el plan.");
      }
    } catch (e) {
      console.error(e);
      const msg = String(e?.message || "");
      if (/cors|failed|preflight|access-control-allow-origin/i.test(msg)) {
        setErr("No pude llamar a Cloud Functions (CORS).");
      } else {
        setErr(msg || "Error al activar plan.");
      }
    } finally {
      setChoosing(false);
    }
  }

  const currentPlanId = myPlan?.plan?.planId || null;
  const consumo = myPlan?.consumo || null; // { yyyymm, ordenesCreadas, ... }
  const cat = myPlan?.catalog || null;
  const limitOrders = cat ? getLimitOrders(cat) : null;

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>🧩 Plan y consumo</h2>
        <div className="toggle" style={{ marginLeft: 8 }}>
          <button
            className={billingCycle === "monthly" ? "active" : ""}
            onClick={() => setBillingCycle("monthly")}
          >
            Mensual
          </button>
          <button
            className={billingCycle === "annual" ? "active" : ""}
            onClick={() => setBillingCycle("annual")}
            title="Paga 10 meses, obtén 12 (2 gratis)"
          >
            Anual −2 meses
          </button>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Link className="btn" to={isAdmin ? "/dashboard" : "/ordenes"}>&larr; Volver</Link>
          {isAdmin && <button className="btn" onClick={ensureCatalog}>Asegurar catálogo</button>}
        </div>
      </div>

      {empresaId && <div style={{ marginTop: 6 }} className="pill">Empresa: <b>{empresaId}</b></div>}
      {currentPlanId && (
        <div style={{ marginTop: 6 }} className="pill">
          Plan actual: <b>{cat?.nombre || currentPlanId}</b>
        </div>
      )}

      {/* Consumo actual si viene desde getMyPlan */}
      {consumo && (
        <div className="card" style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Consumo del mes {consumo.yyyymm}</div>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
            <div>
              <div style={{ fontSize: 13, marginBottom: 4 }}>
                Órdenes creadas {limitOrders != null ? `(límite ${limitOrders})` : ""}
              </div>
              <div className="meter">
                <span
                  style={{
                    width: `${Math.min(100, limitOrders ? (100 * (Number(consumo.ordenesCreadas||0) / Math.max(1, limitOrders))) : 0)}%`
                  }}
                />
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                <b>{Number(consumo.ordenesCreadas||0)}</b> / {limitOrders ?? "—"}
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && <div style={{ marginTop: 8 }}>Cargando…</div>}
      {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
      {msg && <div className="ok" style={{ marginTop: 8 }}>{msg}</div>}

      {!loading && (
        <>
          <h3 style={{ marginTop: 16 }}>Selecciona un plan</h3>
          <div className="plan-grid">
            {planes.map(p => {
              const monthly = getPrecio(p);
              const { main, sub } = priceLabels(monthly, billingCycle);
              const limit = getLimitOrders(p);
              return (
                <div key={p.id} className="card">
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <h4 style={{ margin: 0 }}>{p.nombre}</h4>
                    <div className="price">{main}</div>
                  </div>
                  {billingCycle === "annual" && sub && <div className="subprice">{sub}</div>}
                  <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                    {(p.features || []).map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                  {limit != null && (
                    <div className="pill" style={{ marginTop: 8 }}>
                      Límite: <b>{limit}</b> órdenes/mes
                    </div>
                  )}
                  {billingCycle === "annual" && (
                    <div className="pill" style={{ marginTop: 6 }}>
                      2 meses gratis (paga 10)
                    </div>
                  )}
                  <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                    {currentPlanId === p.id ? (
                      <button className="btn" disabled>Plan activo</button>
                    ) : (
                      <button
                        className="btn primary"
                        onClick={() => choose(p.id, billingCycle)}
                        disabled={choosing || !isAdmin}
                        title={isAdmin ? "Activar este plan" : "Solo el admin puede cambiar el plan"}
                      >
                        {choosing ? "Activando…" : `Elegir ${billingCycle === "annual" ? "anual" : "mensual"}`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {!planes.length && (
              <div className="card">
                No hay planes en catálogo. {isAdmin && <>Haz clic en <b>Asegurar catálogo</b> arriba.</>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
