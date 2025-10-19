// src/shared/components/PlanBadge.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ensureUsuarioActivo } from "../utils/ensureUsuario";
import { getFunctions, httpsCallable } from "firebase/functions";

// CSS suave una sola vez
let cssOnce = false;
function injectCss() {
  if (cssOnce) return;
  cssOnce = true;
  const css = document.createElement("style");
  css.id = "planbadge-css";
  css.innerHTML = `
    .plan-badge {
      display:inline-flex; align-items:center; gap:6px;
      padding:6px 10px; border-radius:999px;
      border:1px solid #e5e7eb; background:#f8fafc; color:#374151;
      font-size:12px; font-weight:600; text-decoration:none;
    }
    .plan-badge:hover { background:#eef2ff; }
  `;
  document.head.appendChild(css);
}
injectCss();

export default function PlanBadge() {
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState(null); // texto a mostrar, o null para ocultar

  useEffect(() => {
    (async () => {
      try {
        const ok = await ensureUsuarioActivo();
        if (!ok) { setLoading(false); return; }

        const functions = getFunctions(); // usa la app por defecto
        const getMyPlan = httpsCallable(functions, "getMyPlan");
        const res = await getMyPlan({});
        if (!res?.data?.ok) { setLoading(false); return; }

        const { catalog, consumo, plan } = res.data || {};
        const name = catalog?.nombre || plan?.planId || "Plan";
        const limit = catalog?.limites?.ordersPerMonth ?? null;
        const used = Number(consumo?.ordenesCreadas || 0);

        const text = limit != null ? `${name} · ${used}/${limit}` : `${name}`;
        setLabel(text);
      } catch {
        // en errores, ocultamos el badge silenciosamente
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading || !label) return null;
  return (
    <Link to="/planes" className="plan-badge" title="Ver/actualizar plan">
      💳 {label}
    </Link>
  );
}
