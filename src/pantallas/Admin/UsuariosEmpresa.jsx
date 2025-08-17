// src/pantallas/Admin/UsuariosEmpresa.jsx
import { useMemo, useState, useEffect } from "react";
import { db } from "../../firebaseConfig";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { v4 as uuid } from "uuid";

function UsuariosEmpresa() {
  const usuario = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("usuarioActivo") || "null");
    } catch {
      return null;
    }
  }, []);

  const empresaId = usuario?.empresaId;
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState("operador");
  const [invitaciones, setInvitaciones] = useState([]);

  useEffect(() => {
    if (!empresaId) return;
    const ref = collection(db, "invitaciones");
    const q = query(ref, where("empresaId", "==", empresaId));
    const unsub = onSnapshot(q, (snap) => {
      setInvitaciones(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [empresaId]);

  const invitar = async () => {
    if (!email) return alert("Email requerido");
    const token = uuid();

    await addDoc(collection(db, "invitaciones"), {
      token,
      empresaId,
      email,
      rol,
      creadaPorUid: usuario?.id || usuario?.uid,
      createdAt: serverTimestamp(),
    });

    const url = `${window.location.origin}/aceptar-invitacion/${token}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {}
    alert("Invitación creada. URL copiada al portapapeles ✅");
    setEmail("");
  };

  if (!empresaId)
    return <div style={{ padding: 20 }}>Debes iniciar sesión como administrador.</div>;

  return (
    <div style={{ maxWidth: 640, margin: "30px auto" }}>
      <h2>Usuarios de la empresa</h2>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          placeholder="Email del invitado"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select value={rol} onChange={(e) => setRol(e.target.value)}>
          <option value="operador">Operador</option>
          <option value="mensajero">Mensajero</option>
        </select>
        <button onClick={invitar}>Invitar</button>
      </div>

      <h3 style={{ marginTop: 20 }}>Invitaciones</h3>
      <ul>
        {invitaciones.map((inv) => (
          <li key={inv.id}>
            {inv.email} — {inv.rol} — {inv.token?.slice(0, 8)}…
          </li>
        ))}
      </ul>
    </div>
  );
}

export default UsuariosEmpresa;
