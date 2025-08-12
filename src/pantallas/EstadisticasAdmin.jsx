// src/pantallas/EstadisticasAdmin.jsx
import { useEffect, useMemo, useState } from "react";
import { db } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";

/** ───────────── Ajusta aquí si tu colección se llama distinto ───────────── */
const COLLECTION_NAME = "ordenes"; // si usas "ordenesEntrega", cámbialo aquí

/** ───────────── Helpers tiempo/format ───────────── */
function tsToMs(ts) {
  try {
    if (ts?.toDate) return ts.toDate().getTime();
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts === "number") return ts;
  } catch {}
  return null;
}
function fmtMin(n) {
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(1)} min`;
}
function diffMin(tsEnd, tsStart) {
  const a = tsToMs(tsEnd);
  const b = tsToMs(tsStart);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return (a - b) / 60000;
}
function pct(n, d) {
  if (!d) return "—";
  return `${((n / d) * 100).toFixed(1)}%`;
}
function yyyymm(d) {
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, "0");
  return `${Y}-${M}`;
}

/** ───────────── Zona heurística (ajusta si tienes campos específicos) ───────────── */
function zonaHeuristica(address, direccionTexto) {
  const fmt = address?.formatted || direccionTexto || "";
  if (!fmt) return "Desconocida";
  const parts = String(fmt).split(",").map(s => s.trim()).filter(Boolean);
  return parts[1] || parts[0] || "Desconocida";
}

/** ───────────── CSV export ───────────── */
function exportCSV(filename, rows) {
  if (!rows?.length) return;
  const cols = Object.keys(rows[0]);
  const header = cols.join(",");
  const body = rows
    .map(r =>
      cols.map(c => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");
  const csv = [header, body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/** estilos simples para tablas */
const th = { textAlign: "left", borderBottom: "1px solid #eee", padding: "8px 10px", background: "#fafafa" };
const td = { borderBottom: "1px solid #f2f2f2", padding: "8px 10px" };
const tdCenter = { ...td, textAlign: "center" };

/** ───────────── Vista principal ───────────── */
export default function EstadisticasAdmin() {
  // 🔒 Solo Admin
  let usuario = null;
  try { usuario = JSON.parse(localStorage.getItem("usuarioActivo") || "null"); } catch {}
  const rol = (usuario?.rol || "").toLowerCase();
  if (rol !== "administrador") {
    return <div style={{ padding: 20 }}>403 – Solo el administrador puede ver estadísticas.</div>;
  }

  // Filtros
  const hoy = new Date();
  const defaultDesde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const [desde, setDesde] = useState(defaultDesde.toISOString().slice(0, 10));
  const [hasta, setHasta] = useState(hoy.toISOString().slice(0, 10));
  const [soloEntregadas, setSoloEntregadas] = useState(false);

  // Datos
  const [ordenes, setOrdenes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [ultimaAct, setUltimaAct] = useState(null);

  // 🔁 Suscripción simple y robusta: trae todo y filtra en cliente.
  useEffect(() => {
    setCargando(true);
    setError("");

    const ref = collection(db, COLLECTION_NAME);
    const q = query(ref, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      { includeMetadataChanges: true }, // 🔄 actualiza también con writes locales y confirmaciones del server
      (snap) => {
        console.log("[Estadísticas] docs:", snap.size, "fromCache?", snap.metadata.fromCache);
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Rango de fechas (cliente)
        const d = new Date(desde); d.setHours(0,0,0,0);
        const h = new Date(hasta); h.setHours(23,59,59,999);
        const msD = d.getTime(), msH = h.getTime();

        const filtradas = all.filter(o => {
          // Normaliza createdAt: Timestamp | number ms | Date | ausente (serverTimestamp pendiente)
          const msC =
            o?.createdAt?.toDate ? o.createdAt.toDate().getTime()
            : (o?.createdAt instanceof Date ? o.createdAt.getTime()
            : (typeof o?.createdAt === "number" ? o.createdAt : null));

          // Si aún no hay createdAt (por serverTimestamp pendiente), lo mostramos igual
          if (!Number.isFinite(msC)) return true;
          return msC >= msD && msC <= msH;
        });

        setOrdenes(filtradas);
        setUltimaAct(new Date());
        setCargando(false);

        // Mensaje suave si detectamos docs sin createdAt
        const haySinCreated = all.some(o => !o?.createdAt);
        setError(haySinCreated ? "Hay órdenes sin createdAt; añade serverTimestamp() al crear para mejores filtros." : "");
      },
      (e) => {
        console.error("onSnapshot(ordenes):", e);
        setError("No pude suscribirme a las órdenes. Revisa consola/índices de Firestore.");
        setCargando(false);
      }
    );

    return () => unsub();
  }, [desde, hasta]);

  // Filtro extra (solo entregadas)
  const ordenesFiltradas = useMemo(() => {
    let out = ordenes;
    if (soloEntregadas) out = out.filter(o => o.entregado);
    return out;
  }, [ordenes, soloEntregadas]);

  /** ─────── Cálculos / métricas ─────── */
  const stats = useMemo(() => {
    const base = {
      total: 0,
      entregadas: 0,
      pendientes: 0,
      avgCreacionARecibida: null,
      avgRecibidaAEntregada: null,
      avgTotal: null,
      porMensajero: [],     // array
      porZona: {},          // objeto
      porHora: {},          // objeto
      porDiaSemana: {},     // objeto
      porMes: {},           // objeto YYYY-MM -> count
      exportRows: [],
    };
    if (!ordenesFiltradas.length) return base;

    let sumCR = 0, nCR = 0;
    let sumRE = 0, nRE = 0;
    let sumTOT = 0, nTOT = 0;

    const porMensajeroMap = {};
    const porZona = {};
    const porHora = {};
    const porDiaSemana = {}; // 0..6 (Dom..Sáb)
    const porMes = {};
    const rows = [];

    for (const o of ordenesFiltradas) {
      base.total += 1;
      if (o.entregado) base.entregadas += 1;
      else base.pendientes += 1;

      // createdAt derivaciones
      const msC = tsToMs(o.createdAt);
      if (Number.isFinite(msC)) {
        const d = new Date(msC);
        const hr = d.getHours();
        const kHr = String(hr).padStart(2, "0");
        porHora[kHr] = (porHora[kHr] || 0) + 1;

        const dow = d.getDay(); // 0..6
        porDiaSemana[dow] = (porDiaSemana[dow] || 0) + 1;

        const ym = yyyymm(d);
        porMes[ym] = (porMes[ym] || 0) + 1;
      }

      // zonas
      const zona = zonaHeuristica(o.address, o.direccionTexto);
      porZona[zona] = porZona[zona] || { total: 0, entregadas: 0, sumTOT: 0, nTOT: 0 };
      porZona[zona].total += 1;
      if (o.entregado) porZona[zona].entregadas += 1;

      // tiempos
      const tCR = diffMin(o.fechaRecibida, o.createdAt);     // creación → recibida (aceptación)
      const tRE = diffMin(o.fechaEntregada, o.fechaRecibida);// recibida → entregada (traslado)
      const tTOT = diffMin(o.fechaEntregada, o.createdAt);   // creación → entregada

      if (Number.isFinite(tCR)) { sumCR += tCR; nCR += 1; }
      if (Number.isFinite(tRE)) { sumRE += tRE; nRE += 1; }
      if (Number.isFinite(tTOT)) { sumTOT += tTOT; nTOT += 1; }

      if (Number.isFinite(tTOT)) { porZona[zona].sumTOT += tTOT; porZona[zona].nTOT += 1; }

      // por mensajero
      const key = o.asignadoUid || o.asignadoNombre || "—";
      const nombre = o.asignadoNombre || key;
      porMensajeroMap[key] = porMensajeroMap[key] || {
        nombre, total: 0, entregadas: 0, sumRE: 0, nRE: 0, sumTOT: 0, nTOT: 0,
      };
      porMensajeroMap[key].total += 1;
      if (o.entregado) porMensajeroMap[key].entregadas += 1;
      if (Number.isFinite(tRE)) { porMensajeroMap[key].sumRE += tRE; porMensajeroMap[key].nRE += 1; }
      if (Number.isFinite(tTOT)) { porMensajeroMap[key].sumTOT += tTOT; porMensajeroMap[key].nTOT += 1; }

      // fila export
      rows.push({
        id: o.id,
        cliente: o.cliente || "",
        mensajero: nombre,
        creado: msC ? new Date(msC).toLocaleString() : "",
        recibida: o.fechaRecibida ? new Date(tsToMs(o.fechaRecibida)).toLocaleString() : "",
        entregada: o.fechaEntregada ? new Date(tsToMs(o.fechaEntregada)).toLocaleString() : "",
        zona,
        estado: o.entregado ? "ENTREGADA" : o.recibida ? "RECIBIDA" : "PENDIENTE",
        min_creacion_a_recibida: Number.isFinite(tCR) ? tCR.toFixed(1) : "",
        min_recibida_a_entregada: Number.isFinite(tRE) ? tRE.toFixed(1) : "",
        min_total: Number.isFinite(tTOT) ? tTOT.toFixed(1) : "",
      });
    }

    const avg = (sum, n) => (n > 0 ? sum / n : null);

    base.avgCreacionARecibida = avg(sumCR, nCR);
    base.avgRecibidaAEntregada = avg(sumRE, nRE);
    base.avgTotal = avg(sumTOT, nTOT);
    base.porZona = porZona;
    base.porHora = porHora;
    base.porDiaSemana = porDiaSemana;
    base.porMes = porMes;

    base.porMensajero = Object.entries(porMensajeroMap)
      .map(([uid, v]) => ({
        uid,
        nombre: v.nombre,
        total: v.total,
        entregadas: v.entregadas,
        tasaExito: v.total ? v.entregadas / v.total : 0,
        avgEntregaMin: avg(v.sumRE, v.nRE),
        avgTotalMin: avg(v.sumTOT, v.nTOT),
      }))
      .sort((a, b) => b.entregadas - a.entregadas || b.total - a.total);

    base.exportRows = rows;
    return base;
  }, [ordenesFiltradas]);

  const kpis = [
    { label: "Órdenes (rango)", value: stats.total },
    { label: "Entregadas", value: stats.entregadas },
    { label: "Pendientes", value: stats.pendientes },
    { label: "Prom. creación→recibida", value: fmtMin(stats.avgCreacionARecibida) },
    { label: "Prom. recibida→entregada", value: fmtMin(stats.avgRecibidaAEntregada) },
    { label: "Prom. total", value: fmtMin(stats.avgTotal) },
  ];

  // Orden de días (Dom..Sáb) y label corto
  const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ margin: 0 }}>📊 Estadísticas (Administrador)</h2>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap", marginTop: 10 }}>
        <div>
          <label>Desde</label><br />
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)} />
        </div>
        <div>
          <label>Hasta</label><br />
          <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
        </div>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={soloEntregadas} onChange={e => setSoloEntregadas(e.target.checked)} />
          Solo entregadas
        </label>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={() => exportCSV(
              `ordenes_${desde}_a_${hasta}${soloEntregadas ? "_entregadas" : ""}.csv`,
              stats.exportRows
            )}
            disabled={!stats.exportRows.length}
          >
            ⬇️ Exportar CSV
          </button>
        </div>
      </div>

      {/* Estado de carga */}
      {cargando && <div style={{ marginTop: 8 }}>Cargando…</div>}
      {error && <div style={{ marginTop: 8, color: "#b00" }}>{error}</div>}
      {ultimaAct && (
        <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>
          Última actualización: {ultimaAct.toLocaleTimeString()}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginTop: 12 }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ border: "1px solid #eee", borderRadius: 10, padding: 12, background: "#fff" }}>
            <div style={{ fontSize: 12, color: "#666" }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Ranking por mensajero (con tasa de éxito) */}
      <h3 style={{ marginTop: 18 }}>🏆 Mensajeros</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Mensajero</th>
              <th style={th}>Entregadas</th>
              <th style={th}>Órdenes (total)</th>
              <th style={th}>Tasa de éxito</th>
              <th style={th}>Prom. entrega (recibida→entregada)</th>
              <th style={th}>Prom. total</th>
            </tr>
          </thead>
          <tbody>
            {(Array.isArray(stats.porMensajero) ? stats.porMensajero : []).map((r) => (
              <tr key={r.uid}>
                <td style={td}>{r.nombre}</td>
                <td style={tdCenter}>{r.entregadas}</td>
                <td style={tdCenter}>{r.total}</td>
                <td style={tdCenter}>{pct(r.entregadas, r.total)}</td>
                <td style={td}>{fmtMin(r.avgEntregaMin)}</td>
                <td style={td}>{fmtMin(r.avgTotalMin)}</td>
              </tr>
            ))}
            {(!Array.isArray(stats.porMensajero) || stats.porMensajero.length === 0) && (
              <tr><td colSpan={6} style={td}>Sin datos en el rango.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Zonas con tiempo promedio total */}
      <h3 style={{ marginTop: 18 }}>🗺️ Zonas (tiempo promedio creación→entrega)</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Zona</th>
              <th style={th}>Órdenes</th>
              <th style={th}>Entregadas</th>
              <th style={th}>Prom. total</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(stats.porZona)
              .sort((a, b) => b[1].total - a[1].total)
              .map(([zona, v]) => {
                const avgTot = v.nTOT ? v.sumTOT / v.nTOT : null;
                return (
                  <tr key={zona}>
                    <td style={td}>{zona}</td>
                    <td style={tdCenter}>{v.total}</td>
                    <td style={tdCenter}>{v.entregadas}</td>
                    <td style={td}>{fmtMin(avgTot)}</td>
                  </tr>
                );
              })}
            {!Object.keys(stats.porZona).length && (
              <tr><td colSpan={4} style={td}>Sin datos en el rango.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Distribución por día de la semana */}
      <h3 style={{ marginTop: 18 }}>📅 Distribución por día de la semana</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map(d => <th key={d} style={th}>{d}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((_, idx) => (
                <td key={idx} style={tdCenter}>{stats.porDiaSemana[idx] || 0}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Historial mensual */}
      <h3 style={{ marginTop: 18 }}>📈 Historial mensual (órdenes creadas)</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Mes</th>
              <th style={th}>Órdenes</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(stats.porMes)
              .sort((a, b) => a[0].localeCompare(b[0])) // asc YYYY-MM
              .map(([mes, cnt]) => (
                <tr key={mes}>
                  <td style={td}>{mes}</td>
                  <td style={tdCenter}>{cnt}</td>
                </tr>
              ))}
            {!Object.keys(stats.porMes).length && (
              <tr><td colSpan={2} style={td}>Sin datos en el rango.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 24, fontSize: 12, color: "#666" }}>
        * Si ves “fallback”, crea el índice sugerido por Firestore para acelerar <code>createdAt</code>.
      </div>
    </div>
  );
}
