// src/shared/hooks/usePlanGate.js
import { useEffect, useMemo, useState } from "react";
import { ensureUsuarioActivo } from "../utils/ensureUsuario";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";

export function usePlanGate() {
  const [state, setState] = useState({ loading: true, error: "", planName: "", limit: null, used: 0, blocked: false });

  // sesión
  const usuario = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("usuarioActivo") || "null"); } catch { return null; }
  }, []);
  const empresaId = usuario?.empresaId != null ? String(usuario.empresaId) : null;

  useEffect(() => {
    let alive = true;

    (async () => {
      setState(s => ({ ...s, loading: true, error: "" }));
      const ok = await ensureUsuarioActivo();
      if (!ok || !empresaId) {
        if (alive) setState(s => ({ ...s, loading: false, error: "No autenticado o sin empresaId" }));
        return;
      }

      // cache 30s para evitar spam de CF
      const cacheKey = `planGate:${empresaId}`;
      const cached = (() => {
        try { return JSON.parse(sessionStorage.getItem(cacheKey) || "null"); } catch { return null; }
      })();
      const now = Date.now();
      if (cached && (now - (cached.ts || 0) < 30_000)) {
        if (alive) setState({ loading: false, error: "", ...cached.data });
        return;
      }

      try {
        const region = import.meta.env.VITE_FUNCTIONS_REGION || "us-central1";
        const functions = getFunctions(undefined, region);
        if (import.meta.env.VITE_USE_EMULATORS === "true") {
          try { connectFunctionsEmulator(functions, "127.0.0.1", 5001); } catch {}
        }
        const getMyPlan = httpsCallable(functions, "getMyPlan");
        const res = await getMyPlan({});

        if (!res?.data?.ok) throw new Error("Respuesta inválida de getMyPlan");

        const cat = res.data.catalog || {};
        const consumo = res.data.consumo || {};
        const limit = Number(cat?.limites?.ordersPerMonth ?? NaN);
        const used = Number(consumo?.ordenesCreadas ?? 0);
        const parsed = {
          planName: cat?.nombre || res.data.plan?.planId || "—",
          limit: Number.isFinite(limit) ? limit : null,
          used: Number.isFinite(used) ? used : 0,
        };
        const blocked = parsed.limit != null && parsed.used >= parsed.limit;

        const dataOut = { ...parsed, blocked };
        sessionStorage.setItem(cacheKey, JSON.stringify({ ts: now, data: dataOut }));
        if (alive) setState({ loading: false, error: "", ...dataOut });
      } catch (e) {
        if (alive) setState(s => ({ ...s, loading: false, error: e?.message || "Error consultando plan" }));
      }
    })();

    return () => { alive = false; };
  }, [empresaId]);

  return state; // { loading, error, planName, limit, used, blocked }
}
