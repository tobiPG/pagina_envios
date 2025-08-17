// src/pantallas/Login.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebaseConfig"; // 👈 usa la misma instancia
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

function slugify(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function fbErrorMsg(e) {
  const code = e?.code || "";
  switch (code) {
    case "auth/invalid-email": return "Email inválido.";
    case "auth/missing-password": return "Falta la contraseña.";
    case "auth/weak-password": return "La contraseña debe tener al menos 6 caracteres.";
    case "auth/user-disabled": return "El usuario está deshabilitado.";
    case "auth/user-not-found": return "Usuario no encontrado.";
    case "auth/wrong-password": return "Contraseña incorrecta.";
    case "auth/invalid-credential": return "Credenciales inválidas.";
    case "auth/network-request-failed": return "Error de red. Revisa tu conexión.";
    case "auth/too-many-requests": return "Demasiados intentos. Intenta más tarde.";
    case "auth/operation-not-allowed": return "Habilita Email/Password en Firebase Authentication.";
    case "auth/invalid-api-key": return "API Key inválida en firebaseConfig.";
    default: return e?.message || "Error al iniciar sesión.";
  }
}

export default function Login() {
  const [empresaNombre, setEmpresaNombre] = useState("Gomez");
  const [nombre, setNombre] = useState("oziel");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [rol, setRol] = useState("administrador");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  async function iniciarSesion() {
    setError("");

    // Validaciones rápidas en UI
    if (!empresaNombre.trim()) return setError("Escribe el nombre de la empresa.");
    if (!nombre.trim()) return setError("Escribe tu nombre.");
    if (!email.trim()) return setError("Escribe un email.");
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) return setError("Email inválido.");
    if (!pass) return setError("Escribe una contraseña.");
    if (pass.length < 6) return setError("La contraseña debe tener al menos 6 caracteres.");

    setLoading(true);
    try {
      console.log("[LOGIN] projectId:", auth.app?.options?.projectId);
      await setPersistence(auth, browserLocalPersistence).catch(() => {});
      console.log("[LOGIN] Intentando login…", email);

      let uid = null;

      // 1) Intenta login. Si no existe, crea. Si existe con otra pass -> muestra error correcto.
      try {
        const cred = await signInWithEmailAndPassword(auth, email, pass);
        uid = cred.user.uid;
        console.log("[LOGIN] Sesión iniciada. uid:", uid);
      } catch (e1) {
        console.warn("[LOGIN] signIn error:", e1?.code, e1?.message);
        if (e1?.code === "auth/user-not-found") {
          console.log("[LOGIN] Usuario no existe, creando…");
          const cred = await createUserWithEmailAndPassword(auth, email, pass);
          uid = cred.user.uid;
          console.log("[LOGIN] Usuario creado. uid:", uid);
        } else {
          // wrong-password / invalid-credential / operation-not-allowed / etc.
          throw e1;
        }
      }

      // 2) Normaliza empresa y rol
      const empresaId = String(slugify(empresaNombre) || "empresa");
      const rolNorm = String(rol || "").toLowerCase();

      // 3) Crea/actualiza primero /usuarios/{uid}  (para que tus reglas de empresa funcionen)
      const refUsuario = doc(db, "usuarios", uid);
      const snapUsuario = await getDoc(refUsuario);
      if (!snapUsuario.exists()) {
        await setDoc(refUsuario, {
          uid,
          empresaId,
          rol: rolNorm,
          nombre,
          email,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        console.log("[LOGIN] Perfil creado en /usuarios.");
      } else {
        await setDoc(
          refUsuario,
          { empresaId, rol: rolNorm, nombre, email, updatedAt: serverTimestamp() },
          { merge: true }
        );
        console.log("[LOGIN] Perfil actualizado en /usuarios.");
      }

      // 4) Luego /empresas/{empresaId}
      const refEmpresa = doc(db, "empresas", empresaId);
      const snapEmpresa = await getDoc(refEmpresa);
      if (!snapEmpresa.exists()) {
        await setDoc(refEmpresa, {
          nombre: empresaNombre,
          plan: "basic",
          ownerUid: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        console.log("[LOGIN] Empresa creada en /empresas.");
      } else {
        await setDoc(refEmpresa, { updatedAt: serverTimestamp() }, { merge: true });
      }

      // 5) Sesión local
      const usuarioActivo = { id: uid, uid, nombre, email, rol: rolNorm, empresaId };
      localStorage.setItem("usuarioActivo", JSON.stringify(usuarioActivo));
      console.log("[LOGIN] usuarioActivo guardado:", usuarioActivo);

      // 6) Redirección
      switch (rolNorm) {
        case "administrador": navigate("/dashboard"); break;
        case "operador": navigate("/ordenes"); break;
        case "mensajero": navigate("/entregas"); break;
        default: navigate("/dashboard");
      }
    } catch (e) {
      console.error("[LOGIN] ERROR:", e?.code, e?.message);
      const msg = fbErrorMsg(e);
      setError(msg);
      alert(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 20, maxWidth: 480, margin: "0 auto" }}>
      <h1>Acceso</h1>

      <div style={{ display: "grid", gap: 10 }}>
        <label>
          Empresa
          <input
            type="text"
            placeholder="Nombre de la empresa"
            value={empresaNombre}
            onChange={(e) => setEmpresaNombre(e.target.value)}
          />
        </label>

        <label>
          Tu nombre
          <input
            type="text"
            placeholder="Tu nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </label>

        <label>
          Email
          <input
            type="email"
            placeholder="tucorreo@dominio.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label>
          Contraseña
          <input
            type="password"
            placeholder="•••••••• (mínimo 6)"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
        </label>

        <label>
          Rol
          <select value={rol} onChange={(e) => setRol(e.target.value)}>
            <option value="administrador">Administrador</option>
            <option value="operador">Operador</option>
            <option value="mensajero">Mensajero</option>
          </select>
        </label>

        {error && <div style={{ color: "#b00" }}>{error}</div>}

        <button onClick={iniciarSesion} disabled={loading}>
          {loading ? "Procesando..." : "Ingresar / Crear y vincular"}
        </button>
      </div>

      <p style={{ fontSize: 12, color: "#666", marginTop: 10 }}>
        Se vinculará tu usuario a la empresa <b>{empresaNombre || "—"}</b>.
      </p>
    </div>
  );
}
