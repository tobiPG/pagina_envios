// src/pantallas/EstadisticasAdmin.jsx
import { useEffect, useMemo, useState } from "react";
import { db } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  query,
  where,
  addDoc,
  serverTimestamp,
  updateDoc,
  doc,
  getDoc,
} from "firebase/firestore";
import { ensureUsuarioActivo } from "../utils/ensureUsuario";

/** ───────── Helpers generales ───────── */
const COLLECTION_NAME = "ordenes";

function tsToMs(ts) {
  try {
    if (!ts) return NaN;
    if (typeof ts?.toDate === "function") return ts.toDate().getTime();     // Firestore Timestamp
    if (typeof ts?.seconds === "number") {                                  // {seconds, nanoseconds}
      const ms = ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
      return ms;
    }
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts === "number") return ts;
    if (typeof ts === "string") {
      const d = new Date(ts);
      const m = d.getTime();
      if (Number.isFinite(m)) return m;
    }
  } catch {}
  return NaN;
}

function fmtMin(n){ return Number.isFinite(n) ? `${n.toFixed(1)} min` : "—"; }
function diffMin(a,b){ const A=tsToMs(a), B=tsToMs(b); return Number.isFinite(A)&&Number.isFinite(B)?(A-B)/60000:null; }
function pct(n,d){ return d ? `${((n/d)*100).toFixed(1)}%` : "—"; }
function yyyymm(d){ const Y=d.getFullYear(); const M=String(d.getMonth()+1).padStart(2,"0"); return `${Y}-${M}`; }
function zonaHeuristica(address,direccionTexto){
  const fmt=address?.formatted||direccionTexto||"";
  if(!fmt) return "Desconocida";
  const parts=String(fmt).split(",").map(s=>s.trim()).filter(Boolean);
  return parts[1]||parts[0]||"Desconocida";
}
function exportCSV(filename,rows){
  if(!rows?.length) return;
  const cols=Object.keys(rows[0]);
  const csv=[cols.join(","), rows.map(r=>cols.map(c=>`"${String(r[c]??"").replace(/"/g,'""')}"`).join(",")).join("\n")].join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"}); const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);
}

/** ───────── Parse de fechas “a prueba de balas” ───────── */
function parseFlexibleDateString(s) {
  if (typeof s !== "string") return NaN;
  const t = s.trim();

  // ISO y variantes aceptadas por Date
  const direct = new Date(t).getTime();
  if (Number.isFinite(direct)) return direct;

  // YYYY-MM-DD
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const ms = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`).getTime();
    if (Number.isFinite(ms)) return ms;
  }

  // YYYY/MM/DD
  m = t.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (m) {
    const ms = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`).getTime();
    if (Number.isFinite(ms)) return ms;
  }

  // DD/MM/YYYY
  m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const ms = new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00`).getTime();
    if (Number.isFinite(ms)) return ms;
  }

  // DD-MM-YYYY
  m = t.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) {
    const ms = new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00`).getTime();
    if (Number.isFinite(ms)) return ms;
  }

  // MM/DD/YYYY
  m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const ms = new Date(`${m[3]}-${m[1]}-${m[2]}T12:00:00`).getTime();
    if (Number.isFinite(ms)) return ms;
  }

  return NaN;
}

// Fecha de referencia para filtrar una orden: createdAt → fechaRecibida → fechaEntregada → fecha(string)
function getWhenMsForRange(o) {
  const c = tsToMs(o?.createdAt);
  if (Number.isFinite(c)) return c;

  const r = tsToMs(o?.fechaRecibida);
  if (Number.isFinite(r)) return r;

  const e = tsToMs(o?.fechaEntregada);
  if (Number.isFinite(e)) return e;

  const f = parseFlexibleDateString(o?.fecha);
  if (Number.isFinite(f)) return f;

  return NaN;
}

// Milisegundos para ordenar (createdAt || whenMs || 0)
function getSortMs(o){
  const c = tsToMs(o?.createdAt);
  if (Number.isFinite(c)) return c;
  const w = getWhenMsForRange(o);
  if (Number.isFinite(w)) return w;
  return 0;
}

function msToYMD(ms){
  const d=new Date(ms);
  return Number.isFinite(ms) ? d.toISOString().slice(0,10) : "";
}

/** ───────── Estilos tabla ───────── */
const th={textAlign:"left",borderBottom:"1px solid #eee",padding:"8px 10px",background:"#fafafa"};
const td={borderBottom:"1px solid #f2f2f2",padding:"8px 10px"};
const tdCenter={...td,textAlign:"center"};

/** ───────── Componente ───────── */
export default function EstadisticasAdmin(){
  // 🔒 Solo Admin
  let usuario=null; try{ usuario=JSON.parse(localStorage.getItem("usuarioActivo")||"null"); }catch{}
  const rol=(usuario?.rol||"").toLowerCase();
  if(rol!=="administrador"){ return <div style={{padding:20}}>403 – Solo el administrador puede ver estadísticas.</div>; }

  const empresaIdStr = (usuario?.empresaId!=null && usuario?.empresaId!=="") ? String(usuario.empresaId) : null;

  // Filtros (mes actual por defecto)
  const hoy=new Date();
  const defaultDesde=new Date(hoy.getFullYear(),hoy.getMonth(),1);
  const [desde,setDesde]=useState(defaultDesde.toISOString().slice(0,10));
  const [hasta,setHasta]=useState(hoy.toISOString().slice(0,10));
  const [soloEntregadas,setSoloEntregadas]=useState(false);

  // Datos / meta
  const [allOrdenes,setAllOrdenes]=useState([]);
  const [cargando,setCargando]=useState(false);
  const [error,setError]=useState("");
  const [ultimaAct,setUltimaAct]=useState(null);

  const [liveMeta,setLiveMeta]=useState({ fromCache:false, pendingLocal:0, total:0 });
  const [sinCreatedIds, setSinCreatedIds] = useState([]);
  const [fixing, setFixing] = useState(false);

  // Debug visibles
  const [debug, setDebug] = useState({
    usuarioEmpresaId: empresaIdStr,
    usuarioEmpresaIdType: typeof (usuario?.empresaId),
    userDocEmpresaId: null,
    userDocEmpresaIdType: null,
    muestraEmpresaIdOrdenes: [],
    lastSnapshotError: null,
    lastWriteError: null,
  });

  // Lee usuarios/{uid} para validar empresaId de reglas
  useEffect(()=>{
    (async()=>{
      try{
        if(!usuario?.uid) return;
        const uref = doc(db, "usuarios", usuario.uid);
        const usnap = await getDoc(uref);
        if (usnap.exists()) {
          const eid = usnap.data()?.empresaId;
          setDebug(d=>({
            ...d,
            userDocEmpresaId: eid!=null? String(eid): null,
            userDocEmpresaIdType: typeof eid
          }));
        } else {
          setDebug(d=>({...d, userDocEmpresaId:"(no existe doc usuarios/uid)"}));
        }
      }catch(e){
        setDebug(d=>({...d, userDocEmpresaId:`(error leyendo usuarios/${usuario?.uid}): ${e?.message}`}));
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.uid]);

  /** Suscripción robusta */
  useEffect(() => {
    let unsub = null, unsub2 = null;
    let safetyTimer = null;
    let finished = false;

    (async () => {
      try {
        setCargando(true);
        setError("");

        const ok = await ensureUsuarioActivo();
        if (!ok) {
          setError("Sesión inválida: ensureUsuarioActivo() retornó false.");
          setCargando(false);
          return;
        }
        const empStr = empresaIdStr;
        if (!empStr) {
          setError("Falta empresaId en usuarioActivo.");
          setCargando(false);
          return;
        }

        safetyTimer = setTimeout(() => {
          if (!finished) {
            setCargando(false);
            setError(prev => prev || "No llegó ningún snapshot (verifica conexión/reglas/índices).");
          }
        }, 6000);

        const ref = collection(db, COLLECTION_NAME);
        const qStr = query(ref, where("empresaId", "==", empStr));
        const empNum = Number.isNaN(Number(empStr)) ? null : Number(empStr);
        const acc = new Map();

        const applySnap = (snap) => {
          finished = true;
          if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }

          snap.docs.forEach(d => {
            const data = d.data();
            acc.set(d.id, { id: d.id, ...data, __pending: d.metadata.hasPendingWrites === true });
          });

          const arr = Array.from(acc.values()).sort((a,b)=> getSortMs(b) - getSortMs(a));

          const pendingLocal = arr.reduce((n, r) => n + (r.__pending ? 1 : 0), 0);
          setLiveMeta({ fromCache: snap.metadata.fromCache, pendingLocal, total: arr.length });

          const rows = arr.map(({ __pending, ...r }) => r);
          setAllOrdenes(rows);
          setUltimaAct(new Date());
          setSinCreatedIds(arr.filter(r => !r.createdAt && !r.__pending).map(r => r.id));
          setDebug(d => ({
            ...d,
            muestraEmpresaIdOrdenes: arr.slice(0,3).map(x => ({ id: x.id, empresaId: x.empresaId, tipo: typeof x.empresaId }))
          }));
          setCargando(false);
        };

        const onErr = (e) => {
          finished = true;
          if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
          console.error("onSnapshot error:", e);
          setDebug(d=>({...d, lastSnapshotError: e?.message || String(e)}));
          setError(e?.message || "Error al suscribirse a órdenes.");
          setCargando(false);
        };

        unsub = onSnapshot(qStr, { includeMetadataChanges: true }, applySnap, onErr);
        if (empNum != null) {
          const qNum = query(ref, where("empresaId", "==", empNum));
          unsub2 = onSnapshot(qNum, { includeMetadataChanges: true }, applySnap, onErr);
        }
      } catch (e) {
        finished = true;
        if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
        console.error("Suscripción falló:", e);
        setError(e?.message || "No pude iniciar la suscripción.");
        setCargando(false);
      }
    })();

    return () => {
      if (safetyTimer) clearTimeout(safetyTimer);
      if (unsub) unsub();
      if (unsub2) unsub2();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.empresaId]);

  /** Filtrado en memoria (blindado) */
  const { filtered: ordenesFiltradas, counts: filtroCounts } = useMemo(()=>{
    if(!Array.isArray(allOrdenes)) return { filtered: [], counts: {conCreatedAt:0, conFechaStr:0, sinFecha:0, inRange:0, outRange:0} };

    // Rango local
    const d=new Date(desde); d.setHours(0,0,0,0);
    const h=new Date(hasta); h.setHours(23,59,59,999);
    const msD=d.getTime(), msH=h.getTime();

    let conCreatedAt=0, conFechaStr=0, sinFecha=0, inRange=0, outRange=0;

    const filteredBase = allOrdenes.filter(o=>{
      const cMs = tsToMs(o?.createdAt);
      if (Number.isFinite(cMs)) conCreatedAt++;

      let whenMs = getWhenMsForRange(o);
      if (!Number.isFinite(whenMs)) {
        const fm = parseFlexibleDateString(o?.fecha);
        if (Number.isFinite(fm)) {
          conFechaStr++;
          whenMs = fm;
        }
      }

      if (!Number.isFinite(whenMs)) {
        sinFecha++;
        return true; // incluir si no hay fecha confiable
      }

      if (whenMs >= msD && whenMs <= msH) {
        inRange++;
        return true;
      } else {
        outRange++;
        return false;
      }
    });

    // Ordenar por createdAt/whenMs
    filteredBase.sort((a,b)=> getSortMs(b) - getSortMs(a));

    const final = soloEntregadas ? filteredBase.filter(o=>o.entregado) : filteredBase;

    return { filtered: final, counts: {conCreatedAt, conFechaStr, sinFecha, inRange, outRange} };
  },[allOrdenes, desde, hasta, soloEntregadas]);

  /** Rango disponible (min/max) según datos */
  const rangoDisponible = useMemo(()=>{
    if (!Array.isArray(allOrdenes) || allOrdenes.length===0) {
      return {minMs: NaN, maxMs: NaN};
    }
    let minMs = Infinity, maxMs = -Infinity;
    for (const o of allOrdenes){
      const ms = getSortMs(o);
      if (Number.isFinite(ms)){
        if (ms < minMs) minMs = ms;
        if (ms > maxMs) maxMs = ms;
      }
    }
    return {minMs, maxMs};
  }, [allOrdenes]);

  /** Auto-ajuste de rango si no captura nada (opcional) */
  useEffect(()=>{
    if (liveMeta.total > 0 && filtroCounts.inRange === 0 && filtroCounts.outRange > 0) {
      const {minMs, maxMs} = rangoDisponible;
      if (Number.isFinite(minMs) && Number.isFinite(maxMs)) {
        setDesde(msToYMD(minMs));
        setHasta(msToYMD(maxMs));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMeta.total, filtroCounts.inRange, filtroCounts.outRange, rangoDisponible.minMs, rangoDisponible.maxMs]);

  /** KPIs */
  const stats = useMemo(()=>{
    const base={ total:0,entregadas:0,pendientes:0,avgCreacionARecibida:null,avgRecibidaAEntregada:null,avgTotal:null,
      porMensajero:[], porZona:{}, porHora:{}, porDiaSemana:{}, porMes:{}, exportRows:[] };
    if(!ordenesFiltradas.length) return base;

    let sumCR=0,nCR=0,sumRE=0,nRE=0,sumTOT=0,nTOT=0;
    const porMensajeroMap={}, porZona={}, porHora={}, porDiaSemana={}, porMes={}, rows=[];

    for(const o of ordenesFiltradas){
      base.total+=1;
      if(o.entregado) base.entregadas+=1; else base.pendientes+=1;

      const msC=tsToMs(o.createdAt);
      if(Number.isFinite(msC)){
        const d=new Date(msC);
        const hr=d.getHours(); const kHr=String(hr).padStart(2,"0"); porHora[kHr]=(porHora[kHr]||0)+1;
        const dow=d.getDay(); porDiaSemana[dow]=(porDiaSemana[dow]||0)+1;
        const ym=yyyymm(d); porMes[ym]=(porMes[ym]||0)+1;
      } else {
        const msF = parseFlexibleDateString(o?.fecha);
        if (Number.isFinite(msF)) {
          const d=new Date(msF);
          const hr=d.getHours(); const kHr=String(hr).padStart(2,"0"); porHora[kHr]=(porHora[kHr]||0)+1;
          const dow=d.getDay(); porDiaSemana[dow]=(porDiaSemana[dow]||0)+1;
          const ym=yyyymm(d); porMes[ym]=(porMes[ym]||0)+1;
        }
      }

      const zona=zonaHeuristica(o.address,o.direccionTexto);
      porZona[zona]=porZona[zona]||{ total:0,entregadas:0,sumTOT:0,nTOT:0 };
      porZona[zona].total+=1; if(o.entregado) porZona[zona].entregadas+=1;

      const tCR=diffMin(o.fechaRecibida,o.createdAt);
      const tRE=diffMin(o.fechaEntregada,o.fechaRecibida);
      const tTOT=diffMin(o.fechaEntregada,o.createdAt);

      if(Number.isFinite(tCR)){ sumCR+=tCR; nCR+=1; }
      if(Number.isFinite(tRE)){ sumRE+=tRE; nRE+=1; }
      if(Number.isFinite(tTOT)){ sumTOT+=tTOT; nTOT+=1; porZona[zona].sumTOT+=tTOT; porZona[zona].nTOT+=1; }

      const key=o.asignadoUid||o.asignadoNombre||"—"; const nombre=o.asignadoNombre||key;
      porMensajeroMap[key]=porMensajeroMap[key]||{ nombre,total:0,entregadas:0,sumRE:0,nRE:0,sumTOT:0,nTOT:0 };
      porMensajeroMap[key].total+=1; if(o.entregado) porMensajeroMap[key].entregadas+=1;
      if(Number.isFinite(tRE)){ porMensajeroMap[key].sumRE+=tRE; porMensajeroMap[key].nRE+=1; }
      if(Number.isFinite(tTOT)){ porMensajeroMap[key].sumTOT+=tTOT; porMensajeroMap[key].nTOT+=1; }

      rows.push({
        id:o.id, cliente:o.cliente||"", mensajero:nombre,
        creado: Number.isFinite(msC)?new Date(msC).toLocaleString():"",
        recibida: o.fechaRecibida? new Date(tsToMs(o.fechaRecibida)).toLocaleString():"",
        entregada: o.fechaEntregada? new Date(tsToMs(o.fechaEntregada)).toLocaleString():"",
        zona,
        estado: o.entregado?"ENTREGADA":o.recibida?"RECIBIDA":"PENDIENTE",
        min_creacion_a_recibida: Number.isFinite(diffMin(o.fechaRecibida,o.createdAt))?diffMin(o.fechaRecibida,o.createdAt).toFixed(1):"",
        min_recibida_a_entregada: Number.isFinite(diffMin(o.fechaEntregada,o.fechaRecibida))?diffMin(o.fechaEntregada,o.fechaRecibida).toFixed(1):"",
        min_total: Number.isFinite(diffMin(o.fechaEntregada,o.createdAt))?diffMin(o.fechaEntregada,o.createdAt).toFixed(1):"",
      });
    }

    const avg=(s,n)=> n>0 ? s/n : null;
    base.avgCreacionARecibida=avg(sumCR,nCR);
    base.avgRecibidaAEntregada=avg(sumRE,nRE);
    base.avgTotal=avg(sumTOT,nTOT);

    base.porZona=porZona;
    base.porHora=porHora;
    base.porDiaSemana=porDiaSemana;
    base.porMes=porMes;

    base.porMensajero=Object.entries(porMensajeroMap)
      .map(([uid,v])=>({ uid, nombre:v.nombre, total:v.total, entregadas:v.entregadas,
        tasaExito: v.total? v.entregadas/v.total : 0,
        avgEntregaMin: avg(v.sumRE,v.nRE),
        avgTotalMin: avg(v.sumTOT,v.nTOT),
      }))
      .sort((a,b)=> b.entregadas-a.entregadas || b.total-a.total);

    base.exportRows=rows;
    return base;
  },[ordenesFiltradas]);

  /** Acciones de prueba */
  const COLEC=COLLECTION_NAME;

  async function crearOrdenPrueba(){
    try{
      let u=null; try{u=JSON.parse(localStorage.getItem("usuarioActivo")||"null");}catch{}
      const emp=(u?.empresaId!=null && u?.empresaId!=="")? String(u.empresaId): null;
      if(!emp){ throw new Error("empresaId vacío en usuarioActivo. No crearé la orden."); }

      const now=new Date(); const fecha=now.toISOString().slice(0,10); const hora=now.toTimeString().slice(0,5);
      const nombreUsuario=u?.nombre||u?.usuario||"tester";
      const rolUsuario=(u?.rol||"administrador").toLowerCase();

      const dummy={
        empresaId: emp,
        cliente:"PRUEBA KPI", telefono:"000-000-0000", numeroFactura:`TEST-${Date.now()}`,
        monto:"0", fecha, hora,
        address:{ formatted:"Punto de prueba, Santo Domingo", lat:18.4861, lng:-69.9312 },
        destinoLat:18.4861, destinoLng:-69.9312, direccionTexto:"Punto de prueba, Santo Domingo",
        entregado:false, recibida:false, fechaRecibida:null, fechaEntregada:null, tiempoTotalEntrega:null,
        asignadoUid:null, asignadoNombre:null,
        usuario:nombreUsuario, rolUsuario,
        createdAt: serverTimestamp(),
      };
      const ref=await addDoc(collection(db,COLEC),dummy);
      alert(`✅ Orden de prueba creada (${ref.id}).`);
    }catch(e){
      console.error("crearOrdenPrueba:",e);
      setDebug(d=>({...d, lastWriteError: e?.message || String(e)}));
      alert("No pude crear la orden de prueba: " + (e?.message||""));
    }
  }

  async function crearYCompletarPrueba(){
    try{
      let u=null; try{u=JSON.parse(localStorage.getItem("usuarioActivo")||"null");}catch{}
      const emp=(u?.empresaId!=null && u?.empresaId!=="")? String(u.empresaId): null;
      if(!emp){ throw new Error("empresaId vacío en usuarioActivo. No crearé la orden."); }

      const now=new Date(); const fecha=now.toISOString().slice(0,10); const hora=now.toTimeString().slice(0,5);
      const nombreUsuario=u?.nombre||u?.usuario||"tester";
      const rolUsuario=(u?.rol||"administrador").toLowerCase();

      const base={
        empresaId: emp,
        cliente:"PRUEBA FLUJO", telefono:"000-000-0000", numeroFactura:`FLOW-${Date.now()}`, monto:"0", fecha, hora,
        address:{ formatted:"Punto flujo, Santo Domingo", lat:18.49, lng:-69.93 },
        destinoLat:18.49, destinoLng:-69.93, direccionTexto:"Punto flujo, Santo Domingo",
        entregado:false, recibida:false, fechaRecibida:null, fechaEntregada:null, tiempoTotalEntrega:null,
        asignadoUid:"rider-1", asignadoNombre:"Carlos",
        usuario:nombreUsuario, rolUsuario,
        createdAt: serverTimestamp(),
      };
      const ref=await addDoc(collection(db,COLEC),base);
      setTimeout(()=> updateDoc(doc(db,COLEC,ref.id),{recibida:true,fechaRecibida:serverTimestamp()})
        .catch(e=>{ console.error("mark recibida:",e); setDebug(d=>({...d, lastWriteError: e?.message||String(e)})); }), 2000);
      setTimeout(()=> updateDoc(doc(db,COLEC,ref.id),{entregado:true,fechaEntregada:serverTimestamp(),tiempoTotalEntrega:"2.0"})
        .catch(e=>{ console.error("mark entregada:",e); setDebug(d=>({...d, lastWriteError: e?.message||String(e)})); }), 4000);
      alert(`✅ Orden de flujo creada: ${ref.id}.`);
    }catch(e){
      console.error("crearYCompletarPrueba:",e);
      setDebug(d=>({...d, lastWriteError: e?.message || String(e)}));
      alert("No pude crear la orden de flujo: " + (e?.message||""));
    }
  }

  /** Fix puntual: createdAt faltante */
  async function arreglarCreatedAtFaltantes() {
    if (!empresaIdStr) return alert("Falta empresaId.");
    if (!sinCreatedIds.length) return alert("No hay órdenes por corregir.");

    try {
      setFixing(true);
      let ok = 0, fail = 0;
      for (const id of sinCreatedIds) {
        try {
          await updateDoc(doc(db, COLLECTION_NAME, id), { createdAt: serverTimestamp() });
          ok++;
        } catch (e) {
          console.warn("Fix createdAt fallo:", id, e?.message);
          fail++;
        }
      }
      alert(`Fix createdAt listo. OK: ${ok} · Fallas: ${fail}`);
      setFixing(false);
    } catch (e) {
      console.error("arreglarCreatedAtFaltantes:", e);
      setFixing(false);
    }
  }

  /** KPIs UI */
  const kpis=[
    {label:"Órdenes (rango)",value:stats.total},
    {label:"Entregadas",value:stats.entregadas},
    {label:"Pendientes",value:stats.pendientes},
    {label:"Prom. creación→recibida",value:fmtMin(stats.avgCreacionARecibida)},
    {label:"Prom. recibida→entregada",value:fmtMin(stats.avgRecibidaAEntregada)},
    {label:"Prom. total",value:fmtMin(stats.avgTotal)},
  ];

  return (
    <div style={{padding:16}}>
      <h2 style={{margin:0}}>📊 Estadísticas (Administrador)</h2>

      {/* Debug */}
      <div style={{marginTop:8, padding:10, background:"#fff8e1", border:"1px solid #ffe082", borderRadius:8, fontSize:12}}>
        <div><b>Debug</b></div>
        <div>usuarioActivo.empresaId = <code>{String(debug.usuarioEmpresaId)}</code> (typeof {debug.usuarioEmpresaIdType})</div>
        <div>usuarios/{usuario?.uid}.empresaId = <code>{String(debug.userDocEmpresaId)}</code> (typeof {debug.userDocEmpresaIdType})</div>
        <div>Órdenes en snapshot: <b>{liveMeta.total}</b> · pending local: <b>{liveMeta.pendingLocal}</b></div>
        {debug.muestraEmpresaIdOrdenes?.length ? (
          <div>Primeras órdenes: {debug.muestraEmpresaIdOrdenes.map(x =>
            <span key={x.id} style={{marginRight:8}}>
              [{x.id.slice(0,6)}… → {String(x.empresaId)} ({typeof x.empresaId})]
            </span>
          )}</div>
        ) : <div>Primeras órdenes: (ninguna)</div>}
        <div>
          Filtro — conCreatedAt: <b>{filtroCounts.conCreatedAt}</b> · conFechaStr: <b>{filtroCounts.conFechaStr}</b> ·
          {" "}sinFecha: <b>{filtroCounts.sinFecha}</b> · inRange: <b>{filtroCounts.inRange}</b> · outRange: <b>{filtroCounts.outRange}</b>
        </div>
      </div>

      <div style={{marginTop:6, fontSize:12, color:"#444"}}>
        <b>Estado en vivo:</b>{" "}
        cache: <code>{String(liveMeta.fromCache)}</code>{" · "}
        pendientes: <code>{liveMeta.pendingLocal}</code>{" · "}
        docs: <code>{liveMeta.total}</code>
      </div>

      {/* Rango disponible y botón Ver todo */}
      <div style={{marginTop:4, fontSize:12, color:"#444"}}>
        <b>Rango disponible:</b>{" "}
        {Number.isFinite(rangoDisponible.minMs) ? msToYMD(rangoDisponible.minMs) : "—"}{" "}→{" "}
        {Number.isFinite(rangoDisponible.maxMs) ? msToYMD(rangoDisponible.maxMs) : "—"}
        <button
          style={{marginLeft:10}}
          onClick={()=>{
            const {minMs, maxMs} = rangoDisponible;
            if (Number.isFinite(minMs) && Number.isFinite(maxMs)){
              setDesde(msToYMD(minMs));
              setHasta(msToYMD(maxMs));
            } else {
              setDesde("2020-01-01");
              setHasta(new Date().toISOString().slice(0,10));
            }
          }}
        >
          📅 Ver todo
        </button>
      </div>

      {/* Filtros */}
      <div style={{display:"flex",gap:12,alignItems:"end",flexWrap:"wrap",marginTop:10}}>
        <div><label>Desde</label><br/><input type="date" value={desde} onChange={e=>setDesde(e.target.value)} /></div>
        <div><label>Hasta</label><br/><input type="date" value={hasta} onChange={e=>setHasta(e.target.value)} /></div>
        <label style={{display:"inline-flex",gap:6,alignItems:"center"}}>
          <input type="checkbox" checked={soloEntregadas} onChange={e=>setSoloEntregadas(e.target.checked)} />
          Solo entregadas
        </label>
        <div style={{marginLeft:"auto",display:"flex",gap:8}}>
          <button onClick={crearOrdenPrueba}>➕ Orden de prueba</button>
          <button onClick={crearYCompletarPrueba}>🎯 Prueba completa (4s)</button>
          <button onClick={()=>exportCSV(`ordenes_${desde}_a_${hasta}${soloEntregadas?"_entregadas":""}.csv`, stats.exportRows)} disabled={!stats.exportRows.length}>
            ⬇️ Exportar CSV
          </button>
        </div>
      </div>

      {sinCreatedIds.length > 0 && (
        <div style={{ marginTop: 8, color: "#b00" }}>
          Hay {sinCreatedIds.length} órdenes sin <code>createdAt</code>.
          <button style={{ marginLeft: 8 }} onClick={arreglarCreatedAtFaltantes} disabled={fixing}>
            {fixing ? "Arreglando…" : "Arreglar createdAt"}
          </button>
        </div>
      )}

      {cargando && <div style={{marginTop:8}}>Cargando…</div>}
      {error && <div style={{marginTop:8,color:"#b00"}}>{error}</div>}
      {ultimaAct && <div style={{marginTop:4,fontSize:12,color:"#666"}}>Última actualización: {ultimaAct.toLocaleTimeString()}</div>}

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))",gap:12,marginTop:12}}>
        {kpis.map(k=>(
          <div key={k.label} style={{border:"1px solid #eee",borderRadius:10,padding:12,background:"#fff"}}>
            <div style={{fontSize:12,color:"#666"}}>{k.label}</div>
            <div style={{fontSize:22,fontWeight:700}}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Mensajeros */}
      <h3 style={{marginTop:18}}>🏆 Mensajeros</h3>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr>
            <th style={th}>Mensajero</th><th style={th}>Entregadas</th><th style={th}>Órdenes (total)</th>
            <th style={th}>Tasa de éxito</th><th style={th}>Prom. entrega (recibida→entregada)</th><th style={th}>Prom. total</th>
          </tr></thead>
          <tbody>
            {stats.porMensajero.length? stats.porMensajero.map(r=>(
              <tr key={r.uid}>
                <td style={td}>{r.nombre}</td>
                <td style={tdCenter}>{r.entregadas}</td>
                <td style={tdCenter}>{r.total}</td>
                <td style={tdCenter}>{pct(r.entregadas,r.total)}</td>
                <td style={td}>{fmtMin(r.avgEntregaMin)}</td>
                <td style={td}>{fmtMin(r.avgTotalMin)}</td>
              </tr>
            )): <tr><td colSpan={6} style={td}>Sin datos en el rango.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Zonas */}
      <h3 style={{marginTop:18}}>🗺️ Zonas (tiempo promedio creación→entrega)</h3>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr>
            <th style={th}>Zona</th><th style={th}>Órdenes</th><th style={th}>Entregadas</th><th style={th}>Prom. total</th>
          </tr></thead>
          <tbody>
            {Object.entries(stats.porZona).length? Object.entries(stats.porZona).sort((a,b)=>b[1].total-a[1].total).map(([zona,v])=>{
              const avgTot=v.nTOT? v.sumTOT/v.nTOT : null;
              return (<tr key={zona}>
                <td style={td}>{zona}</td><td style={tdCenter}>{v.total}</td><td style={tdCenter}>{v.entregadas}</td><td style={td}>{fmtMin(avgTot)}</td>
              </tr>);
            }) : <tr><td colSpan={4} style={td}>Sin datos en el rango.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Día semana */}
      <h3 style={{marginTop:18}}>📅 Distribución por día de la semana</h3>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr>{["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"].map(d=><th key={d} style={th}>{d}</th>)}</tr></thead>
          <tbody><tr>{["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"].map((_,i)=><td key={i} style={tdCenter}>{stats.porDiaSemana[i]||0}</td>)}</tr></tbody>
        </table>
      </div>

      {/* Historial mensual */}
      <h3 style={{marginTop:18}}>📈 Historial mensual (órdenes creadas)</h3>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr><th style={th}>Mes</th><th style={th}>Órdenes</th></tr></thead>
          <tbody>
            {Object.entries(stats.porMes).length? Object.entries(stats.porMes).sort((a,b)=>a[0].localeCompare(b[0])).map(([mes,cnt])=>(
              <tr key={mes}><td style={td}>{mes}</td><td style={tdCenter}>{cnt}</td></tr>
            )) : <tr><td colSpan={2} style={td}>Sin datos en el rango.</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={{marginTop:24,fontSize:12,color:"#666"}}>
        * Asegúrate de que <code>usuarios/{'{uid}'}.empresaId</code> exista y coincida con <code>ordenes[].empresaId</code>.
      </div>
    </div>
  );
}
