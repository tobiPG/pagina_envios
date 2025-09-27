// src/pantallas/Reportes.jsx
import { useEffect, useMemo, useState } from "react";
import { db } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { ensureUsuarioActivo } from "../utils/ensureUsuario";

/** ───────── Helpers ───────── */
const COLLECTION = "ordenes";

function tsToMs(ts) {
  try {
    if (!ts) return NaN;
    if (typeof ts?.toDate === "function") return ts.toDate().getTime();
    if (typeof ts?.seconds === "number")
      return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts === "number") return ts;
    if (typeof ts === "string") {
      const m = new Date(ts).getTime();
      if (Number.isFinite(m)) return m;
    }
  } catch {}
  return NaN;
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
function diffMin(a, b) {
  const A = tsToMs(a), B = tsToMs(b);
  return Number.isFinite(A) && Number.isFinite(B) ? (A - B) / 60000 : null;
}
function fmtMin(n) { return Number.isFinite(n) ? `${n.toFixed(1)} min` : "—"; }
function pct(n, d) { return d ? `${((n / d) * 100).toFixed(1)}%` : "—"; }
function getMsByTipo(o, tipo) {
  if (tipo === "creacion") return tsToMs(o?.createdAt);
  if (tipo === "programada") return msProgramada(o);
  if (tipo === "entrega") return tsToMs(o?.fechaEntregada);
  return NaN;
}
function getSortMsBy(o, tipo) {
  const c = tsToMs(o?.createdAt);
  if (Number.isFinite(c)) return c;
  const w = getMsByTipo(o, tipo);
  if (Number.isFinite(w)) return w;
  return 0;
}
function exportCSV(filename, rows) {
  if (!rows?.length) return;
  const cols = Object.keys(rows[0]);
  const csv = [
    cols.join(","),
    ...rows.map(r => cols.map(c => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
const th = { textAlign: "left", borderBottom: "1px solid #eee", padding: "8px 10px", background: "#fafafa" };
const td = { borderBottom: "1px solid #f2f2f2", padding: "8px 10px" };
const tdCenter = { ...td, textAlign: "center" };

/** ───────── Componente ───────── */
export default function Reportes() {
  // Sesión
  let usuario = null; try { usuario = JSON.parse(localStorage.getItem("usuarioActivo") || "null"); } catch {}
  const rol = String(usuario?.rol || "").toLowerCase();
  const empresaId = (usuario?.empresaId != null && usuario?.empresaId !== "") ? String(usuario.empresaId) : null;

  if (!empresaId) return <div style={{ padding: 16, color: "#b00" }}>Falta empresaId en sesión.</div>;

  // Filtros
  const hoy = new Date();
  const desdeDefault = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
  const [desde, setDesde] = useState(desdeDefault);
  const [hasta, setHasta] = useState(hoy.toISOString().slice(0, 10));
  const [tipoFecha, setTipoFecha] = useState("creacion"); // creacion | programada | entrega
  const [soloEntregadas, setSoloEntregadas] = useState(false);
  const [soloConPod, setSoloConPod] = useState(false);
  const [mensajeroSel, setMensajeroSel] = useState("");
  const [operadorSel, setOperadorSel] = useState(""); // quien crea la orden (campo 'usuario')
  const [zonaFiltro, setZonaFiltro] = useState("");
  const [toleranciaOnTimeMin, setToleranciaOnTimeMin] = useState(15);

  // Datos
  const [ordenes, setOrdenes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [liveMeta, setLiveMeta] = useState({ fromCache: false, pendingLocal: 0, total: 0 });

  // Suscripción a órdenes por empresaId (string + num)
  useEffect(() => {
    if (!empresaId) return;
    let unsubs = [];
    let finished = false;
    let safetyTimer = null;

    (async () => {
      setLoading(true); setErr("");
      const ok = await ensureUsuarioActivo();
      if (!ok) { setErr("Sesión inválida."); setLoading(false); return; }

      const ref = collection(db, COLLECTION);
      const acc = new Map();

      const applySnap = (snap) => {
        finished = true;
        if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
        snap.docs.forEach(d => acc.set(d.id, { id: d.id, ...d.data(), __pending: d.metadata.hasPendingWrites === true }));
        const arr = Array.from(acc.values());
        const pendingLocal = arr.reduce((n, r) => n + (r.__pending ? 1 : 0), 0);
        setLiveMeta({ fromCache: snap.metadata.fromCache, pendingLocal, total: arr.length });
        setOrdenes(arr.map(({ __pending, ...r }) => r));
        setLoading(false);
      };
      const onErr = (e) => { setErr(e?.message || "No pude leer órdenes."); setLoading(false); };

      try {
        const qStr = query(ref, where("empresaId", "==", String(empresaId)));
        unsubs.push(onSnapshot(qStr, { includeMetadataChanges: true }, applySnap, onErr));
      } catch (e) { console.error("ordenes empresaId:string", e?.message); }

      const empNum = Number(empresaId);
      if (!Number.isNaN(empNum)) {
        try {
          const qNum = query(ref, where("empresaId", "==", empNum));
          unsubs.push(onSnapshot(qNum, { includeMetadataChanges: true }, applySnap, onErr));
        } catch (e) { console.error("ordenes empresaId:number", e?.message); }
      }

      safetyTimer = setTimeout(() => {
        if (!finished) { setLoading(false); setErr(prev => prev || "No llegó ningún snapshot (conexión/reglas)."); }
      }, 6000);
    })();

    return () => { unsubs.forEach(u => u && u()); if (safetyTimer) clearTimeout(safetyTimer); };
  }, [empresaId]);

  // Catálogos para selects
  const mensajerosDisponibles = useMemo(() => {
    const set = new Set();
    for (const o of ordenes) if (o.asignadoNombre) set.add(String(o.asignadoNombre));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [ordenes]);

  const operadoresDisponibles = useMemo(() => {
    const set = new Set();
    for (const o of ordenes) if (o.usuario) set.add(String(o.usuario));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [ordenes]);

  // Filtrado blindado
  const filtradas = useMemo(() => {
    const d = new Date(desde); d.setHours(0, 0, 0, 0);
    const h = new Date(hasta); h.setHours(23, 59, 59, 999);
    const msD = d.getTime(), msH = h.getTime();

    let res = ordenes.filter(o => {
      let whenMs = getMsByTipo(o, tipoFecha);
      if (!Number.isFinite(whenMs) && tipoFecha === "programada") {
        const fm = parseFlexibleDateString(o?.fecha);
        if (Number.isFinite(fm)) whenMs = fm;
      }
      if (!Number.isFinite(whenMs)) return true; // incluir si no hay fecha confiable
      return (whenMs >= msD && whenMs <= msH);
    });

    if (soloEntregadas) res = res.filter(o => o.entregado);
    if (soloConPod) res = res.filter(o => !!(o?.proofUrl || (Array.isArray(o?.fotosPodUrls) && o.fotosPodUrls.length > 0)));
    if (mensajeroSel) res = res.filter(o => (o.asignadoNombre || "") === mensajeroSel);
    if (operadorSel) res = res.filter(o => (o.usuario || "") === operadorSel);
    if (zonaFiltro.trim()) {
      const z = zonaFiltro.trim().toLowerCase();
      res = res.filter(o => String(o.zona || "").toLowerCase().includes(z));
    }

    // Orden por la fecha más confiable para vistas
    res.sort((a, b) => getSortMsBy(b, tipoFecha) - getSortMsBy(a, tipoFecha));
    return res;
  }, [ordenes, desde, hasta, tipoFecha, soloEntregadas, soloConPod, mensajeroSel, operadorSel, zonaFiltro]);

  // KPIs + agrupaciones
  const tolMs = (Number.isFinite(toleranciaOnTimeMin) ? toleranciaOnTimeMin : 15) * 60000;

  const resumen = useMemo(() => {
    let total = 0, entregadas = 0, sumTot = 0, nTot = 0, onTime = 0;
    for (const o of filtradas) {
      total += 1;
      if (o.entregado) entregadas += 1;
      const tTot = diffMin(o.fechaEntregada, o.createdAt);
      if (Number.isFinite(tTot)) { sumTot += tTot; nTot += 1; }
      const prog = msProgramada(o), entMs = tsToMs(o.fechaEntregada);
      if (o.entregado && Number.isFinite(prog) && Number.isFinite(entMs) && entMs <= (prog + tolMs)) onTime++;
    }
    return {
      total, entregadas, pendientes: total - entregadas,
      promTotal: nTot ? (sumTot / nTot) : null,
      onTime, onTimePct: pct(onTime, entregadas || 0),
    };
  }, [filtradas, tolMs]);

  const porOperador = useMemo(() => {
    const map = {};
    for (const o of filtradas) {
      const k = o.usuario || "—";
      map[k] = map[k] || { operador: k, total: 0, entregadas: 0, sumTot: 0, nTot: 0, onTime: 0 };
      map[k].total += 1; if (o.entregado) map[k].entregadas += 1;
      const tTot = diffMin(o.fechaEntregada, o.createdAt);
      if (Number.isFinite(tTot)) { map[k].sumTot += tTot; map[k].nTot += 1; }
      const prog = msProgramada(o), entMs = tsToMs(o.fechaEntregada);
      if (o.entregado && Number.isFinite(prog) && Number.isFinite(entMs) && entMs <= (prog + tolMs)) map[k].onTime += 1;
    }
    return Object.values(map).map(r => ({
      ...r,
      promTotal: r.nTot ? r.sumTot / r.nTot : null,
      onTimePct: pct(r.onTime, r.entregadas || 0),
      tasaExito: pct(r.entregadas, r.total || 0),
    })).sort((a, b) => b.entregadas - a.entregadas || b.total - a.total);
  }, [filtradas, tolMs]);

  const porMensajero = useMemo(() => {
    const map = {};
    for (const o of filtradas) {
      const k = o.asignadoNombre || o.asignadoUid || "—";
      map[k] = map[k] || { mensajero: k, total: 0, entregadas: 0, sumTot: 0, nTot: 0, onTime: 0 };
      map[k].total += 1; if (o.entregado) map[k].entregadas += 1;
      const tTot = diffMin(o.fechaEntregada, o.createdAt);
      if (Number.isFinite(tTot)) { map[k].sumTot += tTot; map[k].nTot += 1; }
      const prog = msProgramada(o), entMs = tsToMs(o.fechaEntregada);
      if (o.entregado && Number.isFinite(prog) && Number.isFinite(entMs) && entMs <= (prog + tolMs)) map[k].onTime += 1;
    }
    return Object.values(map).map(r => ({
      ...r,
      promTotal: r.nTot ? r.sumTot / r.nTot : null,
      onTimePct: pct(r.onTime, r.entregadas || 0),
      tasaExito: pct(r.entregadas, r.total || 0),
    })).sort((a, b) => b.entregadas - a.entregadas || b.total - a.total);
  }, [filtradas, tolMs]);

  const porCliente = useMemo(() => {
    const map = {};
    for (const o of filtradas) {
      const k = o.cliente || "—";
      map[k] = map[k] || { cliente: k, total: 0, entregadas: 0, sumTot: 0, nTot: 0 };
      map[k].total += 1; if (o.entregado) map[k].entregadas += 1;
      const tTot = diffMin(o.fechaEntregada, o.createdAt);
      if (Number.isFinite(tTot)) { map[k].sumTot += tTot; map[k].nTot += 1; }
    }
    return Object.values(map).map(r => ({
      ...r,
      promTotal: r.nTot ? r.sumTot / r.nTot : null,
      tasaExito: pct(r.entregadas, r.total || 0),
    })).sort((a, b) => b.total - a.total);
  }, [filtradas]);

  const porZona = useMemo(() => {
    const map = {};
    for (const o of filtradas) {
      const k = o.zona || "—";
      map[k] = map[k] || { zona: k, total: 0, entregadas: 0, sumTot: 0, nTot: 0 };
      map[k].total += 1; if (o.entregado) map[k].entregadas += 1;
      const tTot = diffMin(o.fechaEntregada, o.createdAt);
      if (Number.isFinite(tTot)) { map[k].sumTot += tTot; map[k].nTot += 1; }
    }
    return Object.values(map).map(r => ({
      ...r,
      promTotal: r.nTot ? r.sumTot / r.nTot : null,
      tasaExito: pct(r.entregadas, r.total || 0),
    })).sort((a, b) => b.total - a.total);
  }, [filtradas]);

  const topAtrasos = useMemo(() => {
    const arr = [];
    for (const o of filtradas) {
      const tTot = diffMin(o.fechaEntregada, o.createdAt);
      if (Number.isFinite(tTot)) {
        arr.push({
          id: o.id, cliente: o.cliente || "", factura: o.numeroFactura || "",
          mensajero: o.asignadoNombre || "", operador: o.usuario || "",
          min_total: tTot,
        });
      }
    }
    return arr.sort((a, b) => b.min_total - a.min_total).slice(0, 50);
  }, [filtradas]);

  // Exports
  const baseExportCols = {
    desde, hasta, tipoFecha, soloEntregadas, soloConPod, mensajeroSel, operadorSel, zonaFiltro
  };
  const expOperadores = () => exportCSV(`rep_operadores_${desde}_a_${hasta}.csv`,
    porOperador.map(r => ({
      operador: r.operador, total: r.total, entregadas: r.entregadas,
      prom_min_total: r.promTotal?.toFixed(1) || "",
      on_time_pct: r.onTimePct, tasa_exito: r.tasaExito,
      ...baseExportCols
    }))
  );
  const expMensajeros = () => exportCSV(`rep_mensajeros_${desde}_a_${hasta}.csv`,
    porMensajero.map(r => ({
      mensajero: r.mensajero, total: r.total, entregadas: r.entregadas,
      prom_min_total: r.promTotal?.toFixed(1) || "",
      on_time_pct: r.onTimePct, tasa_exito: r.tasaExito,
      ...baseExportCols
    }))
  );
  const expClientes = () => exportCSV(`rep_clientes_${desde}_a_${hasta}.csv`,
    porCliente.map(r => ({
      cliente: r.cliente, total: r.total, entregadas: r.entregadas,
      prom_min_total: r.promTotal?.toFixed(1) || "",
      tasa_exito: r.tasaExito, ...baseExportCols
    }))
  );
  const expZonas = () => exportCSV(`rep_zonas_${desde}_a_${hasta}.csv`,
    porZona.map(r => ({
      zona: r.zona, total: r.total, entregadas: r.entregadas,
      prom_min_total: r.promTotal?.toFixed(1) || "",
      tasa_exito: r.tasaExito, ...baseExportCols
    }))
  );
  const expTopAtrasos = () => exportCSV(`rep_top_atrasos_${desde}_a_${hasta}.csv`,
    topAtrasos.map(r => ({
      orderId: r.id, cliente: r.cliente, factura: r.factura,
      mensajero: r.mensajero, operador: r.operador,
      min_total: r.min_total.toFixed(1), ...baseExportCols
    }))
  );

  // UI
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>📑 Reportes</h2>
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#555" }}>
          cache: <code>{String(liveMeta.fromCache)}</code> · pendientes: <code>{liveMeta.pendingLocal}</code> · docs: <code>{liveMeta.total}</code>
        </div>
      </div>

      {err && <div style={{ marginTop: 8, color: "#b00" }}>{err}</div>}
      {loading && <div style={{ marginTop: 8 }}>Cargando…</div>}

      {/* Filtros */}
      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Filtros</h3>
        <div className="grid3">
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
          <div>
            <label>Zona</label>
            <input value={zonaFiltro} onChange={e => setZonaFiltro(e.target.value)} placeholder="Centro / Norte / ..." />
          </div>

          <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={soloEntregadas} onChange={e => setSoloEntregadas(e.target.checked)} /> Solo entregadas
          </label>
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={soloConPod} onChange={e => setSoloConPod(e.target.checked)} /> Solo con POD
          </label>
          <div>
            <label>Tolerancia on-time (min)</label>
            <input type="number" value={toleranciaOnTimeMin} onChange={e => setToleranciaOnTimeMin(Number(e.target.value) || 0)} />
          </div>
        </div>
      </section>

      {/* Resumen */}
      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Resumen</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Kpi label="Órdenes (rango)" value={resumen.total} />
          <Kpi label="Entregadas" value={resumen.entregadas} />
          <Kpi label="Pendientes" value={resumen.pendientes} />
          <Kpi label="Prom. total" value={fmtMin(resumen.promTotal)} />
          <Kpi label="On-time (entregadas)" value={`${resumen.onTime} (${resumen.onTimePct})`} />
        </div>
      </section>

      {/* Por operador */}
      <section style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ margin: 0 }}>Por operador (quien creó la orden)</h3>
          <button style={{ marginLeft: "auto" }} onClick={expOperadores} disabled={!porOperador.length}>⬇️ Exportar</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Operador</th>
                <th style={th}>Órdenes</th>
                <th style={th}>Entregadas</th>
                <th style={th}>Tasa éxito</th>
                <th style={th}>Prom. total</th>
                <th style={th}>On-time %</th>
              </tr>
            </thead>
            <tbody>
              {porOperador.length ? porOperador.map(r => (
                <tr key={r.operador}>
                  <td style={td}>{r.operador}</td>
                  <td style={tdCenter}>{r.total}</td>
                  <td style={tdCenter}>{r.entregadas}</td>
                  <td style={tdCenter}>{r.tasaExito}</td>
                  <td style={td}>{fmtMin(r.promTotal)}</td>
                  <td style={tdCenter}>{r.onTimePct}</td>
                </tr>
              )) : <tr><td colSpan={6} style={td}>Sin datos.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* Por mensajero */}
      <section style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ margin: 0 }}>Por mensajero</h3>
          <button style={{ marginLeft: "auto" }} onClick={expMensajeros} disabled={!porMensajero.length}>⬇️ Exportar</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Mensajero</th>
                <th style={th}>Órdenes</th>
                <th style={th}>Entregadas</th>
                <th style={th}>Tasa éxito</th>
                <th style={th}>Prom. total</th>
                <th style={th}>On-time %</th>
              </tr>
            </thead>
            <tbody>
              {porMensajero.length ? porMensajero.map(r => (
                <tr key={r.mensajero}>
                  <td style={td}>{r.mensajero}</td>
                  <td style={tdCenter}>{r.total}</td>
                  <td style={tdCenter}>{r.entregadas}</td>
                  <td style={tdCenter}>{r.tasaExito}</td>
                  <td style={td}>{fmtMin(r.promTotal)}</td>
                  <td style={tdCenter}>{r.onTimePct}</td>
                </tr>
              )) : <tr><td colSpan={6} style={td}>Sin datos.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* Por cliente */}
      <section style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ margin: 0 }}>Por cliente</h3>
          <button style={{ marginLeft: "auto" }} onClick={expClientes} disabled={!porCliente.length}>⬇️ Exportar</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Cliente</th>
                <th style={th}>Órdenes</th>
                <th style={th}>Entregadas</th>
                <th style={th}>Tasa éxito</th>
                <th style={th}>Prom. total</th>
              </tr>
            </thead>
            <tbody>
              {porCliente.length ? porCliente.map(r => (
                <tr key={r.cliente}>
                  <td style={td}>{r.cliente}</td>
                  <td style={tdCenter}>{r.total}</td>
                  <td style={tdCenter}>{r.entregadas}</td>
                  <td style={tdCenter}>{r.tasaExito}</td>
                  <td style={td}>{fmtMin(r.promTotal)}</td>
                </tr>
              )) : <tr><td colSpan={5} style={td}>Sin datos.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* Por zona */}
      <section style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ margin: 0 }}>Por zona</h3>
          <button style={{ marginLeft: "auto" }} onClick={expZonas} disabled={!porZona.length}>⬇️ Exportar</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Zona</th>
                <th style={th}>Órdenes</th>
                <th style={th}>Entregadas</th>
                <th style={th}>Tasa éxito</th>
                <th style={th}>Prom. total</th>
              </tr>
            </thead>
            <tbody>
              {porZona.length ? porZona.map(r => (
                <tr key={r.zona}>
                  <td style={td}>{r.zona}</td>
                  <td style={tdCenter}>{r.total}</td>
                  <td style={tdCenter}>{r.entregadas}</td>
                  <td style={tdCenter}>{r.tasaExito}</td>
                  <td style={td}>{fmtMin(r.promTotal)}</td>
                </tr>
              )) : <tr><td colSpan={5} style={td}>Sin datos.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* Top atrasos (más lentas) */}
      <section style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ margin: 0 }}>Top atrasos (tiempo total más alto)</h3>
          <button style={{ marginLeft: "auto" }} onClick={expTopAtrasos} disabled={!topAtrasos.length}>⬇️ Exportar</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Orden</th>
                <th style={th}>Cliente</th>
                <th style={th}>Factura</th>
                <th style={th}>Mensajero</th>
                <th style={th}>Operador</th>
                <th style={th}>Tiempo total</th>
              </tr>
            </thead>
            <tbody>
              {topAtrasos.length ? topAtrasos.map(r => (
                <tr key={r.id}>
                  <td style={td}><code>{r.id.slice(0,8)}…</code></td>
                  <td style={td}>{r.cliente}</td>
                  <td style={td}>{r.factura}</td>
                  <td style={td}>{r.mensajero}</td>
                  <td style={td}>{r.operador}</td>
                  <td style={td}>{fmtMin(r.min_total)}</td>
                </tr>
              )) : <tr><td colSpan={6} style={td}>Sin datos.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div style={{ marginTop: 16, fontSize: 12, color: "#666" }}>
        * “Operador” se toma del campo <code>usuario</code> de la orden (quien la creó). “On-time” evalúa (entrega ≤ programada + tolerancia).
      </div>
    </div>
  );
}

/** UI helpers */
function Kpi({ label, value }) {
  return (
    <div style={{ border: "1px dashed #ddd", borderRadius: 10, padding: "8px 10px", minWidth: 160 }}>
      <div style={{ fontSize: 12, color: "#666" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
const card = { marginTop: 12, padding: 12, border: "1px solid #eee", borderRadius: 10, background: "#fff" };

/** Estilos mínimos */
const css = document.createElement("style");
css.innerHTML = `
  .grid3 {
    display: grid;
    gap: 8px;
    grid-template-columns: repeat(3, minmax(220px, 1fr));
  }
  input, select { padding: 6px 8px; border: 1px solid #ddd; border-radius: 6px; width: 100%; }
  table { font-size: 14px; }
`;
document.head.appendChild(css);
