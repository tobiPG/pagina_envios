// src/pantallas/Auth/RegistroEmpresa.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { db, auth } from "../../../shared/services/firebase.js";
import { collection, doc, setDoc } from "firebase/firestore";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";

const cssId = "registro-empresa-css";
if (!document.getElementById(cssId)) {
  const css = document.createElement("style");
  css.id = cssId;
  css.innerHTML = `
  .card{border:1px solid #e5e7eb;border-radius:12px;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.04);padding:16px}
  .row{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr))}
  label{font-size:12px;color:#475569;font-weight:600}
  input{width:100%;padding:10px;border-radius:10px;border:1px solid #e5e7eb}
  .btn{background:#111;color:#fff;border:none;padding:10px 14px;border-radius:10px;cursor:pointer}
  .err{color:#b91c1c}
  `;
  document.head.appendChild(css);
}

export default function RegistroEmpresa(){
  const [sp] = useSearchParams();
  const planId = sp.get("plan") || "free";
  const periodo = (sp.get("periodo") === "anual") ? "anual" : "mensual";

  const navigate = useNavigate();
  const [empresa, setEmpresa] = useState("");
  const [adminNombre, setAdminNombre] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e){
    e.preventDefault();
    setErr("");
    if (!empresa.trim() || !adminNombre.trim() || !email.trim() || !pass) {
      setErr("Completa todos los campos.");
      return;
    }
    try {
      setSaving(true);
      // 1) Crear auth user
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
      const uid = cred.user.uid;
      await updateProfile(cred.user, { displayName: adminNombre.trim() });

      // 2) Crear empresa (ID generado)
      const empresaRef = doc(collection(db, "empresas"));
      const empresaId = empresaRef.id;

      // 3) usuarios/{uid}
      await setDoc(doc(db, "usuarios", uid), {
        uid,
        nombre: adminNombre.trim(),
        email: email.trim(),
        rol: "administrador",
        empresaId,
        createdAt: new Date(),
      }, { merge: true });

      // 4) empresas/{empresaId}
      await setDoc(empresaRef, {
        nombre: empresa.trim(),
        empresaId,
        ownerUid: uid,
        createdAt: new Date(),
      }, { merge: true });

      // 5) plan en empresas/{empresaId}/config/plan
      await setDoc(doc(db, "empresas", empresaId, "config", "plan"), {
        planId,
        periodo, // "mensual" | "anual"
        updatedAt: new Date(),
      }, { merge: true });

      // 6) cache de sesión mínima (como usas en otras pantallas)
      localStorage.setItem("usuarioActivo", JSON.stringify({
        uid, nombre: adminNombre.trim(), email: email.trim(), rol: "administrador", empresaId
      }));

      navigate("/dashboard");
    } catch (e) {
      console.error(e);
      setErr(e?.message || "No pude registrar la empresa.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding:16, maxWidth:720, margin:"0 auto" }}>
      <h2 style={{ marginTop:0 }}>Crear cuenta de empresa</h2>
      <div className="card" style={{ marginTop:10 }}>
        <div className="pill" style={{ display:"inline-block", padding:"6px 10px", border:"1px solid #e5e7eb", borderRadius:999 }}>
          Plan elegido: <b>{planId}</b> · <b>{periodo}</b>
        </div>
        <form onSubmit={onSubmit} style={{ marginTop:12 }}>
          <div className="row">
            <div>
              <label>Nombre de la empresa</label>
              <input value={empresa} onChange={e=>setEmpresa(e.target.value)} />
            </div>
            <div>
              <label>Tu nombre (administrador)</label>
              <input value={adminNombre} onChange={e=>setAdminNombre(e.target.value)} />
            </div>
            <div>
              <label>Correo</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} />
            </div>
            <div>
              <label>Contraseña</label>
              <input type="password" value={pass} onChange={e=>setPass(e.target.value)} />
            </div>
          </div>
          {err && <div className="err" style={{ marginTop:8 }}>{err}</div>}
          <div style={{ marginTop:12, display:"flex", gap:8 }}>
            <button className="btn" disabled={saving}>{saving ? "Creando…" : "Crear empresa"}</button>
            <Link to="/planes-publicos" className="btn" style={{ background:"#fff", color:"#111", border:"1px solid #e5e7eb" }}>Volver a planes</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
