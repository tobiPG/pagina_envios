/**
 * Cloud Functions para proyecto "envios-realtime"
 * Región fija: us-central1
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

const { HttpsError } = require("firebase-functions/v1/https");
const REGION = "us-central1";

/* ───────── Helpers ───────── */

const isAdminRole = (rol) => {
  const r = String(rol || "").trim().toLowerCase();
  return r === "admin" || r === "administrador" || r === "administrator";
};
const normalizeRole = (r) => String(r || "").trim().toLowerCase();

function yyyymm(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
function toDate(x) {
  try {
    if (!x) return null;
    if (x.toDate) return x.toDate();
    if (x instanceof Date) return x;
    if (typeof x === "number") return new Date(x);
  } catch {}
  return null;
}
function planKey(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.planId ?? x.id ?? null;
}

/* ───────── Catálogo y límites (semilla) ─────────
   MOD: se agregan operadoresMax y administradoresMax
*/

const PLANES_SEMILLA = [
  // Básicos
  {
    id: "free",
    planId: "free",
    orden: 1,
    nombre: "Gratis",
    precioUSD: 0,
    mesesGratisAnual: 0,
    tier: "basic",
    limites: {
      ordersPerMonth: 30,
      mensajerosMax: 2,
      operadoresMax: 2,          // MOD
      administradoresMax: 1,     // MOD
      rutasConcurrentes: 1
    },
    features: ["2 mensajeros", "30 órdenes/mes", "Panel básico"]
  },
  {
    id: "basic",
    planId: "basic",
    orden: 2,
    nombre: "Básico",
    precioUSD: 19,
    mesesGratisAnual: 2,
    tier: "standard",
    limites: {
      ordersPerMonth: 200,
      mensajerosMax: 2,
      operadoresMax: 4,          // MOD
      administradoresMax: 2,     // MOD
      rutasConcurrentes: 4
    },
    features: ["2 mensajeros", "200 órdenes/mes", "4 operadores", "2 admins"]
  },
  {
    id: "pro",
    planId: "pro",
    orden: 3,
    nombre: "Pro",
    precioUSD: 49,
    mesesGratisAnual: 2,
    tier: "pro",
    limites: {
      ordersPerMonth: 1000,
      mensajerosMax: 5,
      operadoresMax: 10,         // MOD
      administradoresMax: 3,     // MOD
      rutasConcurrentes: 10
    },
    features: ["5 mensajeros", "1,000 órdenes/mes", "10 operadores", "Reportes"]
  },

  // Enterprise por flota
  {
    id: "emp-20",
    planId: "emp-20",
    orden: 6,
    nombre: "Empresa 20",
    precioUSD: 199,
    mesesGratisAnual: 2,
    tier: "enterprise",
    limites: {
      ordersPerMonth: 10000,
      mensajerosMax: 20,
      operadoresMax: 20,         // MOD
      administradoresMax: 4,     // MOD
      rutasConcurrentes: 20
    },
    features: ["20 mensajeros", "10,000 órdenes/mes", "SLA Plata", "Soporte prioritario"]
  },
  {
    id: "emp-40",
    planId: "emp-40",
    orden: 8,
    nombre: "Empresa 40",
    precioUSD: 349,
    mesesGratisAnual: 2,
    tier: "enterprise",
    limites: {
      ordersPerMonth: 22000,
      mensajerosMax: 40,
      operadoresMax: 40,         // MOD
      administradoresMax: 6,     // MOD
      rutasConcurrentes: 40
    },
    features: ["40 mensajeros", "22,000 órdenes/mes", "SLA Oro", "Webhooks/Integraciones"]
  },
  {
    id: "emp-60",
    planId: "emp-60",
    orden: 9,
    nombre: "Empresa 60",
    precioUSD: 499,
    mesesGratisAnual: 2,
    tier: "enterprise",
    limites: {
      ordersPerMonth: 35000,
      mensajerosMax: 60,
      operadoresMax: 60,         // MOD
      administradoresMax: 8,     // MOD
      rutasConcurrentes: 60
    },
    features: ["60 mensajeros", "35,000 órdenes/mes", "SLA Oro", "Webhooks"]
  },
  {
    id: "emp-unlimited",
    planId: "emp-unlimited",
    orden: 12,
    nombre: "Enterprise Unlimited",
    precioUSD: 1999,
    mesesGratisAnual: 2,
    tier: "enterprise",
    limites: {
      ordersPerMonth: -1,
      mensajerosMax: -1,         // ilimitado
      operadoresMax: -1,         // ilimitado
      administradoresMax: -1,    // ilimitado
      rutasConcurrentes: -1      // FUP
    },
    features: ["Mensajeros ilimitados", "Órdenes ilimitadas (FUP)", "SLA Platino", "Gestor técnico dedicado"]
  }
];

// Fallback si la empresa aún no tiene limits grabados (para órdenes/mes)
const DEFAULT_LIMITS = {
  free: 30,
  basic: 200,
  pro: 1000,
  "emp-20": 10000,
  "emp-40": 22000,
  "emp-60": 35000,
  "emp-unlimited": -1 // -1 = ilimitado
};

/* ───────── Ping ───────── */
exports.ping = functions.region(REGION).https.onCall(async () => {
  return { ok: true, t: Date.now() };
});

/* ───────── Asegurar catálogo ───────── */
exports.ensurePlansCatalog = functions.region(REGION).https.onCall(async (data, context) => {
  if (!context.auth?.uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

  const col = db.collection("planesCatalogo");
  const batch = db.batch();
  for (const p of PLANES_SEMILLA) {
    batch.set(
      col.doc(p.id),
      {
        nombre: p.nombre,
        orden: p.orden,
        precioUSD: p.precioUSD,
        mesesGratisAnual: p.mesesGratisAnual,
        tier: p.tier,
        limites: p.limites,
        features: p.features
      },
      { merge: true }
    );
  }
  await batch.commit();
  return { ok: true, seeded: PLANES_SEMILLA.length };
});

/* ───────── Elegir plan ───────── */
exports.choosePlan = functions.region(REGION).https.onCall(async (data, context) => {
  if (!context.auth?.uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  const uid = context.auth.uid;

  const planId = planKey(data);
  const billingCycle = String(data?.billingCycle || "mensual"); // "mensual" | "anual"
  if (!planId) throw new HttpsError("invalid-argument", "planId requerido.");

  const catSnap = await db.doc(`planesCatalogo/${planId}`).get();
  if (!catSnap.exists) throw new HttpsError("not-found", "Plan no existe.");
  const cat = catSnap.data();

  const usnap = await db.doc(`usuarios/${uid}`).get();
  if (!usnap.exists) throw new HttpsError("failed-precondition", "Usuario no registrado.");
  const u = usnap.data() || {};
  const empresaId = String(u.empresaId || "");
  if (!empresaId) throw new HttpsError("failed-precondition", "Falta empresaId.");
  if (!isAdminRole(u.rol)) throw new HttpsError("permission-denied", "Solo el admin puede cambiar plan.");

  const now = admin.firestore.Timestamp.now();
  const nextRenewalAt = (() => {
    const d = now.toDate();
    if (billingCycle === "anual") d.setUTCFullYear(d.getUTCFullYear() + 1);
    else d.setUTCMonth(d.getUTCMonth() + 1);
    return admin.firestore.Timestamp.fromDate(d);
  })();

  const empRef = db.doc(`empresas/${empresaId}`);
  const compatRef = empRef.collection("config").doc("plan");
  await db.runTransaction(async (tx) => {
    const empSnap = await tx.get(empRef);
    const existed = empSnap.exists;
    const prev = existed ? (empSnap.data() || {}) : {};

    tx.set(
      empRef,
      {
        plan: planId,
        limits: cat.limites || {},
        planInfo: {
          billingCycle,
          precioUSD: cat.precioUSD || 0,
          mesesGratisAnual: cat.mesesGratisAnual || 0,
          tier: cat.tier || "standard",
          activatedAt: now,
          nextRenewalAt
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    const currentUsageUsers = existed ? (prev.usageUsers || {}) : {};
    const needsInit =
      typeof currentUsageUsers.mensajeros !== "number" ||
      typeof currentUsageUsers.operadores !== "number" ||
      typeof currentUsageUsers.administradores !== "number";

    if (needsInit) {
      tx.set(
        empRef,
        {
          usageUsers: {
            mensajeros: Number(currentUsageUsers.mensajeros || 0),
            operadores: Number(currentUsageUsers.operadores || 0),
            administradores: Number(currentUsageUsers.administradores || 0)
          }
        },
        { merge: true }
      );
    }

    tx.set(compatRef, { planId, updatedAt: now }, { merge: true });
  });

  return { ok: true, planId, billingCycle };
});

/* ───────── Obtener plan + catálogo + consumo ───────── */
exports.getMyPlan = functions.region(REGION).https.onCall(async (data, context) => {
  if (!context.auth?.uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  const uid = context.auth.uid;

  const usnap = await db.doc(`usuarios/${uid}`).get();
  if (!usnap.exists) throw new HttpsError("failed-precondition", "Usuario no registrado.");
  const u = usnap.data() || {};
  const empresaId = String(u.empresaId || "");
  if (!empresaId) throw new HttpsError("failed-precondition", "Falta empresaId.");

  const empSnap = await db.doc(`empresas/${empresaId}`).get();
  const emp = empSnap.exists ? empSnap.data() : {};
  let planId = String(emp.plan || "");
  if (!planId) {
    const compat = await db.doc(`empresas/${empresaId}/config/plan`).get();
    planId = compat.exists ? String(compat.data()?.planId || "") : "";
  }
  if (!planId) planId = "free";

  const catSnap = await db.doc(`planesCatalogo/${planId}`).get();
  const catalog = catSnap.exists ? catSnap.data() : null;

  const mk = yyyymm(new Date());
  const usageRef = db.doc(`empresas/${empresaId}/usage/${mk}`);
  const usageSnap = await usageRef.get();

  let ordenesCreadas = 0;
  if (usageSnap.exists) {
    ordenesCreadas = Number(usageSnap.data()?.ordersCount || 0);
  } else {
    const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1, 0, 0, 0, 0));
    const tsStart = admin.firestore.Timestamp.fromDate(start);
    try {
      const q = await db
        .collection("ordenes")
        .where("empresaId", "==", empresaId)
        .where("createdAt", ">=", tsStart)
        .get();
      ordenesCreadas = q.size;
    } catch (e) {
      const all = await db.collection("ordenes").where("empresaId", "==", empresaId).get();
      ordenesCreadas = all.docs.filter((d) => {
        const dt = toDate(d.get("createdAt"));
        return dt && dt >= start;
      }).length;
    }
  }

  return {
    ok: true,
    plan: { planId, billingCycle: emp?.planInfo?.billingCycle || "mensual" },
    catalog,
    consumo: { yyyymm: mk, ordenesCreadas }
  };
});

/* ───────── Crear orden (respeta límites de órdenes/mes) ───────── */
exports.createOrder = functions.region(REGION).https.onCall(async (data, context) => {
  if (!context.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  const uid = context.auth.uid;

  const userSnap = await db.doc(`usuarios/${uid}`).get();
  if (!userSnap.exists) throw new HttpsError("failed-precondition", "Perfil no encontrado.");
  const user = userSnap.data() || {};
  const empresaId = String(user.empresaId || "");
  if (!empresaId) throw new HttpsError("failed-precondition", "Usuario sin empresa.");

  const empRef = db.doc(`empresas/${empresaId}`);
  const empSnap = await empRef.get();
  const emp = empSnap.exists ? empSnap.data() : {};
  const plan = String(emp.plan || "free").toLowerCase();

  let ordersPerMonth =
    (emp.limits && typeof emp.limits.ordersPerMonth === "number" ? emp.limits.ordersPerMonth : null);
  if (ordersPerMonth == null) ordersPerMonth = DEFAULT_LIMITS[plan] ?? DEFAULT_LIMITS.free;

  const mk = yyyymm(new Date());
  const usageRef = empRef.collection("usage").doc(mk);

  try {
    const result = await db.runTransaction(async (tx) => {
      const uSnap = await tx.get(usageRef);
      const currentCount = uSnap.exists ? (uSnap.data().ordersCount || 0) : 0;

      if (ordersPerMonth >= 0 && currentCount >= ordersPerMonth) {
        throw new Error("LIMIT_REACHED");
      }

      const p = (typeof data === "object" && data) ? data : {};
      const numberOrNull = (v) => (v === "" || v == null ? null : Number(v));
      const strOrNull = (v) => (v === undefined || v === null || v === "" ? null : String(v));
      const now = admin.firestore.FieldValue.serverTimestamp();

      const orderDoc = {
        empresaId,
        createdAt: now,
        createdByUid: uid,
        createdByNombre: user.nombre || user.usuario || null,

        cliente: p.cliente ?? "",
        telefono: p.telefono ?? "",
        numeroFactura: p.numeroFactura ?? "",
        monto: numberOrNull(p.monto),

        fecha: strOrNull(p.fecha),
        hora: strOrNull(p.hora),

        address: p.address || null,
        destinoLat: p.destinoLat ?? p?.address?.lat ?? null,
        destinoLng: p.destinoLng ?? p?.address?.lng ?? null,
        direccionTexto: p.direccionTexto ?? p?.address?.formatted ?? null,

        prioridad: p.prioridad ?? 3,
        ventanaInicioStop: strOrNull(p.ventanaInicioStop),
        ventanaFinStop: strOrNull(p.ventanaFinStop),

        recibida: !!p.recibida || false,
        entregado: false,

        asignadoUid: p.asignadoUid ?? null,
        asignadoNombre: p.asignadoNombre ?? null,
        asignadoAt: p.asignadoUid ? now : null,

        countedInUsage: true
      };

      const ordRef = db.collection("ordenes").doc();
      tx.set(ordRef, orderDoc);

      const newCount = currentCount + 1;
      tx.set(
        usageRef,
        { monthKey: mk, ordersCount: newCount, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );

      const cambios = Object.keys(orderDoc)
        .filter((k) => k !== "createdAt")
        .map((k) => ({ campo: k, antes: null, despues: orderDoc[k] }));
      const logRef = db.collection("cambiosOrden").doc();
      tx.set(logRef, {
        empresaId,
        orderId: ordRef.id,
        actorUid: uid,
        actorNombre: user.nombre || user.usuario || null,
        actorRol: (user.rol || "").toLowerCase(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        motivo: "Creación de orden (createOrder)",
        cambios
      });

      return { orderId: ordRef.id };
    });

    return { ok: true, id: result.orderId };
  } catch (e) {
    if (e && e.message === "LIMIT_REACHED") {
      throw new HttpsError("resource-exhausted", `Límite mensual alcanzado (${ordersPerMonth} órdenes).`);
    }
    console.error("createOrder failed:", e);
    throw new HttpsError("internal", "Fallo al crear la orden");
  }
});

/* ───────── Trigger de rescate (creaciones por fuera) ───────── */
exports.onOrderCreate = functions
  .region(REGION)
  .firestore.document("ordenes/{id}")
  .onCreate(async (snap) => {
    const data = snap.data() || {};
    const empresaId = String(data.empresaId || "");
    if (!empresaId) return null;
    if (data.countedInUsage === true) return null;

    const empRef = db.doc(`empresas/${empresaId}`);
    const empSnap = await empRef.get();
    const emp = empSnap.exists ? empSnap.data() : {};
    const plan = String(emp.plan || "free").toLowerCase();

    let ordersPerMonth =
      (emp.limits && typeof emp.limits.ordersPerMonth === "number" ? emp.limits.ordersPerMonth : null);
    if (ordersPerMonth == null) ordersPerMonth = DEFAULT_LIMITS[plan] ?? DEFAULT_LIMITS.free;

    const mk = yyyymm(new Date());
    const usageRef = empRef.collection("usage").doc(mk);

    await db.runTransaction(async (tx) => {
      const uSnap = await tx.get(usageRef);
      const currentCount = uSnap.exists ? (uSnap.data().ordersCount || 0) : 0;
      const newCount = currentCount + 1;

      tx.set(
        usageRef,
        { monthKey: mk, ordersCount: newCount, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );

      if (ordersPerMonth >= 0 && newCount > ordersPerMonth) {
        tx.update(snap.ref, { bloqueadaPorLimite: true });
      }
    });

    return null;
  });

/* ───────── Admin: crear usuario con límites por rol (TRANSACCIÓN) ─────────
   MOD: ahora acepta "gerente" y lo cuenta dentro de operadores
*/
const ALLOWED_ROLES = new Set(["mensajero", "operador", "gerente", "administrador"]);

function randomPassword(len = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

exports.adminCreateUser = functions.region(REGION).https.onCall(async (data, context) => {
  if (!context.auth?.uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

  const callerSnap = await db.doc(`usuarios/${context.auth.uid}`).get();
  if (!callerSnap.exists) throw new HttpsError("failed-precondition", "Perfil no encontrado.");
  const caller = callerSnap.data() || {};
  if (!isAdminRole(caller.rol)) throw new HttpsError("permission-denied", "Solo el administrador puede crear usuarios.");
  const empresaId = String(caller.empresaId || "");
  if (!empresaId) throw new HttpsError("failed-precondition", "Falta empresaId.");

  const email = String(data?.email || "").trim().toLowerCase();
  const nombre = String(data?.nombre || "").trim();
  const rolRaw = normalizeRole(data?.rol || "mensajero");
  if (!email || !email.includes("@")) throw new HttpsError("invalid-argument", "Correo inválido.");
  if (!nombre) throw new HttpsError("invalid-argument", "Nombre requerido.");
  if (!ALLOWED_ROLES.has(rolRaw)) throw new HttpsError("invalid-argument", "Rol inválido.");

  // Mapear "gerente" al bucket de operadores
  const roleKey =
    rolRaw === "mensajero" ? "mensajeros" :
    (rolRaw === "operador" || rolRaw === "gerente") ? "operadores" :
    "administradores";

  const empRef = db.doc(`empresas/${empresaId}`);

  // 1) Reserva de cupo en txn
  const reserva = await db.runTransaction(async (tx) => {
    const empSnap = await tx.get(empRef);
    if (!empSnap.exists) throw new HttpsError("failed-precondition", "Empresa no encontrada.");

    const emp = empSnap.data() || {};
    const limits = emp.limits || {};
    const usageUsers = emp.usageUsers || {};

    function parseMax(n) {
      if (typeof n === "number") return n;
      return 0; // faltante = 0 (bloquea)
    }

    const maxPorRol =
      roleKey === "mensajeros"   ? parseMax(limits.mensajerosMax)
    : roleKey === "operadores"   ? parseMax(limits.operadoresMax)
    :                              parseMax(limits.administradoresMax);

    const usado = Number(usageUsers[roleKey] || 0);

    if (maxPorRol >= 0 && usado >= maxPorRol) {
      throw new HttpsError("failed-precondition", `Cupo agotado para ${roleKey}. Límite: ${maxPorRol}`);
    }

    tx.set(
      empRef,
      {
        usageUsers: { [roleKey]: usado + 1 },
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    // Asegurar otros contadores existan
    const ensure = {};
    if (typeof usageUsers.mensajeros !== "number") ensure["usageUsers.mensajeros"] = roleKey === "mensajeros" ? usado + 1 : 0;
    if (typeof usageUsers.operadores !== "number") ensure["usageUsers.operadores"] = roleKey === "operadores" ? usado + 1 : 0;
    if (typeof usageUsers.administradores !== "number") ensure["usageUsers.administradores"] = roleKey === "administradores" ? usado + 1 : 0;
    if (Object.keys(ensure).length > 0) tx.set(empRef, ensure, { merge: true });

    return { antes: usado, despues: usado + 1, max: maxPorRol };
  });

  // 2) Crear/ubicar usuario en Auth + doc /usuarios
  let userRecord;
  try {
    try {
      userRecord = await admin.auth().getUserByEmail(email);
      const existingDoc = await db.doc(`usuarios/${userRecord.uid}`).get();
      if (existingDoc.exists) {
        const ex = existingDoc.data() || {};
        if (ex.empresaId && ex.empresaId !== empresaId) {
          throw new HttpsError("already-exists", "La cuenta ya pertenece a otra empresa.");
        }
      }
    } catch (e) {
      if (e?.code === "auth/user-not-found") {
        userRecord = await admin.auth().createUser({
          email,
          displayName: nombre,
          password: randomPassword(14),
          emailVerified: false,
          disabled: false
        });
      } else if (e instanceof HttpsError) {
        throw e;
      } else {
        throw new HttpsError("internal", e?.message || "No se pudo verificar/crear el usuario.");
      }
    }

    await admin.auth().setCustomUserClaims(userRecord.uid, { rol: rolRaw, empresaId });

    await db.doc(`usuarios/${userRecord.uid}`).set(
      {
        id: userRecord.uid,
        uid: userRecord.uid,
        email,
        nombre,
        rol: rolRaw,
        empresaId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    let resetLink = "";
    try {
      resetLink = await admin.auth().generatePasswordResetLink(email);
    } catch (_) {}

    return { ok: true, uid: userRecord.uid, resetLink, reserva };
  } catch (e) {
    // 3) Reversa de cupo si falla
    await db.runTransaction(async (tx) => {
      const empSnap = await tx.get(empRef);
      if (!empSnap.exists) return;
      const emp = empSnap.data() || {};
      const usageUsers = emp.usageUsers || {};
      const usado = Number(usageUsers[roleKey] || 0);
      if (usado > 0) {
        tx.set(
          empRef,
          {
            usageUsers: { [roleKey]: usado - 1 },
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          },
          { merge: true }
        );
      }
    });

    if (e instanceof HttpsError) throw e;
    throw new HttpsError("internal", e?.message || "No se pudo crear el usuario.");
  }
});

/* ───────── Cambiar rol (sin tocar cupos) ─────────
   Acepta "gerente", asigna claims y doc/usuarios
*/
exports.adminSetUserRole = functions.region(REGION).https.onCall(async (data, context) => {
  if (!context.auth?.uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

  const callerSnap = await db.doc(`usuarios/${context.auth.uid}`).get();
  if (!callerSnap.exists) throw new HttpsError("failed-precondition", "Perfil no encontrado.");
  const caller = callerSnap.data() || {};
  if (!isAdminRole(caller.rol)) throw new HttpsError("permission-denied", "Solo el administrador puede cambiar roles.");
  const empresaId = String(caller.empresaId || "");
  if (!empresaId) throw new HttpsError("failed-precondition", "Falta empresaId.");

  const uid = String(data?.uid || "");
  const rolRaw = normalizeRole(data?.rol || "");
  if (!uid) throw new HttpsError("invalid-argument", "uid requerido.");
  if (!ALLOWED_ROLES.has(rolRaw)) throw new HttpsError("invalid-argument", "Rol inválido.");

  const targetSnap = await db.doc(`usuarios/${uid}`).get();
  if (!targetSnap.exists) throw new HttpsError("not-found", "Usuario destino no existe.");
  const target = targetSnap.data() || {};
  if (String(target.empresaId || "") !== empresaId) {
    throw new HttpsError("permission-denied", "Solo puedes modificar usuarios de tu empresa.");
  }

  await db.doc(`usuarios/${uid}`).set(
    {
      rol: rolRaw,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  await admin.auth().setCustomUserClaims(uid, { rol: rolRaw, empresaId });

  return { ok: true };
});

/* ───────── Eliminar usuario (DEVUELVE CUPO) ─────────
   "gerente" descuenta de operadores
*/
exports.adminDeleteUser = functions.region(REGION).https.onCall(async (data, context) => {
  if (!context.auth?.uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

  const callerSnap = await db.doc(`usuarios/${context.auth.uid}`).get();
  if (!callerSnap.exists) throw new HttpsError("failed-precondition", "Perfil no encontrado.");
  const caller = callerSnap.data() || {};
  if (!isAdminRole(caller.rol)) throw new HttpsError("permission-denied", "Solo el administrador puede eliminar usuarios.");
  const empresaId = String(caller.empresaId || "");
  if (!empresaId) throw new HttpsError("failed-precondition", "Falta empresaId.");

  const uid = String(data?.uid || "");
  if (!uid) throw new HttpsError("invalid-argument", "uid requerido.");

  const userRef = db.doc(`usuarios/${uid}`);
  const empRef = db.doc(`empresas/${empresaId}`);

  await db.runTransaction(async (tx) => {
    const uSnap = await tx.get(userRef);
    if (!uSnap.exists) return;
    const u = uSnap.data() || {};
    if (String(u.empresaId || "") !== empresaId) {
      throw new HttpsError("permission-denied", "No pertenece a tu empresa.");
    }

    const r = normalizeRole(u.rol);
    const roleKey =
      r === "mensajero" ? "mensajeros" :
      (r === "operador" || r === "gerente") ? "operadores" :
      "administradores";

    const empSnap = await tx.get(empRef);
    if (empSnap.exists) {
      const usageUsers = empSnap.data()?.usageUsers || {};
      const usado = Number(usageUsers[roleKey] || 0);
      tx.set(
        empRef,
        {
          usageUsers: { [roleKey]: Math.max(0, usado - 1) },
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }

    tx.delete(userRef);
  });

  try {
    await admin.auth().deleteUser(uid);
  } catch (_) {}

  return { ok: true };
});

/* ───────── Recontar contadores por rol (utilidad) ─────────
   Cuenta "gerente" como operadores
*/
exports.recountUsersUsage = functions.region(REGION).https.onCall(async (data, context) => {
  if (!context.auth?.uid) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  const empresaId = String(data?.empresaId || "").trim();
  if (!empresaId) throw new HttpsError("invalid-argument", "empresaId requerido.");

  const snap = await db.collection("usuarios").where("empresaId", "==", empresaId).get();
  let mensajeros = 0, operadores = 0, administradores = 0;
  snap.forEach(doc => {
    const r = normalizeRole(doc.data()?.rol);
    if (r === "mensajero") mensajeros++;
    else if (r === "operador" || r === "gerente") operadores++;
    else if (r === "administrador") administradores++;
  });

  await db.doc(`empresas/${empresaId}`).set(
    {
      usageUsers: { mensajeros, operadores, administradores },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  return { ok: true, usageUsers: { mensajeros, operadores, administradores } };
});
