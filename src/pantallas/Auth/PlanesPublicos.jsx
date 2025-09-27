// src/pantallas/Auth/PlanesPublicos.jsx
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { db } from "../../firebaseConfig";
import { collection, getDocs, query, orderBy } from "firebase/firestore";

const cssOnceId = "planes-publicos-css";
if (!document.getElementById(cssOnceId)) {
  const css = document.createElement("style");
  css.id = cssOnceId;
  css.innerHTML = `
  .plan-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
  .card{border:1px solid #e5e7eb;border-radius:12px;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.04);padding:14px}
  .price{font-size:28px;font-weight:700}
  .btn{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px 14px;cursor:pointer}
  .btn:hover{background:#f8fafc}
  .btn.primary{background:#6366f1;border-color:#6366f1;color:#fff}
  .pill{display:inline-block;padding:6px 10px;border-radius:999px;border:1px solid #e5e7eb;background:#f8fafc;color:#374151;font-size:12px;font-weight:600}
  .seg-toggle{display:inline-flex;border:1px solid #e5e7eb;border-radius:999px;overflow:hidden}
  .seg-toggle button{border:0;padding:8px 12px;background:#fff;cursor:pointer}
  .seg-toggle button.active{background:#111;color:#fff}
  `;
  document.head.appendChild(css);
}

function getPrecioUSD(p){ const v = p?.precioUSD ?? p?.precioUsd ?? 0; const n = Number(v); return Number.isFinite(n) ? n : 0; }

export default function PlanesPublicos(){
  const [planes, setPlanes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState("mensual"); // mensual | anual
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const ref = collection(db, "planesCatalogo");
        let snap;
        try { snap = await getDocs(query(ref, orderBy("orden","asc"))); }
        catch { snap = await getDocs(ref); }
        const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setPlanes(arr);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const precioMostrado = (p) => {
    const base = getPrecioUSD(p);
    if (periodo === "anual") return base * 10; // 👈 2 meses de ahorro
    return base;
  };
  const etiquetaPeriodo = (p) => periodo === "anual" ? "/año (ahorras 2 meses)" : "/mes";

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <h2 style={{ margin:0 }}>💳 Planes</h2>
        <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
          <div className="seg-toggle" role="tablist" aria-label="Periodo de facturación">
            <button className={periodo==="mensual"?"active":""} onClick={()=>setPeriodo("mensual")}>Mensual</button>
            <button className={periodo==="anual"?"active":""} onClick={()=>setPeriodo("anual")}>Anual</button>
          </div>
          <Link className="btn" to="/login">Iniciar sesión</Link>
        </div>
      </div>

      {loading && <div style={{ marginTop:8 }}>Cargando…</div>}

      {!loading && (
        <div className="plan-grid" style={{ marginTop:12 }}>
          {planes.map(p => {
            const price = precioMostrado(p);
            return (
              <div key={p.id} className="card">
                <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
                  <h3 style={{ margin:0 }}>{p.nombre}</h3>
                  <div className="price">
                    {price === 0 ? "Gratis" : `$${price}`} <span style={{ fontSize:12 }}>{etiquetaPeriodo(p)}</span>
                  </div>
                </div>
                {Array.isArray(p.features) && p.features.length > 0 && (
                  <ul style={{ marginTop:8, paddingLeft:18 }}>
                    {p.features.map((f,i)=><li key={i}>{f}</li>)}
                  </ul>
                )}
                {p?.limites?.ordersPerMonth != null && (
                  <div className="pill" style={{ marginTop:8 }}>
                    Límite: <b>{p.limites.ordersPerMonth}</b> órdenes/mes
                  </div>
                )}
                <div style={{ marginTop:12 }}>
                  <button
                    className="btn primary"
                    onClick={() => navigate(`/registro-empresa?plan=${encodeURIComponent(p.id)}&periodo=${periodo}`)}
                  >
                    Comenzar con este plan
                  </button>
                </div>
              </div>
            );
          })}
          {!planes.length && (
            <div className="card">No hay planes configurados.</div>
          )}
        </div>
      )}
    </div>
  );
}
