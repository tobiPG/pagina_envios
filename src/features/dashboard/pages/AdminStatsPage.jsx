// src/pantallas/EstadisticasAdmin.jsx
import { useEffect, useMemo, useState } from "react";
import { db } from "../../../shared/services/firebase.js";
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
import { ensureUsuarioActivo } from "../../../shared/utils/ensureUsuario";

/** ───────── Config y helpers ───────── */
const COLLECTION_NAME = "ordenes";

// Franjas estándar para agrupación horaria
const FRANJAS_ORDEN = ["00–06", "06–09", "09–12", "12–15", "15–18", "18–21", "21–24"];
function franjaDesdeHora(hr /* 0..23 */) {
  if (hr >= 0 && hr < 6) return "00–06";
  if (hr >= 6 && hr < 9) return "06–09";
  if (hr >= 9 && hr < 12) return "09–12";
  if (hr >= 12 && hr < 15) return "12–15";
  if (hr >= 15 && hr < 18) return "15–18";
  if (hr >= 18 && hr < 21) return "18–21";
  return "21–24";
}

function tsToMs(ts) {
  try {
    if (!ts) return NaN;
    if (typeof ts?.toDate === "function") return ts.toDate().getTime();
    if (typeof ts?.seconds === "number") {
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
function fmtMin(n) { return Number.isFinite(n) ? `${n.toFixed(1)} min` : "—"; }
function diffMin(a, b) { const A = tsToMs(a), B = tsToMs(b); return Number.isFinite(A) && Number.isFinite(B) ? (A - B) / 60000 : null; }
function pct(n, d) { return d ? `${((n / d) * 100).toFixed(1)}%` : "—"; }
function yyyymm(d) { const Y = d.getFullYear(); const M = String(d.getMonth() + 1).padStart(2, "0"); return `${Y}-${M}`; }
function zonaHeuristica(address, direccionTexto) {
  const fmt = address?.formatted || direccionTexto || "";
  if (!fmt) return "Desconocida";
  const parts = String(fmt).split(",").map(s => s.trim()).filter(Boolean);
  return parts[1] || parts[0] || "Desconocida";
}
function exportCSV(filename, rows) {
  if (!rows?.length) return;
  const cols = Object.keys(rows[0]);
  const csv = [
    cols.join(","),
    rows.map(r => cols.map(c => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function percentile(sortedNums, p /* 0..100 */) {
  if (!sortedNums?.length) return null;
  const arr = sortedNums.filter(Number.isFinite).sort((a, b) => a - b);
  if (!arr.length) return null;
  const rank = (p / 100) * (arr.length - 1);
  const lo = Math.floor(rank), hi = Math.ceil(rank);
  if (lo === hi) return arr[lo];
  return arr[lo] + (arr[hi] - arr[lo]) * (rank - lo);
}
function parseFlexibleDateString(s) {
  if (typeof s !== "string") return NaN;
  const t = s.trim();
  const direct = new Date(t).getTime();
  if (Number.isFinite(direct)) return direct;

  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) { const ms = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`).getTime(); if (Number.isFinite(ms)) return ms; }

  m = t.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (m) { const ms = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`).getTime(); if (Number.isFinite(ms)) return ms; }

  m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) { const ms = new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00`).getTime(); if (Number.isFinite(ms)) return ms; }

  m = t.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) { const ms = new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00`).getTime(); if (Number.isFinite(ms)) return ms; }

  m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) { const ms = new Date(`${m[3]}-${m[1]}-${m[2]}T12:00:00`).getTime(); if (Number.isFinite(ms)) return ms; }

  return NaN;
}
// Fecha programada (fecha + hora)
function msProgramada(o) {
  const f = (o?.fecha || "").trim();
  const h = (o?.hora || "").trim();
  if (!f) return NaN;
  if (/^\d{4}-\d{2}-\d{2}$/.test(f)) {
    const hhmm = /^\d{2}:\d{2}$/.test(h) ? h : "00:00";
    const ms = new Date(`${f}T${hhmm}:00`).getTime();
    return Number.isFinite(ms) ? ms : NaN;
  }
  return parseFlexibleDateString(f);
}
// Fecha para filtrar (según selector)
function getMsByTipo(o, tipo) {
  if (tipo === "creacion") return tsToMs(o?.createdAt);
  if (tipo === "programada") return msProgramada(o);
  if (tipo === "entrega") return tsToMs(o?.fechaEntregada);
  return NaN;
}
// Fecha para ordenar (createdAt || seleccionada || 0)
function getSortMsBy(o, tipo) {
  const c = tsToMs(o?.createdAt);
  if (Number.isFinite(c)) return c;
  const w = getMsByTipo(o, tipo);
  if (Number.isFinite(w)) return w;
  return 0;
}
function msToYMD(ms) {
  const d = new Date(ms);
  return Number.isFinite(ms) ? d.toISOString().slice(0, 10) : "";
}

/** ───────── Mini-gráficos sin librerías (con clasecitas lindas) ───────── */
function HBarList({ title, data, total }) {
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h3 className="card-title">{title}</h3>
      <div className="hbar-list">
        {data.map(({ label, value }) => {
          const p = total ? (value / total) * 100 : 0;
          return (
            <div key={label} className="hbar-row">
              <div className="hbar-label">{label}</div>
              <div className="hbar-track">
                <div className="hbar-fill" style={{ width: `${p}%` }} />
              </div>
              <div className="hbar-value">{value}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
function VBarChart({ title, data, height = 160 }) {
  const max = Math.max(1, ...data.map(d => d.value || 0));
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h3 className="card-title">{title}</h3>
      <div className="vbar-wrap" style={{ height }}>
        {data.map(d => (
          <div key={d.label} className="vbar-col">
            <div className="vbar-track" title={`${d.label}: ${d.value}`}>
              <div className="vbar-fill" style={{ height: `${(d.value / max) * 100}%` }} />
            </div>
            <div className="vbar-label">{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** ───────── Componente ───────── */
export default function EstadisticasAdmin() {
  // 🔒 Solo Admin
  let usuario = null; try { usuario = JSON.parse(localStorage.getItem("usuarioActivo") || "null"); } catch {}
  const rol = (usuario?.rol || "").toLowerCase();
  if (rol !== "administrador") {
    return <div style={{ padding: 20 }}>403 – Solo el administrador puede ver estadísticas.</div>;
  }
  const empresaIdStr = (usuario?.empresaId != null && usuario?.empresaId !== "") ? String(usuario.empresaId) : null;

  // Filtros
  const hoy = new Date();
  const defaultDesde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const [desde, setDesde] = useState(defaultDesde.toISOString().slice(0, 10));
  const [hasta, setHasta] = useState(hoy.toISOString().slice(0, 10));
  const [soloEntregadas, setSoloEntregadas] = useState(false);

  // Nuevos filtros
  const [tipoFecha, setTipoFecha] = useState("creacion"); // creacion | programada | entrega
  const [soloConPod, setSoloConPod] = useState(false);
  const [mensajeroSel, setMensajeroSel] = useState(""); // asignadoNombre
  const [operadorSel, setOperadorSel] = useState("");   // quien creó
  const [toleranciaOnTimeMin, setToleranciaOnTimeMin] = useState(15);

  // SLA target local (solo UI)
  const [objetivoMinTotal, setObjetivoMinTotal] = useState(45);

  // Datos/meta
  const [allOrdenes, setAllOrdenes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [ultimaAct, setUltimaAct] = useState(null);
  const [liveMeta, setLiveMeta] = useState({ fromCache: false, pendingLocal: 0, total: 0 });
  const [sinCreatedIds, setSinCreatedIds] = useState([]);
  const [fixing, setFixing] = useState(false);

  // Debug
  const [debug, setDebug] = useState({
    usuarioEmpresaId: empresaIdStr,
    usuarioEmpresaIdType: typeof (usuario?.empresaId),
    userDocEmpresaId: null,
    userDocEmpresaIdType: null,
    muestraEmpresaIdOrdenes: [],
    lastSnapshotError: null,
    lastWriteError: null,
  });
  const [verDebug, setVerDebug] = useState(false);

  // Parche lectura usuarios/{uid} (empresaId)
  useEffect(() => {
    (async () => {
      try {
        if (usuario?.uid) {
          const uref = doc(db, "usuarios", usuario.uid);
          const usnap = await getDoc(uref);
          if (usnap.exists()) {
            const eid = usnap.data()?.empresaId;
            setDebug(d => ({ ...d, userDocEmpresaId: eid != null ? String(eid) : null, userDocEmpresaIdType: typeof eid }));
          } else {
            setDebug(d => ({ ...d, userDocEmpresaId: "(no existe doc usuarios/{uid})" }));
          }
        } else {
          setDebug(d => ({ ...d, userDocEmpresaId: "(sin uid en usuarioActivo)" }));
        }
      } catch (e) {
        setDebug(d => ({ ...d, userDocEmpresaId: `(error leyendo usuarios/${usuario?.uid}): ${e?.message}` }));
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

          const arr = Array.from(acc.values()).sort((a, b) => getSortMsBy(b, tipoFecha) - getSortMsBy(a, tipoFecha));
          const pendingLocal = arr.reduce((n, r) => n + (r.__pending ? 1 : 0), 0);
          setLiveMeta({ fromCache: snap.metadata.fromCache, pendingLocal, total: arr.length });

          const rows = arr.map(({ __pending, ...r }) => r);
          setAllOrdenes(rows);
          setUltimaAct(new Date());
          setSinCreatedIds(arr.filter(r => !r.createdAt && !r.__pending).map(r => r.id));
          setDebug(d => ({
            ...d,
            muestraEmpresaIdOrdenes: arr.slice(0, 3).map(x => ({ id: x.id, empresaId: x.empresaId, tipo: typeof x.empresaId }))
          }));
          setCargando(false);
        };

        const onErr = (e) => {
          finished = true;
          if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
          console.error("onSnapshot error:", e);
          setDebug(d => ({ ...d, lastSnapshotError: e?.message || String(e) }));
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
  }, [usuario?.empresaId, tipoFecha]);

  /** Listas para filtros */
  const mensajerosDisponibles = useMemo(() => {
    const set = new Set();
    for (const o of allOrdenes) if (o.asignadoNombre) set.add(String(o.asignadoNombre));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allOrdenes]);

  const operadoresDisponibles = useMemo(() => {
    const set = new Set();
    for (const o of allOrdenes) {
      const op = o.creadoPorNombre || o.usuario || o.creadoPor || "";
      if (op) set.add(String(op));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allOrdenes]);

  /** Filtrado en memoria */
  const { filtered: ordenesFiltradas, counts: filtroCounts } = useMemo(() => {
    if (!Array.isArray(allOrdenes)) {
      return { filtered: [], counts: { conCreatedAt: 0, conFechaStr: 0, sinFecha: 0, inRange: 0, outRange: 0 } };
    }
    const d = new Date(desde); d.setHours(0, 0, 0, 0);
    const h = new Date(hasta); h.setHours(23, 59, 59, 999);
    const msD = d.getTime(), msH = h.getTime();

    let conCreatedAt = 0, conFechaStr = 0, sinFecha = 0, inRange = 0, outRange = 0;

    const filteredBase = allOrdenes.filter(o => {
      const cMs = tsToMs(o?.createdAt);
      if (Number.isFinite(cMs)) conCreatedAt++;

      let whenMs = getMsByTipo(o, tipoFecha);
      if (!Number.isFinite(whenMs) && tipoFecha === "programada") {
        const fm = parseFlexibleDateString(o?.fecha);
        if (Number.isFinite(fm)) { conFechaStr++; whenMs = fm; }
      }
      if (!Number.isFinite(whenMs)) { sinFecha++; return true; }

      if (whenMs >= msD && whenMs <= msH) { inRange++; return true; }
      outRange++; return false;
    });

    let final = filteredBase;
    if (soloEntregadas) final = final.filter(o => o.entregado);
    if (soloConPod) final = final.filter(o => !!(o?.proofUrl || (Array.isArray(o?.fotosPodUrls) && o.fotosPodUrls.length > 0)));
    if (mensajeroSel) final = final.filter(o => (o.asignadoNombre || "") === mensajeroSel);
    if (operadorSel) final = final.filter(o => (o.creadoPorNombre || o.usuario || o.creadoPor || "") === operadorSel);

    final.sort((a, b) => getSortMsBy(b, tipoFecha) - getSortMsBy(a, tipoFecha));
    return { filtered: final, counts: { conCreatedAt, conFechaStr, sinFecha, inRange, outRange } };
  }, [allOrdenes, desde, hasta, soloEntregadas, soloConPod, mensajeroSel, operadorSel, tipoFecha]);

  /** Rango disponible */
  const rangoDisponible = useMemo(() => {
    if (!Array.isArray(allOrdenes) || allOrdenes.length === 0) return { minMs: NaN, maxMs: NaN };
    let minMs = Infinity, maxMs = -Infinity;
    for (const o of allOrdenes) {
      const ms = getSortMsBy(o, tipoFecha);
      if (Number.isFinite(ms)) {
        if (ms < minMs) minMs = ms;
        if (ms > maxMs) maxMs = ms;
      }
    }
    return { minMs, maxMs };
  }, [allOrdenes, tipoFecha]);

  useEffect(() => {
    if (liveMeta.total > 0 && filtroCounts.inRange === 0 && filtroCounts.outRange > 0) {
      const { minMs, maxMs } = rangoDisponible;
      if (Number.isFinite(minMs) && Number.isFinite(maxMs)) {
        setDesde(msToYMD(minMs)); setHasta(msToYMD(maxMs));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMeta.total, filtroCounts.inRange, filtroCounts.outRange, rangoDisponible.minMs, rangoDisponible.maxMs]);

  /** KPIs + agregados */
  const stats = useMemo(() => {
    const base = {
      total: 0, entregadas: 0, pendientes: 0,
      avgCreacionARecibida: null, avgRecibidaAEntregada: null, avgTotal: null,
      p50Total: null, p90Total: null, dentroSLA: 0, slaPct: "—",
      // agrupaciones
      porMensajero: [], porZona: {}, porDiaSemana: {}, porMes: {},
      porHoraCreacion: {}, franjasCreacion: {},
      porHoraEntrega: {}, franjasEntrega: {},
      // operadores
      porOperador: [],
      // salud
      faltantesCoords: 0, faltantesAddress: 0,
      duplicadasFactura: [],
      exportRows: [],
      // extras
      conPOD: 0, podPct: "—",
      onTimeCount: 0, onTimePct: "—",
      tendencias: [],
    };
    if (!ordenesFiltradas.length) return base;

    let sumCR = 0, nCR = 0, sumRE = 0, nRE = 0, sumTOT = 0, nTOT = 0;
    const porMensajeroMap = {}, porZona = {}, porMes = {}, rows = [];
    const porOperadorMap = {}; // << nuevo
    const tiemposTotales = [];
    const facturaCount = {};
    const tendenciasMap = {};

    for (const o of ordenesFiltradas) {
      base.total += 1;
      if (o.entregado) base.entregadas += 1; else base.pendientes += 1;

      // salud de datos
      const hasAddr = !!(o.address?.formatted || o.direccionTexto);
      if (!hasAddr) base.faltantesAddress += 1;
      const lat = o?.address?.lat ?? o?.destino?.lat ?? o?.destinoLat ?? null;
      const lng = o?.address?.lng ?? o?.destino?.lng ?? o?.destinoLng ?? null;
      if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) base.faltantesCoords += 1;

      // duplicados
      if (o.numeroFactura) {
        const keyNF = String(o.numeroFactura).trim();
        facturaCount[keyNF] = (facturaCount[keyNF] || 0) + 1;
      }

      // hora/fecha de creación (para creacion por hora/franja)
      let hrCre = null;
      const msC = tsToMs(o.createdAt);
      if (Number.isFinite(msC)) {
        const d = new Date(msC);
        hrCre = d.getHours();
        const kHr = String(hrCre).padStart(2, "0");
        base.porHoraCreacion[kHr] = (base.porHoraCreacion[kHr] || 0) + 1;
        const dow = d.getDay();
        base.porDiaSemana[dow] = (base.porDiaSemana[dow] || 0) + 1;
        const ym = yyyymm(d); porMes[ym] = (porMes[ym] || 0) + 1;
        const frC = franjaDesdeHora(hrCre);
        base.franjasCreacion[frC] = (base.franjasCreacion[frC] || 0) + 1;
      } else {
        const msF = parseFlexibleDateString(o?.fecha);
        if (Number.isFinite(msF)) {
          const d = new Date(msF);
          hrCre = d.getHours();
          const kHr = String(hrCre).padStart(2, "0");
          base.porHoraCreacion[kHr] = (base.porHoraCreacion[kHr] || 0) + 1;
          const dow = d.getDay();
          base.porDiaSemana[dow] = (base.porDiaSemana[dow] || 0) + 1;
          const ym = yyyymm(d); porMes[ym] = (porMes[ym] || 0) + 1;
          const frC = franjaDesdeHora(hrCre);
          base.franjasCreacion[frC] = (base.franjasCreacion[frC] || 0) + 1;
        }
      }

      // zona
      const zona = zonaHeuristica(o.address, o.direccionTexto);
      porZona[zona] = porZona[zona] || { total: 0, entregadas: 0, sumTOT: 0, nTOT: 0 };
      porZona[zona].total += 1; if (o.entregado) porZona[zona].entregadas += 1;

      // tiempos
      const tCR = diffMin(o.fechaRecibida, o.createdAt);
      const tRE = diffMin(o.fechaEntregada, o.fechaRecibida);
      const tTOT = diffMin(o.fechaEntregada, o.createdAt);
      if (Number.isFinite(tCR)) { sumCR += tCR; nCR += 1; }
      if (Number.isFinite(tRE)) { sumRE += tRE; nRE += 1; }
      if (Number.isFinite(tTOT)) { sumTOT += tTOT; nTOT += 1; porZona[zona].sumTOT += tTOT; porZona[zona].nTOT += 1; tiemposTotales.push(tTOT); }

      // POD
      const tienePOD = !!(o?.proofUrl || (Array.isArray(o?.fotosPodUrls) && o.fotosPodUrls.length > 0));
      if (tienePOD) base.conPOD += 1;

      // on-time
      const progMs = msProgramada(o);
      const entMs = tsToMs(o?.fechaEntregada);
      const tolMs = (Number.isFinite(toleranciaOnTimeMin) ? toleranciaOnTimeMin : 15) * 60000;
      const esOnTime = o.entregado && Number.isFinite(progMs) && Number.isFinite(entMs) && entMs <= (progMs + tolMs);
      if (esOnTime) base.onTimeCount += 1;

      // hora de entrega (para entrega por hora/franja + tendencias)
      if (Number.isFinite(entMs)) {
        const dE = new Date(entMs);
        const hrE = dE.getHours();
        const kHrE = String(hrE).padStart(2, "0");
        base.porHoraEntrega[kHrE] = (base.porHoraEntrega[kHrE] || 0) + 1;
        const frE = franjaDesdeHora(hrE);
        base.franjasEntrega[frE] = (base.franjasEntrega[frE] || 0) + 1;

        const ymd = msToYMD(entMs);
        const ent = tendenciasMap[ymd] || { entregadas: 0, sumTOT: 0, nTOT: 0 };
        ent.entregadas += 1;
        if (Number.isFinite(tTOT)) { ent.sumTOT += tTOT; ent.nTOT += 1; }
        tendenciasMap[ymd] = ent;
      }

      // por mensajero
      const keyM = o.asignadoUid || o.asignadoNombre || "—"; const nombreM = o.asignadoNombre || keyM;
      porMensajeroMap[keyM] = porMensajeroMap[keyM] || { nombre: nombreM, total: 0, entregadas: 0, sumRE: 0, nRE: 0, sumTOT: 0, nTOT: 0, pod: 0, onTime: 0 };
      porMensajeroMap[keyM].total += 1; if (o.entregado) porMensajeroMap[keyM].entregadas += 1;
      if (Number.isFinite(tRE)) { porMensajeroMap[keyM].sumRE += tRE; porMensajeroMap[keyM].nRE += 1; }
      if (Number.isFinite(tTOT)) { porMensajeroMap[keyM].sumTOT += tTOT; porMensajeroMap[keyM].nTOT += 1; }
      if (tienePOD) porMensajeroMap[keyM].pod += 1;
      if (esOnTime) porMensajeroMap[keyM].onTime += 1;

      // por operador (quién la creó)
      const nombreOp = o.creadoPorNombre || o.usuario || o.creadoPor || "—";
      const keyOp = nombreOp || "—";
      porOperadorMap[keyOp] = porOperadorMap[keyOp] || {
        nombre: nombreOp,
        creadas: 0,
        entregadas: 0,
        sumTOT: 0, nTOT: 0,
        tiempos: [],
        horas: {},     // 0-23
        franjas: {},   // franjas
      };
      porOperadorMap[keyOp].creadas += 1;
      if (o.entregado) {
        porOperadorMap[keyOp].entregadas += 1;
        if (Number.isFinite(tTOT)) { porOperadorMap[keyOp].sumTOT += tTOT; porOperadorMap[keyOp].nTOT += 1; porOperadorMap[keyOp].tiempos.push(tTOT); }
      }
      if (hrCre != null) {
        const kHr = String(hrCre).padStart(2, "0");
        porOperadorMap[keyOp].horas[kHr] = (porOperadorMap[keyOp].horas[kHr] || 0) + 1;
        const fr = franjaDesdeHora(hrCre);
        porOperadorMap[keyOp].franjas[fr] = (porOperadorMap[keyOp].franjas[fr] || 0) + 1;
      }

      // export fila
      rows.push({
        id: o.id, cliente: o.cliente || "", mensajero: nombreM,
        creado: Number.isFinite(msC) ? new Date(msC).toLocaleString() : "",
        recibida: o.fechaRecibida ? new Date(tsToMs(o.fechaRecibida)).toLocaleString() : "",
        entregada: o.fechaEntregada ? new Date(tsToMs(o.fechaEntregada)).toLocaleString() : "",
        zona,
        estado: o.entregado ? "ENTREGADA" : o.recibida ? "RECIBIDA" : "PENDIENTE",
        tiene_pod: tienePOD ? "sí" : "no",
        on_time: esOnTime ? "sí" : "no",
        operador: nombreOp,
        min_creacion_a_recibida: Number.isFinite(diffMin(o.fechaRecibida, o.createdAt)) ? diffMin(o.fechaRecibida, o.createdAt).toFixed(1) : "",
        min_recibida_a_entregada: Number.isFinite(diffMin(o.fechaEntregada, o.fechaRecibida)) ? diffMin(o.fechaEntregada, o.fechaRecibida).toFixed(1) : "",
        min_total: Number.isFinite(diffMin(o.fechaEntregada, o.createdAt)) ? diffMin(o.fechaEntregada, o.createdAt).toFixed(1) : "",
      });
    }

    const avg = (s, n) => n > 0 ? s / n : null;
    base.avgCreacionARecibida = avg(sumCR, nCR);
    base.avgRecibidaAEntregada = avg(sumRE, nRE);
    base.avgTotal = avg(sumTOT, nTOT);

    base.p50Total = percentile(tiemposTotales, 50);
    base.p90Total = percentile(tiemposTotales, 90);
    const objetivo = Number.isFinite(objetivoMinTotal) ? objetivoMinTotal : 45;
    base.dentroSLA = tiemposTotales.filter(t => Number.isFinite(t) && t <= objetivo).length;
    base.slaPct = pct(base.dentroSLA, tiemposTotales.length || 0);

    base.podPct = pct(base.conPOD, base.entregadas || 0);
    base.onTimePct = pct(base.onTimeCount, base.entregadas || 0);

    base.porZona = porZona;
    base.porMes = porMes;

    base.porMensajero = Object.entries(porMensajeroMap)
      .map(([uid, v]) => ({
        uid, nombre: v.nombre, total: v.total, entregadas: v.entregadas,
        tasaExito: v.total ? v.entregadas / v.total : 0,
        avgEntregaMin: avg(v.sumRE, v.nRE),
        avgTotalMin: avg(v.sumTOT, v.nTOT),
        podPctNum: v.entregadas ? (v.pod / v.entregadas) : 0,
        onTimePctNum: v.entregadas ? (v.onTime / v.entregadas) : 0,
      }))
      .sort((a, b) => b.entregadas - a.entregadas || b.total - a.total);

    base.porOperador = Object.entries(porOperadorMap)
      .map(([k, v]) => ({
        nombre: v.nombre || k,
        creadas: v.creadas,
        entregadas: v.entregadas,
        promedioTotal: avg(v.sumTOT, v.nTOT),
        p50: percentile(v.tiempos, 50),
        p90: percentile(v.tiempos, 90),
        horas: v.horas,
        franjas: v.franjas,
      }))
      .sort((a, b) => b.creadas - a.creadas || (b.promedioTotal ?? 0) - (a.promedioTotal ?? 0));

    base.duplicadasFactura = Object.entries(facturaCount)
      .filter(([, c]) => c > 1)
      .map(([nf, c]) => ({ numeroFactura: nf, repeticiones: c }));

    base.exportRows = rows;

    base.tendencias = Object.entries(tendenciasMap)
      .map(([fecha, v]) => ({ fecha, entregadas: v.entregadas, promTotal: v.nTOT ? (v.sumTOT / v.nTOT) : null }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenesFiltradas, objetivoMinTotal, toleranciaOnTimeMin]);

  /** Acciones de prueba */
  const COLEC = COLLECTION_NAME;
  async function crearOrdenPrueba() {
    try {
      let u = null; try { u = JSON.parse(localStorage.getItem("usuarioActivo") || "null"); } catch {}
      const emp = (u?.empresaId != null && u?.empresaId !== "") ? String(u.empresaId) : null;
      if (!emp) throw new Error("empresaId vacío en usuarioActivo. No crearé la orden.");

      const now = new Date(); const fecha = now.toISOString().slice(0, 10); const hora = now.toTimeString().slice(0, 5);
      const nombreUsuario = u?.nombre || u?.usuario || "tester";
      const rolUsuario = (u?.rol || "administrador").toLowerCase();

      const dummy = {
        empresaId: emp,
        cliente: "PRUEBA KPI", telefono: "000-000-0000", numeroFactura: `TEST-${Date.now()}`,
        monto: "0", fecha, hora,
        address: { formatted: "Punto de prueba, Santo Domingo", lat: 18.4861, lng: -69.9312 },
        destinoLat: 18.4861, destinoLng: -69.9312, direccionTexto: "Punto de prueba, Santo Domingo",
        entregado: false, recibida: false, fechaRecibida: null, fechaEntregada: null, tiempoTotalEntrega: null,
        asignadoUid: null, asignadoNombre: null,
        usuario: nombreUsuario, rolUsuario, // ← operador (compatibilidad)
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, COLEC), dummy);
      alert(`✅ Orden de prueba creada (${ref.id}).`);
    } catch (e) {
      console.error("crearOrdenPrueba:", e);
      setDebug(d => ({ ...d, lastWriteError: e?.message || String(e) }));
      alert("No pude crear la orden de prueba: " + (e?.message || ""));
    }
  }
  async function crearYCompletarPrueba() {
    try {
      let u = null; try { u = JSON.parse(localStorage.getItem("usuarioActivo") || "null"); } catch {}
      const emp = (u?.empresaId != null && u?.empresaId !== "") ? String(u.empresaId) : null;
      if (!emp) throw new Error("empresaId vacío en usuarioActivo. No crearé la orden.");

      const now = new Date(); const fecha = now.toISOString().slice(0, 10); const hora = now.toTimeString().slice(0, 5);
      const nombreUsuario = u?.nombre || u?.usuario || "tester";
      const rolUsuario = (u?.rol || "administrador").toLowerCase();

      const base = {
        empresaId: emp,
        cliente: "PRUEBA FLUJO", telefono: "000-000-0000", numeroFactura: `FLOW-${Date.now()}`, monto: "0", fecha, hora,
        address: { formatted: "Punto flujo, Santo Domingo", lat: 18.49, lng: -69.93 },
        destinoLat: 18.49, destinoLng: -69.93, direccionTexto: "Punto flujo, Santo Domingo",
        entregado: false, recibida: false, fechaRecibida: null, fechaEntregada: null, tiempoTotalEntrega: null,
        asignadoUid: "rider-1", asignadoNombre: "Carlos",
        usuario: nombreUsuario, rolUsuario, // ← operador
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, COLEC), base);
      setTimeout(() => updateDoc(doc(db, COLEC, ref.id), { recibida: true, fechaRecibida: serverTimestamp() })
        .catch(e => { console.error("mark recibida:", e); setDebug(d => ({ ...d, lastWriteError: e?.message || String(e) })); }), 2000);
      setTimeout(() => updateDoc(doc(db, COLEC, ref.id), { entregado: true, fechaEntregada: serverTimestamp(), tiempoTotalEntrega: "2.0" })
        .catch(e => { console.error("mark entregada:", e); setDebug(d => ({ ...d, lastWriteError: e?.message || String(e) })); }), 4000);
      alert(`✅ Orden de flujo creada: ${ref.id}.`);
    } catch (e) {
      console.error("crearYCompletarPrueba:", e);
      setDebug(d => ({ ...d, lastWriteError: e?.message || String(e) }));
      alert("No pude crear la orden de flujo: " + (e?.message || ""));
    }
  }
  async function arreglarCreatedAtFaltantes() {
    if (!empresaIdStr) return alert("Falta empresaId.");
    if (!sinCreatedIds.length) return alert("No hay órdenes por corregir.");
    try {
      setFixing(true);
      let ok = 0, fail = 0;
      for (const id of sinCreatedIds) {
        try { await updateDoc(doc(db, COLLECTION_NAME, id), { createdAt: serverTimestamp() }); ok++; }
        catch (e) { console.warn("Fix createdAt fallo:", id, e?.message); fail++; }
      }
      alert(`Fix createdAt listo. OK: ${ok} · Fallas: ${fail}`);
      setFixing(false);
    } catch (e) {
      console.error("arreglarCreatedAtFaltantes:", e);
      setFixing(false);
    }
  }

  /** KPIs cards */
  const kpis = [
    { label: "Órdenes (rango)", value: stats.total },
    { label: "Entregadas", value: stats.entregadas },
    { label: "Pendientes", value: stats.pendientes },
    { label: "Prom. creación→recibida", value: fmtMin(stats.avgCreacionARecibida) },
    { label: "Prom. recibida→entregada", value: fmtMin(stats.avgRecibidaAEntregada) },
    { label: "Prom. total", value: fmtMin(stats.avgTotal) },
    { label: "P50 total", value: fmtMin(stats.p50Total) },
    { label: "P90 total", value: fmtMin(stats.p90Total) },
    { label: `SLA ≤ ${objetivoMinTotal} min`, value: stats.slaPct },
    { label: "% con POD (sobre entregadas)", value: stats.podPct },
    { label: `% On-time (≤ ${toleranciaOnTimeMin} min)`, value: stats.onTimePct },
  ];

  // Auxiliares UI
  const duplicadas = stats.duplicadasFactura || [];
  const zonasEntries = Object.entries(stats.porZona || {});
  const porMesEntries = Object.entries(stats.porMes || {});
  const porDia = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

  // Totales para % de franjas globales
  const totalCreacionConHora = FRANJAS_ORDEN.reduce((s, fr) => s + (stats.franjasCreacion[fr] || 0), 0);
  const totalEntregaConHora = FRANJAS_ORDEN.reduce((s, fr) => s + (stats.franjasEntrega[fr] || 0), 0);
  const horas24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));

  // Datos para gráficos globales
  const franjaCreacionData = FRANJAS_ORDEN.map(fr => ({ label: fr, value: stats.franjasCreacion[fr] || 0 }));
  const franjaEntregaData  = FRANJAS_ORDEN.map(fr => ({ label: fr, value: stats.franjasEntrega[fr] || 0 }));
  const horasCreacionData  = horas24.map(h => ({ label: h, value: stats.porHoraCreacion[h] || 0 }));
  const horasEntregaData   = horas24.map(h => ({ label: h, value: stats.porHoraEntrega[h] || 0 }));
  const diaSemanaData      = porDia.map((d, i) => ({ label: d, value: stats.porDiaSemana[i] || 0 }));

  // Si hay operador seleccionado, datasets específicos
  const operadorObj = stats.porOperador.find(o => o.nombre === operadorSel);
  const totalFranjasOperador = operadorObj ? FRANJAS_ORDEN.reduce((s, fr) => s + (operadorObj.franjas?.[fr] || 0), 0) : 0;
  const franjaOperadorData = operadorObj ? FRANJAS_ORDEN.map(fr => ({ label: fr, value: operadorObj.franjas?.[fr] || 0 })) : [];
  const horasOperadorData  = operadorObj ? horas24.map(h => ({ label: h, value: operadorObj.horas?.[h] || 0 })) : [];

  // Presets de rango
  function setHoy() { const d = new Date(); const ymd = d.toISOString().slice(0,10); setDesde(ymd); setHasta(ymd); }
  function setSemana() {
    const d = new Date(); const day = d.getDay();
    const diffToMon = (day + 6) % 7;
    const lunes = new Date(d); lunes.setDate(d.getDate() - diffToMon);
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
    setDesde(lunes.toISOString().slice(0,10)); setHasta(domingo.toISOString().slice(0,10));
  }
  function setMes() {
    const d = new Date();
    theme: null
    const desdeD = new Date(d.getFullYear(), d.getMonth(), 1);
    const hastaD = new Date(d.getFullYear(), d.getMonth()+1, 0);
    setDesde(desdeD.toISOString().slice(0,10)); setHasta(hastaD.toISOString().slice(0,10));
  }

  return (
    <div className="stats-page">
      {/* THEME (solo para este componente) */}
      <style>{`
        .stats-page{
          --bg:#f8fafc;
          --surface:#ffffff;
          --text:#0f172a;
          --muted:#64748b;
          --border:#e5e7eb;
          --primary:#7c3aed;        /* violeta suave */
          --primary-weak:#ede9fe;   /* fondo pastel */
          --accent:#06b6d4;         /* cian suave */
          --green:#10b981;
          --green-weak:#ecfdf5;
          --orange:#f59e0b;
          --red:#ef4444;
          --shadow:0 1px 3px rgba(2,6,23,.06),0 1px 2px rgba(2,6,23,.04);
          background:var(--bg);
          min-height:100%;
          padding:16px;
          color:var(--text);
        }
        .header{
          display:flex; align-items:center; gap:10px; margin-bottom:10px;
        }
        .title{
          margin:0;
          font-weight:800;
          letter-spacing:.2px;
        }
        .pill{
          background:var(--primary-weak);
          color:var(--primary);
          padding:4px 10px; border-radius:999px;
          font-size:12px; font-weight:600;
        }
        .toolbar{ display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end; }
        .toolbar .group{ display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; }
        .toolbar label{ font-size:12px; color:var(--muted); display:block; margin-bottom:4px; }
        .toolbar input, .toolbar select{
          padding:8px 10px; border:1px solid var(--border); border-radius:10px; background:#fff; min-width:150px;
        }
        .btn{ padding:8px 12px; border:1px solid var(--border); border-radius:10px; background:#fff; cursor:pointer; transition:transform .02s, background .2s, border .2s; }
        .btn:hover{ background:#f9fafb; }
        .btn:active{ transform:scale(.98); }
        .btn-primary{ background:var(--primary); color:#fff; border-color:var(--primary); }
        .btn-primary:hover{ filter:brightness(.98); }
        .btn-soft{ background:var(--primary-weak); color:var(--primary); border-color:transparent; }
        .btn-ghost{ background:transparent; border-color:transparent; color:var(--muted); }
        .meta{ font-size:12px; color:var(--muted); display:flex; gap:12px; align-items:center; }
        .card{
          background:var(--surface);
          border:1px solid var(--border);
          border-radius:14px;
          padding:14px;
          box-shadow:var(--shadow);
        }
        .card-title{ margin:0 0 8px 0; font-size:14px; color:#111827; font-weight:700; }
        .kpi-grid{
          display:grid;
          grid-template-columns:repeat(auto-fit, minmax(200px,1fr));
          gap:12px; margin-top:12px;
        }
        .kpi{
          border:1px solid var(--border);
          border-radius:14px;
          padding:14px;
          background:var(--surface);
          box-shadow:var(--shadow);
        }
        .kpi .label{ font-size:12px; color:var(--muted); }
        .kpi .value{ font-size:22px; font-weight:800; letter-spacing:.2px; margin-top:2px; }
        .hbar-list .hbar-row{
          display:grid; grid-template-columns:90px 1fr 60px; align-items:center; gap:10px; margin:10px 0;
        }
        .hbar-label{ font-size:12px; color:var(--muted); }
        .hbar-track{ background:#eef2ff; border-radius:999px; height:12px; overflow:hidden; }
        .hbar-fill{ height:100%; background:linear-gradient(90deg,var(--primary) 0%, #8b5cf6 100%); }
        .hbar-value{ text-align:right; font-variant-numeric:tabular-nums; }
        .vbar-wrap{ display:flex; align-items:flex-end; gap:10px; }
        .vbar-col{ flex:1; display:flex; flex-direction:column; align-items:center; gap:6px; }
        .vbar-track{ width:100%; background:#f1f5f9; border-radius:8px; height:100%; display:flex; align-items:flex-end; overflow:hidden; }
        .vbar-fill{ width:100%; background:linear-gradient(180deg,#22d3ee 0%, #06b6d4 100%); border-top-left-radius:8px; border-top-right-radius:8px; }
        .vbar-label{ font-size:10px; color:var(--muted); }
        .section-title{ margin:18px 0 8px 0; font-size:16px; font-weight:800; }
        .table-wrap{ overflow-x:auto; }
        table.pretty{ width:100%; border-collapse:separate; border-spacing:0; }
        table.pretty th{
          text-align:left; padding:10px; font-size:12px; color:#111827; background:#fafafa; border-bottom:1px solid var(--border);
          position:sticky; top:0; z-index:1;
        }
        table.pretty td{
          padding:10px; border-bottom:1px solid #f1f5f9; vertical-align:top;
        }
        table.pretty tbody tr:nth-child(odd){ background:#fcfcff; }
        table.pretty tbody tr:hover{ background:#f8fafc; }
        .hint{ font-size:12px; color:var(--muted); margin-top:10px; }
        .badge{
          display:inline-block; padding:3px 8px; border-radius:999px; border:1px solid var(--border); background:#fff; color:var(--muted); font-size:12px;
        }
      `}</style>

      <div className="header">
        <h2 className="title">📊 Estadísticas (Administrador)</h2>
        <span className="pill">Vista en vivo</span>
        <div style={{ marginLeft: "auto", display:"flex", gap:8 }}>
          <button className="btn btn-soft" onClick={() => setVerDebug(v => !v)}>{verDebug ? "Ocultar debug" : "Mostrar debug"}</button>
        </div>
      </div>

      {verDebug && (
        <div className="card" style={{ marginBottom: 10, background:"#fffbeb", borderColor:"#fde68a" }}>
          <div className="card-title">Debug</div>
          <div className="meta" style={{ flexWrap:"wrap" }}>
            <span>usuarioActivo.empresaId: <code>{String(debug.usuarioEmpresaId)}</code> (typeof {debug.usuarioEmpresaIdType})</span>
            <span>usuarios/{usuario?.uid}.empresaId: <code>{String(debug.userDocEmpresaId)}</code> (typeof {debug.userDocEmpresaIdType})</span>
            <span>docs: <b>{liveMeta.total}</b></span>
            <span>pending: <b>{liveMeta.pendingLocal}</b></span>
          </div>
          <div className="meta" style={{ marginTop:6 }}>
            <span>Filtro — conCreatedAt: <b>{filtroCounts.conCreatedAt}</b></span>
            <span>conFechaStr: <b>{filtroCounts.conFechaStr}</b></span>
            <span>sinFecha: <b>{filtroCounts.sinFecha}</b></span>
            <span>inRange: <b>{filtroCounts.inRange}</b></span>
            <span>outRange: <b>{filtroCounts.outRange}</b></span>
          </div>
        </div>
      )}

      <div className="meta" style={{ marginBottom: 8 }}>
        <span className="badge">cache: {String(liveMeta.fromCache)}</span>
        <span className="badge">pendientes: {liveMeta.pendingLocal}</span>
        <span className="badge">docs: {liveMeta.total}</span>
        <span style={{ marginLeft:"auto" }}>
          <b>Rango disponible:</b>{" "}
          {Number.isFinite(rangoDisponible.minMs) ? msToYMD(rangoDisponible.minMs) : "—"} →{" "}
          {Number.isFinite(rangoDisponible.maxMs) ? msToYMD(rangoDisponible.maxMs) : "—"}
          <button className="btn btn-ghost" style={{ marginLeft: 8 }}
            onClick={() => {
              const { minMs, maxMs } = rangoDisponible;
              if (Number.isFinite(minMs) && Number.isFinite(maxMs)) { setDesde(msToYMD(minMs)); setHasta(msToYMD(maxMs)); }
              else { setDesde("2020-01-01"); setHasta(new Date().toISOString().slice(0, 10)); }
            }}
          >📅 Ver todo</button>
        </span>
      </div>

      {/* Filtros */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="toolbar">
          <div className="group">
            <div>
              <label>Desde</label>
              <input type="date" value={desde} onChange={e => setDesde(e.target.value)} />
            </div>
            <div>
              <label>Hasta</label>
              <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
            </div>
            <div>
              <label>Tipo de fecha</label>
              <select value={tipoFecha} onChange={e => setTipoFecha(e.target.value)}>
                <option value="creacion">Creación</option>
                <option value="programada">Programada (fecha/hora)</option>
                <option value="entrega">Entrega</option>
              </select>
            </div>
          </div>

          <div className="group" style={{ minWidth: 220 }}>
            <label style={{ display:"inline-flex", gap:6, alignItems:"center" }}>
              <input type="checkbox" checked={soloEntregadas} onChange={e => setSoloEntregadas(e.target.checked)} /> Solo entregadas
            </label>
            <label style={{ display:"inline-flex", gap:6, alignItems:"center" }}>
              <input type="checkbox" checked={soloConPod} onChange={e => setSoloConPod(e.target.checked)} /> Solo con POD
            </label>
          </div>

          <div className="group">
            <div>
              <label>Mensajero</label>
              <select value={mensajeroSel} onChange={e => setMensajeroSel(e.target.value)}>
                <option value="">(Todos)</option>
                {mensajerosDisponibles.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label>Operador (quien crea)</label>
              <select value={operadorSel} onChange={e => setOperadorSel(e.target.value)}>
                <option value="">(Todos)</option>
                {operadoresDisponibles.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          <div className="group">
            <div>
              <label>Objetivo SLA (min)</label>
              <input type="number" min={1} style={{ width: 100 }} value={objetivoMinTotal} onChange={e => setObjetivoMinTotal(Number(e.target.value) || 0)} />
            </div>
            <div>
              <label>Tolerancia On-time (min)</label>
              <input type="number" min={0} style={{ width: 100 }} value={toleranciaOnTimeMin} onChange={e => setToleranciaOnTimeMin(Number(e.target.value) ?? 0)} />
            </div>
          </div>

          <div className="group" style={{ marginLeft:"auto" }}>
            <button className="btn" onClick={setHoy}>📆 Hoy</button>
            <button className="btn" onClick={setSemana}>🗓️ Esta semana</button>
            <button className="btn" onClick={setMes}>🗓️ Este mes</button>
            <button className="btn" onClick={() => { setMensajeroSel(""); setOperadorSel(""); }} title="Quitar filtros">🧹 Limpiar</button>
          </div>

          <div className="group">
            <button className="btn" onClick={crearOrdenPrueba}>➕ Orden de prueba</button>
            <button className="btn" onClick={crearYCompletarPrueba}>🎯 Prueba completa (4s)</button>
            <button className="btn btn-primary"
              onClick={() => exportCSV(`ordenes_${desde}_a_${hasta}${soloEntregadas ? "_entregadas" : ""}.csv`, stats.exportRows)}
              disabled={!stats.exportRows.length}
            >⬇️ Exportar CSV</button>
          </div>
        </div>

        {sinCreatedIds.length > 0 && (
          <div className="meta" style={{ marginTop: 10 }}>
            <span style={{ color: "#b45309" }}>Hay {sinCreatedIds.length} órdenes sin <code>createdAt</code>.</span>
            <button className="btn btn-soft" onClick={arreglarCreatedAtFaltantes} disabled={fixing}>
              {fixing ? "Arreglando…" : "Arreglar createdAt"}
            </button>
          </div>
        )}

        {cargando && <div className="meta" style={{ marginTop: 8 }}>Cargando…</div>}
        {error && <div className="meta" style={{ marginTop: 8, color: "#b91c1c" }}>{error}</div>}
        {ultimaAct && <div className="meta" style={{ marginTop: 4 }}>Última actualización: {ultimaAct.toLocaleTimeString()}</div>}
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        {kpis.map(k => (
          <div key={k.label} className="kpi">
            <div className="label">{k.label}</div>
            <div className="value">{k.value}</div>
          </div>
        ))}
      </div>

      {/* Gráficos globales */}
      <HBarList title="⏰ Franjas de creación (órdenes registradas)" data={franjaCreacionData} total={totalCreacionConHora} />
      <HBarList title="⏱️ Franjas de entrega" data={franjaEntregaData} total={totalEntregaConHora} />
      <VBarChart title="🕘 Por hora de creación (0–23)" data={horasCreacionData} />
      <VBarChart title="🕒 Por hora de entrega (0–23)" data={horasEntregaData} />
      <VBarChart title="📅 Por día de la semana (creación)" data={diaSemanaData} />

      {/* Salud de datos */}
      <h3 className="section-title">🩺 Calidad de datos (diagnóstico local)</h3>
      <div className="table-wrap card">
        <table className="pretty">
          <thead><tr><th>Indicador</th><th>Valor</th></tr></thead>
          <tbody>
            <tr><td>Órdenes sin dirección (address/direccionTexto)</td><td>{stats.faltantesAddress}</td></tr>
            <tr><td>Órdenes sin coordenadas válidas</td><td>{stats.faltantesCoords}</td></tr>
          </tbody>
        </table>
      </div>

      {/* Duplicados por Nº de factura */}
      <h3 className="section-title">🧾 Posibles duplicados por Nº de factura</h3>
      <div className="table-wrap card">
        <table className="pretty">
          <thead><tr><th>Número de factura</th><th>Repeticiones</th></tr></thead>
          <tbody>
            {duplicadas.length
              ? duplicadas.sort((a, b) => b.repeticiones - a.repeticiones).map((r) =>
                <tr key={r.numeroFactura}><td>{r.numeroFactura}</td><td>{r.repeticiones}</td></tr>
              )
              : <tr><td colSpan={2}>Sin duplicados detectados en el rango.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Mensajeros */}
      <h3 className="section-title">🏆 Mensajeros</h3>
      <div className="table-wrap card">
        <table className="pretty">
          <thead><tr>
            <th>Mensajero</th><th>Entregadas</th><th>Órdenes (total)</th>
            <th>Tasa de éxito</th><th>Prom. entrega (recibida→entregada)</th><th>Prom. total</th>
            <th>% POD</th><th>% On-time</th>
          </tr></thead>
          <tbody>
            {stats.porMensajero.length ? stats.porMensajero.map(r => (
              <tr key={r.uid}>
                <td><button className="btn btn-ghost" onClick={() => setMensajeroSel(r.nombre)} title="Filtrar por este mensajero">{r.nombre}</button></td>
                <td style={{ textAlign:"center" }}>{r.entregadas}</td>
                <td style={{ textAlign:"center" }}>{r.total}</td>
                <td style={{ textAlign:"center" }}>{pct(r.entregadas, r.total)}</td>
                <td>{fmtMin(r.avgEntregaMin)}</td>
                <td>{fmtMin(r.avgTotalMin)}</td>
                <td style={{ textAlign:"center" }}>{pct(r.podPctNum * r.entregadas, r.entregadas)}</td>
                <td style={{ textAlign:"center" }}>{pct(r.onTimePctNum * r.entregadas, r.entregadas)}</td>
              </tr>
            )) : <tr><td colSpan={8}>Sin datos en el rango.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Operadores */}
      <h3 className="section-title">🧑‍💻 Operadores (órdenes creadas y tiempos de entrega)</h3>
      <div className="card" style={{ marginBottom: 8, display:"flex", gap:8, alignItems:"center" }}>
        <button
          className="btn"
          onClick={() => exportCSV(
            `kpi_operadores_${desde}_a_${hasta}.csv`,
            stats.porOperador.map(o => ({
              operador: o.nombre,
              creadas: o.creadas,
              entregadas: o.entregadas,
              promedio_total_min: o.promedioTotal != null ? o.promedioTotal.toFixed(2) : "",
              p50_min: o.p50 != null ? o.p50.toFixed(2) : "",
              p90_min: o.p90 != null ? o.p90.toFixed(2) : "",
            }))
          )}
          disabled={!stats.porOperador.length}
        >
          ⬇️ Exportar KPI operadores
        </button>
      </div>
      <div className="table-wrap card">
        <table className="pretty">
          <thead><tr>
            <th>Operador</th>
            <th>Creadas</th>
            <th>Entregadas</th>
            <th>Prom. total</th>
            <th>p50</th>
            <th>p90</th>
          </tr></thead>
          <tbody>
            {stats.porOperador.length ? stats.porOperador.map(o => (
              <tr key={o.nombre}>
                <td>
                  <button className="btn btn-ghost" onClick={() => setOperadorSel(o.nombre)} title="Filtrar por este operador">{o.nombre}</button>
                </td>
                <td style={{ textAlign:"center" }}>{o.creadas}</td>
                <td style={{ textAlign:"center" }}>{o.entregadas}</td>
                <td style={{ textAlign:"center" }}>{fmtMin(o.promedioTotal)}</td>
                <td style={{ textAlign:"center" }}>{fmtMin(o.p50)}</td>
                <td style={{ textAlign:"center" }}>{fmtMin(o.p90)}</td>
              </tr>
            )) : <tr><td colSpan={6}>Sin datos en el rango.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Si hay operador seleccionado, mostrar sus gráficos de creación */}
      {operadorSel && operadorObj && (
        <>
          <HBarList title={`⏰ Franjas de creación de ${operadorSel}`} data={franjaOperadorData} total={totalFranjasOperador} />
          <VBarChart title={`🕘 Por hora de creación (0–23) de ${operadorSel}`} data={horasOperadorData} />
        </>
      )}

      {/* Zonas */}
      <h3 className="section-title">🗺️ Zonas (tiempo promedio creación→entrega)</h3>
      <div className="table-wrap card">
        <table className="pretty">
          <thead><tr><th>Zona</th><th>Órdenes</th><th>Entregadas</th><th>Prom. total</th></tr></thead>
          <tbody>
            {zonasEntries.length ? zonasEntries
              .sort((a, b) => b[1].total - a[1].total)
              .map(([zona, v]) => {
                const avgTot = v.nTOT ? v.sumTOT / v.nTOT : null;
                return (
                  <tr key={zona}>
                    <td>{zona}</td>
                    <td style={{ textAlign:"center" }}>{v.total}</td>
                    <td style={{ textAlign:"center" }}>{v.entregadas}</td>
                    <td>{fmtMin(avgTot)}</td>
                  </tr>
                );
              }) : <tr><td colSpan={4}>Sin datos en el rango.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Tablas (día/mes) */}
      <h3 className="section-title">📅 Distribución por día de la semana (creación)</h3>
      <div className="table-wrap card">
        <table className="pretty">
          <thead><tr>{porDia.map(d => <th key={d}>{d}</th>)}</tr></thead>
          <tbody><tr>{porDia.map((_, i) => <td key={i} style={{ textAlign:"center" }}>{stats.porDiaSemana[i] || 0}</td>)}</tr></tbody>
        </table>
      </div>

      <h3 className="section-title">📈 Historial mensual (órdenes creadas)</h3>
      <div className="table-wrap card">
        <table className="pretty">
          <thead><tr><th>Mes</th><th>Órdenes</th></tr></thead>
          <tbody>
            {porMesEntries.length ? porMesEntries
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([mes, cnt]) => (
                <tr key={mes}><td>{mes}</td><td style={{ textAlign:"center" }}>{cnt}</td></tr>
              )) : <tr><td colSpan={2}>Sin datos en el rango.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Tendencias por día (según entrega) */}
      <h3 className="section-title">📊 Tendencias (por día de entrega)</h3>
      <div className="table-wrap card">
        <table className="pretty">
          <thead><tr><th>Fecha</th><th>Entregadas</th><th>Prom. total (min)</th></tr></thead>
          <tbody>
            {stats.tendencias.length ? stats.tendencias.map(t => (
              <tr key={t.fecha}><td>{t.fecha}</td><td style={{ textAlign:"center" }}>{t.entregadas}</td><td>{fmtMin(t.promTotal)}</td></tr>
            )) : <tr><td colSpan={3}>Sin datos de entrega en el rango.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="hint">
        * Asegúrate de que <code>usuarios/&#123;uid&#125;.empresaId</code> exista y coincida con <code>ordenes[].empresaId</code>.
      </div>
    </div>
  );
}
