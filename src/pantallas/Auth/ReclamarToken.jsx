// src/pantallas/Auth/ReclamarToken.jsx
import { useState } from "react";
import { db } from "../../firebaseConfig";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";

export default function ReclamarToken() {
  const [token, setToken] = useState("");
  const [inv, setInv] = useState(null);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [nombre, setNombre] = useState("");

  const buscarInvitacion = async () => {
    if (!token.trim()) return alert("Ingresa el token");
    const ref = doc(db, "invitaciones", token.trim());
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      alert("Token inválido o no encontrado");
      return;
    }
    setInv(snap.data());
    if (snap.data().email) setEmail(snap.data().email);
  };

  const completarRegistro = async (e) => {
    e.preventDefault();
    if (!inv) return alert("Busca un token válido primero");

    const auth = getAuth();
    let uid;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      uid = cred.user.uid;
    } catch {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      uid = cred.user.uid;
    }

    await setDoc(doc(db, "usuarios", uid), {
      empresaId: inv.empresaId,
      rol: inv.rol,
      nombre,
      email,
      createdAt: serverTimestamp(),
    }, { merge: true });

    localStorage.setItem("usuarioActivo", JSON.stringify({
      id: uid, uid, nombre, email, rol: inv.rol, empresaId: inv.empresaId
    }));

    alert("Cuenta vinculada correctamente ✅");
    window.location.href = inv.rol === "mensajero" ? "/entregas" : "/ordenes";
  };

  return (
    <div style={{ maxWidth: 480, margin: "30px auto" }}>
      <h2>Reclamar Token de Empresa</h2>

      {!inv && (
        <div style={{ display: "grid", gap: 10 }}>
          <input placeholder="Token" value={token} onChange={(e) => setToken(e.target.value)} />
          <button onClick={buscarInvitacion}>Buscar invitación</button>
        </div>
      )}

      {inv && (
        <>
          <p>Empresa ID: <code>{inv.empresaId}</code></p>
          <p>Rol asignado: <b>{inv.rol}</b></p>
          <form onSubmit={completarRegistro} style={{ display: "grid", gap: 10 }}>
            <input placeholder="Tu nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input placeholder="Contraseña" type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
            <button>Crear/Iniciar sesión y unirme</button>
          </form>
        </>
      )}
    </div>
  );
}
