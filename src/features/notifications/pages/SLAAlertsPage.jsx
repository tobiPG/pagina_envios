// src/pantallas/AlertasSLA.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "../../../shared/services/firebase.js";
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
  orderBy,
} from "firebase/firestore";
import { ensureUsuarioActivo } from "../../../shared/utils/ensureUsuario";

/** Helpers */
function todayISO(d = new Date()) { const x = new Date(d); x.setHours(0,0,0,0); return x.toISOString().slice(0,10); }
function tsToMs(ts){ try{
  if(!ts) return NaN;
  if(typeof ts?.toDate==="function") return ts.toDate().getTime();
  if(typeof ts?.seconds==="number") return ts.seconds*1000 + Math.floor((ts.nanoseconds||0)/1e6);
  if(ts instanceof Date) return ts.getTime();
  if(typeof ts==="number") return ts;
  if(typeof ts==="string"){ const m = new Date(ts).getTime(); if(Number.isFinite(m)) return m; }
} catch{} return NaN; }
function msProgramada(o){
  const f = (o?.fecha||"").trim(); const h = (o?.hora||"").trim();
  if(!f) return NaN;
  const hhmm = /^\d{2}:\d{2}$/.test(h) ? h : "00:00";
  const ms = new Date(`${f}T${hhmm}:00`).getTime();
  return Number.isFinite(ms)?ms:NaN;
}
function diffMin(a,b){ const A=tsToMs(a), B=tsToMs(b); return Number.isFinite(A)&&Number.isFinite(B)?(A-B)/60000:null; }
function fmtMin(n){ return Number.isFinite(n)?`${n.toFixed(1)} min`:"—"; }
function pct(n,d){ return d?`${((n/d)*100).toFixed(0)}%`:"—"; }
function wazeUrl(lat,lng){ return Number.isFinite(lat)&&Number.isFinite(lng)?`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`:null; }
function gmapsUrl(lat,lng){ return Number.isFinite(lat)&&Number.isFinite(lng)?`https://www.google.com/maps?q=${lat},${lng}`:null; }
function hasCoords(o){
  const lat = o?.address?.lat ?? o?.destinoLat;
  const lng = o?.address?.lng ?? o?.destinoLng;
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

/** Beep cortito para alertas */
function playBeep(times = 2, vol = 0.1, freq = 880, durMs = 220, gapMs = 120) {
  const AC = window.AudioContext || window.webkitAudioContext; if(!AC) return;
  const ctx = new AC(); let when = ctx.currentTime + 0.01;
  for(let i=0;i<times;i++){ const o=ctx.createOscillator(), g=ctx.createGain();
    o.type="sine"; o.frequency.value=freq; g.gain.value=vol; o.connect(g); g.connect(ctx.destination);
    o.start(when); o.stop(when + durMs/1000); when += (durMs+gapMs)/1000; }
  setTimeout(()=>ctx.close().catch(()=>{}), times*(durMs+gapMs)+300);
}

/** 🎨 CSS unificado (inyectado una vez) */
try{
  if(!document.getElementById("slaCss")){
    const css = document.createElement("style");
    css.id="slaCss";
    css.innerHTML = `
      .card{margin-top:12px;padding:12px;border:1px solid #e5e7eb;border-radius:10px;background:#fff}
      .kpis{display:flex;gap:12px;flex-wrap:wrap}
      .kpi{border:1px dashed #e2e8f0;border-radius:10px;padding:8px 10px;min-width:140px}
      .kpi .lbl{font-size:12px;color:#64748b}
      .kpi .val{font-size:18px;font-weight:700}
      .pill{display:inline-block;padding:6px 10px;border-radius:999px;border:1px solid #e5e7eb;background:#f8fafc;color:#374151;font-size:12px;font-weight:600;line-height:1}
      .pill.blue{background:#eef2ff;border-color:#c7d2fe;color:#3730a3}
      .pill.green{background:#ecfdf5;border-color:#bbf7d0;color:#065f46}
      .pill.gray{background:#f1f5f9;border-color:#e2e8f0;color:#334155}
      .pill.orange{background:#fff7ed;border-color:#fed7aa;color:#9a3412}
      .pill.red{background:#fee2e2;border-color:#fecaca;color:#991b1b}
      .btn{border:1px solid #e5e7eb;border-radius:10px;background:#fff;padding:6px 10px;cursor:pointer;color:#334155;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
      .btn:hover{background:#f8fafc}
      .btn:disabled{opacity:.6;cursor:not-allowed}
      .btn.primary{background:#6366f1;color:#fff;border-color:#6366f1}
      .btn.primary:hover{filter:brightness(.96)}
      .hstack{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .stretch{margin-left:auto}
      table.tbl{width:100%;border-collapse:collapse;font-size:13px}
      table.tbl thead th{position:sticky;top:0;background:#fafafa;border-bottom:1px solid #eee;text-align:left;padding:6px 8px;z-index:1}
      table.tbl td{border-bottom:1px solid #f2f2f2;padding:6px 8px}
      table.tbl tbody tr:nth-child(odd) td{background:#fbfdff}
      table.tbl tbody tr:hover td{background:#eef2ff}
      .row-crit td{background:#fff5f5 !important}
      .row-warn td{background:#fff7ed !important}
      .muted{color:#64748b}
      .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
      .chips{display:flex;gap:8px;flex-wrap:wrap}
      .range-pills{display:flex;gap:6px;flex-wrap:wrap}
    `;
    document.head.appendChild(css);
  }
}catch{}

/** Componente principal */
export default function AlertasSLA(){
  // Sesión
  let usuario=null; try{ usuario=JSON.parse(localStorage.getItem("usuarioActivo")||"null"); }catch{}
  const empresaId = usuario?.empresaId ? String(usuario.empresaId) : null;
  if(!empresaId) return <div style={{padding:16,color:"#b00"}}>Falta empresaId en sesión.</div>;

  // Fecha/rango + ajustes
  const hoy = todayISO();
  const [desde,setDesde] = useState(hoy);
  const [hasta,setHasta] = useState(hoy);
  const [toleranciaMin,setToleranciaMin] = useState(15);     // on-time
  const [ventanaMin,setVentanaMin] = useState(30);           // “por vencer” (⚙️ porVencerMin en Firestore)
  const [umbralCritHoras,setUmbralCritHoras] = useState(3);  // ⚙️ umbralCriticas (horas)
  const [mute,setMute] = useState(false);

  // Filtros rápidos
  const [soloCriticas,setSoloCriticas] = useState(false);
  const [soloPorVencer,setSoloPorVencer] = useState(false);
  const [soloFueraSLA,setSoloFueraSLA] = useState(false); // entregadas tarde

  // Estado
  const [ordenes,setOrdenes] = useState([]);
  const [loading,setLoading] = useState(false);
  const [err,setErr] = useState("");

  // ⚙️ canales (para pruebas opcionales)
  const [cfgCanales, setCfgCanales] = useState(null);

  // Reloj local (refresco SLA en vivo)
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(()=>{ const t = setInterval(()=>setNowMs(Date.now()), 15000); return ()=>clearInterval(t); },[]);

  // Lee ajustes guardados (si existen)
  useEffect(()=>{
    if(!empresaId) return;
    const ref = doc(db,"ajustesEmpresa", empresaId);
    const unsub = onSnapshot(ref, snap=>{
      const d = snap.data();
      if(!d?.alertas) return;
      if(Number.isFinite(d.alertas?.toleranciaMin)) setToleranciaMin(d.alertas.toleranciaMin);
      if(Number.isFinite(d.alertas?.porVencerMin)) setVentanaMin(d.alertas.porVencerMin);
      if(Number.isFinite(d.alertas?.umbralCriticas)) setUmbralCritHoras(d.alertas.umbralCriticas);
      if(typeof d.alertas?.muteDefault === "boolean") setMute(!!d.alertas.muteDefault);
      if(d.alertas?.canales) setCfgCanales(d.alertas.canales);
    });
    return ()=>unsub();
  },[empresaId]);

  // Suscripción a órdenes (por empresa). Filtramos por rango en memoria.
  useEffect(()=>{
    if(!empresaId) return;
    let unsub=null;
    (async()=>{
      setLoading(true); setErr("");
      const ok = await ensureUsuarioActivo();
      if(!ok){ setErr("Sesión inválida."); setLoading(false); return; }
      try{
        const ref = collection(db,"ordenes");
        const q1 = query(ref, where("empresaId","==",empresaId), orderBy("createdAt","desc"));
        unsub = onSnapshot(q1, (snap)=>{
          const arr = snap.docs.map(d=>({ id:d.id, ...d.data() }));
          setOrdenes(arr);
          setLoading(false);
        }, (e)=>{ setErr(e?.message||"No pude leer órdenes."); setLoading(false); });
      }catch(e){ setErr(e?.message||"No pude iniciar suscripción."); setLoading(false); }
    })();
    return ()=> unsub && unsub();
  },[empresaId]);

  // Clasificación SLA
  const clasif = useMemo(()=>{
    const d = new Date(desde); d.setHours(0,0,0,0);
    const h = new Date(hasta); h.setHours(23,59,59,999);
    const msD = d.getTime(), msH = h.getTime();
    const tolMs = (Number.isFinite(toleranciaMin)?toleranciaMin:15)*60000;
    const venMs = (Number.isFinite(ventanaMin)?ventanaMin:30)*60000;
    const critHr = Number.isFinite(umbralCritHoras) ? umbralCritHoras : 3;

    const enRango = ordenes.filter(o=>{
      const c = tsToMs(o.createdAt);
      if(Number.isFinite(c)) return c>=msD && c<=msH;
      const p = msProgramada(o);
      if(Number.isFinite(p)) return p>=msD && p<=msH;
      return true;
    });

    const criticas=[], porVencer=[], fueraSLAEntregadas=[], aTiempoEntregadas=[];
    let tot=enRango.length, ent=0, onTime=0, sumTot=0, nTot=0;
    for(const o of enRango){
      const prog = msProgramada(o);
      const rem = Number.isFinite(prog) ? (prog + tolMs - nowMs) : null;
      const tTot = diffMin(o.fechaEntregada, o.createdAt);
      if(Number.isFinite(tTot)){ sumTot += tTot; nTot++; }

      if(o.entregado){
        ent++;
        const entMs = tsToMs(o.fechaEntregada);
        if(Number.isFinite(prog) && Number.isFinite(entMs) && entMs <= (prog + tolMs)){
          onTime++; aTiempoEntregadas.push(o);
        } else {
          fueraSLAEntregadas.push(o);
        }
      } else {
        if(rem != null && rem < 0) {
          const atrasoMin = Math.abs(Math.round(rem/60000));
          criticas.push({o, rem, muyCritica: atrasoMin >= (critHr*60) });
        } else if(rem != null && rem <= venMs) {
          porVencer.push({o, rem});
        }
      }
    }

    // ordenar
    criticas.sort((a,b)=>a.rem-b.rem);
    porVencer.sort((a,b)=>a.rem-b.rem);
    fueraSLAEntregadas.sort((a,b)=>{
      const A = tsToMs(a.fechaEntregada)- (msProgramada(a)+tolMs);
      const B = tsToMs(b.fechaEntregada)- (msProgramada(b)+tolMs);
      return B-A;
    });

    const muyCriticasCount = criticas.filter(c=>c.muyCritica).length;

    return {
      tot, ent, pend: tot-ent, onTime, onTimePct: pct(onTime, ent||0),
      avgTot: nTot? (sumTot/nTot): null,
      criticas, porVencer, fueraSLAEntregadas, aTiempoEntregadas,
      muyCriticasCount, enRangoCount: enRango.length
    };
  },[ordenes, desde, hasta, toleranciaMin, ventanaMin, umbralCritHoras, nowMs]);

  // 🔔 beep cuando suben críticas
  const prevCritRef = useRef(0);
  useEffect(()=>{
    const curr = clasif.criticas.length;
    if(!mute && curr > prevCritRef.current) playBeep(3,0.12,880,220,120);
    prevCritRef.current = curr;
  },[clasif.criticas.length, mute]);

  // Guardar ajustes por empresa (⚙️ nombres alineados a Firestore)
  async function guardarAjustes(){
    try{
      await setDoc(doc(db,"ajustesEmpresa", empresaId), {
        alertas: {
          toleranciaMin: Number(toleranciaMin)||0,
          porVencerMin: Number(ventanaMin)||0,
          umbralCriticas: Number(umbralCritHoras)||0,
          muteDefault: !!mute,
          updatedAt: new Date().toISOString()
        }
      }, { merge:true });
      alert("Ajustes guardados ✅");
    }catch(e){ alert(e?.message || "No pude guardar ajustes."); }
  }

  // Export
  function exportCSV(filename, rows){
    if(!rows?.length) return;
    const cols = Object.keys(rows[0]);
    const csv = [
      cols.join(","),
      ...rows.map(r => cols.map(c => `"${String(r[c] ?? "").replace(/"/g,'""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type:"text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
  function exportPendientes(){
    const mapRow = (x,tipo)=>({
      tipo,
      orderId: x.o.id,
      cliente: x.o.cliente||"",
      factura: x.o.numeroFactura||"",
      fecha: x.o.fecha||"",
      hora: x.o.hora||"",
      minutos_restantes: Math.round((x.rem||0)/60000),
      asignado: x.o.asignadoNombre || "",
      zona: x.o.zona || "",
      direccion: x.o.direccionTexto || x.o.address?.formatted || "",
    });
    const rows = [
      ...clasif.criticas.map(c=>mapRow(c, c.muyCritica ? "CRITICA++" : "CRITICA")),
      ...clasif.porVencer.map(c=>mapRow(c,"POR_VENCER")),
    ];
    exportCSV(`alertas_pendientes_${desde}_a_${hasta}.csv`, rows);
  }
  function exportFueraSLA(){
    const tolMs = (Number.isFinite(toleranciaMin)?toleranciaMin:15)*60000;
    const rows = clasif.fueraSLAEntregadas.map(o=>{
      const prog = msProgramada(o); const entMs = tsToMs(o.fechaEntregada);
      const retrasoMin = Number.isFinite(prog)&&Number.isFinite(entMs)? Math.round((entMs - (prog+tolMs))/60000) : "";
      return {
        orderId: o.id,
        cliente: o.cliente||"",
        factura: o.numeroFactura||"",
        fecha: o.fecha||"",
        hora: o.hora||"",
        entregada_at: o.fechaEntregada ? new Date(tsToMs(o.fechaEntregada)).toLocaleString(): "",
        retraso_min: retrasoMin,
        asignado: o.asignadoNombre || "",
        zona: o.zona || "",
        direccion: o.direccionTexto || o.address?.formatted || "",
      };
    });
    exportCSV(`alertas_fuera_sla_${desde}_a_${hasta}.csv`, rows);
  }

  // Listas filtradas para la UI
  const pendientes = useMemo(()=>{
    let list = [
      ...clasif.criticas.map(x=>({ ...x, __tipo:x.muyCritica ? "CRITICA++" : "CRITICA" })),
      ...clasif.porVencer.map(x=>({ ...x, __tipo:"POR_VENCER" })),
    ];
    if(soloCriticas) list = list.filter(x=>x.__tipo.startsWith("CRITICA"));
    if(soloPorVencer) list = list.filter(x=>x.__tipo==="POR_VENCER");
    return list;
  },[clasif.criticas, clasif.porVencer, soloCriticas, soloPorVencer]);

  const entregadasTarde = useMemo(()=>{
    return soloFueraSLA ? clasif.fueraSLAEntregadas : clasif.fueraSLAEntregadas.slice(0,1000);
  },[clasif.fueraSLAEntregadas, soloFueraSLA]);

  // 🧪 Presets de rango
  function setPreset(p){
    const now = new Date();
    const iso = (d)=>{ const x=new Date(d); x.setHours(0,0,0,0); return x.toISOString().slice(0,10); };
    if(p==="hoy"){ const t=iso(now); setDesde(t); setHasta(t); return; }
    if(p==="ult7"){ const d=new Date(now); d.setDate(d.getDate()-6); setDesde(iso(d)); setHasta(iso(now)); return; }
    if(p==="mes"){
      const d=new Date(now.getFullYear(), now.getMonth(), 1);
      setDesde(iso(d)); setHasta(iso(now)); return;
    }
    if(p==="todo"){ setDesde("2000-01-01"); setHasta(iso(now)); return; }
  }

  // ⚙️ Pruebas (opcionales, visibles solo si hay canales activos)
  async function probarWebhook(){
    try{
      const wh = cfgCanales?.webhook;
      if(!wh?.enabled) return alert("Webhook deshabilitado.");
      if(!wh?.url) return alert("Falta URL del webhook.");
      const headers = { "Content-Type":"application/json", ...(wh.headers||{}) };
      const body = {
        type: "test",
        empresaId,
        timestamp: new Date().toISOString(),
        resumen: {
          porVencer: clasif.porVencer.length,
          criticas: clasif.criticas.length,
          muyCriticas: clasif.muyCriticasCount
        }
      };
      const res = await fetch(wh.url,{ method:"POST", headers, body: JSON.stringify(body) });
      alert(`Webhook → ${res.status}`);
    }catch(e){ alert(e?.message||"No pude probar el webhook."); }
  }
  async function probarTelegram(){
    try{
      const tg = cfgCanales?.telegram;
      if(!tg?.enabled) return alert("Telegram deshabilitado.");
      if(!tg?.botToken || !tg?.chatId) return alert("Faltan botToken/chatId.");
      // Nota: para producción, enviar desde Cloud Function.
      const url = `https://api.telegram.org/bot${tg.botToken}/sendMessage`;
      const text = `✅ Prueba de alertas\nEmpresa: ${empresaId}\nCriticas: ${clasif.criticas.length} (Muy: ${clasif.muyCriticasCount})\nPor vencer: ${clasif.porVencer.length}`;
      const res = await fetch(url,{ method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ chat_id: tg.chatId, text }) });
      const j = await res.json(); if(!j.ok) throw new Error(JSON.stringify(j));
      alert("Telegram OK");
    }catch(e){ alert(e?.message||"No pude enviar a Telegram."); }
  }

  // 🎨 Helper de badge SLA
  function slaPill(rem){
    if(rem == null) return <span className="pill gray">—</span>;
    if(rem <= 0) return <span className="pill red">Vencida</span>;
    if(rem <= (Number(ventanaMin)||30)*60000) return <span className="pill orange">Por vencer</span>;
    return <span className="pill green">En tiempo</span>;
  }

  // ⛳ UI
  return (
    <div style={{ padding:16 }}>
      <div className="hstack">
        <h2 style={{ margin:0 }}>📣 Centro de Alertas SLA</h2>
        <div className="stretch hstack">
          <label>Desde</label><input type="date" value={desde} onChange={e=>setDesde(e.target.value)} />
          <label>Hasta</label><input type="date" value={hasta} onChange={e=>setHasta(e.target.value)} />
          <div className="range-pills">
            <button className="btn" onClick={()=>setPreset("hoy")}>Hoy</button>
            <button className="btn" onClick={()=>setPreset("ult7")}>Últ. 7 días</button>
            <button className="btn" onClick={()=>setPreset("mes")}>Este mes</button>
            <button className="btn" onClick={()=>setPreset("todo")}>Todo</button>
            <span className="pill gray">En rango: <b>{clasif.enRangoCount}</b></span>
          </div>
        </div>
      </div>

      <div className="hstack" style={{ marginTop:8 }}>
        <label>Tolerancia on-time (min)</label>
        <input type="number" value={toleranciaMin} onChange={e=>setToleranciaMin(Number(e.target.value)||0)} style={{ width:80 }} />
        <label>Ventana “por vencer” (min)</label>
        <input type="number" value={ventanaMin} onChange={e=>setVentanaMin(Number(e.target.value)||0)} style={{ width:80 }} />
        <label>Umbral críticas (h)</label>
        <input type="number" value={umbralCritHoras} onChange={e=>setUmbralCritHoras(Number(e.target.value)||0)} style={{ width:80 }} />
        <button className="btn" onClick={()=>setMute(m=>!m)} title={mute?"Silenciado":"Sonar al subir críticas"}>{mute?"🔕":"🔔"}</button>
        <button className="btn" onClick={()=>playBeep(2)}>Probar sonido ▶️</button>
        <button className="btn primary" onClick={guardarAjustes}>Guardar predeterminado 💾</button>
      </div>

      {err && <div style={{ marginTop:8, color:"#b00" }}>{err}</div>}
      {loading && <div style={{ marginTop:8 }}>Cargando…</div>}

      {/* KPIs */}
      <div className="kpis" style={{ marginTop:12 }}>
        <div className="kpi"><div className="lbl">Órdenes (rango)</div><div className="val">{clasif.tot}</div></div>
        <div className="kpi"><div className="lbl">Entregadas</div><div className="val">{clasif.ent} ({pct(clasif.ent, clasif.tot||0)})</div></div>
        <div className="kpi"><div className="lbl">Pendientes</div><div className="val">{clasif.pend}</div></div>
        <div className="kpi"><div className="lbl">On-time (entregadas)</div><div className="val">{clasif.onTime} ({clasif.onTimePct})</div></div>
        <div className="kpi"><div className="lbl">Prom. total</div><div className="val">{fmtMin(clasif.avgTot)}</div></div>
        <div className="kpi"><div className="lbl">Críticas</div><div className="val">{clasif.criticas.length}</div></div>
        <div className="kpi"><div className="lbl">Muy críticas</div><div className="val">{clasif.muyCriticasCount}</div></div>
        <div className="kpi"><div className="lbl">Por vencer</div><div className="val">{clasif.porVencer.length}</div></div>
        <div className="stretch" style={{ alignSelf:"center", color:"#64748b" }}>
          {new Date(nowMs).toLocaleTimeString()}
        </div>
      </div>

      {/* Config/canales (solo resumen + pruebas) */}
      {cfgCanales && (
        <section className="card">
          <h3 style={{ margin:0 }}>Canales</h3>
          <div className="hstack">
            <span>Webhook: <b>{cfgCanales?.webhook?.enabled ? "ON" : "OFF"}</b></span>
            <span>Telegram: <b>{cfgCanales?.telegram?.enabled ? "ON" : "OFF"}</b></span>
            {cfgCanales?.webhook?.enabled && <button className="btn" onClick={probarWebhook}>🔗 Probar webhook</button>}
            {cfgCanales?.telegram?.enabled && <button className="btn" onClick={probarTelegram}>💬 Probar Telegram</button>}
          </div>
          <div style={{ marginTop:6 }} className="muted">
            * En producción, enviar Telegram desde Cloud Function para no exponer el <code>botToken</code>.
          </div>
        </section>
      )}

      {/* PENDIENTES: Críticas / Por vencer */}
      <section className="card">
        <div className="hstack">
          <h3 style={{ margin:0 }}>Pendientes con alerta</h3>
          <label><input type="checkbox" checked={soloCriticas} onChange={e=>{ setSoloCriticas(e.target.checked); if(e.target.checked) setSoloPorVencer(false); }} /> Solo críticas</label>
          <label><input type="checkbox" checked={soloPorVencer} onChange={e=>{ setSoloPorVencer(e.target.checked); if(e.target.checked) setSoloCriticas(false); }} /> Solo por vencer</label>
          <button className="btn" onClick={exportPendientes} style={{ marginLeft:"auto" }}>⬇️ Exportar CSV</button>
        </div>

        <div style={{ marginTop:8, overflowX:"auto" }}>
          {pendientes.length ? (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Tipo</th><th>Cliente</th><th>Factura</th><th>Fecha</th><th>Hora</th><th>SLA</th><th>Asignado</th><th>Zona</th><th>Dirección</th><th>Mapa</th><th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map(x=>{
                  const o = x.o; const isCrit = x.__tipo.startsWith("CRITICA");
                  const lat = o?.address?.lat ?? o?.destinoLat, lng = o?.address?.lng ?? o?.destinoLng;
                  const rem = x.rem ?? null;
                  const rowClass = isCrit ? "row-crit" : "row-warn";
                  return (
                    <tr key={o.id} className={rowClass}>
                      <td>
                        {x.__tipo==="POR_VENCER" ? <span className="pill orange">⏳ Por vencer</span> :
                         x.__tipo==="CRITICA++" ? <span className="pill red">🛑 Crítica++</span> :
                         <span className="pill red">🔴 Crítica</span>}
                      </td>
                      <td style={{ minWidth:160 }}>{o.cliente||"—"}</td>
                      <td>{o.numeroFactura||"—"}</td>
                      <td>{o.fecha||"—"}</td>
                      <td>{o.hora||"—"}</td>
                      <td>{slaPill(rem)}</td>
                      <td>{o.asignadoNombre||"—"}</td>
                      <td>{o.zona||"—"}</td>
                      <td style={{ minWidth:220 }}>{o.direccionTexto || o.address?.formatted || "—"}</td>
                      <td>
                        {Number.isFinite(lat)&&Number.isFinite(lng) ? (
                          <>
                            <a className="btn" href={wazeUrl(lat,lng)} target="_blank" rel="noreferrer">Waze</a>{" "}
                            <a className="btn" href={gmapsUrl(lat,lng)} target="_blank" rel="noreferrer">Maps</a>
                          </>
                        ) : <span className="muted">—</span>}
                      </td>
                      <td>
                        <div className="chips">
                          <Link className="btn" to={`/orden/${o.id}`}>Ver orden</Link>
                          <Link className="btn" to={`/mapa/${o.id}`} aria-disabled={!hasCoords(o)} onClick={e=>{ if(!hasCoords(o)) e.preventDefault(); }}>
                            Ver mapa
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <div className="muted">Sin pendientes con alerta para el rango.</div>}
        </div>
      </section>

      {/* ENTREGADAS FUERA SLA */}
      <section className="card">
        <div className="hstack">
          <h3 style={{ margin:0 }}>Entregadas fuera de SLA</h3>
          <label><input type="checkbox" checked={soloFueraSLA} onChange={e=>setSoloFueraSLA(e.target.checked)} /> Mostrar todas</label>
          <button className="btn" onClick={exportFueraSLA} style={{ marginLeft:"auto" }}>⬇️ Exportar CSV</button>
        </div>
        <div style={{ marginTop:8, overflowX:"auto" }}>
          {entregadasTarde.length ? (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Cliente</th><th>Factura</th><th>Fecha</th><th>Hora</th>
                  <th>Entregada</th><th>Retraso</th><th>Asignado</th><th>Zona</th><th>Dirección</th><th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {entregadasTarde.map(o=>{
                  const tolMs = (Number.isFinite(toleranciaMin)?toleranciaMin:15)*60000;
                  const prog = msProgramada(o); const entMs = tsToMs(o.fechaEntregada);
                  const retraso = (Number.isFinite(prog)&&Number.isFinite(entMs)) ? Math.max(0, Math.round((entMs - (prog + tolMs))/60000)) : null;
                  return (
                    <tr key={o.id}>
                      <td style={{ minWidth:160 }}>{o.cliente||"—"}</td>
                      <td>{o.numeroFactura||"—"}</td>
                      <td>{o.fecha||"—"}</td>
                      <td>{o.hora||"—"}</td>
                      <td>{o.fechaEntregada ? new Date(tsToMs(o.fechaEntregada)).toLocaleString() : "—"}</td>
                      <td className="mono" style={{ color:"#b91c1c", fontWeight:700 }}>{retraso!=null ? `${retraso} min` : "—"}</td>
                      <td>{o.asignadoNombre||"—"}</td>
                      <td>{o.zona||"—"}</td>
                      <td style={{ minWidth:220 }}>{o.direccionTexto || o.address?.formatted || "—"}</td>
                      <td>
                        <div className="chips">
                          <Link className="btn" to={`/orden/${o.id}`}>Ver orden</Link>
                          <Link className="btn" to={`/mapa/${o.id}`} aria-disabled={!hasCoords(o)} onClick={e=>{ if(!hasCoords(o)) e.preventDefault(); }}>
                            Ver mapa
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <div className="muted">No hubo entregas fuera de SLA en el rango.</div>}
        </div>
      </section>
    </div>
  );
}

/** UI (manteniendo tus componentes base) */
const card = { marginTop:12, padding:12, border:"1px solid #eee", borderRadius:10, background:"#fff" };
function Kpi({label, value}){ return (
  <div style={{ border:"1px dashed #ddd", borderRadius:10, padding:"8px 10px", minWidth:140 }}>
    <div style={{ fontSize:12, color:"#666" }}>{label}</div>
    <div style={{ fontSize:18, fontWeight:700 }}>{value}</div>
  </div>
);}
const Th=({children})=>(<th style={{textAlign:"left",borderBottom:"1px solid #eee",padding:"6px 8px",background:"#fafafa",position:"sticky",top:0,zIndex:1}}>{children}</th>);
const Td=({children,style})=>(<td style={{borderBottom:"1px solid #f2f2f2",padding:"6px 8px",...style}}>{children}</td>);
