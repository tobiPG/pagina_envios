// src/shared/components/AsignarMensajero.jsx
import { useEffect, useMemo, useState } from "react";
import { db } from "../services/firebase";
import {
  collection, doc, getDoc, onSnapshot, query, where, updateDoc,
  addDoc, serverTimestamp
} from "firebase/firestore";
import { ensureUsuarioActivo } from "../utils/ensureUsuario";

const ROLES_MENSAJERO = new Set([
  "mensajero","mensajeros","rider","riders","courier",
  "delivery","deliveryman","repartidor","repartidores","conductor","driver"
]);
const norm = (s) => String(s || "").trim().toLowerCase();

function useUsuarioActivo() {
  try { return JSON.parse(localStorage.getItem("usuarioActivo") || "null"); } catch { return null; }
}

export default function AsignarMensajero({ orden, ordenId, onUpdated }) {
  const usuario = useUsuarioActivo();
  const empresaId = usuario?.empresaId != null ? String(usuario.empresaId) : null;

  const [ordenLocal, setOrdenLocal] = useState(orden || null);
  const [mensajeros, setMensajeros] = useState([]);
  const [ubic, setUbic] = useState([]); // ubicacionesMensajeros
  const [busca, setBusca] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const id = orden?.id || ordenId;

  // Cargar/escuchar la orden si no vino por props
  useEffect(() => {
    if (orden) return; // ya vino completa
    if (!id) return;
    let mounted = true;
    (async () => {
      const ok = await ensureUsuarioActivo();
      if (!ok) { setErr("Sin sesión"); return; }
      try {
        const snap = await getDoc(doc(db, "ordenes", id));
        if (mounted) setOrdenLocal(snap.exists() ? { id, ...snap.data() } : null);
      } catch (e) { if (mounted) setErr(e?.message || "No pude cargar la orden"); }
    })();
    return () => { mounted = false; };
  }, [id, orden]);

  // Cargar usuarios (todos y filtramos rol en cliente para evitar problemas de case)
  useEffect(() => {
    let unsub = null, unsubU = null;
    (async () => {
      if (!empresaId) return;
      const ok = await ensureUsuarioActivo(); if (!ok) return;

      // usuarios de la empresa
      unsub = onSnapshot(
        query(collection(db, "usuarios"), where("empresaId", "==", empresaId)),
        (snap) => {
          const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setMensajeros(arr.filter(u => ROLES_MENSAJERO.has(norm(u.rol))));
        }
      );

      // ubicacionesMensajeros para ver estado/posición
      unsubU = onSnapshot(
        query(collection(db, "ubicacionesMensajeros"), where("empresaId", "==", empresaId)),
        (snap) => setUbic(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      );
    })();
    return () => { if (unsub) unsub(); if (unsubU) unsubU(); };
  }, [empresaId]);

  const indiceUbic = useMemo(() => {
    const m = new Map();
    for (const u of ubic) m.set(String(u.id), u);
    return m;
  }, [ubic]);

  const lista = useMemo(() => {
    const q = norm(busca);
    return mensajeros
      .map(m => {
        const u = indiceUbic.get(String(m.uid || m.id));
        const estado = norm(u?.estado || "disponible");
        return {
          uid: String(m.uid || m.id),
          nombre: m.nombre || m.displayName || m.email || m.id,
          estado,
        };
      })
      .filter(x => !q || norm(x.nombre).includes(q) || x.uid.includes(q))
      .sort((a,b)=> a.nombre.localeCompare(b.nombre));
  }, [mensajeros, indiceUbic, busca]);

  const asignadoUid = ordenLocal?.asignadoUid || null;
  const asignadoNombre = ordenLocal?.asignadoNombre || null;

  async function logCambio(orderId, cambios, motivo="asignación") {
    try {
      await addDoc(collection(db, "cambiosOrden"), {
        empresaId,
        orderId,
        createdAt: serverTimestamp(),
        actorUid: usuario?.uid || null,
        actorNombre: usuario?.nombre || usuario?.email || "desconocido",
        actorRol: usuario?.rol || "",
        motivo,
        cambios: cambios.map(c => ({
          campo: c.campo,
          antes: c.antes ?? null,
          despues: c.despues ?? null,
        })),
      });
    } catch (e) {
      // el historial es “best effort”; no bloquea la operación
      console.warn("logCambioOrden fallo:", e?.message);
    }
  }

  async function asignar(m) {
    if (!id) return;
    setSaving(true); setErr("");
    try {
      await ensureUsuarioActivo();
      const cambios = [
        { campo:"asignadoUid", antes: asignadoUid || null, despues: m.uid },
        { campo:"asignadoNombre", antes: asignadoNombre || null, despues: m.nombre },
      ];
      await updateDoc(doc(db, "ordenes", id), {
        asignadoUid: m.uid,
        asignadoNombre: m.nombre,
        asignadoAt: serverTimestamp(),
      });
      await logCambio(id, cambios, "Asignación de mensajero");
      setOrdenLocal(o => ({ ...(o||{}), asignadoUid: m.uid, asignadoNombre: m.nombre }));
      onUpdated && onUpdated();
    } catch (e) {
      setErr(e?.message || "No pude asignar");
    } finally { setSaving(false); }
  }

  async function desasignar() {
    if (!id) return;
    setSaving(true); setErr("");
    try {
      await ensureUsuarioActivo();
      const cambios = [
        { campo:"asignadoUid", antes: asignadoUid || null, despues: null },
        { campo:"asignadoNombre", antes: asignadoNombre || null, despues: null },
      ];
      await updateDoc(doc(db, "ordenes", id), {
        asignadoUid: null,
        asignadoNombre: null,
        asignadoAt: serverTimestamp(),
      });
      await logCambio(id, cambios, "Desasignación");
      setOrdenLocal(o => ({ ...(o||{}), asignadoUid: null, asignadoNombre: null }));
      onUpdated && onUpdated();
    } catch (e) {
      setErr(e?.message || "No pude desasignar");
    } finally { setSaving(false); }
  }

  return (
    <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff", marginTop: 12 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
        <h3 style={{ margin:0 }}>Asignación de mensajero</h3>
        {ordenLocal?.numeroFactura && <span style={{ fontSize:12, color:"#666" }}>Factura: <b>{ordenLocal.numeroFactura}</b></span>}
        <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
          {asignadoUid ? (
            <>
              <span style={{ fontSize:13 }}>
                Asignado a: <b>{asignadoNombre}</b> <span style={{ color:"#64748b" }}>({String(asignadoUid).slice(0,6)}…)</span>
              </span>
              <button onClick={desasignar} disabled={saving} title="Quitar asignación">Desasignar</button>
            </>
          ) : (
            <span style={{ fontSize:13, color:"#64748b" }}>Sin mensajero asignado</span>
          )}
        </div>
      </div>

      <div style={{ display:"flex", gap:8, alignItems:"end", marginTop:10, flexWrap:"wrap" }}>
        <div>
          <label style={{ fontSize:12, color:"#334155" }}>Buscar</label><br/>
          <input
            type="text"
            placeholder="nombre o UID…"
            value={busca}
            onChange={(e)=>setBusca(e.target.value)}
            style={{ minWidth:220 }}
          />
        </div>
        <div style={{ fontSize:12, color:"#64748b" }}>
          * Se permite asignar incluso si el mensajero está <b>en ruta</b>.
        </div>
      </div>

      <div style={{ marginTop:10, maxHeight:260, overflowY:"auto", border:"1px solid #e5e7eb", borderRadius:10 }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr>
              <th style={th}>Mensajero</th>
              <th style={th}>UID</th>
              <th style={th}>Estado</th>
              <th style={th}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {lista.length ? lista.map(m => {
              const activo = asignadoUid && String(asignadoUid) === String(m.uid);
              const estadoColor = m.estado === "en_ruta" ? "#22c55e" :
                                  m.estado === "listo_para_ruta" ? "#6d28d9" :
                                  m.estado === "disponible" ? "#3b82f6" : "#94a3b8";
              return (
                <tr key={m.uid}>
                  <td style={td}>{m.nombre}</td>
                  <td style={{ ...td, fontFamily:"ui-monospace,Menlo,monospace" }}>{m.uid.slice(0,12)}…</td>
                  <td style={td}>
                    <span style={{ display:"inline-block", padding:"2px 8px", borderRadius:12, background:estadoColor, color:"#fff", fontSize:12 }}>
                      {m.estado.replaceAll("_"," ")}
                    </span>
                  </td>
                  <td style={td}>
                    {activo ? (
                      <button disabled className="btn">Asignado</button>
                    ) : (
                      <button onClick={()=>asignar(m)} disabled={saving}>Asignar</button>
                    )}
                  </td>
                </tr>
              );
            }) : (
              <tr><td style={td} colSpan={4}>No hay mensajeros.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {!!err && <div style={{ color:"#b00", marginTop:8 }}>{err}</div>}
    </section>
  );
}

const th = { textAlign:"left", borderBottom:"1px solid #eee", padding:"8px 10px", background:"#fafafa" };
const td = { borderBottom:"1px solid #f2f2f2", padding:"8px 10px" };
