// src/features/routes/pages/RouteTrackingPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { db } from "../../../shared/services/firebase.js";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  doc,
  updateDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ensureUsuarioActivo } from "../../../shared/utils/ensureUsuario";

/** Helpers */
function todayISO(d = new Date()) {
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  return dd.toISOString().slice(0, 10);
}
function tsToMs(ts) {
  try {
    if (!ts) return NaN;
    if (typeof ts?.toDate === "function") return ts.toDate().getTime();
    if (typeof ts?.seconds === "number") {
      return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
    }
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts === "number") return ts;
    if (typeof ts === "string") {
      const m = new Date(ts).getTime();
      if (Number.isFinite(m)) return m;
    }
  } catch {}
  return NaN;
}
function msProgramada(o) {
  const f = (o?.fecha || "").trim();
  const h = (o?.hora || "").trim();
  if (!f) return NaN;
  const hhmm = /^\d{2}:\d{2}$/.test(h) ? h : "00:00";
  const ms = new Date(`${f}T${hhmm}:00`).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}
function diffMin(a, b) {
  const A = tsToMs(a),
    B = tsToMs(b);
  return Number.isFinite(A) && Number.isFinite(B) ? (A - B) / 60000 : null;
}
function fmtMin(n) {
  return Number.isFinite(n) ? `${n.toFixed(1)} min` : "—";
}
function pct(n, d) {
  return d ? `${((n / d) * 100).toFixed(0)}%` : "—";
}
function wazeUrl(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng)
    ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
    : null;
}
function gmapsUrl(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng)
    ? `https://www.google.com/maps?q=${lat},${lng}`
    : null;
}

/** Pequeño beep (sin assets externos) */
function playBeep(times = 2, vol = 0.1, freq = 880, durMs = 250, gapMs = 120) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ctx = new AC();
  let when = ctx.currentTime + 0.01;
  for (let i = 0; i < times; i++) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g);
    g.connect(ctx.destination);
    o.start(when);
    o.stop(when + durMs / 1000);
    when += (durMs + gapMs) / 1000;
  }
  setTimeout(() => ctx.close().catch(() => {}), times * (durMs + gapMs) + 300);
}

export default function SeguimientoRutas() {
  // Sesión
  let usuario = null;
  try {
    usuario = JSON.parse(localStorage.getItem("usuarioActivo") || "null");
  } catch {}
  const empresaId = usuario?.empresaId ? String(usuario.empresaId) : null;
  const rol = String(usuario?.rol || "").toLowerCase();
  if (!empresaId)
    return (
      <div style={{ padding: 16, color: "#b00" }}>
        Falta empresaId en sesión.
      </div>
    );

  // Filtros
  const [fecha, setFecha] = useState(todayISO());
  const [conductor, setConductor] = useState("");
  const [toleranciaOnTimeMin, setToleranciaOnTimeMin] = useState(15);

  // 🔔 Alertas SLA
  const [alertaVentanaMin, setAlertaVentanaMin] = useState(30); // minutos para "por vencer"
  const [soloCriticas, setSoloCriticas] = useState(false);
  const [soloPorVencer, setSoloPorVencer] = useState(false);
  const [mute, setMute] = useState(false);
  const [mostrarPanelAlertas, setMostrarPanelAlertas] = useState(true);

  // Reloj local para refrescar SLA en vivo
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 15000); // 15s
    return () => clearInterval(t);
  }, []);

  const [programas, setProgramas] = useState([]); // [{...prog, __ordenes:[...] }]
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Suscripción a programaciones publicadas del día
  useEffect(() => {
    if (!empresaId) return;
    let unsubs = [];
    let mounted = true;
    (async () => {
      setLoading(true);
      setErr("");
      const ok = await ensureUsuarioActivo();
      if (!ok) {
        setErr("Sesión inválida.");
        setLoading(false);
        return;
      }
      try {
        const ref = collection(db, "programasEntrega");
        const q1 = query(
          ref,
          where("empresaId", "==", empresaId),
          where("status", "==", "published"),
          where("fecha", "==", fecha),
          orderBy("createdAt", "desc")
        );
        const unsub = onSnapshot(
          q1,
          (snap) => {
            if (!mounted) return;
            const progs = snap.docs.map((d) => ({
              id: d.id,
              ...d.data(),
              __ordenes: [],
              __unsub: null,
            }));
            // Cancelar listeners anteriores
            unsubs.forEach((u) => u && u());
            unsubs = [];
            // Para cada programa: escuchar sus órdenes
            progs.forEach((p) => {
              const refO = collection(db, "ordenes");
              const qO = query(
                refO,
                where("empresaId", "==", empresaId),
                where("programacionId", "==", p.id)
              );
              const uO = onSnapshot(qO, (osnap) => {
                const arr = osnap.docs.map((d) => ({ id: d.id, ...d.data() }));
                // set Programas con órdenes actualizadas
                setProgramas((prev) => {
                  const copy = [...(prev.length ? prev : progs)];
                  const i = copy.findIndex((x) => x.id === p.id);
                  if (i >= 0) {
                    copy[i] = { ...copy[i], __ordenes: arr };
                  } else {
                    copy.push({ ...p, __ordenes: arr });
                  }
                  return copy;
                });
              });
              unsubs.push(uO);
            });
            // bootstrap inicial
            setProgramas(progs);
            setLoading(false);
          },
          (e) => {
            setErr(e?.message || "No pude leer programaciones.");
            setLoading(false);
          }
        );
        unsubs.push(unsub);
      } catch (e) {
        setErr(e?.message || "No pude iniciar la suscripción.");
        setLoading(false);
      }
    })();
    return () => {
      unsubs.forEach((u) => u && u());
    };
  }, [empresaId, fecha]);

  // Catálogo conductores para filtro rápido
  const conductores = useMemo(() => {
    const set = new Set();
    for (const p of programas) {
      if (p.conductorNombre) set.add(p.conductorNombre);
    }
    return ["", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [programas]);

  // Acciones de ruta
  async function setEstadoRuta(p, estado /* en_progreso | finalizada */) {
    try {
      await updateDoc(doc(db, "programasEntrega", p.id), {
        estadoRuta: estado,
        estadoRutaUpdatedAt: serverTimestamp(),
        startedAt:
          estado === "en_progreso" ? serverTimestamp() : p.startedAt || null,
        finishedAt: estado === "finalizada" ? serverTimestamp() : null,
      });
      if (p.conductorUid) {
        await setDoc(
          doc(db, "ubicacionesMensajeros", p.conductorUid),
          {
            estado: estado === "en_progreso" ? "en_ruta" : "disponible",
            estadoUpdatedAt: serverTimestamp(),
            lastPingAt: serverTimestamp(),
            empresaId,
            nombre: p.conductorNombre || p.conductorUid,
          },
          { merge: true }
        );
      }
      alert(`Ruta ${p.nombreRuta || p.id} → ${estado}`);
    } catch (e) {
      alert(e?.message || "No pude actualizar el estado de la ruta.");
    }
  }

  // Acciones por orden
  async function marcarRecibida(o) {
    try {
      await updateDoc(doc(db, "ordenes", o.id), {
        recibida: true,
        fechaRecibida: serverTimestamp(),
      });
    } catch (e) {
      alert(e?.message || "No pude marcar recibida.");
    }
  }
  async function marcarEntregada(o) {
    try {
      await updateDoc(doc(db, "ordenes", o.id), {
        entregado: true,
        fechaEntregada: serverTimestamp(),
      });
    } catch (e) {
      alert(e?.message || "No pude marcar entregada.");
    }
  }

  // Stats por programa
  function buildStats(p) {
    const arr = p.__ordenes || [];
    const tot = arr.length;
    let ent = 0,
      rec = 0,
      onTime = 0,
      atrasadas = 0,
      porVencer = 0;
    const tolMs =
      (Number.isFinite(toleranciaOnTimeMin) ? toleranciaOnTimeMin : 15) * 60000;
    const ventMs =
      (Number.isFinite(alertaVentanaMin) ? alertaVentanaMin : 30) * 60000;
    const now = nowMs;
    let sumTot = 0,
      nTot = 0;
    for (const o of arr) {
      if (o.recibida) rec++;
      if (o.entregado) ent++;
      const tTOT = diffMin(o.fechaEntregada, o.createdAt);
      if (Number.isFinite(tTOT)) {
        sumTot += tTOT;
        nTot++;
      }

      const prog = msProgramada(o);
      const entMs = tsToMs(o.fechaEntregada);
      if (
        o.entregado &&
        Number.isFinite(prog) &&
        Number.isFinite(entMs) &&
        entMs <= prog + tolMs
      )
        onTime++;

      // atraso (no entregada y ya vencida)
      if (!o.entregado && Number.isFinite(prog) && now > prog + tolMs)
        atrasadas++;

      // por vencer (no entregada y falta <= ventana)
      if (
        !o.entregado &&
        Number.isFinite(prog) &&
        now <= prog + tolMs &&
        prog + tolMs - now <= ventMs
      )
        porVencer++;
    }
    return {
      tot,
      ent,
      rec,
      pend: tot - ent,
      pctEnt: pct(ent, tot || 0),
      pctRec: pct(rec, tot || 0),
      onTime,
      onTimePct: pct(onTime, ent || 0),
      atrasadas,
      porVencer,
      avgTotal: nTot ? sumTot / nTot : null,
    };
  }

  // Alertas agregadas (toda la empresa, por día seleccionado)
  const alertas = useMemo(() => {
    const criticas = [];
    const vencen = [];
    const porPrograma = {};
    const tolMs =
      (Number.isFinite(toleranciaOnTimeMin) ? toleranciaOnTimeMin : 15) * 60000;
    const ventMs =
      (Number.isFinite(alertaVentanaMin) ? alertaVentanaMin : 30) * 60000;

    for (const p of programas) {
      const arrC = [];
      const arrV = [];
      for (const o of p.__ordenes || []) {
        if (o.entregado) continue;
        const prog = msProgramada(o);
        if (!Number.isFinite(prog)) continue;
        const remaining = prog + tolMs - nowMs;
        const base = {
          programaId: p.id,
          ruta: p.nombreRuta || p.id,
          conductor: p.conductorNombre || "",
          orderId: o.id,
          cliente: o.cliente || "",
          factura: o.numeroFactura || "",
          hora: o.hora || "",
          remainingMin: remaining / 60000,
          orden: o,
        };
        if (remaining < 0) {
          criticas.push(base);
          arrC.push(base);
        } else if (remaining <= ventMs) {
          vencen.push(base);
          arrV.push(base);
        }
      }
      porPrograma[p.id] = { criticas: arrC, porVencer: arrV };
    }
    // ordenar: primero más críticas (más vencidas / menos minutos)
    criticas.sort((a, b) => a.remainingMin - b.remainingMin);
    vencen.sort((a, b) => a.remainingMin - b.remainingMin);
    return { criticas, vencen, porPrograma };
  }, [programas, nowMs, toleranciaOnTimeMin, alertaVentanaMin]);

  // 🔔 Sonido cuando sube la cantidad de críticas
  const prevCritRef = useRef(0);
  useEffect(() => {
    const curr = alertas.criticas.length;
    if (!mute && curr > prevCritRef.current) {
      playBeep(3, 0.12, 880, 220, 120);
    }
    prevCritRef.current = curr;
  }, [alertas.criticas.length, mute]);

  // Export CSV simple por programa (se mantiene)
  function exportCSV(filename, rows) {
    if (!rows?.length) return;
    const cols = Object.keys(rows[0]);
    const csv = [
      cols.join(","),
      ...rows.map((r) =>
        cols
          .map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`)
          .join(",")
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
  function exportProg(p) {
    const rows = (p.__ordenes || []).map((o) => ({
      programacionId: p.id,
      ruta: p.nombreRuta || "",
      fecha: p.fecha || "",
      conductor: p.conductorNombre || "",
      orderId: o.id,
      cliente: o.cliente || "",
      factura: o.numeroFactura || "",
      programada_hora: o.hora || "",
      recibida_at: o.fechaRecibida
        ? new Date(tsToMs(o.fechaRecibida)).toLocaleString()
        : "",
      entregada_at: o.fechaEntregada
        ? new Date(tsToMs(o.fechaEntregada)).toLocaleString()
        : "",
      estado: o.entregado
        ? "ENTREGADA"
        : o.recibida
        ? "RECIBIDA"
        : "PENDIENTE",
      min_total: Number.isFinite(diffMin(o.fechaEntregada, o.createdAt))
        ? diffMin(o.fechaEntregada, o.createdAt).toFixed(1)
        : "",
    }));
    exportCSV(`seguimiento_${p.nombreRuta || p.id}_${p.fecha}.csv`, rows);
  }

  // Filtro de programas (conductor + críticos/por vencer)
  const progsFiltradas = useMemo(() => {
    let list = programas
      .filter((p) => (conductor ? p.conductorNombre === conductor : true))
      .sort((a, b) => (a.nombreRuta || "").localeCompare(b.nombreRuta || ""));
    if (soloCriticas) {
      list = list.filter((p) => (alertas.porPrograma[p.id]?.criticas.length || 0) > 0);
    }
    if (soloPorVencer) {
      list = list.filter(
        (p) => (alertas.porPrograma[p.id]?.porVencer.length || 0) > 0
      );
    }
    return list;
  }, [programas, conductor, soloCriticas, soloPorVencer, alertas.porPrograma]);

  return (
    <div style={{ padding: 16 }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ margin: 0 }}>🚦 Seguimiento de Rutas (Despacho)</h2>

        {/* 🔔 Banner de alertas */}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <label>Fecha</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
          <label>Conductor</label>
          <select
            value={conductor}
            onChange={(e) => setConductor(e.target.value)}
          >
            {conductores.map((n) => (
              <option key={n || "__"} value={n}>
                {n || "(Todos)"}
              </option>
            ))}
          </select>
          <label>Tolerancia on-time (min)</label>
          <input
            type="number"
            value={toleranciaOnTimeMin}
            onChange={(e) =>
              setToleranciaOnTimeMin(Number(e.target.value) || 0)
            }
            style={{ width: 80 }}
          />
        </div>
      </div>

      {/* Panel alertas en vivo */}
      <div
        style={{
          marginTop: 10,
          padding: 10,
          border: "1px solid #ffd180",
          background: "#fff8e1",
          borderRadius: 10,
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <b>Alertas SLA</b>
          <span>
            🔴 Críticas: <b>{alertas.criticas.length}</b>
          </span>
          <span>
            ⏳ Por vencer ≤
            <input
              type="number"
              value={alertaVentanaMin}
              onChange={(e) => setAlertaVentanaMin(Number(e.target.value) || 0)}
              style={{ width: 60, margin: "0 6px" }}
            />
            min: <b>{alertas.vencen.length}</b>
          </span>

          <label style={{ marginLeft: 10 }}>
            <input
              type="checkbox"
              checked={soloCriticas}
              onChange={(e) => {
                setSoloCriticas(e.target.checked);
                if (e.target.checked) setSoloPorVencer(false);
              }}
            />{" "}
            Solo críticas
          </label>
          <label>
            <input
              type="checkbox"
              checked={soloPorVencer}
              onChange={(e) => {
                setSoloPorVencer(e.target.checked);
                if (e.target.checked) setSoloCriticas(false);
              }}
            />{" "}
            Solo por vencer
          </label>

          <button onClick={() => setMostrarPanelAlertas((v) => !v)}>
            {mostrarPanelAlertas ? "Ocultar lista" : "Ver lista"}
          </button>

          <button
            onClick={() => setMute((m) => !m)}
            title={mute ? "Sonido desactivado" : "Sonido activado"}
          >
            {mute ? "🔕" : "🔔"}
          </button>
          <button onClick={() => playBeep(2)} title="Probar sonido">
            ▶️ Probar
          </button>

          <div style={{ marginLeft: "auto", fontSize: 12, color: "#555" }}>
            {new Date(nowMs).toLocaleTimeString()}
          </div>
        </div>

        {mostrarPanelAlertas && (
          <div style={{ marginTop: 10, overflowX: "auto" }}>
            {(alertas.criticas.length || alertas.vencen.length) ? (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <Th>Tipo</Th>
                    <Th>Ruta</Th>
                    <Th>Conductor</Th>
                    <Th>Cliente</Th>
                    <Th>Factura</Th>
                    <Th>Hora prog.</Th>
                    <Th>SLA</Th>
                    <Th>Acciones</Th>
                  </tr>
                </thead>
                <tbody>
                  {[...alertas.criticas.map(a => ({...a, __tipo: "Crítica"})),
                    ...alertas.vencen.map(a => ({...a, __tipo: "Por vencer"}))].map((a) => {
                    const lat = a.orden?.address?.lat ?? a.orden?.destinoLat;
                    const lng = a.orden?.address?.lng ?? a.orden?.destinoLng;
                    const isCrit = a.__tipo === "Crítica";
                    const rem = a.remainingMin;
                    const slaTxt = isCrit
                      ? `Vencida hace ${Math.abs(rem).toFixed(0)} min`
                      : `Faltan ${Math.max(0, rem).toFixed(0)} min`;
                    return (
                      <tr key={`${a.__tipo}-${a.orderId}`} style={{ background: isCrit ? "#ffecec" : "#fff6e6" }}>
                        <Td style={{ fontWeight: 700 }}>{isCrit ? "🔴" : "⏳"} {a.__tipo}</Td>
                        <Td>{a.ruta}</Td>
                        <Td>{a.conductor || "—"}</Td>
                        <Td>{a.cliente || "—"}</Td>
                        <Td>{a.factura || "—"}</Td>
                        <Td>{a.hora || "—"}</Td>
                        <Td>{slaTxt}</Td>
                        <Td>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {!a.orden?.recibida && (
                              <button onClick={() => marcarRecibida(a.orden)}>🟡 Recibida</button>
                            )}
                            {!a.orden?.entregado && (
                              <button onClick={() => marcarEntregada(a.orden)}>🟢 Entregada</button>
                            )}
                            {Number.isFinite(lat) && Number.isFinite(lng) && (
                              <>
                                <a href={wazeUrl(lat, lng)} target="_blank" rel="noreferrer">
                                  Waze
                                </a>
                                <a href={gmapsUrl(lat, lng)} target="_blank" rel="noreferrer">
                                  Maps
                                </a>
                              </>
                            )}
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div style={{ fontSize: 13, color: "#666" }}>
                Sin alertas en este momento.
              </div>
            )}
          </div>
        )}
      </div>

      {err && <div style={{ marginTop: 8, color: "#b00" }}>{err}</div>}
      {loading && <div style={{ marginTop: 8 }}>Cargando…</div>}

      <div
        style={{
          marginTop: 12,
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        }}
      >
        {progsFiltradas.map((p) => {
          const s = buildStats(p);
          const progreso = s.tot ? s.ent / s.tot : 0;
          const semaforo = s.atrasadas > 0 ? "#d32f2f" : s.pend > 0 ? "#f9a825" : "#2e7d32";
          const critP = alertas.porPrograma[p.id]?.criticas.length || 0;
          const vencP = alertas.porPrograma[p.id]?.porVencer.length || 0;

          return (
            <div
              key={p.id}
              style={{
                border: "1px solid #eee",
                borderRadius: 10,
                background: "#fff",
              }}
            >
              <div
                style={{
                  padding: "10px 12px",
                  borderBottom: "1px solid #eee",
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    background: semaforo,
                  }}
                />
                <div style={{ fontWeight: 700 }}>
                  {p.nombreRuta || p.id}
                  {(critP || vencP) ? (
                    <span style={{ marginLeft: 8, fontSize: 12 }}>
                      {critP ? <strong style={{ color: "#c62828" }}> · 🔴 {critP}</strong> : null}
                      {vencP ? <strong style={{ color: "#ef6c00" }}> · ⏳ {vencP}</strong> : null}
                    </span>
                  ) : null}
                </div>
                <div style={{ marginLeft: "auto", fontSize: 13, color: "#555" }}>
                  {p.fecha} · {p.conductorNombre || "—"}
                </div>
              </div>

              <div style={{ padding: "10px 12px" }}>
                {/* KPIs */}
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <Kpi label="Órdenes" value={s.tot} />
                  <Kpi label="Entregadas" value={`${s.ent} (${s.pctEnt})`} />
                  <Kpi label="Recibidas" value={`${s.rec} (${s.pctRec})`} />
                  <Kpi label="Pendientes" value={s.pend} />
                  <Kpi label="On-time (entregadas)" value={`${s.onTime} (${s.onTimePct})`} />
                  <Kpi label="Atrasadas" value={s.atrasadas} />
                  <Kpi label="Por vencer" value={s.porVencer} />
                  <Kpi label="Prom. total" value={fmtMin(s.avgTotal)} />
                </div>

                {/* Barra progreso */}
                <div style={{ marginTop: 10 }}>
                  <div style={{ height: 10, background: "#f3f3f3", borderRadius: 6 }}>
                    <div
                      style={{
                        width: `${Math.min(100, Math.round(progreso * 100))}%`,
                        height: "100%",
                        background: "#1976d2",
                        borderRadius: 6,
                      }}
                    />
                  </div>
                </div>

                {/* Acciones ruta */}
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => setEstadoRuta(p, "en_progreso")}>▶️ Iniciar ruta</button>
                  <button onClick={() => setEstadoRuta(p, "finalizada")}>⏹️ Finalizar ruta</button>
                  <button onClick={() => exportProg(p)}>⬇️ Export CSV</button>
                </div>
              </div>

              {/* Tabla simple de órdenes */}
              <div style={{ borderTop: "1px solid #eee", maxHeight: 340, overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <Th>Cliente</Th>
                      <Th>Factura</Th>
                      <Th>Prog</Th>
                      <Th>Recibida</Th>
                      <Th>Entregada</Th>
                      <Th>Duración</Th>
                      <Th>SLA</Th>
                      <Th>Acciones</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(p.__ordenes || []).map((o) => {
                      const prog = o.hora || "";
                      const recStr = o.fechaRecibida
                        ? new Date(tsToMs(o.fechaRecibida)).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—";
                      const entStr = o.fechaEntregada
                        ? new Date(tsToMs(o.fechaEntregada)).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—";
                      const tTot = fmtMin(diffMin(o.fechaEntregada, o.createdAt));
                      const lat = o?.address?.lat ?? o?.destinoLat;
                      const lng = o?.address?.lng ?? o?.destinoLng;

                      const tolMs =
                        (Number.isFinite(toleranciaOnTimeMin)
                          ? toleranciaOnTimeMin
                          : 15) * 60000;
                      const rem = (() => {
                        const pMs = msProgramada(o);
                        if (!Number.isFinite(pMs)) return null;
                        return pMs + tolMs - nowMs;
                      })();
                      const isCrit = rem != null && rem < 0 && !o.entregado;
                      const isSoon =
                        rem != null &&
                        rem >= 0 &&
                        rem <=
                          (Number.isFinite(alertaVentanaMin)
                            ? alertaVentanaMin
                            : 30) *
                            60000 &&
                        !o.entregado;

                      const slaTxt =
                        rem == null
                          ? "—"
                          : rem < 0
                          ? `Vencida hace ${Math.abs(rem / 60000).toFixed(0)} min`
                          : `Faltan ${(rem / 60000).toFixed(0)} min`;

                      return (
                        <tr
                          key={o.id}
                          style={{
                            background: isCrit ? "#fff4f4" : isSoon ? "#fff9e6" : "transparent",
                          }}
                        >
                          <Td style={{ minWidth: 150 }}>{o.cliente || "—"}</Td>
                          <Td>{o.numeroFactura || "—"}</Td>
                          <Td>{prog || "—"}</Td>
                          <Td>{recStr}</Td>
                          <Td>{entStr}</Td>
                          <Td>{tTot}</Td>
                          <Td style={{ fontWeight: isCrit ? 700 : 500, color: isCrit ? "#b71c1c" : isSoon ? "#e65100" : "#333" }}>
                            {slaTxt}
                          </Td>
                          <Td>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {!o.recibida && (
                                <button onClick={() => marcarRecibida(o)}>🟡 Recibida</button>
                              )}
                              {!o.entregado && (
                                <button onClick={() => marcarEntregada(o)}>🟢 Entregada</button>
                              )}
                              {Number.isFinite(lat) && Number.isFinite(lng) && (
                                <>
                                  <a
                                    href={wazeUrl(lat, lng)}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Waze
                                  </a>
                                  <a
                                    href={gmapsUrl(lat, lng)}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Maps
                                  </a>
                                </>
                              )}
                            </div>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      {!progsFiltradas.length && !loading && (
        <div style={{ marginTop: 12 }}>
          No hay rutas publicadas para la fecha seleccionada.
        </div>
      )}
    </div>
  );
}

/** UI helpers */
function Kpi({ label, value }) {
  return (
    <div
      style={{
        border: "1px dashed #ddd",
        borderRadius: 10,
        padding: "8px 10px",
        minWidth: 140,
      }}
    >
      <div style={{ fontSize: 12, color: "#666" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
const Th = ({ children }) => (
  <th
    style={{
      textAlign: "left",
      borderBottom: "1px solid #eee",
      padding: "6px 8px",
      background: "#fafafa",
      position: "sticky",
      top: 0,
      zIndex: 1,
    }}
  >
    {children}
  </th>
);
const Td = ({ children, style }) => (
  <td style={{ borderBottom: "1px solid #f2f2f2", padding: "6px 8px", ...style }}>
    {children}
  </td>
);
