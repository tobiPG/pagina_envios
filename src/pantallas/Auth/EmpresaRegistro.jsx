// src/pantallas/Auth/EmpresaRegistro.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../../firebaseConfig";
import {
  addDoc,
  collection,
  serverTimestamp,
  setDoc,
  doc,
} from "firebase/firestore";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";

export default function EmpresaRegistro() {
  const nav = useNavigate();
  const auth = getAuth();

  const [empresaNombre, setEmpresaNombre] = useState("");
  const [plan, setPlan] = useState("basico"); // "basico" | "pro" | "enterprise"
  const [adminNombre, setAdminNombre] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");

    const _empresaNombre = empresaNombre.trim();
    const _adminNombre = adminNombre.trim();
    const _email = email.trim().toLowerCase();
    const _pass = pass; // no trim a contraseñas
    const _plan = (plan || "basico").toLowerCase();

    if (!_empresaNombre || !_adminNombre || !_email || !_pass) {
      setErr("Completa todos los campos.");
      return;
    }

    setLoading(true);
    try {
      // 1) Crear usuario (Auth)
      const cred = await createUserWithEmailAndPassword(auth, _email, _pass);
      const uid = cred.user.uid;

      // 2) Crear empresa (ID autogenerado)
      const empresaRef = await addDoc(collection(db, "empresas"), {
        nombre: _empresaNombre,
        plan: _plan,
        ownerUid: uid,
        createdAt: serverTimestamp(),
      });
      const empresaId = empresaRef.id;

      // 3) Crear perfil de usuario (admin)
      await setDoc(doc(db, "usuarios", uid), {
        nombre: _adminNombre,
        email: _email,                 // 👈 CONSISTENTE con el resto de la app
        rol: "administrador",
        empresaId,                     // 👈 clave para las reglas
        createdAt: serverTimestamp(),
      }, { merge: true });

      // 4) Sesión local
      localStorage.setItem("usuarioActivo", JSON.stringify({
        id: uid,
        uid,
        nombre: _adminNombre,
        email: _email,
        rol: "administrador",
        empresaId,
      }));

      alert("¡Empresa y usuario creados! 🎉");
      nav("/dashboard");
    } catch (e) {
      console.error("Registro empresa:", e);
      // Mensajes más claros
      const msg =
        e?.code === "auth/email-already-in-use" ? "Ese correo ya está en uso." :
        e?.code === "auth/invalid-email" ? "Correo inválido." :
        e?.code === "auth/weak-password" ? "La contraseña es muy débil." :
        e?.message || "No pude registrar.";
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: "20px auto", padding: 16 }}>
      <h2>Crear empresa y usuario administrador</h2>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
        <label>
          Nombre de la empresa
          <input
            type="text"
            value={empresaNombre}
            onChange={e => setEmpresaNombre(e.target.value)}
            placeholder="Mi Empresa SRL"
          />
        </label>

        <label>
          Plan
          <select value={plan} onChange={e => setPlan(e.target.value)}>
            <option value="basico">Básico</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </label>

        <label>
          Tu nombre (administrador)
          <input
            type="text"
            value={adminNombre}
            onChange={e => setAdminNombre(e.target.value)}
            placeholder="Juan Pérez"
          />
        </label>

        <label>
          Correo (login)
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="admin@empresa.com"
          />
        </label>

        <label>
          Contraseña
          <input
            type="password"
            value={pass}
            onChange={e => setPass(e.target.value)}
            placeholder="********"
          />
        </label>

        {err && <div style={{ color: "#b00" }}>{err}</div>}

        <button type="submit" disabled={loading}>
          {loading ? "Creando..." : "Crear empresa y admin"}
        </button>
      </form>
    </div>
  );
}
