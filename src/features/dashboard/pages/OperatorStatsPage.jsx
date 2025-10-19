// src/pantallas/EstadisticasOperadores.jsx
import { useEffect, useMemo, useState } from "react";
import { db } from "../../../shared/services/firebase.js";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { ensureUsuarioActivo } from "../../../shared/utils/ensureUsuario";

/** ───────── Helpers ───────── */
function tsToMs(ts) {
  try {
    if (!ts) return NaN;
    if (typeof ts?.toDate === "function") return ts.toDate().getTime(); // Firestore Timestamp
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
function msToYMD(ms) {
  const d = new Date(ms);
  return Number.isFinite(ms) ? d.toISOString().slice(0, 10) : "";
}
function minutesBetween(a, b) {
  const ams = tsToMs(a);
  const bms = tsToMs(b);
  if (!Number.isFinite(ams) || !Number.isFinite(bms)) return null;
  return (bms - ams) / 60000;
}
function yyyymm(d) {
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, "0");
  return `${Y}-${M}`;
}
function toFixedMaybe(n, d = 1) {
  return n == null ? "—" : Number(n).toFixed(d);
}
function exportCSV(filename, rows) {
  if (!rows?.length) return;
  const cols = Object.keys(rows[0]);
  const csv = [
    cols.join(","),
    ...rows.map((r) =>
      cols.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const box = { padding: 12, border: "1px solid #eee", borderRadius: 8, background: "#fff" };
const th = { textAlign: "left", borderBottom: "1px solid #eee", padding: "8px 10px", background: "#fafafa" };
const td = { borderBottom: "1px solid #f2f2f2", padding: "8px 10px" };
const tdCenter = { ...td, textAlign: "center" };

/** ───────── Componente ───────── */
export default function EstadisticasOperadores() {
  // Sesión
  let usuario = null; try { usuario = JSON.parse(localStorage.getItem("usuarioActivo") || "null"); } catch {}
  const rol = (usuario?.rol || "").toLowerCase();
  const empresaIdStr = (usuario?.empresaId != null && usuario?.empresaId !== "") ? String(usuario.empresaId) : null;

  // Filtros de rango (CREACIÓN)
  const hoy = new Date();
  const defaultDesde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const [desde, setDesde] = useState(defaultDesde.toISOString().slice(0, 10));
  const [hasta, setHasta] = useState(hoy.toISOString().slice(0, 10));

  // Filtros de creador
  const [tipoCreador, setTipoCreador] = useState("ambos"); // operador | administrador | ambos
  const [operadorSel, setOperadorSel] = useState("");       // por nombre (campo "usuario")

  // Objetivo SLA (creación → entrega)
  const [objetivoMinTotal, setObjetivoMinTotal] = useState(45);

  // Data
  const [ordenes, setOrdenes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  // Suscripción a órdenes de la empresa
  useEffect(() => {
    let unsub = null, unsubFallback = null;
    (async () => {
      setCargando(true);
      setError("");
      const ok = await ensureUsuarioActivo();
      if (!ok || !empresaIdStr) {
        setError("Sesión inválida o falta empresaId.");
        setCargando(false);
        return;
      }
      try {
        const ref = collection(db, "ordenes");
        const q1 = query(ref, where("empresaId", "==", empresaIdStr), orderBy("createdAt", "desc"));
        unsub = onSnapshot(
          q1,
          (snap) => {
            const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setOrdenes(rows);
            setCargando(false);
          },
          (err) => {
            console.error("onSnapshot(operadores):", err?.code, err?.message);
            if (err?.code === "failed-precondition") {
              const q2 = query(ref, where("empresaId", "==", empresaIdStr));
              unsubFallback = onSnapshot(
                q2,
                (snap2) => {
                  const r2 = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
                  r2.sort((a,b)=>(b?.createdAt?.toMillis?.()??0)-(a?.createdAt?.toMillis?.()??0));
                  setOrdenes(r2);
                  setCargando(false);
                },
                (e2) => {
                  setError(e2?.message || "No se pudieron leer órdenes (fallback). Crea el índice empresaId+createdAt.");
                  setCargando(false);
                }
              );
            } else if (err?.code === "permission-denied") {
              setError("Permiso denegado al leer órdenes. Revisa reglas / empresaId en usuarios/{uid}.");
              setCargando(false);
            } else {
              setError(err?.message || "No se pudieron leer órdenes.");
              setCargando(false);
            }
          }
        );
      } catch (e) {
        console.error("query(ordenes) operadores error:", e);
        setError(e?.message || "No se pudo iniciar la suscripción.");
        setCargando(false);
      }
    })();
    return () => {
      if (unsub) unsub();
      if (unsubFallback) unsubFallback();
    };
  }, [empresaIdStr]);

  // Operadores detectados (por campo "usuario") según tipo de creador seleccionado
  const operadoresLista = useMemo(() => {
    const set = new Set();
    for (const o of ordenes) {
      const r = (o.rolUsuario || "").toLowerCase();
      const u = (o.usuario || "").trim();
      if (!u) continue;
      if (tipoCreador === "operador" && r !== "operador") continue;
      if (tipoCreador === "administrador" && r !== "administrador") continue;
      set.add(u);
    }
    const arr = Array.from(set).sort((a, b) => a.localeCompare(b));
    if (rol === "operador" && usuario?.nombre && arr.includes(usuario.nombre)) {
      return [usuario.nombre];
    }
    return arr;
  }, [ordenes, tipoCreador, rol, usuario?.nombre]);

  // Rango (por CREACIÓN)
  const rangoMs = useMemo(() => {
    const d = new Date(desde); d.setHours(0,0,0,0);
    const h = new Date(hasta); h.setHours(23,59,59,999);
    return { dMs: d.getTime(), hMs: h.getTime() };
  }, [desde, hasta]);

  // Aplica filtros (tipo de creador, operador, rango de creación)
  const ordenesFiltradas = useMemo(() => {
    const out = [];
    const operadorForzado = rol === "operador" ? (usuario?.nombre || "") : "";
    const nombreFiltro = operadorForzado || operadorSel;

    for (const o of ordenes) {
      const r = (o.rolUsuario || "").toLowerCase();
      if (tipoCreador === "operador" && r !== "operador") continue;
      if (tipoCreador === "administrador" && r !== "administrador") continue;
      const creador = (o.usuario || "").trim();
      if (nombreFiltro && creador !== nombreFiltro) continue;

      let ms = tsToMs(o.createdAt);
      if (!Number.isFinite(ms)) {
        const fm = parseFlexibleDateString(o?.fecha);
        if (Number.isFinite(fm)) ms = fm;
      }
      if (!Number.isFinite(ms)) continue;
      if (ms < rangoMs.dMs || ms > rangoMs.hMs) continue;

      out.push(o);
    }
    out.sort((a, b) => (tsToMs(b.createdAt) - tsToMs(a.createdAt)));
    return out;
  }, [ordenes, tipoCreador, operadorSel, rangoMs.dMs, rangoMs.hMs, rol, usuario?.nombre]);

  // KPIs por operador y globales (sobre órdenes creadas en el rango)
  const { kpiGlobal, porOperador, franjaGlobal, franjaOperador, porMes, porDia } = useMemo(() => {
    const horasVacias = () => {
      const m = {};
      for (let i = 0; i < 24; i++) m[String(i).padStart(2, "0")] = 0;
      return m;
    };

    const franjaGlobal = horasVacias();
    const porDia = {};
    const porMes = {};
    const opMap = new Map();
    const getOp = (nombre) => {
      const key = nombre || "—";
      if (!opMap.has(key)) {
        opMap.set(key, {
          nombre: key,
          creadas: 0,
          entregadas: 0,
          pendientes: 0,
          asignadosPorMensajero: {},
          franja: horasVacias(),
          tiemposTotales: [],
          podSobreEntregadas: 0,
        });
      }
      return opMap.get(key);
    };

    for (const o of ordenesFiltradas) {
      const creador = (o.usuario || "—").trim();
      const bucket = getOp(creador);

      bucket.creadas += 1;
      if (o.entregado) bucket.entregadas += 1; else bucket.pendientes += 1;

      const cMs = tsToMs(o.createdAt);
      if (Number.isFinite(cMs)) {
        const d = new Date(cMs);
        const hh = String(d.getHours()).padStart(2, "0");
        bucket.franja[hh] = (bucket.franja[hh] || 0) + 1;
        franjaGlobal[hh] = (franjaGlobal[hh] || 0) + 1;

        const ymd = d.toISOString().slice(0, 10);
        const ym = yyyymm(d);
        porDia[ymd] = (porDia[ymd] || 0) + 1;
        porMes[ym] = (porMes[ym] || 0) + 1;
      } else {
        const fm = parseFlexibleDateString(o?.fecha);
        if (Number.isFinite(fm)) {
          const d = new Date(fm);
          const ymd = d.toISOString().slice(0, 10);
          const ym = yyyymm(d);
          porDia[ymd] = (porDia[ymd] || 0) + 1;
          porMes[ym] = (porMes[ym] || 0) + 1;
        }
      }

      const mens = (o.asignadoNombre || "").trim();
      if (mens) {
        bucket.asignadosPorMensajero[mens] = (bucket.asignadosPorMensajero[mens] || 0) + 1;
      }

      const minTot = minutesBetween(o.createdAt, o.fechaEntregada);
      if (Number.isFinite(minTot)) {
        bucket.tiemposTotales.push(minTot);
      }

      const tienePOD = !!(o?.proofUrl || (Array.isArray(o?.fotosPodUrls) && o.fotosPodUrls.length > 0));
      if (o.entregado && tienePOD) bucket.podSobreEntregadas += 1;
    }

    const totalCreadas = ordenesFiltradas.length;
    const totalEntregadas = ordenesFiltradas.filter(o => o.entregado).length;
    const totalPend = totalCreadas - totalEntregadas;
    const todosTotales = ordenesFiltradas
      .map(o => minutesBetween(o.createdAt, o.fechaEntregada))
      .filter(n => Number.isFinite(n));
    const promTotal = todosTotales.length ? (todosTotales.reduce((a,b)=>a+b,0) / todosTotales.length) : null;
    const dentroSLA = todosTotales.filter(m => m <= Number(objetivoMinTotal)).length;
    const kpiGlobal = {
      totalCreadas,
      totalEntregadas,
      totalPendientes: totalPend,
      promTotalMin: promTotal,
      slaPct: totalEntregadas ? `${((dentroSLA / todosTotales.length) * 100).toFixed(1)}%` : "—",
    };

    const porOperador = Array.from(opMap.values()).map(v => {
      const avg = v.tiemposTotales.length ? (v.tiemposTotales.reduce((a,b)=>a+b,0) / v.tiemposTotales.length) : null;
      const slaIn = v.tiemposTotales.filter(m => m <= Number(objetivoMinTotal)).length;
      const podPct = v.entregadas ? (v.podSobreEntregadas / v.entregadas) * 100 : 0;
      return {
        nombre: v.nombre,
        creadas: v.creadas,
        entregadas: v.entregadas,
        pendientes: v.pendientes,
        promTotalMin: avg,
        slaPctNum: (v.tiemposTotales.length ? (slaIn / v.tiemposTotales.length) * 100 : 0),
        podPctNum: podPct,
        asignadosPorMensajero: v.asignadosPorMensajero,
        franja: v.franja,
      };
    }).sort((a, b) => (b.creadas - a.creadas) || a.nombre.localeCompare(b.nombre));

    let franjaOperador = null;
    const sel = (rol === "operador") ? (usuario?.nombre || "") : operadorSel;
    if (sel) {
      const found = porOperador.find(x => x.nombre === sel);
      if (found) franjaOperador = found.franja;
    }

    return { kpiGlobal, porOperador, franjaGlobal, franjaOperador, porMes, porDia };
  }, [ordenesFiltradas, operadorSel, rol, usuario?.nombre, objetivoMinTotal]);

  // Horas 00..23 para render
  const horas = useMemo(() => Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")), []);

  // ► NUEVO: operador activo y DETALLE de órdenes de ese operador
  const operadorActivo = useMemo(
    () => (rol === "operador" ? (usuario?.nombre || "") : operadorSel),
    [rol, usuario?.nombre, operadorSel]
  );

  const detalleOperador = useMemo(() => {
    if (!operadorActivo) return [];
    const rows = [];
    for (const o of ordenesFiltradas) {
      const creador = (o.usuario || "").trim();
      if (creador !== operadorActivo) continue;
      const created = tsToMs(o.createdAt);
      const recibida = tsToMs(o.fechaRecibida);
      const entregada = tsToMs(o.fechaEntregada);
      const minTotal = (Number.isFinite(created) && Number.isFinite(entregada))
        ? (entregada - created) / 60000
        : null;
      rows.push({
        id: o.id,
        cliente: o.cliente || "",
        factura: o.numeroFactura || "",
        creadoMs: created,
        recibidaMs: recibida,
        entregadaMs: entregada,
        minTotal,
        mensajero: o.asignadoNombre || "—",
        estado: o.entregado ? "ENTREGADA" : (o.recibida ? "RECIBIDA" : "PENDIENTE"),
      });
    }
    rows.sort((a, b) => (b.creadoMs || 0) - (a.creadoMs || 0));
    return rows;
  }, [ordenesFiltradas, operadorActivo]);

  const resumenOperador = useMemo(() => {
    const creadas = detalleOperador.length;
    const entregadas = detalleOperador.filter(r => r.estado === "ENTREGADA").length;
    const arr = detalleOperador.map(r => r.minTotal).filter(Number.isFinite);
    const promedioMin = arr.length ? (arr.reduce((a,b)=>a+b,0) / arr.length) : null;
    return { creadas, entregadas, promedioMin };
  }, [detalleOperador]);

  // Presets
  function setHoy() {
    const d = new Date(); const ymd = d.toISOString().slice(0,10);
    setDesde(ymd); setHasta(ymd);
  }
  function setSemana() {
    const d = new Date(); const day = d.getDay();
    const diffToMon = (day + 6) % 7;
    const lunes = new Date(d); lunes.setDate(d.getDate() - diffToMon);
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
    setDesde(lunes.toISOString().slice(0,10)); setHasta(domingo.toISOString().slice(0,10));
  }
  function setMes() {
    const d = new Date();
    const desdeD = new Date(d.getFullYear(), d.getMonth(), 1);
    const hastaD = new Date(d.getFullYear(), d.getMonth()+1, 0);
    setDesde(desdeD.toISOString().slice(0,10)); setHasta(hastaD.toISOString().slice(0,10));
  }

  const fmtDT = (ms) => Number.isFinite(ms) ? new Date(ms).toLocaleString() : "—";

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ margin: 0 }}>👩‍💼 Productividad de Operadores</h2>

      {/* Filtros */}
      <div style={{ ...box, marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Filtros</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <div>
            <label>Desde</label><br />
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} />
          </div>
          <div>
            <label>Hasta</label><br />
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
          </div>

          <div>
            <label>Tipo de creador</label><br />
            <select
              value={tipoCreador}
              onChange={e => {
                setTipoCreador(e.target.value);
                setOperadorSel("");
              }}
              disabled={rol === "operador"}
            >
              <option value="ambos">Operadores y Administradores</option>
              <option value="operador">Solo Operadores</option>
              <option value="administrador">Solo Administradores</option>
            </select>
          </div>

          <div>
            <label>Operador</label><br />
            <select
              value={rol === "operador" ? (usuario?.nombre || "") : operadorSel}
              onChange={e => setOperadorSel(e.target.value)}
              disabled={rol === "operador"}
              style={{ minWidth: 220 }}
            >
              <option value="">(Todos)</option>
              {operadoresLista.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <label>Objetivo SLA (min)</label>
            <input
              type="number"
              min={1}
              style={{ width: 80 }}
              value={objetivoMinTotal}
              onChange={e => setObjetivoMinTotal(Number(e.target.value) || 0)}
            />
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button onClick={setHoy}>📆 Hoy</button>
            <button onClick={setSemana}>🗓️ Esta semana</button>
            <button onClick={setMes}>🗓️ Este mes</button>
            <button onClick={() => setOperadorSel("")} title="Quitar filtro operador">🧹 Limpiar operador</button>
          </div>

          {cargando && <div style={{ width: "100%" }}>Cargando…</div>}
          {!!error && <div style={{ width: "100%", color: "#b00" }}>{error}</div>}
        </div>
      </div>

      {/* KPIs globales */}
      <div style={{ ...box, marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Resumen global (órdenes creadas en el rango)</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(160px,1fr))", gap: 10 }}>
          <Kpi label="Creadas" value={kpiGlobal.totalCreadas} />
          <Kpi label="Entregadas" value={kpiGlobal.totalEntregadas} />
          <Kpi label="Pendientes" value={kpiGlobal.totalPendientes} />
          <Kpi label="Prom. creación→entrega" value={`${toFixedMaybe(kpiGlobal.promTotalMin,1)} min`} />
          <Kpi label={`SLA ≤ ${objetivoMinTotal} min`} value={kpiGlobal.slaPct} />
        </div>
      </div>

      {/* Franja horaria (global) por CREACIÓN */}
      <div style={{ ...box, marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Franja horaria de creación (global)</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {horas.map(h => <th key={h} style={th}>{h}:00</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                {horas.map(h => (
                  <td key={h} style={tdCenter}>{franjaGlobal?.[h] || 0}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
          * Usa esta tabla para detectar la **hora pico** de registro de órdenes.
        </div>
      </div>

      {/* Franja horaria (operador seleccionado) */}
      <div style={{ ...box, marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>
          Franja horaria de creación { (rol === "operador" ? "(mi actividad)" : operadorActivo ? `— ${operadorActivo}` : "(selecciona un operador)") }
        </h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", opacity: (franjaOperador ? 1 : 0.5) }}>
            <thead>
              <tr>
                {horas.map(h => <th key={h} style={th}>{h}:00</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                {horas.map(h => (
                  <td key={h} style={tdCenter}>{franjaOperador ? (franjaOperador[h] || 0) : 0}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Ranking por operador */}
      <div style={{ ...box, marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Operadores (rango seleccionado)</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Operador</th>
                <th style={th}>Creadas</th>
                <th style={th}>Entregadas</th>
                <th style={th}>Pendientes</th>
                <th style={th}>Prom. creación→entrega</th>
                <th style={th}>% SLA</th>
                <th style={th}>% POD (sobre entregadas)</th>
                <th style={th}>Mensajeros más usados</th>
              </tr>
            </thead>
            <tbody>
              {porOperador.length ? porOperador.map(op => {
                const topMens = Object.entries(op.asignadosPorMensajero || {})
                  .sort((a,b)=>b[1]-a[1]).slice(0,3).map(([n,c])=>`${n} (${c})`).join(", ");
                return (
                  <tr key={op.nombre}>
                    <td style={td}>
                      <button onClick={() => setOperadorSel(op.nombre)} title="Filtrar por este operador">{op.nombre}</button>
                    </td>
                    <td style={tdCenter}>{op.creadas}</td>
                    <td style={tdCenter}>{op.entregadas}</td>
                    <td style={tdCenter}>{op.pendientes}</td>
                    <td style={tdCenter}>{op.promTotalMin != null ? `${toFixedMaybe(op.promTotalMin,1)} min` : "—"}</td>
                    <td style={tdCenter}>{`${toFixedMaybe(op.slaPctNum,1)}%`}</td>
                    <td style={tdCenter}>{`${toFixedMaybe(op.podPctNum,1)}%`}</td>
                    <td style={td}>{topMens || "—"}</td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={8} style={td}>Sin datos en el rango.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historial por día / mes (creación) */}
      <div style={{ ...box, marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Histórico (órdenes creadas)</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          <div>
            <h4 style={{ margin: "0 0 6px 0" }}>Por día</h4>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={th}>Fecha</th><th style={th}>Creadas</th></tr></thead>
                <tbody>
                  {Object.entries(porDia).sort((a,b)=>a[0].localeCompare(b[0])).map(([d, cnt]) => (
                    <tr key={d}><td style={td}>{d}</td><td style={tdCenter}>{cnt}</td></tr>
                  ))}
                  {!Object.keys(porDia).length && <tr><td colSpan={2} style={td}>Sin datos.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h4 style={{ margin: "0 0 6px 0" }}>Por mes</h4>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={th}>Mes</th><th style={th}>Creadas</th></tr></thead>
                <tbody>
                  {Object.entries(porMes).sort((a,b)=>a[0].localeCompare(b[0])).map(([m, cnt]) => (
                    <tr key={m}><td style={td}>{m}</td><td style={tdCenter}>{cnt}</td></tr>
                  ))}
                  {!Object.keys(porMes).length && <tr><td colSpan={2} style={td}>Sin datos.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
          * Todos los conteos usan la **fecha de creación** de la orden.
        </div>
      </div>

      {/* ► NUEVO: Detalle de órdenes del operador (creación, entrega, minutos) */}
      <div style={{ ...box, marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>
          Detalle de órdenes del operador {operadorActivo ? `— ${operadorActivo}` : "(selecciona un operador)"}
        </h3>

        {!operadorActivo ? (
          <div style={{ color: "#666" }}>Selecciona un operador en los filtros (o entra con rol Operador) para ver el detalle.</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
              <div><b>Creadas:</b> {resumenOperador.creadas}</div>
              <div><b>Entregadas:</b> {resumenOperador.entregadas}</div>
              <div><b>Prom. creación→entrega:</b> {toFixedMaybe(resumenOperador.promedioMin,1)} min</div>
              <div style={{ marginLeft: "auto" }}>
                <button
                  onClick={() => {
                    exportCSV(
                      `detalle_${operadorActivo}_${desde}_a_${hasta}.csv`,
                      detalleOperador.map(r => ({
                        orderId: r.id,
                        cliente: r.cliente,
                        factura: r.factura,
                        creado: fmtDT(r.creadoMs),
                        recibida: fmtDT(r.recibidaMs),
                        entregada: fmtDT(r.entregadaMs),
                        minutos_total: r.minTotal != null ? r.minTotal.toFixed(1) : "",
                        mensajero: r.mensajero,
                        estado: r.estado,
                      }))
                    );
                  }}
                  disabled={!detalleOperador.length}
                >
                  ⬇️ Exportar detalle
                </button>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Creada</th>
                    <th style={th}>Entregada</th>
                    <th style={th}>Min (creación→entrega)</th>
                    <th style={th}>Mensajero</th>
                    <th style={th}>Cliente</th>
                    <th style={th}>Factura</th>
                    <th style={th}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {detalleOperador.length ? detalleOperador.map(r => (
                    <tr key={r.id}>
                      <td style={td}>{fmtDT(r.creadoMs)}</td>
                      <td style={td}>{fmtDT(r.entregadaMs)}</td>
                      <td style={tdCenter}>{r.minTotal != null ? r.minTotal.toFixed(1) : "—"}</td>
                      <td style={td}>{r.mensajero}</td>
                      <td style={td}>{r.cliente}</td>
                      <td style={tdCenter}>{r.factura || "—"}</td>
                      <td style={tdCenter}>{r.estado}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={7} style={td}>Sin órdenes creadas por este operador en el rango.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value }) {
  return (
    <div style={{ padding: 10, border: "1px dashed #ddd", borderRadius: 10, background: "#fcfcfc" }}>
      <div style={{ fontSize: 12, color: "#666" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
