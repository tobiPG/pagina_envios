// src/pantallas/Auth/AceptarInvitacion.jsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { db } from "../../firebaseConfig";
import {
  collection, query, where, getDocs, doc, getDoc, setDoc, serverTimestamp
} from "firebase/firestore";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword
} from "firebase/auth";

export default function AceptarInvitacion() {
  const { token } = useParams();
  const [inv, setInv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [nombre, setNombre] = useState("");

  // Cargar invitación por ID (token) o por campo token
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        // 1) intentamos doc con id = token
        const ref1 = doc(db, "invitaciones", token);
        const snap1 = await getDoc(ref1);
        if (snap1.exists()) {
          const data = { id: snap1.id, ...snap1.data() };
          if (!mounted) return;
          setInv(data);
          if (data?.email) setEmail(data.email);
          setLoading(false);
          return;
        }
        // 2) fallback: query por campo token
        const ref = collection(db, "invitaciones");
        const q = query(ref, where("token", "==", token));
        const snap = await getDocs(q);
        const data = snap.docs[0] ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null;
        if (!mounted) return;
        setInv(data);
        if (data?.email) setEmail(data.email);
      } catch (e) {
        if (!mounted) return;
        setErr("No pude cargar la invitación.");
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [token]);

  async function completar(e) {
    e.preventDefault();
    if (!inv) return alert("Invitación no válida o expirada.");
    if (!email || !pass || !nombre) return alert("Completa nombre, email y contraseña.");

    try {
      const auth = getAuth();
      let uid;
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        uid = cred.user.uid;
      } catch {
        const cred = await signInWithEmailAndPassword(auth, email, pass);
        uid = cred.user.uid;
      }

      // Crear/actualizar usuario de la empresa
      await setDoc(doc(db, "usuarios", uid), {
        empresaId: inv.empresaId,
        rol: (inv.rol || "").toLowerCase(),
        nombre,
        email,
        createdAt: serverTimestamp(),
      }, { merge: true });

      // Marcar invitación como aceptada
      await setDoc(doc(db, "invitaciones", inv.id), {
        status: "accepted",
        acceptedBy: uid,
        acceptedAt: serverTimestamp(),
      }, { merge: true });

      // Guardar sesión local simple (tu app ya la usa)
      localStorage.setItem("usuarioActivo", JSON.stringify({
        id: uid, uid, nombre, email, rol: (inv.rol || "").toLowerCase(), empresaId: inv.empresaId
      }));

      alert("Cuenta vinculada a la empresa ✅");
      const rol = (inv.rol || "").toLowerCase();
      window.location.href = rol === "mensajero" ? "/entregas" : "/ordenes";
    } catch (e) {
      console.error(e);
      alert("No se pudo completar el registro. Revisa los datos.");
    }
  }

  if (loading) return <div style={{ padding: 20 }}>Cargando invitación…</div>;
  if (!inv) return <div style={{ padding: 20, color: "#b00" }}>Invitación no encontrada o expirada.</div>;
  if (err) return <div style={{ padding: 20, color: "#b00" }}>{err}</div>;

  return (
    <div style={{ maxWidth: 480, margin: "30px auto" }}>
      <h2>Unirte a la empresa</h2>
      <p>Empresa ID: <code>{inv.empresaId}</code></p>
      <p>Rol: <b>{(inv.rol || "").toLowerCase()}</b></p>

      <form onSubmit={completar} style={{ display: "grid", gap: 10 }}>
        <input placeholder="Tu nombre" value={nombre} onChange={e => setNombre(e.target.value)} />
        <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input placeholder="Contraseña" type="password" value={pass} onChange={e => setPass(e.target.value)} />
        <button>Crear/Iniciar sesión y unirme</button>
      </form>
    </div>
  );
}
