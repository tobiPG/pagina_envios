// src/pantallas/Auth/RegistroAgente.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../../firebaseConfig";
import { setDoc, doc } from "firebase/firestore";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";

export default function RegistroAgente(){
  const [empresaId, setEmpresaId] = useState("");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e){
    e.preventDefault();
    setErr("");
    if (!empresaId.trim() || !nombre.trim() || !email.trim() || !pass) {
      setErr("Completa todos los campos.");
      return;
    }
    try {
      setSaving(true);
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
      await updateProfile(cred.user, { displayName: nombre.trim() });
      const uid = cred.user.uid;

      await setDoc(doc(db, "usuarios", uid), {
        uid,
        nombre: nombre.trim(),
        email: email.trim(),
        rol: "mensajero",      // 👈 siempre mensajero
        empresaId: empresaId.trim(),
        createdAt: new Date(),
      }, { merge: true });

      localStorage.setItem("usuarioActivo", JSON.stringify({
        uid, nombre: nombre.trim(), email: email.trim(), rol: "mensajero", empresaId: empresaId.trim()
      }));

      navigate("/entregas");
    } catch (e) {
      console.error(e);
      setErr(e?.message || "No pude registrar el agente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding:16, maxWidth:720, margin:"0 auto" }}>
      <h2>Registro de mensajero</h2>
      <form onSubmit={onSubmit} className="card" style={{ padding:16 }}>
        <label>Empresa ID</label>
        <input value={empresaId} onChange={e=>setEmpresaId(e.target.value)} />
        <label>Nombre</label>
        <input value={nombre} onChange={e=>setNombre(e.target.value)} />
        <label>Correo</label>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} />
        <label>Contraseña</label>
        <input type="password" value={pass} onChange={e=>setPass(e.target.value)} />
        {err && <div style={{ color:"#b00", marginTop:8 }}>{err}</div>}
        <button disabled={saving} style={{ marginTop:10 }}>{saving?"Creando…":"Crear cuenta"}</button>
      </form>
    </div>
  );
}
