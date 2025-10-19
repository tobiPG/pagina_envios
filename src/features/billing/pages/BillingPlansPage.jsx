// src/pantallas/PlanesFacturacion.jsx
import usePlan from "../../../shared/hooks/usePlan";
import { Link } from "react-router-dom";

const CARD = { border:"1px solid #e5e7eb46", borderRadius:12, padding:16, background:"#e2cfcfff" };

function Progress({ pct }) {
  return (
    <div style={{background:"#eef2ff24", borderRadius:999, height:10, overflow:"hidden"}}>
      <div style={{width:`${pct}%`, height:"100%", background:"#6366f1"}} />
    </div>
  );
}

export default function PlanesFacturacion() {
  const { loading, error, plan, planName, price, ordersPerMonth, retentionDays, monthKey, used, pct, changePlan, metaByPlan } = usePlan();

  const plans = [
    { key:"free",    ...metaByPlan.free,    badge:"Gratis" },
    { key:"starter", ...metaByPlan.starter, badge:"Popular" },
    { key:"pro",     ...metaByPlan.pro,     badge:"Pro" },
  ];

  return (
    <div style={{ padding:16 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <h2 style={{ margin:0 }}>💳 Planes & Facturación</h2>
        <div style={{ marginLeft:"auto" }}><Link to="/dashboard">← Volver</Link></div>
      </div>

      {loading && <div style={{ marginTop:12 }}>Cargando…</div>}
      {error && <div style={{ marginTop:12, color:"#b00" }}>{error}</div>}

      {!loading && !error && (
        <>
          <section style={{ ...CARD, marginTop:12 }}>
            <h3 style={{ marginTop:0 }}>Resumen del plan actual</h3>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2,minmax(240px,1fr))", gap:16 }}>
              <div>
                <div><b>Plan:</b> {planName} <span style={{ color:"#64748b" }}>({plan})</span></div>
                <div><b>Precio:</b> {price === 0 ? "Gratis" : `$${price}/mes`}</div>
                <div><b>Retención de POD:</b> {retentionDays} días</div>
              </div>
              <div>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <b>Órdenes del mes ({monthKey || "—"})</b>
                  <span>{used} / {ordersPerMonth} ({pct}%)</span>
                </div>
                <Progress pct={pct} />
              </div>
            </div>
          </section>

          <section style={{ marginTop:16 }}>
            <h3 style={{ margin:"8px 0" }}>Cambiar de plan</h3>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:16 }}>
              {plans.map(p => {
                const active = plan === p.key;
                return (
                  <div key={p.key} style={CARD}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <h4 style={{ margin:0 }}>{p.name}</h4>
                      <span style={{ fontSize:12, background:"#6da1d5ff", border:"1px solid #4677aeff", padding:"2px 8px", borderRadius:999 }}>{p.badge}</span>
                    </div>
                    <div style={{ fontSize:28, fontWeight:700, margin:"8px 0" }}>
                      {p.price === 0 ? "Gratis" : `$${p.price}/mes`}
                    </div>
                    <ul style={{ margin:0, paddingLeft:16, color:"#334155", minHeight:72 }}>
                      <li><b>{p.ordersPerMonth.toLocaleString()}</b> órdenes / mes</li>
                      <li>Retención <b>{p.retentionDays}</b> días</li>
                      <li>Soporte {p.key === "pro" ? "prioritario" : "básico"}</li>
                    </ul>
                    <div style={{ marginTop:12 }}>
                      {active ? (
                        <button disabled style={{ padding:"8px 12px", borderRadius:10, border:"1px solid #e5e7eb", background:"#e5e7eb", cursor:"default" }}>Plan actual</button>
                      ) : (
                        <button
                          style={{ padding:"8px 12px", borderRadius:10, border:"1px solid #2563eb", background:"#2563eb", color:"#fff", cursor:"pointer" }}
                          onClick={async () => {
                            try { await changePlan(p.key); alert(`Plan cambiado a ${p.name}`); }
                            catch (e) { alert(e?.message || "No se pudo cambiar el plan"); }
                          }}
                        >
                          Cambiar a {p.name}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop:12, fontSize:12, color:"#6b7280" }}>
              Próximamente: checkout con Stripe y facturación automática. Por ahora el cambio es inmediato y aplica límites/retención al instante.
            </div>
          </section>
        </>
      )}
    </div>
  );
}
