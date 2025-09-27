// src/pantallas/Admin/Equipo.jsx
import { useEffect, useMemo, useState } from "react";
import { db, functions } from "../../firebaseConfig";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

const ROLES = ["mensajero", "operador", "administrador"];

export default function Equipo() {
  const usuario = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("usuarioActivo") || "null"); } catch { return null; }
  }, []);
  const empresaId = usuario?.empresaId || null;
  const miRol = String(usuario?.rol || "").toLowerCase();
  const isAdmin = ["administrador", "admin", "administrator"].includes(miRol);

  const [users, setUsers] = useState([]);
  const [err, setErr] = useState("");

  // Form crear/invitar
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState("mensajero");
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState("");
  const [resetLink, setResetLink] = useState("");

  // Estado de borrado
  const [deletingId, setDeletingId] = useState("");

  // Callables
  const createUserFn = httpsCallable(functions, "adminCreateUser");
  const setUserRoleFn = httpsCallable(functions, "adminSetUserRole");
  const deleteUserFn = httpsCallable(functions, "adminDeleteUser");

  useEffect(() => {
    if (!empresaId) { setErr("No hay empresa en la sesión."); return; }
    const qUsers = query(collection(db, "usuarios"), where("empresaId", "==", empresaId));
    const unsub = onSnapshot(
      qUsers,
      (snap) => setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => setErr(e?.message || "No pude cargar el equipo.")
    );
    return () => unsub();
  }, [empresaId]);

  async function crearUsuario(e) {
    e?.preventDefault?.();
    setErr(""); setMsg(""); setResetLink("");
    if (!isAdmin) return setErr("Solo el administrador puede invitar/crear usuarios.");
    if (!empresaId) return setErr("Falta empresaId en la sesión.");
    const em = String(email || "").trim().toLowerCase();
    const nm = String(nombre || "").trim();
    const rl = String(rol || "mensajero").toLowerCase();
    if (!em || !em.includes("@")) return setErr("Correo inválido.");
    if (!nm) return setErr("Nombre requerido.");
    if (!ROLES.includes(rl)) return setErr("Rol inválido.");

    try {
      setCreating(true);
      const res = await createUserFn({ email: em, nombre: nm, rol: rl });
      const data = res?.data || {};
      setMsg(`Usuario creado: ${nm} (${em}). UID: ${data.uid || "—"}`);
      if (data.resetLink) setResetLink(data.resetLink);
      setNombre(""); setEmail(""); setRol("mensajero");
    } catch (e) {
      setErr(e?.message || "No se pudo crear el usuario.");
      console.error(e);
    } finally {
      setCreating(false);
    }
  }

  async function cambiarRol(uid, nuevoRol) {
    setErr(""); setMsg("");
    if (!isAdmin) return alert("Solo el administrador puede cambiar roles.");
    try {
      await setUserRoleFn({ uid, rol: nuevoRol });
      setMsg("Rol actualizado.");
    } catch (e) {
      console.error(e);
      setErr(e?.message || "No pude actualizar el rol.");
    }
  }

  async function eliminarMiembro(u) {
    setErr(""); setMsg("");
    if (!isAdmin) return alert("Solo el administrador puede eliminar miembros.");
    if (!u) return;
    // evitar auto-borrado
    if (u.uid && usuario?.uid && u.uid === usuario.uid) {
      return alert("No puedes eliminar tu propio usuario.");
    }
    const rolActual = String(u.rol || "").toLowerCase();
    // evitar borrar el último admin
    const cAdmins = users.filter((x) => String(x.rol || "").toLowerCase() === "administrador").length;
    if (rolActual === "administrador" && cAdmins <= 1) {
      return alert("No puedes eliminar el último administrador del equipo.");
    }

    const ok = window.confirm(`¿Seguro que deseas eliminar a ${u.nombre || u.email || "este usuario"}?`);
    if (!ok) return;

    try {
      setDeletingId(u.id);
      await deleteUserFn({
        uid: u.uid || null,
        userDocId: u.id,
        empresaId,
        rol: rolActual,
      });
      setMsg("Miembro eliminado.");
    } catch (e) {
      console.error(e);
      setErr(e?.message || "No se pudo eliminar el usuario.");
    } finally {
      setDeletingId("");
    }
  }

  // Conteos por rol
  const cAdmins     = users.filter((u) => String(u.rol || "").toLowerCase() === "administrador").length;
  const cOperadores = users.filter((u) => String(u.rol || "").toLowerCase() === "operador").length;
  const cMensajeros = users.filter((u) => String(u.rol || "").toLowerCase() === "mensajero").length;
  const cTotal      = users.length;

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>👥 Equipo</h2>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, fontSize: 13 }}>
          <span>Admins: <b>{cAdmins}</b></span>
          <span>Operadores: <b>{cOperadores}</b></span>
          <span>Mensajeros: <b>{cMensajeros}</b></span>
          <span>Total: <b>{cTotal}</b></span>
        </div>
      </div>

      {err && <div style={{ color: "#b00", marginTop: 8 }}>{err}</div>}
      {msg && <div style={{ color: "#065f46", marginTop: 8 }}>{msg}</div>}
      {resetLink && (
        <div style={{ marginTop: 8, fontSize: 13 }}>
          🔗 Enlace de restablecimiento de contraseña (envíalo al usuario):
          <div style={{ wordBreak: "break-all" }}>
            <a href={resetLink} target="_blank" rel="noopener noreferrer">{resetLink}</a>
          </div>
        </div>
      )}

      {/* Form crear/invitar */}
      {isAdmin && (
        <form
          onSubmit={crearUsuario}
          style={{ marginTop: 12, padding: 12, border: "1px solid #dee2e8ff", borderRadius: 10, background: "#ede8e8ff" }}
        >
          <h3 style={{ marginTop: 0 }}>Invitar / crear usuario</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>Nombre</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Juan Pérez"
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>Correo</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@empresa.com"
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>Rol</label>
              <select
                value={rol}
                onChange={(e) => setRol(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #c6ccd9ff", borderRadius: 8 }}
              >
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <button
              type="submit"
              disabled={creating}
              style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #2563eb", background: "#182f78ff", color: "#ffffffff", cursor: "pointer" }}
            >
              {creating ? "Creando…" : "Crear usuario"}
            </button>
            <span style={{ marginLeft: 10, fontSize: 12, color: "#6b7280" }}>
              Al crear, se genera un enlace de “Reset Password” para que el usuario establezca su clave.
            </span>
          </div>
        </form>
      )}

      {/* Tabla equipo */}
      {!users.length && <div style={{ marginTop: 12 }}>No hay usuarios en tu empresa aún.</div>}
      {!!users.length && (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: "8px 6px" }}>Nombre</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: "8px 6px" }}>Correo</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: "8px 6px" }}>Rol</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: "8px 6px" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const rolActual = String(u.rol || "mensajero").toLowerCase();
              const soyYo = u.uid && usuario?.uid && u.uid === usuario.uid;
              const adminsCount = users.filter((x) => String(x.rol || "").toLowerCase() === "administrador").length;
              const bloquearEliminar = soyYo || (rolActual === "administrador" && adminsCount <= 1);

              return (
                <tr key={u.id}>
                  <td style={{ padding: "8px 6px" }}>{u.nombre || "—"}</td>
                  <td style={{ padding: "8px 6px" }}>{u.email || "—"}</td>
                  <td style={{ padding: "8px 6px" }}>{rolActual}</td>
                  <td style={{ padding: "8px 6px", display: "flex", gap: 8 }}>
                    {isAdmin && (
                      <>
                        <select
                          defaultValue={rolActual}
                          onChange={(e) => cambiarRol(u.id, e.target.value)}
                          disabled={soyYo}
                        >
                          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>

                        <button
                          type="button"
                          onClick={() => eliminarMiembro(u)}
                          disabled={deletingId === u.id || bloquearEliminar}
                          title={bloquearEliminar ? "No puedes eliminarte a ti mismo ni dejar la empresa sin administrador" : "Eliminar miembro"}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "1px solid #b91c1c",
                            background: bloquearEliminar ? "#ffffffff" : "#b91c1c",
                            color: bloquearEliminar ? "#22262eff" : "#ffffffff",
                            cursor: bloquearEliminar ? "not-allowed" : "pointer",
                          }}
                        >
                          {deletingId === u.id ? "Eliminando…" : "Eliminar"}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
