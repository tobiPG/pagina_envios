// src/pantallas/ProgramarEntregas.jsx 
import { useEffect, useMemo, useState } from "react";
import { db } from "../firebaseConfig";
import {
  collection,
  onSnapshot,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  where,
  query,
  orderBy,
} from "firebase/firestore";
import AddressInput from "../components/AddressInput.jsx";
import { ensureUsuarioActivo } from "../utils/ensureUsuario";
import { logCambioOrden } from "../utils/logCambios";

/** ───────── Helpers genéricos ───────── */
const tidyNum = (v) => {
  const n = typeof v === "number" ? v : v != null ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const hasLatLng = (x) =>
  Number.isFinite(tidyNum(x?.lat)) && Number.isFinite(tidyNum(x?.lng));
const kmBetween = (a, b) => {
  const lat1 = tidyNum(a?.lat),
    lon1 = tidyNum(a?.lng),
    lat2 = tidyNum(b?.lat),
    lon2 = tidyNum(b?.lng);
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2)
  )
    return 0;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const s1 =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(s1), Math.sqrt(1 - s1));
  return R * c;
};
const wazeUrl = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng)
    ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
    : null;
const gmapsUrl = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng)
    ? `https://www.google.com/maps?q=${lat},${lng}`
    : null;

function todayISO(d = new Date()) {
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  return dd.toISOString().slice(0, 10);
}

function normalizeRole(raw) {
  return String(raw || "").trim().toLowerCase();
}
function normalizeStr(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
const ROLES_MENSAJERO = new Set([
  "mensajero",
  "mensajeros",
  "rider",
  "riders",
  "courier",
  "delivery",
  "deliveryman",
  "repartidor",
  "repartidores",
  "conductor",
  "driver",
]);

/** ───────── Componente ───────── */
export default function ProgramarEntregas() {
  // ===== Sesión
  const usuario = useMemo(() => {
    try {
      const raw = localStorage.getItem("usuarioActivo");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);
  const rol = normalizeRole(usuario?.rol || usuario?.role);

  // Helpers de rol (NUEVO)
  const isAdmin = ["administrador", "admin", "administrator"].includes(rol);
  const isOperador = ["operador", "operator"].includes(rol);
  const isGerente = rol === "gerente";

  const empresaId = usuario?.empresaId ? String(usuario.empresaId) : null;
  const empresaIdNum = Number.isFinite(Number(empresaId)) ? Number(empresaId) : null;
  const actorId =
    usuario?.id || usuario?.uid || usuario?.userId || usuario?.usuarioId || null;
  const actorNombre = usuario?.nombre || usuario?.usuario || "desconocido";
  const actorEmail = usuario?.email || null; // NUEVO: email del operador

  // ===== Estado de Programación (Ruta)
  const [nombreRuta, setNombreRuta] = useState("");
  const [fecha, setFecha] = useState(todayISO());
  const [ventanaInicio, setVentanaInicio] = useState("08:00");
  const [ventanaFin, setVentanaFin] = useState("18:00");
  const [slaObjetivoMin, setSlaObjetivoMin] = useState(120);
  const [zona, setZona] = useState("");
  const [tipoServicio, setTipoServicio] = useState("programado"); // same_day | next_day | programado
  const [notasRuta, setNotasRuta] = useState("");

  // Vehículo y Conductor
  const [camionNombre, setCamionNombre] = useState("");
  const [capacidadKg, setCapacidadKg] = useState(null);
  const [capacidadM3, setCapacidadM3] = useState(null);
  const [capacidadUnidades, setCapacidadUnidades] = useState(null);
  const [restriccionesVehiculo, setRestriccionesVehiculo] = useState("");
  const [equipMontacargas, setEquipMontacargas] = useState(false);
  const [equipRefrigerado, setEquipRefrigerado] = useState(false);
  const [equipLona, setEquipLona] = useState(false);
  const [equipHandTruck, setEquipHandTruck] = useState(false);

  // 👇 Mensajeros (solo los REGISTRADOS)
  const [mensajeros, setMensajeros] = useState([]); // [{uid, nombre, rol}]
  const [conductorUid, setConductorUid] = useState("");
  const [conductorNombre, setConductorNombre] = useState("");
  const [conductorEstado, setConductorEstado] = useState("desconocido"); // en vivo
  const [estadoConductorRequerido, setEstadoConductorRequerido] =
    useState("disponible"); // UI enum
  const [errorMensajeros, setErrorMensajeros] = useState("");

  // Config
  const [maxStops, setMaxStops] = useState(60);

  // Bandeja (órdenes disponibles)
  const [ordenes, setOrdenes] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Filtros bandeja
  const [filtroSinAsignar, setFiltroSinAsignar] = useState(true);
  const [filtroConGeoloc, setFiltroConGeoloc] = useState(false);
  const [filtroConVentana, setFiltroConVentana] = useState(false);
  const [filtroZona, setFiltroZona] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [refBusqueda, setRefBusqueda] = useState("");

  // Crear orden rápida
  const [showCrearOrden, setShowCrearOrden] = useState(false);
  const [oCliente, setOCliente] = useState("");
  const [oTelefono, setOTelefono] = useState("");
  const [oFactura, setOFactura] = useState("");
  const [oFecha, setOFecha] = useState(todayISO());
  const [oHora, setOHora] = useState("09:00");
  const [oZona, setOZona] = useState("");
  const [oAddress, setOAddress] = useState(null);
  const [oPesoKg, setOPesoKg] = useState(null);
  const [oVolumenM3, setOVolumenM3] = useState(null);
  const [oUnidades, setOUnidades] = useState(null);

  // Paradas seleccionadas (stops)
  const [stops, setStops] = useState([]);

  // Programaciones guardadas / filtros de programadas
  const [programaciones, setProgramaciones] = useState([]); // de /programasEntrega
  const [statusProg, setStatusProg] = useState("todas"); // todas | draft | published
  const [fechaProg, setFechaProg] = useState(todayISO());
  const [soloProgramadas, setSoloProgramadas] = useState(false);
  const [programacionIdFiltro, setProgramacionIdFiltro] = useState("");

  /** ───────── SUSCRIPCIÓN: Mensajeros registrados ───────── */
  useEffect(() => {
    if (!empresaId) return;
    let unsubs = [];
    let mounted = true;

    const mergeUniqueByUid = (arr) => {
      const map = new Map();
      for (const it of arr) {
        if (!it?.uid) continue;
        map.set(it.uid, it);
      }
      return Array.from(map.values());
    };

    const byUsuariosSnapshotHandler = (snap, acc = []) => {
      const list = snap.docs
        .map((d) => {
          const u = d.data() || {};
          const roleRaw = u.rol ?? u.role ?? u.perfil ?? u.tipo ?? "";
          const r = normalizeRole(roleRaw);
          if (!ROLES_MENSAJERO.has(r)) return null;
          return {
            uid: d.id,
            nombre: u.nombre || u.usuario || u.email || d.id,
            rol: r,
          };
        })
        .filter(Boolean);
      return acc.concat(list);
    };

    const subscribe = async () => {
      setErrorMensajeros("");

      try {
        const refU1 = collection(db, "usuarios");
        const qU1 = query(refU1, where("empresaId", "==", empresaId));
        const unsub1 = onSnapshot(
          qU1,
          (snap) => {
            if (!mounted) return;
            const merged = mergeUniqueByUid(byUsuariosSnapshotHandler(snap));
            if (merged.length) {
              setMensajeros(merged.sort((a, b) => a.nombre.localeCompare(b.nombre)));
              if (!conductorUid && merged.length) {
                setConductorUid(merged[0].uid);
                setConductorNombre(merged[0].nombre);
              }
            }
          },
          (err) => {
            console.error("onSnapshot(usuarios, empresaId:string):", err?.message);
          }
        );
        unsubs.push(unsub1);
      } catch (e) {
        console.error("usuarios(string) error:", e?.message);
      }

      if (Number.isFinite(empresaIdNum)) {
        try {
          const refU2 = collection(db, "usuarios");
          const qU2 = query(refU2, where("empresaId", "==", empresaIdNum));
          const unsub2 = onSnapshot(
            qU2,
            (snap) => {
              if (!mounted) return;
              const extra = byUsuariosSnapshotHandler(snap);
              if (extra.length) {
                setMensajeros((prev) =>
                  mergeUniqueByUid(prev.concat(extra)).sort((a, b) =>
                    a.nombre.localeCompare(b.nombre)
                  )
                );
                if (!conductorUid && extra.length) {
                  setConductorUid(extra[0].uid);
                  setConductorNombre(extra[0].nombre);
                }
              }
            },
            (err) => {
              console.error("onSnapshot(usuarios, empresaId:number):", err?.message);
            }
          );
          unsubs.push(unsub2);
        } catch (e) {
          console.error("usuarios(number) error:", e?.message);
        }
      }

      try {
        const refUb1 = collection(db, "ubicacionesMensajeros");
        const qUb1 = query(refUb1, where("empresaId", "==", empresaId));
        const unsubUb1 = onSnapshot(
          qUb1,
          (snap) => {
            if (!mounted) return;
            const arr = snap.docs.map((d) => {
              const u = d.data() || {};
              return {
                uid: d.id,
                nombre: u.nombre || d.id,
                rol: "mensajero",
              };
            });
            if (arr.length) {
              setMensajeros((prev) =>
                mergeUniqueByUid(prev.concat(arr)).sort((a, b) =>
                  a.nombre.localeCompare(b.nombre)
                )
              );
              if (!conductorUid && arr.length) {
                setConductorUid(arr[0].uid);
                setConductorNombre(arr[0].nombre);
              }
            }
          },
          (err) => {
            console.error("onSnapshot(ubicacionesMensajeros, empresaId:string):", err?.message);
          }
        );
        unsubs.push(unsubUb1);
      } catch (e) {
        console.error("ubicacionesMensajeros(string) error:", e?.message);
      }

      if (Number.isFinite(empresaIdNum)) {
        try {
          const refUb2 = collection(db, "ubicacionesMensajeros");
          const qUb2 = query(refUb2, where("empresaId", "==", empresaIdNum));
          const unsubUb2 = onSnapshot(
            qUb2,
            (snap) => {
              if (!mounted) return;
              const arr = snap.docs.map((d) => {
                const u = d.data() || {};
                return { uid: d.id, nombre: u.nombre || d.id, rol: "mensajero" };
              });
              if (arr.length) {
                setMensajeros((prev) =>
                  mergeUniqueByUid(prev.concat(arr)).sort((a, b) =>
                    a.nombre.localeCompare(b.nombre)
                  )
                );
                if (!conductorUid && arr.length) {
                  setConductorUid(arr[0].uid);
                  setConductorNombre(arr[0].nombre);
                }
              }
            },
            (err) => {
              console.error("onSnapshot(ubicacionesMensajeros, empresaId:number):", err?.message);
            }
          );
          unsubs.push(unsubUb2);
        } catch (e) {
          console.error("ubicacionesMensajeros(number) error:", e?.message);
        }
      }
    };

    subscribe();

    return () => {
      mounted = false;
      unsubs.forEach((u) => u && u());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  // Validar que el conductor seleccionado exista en la lista de mensajeros
  const conductorEsValido = useMemo(() => {
    if (!conductorUid) return false;
    return mensajeros.some((m) => m.uid === conductorUid);
  }, [conductorUid, mensajeros]);

  // Si el usuario escribe un nombre a mano, intenta resolverlo a un UID existente
  useEffect(() => {
    if (!conductorNombre || conductorEsValido) return;
    const name = normalizeStr(conductorNombre);
    const match = mensajeros.find((m) => normalizeStr(m.nombre) === name);
    if (match) {
      setConductorUid(match.uid);
      setConductorNombre(match.nombre);
      setErrorMensajeros("");
    } else {
      setErrorMensajeros(
        "El mensajero debe seleccionarse de los registrados. Usa el selector o escribe exactamente como aparece."
      );
    }
  }, [conductorNombre, conductorEsValido, mensajeros]);

  // ===== Estado EN VIVO del conductor seleccionado (ubicacionesMensajeros/{uid})
  useEffect(() => {
    if (!empresaId || !conductorUid) {
      setConductorEstado("desconocido");
      return;
    }
    const ref = doc(db, "ubicacionesMensajeros", conductorUid);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data();
      if (!data) {
        setConductorEstado("desconocido");
        return;
      }
      if (String(data.empresaId || "") !== String(empresaId)) {
        setConductorEstado("otra_empresa");
        return;
      }
      setConductorEstado(String(data.estado || "desconocido").toLowerCase());
    });
    return () => unsub();
  }, [empresaId, conductorUid]);

  // ===== Suscripción de órdenes (bandeja)
  useEffect(() => {
    if (!empresaId) return;
    let unsub = null;
    (async () => {
      setLoading(true);
      setError("");
      const ok = await ensureUsuarioActivo();
      if (!ok) {
        setError("Sesión inválida.");
        setLoading(false);
        return;
      }
      try {
        const ref = collection(db, "ordenes");
        const q1 = query(
          ref,
          where("empresaId", "==", empresaId),
          orderBy("createdAt", "desc")
        );
        unsub = onSnapshot(
          q1,
          (snap) => {
            const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setOrdenes(arr);
            setLoading(false);
          },
          (err) => {
            console.error("onSnapshot(ordenes programar):", err?.code, err?.message);
            setError(err?.message || "No se pudieron leer órdenes.");
            setLoading(false);
          }
        );
      } catch (e) {
        console.error("query(ordenes) programar error:", e);
        setError(e?.message || "No se pudo iniciar la suscripción.");
        setLoading(false);
      }
    })();
  }, [empresaId]);

  // ===== Suscripción de programaciones
  useEffect(() => {
    if (!empresaId) return;
    let unsub = null;
    (async () => {
      try {
        const ref = collection(db, "programasEntrega");
        const q1 = query(ref, where("empresaId", "==", empresaId), orderBy("createdAt", "desc"));
        unsub = onSnapshot(
          q1,
          (snap) => {
            const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setProgramaciones(arr);
          },
          (err) => console.error("onSnapshot(programasEntrega):", err?.message)
        );
      } catch (e) {
        console.error("query(programasEntrega) error:", e);
      }
    })();
    return () => unsub && unsub();
  }, [empresaId]);

  // ===== Bandeja filtrada
  const ordenesFiltradas = useMemo(() => {
    let base = [...ordenes];

    if (filtroSinAsignar) base = base.filter((o) => !o.asignadoUid);
    if (filtroConGeoloc)
      base = base.filter((o) =>
        hasLatLng({
          lat: o.destinoLat ?? o?.address?.lat,
          lng: o.destinoLng ?? o?.address?.lng,
        })
      );
    if (filtroConVentana)
      base = base.filter((o) => !!o.ventanaInicioStop || !!o.ventanaFinStop);

    if (filtroZona.trim()) {
      const f = filtroZona.trim().toLowerCase();
      base = base.filter((o) => String(o.zona || "").toLowerCase().includes(f));
    }

    const q = busqueda.trim().toLowerCase();
    if (q) {
      base = base.filter((o) => {
        const blob = [
          o.cliente,
          o.telefono,
          o.numeroFactura,
          o.direccionTexto,
          o.address?.formatted,
        ]
          .map((v) => String(v || "").toLowerCase())
          .join(" | ");
        return blob.includes(q);
      });
    }

    const rq = refBusqueda.trim().toLowerCase();
    if (rq) {
      base = base.filter((o) =>
        String(o.referencia || "").toLowerCase().includes(rq)
      );
    }

    // 🔎 Filtros de "solo programadas" / por programa
    if (soloProgramadas) base = base.filter((o) => !!o.programacionId || o?.esProgramada === true || o?.tipoEntrega === "programada");
    if (programacionIdFiltro) base = base.filter((o) => o.programacionId === programacionIdFiltro);

    return base;
  }, [
    ordenes,
    filtroSinAsignar,
    filtroConGeoloc,
    filtroConVentana,
    filtroZona,
    busqueda,
    refBusqueda,
    soloProgramadas,
    programacionIdFiltro,
  ]);

  // ===== Agregar / quitar / actualizar stops
  function yaEstaAgregada(orderId) {
    return stops.some((s) => s.orderId === orderId);
  }

  function addOrdenComoStop(o) {
    if (yaEstaAgregada(o.id)) {
      alert("Esa orden ya está en la ruta.");
      return;
    }
    const lat =
      tidyNum(o.destinoLat) ?? tidyNum(o?.address?.lat) ?? tidyNum(o?.destino?.lat);
    const lng =
      tidyNum(o.destinoLng) ?? tidyNum(o?.address?.lng) ?? tidyNum(o?.destino?.lng);
    const nuevo = {
      orderId: o.id,
      cliente: o.cliente || "",
      direccionTexto: o.direccionTexto || o.address?.formatted || "",
      lat,
      lng,
      tipo: "solo_entrega",
      pesoKg: tidyNum(o.pesoKg),
      volumenM3: tidyNum(o.volumenM3),
      unidades: tidyNum(o.unidades),
      prioridad: 3,
      ventanaInicioStop: "",
      ventanaFinStop: "",
      tiempoServicioMin: 10,
      contactoRecepcion: "",
      telefonoRecepcion: "",
      fragil: false,
      apilable: true,
      valorDeclarado: null,
      seguroMonto: null,
      documentosRef: "",
      notas: "",
      ordenIndex: stops.length,
      otpEntrega: null,
      firmaDigitalUrl: null,
      fotosPodUrls: [],
      causalFalla: null,
      comentariosCliente: null,
    };
    setStops((arr) => [...arr, nuevo]);
  }

  function removeStop(idx) {
    const arr = [...stops];
    arr.splice(idx, 1);
    for (let i = 0; i < arr.length; i++) arr[i].ordenIndex = i;
    setStops(arr);
  }

  function moveStop(idx, dir) {
    const arr = [...stops];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= arr.length) return;
    const [item] = arr.splice(idx, 1);
    arr.splice(newIdx, 0, item);
    for (let i = 0; i < arr.length; i++) arr[i].ordenIndex = i;
    setStops(arr);
  }

  function updateStop(idx, patch) {
    setStops((arr) => arr.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  // ===== Crear orden rápida (y agregarla a stops)
  async function crearOrdenRapidaYAgregar() {
    if (!empresaId) return alert("Falta empresaId en sesión.");
    if (!oCliente || !oFactura || !oFecha || !oHora || !oAddress) {
      return alert("Completa cliente, factura, fecha, hora y dirección.");
    }
    if (!hasLatLng(oAddress)) return alert("La dirección debe tener lat/lng.");

    const lat = tidyNum(oAddress.lat);
    const lng = tidyNum(oAddress.lng);

    const nueva = {
      empresaId,
      cliente: oCliente,
      telefono: oTelefono || null,
      numeroFactura: oFactura,
      fecha: oFecha,
      hora: oHora,
      zona: oZona || null,
      address: { ...oAddress, lat, lng },
      destinoLat: lat,
      destinoLng: lng,
      direccionTexto: oAddress.formatted || "",
      pesoKg: tidyNum(oPesoKg),
      volumenM3: tidyNum(oVolumenM3),
      unidades: tidyNum(oUnidades),
      entregado: false,
      recibida: false,
      fechaRecibida: null,
      fechaEntregada: null,
      tiempoTotalEntrega: null,
      asignadoUid: null,
      asignadoNombre: null,
      createdAt: serverTimestamp(),

      // 👇 Compatibilidad histórica
      usuario: actorNombre,
      rolUsuario: rol,

      // 👇 NUEVO: datos del operador/creador
      creadoPorUid: actorId || null,
      creadoPorNombre: actorNombre || null,
      creadoPorRol: rol || null,
      creadoPorEmail: actorEmail || null,
    };

    try {
      const ref = await addDoc(collection(db, "ordenes"), nueva);
      addOrdenComoStop({ id: ref.id, ...nueva });
      setOCliente("");
      setOTelefono("");
      setOFactura("");
      setOFecha(todayISO());
      setOHora("09:00");
      setOZona("");
      setOAddress(null);
      setOPesoKg(null);
      setOVolumenM3(null);
      setOUnidades(null);
      setShowCrearOrden(false);
      alert("Orden creada y agregada a la ruta ✅");
    } catch (e) {
      console.error("crearOrdenRapida:", e);
      alert(e?.message || "No pude crear la orden.");
    }
  }

  // ===== Cálculos de capacidad y ETA
  const totales = useMemo(() => {
    let kg = 0,
      m3 = 0,
      unid = 0;
    for (const s of stops) {
      kg += tidyNum(s.pesoKg) || 0;
      m3 += tidyNum(s.volumenM3) || 0;
      unid += tidyNum(s.unidades) || 0;
    }
    const pctKg =
      Number.isFinite(capacidadKg) && capacidadKg > 0 ? (kg / capacidadKg) * 100 : null;
    const pctM3 =
      Number.isFinite(capacidadM3) && capacidadM3 > 0 ? (m3 / capacidadM3) * 100 : null;
    const pctUn =
      Number.isFinite(capacidadUnidades) && capacidadUnidades > 0
        ? (unid / capacidadUnidades) * 100
        : null;

    const vKmMin = 0.5;
    let kmTotal = 0;
    let minTransito = 0;
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1];
      const b = stops[i];
      const kms = kmBetween(a, b);
      kmTotal += kms;
      minTransito += kms / vKmMin;
    }
    const minServicio = stops.reduce(
      (acc, s) => acc + (tidyNum(s.tiempoServicioMin) || 0),
      0
    );
    const minTotales = minTransito + minServicio;

    const etaPorStop = [];
    try {
      const start = new Date(`${fecha}T${ventanaInicio}:00`);
      let cursorMin = 0;
      for (let i = 0; i < stops.length; i++) {
        if (i > 0) {
          const kms = kmBetween(stops[i - 1], stops[i]);
          cursorMin += kms / vKmMin;
        }
        const eta = new Date(start.getTime() + cursorMin * 60000);
        etaPorStop.push(eta);
        cursorMin += tidyNum(stops[i].tiempoServicioMin) || 0;
      }
    } catch {}

    const paradasHora = minTotales > 0 ? stops.length / (minTotales / 60) : null;

    return {
      kg,
      m3,
      unid,
      pctKg,
      pctM3,
      pctUn,
      kmTotal,
      minTransito,
      minServicio,
      minTotales,
      etaPorStop,
      paradasHora,
    };
  }, [
    stops,
    capacidadKg,
    capacidadM3,
    capacidadUnidades,
    fecha,
    ventanaInicio,
  ]);

  // ===== Validaciones
  function validarAntesDePublicar() {
    const errs = [];

    if (!empresaId) errs.push("Falta empresaId en sesión.");
    if (!nombreRuta) errs.push("Falta nombre de la ruta.");
    if (!fecha) errs.push("Falta fecha.");
    if (!ventanaInicio || !ventanaFin)
      errs.push("Falta ventana de la ruta (inicio/fin).");

    // 🚧 NUEVO: El conductor debe ser uno de los registrados (selector)
    if (!conductorUid || !conductorNombre) {
      errs.push("Selecciona un mensajero registrado (UID y nombre).");
    } else if (!conductorEsValido) {
      errs.push("El mensajero debe existir en la lista de registrados.");
    }

    if (stops.length === 0) errs.push("Agrega al menos una parada (stop).");
    if (stops.length > Number(maxStops || 60))
      errs.push(`Excede MaxStops (${maxStops}).`);

    if (Number.isFinite(capacidadKg) && capacidadKg > 0 && totales.kg > capacidadKg) {
      errs.push("Excede capacidad en KG.");
    }
    if (
      Number.isFinite(capacidadM3) &&
      capacidadM3 > 0 &&
      totales.m3 > capacidadM3
    ) {
      errs.push("Excede capacidad en m³.");
    }
    if (
      Number.isFinite(capacidadUnidades) &&
      capacidadUnidades > 0 &&
      totales.unid > capacidadUnidades
    ) {
      errs.push("Excede capacidad en UNIDADES.");
    }

    const vRutaIni = ventanaInicio;
    const vRutaFin = ventanaFin;
    for (const s of stops) {
      if (!Number.isFinite(tidyNum(s.lat)) || !Number.isFinite(tidyNum(s.lng))) {
        errs.push("Todos los stops deben tener lat/lng.");
        break;
      }
      if (s.ventanaInicioStop && s.ventanaFinStop) {
        if (s.ventanaInicioStop < vRutaIni || s.ventanaFinStop > vRutaFin) {
          errs.push(
            `Ventana de un stop fuera de la ventana de ruta (${s.cliente || s.orderId}).`
          );
          break;
        }
      }
    }

    if (
      estadoConductorRequerido === "disponible" &&
      !["disponible", "listo_para_ruta"].includes(conductorEstado)
    ) {
      errs.push("El mensajero seleccionado no está disponible.");
    }

    return errs;
  }

  // ===== Guardar borrador / Publicar
  async function guardarProgramacion(status = "draft") {
    if (!empresaId) return alert("Falta empresaId en sesión.");

    // Bloqueo por rol: gerente NO puede publicar (NUEVO)
    if (status === "published" && isGerente) {
      alert("Tu rol (gerente) es de solo lectura para publicar programaciones. Pide a un administrador u operador que publique.");
      return;
    }

    const body = {
      empresaId,
      status, // "draft" | "published"
      nombreRuta,
      fecha,
      ventanaInicio,
      ventanaFin,
      slaObjetivoMin: tidyNum(slaObjetivoMin),
      zona: zona || null,
      notasRuta: notasRuta || null,
      tipoServicio,
      camionNombre: camionNombre || null,
      capacidadKg: tidyNum(capacidadKg),
      capacidadM3: tidyNum(capacidadM3),
      capacidadUnidades: tidyNum(capacidadUnidades),
      restriccionesVehiculo: restriccionesVehiculo || null,
      equipamiento: {
        montacargas: !!equipMontacargas,
        refrigerado: !!equipRefrigerado,
        lona: !!equipLona,
        handTruck: !!equipHandTruck,
      },
      conductorUid: conductorUid || null,
      conductorNombre: conductorNombre || null,
      estadoConductorRequerido,
      maxStops: Number(maxStops || 60),
      titulo: nombreRuta ? `Entrega programada · ${nombreRuta} · ${fecha}` : `Entrega programada · ${fecha}`,
      kpiPre: {
        totalStops: stops.length,
        totalKg: totales.kg,
        totalM3: totales.m3,
        totalUnidades: totales.unid,
        pctKg: totales.pctKg,
        pctM3: totales.pctM3,
        pctUn: totales.pctUn,
        kmTotal: totales.kmTotal,
        minTransito: totales.minTransito,
        minServicio: totales.minServicio,
        minTotales: totales.minTotales,
        paradasHora: totales.paradasHora ?? null,
      },
      stops: stops.map((s) => ({
        orderId: s.orderId,
        cliente: s.cliente || null,
        direccionTexto: s.direccionTexto || null,
        lat: tidyNum(s.lat),
        lng: tidyNum(s.lng),
        tipo: s.tipo || "solo_entrega",
        pesoKg: tidyNum(s.pesoKg),
        volumenM3: tidyNum(s.volumenM3),
        unidades: tidyNum(s.unidades),
        prioridad: Number(s.prioridad || 3),
        ventanaInicioStop: s.ventanaInicioStop || null,
        ventanaFinStop: s.ventanaFinStop || null,
        tiempoServicioMin: tidyNum(s.tiempoServicioMin),
        contactoRecepcion: s.contactoRecepcion || null,
        telefonoRecepcion: s.telefonoRecepcion || null,
        fragil: !!s.fragil,
        apilable: !!s.apilable,
        valorDeclarado: tidyNum(s.valorDeclarado),
        seguroMonto: tidyNum(s.seguroMonto),
        documentosRef: s.documentosRef || null,
        notas: s.notas || null,
        ordenIndex: Number(s.ordenIndex || 0),
        otpEntrega: s.otpEntrega || null,
        firmaDigitalUrl: s.firmaDigitalUrl || null,
        fotosPodUrls: Array.isArray(s.fotosPodUrls) ? s.fotosPodUrls : [],
        causalFalla: s.causalFalla || null,
        comentariosCliente: s.comentariosCliente || null,
      })),
      createdAt: serverTimestamp(),
      createdByUid: actorId || null,
      createdByNombre: actorNombre || null,
      // 👇 NUEVO
      createdByRol: rol || null,
      createdByEmail: actorEmail || null,
      publishedAt: status === "published" ? serverTimestamp() : null,
    };

    try {
      const ref = await addDoc(collection(db, "programasEntrega"), body);

      if (status === "published") {
        // 🔴 Importante: mantener el bucle con índice para guardar la SECUENCIA (1..N)
        for (let i = 0; i < stops.length; i++) {
          const s = stops[i];
          const patch = {
            programacionId: ref.id,
            programaEntregaId: ref.id,
            ordenIndex: Number(s.ordenIndex || 0),
            // Metadatos claros para el mensajero
            esProgramada: true,
            tipoEntrega: "programada",
            programacionTitulo: body.titulo || `${nombreRuta || ref.id} · ${fecha}`,
            programacionFecha: fecha,
            programacionStatus: "published",
            programacionOrden: i + 1, // 1..N
            programacionTotal: stops.length,
            programacionPrioridad: Number(s.prioridad || 3),
            ventanaInicioStop: s.ventanaInicioStop || null,
            ventanaFinStop: s.ventanaFinStop || null,
            asignadoUid: conductorUid || null,
            asignadoNombre: conductorNombre || null,
            asignadoAt: serverTimestamp(),
            // Resumen listo para UI del mensajero
            programadaResumen: {
              etiqueta: "Entrega programada",
              titulo: nombreRuta || ref.id,
              fecha,
              orden: i + 1,
              total: stops.length,
              prioridad: Number(s.prioridad || 3),
              ventana: {
                inicio: s.ventanaInicioStop || null,
                fin: s.ventanaFinStop || null,
              },
            },
            // Quién asigna
            asignadoPorUid: actorId || null,
            asignadoPorNombre: actorNombre || null,
            asignadoPorRol: rol || null,
            asignadoPorEmail: actorEmail || null,
          };
          await updateDoc(doc(db, "ordenes", s.orderId), patch);
          await logCambioOrden({
            orderId: s.orderId,
            empresaId,
            antes: null,
            despues: patch,
            actor: {
              id: actorId || null,
              nombre: actorNombre || "desconocido",
              rol,
              empresaId,
            },
            motivo: "Asignada por Programación (planificado)",
          });
        }

        if (conductorUid) {
          await setDoc(
            doc(db, "ubicacionesMensajeros", conductorUid),
            {
              empresaId,
              nombre: conductorNombre || conductorUid,
              estado: "listo_para_ruta",
              estadoUpdatedAt: serverTimestamp(),
              lastPingAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      }

      alert(
        status === "published"
          ? "Programación publicada y órdenes asignadas ✅"
          : "Borrador guardado ✅"
      );
    } catch (e) {
      console.error("guardarProgramacion:", e);
      alert(e?.message || "No pude guardar la programación.");
    }
  }

  // ===== Export CSV
  function exportCSV(filename, rows) {
    if (!rows?.length) return;
    const cols = Object.keys(rows[0]);
    const csv = [
      cols.join(","),
      ...rows.map((r) =>
        cols
          .map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`)
          .join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportarHojaRutaCSV() {
    const rows = stops.map((s, i) => ({
      ordenIndex: i,
      orderId: s.orderId,
      cliente: s.cliente || "",
      direccion: s.direccionTexto || "",
      lat: tidyNum(s.lat),
      lng: tidyNum(s.lng),
      tipo: s.tipo,
      prioridad: s.prioridad,
      pesoKg: tidyNum(s.pesoKg) || "",
      volumenM3: tidyNum(s.volumenM3) || "",
      unidades: tidyNum(s.unidades) || "",
      ventanaInicioStop: s.ventanaInicioStop || "",
      ventanaFinStop: s.ventanaFinStop || "",
      tiempoServicioMin: tidyNum(s.tiempoServicioMin) || "",
      contacto: s.contactoRecepcion || "",
      telefono: s.telefonoRecepcion || "",
      fragil: s.fragil ? "sí" : "no",
      apilable: s.apilable ? "sí" : "no",
      notas: s.notas || "",
      waze: wazeUrl(tidyNum(s.lat), tidyNum(s.lng)) || "",
      gmaps: gmapsUrl(tidyNum(s.lat), tidyNum(s.lng)) || "",
    }));
    exportCSV(
      `hoja_ruta_${(nombreRuta || "ruta").replace(/\s+/g, "_")}_${fecha}.csv`,
      rows
    );
  }

  function compartirWhatsApp() {
    const header = `Ruta: ${nombreRuta || "-"} | Fecha: ${fecha}
Conductor: ${conductorNombre || "-"} | Camión: ${camionNombre || "-"}

Paradas: ${stops.length} | Utilización: KG ${pct(totales.pctKg)}, m³ ${pct(
      totales.pctM3
    )}, UN ${pct(totales.pctUn)} | Paradas/h: ${
      totales.paradasHora ? totales.paradasHora.toFixed(1) : "—"
    }
-----------------------------`;
    const body = stops
      .map((s, i) => {
        const lat = tidyNum(s.lat),
          lng = tidyNum(s.lng);
        return `${i + 1}. ${s.cliente || "Cliente"} (${s.direccionTexto || "-"})
- Prioridad: ${s.prioridad}  Ventana: ${s.ventanaInicioStop || "—"}–${
          s.ventanaFinStop || "—"
        }
- Carga: ${fmtC(s)}  Servicio: ${s.tiempoServicioMin || 0} min
- Waze: ${wazeUrl(lat, lng) || "-"}
- Maps: ${gmapsUrl(lat, lng) || "-"}`;
      })
      .join("\n\n");

    const text = encodeURIComponent(`${header}\n${body}`);
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  }

  function fmtC(s) {
    const parts = [];
    if (Number.isFinite(tidyNum(s.pesoKg))) parts.push(`${s.pesoKg} kg`);
    if (Number.isFinite(tidyNum(s.volumenM3))) parts.push(`${s.volumenM3} m³`);
    if (Number.isFinite(tidyNum(s.unidades))) parts.push(`${s.unidades} un`);
    return parts.join(" | ") || "-";
  }
  function pct(n) {
    return n == null ? "—" : `${n.toFixed(0)}%`;
  }

  // ===== Render
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>🗺️ Programar Entregas</h2>
        {isGerente && (
          <span style={{ marginLeft: 8, fontSize: 12, color: "#202a3fff" }}>
            (modo lectura para publicar)
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={() => guardarProgramacion("draft")}>💾 Guardar borrador</button>
          <button
            disabled={isGerente}
            title={isGerente ? "Gerente: solo lectura. No puede publicar." : "Publicar y asignar a mensajero"}
            onClick={() => {
              if (isGerente) {
                alert("Tu rol (gerente) no permite publicar programaciones.");
                return;
              }
              const errs = validarAntesDePublicar();
              if (errs.length) return alert("Corrige:\n• " + errs.join("\n• "));
              guardarProgramacion("published");
            }}
          >
            🚀 Publicar y asignar
          </button>
          <button onClick={exportarHojaRutaCSV}>⬇️ Exportar hoja CSV</button>
          <button onClick={compartirWhatsApp}>📲 Compartir por WhatsApp</button>
        </div>
      </div>

      {!!error && <div style={{ marginTop: 8, color: "#b00" }}>{error}</div>}

      {/* Datos de la programación */}
      <section style={card}>
        <h3 style={{ marginTop: 0 }}>1) Datos de la programación</h3>
        <div className="grid3">
          <div>
            <label>Nombre de la ruta</label>
            <input value={nombreRuta} onChange={(e) => setNombreRuta(e.target.value)} placeholder="RUTA-LUNES-A" />
          </div>
          <div>
            <label>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <label>Zona</label>
            <input value={zona} onChange={(e) => setZona(e.target.value)} placeholder="Centro / Norte / ..." />
          </div>

          <div>
            <label>Ventana inicio</label>
            <input type="time" value={ventanaInicio} onChange={(e) => setVentanaInicio(e.target.value)} />
          </div>
          <div>
            <label>Ventana fin</label>
            <input type="time" value={ventanaFin} onChange={(e) => setVentanaFin(e.target.value)} />
          </div>
          <div>
            <label>Tipo de servicio</label>
            <select value={tipoServicio} onChange={(e) => setTipoServicio(e.target.value)}>
              <option value="same_day">same_day</option>
              <option value="next_day">next_day</option>
              <option value="programado">programado</option>
            </select>
          </div>

          <div>
            <label>SLA objetivo (min)</label>
            <input type="number" value={slaObjetivoMin} onChange={(e) => setSlaObjetivoMin(Number(e.target.value || 0))} />
          </div>
          <div className="col-span-2">
            <label>Notas / Instrucciones</label>
            <input value={notasRuta} onChange={(e) => setNotasRuta(e.target.value)} placeholder="Indicaciones al conductor..." />
          </div>
        </div>
      </section>

      {/* Vehículo y Conductor */}
      <section style={card}>
        <h3 style={{ marginTop: 0 }}>2) Vehículo y Conductor</h3>
        <div className="grid3">
          <div>
            <label>Camión / Unidad</label>
            <input value={camionNombre} onChange={(e) => setCamionNombre(e.target.value)} placeholder="Camión 1" />
          </div>
          <div>
            <label>Capacidad (kg)</label>
            <input type="number" value={capacidadKg ?? ""} onChange={(e) => setCapacidadKg(tidyNum(e.target.value))} />
          </div>
          <div>
            <label>Capacidad (m³)</label>
            <input type="number" value={capacidadM3 ?? ""} onChange={(e) => setCapacidadM3(tidyNum(e.target.value))} />
          </div>
          <div>
            <label>Capacidad (unidades)</label>
            <input type="number" value={capacidadUnidades ?? ""} onChange={(e) => setCapacidadUnidades(tidyNum(e.target.value))} />
          </div>
          <div>
            <label>Restricciones vehículo</label>
            <input value={restriccionesVehiculo} onChange={(e) => setRestriccionesVehiculo(e.target.value)} placeholder="Altura, ancho, accesos..." />
          </div>
          <div>
            <label>Estado conductor requerido</label>
            <select value={estadoConductorRequerido} onChange={(e) => setEstadoConductorRequerido(e.target.value)}>
              <option value="disponible">disponible</option>
              <option value="indistinto">indistinto</option>
            </select>
          </div>
        </div>

        {/* Selector de mensajeros */}
        <div className="grid3" style={{ marginTop: 8 }}>
          <div className="col-span-2">
            <label>Seleccionar Mensajero (registrado)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <select
                value={conductorUid}
                onChange={(e) => {
                  const uid = e.target.value;
                  setConductorUid(uid);
                  const m = mensajeros.find((mm) => mm.uid === uid);
                  setConductorNombre(m?.nombre || "");
                  setErrorMensajeros("");
                }}
                style={{ flex: 1 }}
              >
                {!mensajeros.length && <option value="">(No hay mensajeros)</option>}
                {mensajeros.map((m) => (
                  <option key={m.uid} value={m.uid}>
                    {m.nombre} ({m.uid.slice(0, 6)}…)
                  </option>
                ))}
              </select>
              <button
                type="button"
                title="Refrescar lista"
                onClick={() => {
                  setMensajeros((prev) => [...prev].sort((a, b) => a.nombre.localeCompare(b.nombre)));
                }}
              >
                🔄
              </button>
            </div>
            {!!errorMensajeros && (
              <div style={{ color: "#b00", fontSize: 12, marginTop: 4 }}>{errorMensajeros}</div>
            )}
            <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
              * Debe ser alguien registrado. Evita escribir nombres manualmente que no existan.
            </div>
          </div>
          <div>
            <label>Total mensajeros</label>
            <input value={mensajeros.length} readOnly />
          </div>
        </div>

        {/* Campos originales conservados (se autollenan desde el selector) */}
        <div className="grid3" style={{ marginTop: 8 }}>
          <div>
            <label>Conductor UID</label>
            <input
              value={conductorUid}
              onChange={(e) => {
                const v = e.target.value;
                setConductorUid(v);
                const m = mensajeros.find((mm) => mm.uid === v);
                if (m) {
                  setConductorNombre(m.nombre);
                  setErrorMensajeros("");
                } else {
                  setErrorMensajeros("UID no corresponde a un mensajero registrado.");
                }
              }}
              placeholder="uid-123"
            />
          </div>
          <div>
            <label>Conductor Nombre</label>
            <input
              value={conductorNombre}
              onChange={(e) => setConductorNombre(e.target.value)}
              placeholder="Juan Pérez"
            />
          </div>
          <div>
            <label>Max Stops</label>
            <input
              type="number"
              value={maxStops}
              onChange={(e) => setMaxStops(Number(e.target.value || 60))}
            />
          </div>
        </div>

        {/* Estado en vivo del conductor */}
        <div style={{ marginTop: 8, fontSize: 13 }}>
          <b>Estado del mensajero:</b>{" "}
          <span style={{ color: ["disponible","listo_para_ruta"].includes(conductorEstado) ? "#0a0" : "#b00" }}>
            {conductorEstado}
          </span>
        </div>

        {/* KPIs de utilización */}
        <div style={{ marginTop: 10, display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Kpi label="Kg cargados" value={`${(totales.kg || 0).toFixed(1)} / ${capacidadKg ?? "—"}`} extra={`Util: ${pct(totales.pctKg)}`} />
          <Kpi label="m³ cargados" value={`${(totales.m3 || 0).toFixed(2)} / ${capacidadM3 ?? "—"}`} extra={`Util: ${pct(totales.pctM3)}`} />
          <Kpi label="Unidades" value={`${(totales.unid || 0)} / ${capacidadUnidades ?? "—"}`} extra={`Util: ${pct(totales.pctUn)}`} />
          <Kpi label="Distancia aprox." value={`${totales.kmTotal.toFixed(1)} km`} />
          <Kpi label="Tiempo tránsito" value={`${totales.minTransito.toFixed(0)} min`} />
          <Kpi label="Tiempo servicio (dwell)" value={`${totales.minServicio.toFixed(0)} min`} />
          <Kpi label="Tiempo total" value={`${totales.minTotales.toFixed(0)} min`} />
          <Kpi label="Paradas / hora" value={totales.paradasHora ? totales.paradasHora.toFixed(1) : "—"} />
        </div>
      </section>

      {/* Programaciones guardadas */}
      <section style={card}>
        <h3 style={{ marginTop: 0 }}>2.5) Programaciones guardadas</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label>Fecha</label>
          <input type="date" value={fechaProg} onChange={(e) => setFechaProg(e.target.value)} />
          <label>Estado</label>
          <select value={statusProg} onChange={(e) => setStatusProg(e.target.value)}>
            <option value="todas">todas</option>
            <option value="draft">draft</option>
            <option value="published">published</option>
          </select>
        </div>

        <div style={{ marginTop: 10, overflowX: "auto" }}>
          {programaciones.length ? (
            <table className="tbl" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Ruta</Th>
                  <Th>Conductor</Th>
                  <Th>Stops</Th>
                  <Th>Status</Th>
                  <Th>KPIs</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {programaciones
                  .filter(p => !fechaProg || p.fecha === fechaProg)
                  .filter(p => statusProg === "todas" ? true : p.status === statusProg)
                  .map(p => (
                    <tr key={p.id}>
                      <Td>{p.fecha || "—"}</Td>
                      <Td>{p.nombreRuta || p.id}</Td>
                      <Td>{p.conductorNombre || "—"}</Td>
                      <Td>{Array.isArray(p.stops) ? p.stops.length : 0}</Td>
                      <Td>{p.status}</Td>
                      <Td>
                        {p.kpiPre
                          ? `Kg:${p.kpiPre.totalKg ?? 0} · m³:${p.kpiPre.totalM3 ?? 0} · par/h:${p.kpiPre.paradasHora ?? "—"}`
                          : "—"}
                      </Td>
                      <Td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button onClick={() => { setSoloProgramadas(true); setProgramacionIdFiltro(p.id); }}>
                            Ver órdenes de esta programación
                          </button>
                        </div>
                      </Td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : (
            <div>No hay programaciones.</div>
          )}
        </div>
      </section>

      {/* Bandeja de órdenes */}
      <section style={card}>
        <h3 style={{ marginTop: 0 }}>3) Bandeja de órdenes</h3>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label><input type="checkbox" checked={filtroSinAsignar} onChange={(e) => setFiltroSinAsignar(e.target.checked)} /> Sin asignar</label>
          <label><input type="checkbox" checked={filtroConGeoloc} onChange={(e) => setFiltroConGeoloc(e.target.checked)} /> Con geoloc</label>
          <label><input type="checkbox" checked={filtroConVentana} onChange={(e) => setFiltroConVentana(e.target.checked)} /> Con ventana</label>
          <input placeholder="Zona…" value={filtroZona} onChange={(e) => setFiltroZona(e.target.value)} style={{ minWidth: 140 }} />
          <input placeholder="Buscar (cliente/factura/teléfono/dirección)..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ flex: 1, minWidth: 240 }} />
          <input placeholder="Ref adicional…" value={refBusqueda} onChange={(e) => setRefBusqueda(e.target.value)} style={{ minWidth: 150 }} />

          {/* 🔎 Filtros de programadas */}
          <label>
            <input
              type="checkbox"
              checked={soloProgramadas}
              onChange={(e) => setSoloProgramadas(e.target.checked)}
            /> Solo programadas
          </label>
          <select
            value={programacionIdFiltro}
            onChange={(e) => setProgramacionIdFiltro(e.target.value)}
            style={{ minWidth: 220 }}
          >
            <option value="">(Todas las programaciones)</option>
            {programaciones.map(p => (
              <option key={p.id} value={p.id}>
                {p.nombreRuta || p.id} · {p.fecha} · {p.status}
              </option>
            ))}
          </select>
          <button onClick={() => { setSoloProgramadas(false); setProgramacionIdFiltro(""); }}>
            Limpiar filtros
          </button>

          <button onClick={() => setShowCrearOrden((v) => !v)}>➕ Crear orden rápida</button>
        </div>

        {showCrearOrden && (
          <div style={{ marginTop: 10, padding: 10, border: "1px dashed #bbb", borderRadius: 8 }}>
            <b>Nueva orden rápida</b>
            <div className="grid3" style={{ marginTop: 6 }}>
              <input placeholder="Cliente" value={oCliente} onChange={(e) => setOCliente(e.target.value)} />
              <input placeholder="Teléfono" value={oTelefono} onChange={(e) => setOTelefono(e.target.value)} />
              <input placeholder="N° Factura" value={oFactura} onChange={(e) => setOFactura(e.target.value)} />
              <div>
                <label>Fecha</label>
                <input type="date" value={oFecha} onChange={(e) => setOFecha(e.target.value)} />
              </div>
              <div>
                <label>Hora</label>
                <input type="time" value={oHora} onChange={(e) => setOHora(e.target.value)} />
              </div>
              <input placeholder="Zona (opcional)" value={oZona} onChange={(e) => setOZona(e.target.value)} />
            </div>
            <div style={{ marginTop: 6 }}>
              <label><b>Dirección</b></label>
              <AddressInput value={oAddress} onChange={setOAddress} />
            </div>
            <div className="grid3" style={{ marginTop: 6 }}>
              <input type="number" placeholder="Peso (kg)" value={oPesoKg ?? ""} onChange={(e) => setOPesoKg(tidyNum(e.target.value))} />
              <input type="number" placeholder="Volumen (m³)" value={oVolumenM3 ?? ""} onChange={(e) => setOVolumenM3(tidyNum(e.target.value))} />
              <input type="number" placeholder="Unidades" value={oUnidades ?? ""} onChange={(e) => setOUnidades(tidyNum(e.target.value))} />
            </div>
            <div style={{ marginTop: 8 }}>
              <button onClick={crearOrdenRapidaYAgregar}>Crear y agregar ➕</button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 10, overflowX: "auto" }}>
          {loading ? (
            <div>Cargando…</div>
          ) : ordenesFiltradas.length ? (
            <table className="tbl" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <Th>Fecha/Hora</Th>
                  <Th>Tipo</Th>
                  <Th>Cliente</Th>
                  <Th>Factura</Th>
                  <Th>Asignado</Th>
                  <Th>Zona</Th>
                  <Th>Dirección</Th>
                  <Th>Ventana (stop)</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {ordenesFiltradas.map((o) => {
                  const dir = o.direccionTexto || o.address?.formatted || "—";
                  const esProg = !!(o.programacionId || o?.esProgramada || o?.tipoEntrega === "programada");
                  return (
                    <tr key={o.id}>
                      <Td>{o.fecha || "—"} {o.hora || ""}</Td>
                      <Td>
                        {esProg ? <span className="badge badge-prog">Programada</span> : <span className="badge badge-uni">Unitaria</span>}
                      </Td>
                      <Td>
                        {o.cliente || "—"}
                        {esProg && o.programacionOrden ? (
                          <span className="badge badge-seq" title="Orden dentro de la ruta">#{o.programacionOrden}</span>
                        ) : null}
                      </Td>
                      <Td>{o.numeroFactura || "—"}</Td>
                      <Td>{o.asignadoNombre || "—"}</Td>
                      <Td>{o.zona || "—"}</Td>
                      <Td>{dir}</Td>
                      <Td>{o.ventanaInicioStop || "—"}{o.ventanaFinStop ? `–${o.ventanaFinStop}`:""}</Td>
                      <Td>
                        <button onClick={() => addOrdenComoStop(o)} disabled={yaEstaAgregada(o.id)}>Agregar</button>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div>No hay coincidencias.</div>
          )}
        </div>
      </section>

      {/* Gestión de paradas */}
      <section style={card}>
        <h3 style={{ marginTop: 0 }}>4) Paradas (stops) & 6) Secuenciación</h3>
        {stops.length === 0 ? (
          <div>Agrega órdenes desde la bandeja para construir la ruta.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Cliente / Dirección</Th>
                  <Th>Tipo</Th>
                  <Th>Kg</Th>
                  <Th>m³</Th>
                  <Th>Un</Th>
                  <Th>Prior.</Th>
                  <Th>Ventana</Th>
                  <Th>Serv (min)</Th>
                  <Th>Contacto/Tel</Th>
                  <Th>Flags</Th>
                  <Th>Valor/Seguro</Th>
                  <Th>Docs</Th>
                  <Th>Notas</Th>
                  <Th>Lat,Lon</Th>
                  <Th>ETA*</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {stops.map((s, idx) => {
                  const lat = tidyNum(s.lat), lng = tidyNum(s.lng);
                  const eta = totales.etaPorStop?.[idx];
                  return (
                    <tr key={s.orderId}>
                      <Td style={{ whiteSpace: "nowrap" }}>{idx + 1}</Td>
                      <Td style={{ minWidth: 220 }}>
                        <div style={{ fontWeight: 600 }}>{s.cliente || s.orderId}</div>
                        <div style={{ fontSize: 12, color: "#555" }}>{s.direccionTexto || "—"}</div>
                      </Td>

                      <Td>
                        <select value={s.tipo} onChange={(e) => updateStop(idx, { tipo: e.target.value })}>
                          <option value="solo_entrega">solo_entrega</option>
                          <option value="pickup_entrega">pickup_entrega</option>
                        </select>
                      </Td>

                      <Td><input type="number" value={s.pesoKg ?? ""} onChange={(e) => updateStop(idx, { pesoKg: tidyNum(e.target.value) })} style={mini} /></Td>
                      <Td><input type="number" value={s.volumenM3 ?? ""} onChange={(e) => updateStop(idx, { volumenM3: tidyNum(e.target.value) })} style={mini} /></Td>
                      <Td><input type="number" value={s.unidades ?? ""} onChange={(e) => updateStop(idx, { unidades: tidyNum(e.target.value) })} style={mini} /></Td>

                      <Td>
                        <input type="number" min={1} max={5} value={s.prioridad ?? 3} onChange={(e) => updateStop(idx, { prioridad: Number(e.target.value||3) })} style={mini} />
                      </Td>

                      <Td style={{ whiteSpace: "nowrap" }}>
                        <input type="time" value={s.ventanaInicioStop || ""} onChange={(e) => updateStop(idx, { ventanaInicioStop: e.target.value })} style={miniWide} />
                        <span>–</span>
                        <input type="time" value={s.ventanaFinStop || ""} onChange={(e) => updateStop(idx, { ventanaFinStop: e.target.value })} style={miniWide} />
                      </Td>

                      <Td>
                        <input type="number" value={s.tiempoServicioMin ?? 10} onChange={(e) => updateStop(idx, { tiempoServicioMin: tidyNum(e.target.value) })} style={mini} />
                      </Td>

                      <Td style={{ minWidth: 180 }}>
                        <input placeholder="Contacto" value={s.contactoRecepcion || ""} onChange={(e) => updateStop(idx, { contactoRecepcion: e.target.value })} style={{ ...miniWide, marginBottom: 4 }} />
                        <input placeholder="Teléfono" value={s.telefonoRecepcion || ""} onChange={(e) => updateStop(idx, { telefonoRecepcion: e.target.value })} style={miniWide} />
                      </Td>

                      <Td>
                        <label style={{ display: "block", fontSize: 12 }}>
                          <input type="checkbox" checked={!!s.fragil} onChange={(e) => updateStop(idx, { fragil: e.target.checked })} /> Frágil
                        </label>
                        <label style={{ display: "block", fontSize: 12 }}>
                          <input type="checkbox" checked={!!s.apilable} onChange={(e) => updateStop(idx, { apilable: e.target.checked })} /> Apilable
                        </label>
                      </Td>

                      <Td>
                        <input type="number" placeholder="Valor" value={s.valorDeclarado ?? ""} onChange={(e) => updateStop(idx, { valorDeclarado: tidyNum(e.target.value) })} style={mini} />
                        <input type="number" placeholder="Seguro" value={s.seguroMonto ?? ""} onChange={(e) => updateStop(idx, { seguroMonto: tidyNum(e.target.value) })} style={mini} />
                      </Td>

                      <Td>
                        <input placeholder="Docs ref" value={s.documentosRef || ""} onChange={(e) => updateStop(idx, { documentosRef: e.target.value })} style={miniWide} />
                      </Td>

                      <Td style={{ minWidth: 220 }}>
                        <div style={{ marginBottom: 4 }}>
                          <input
                            placeholder="Lat"
                            value={lat ?? ""}
                            onChange={(e) => updateStop(idx, { lat: tidyNum(e.target.value) })}
                            style={{ ...mini, width: 90, marginRight: 6 }}
                          />
                          <input
                            placeholder="Lng"
                            value={lng ?? ""}
                            onChange={(e) => updateStop(idx, { lng: tidyNum(e.target.value) })}
                            style={{ ...mini, width: 90 }}
                          />
                        </div>
                        <div style={{ fontSize: 12 }}>
                          {Number.isFinite(lat) && Number.isFinite(lng) && (
                            <>
                              <a href={wazeUrl(lat, lng)} target="_blank" rel="noreferrer">Waze</a> ·{" "}
                              <a href={gmapsUrl(lat, lng)} target="_blank" rel="noreferrer">Maps</a>
                            </>
                          )}
                        </div>
                      </Td>

                      <Td style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                        {eta ? eta.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                      </Td>

                      <Td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button onClick={() => moveStop(idx, -1)} disabled={idx === 0}>↑</button>
                          <button onClick={() => moveStop(idx, +1)} disabled={idx === stops.length - 1}>↓</button>
                          <button onClick={() => removeStop(idx)}>Quitar</button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
              * ETA y distancia son estimaciones locales (velocidad media 30 km/h).
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/** ───────── UI helpers ───────── */
const card = {
  marginTop: 12,
  padding: 12,
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#ffffff",
  boxShadow: "0 1px 2px rgba(16, 24, 40, 0.04)",
};
const Th = ({ children }) => (
  <th
    style={{
      textAlign: "left",
      borderBottom: "1px solid #e5e7eb",
      padding: "10px 12px",
      background: "#f8fafc",
      color: "#334155",
      fontWeight: 600,
      position: "sticky",
      top: 0,
      zIndex: 1,
    }}
  >
    {children}
  </th>
);
const Td = ({ children, style }) => (
  <td style={{ borderBottom: "1px solid #eef2f7", padding: "9px 12px", ...style }}>
    {children}
  </td>
);
const mini = { width: 80, padding: "4px 6px" };
const miniWide = { width: 120, padding: "4px 6px" };

function Kpi({ label, value, extra }) {
  return (
    <div
      style={{
        padding: 10,
        border: "1px dashed #dce3f0",
        borderRadius: 12,
        background: "#f9fafb",
        minWidth: 160,
      }}
    >
      <div style={{ fontSize: 12, color: "#667085" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{value}</div>
      {extra && <div style={{ fontSize: 12, color: "#667085" }}>{extra}</div>}
    </div>
  );
}

/** Estilos sencillos responsivos + estética suave */
const css = document.createElement("style");
css.innerHTML = `
  .grid3 {
    display: grid;
    gap: 10px;
    grid-template-columns: repeat(3, minmax(220px, 1fr));
  }
  .col-span-2 { grid-column: span 2; }
  input, select, textarea {
    padding: 8px 10px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    width: 100%;
    background: #fff;
  }
  input:focus, select:focus, textarea:focus {
    outline: none;
    border-color: #c7d2fe;
    box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
  }
  label { display: block; font-size: 12px; color: #475569; margin-bottom: 6px; }

  .tbl {
    border: 1px solid #0f1420ff;
    border-radius: 10px;
    overflow: hidden;
    background: #fff;
  }
  .tbl tbody tr:nth-child(odd) td {
    background: #fbfdff;
  }
  .tbl tbody tr:hover td {
    background: #eef2ff;
  }

  .badge {
    display: inline-block;
    line-height: 1;
    padding: 4px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    border: 1px solid transparent;
    margin-right: 6px;
  }
  .badge-prog {
    color: #372c8bff;
    background: #eef2ff;
    border-color: #616a8dff;
  }
  .badge-uni {
    color: #065f46;
    background: #ecfdf5;
    border-color: #bbf7d0;
  }
  .badge-seq {
    color: #334155;
    background: #f1f5f9;
    border-color: #b7c7ddff;
    margin-left: 6px;
  }

  button {
    background: #6366f1;
    color: #fff;
    border: 1px solid #6366f1;
    border-radius: 10px;
    padding: 8px 12px;
    cursor: pointer;
  }
  button:hover { filter: brightness(0.95); }
  button:disabled {
    background: #99a7ddff;
    border-color: rgba(139, 142, 173, 1);
    cursor: not-allowed;
  }

  table { font-size: 14px; }
`;
document.head.appendChild(css);
