// src/shared/hooks/usePlan.js
import { useEffect, useMemo, useState } from "react";
import { db } from "../services/firebase";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";

const PLAN_META = {
  free:    { name: "Free",    ordersPerMonth: 100,  retentionDays: 30,  price: 0 },
  starter: { name: "Starter", ordersPerMonth: 1000, retentionDays: 90,  price: 49 },
  pro:     { name: "Pro",     ordersPerMonth: 5000, retentionDays: 365, price: 149 },
};

export default function usePlan() {
  const [empresaId, setEmpresaId] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("usuarioActivo") || "null");
      setEmpresaId(u?.empresaId != null ? String(u.empresaId) : null);
    } catch { setEmpresaId(null); }
  }, []);

  useEffect(() => {
    if (!empresaId) return;
    setLoading(true);
    setErr("");
    const refEmp = doc(db, "empresas", empresaId);
    const refUsage = doc(db, "empresas", empresaId, "usage", "current");

    const unsubEmp = onSnapshot(refEmp, (snap) => {
      setEmpresa(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    }, (e) => setErr(e?.message || "No se pudo leer empresa"));

    const unsubUsage = onSnapshot(refUsage, (snap) => {
      setUsage(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setLoading(false);
    }, (e) => { setErr(e?.message || "No se pudo leer uso"); setLoading(false); });

    return () => { unsubEmp && unsubEmp(); unsubUsage && unsubUsage(); };
  }, [empresaId]);

  const planKey = (empresa?.plan || "free").toLowerCase();
  const defaults = PLAN_META[planKey] || PLAN_META.free;

  // overrides opcionales desde empresa
  const ordersPerMonth = empresa?.limitsOverride?.ordersPerMonth ?? defaults.ordersPerMonth;
  const retentionDays  = empresa?.retentionDaysOverride ?? defaults.retentionDays;

  const monthKey = usage?.monthKey || "";
  const used = Number(usage?.ordersCount || 0);
  const pct = Math.min(100, Math.round((used / (ordersPerMonth || 1)) * 100));

  const changePlan = async (newPlan) => {
    const k = String(newPlan || "").toLowerCase();
    if (!["free","starter","pro"].includes(k)) throw new Error("Plan inválido");
    if (!empresaId) throw new Error("Falta empresaId");

    // opcional: validar que el usuario sea admin
    let rol = "operador";
    try { rol = String(JSON.parse(localStorage.getItem("usuarioActivo")||"{}").rol||"").toLowerCase(); } catch {}
    const isAdmin = ["admin","administrador","administrator"].includes(rol);
    if (!isAdmin) throw new Error("Solo un administrador puede cambiar el plan");

    await setDoc(
      doc(db, "empresas", empresaId),
      { plan: k, planSince: serverTimestamp() },
      { merge: true }
    );
  };

  return {
    loading,
    error: err,
    empresaId,
    plan: planKey,
    planName: defaults.name,
    price: defaults.price,
    ordersPerMonth,
    retentionDays,
    monthKey,
    used,
    pct,
    changePlan,
    metaByPlan: PLAN_META
  };
}
