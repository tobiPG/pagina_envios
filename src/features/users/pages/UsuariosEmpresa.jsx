// src/features/users/pages/UsuariosEmpresa.jsx
import { useMemo, useState, useEffect } from "react";
import { db, functions } from "../../../shared/services/firebase.js";
import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
  getDoc,
  runTransaction,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

// Normaliza removiendo tildes también (por si el backend lo hace)
function stripDiacritics(s = "") {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeRole(raw) {
  const r0 = String(raw || "").trim();
  const r = stripDiacritics(r0).toLowerCase();
  if (["administrador", "admin", "administrator"].includes(r)) return "administrador";
  if (["operador", "operator"].includes(r)) return "operador";
  if (["gerente", "manager"].includes(r)) return "gerente";
  // fallback a mensajero para todo lo demás
  if (["mensajero","rider","courier","delivery","deliveryman","repartidor"].includes(r)) return "mensajero";
  return r || "mensajero";
}

function UsuariosEmpresa() {
  // Sesión
  const usuario = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("usuarioActivo") || "null"); } catch { return null; }
  }, []);
  const empresaId = usuario?.empresaId || null;
  const miRol = normalizeRole(usuario?.rol);
  const isAdmin = miRol === "administrador";

  // Formulario
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState("operador"); // operador | mensajero | administrador | gerente
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Listado + contadores
  const [usuarios, setUsuarios] = useState([]);
  const [contadores, setContadores] = useState({
    administradores: 0,
    operadores: 0,
    gerentes: 0,
    mensajeros: 0,
  });

  // Callables
  const createUser = httpsCallable(functions, "adminCreateUser");
  const deleteUserCallable = httpsCallable(functions, "adminDeleteUser");

  useEffect(() => {
    if (!empresaId) return;
    const qUsers = query(collection(db, "usuarios"), where("empresaId", "==", empresaId));
    const unsub = onSnapshot(
      qUsers,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setUsuarios(rows);

        const c = { administradores: 0, operadores: 0, gerentes: 0, mensajeros: 0 };
        for (const u of rows) {
          const r = normalizeRole(u.rol);
          if (r === "administrador") c.administradores++;
          else if (r === "operador") c.operadores++;
          else if (r === "gerente") c.gerentes++;
          else c.mensajeros++;
        }
        setContadores(c);
      },
      (e) => {
        console.error("onSnapshot(usuarios) ->", e);
        setErr(e?.message || "No pude cargar los usuarios.");
      }
    );
    return () => unsub();
  }, [empresaId]);

  // Crear usuario mediante Callable
  async function invitar() {
    setMsg(""); setErr("");
    if (loading) return;
    if (!empresaId) return setErr("Debes iniciar sesión como administrador.");
    if (!isAdmin) return setErr("Solo el administrador puede crear usuarios.");

    const em = String(email || "").trim().toLowerCase();
    if (!em || !em.includes("@")) return setErr("Correo inválido.");
    const nom = (String(nombre || "").trim() || em.split("@")[0]).slice(0, 80);
    const r = normalizeRole(rol); // incluye "gerente"

    setLoading(true);
    try {
      // Enviar con ambas claves por compatibilidad: 'rol' y 'role'
      const payload = { email: em, nombre: nom, rol: r, role: r, empresaId: String(empresaId) };
      console.log("adminCreateUser payload ->", payload);

      const res = await createUser(payload);
      const resetLink = res?.data?.resetLink || "";
      if (resetLink) { try { await navigator.clipboard.writeText(resetLink); } catch {} }
      setMsg(resetLink
        ? "Usuario creado ✅. Enlace de restablecer contraseña copiado."
        : "Usuario creado ✅. (No se pudo copiar el enlace)."
      );
      setEmail(""); setNombre(""); setRol("operador");
    } catch (e) {
      // Mostrar TODO lo útil para diagnosticar
      const full = {
        code: e?.code,
        message: e?.message,
        details: e?.details,
        raw: e,
      };
      console.error("adminCreateUser error ->", full);
      const code = e?.code || "";
      const message = e?.message || "No se pudo crear el usuario.";
      const detailsMsg = typeof e?.details === "string" ? ` Detalles: ${e.details}` : "";
      setErr(`${code ? `[${code}] ` : ""}${message}${detailsMsg}`);
    } finally {
      setLoading(false);
    }
  }

  function keyPorRol(rolStr) {
    const r = normalizeRole(rolStr);
    if (r === "administrador") return "administradores";
    if (r === "operador" || r === "gerente") return "operadores";
    return "mensajeros";
  }

  async function fallbackDeleteAndDecrement(u) {
    const empRef = doc(db, "empresas", empresaId);
    const userRef = doc(db, "usuarios", u.id);
    const key = keyPorRol(u.rol);

    await runTransaction(db, async (tx) => {
      const empSnap = await tx.get(empRef);
      if (!empSnap.exists()) throw new Error("Empresa no existe.");
      const uso = empSnap.data()?.usoActual || {};
      const current = Number(uso[key] || 0);
      const nuevo = current > 0 ? current - 1 : 0;

      tx.delete(userRef);
      tx.update(empRef, {
        [`usoActual.${key}`]: nuevo,
        updatedAt: new Date(),
      });
    });
  }

  async function eliminar(u) {
    setMsg(""); setErr("");
    if (!isAdmin) return alert("Solo el administrador puede eliminar miembros.");
    if (!u) return;

    if (u.uid && usuario?.uid && u.uid === usuario.uid) {
      return alert("No puedes eliminar tu propio usuario.");
    }
    const rNorm = normalizeRole(u.rol);
    const esAdminTarget = rNorm === "administrador";
    if (esAdminTarget && contadores.administradores <= 1) {
      return alert("No puedes eliminar el último administrador.");
    }

    const ok = window.confirm(`¿Eliminar a ${u.nombre || u.email || "este usuario"}?`);
    if (!ok) return;

    const snap = await getDoc(doc(db, "usuarios", u.id));
    if (!snap.exists()) {
      setMsg("Ese usuario ya no existe (refrescado).");
      return;
    }

    try {
      const res = await deleteUserCallable({
        uid: u.uid || null,
        userDocId: u.id,
        empresaId,
        rol: normalizeRole(u.rol),
      });
      if (res?.data?.ok) {
        setMsg("Miembro eliminado.");
        return;
      }
      console.warn("adminDeleteUser devolvió sin ok; usando fallback…", res?.data);
      await fallbackDeleteAndDecrement(u);
      setMsg("Miembro eliminado (fallback).");
    } catch (e) {
      console.error("adminDeleteUser error ->", e);
      try {
        await fallbackDeleteAndDecrement(u);
        setMsg("Miembro eliminado (fallback).");
      } catch (e2) {
        console.error("fallbackDeleteAndDecrement error ->", e2);
        setErr(e2?.message || "No se pudo eliminar el usuario.");
      }
    }
  }

  if (!empresaId) {
    return <div style={{ padding: 20 }}>Debes iniciar sesión como administrador.</div>;
  }

  return (
    <div style={{ maxWidth: 800, margin: "30px auto", padding: "0 12px" }}>
      <h2>Usuarios de la empresa</h2>

      {/* Resumen */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ padding: "6px 10px", background: "#e0d3d3ff", borderRadius: 999 }}>
          Admins: <b>{contadores.administradores}</b>
        </span>
        <span style={{ padding: "6px 10px", background: "#e0d3d3ff", borderRadius: 999 }}>
          Operadores: <b>{contadores.operadores}</b>
        </span>
        <span style={{ padding: "6px 10px", background: "#e0d3d3ff", borderRadius: 999 }}>
          Gerentes: <b>{contadores.gerentes}</b>
        </span>
        <span style={{ padding: "6px 10px", background: "#e0d3d3ff", borderRadius: 999 }}>
          Mensajeros: <b>{contadores.mensajeros}</b>
        </span>
      </div>

      {/* Formulario de creación */}
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr 180px 140px" }}>
        <input
          placeholder="Email del usuario"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && invitar()}
        />
        <input
          placeholder="Nombre (opcional)"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && invitar()}
        />
        <select value={rol} onChange={(e) => setRol(e.target.value)}>
          <option value="operador">Operador</option>
          <option value="gerente">Gerente</option>
          <option value="mensajero">Mensajero</option>
          {isAdmin && <option value="administrador">Administrador</option>}
        </select>

        <button onClick={invitar} disabled={loading || !email}>
          {loading ? "Creando..." : "Crear usuario"}
        </button>
      </div>

      {err && <div style={{ color: "#b91c1c", marginTop: 10 }}>{err}</div>}
      {msg && <div style={{ color: "#065f46", marginTop: 10 }}>{msg}</div>}

      {/* Lista */}
      <h3 style={{ marginTop: 20 }}>Miembros</h3>
      {!usuarios.length && <div style={{ color: "#6b7280" }}>No hay usuarios todavía.</div>}
      {!!usuarios.length && (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ffffffff", padding: "8px 6px" }}>Nombre</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: "8px 6px" }}>Correo</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: "8px 6px" }}>Rol</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: "8px 6px" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td style={{ padding: "8px 6px" }}>{u.nombre || "—"}</td>
                <td style={{ padding: "8px 6px" }}>{u.email || "—"}</td>
                <td style={{ padding: "8px 6px" }}>{normalizeRole(u.rol)}</td>
                <td style={{ padding: "8px 6px" }}>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => eliminar(u)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: "1px solid #b91c1c",
                        background: "#b72424ff",
                        color: "#ffffffff",
                        cursor: "pointer",
                      }}
                      title="Eliminar miembro"
                    >
                      Eliminar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default UsuariosEmpresa;
