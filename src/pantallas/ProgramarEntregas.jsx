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
  const lat1 = tidyNum(a?.lat), lon1 = tidyNum(a?.lng);
  const lat2 = tidyNum(b?.lat), lon2 = tidyNum(b?.lng);
  if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) return 0;
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
function normalizeRole(raw) { return String(raw || "").trim().toLowerCase(); }
function normalizeStr(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
const ROLES_MENSAJERO = new Set([
  "mensajero","mensajeros","rider","riders","courier","delivery","deliveryman",
  "repartidor","repartidores","conductor","driver",
]);

/** Generador simple de IDs de cadena pickup→entrega */
const genChainId = () => `chain_${Math.random().toString(36).slice(2,9)}`;

/** ───────── Componente ───────── */
export default function ProgramarEntregas() {
  // ===== Sesión
  const usuario = useMemo(() => {
    try {
      const raw = localStorage.getItem("usuarioActivo");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, []);
  const rol = normalizeRole(usuario?.rol || usuario?.role);
  const isAdmin = ["administrador","admin","administrator"].includes(rol);
  const isOperador = ["operador","operator"].includes(rol);
  const isGerente = rol === "gerente";

  const empresaId = usuario?.empresaId ? String(usuario.empresaId) : null;
  const empresaIdNum = Number.isFinite(Number(empresaId)) ? Number(empresaId) : null;
  const actorId = usuario?.id || usuario?.uid || usuario?.userId || usuario?.usuarioId || null;
  const actorNombre = usuario?.nombre || usuario?.usuario || "desconocido";
  const actorEmail = usuario?.email || null;

  // ===== Estado de Programación (Ruta)
  const [nombreRuta, setNombreRuta] = useState("");
  const [fecha, setFecha] = useState(todayISO());
  const [fechasExtraTxt, setFechasExtraTxt] = useState(""); // NUEVO: fechas múltiples (una por línea)
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

  // Mensajeros
  const [mensajeros, setMensajeros] = useState([]);
  const [conductorUid, setConductorUid] = useState("");
  const [conductorNombre, setConductorNombre] = useState("");
  const [conductorEstado, setConductorEstado] = useState("desconocido");
  const [estadoConductorRequerido, setEstadoConductorRequerido] = useState("disponible");
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

  // Paradas (stops)
  const [stops, setStops] = useState([]);

  // Programaciones guardadas
  const [programaciones, setProgramaciones] = useState([]);
  const [statusProg, setStatusProg] = useState("todas");
  const [fechaProg, setFechaProg] = useState(todayISO());
  const [soloProgramadas, setSoloProgramadas] = useState(false);
  const [programacionIdFiltro, setProgramacionIdFiltro] = useState("");

  /** ───────── SUSCRIPCIONES ───────── */
  useEffect(() => {
    if (!empresaId) return;
    let unsubs = [];
    let mounted = true;

    const mergeUniqueByUid = (arr) => {
      const map = new Map();
      for (const it of arr) { if (!it?.uid) continue; map.set(it.uid, it); }
      return Array.from(map.values());
    };

    const byUsuariosSnapshotHandler = (snap, acc = []) => {
      const list = snap.docs.map((d) => {
        const u = d.data() || {};
        const roleRaw = u.rol ?? u.role ?? u.perfil ?? u.tipo ?? "";
        const r = normalizeRole(roleRaw);
        if (!ROLES_MENSAJERO.has(r)) return null;
        return { uid: d.id, nombre: u.nombre || u.usuario || u.email || d.id, rol: r };
      }).filter(Boolean);
      return acc.concat(list);
    };

    const subscribe = async () => {
      setErrorMensajeros("");
      try {
        const refU1 = collection(db, "usuarios");
        const qU1 = query(refU1, where("empresaId", "==", empresaId));
        const unsub1 = onSnapshot(qU1, (snap) => {
          if (!mounted) return;
          const merged = mergeUniqueByUid(byUsuariosSnapshotHandler(snap));
          if (merged.length) {
            setMensajeros(merged.sort((a,b)=>a.nombre.localeCompare(b.nombre)));
            if (!conductorUid && merged.length) {
              setConductorUid(merged[0].uid);
              setConductorNombre(merged[0].nombre);
            }
          }
        });
        unsubs.push(unsub1);
      } catch (e) {}

      if (Number.isFinite(empresaIdNum)) {
        try {
          const refU2 = collection(db, "usuarios");
          const qU2 = query(refU2, where("empresaId", "==", empresaIdNum));
          const unsub2 = onSnapshot(qU2, (snap) => {
            if (!mounted) return;
            const extra = byUsuariosSnapshotHandler(snap);
            if (extra.length) {
              setMensajeros((prev)=>
                mergeUniqueByUid(prev.concat(extra)).sort((a,b)=>a.nombre.localeCompare(b.nombre))
              );
              if (!conductorUid && extra.length) {
                setConductorUid(extra[0].uid);
                setConductorNombre(extra[0].nombre);
              }
            }
          });
          unsubs.push(unsub2);
        } catch (e) {}
      }

      try {
        const refUb1 = collection(db, "ubicacionesMensajeros");
        const qUb1 = query(refUb1, where("empresaId", "==", empresaId));
        const unsubUb1 = onSnapshot(qUb1, (snap) => {
          if (!mounted) return;
          const arr = snap.docs.map((d)=>({ uid:d.id, nombre:(d.data()||{}).nombre || d.id, rol:"mensajero" }));
          if (arr.length) {
            setMensajeros((prev)=>
              mergeUniqueByUid(prev.concat(arr)).sort((a,b)=>a.nombre.localeCompare(b.nombre))
            );
            if (!conductorUid && arr.length) {
              setConductorUid(arr[0].uid);
              setConductorNombre(arr[0].nombre);
            }
          }
        });
        unsubs.push(unsubUb1);
      } catch (e) {}

      if (Number.isFinite(empresaIdNum)) {
        try {
          const refUb2 = collection(db, "ubicacionesMensajeros");
          const qUb2 = query(refUb2, where("empresaId", "==", empresaIdNum));
          const unsubUb2 = onSnapshot(qUb2, (snap) => {
            if (!mounted) return;
            const arr = snap.docs.map((d)=>({ uid:d.id, nombre:(d.data()||{}).nombre || d.id, rol:"mensajero" }));
            if (arr.length) {
              setMensajeros((prev)=>
                mergeUniqueByUid(prev.concat(arr)).sort((a,b)=>a.nombre.localeCompare(b.nombre))
              );
              if (!conductorUid && arr.length) {
                setConductorUid(arr[0].uid);
                setConductorNombre(arr[0].nombre);
              }
            }
          });
          unsubs.push(unsubUb2);
        } catch (e) {}
      }
    };

    subscribe();
    return () => { unsubs.forEach((u)=>u&&u()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const conductorEsValido = useMemo(() => {
    if (!conductorUid) return false;
    return mensajeros.some((m) => m.uid === conductorUid);
  }, [conductorUid, mensajeros]);

  useEffect(() => {
    if (!conductorNombre || conductorEsValido) return;
    const name = normalizeStr(conductorNombre);
    const match = mensajeros.find((m) => normalizeStr(m.nombre) === name);
    if (match) {
      setConductorUid(match.uid);
      setConductorNombre(match.nombre);
      setErrorMensajeros("");
    } else {
      setErrorMensajeros("El mensajero debe seleccionarse de los registrados. Usa el selector o escribe exactamente como aparece.");
    }
  }, [conductorNombre, conductorEsValido, mensajeros]);

  useEffect(() => {
    if (!empresaId || !conductorUid) { setConductorEstado("desconocido"); return; }
    const ref = doc(db, "ubicacionesMensajeros", conductorUid);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data();
      if (!data) { setConductorEstado("desconocido"); return; }
      if (String(data.empresaId || "") !== String(empresaId)) { setConductorEstado("otra_empresa"); return; }
      setConductorEstado(String(data.estado || "desconocido").toLowerCase());
    });
    return () => unsub();
  }, [empresaId, conductorUid]);

  useEffect(() => {
    if (!empresaId) return;
    let unsub = null;
    (async () => {
      setLoading(true); setError("");
      const ok = await ensureUsuarioActivo();
      if (!ok) { setError("Sesión inválida."); setLoading(false); return; }
      try {
        const ref = collection(db, "ordenes");
        const q1 = query(ref, where("empresaId","==",empresaId), orderBy("createdAt","desc"));
        unsub = onSnapshot(q1, (snap) => {
          const arr = snap.docs.map((d)=>({ id:d.id, ...d.data() }));
          setOrdenes(arr); setLoading(false);
        }, (err) => { setError(err?.message || "No se pudieron leer órdenes."); setLoading(false); });
      } catch (e) { setError(e?.message || "No se pudo iniciar la suscripción."); setLoading(false); }
    })();
    return () => unsub && unsub();
  }, [empresaId]);

  useEffect(() => {
    if (!empresaId) return;
    let unsub = null;
    (async () => {
      try {
        const ref = collection(db, "programasEntrega");
        const q1 = query(ref, where("empresaId","==",empresaId), orderBy("createdAt","desc"));
        unsub = onSnapshot(q1, (snap) => {
          const arr = snap.docs.map((d)=>({ id:d.id, ...d.data() }));
          setProgramaciones(arr);
        });
      } catch (e) {}
    })();
    return () => unsub && unsub();
  }, [empresaId]);

  // ===== Bandeja filtrada
  const ordenesFiltradas = useMemo(() => {
    let base = [...ordenes];
    if (filtroSinAsignar) base = base.filter((o) => !o.asignadoUid);
    if (filtroConGeoloc)
      base = base.filter((o) =>
        hasLatLng({ lat: o.destinoLat ?? o?.address?.lat, lng: o.destinoLng ?? o?.address?.lng })
      );
    if (filtroConVentana) base = base.filter((o) => !!o.ventanaInicioStop || !!o.ventanaFinStop);
    if (filtroZona.trim()) {
      const f = filtroZona.trim().toLowerCase();
      base = base.filter((o) => String(o.zona || "").toLowerCase().includes(f));
    }
    const q = busqueda.trim().toLowerCase();
    if (q) {
      base = base.filter((o) => {
        const blob = [o.cliente,o.telefono,o.numeroFactura,o.direccionTexto,o.address?.formatted]
          .map((v)=>String(v||"").toLowerCase()).join(" | ");
        return blob.includes(q);
      });
    }
    const rq = refBusqueda.trim().toLowerCase();
    if (rq) base = base.filter((o)=> String(o.referencia || "").toLowerCase().includes(rq));

    if (soloProgramadas) base = base.filter((o)=> !!o.programacionId || o?.esProgramada===true || o?.tipoEntrega==="programada");
    if (programacionIdFiltro) base = base.filter((o)=> o.programacionId === programacionIdFiltro);
    return base;
  }, [ordenes,filtroSinAsignar,filtroConGeoloc,filtroConVentana,filtroZona,busqueda,refBusqueda,soloProgramadas,programacionIdFiltro]);

  // ===== Paradas
  function yaEstaAgregada(orderId) { return stops.some((s)=> s.orderId === orderId); }

  function addOrdenComoStop(o) {
    if (yaEstaAgregada(o.id)) { alert("Esa orden ya está en la ruta."); return; }
    const lat = tidyNum(o.destinoLat) ?? tidyNum(o?.address?.lat) ?? tidyNum(o?.destino?.lat);
    const lng = tidyNum(o.destinoLng) ?? tidyNum(o?.address?.lng) ?? tidyNum(o?.destino?.lng);
    const nuevo = {
      orderId: o.id,
      cliente: o.cliente || "",
      direccionTexto: o.direccionTexto || o.address?.formatted || "",
      lat, lng,
      tipo: "solo_entrega", // entrega simple (descarga)
      pesoKg: tidyNum(o.pesoKg),
      volumenM3: tidyNum(o.volumenM3),
      unidades: tidyNum(o.unidades),
      // NUEVO: deltas de carga (entrega = descarga)
      deltaKg: tidyNum(o.pesoKg) ? -Math.abs(tidyNum(o.pesoKg)) : null,
      deltaM3: tidyNum(o.volumenM3) ? -Math.abs(tidyNum(o.volumenM3)) : null,
      deltaUnidades: tidyNum(o.unidades) ? -Math.abs(tidyNum(o.unidades)) : null,

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

      // NUEVO: cadena pickup→entrega (si aplica)
      chainId: null,
      chainRole: null, // 'pickup' | 'drop'
      // NUEVO: stop especial de recarga
      esRecarga: false,
    };
    setStops((arr)=>[...arr,nuevo]);
  }

  function addRecargaStop(centro) {
    if (!hasLatLng(centro)) { alert("La recarga necesita lat/lng."); return; }
    const nuevo = {
      orderId: `recarga_${Date.now()}`,
      cliente: "RECARGA / HUB",
      direccionTexto: centro.formatted || "Centro de recarga",
      lat: tidyNum(centro.lat),
      lng: tidyNum(centro.lng),
      tipo: "recarga",
      esRecarga: true,
      // recarga no cambia por sí misma la carga; solo resetea los acumulados
      deltaKg: 0, deltaM3: 0, deltaUnidades: 0,
      prioridad: 2,
      ventanaInicioStop: "",
      ventanaFinStop: "",
      tiempoServicioMin: 5,
      contactoRecepcion: "",
      telefonoRecepcion: "",
      fragil: false, apilable: true,
      valorDeclarado: null, seguroMonto: null,
      documentosRef: "", notas: "Punto de recarga",
      ordenIndex: stops.length,
      chainId: null, chainRole: null,
    };
    setStops((arr)=>[...arr,nuevo]);
  }

  function addPickupEntregaPair({ pickup, entrega }) {
    // pickup y entrega: { cliente, address:{lat,lng,formatted}, pesoKg, volumenM3, unidades, ... }
    if (!hasLatLng(pickup?.address) || !hasLatLng(entrega?.address)) {
      alert("Pickup y entrega deben tener lat/lng."); return;
    }
    const chainId = genChainId();

    const pk = {
      orderId: `pk_${Date.now()}`,
      cliente: pickup.cliente || "Pickup muelle",
      direccionTexto: pickup.address.formatted || "",
      lat: tidyNum(pickup.address.lat),
      lng: tidyNum(pickup.address.lng),
      tipo: "pickup",
      esRecarga: false,
      pesoKg: tidyNum(pickup.pesoKg),
      volumenM3: tidyNum(pickup.volumenM3),
      unidades: tidyNum(pickup.unidades),
      // pickup = carga positiva
      deltaKg: tidyNum(pickup.pesoKg) || 0,
      deltaM3: tidyNum(pickup.volumenM3) || 0,
      deltaUnidades: tidyNum(pickup.unidades) || 0,
      prioridad: 3,
      ventanaInicioStop: pickup.ventanaInicioStop || "",
      ventanaFinStop: pickup.ventanaFinStop || "",
      tiempoServicioMin: tidyNum(pickup.tiempoServicioMin) || 10,
      contactoRecepcion: pickup.contactoRecepcion || "",
      telefonoRecepcion: pickup.telefonoRecepcion || "",
      fragil: !!pickup.fragil,
      apilable: pickup.apilable ?? true,
      valorDeclarado: tidyNum(pickup.valorDeclarado),
      seguroMonto: tidyNum(pickup.seguroMonto),
      documentosRef: pickup.documentosRef || "",
      notas: pickup.notas || "",
      ordenIndex: stops.length,
      chainId, chainRole: "pickup",
      otpEntrega: null, firmaDigitalUrl: null, fotosPodUrls: [],
      causalFalla: null, comentariosCliente: null,
    };

    const dr = {
      orderId: `dr_${Date.now()+1}`,
      cliente: entrega.cliente || "Entrega destino",
      direccionTexto: entrega.address.formatted || "",
      lat: tidyNum(entrega.address.lat),
      lng: tidyNum(entrega.address.lng),
      tipo: "drop", // entrega vinculada
      esRecarga: false,
      pesoKg: tidyNum(pickup.pesoKg),       // misma carga que se levantó
      volumenM3: tidyNum(pickup.volumenM3),
      unidades: tidyNum(pickup.unidades),
      // drop = descarga (negativo)
      deltaKg: tidyNum(pickup.pesoKg) ? -Math.abs(tidyNum(pickup.pesoKg)) : 0,
      deltaM3: tidyNum(pickup.volumenM3) ? -Math.abs(tidyNum(pickup.volumenM3)) : 0,
      deltaUnidades: tidyNum(pickup.unidades) ? -Math.abs(tidyNum(pickup.unidades)) : 0,
      prioridad: 3,
      ventanaInicioStop: entrega.ventanaInicioStop || "",
      ventanaFinStop: entrega.ventanaFinStop || "",
      tiempoServicioMin: tidyNum(entrega.tiempoServicioMin) || 10,
      contactoRecepcion: entrega.contactoRecepcion || "",
      telefonoRecepcion: entrega.telefonoRecepcion || "",
      fragil: !!entrega.fragil,
      apilable: entrega.apilable ?? true,
      valorDeclarado: tidyNum(entrega.valorDeclarado),
      seguroMonto: tidyNum(entrega.seguroMonto),
      documentosRef: entrega.documentosRef || "",
      notas: entrega.notas || "",
      ordenIndex: stops.length + 1,
      chainId, chainRole: "drop",
      otpEntrega: null, firmaDigitalUrl: null, fotosPodUrls: [],
      causalFalla: null, comentariosCliente: null,
    };

    setStops((arr) => [...arr, pk, dr]);
  }

  function removeStop(idx) {
    const arr = [...stops];
    arr.splice(idx, 1);
    for (let i=0; i<arr.length; i++) arr[i].ordenIndex = i;
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
    setStops((arr)=> arr.map((s,i)=> (i===idx ? { ...s, ...patch } : s)));
  }

  // ===== Crear orden rápida → stop
  async function crearOrdenRapidaYAgregar() {
    if (!empresaId) return alert("Falta empresaId en sesión.");
    if (!oCliente || !oFactura || !oFecha || !oHora || !oAddress) {
      return alert("Completa cliente, factura, fecha, hora y dirección.");
    }
    if (!hasLatLng(oAddress)) return alert("La dirección debe tener lat/lng.");

    const lat = tidyNum(oAddress.lat), lng = tidyNum(oAddress.lng);
    const nueva = {
      empresaId, cliente: oCliente, telefono: oTelefono || null,
      numeroFactura: oFactura, fecha: oFecha, hora: oHora,
      zona: oZona || null, address: { ...oAddress, lat, lng },
      destinoLat: lat, destinoLng: lng, direccionTexto: oAddress.formatted || "",
      pesoKg: tidyNum(oPesoKg), volumenM3: tidyNum(oVolumenM3), unidades: tidyNum(oUnidades),
      entregado: false, recibida: false, fechaRecibida: null, fechaEntregada: null,
      tiempoTotalEntrega: null, asignadoUid: null, asignadoNombre: null,
      createdAt: serverTimestamp(),
      usuario: actorNombre, rolUsuario: rol,
      creadoPorUid: actorId || null, creadoPorNombre: actorNombre || null,
      creadoPorRol: rol || null, creadoPorEmail: actorEmail || null,
    };

    try {
      const ref = await addDoc(collection(db, "ordenes"), nueva);
      addOrdenComoStop({ id: ref.id, ...nueva });
      setOCliente(""); setOTelefono(""); setOFactura("");
      setOFecha(todayISO()); setOHora("09:00"); setOZona("");
      setOAddress(null); setOPesoKg(null); setOVolumenM3(null); setOUnidades(null);
      setShowCrearOrden(false);
      alert("Orden creada y agregada a la ruta ✅");
    } catch (e) { alert(e?.message || "No pude crear la orden."); }
  }

  /** ───────── Cálculos de capacidad, ETA y carga en el tiempo ───────── */
  const calculos = useMemo(() => {
    // Carga acumulada por tramo, respetando recargas y deltas
    let kg = 0, m3 = 0, unid = 0;
    let kmTotal = 0, minTransito = 0;

    // Línea de tiempo de carga (por índice)
    const timeline = [];
    const vKmMin = 0.5; // 30km/h aprox

    // ETA por stop
    const etaPorStop = [];
    try {
      const start = new Date(`${fecha}T${ventanaInicio}:00`);
      let cursorMin = 0;
      for (let i=0; i<stops.length; i++) {
        const s = stops[i];
        if (i > 0) {
          const kms = kmBetween(stops[i-1], s);
          kmTotal += kms;
          const dmin = kms / vKmMin;
          minTransito += dmin;
          cursorMin += dmin;
        }
        const eta = new Date(start.getTime() + cursorMin * 60000);
        etaPorStop.push(eta);
        cursorMin += tidyNum(s.tiempoServicioMin) || 0;
      }
    } catch {}

    // capacidad (puede ser null)
    const capKg = Number.isFinite(capacidadKg) ? capacidadKg : null;
    const capM3 = Number.isFinite(capacidadM3) ? capacidadM3 : null;
    const capUn = Number.isFinite(capacidadUnidades) ? capacidadUnidades : null;

    // Carga acumulada tramo a tramo
    let currKg = 0, currM3 = 0, currUn = 0;
    let maxKgSeen = 0, maxM3Seen = 0, maxUnSeen = 0;

    for (let i=0; i<stops.length; i++) {
      const s = stops[i];

      // recarga: resetea
      if (s.esRecarga || s.tipo === "recarga") {
        timeline.push({
          idx: i+1, etiqueta: "RECARGA",
          currKg, currM3, currUn, reset: true
        });
        currKg = 0; currM3 = 0; currUn = 0;
      } else {
        const dKg = tidyNum(s.deltaKg) || 0;
        const dM3 = tidyNum(s.deltaM3) || 0;
        const dUn = tidyNum(s.deltaUnidades) || 0;
        currKg += dKg; currM3 += dM3; currUn += dUn;
        maxKgSeen = Math.max(maxKgSeen, currKg);
        maxM3Seen = Math.max(maxM3Seen, currM3);
        maxUnSeen = Math.max(maxUnSeen, currUn);
        timeline.push({
          idx: i+1,
          etiqueta: `${s.tipo === "pickup" ? "Pickup" : s.tipo === "drop" ? "Entrega" : s.tipo === "solo_entrega" ? "Entrega" : "Stop"}`,
          currKg, currM3, currUn, reset: false
        });
      }

      // totales de carga a entregar (absoluto de entregas)
      kg += Math.abs(tidyNum(s.pesoKg) || 0);
      m3 += Math.abs(tidyNum(s.volumenM3) || 0);
      unid += Math.abs(tidyNum(s.unidades) || 0);
    }

    // tiempos servicio
    const minServicio = stops.reduce((acc,s)=> acc+(tidyNum(s.tiempoServicioMin)||0), 0);
    const minTotales = minTransito + minServicio;
    const paradasHora = minTotales>0 ? (stops.length / (minTotales/60)) : null;

    // % de utilización final (sobre lo cargado total vs capacidad)
    const pctKg = capKg && capKg>0 ? (kg / capKg) * 100 : null;
    const pctM3 = capM3 && capM3>0 ? (m3 / capM3) * 100 : null;
    const pctUn = capUn && capUn>0 ? (unid / capUn) * 100 : null;

    return {
      kg, m3, unid,
      pctKg, pctM3, pctUn,
      kmTotal, minTransito, minServicio, minTotales, paradasHora,
      etaPorStop,
      timeline,
      capKg, capM3, capUn,
      maxKgSeen, maxM3Seen, maxUnSeen,
      currKg, currM3, currUn
    };
  }, [stops, capacidadKg, capacidadM3, capacidadUnidades, fecha, ventanaInicio]);

  // ===== Validaciones
  function validarAntesDePublicar() {
    const errs = [];

    if (!empresaId) errs.push("Falta empresaId en sesión.");
    if (!nombreRuta) errs.push("Falta nombre de la ruta.");
    if (!fecha) errs.push("Falta fecha.");
    if (!ventanaInicio || !ventanaFin) errs.push("Falta ventana de la ruta (inicio/fin).");

    if (!conductorUid || !conductorNombre) errs.push("Selecciona un mensajero registrado (UID y nombre).");
    else if (!conductorEsValido) errs.push("El mensajero debe existir en la lista de registrados.");

    if (stops.length === 0) errs.push("Agrega al menos una parada (stop).");
    if (stops.length > Number(maxStops || 60)) errs.push(`Excede MaxStops (${maxStops}).`);

    // Validar ventanas por stop dentro de la ventana de ruta
    const vRutaIni = ventanaInicio, vRutaFin = ventanaFin;
    for (const s of stops) {
      if (!Number.isFinite(tidyNum(s.lat)) || !Number.isFinite(tidyNum(s.lng))) { errs.push("Todos los stops deben tener lat/lng."); break; }
      if (s.ventanaInicioStop && s.ventanaFinStop) {
        if (s.ventanaInicioStop < vRutaIni || s.ventanaFinStop > vRutaFin) {
          errs.push(`Ventana de un stop fuera de la ventana de ruta (${s.cliente || s.orderId}).`);
          break;
        }
      }
    }

    if (estadoConductorRequerido === "disponible" && !["disponible","listo_para_ruta"].includes(conductorEstado)) {
      errs.push("El mensajero seleccionado no está disponible.");
    }

    // NUEVO: Validación de capacidad por TRAMO (no reventar en ningún punto)
    const { timeline, capKg, capM3, capUn } = calculos;
    for (const t of timeline) {
      if (t.reset) continue; // recarga
      if (capKg && t.currKg > capKg) errs.push(`Se excede capacidad en KG en el tramo #${t.idx} (acumulado ${t.currKg} > cap ${capKg}).`);
      if (capM3 && t.currM3 > capM3) errs.push(`Se excede capacidad en m³ en el tramo #${t.idx} (acumulado ${t.currM3} > cap ${capM3}).`);
      if (capUn && t.currUn > capUn) errs.push(`Se excede capacidad en unidades en el tramo #${t.idx} (acumulado ${t.currUn} > cap ${capUn}).`);
    }

    // NUEVO: Validar orden pickup→entrega para cadenas
    const chainPos = new Map(); // chainId -> { pickupIdx:?, dropIdx:? }
    stops.forEach((s, i) => {
      if (!s.chainId) return;
      const c = chainPos.get(s.chainId) || {};
      if (s.chainRole === "pickup") c.pickupIdx = i;
      if (s.chainRole === "drop") c.dropIdx = i;
      chainPos.set(s.chainId, c);
    });
    for (const [cid, pos] of chainPos.entries()) {
      if (pos.pickupIdx == null || pos.dropIdx == null) {
        errs.push(`Cadena ${cid} incompleta: falta pickup o entrega.`);
      } else if (pos.dropIdx <= pos.pickupIdx) {
        errs.push(`Cadena ${cid} inválida: la entrega debe ir después del pickup.`);
      }
    }

    return errs;
  }

  // ===== Guardar / Publicar (multi-fechas)
  async function guardarProgramacion(status = "draft") {
    if (!empresaId) return alert("Falta empresaId en sesión.");
    if (status === "published" && isGerente) {
      alert("Tu rol (gerente) es de solo lectura para publicar programaciones. Pide a un administrador u operador que publique.");
      return;
    }

    // Fechas a publicar (principal + extras)
    const fechasExtras = (fechasExtraTxt || "")
      .split(/\n|,|;/).map(s=>s.trim()).filter(Boolean);
    const fechasAProcesar = [fecha, ...fechasExtras.filter(f=>f !== fecha)];

    // Validación previa (solo una vez; aplica a todas las fechas)
    const errs = validarAntesDePublicar();
    if (errs.length) { alert("Corrige:\n• " + errs.join("\n• ")); return; }

    try {
      for (const fechaPub of fechasAProcesar) {
        const body = {
          empresaId,
          status, // "draft" | "published"
          nombreRuta,
          fecha: fechaPub, // << fecha específica
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
          titulo: nombreRuta ? `Entrega programada · ${nombreRuta} · ${fechaPub}` : `Entrega programada · ${fechaPub}`,
          kpiPre: {
            totalStops: stops.length,
            totalKg: calculos.kg,
            totalM3: calculos.m3,
            totalUnidades: calculos.unid,
            pctKg: calculos.pctKg,
            pctM3: calculos.pctM3,
            pctUn: calculos.pctUn,
            kmTotal: calculos.kmTotal,
            minTransito: calculos.minTransito,
            minServicio: calculos.minServicio,
            minTotales: calculos.minTotales,
            paradasHora: calculos.paradasHora ?? null,
          },
          // Enviamos stops con los nuevos campos
          stops: stops.map((s) => ({
            orderId: s.orderId,
            cliente: s.cliente || null,
            direccionTexto: s.direccionTexto || null,
            lat: tidyNum(s.lat), lng: tidyNum(s.lng),
            tipo: s.tipo || "solo_entrega",
            esRecarga: !!s.esRecarga,
            pesoKg: tidyNum(s.pesoKg),
            volumenM3: tidyNum(s.volumenM3),
            unidades: tidyNum(s.unidades),
            deltaKg: tidyNum(s.deltaKg),
            deltaM3: tidyNum(s.deltaM3),
            deltaUnidades: tidyNum(s.deltaUnidades),
            prioridad: Number(s.prioridad || 3),
            ventanaInicioStop: s.ventanaInicioStop || null,
            ventanaFinStop: s.ventanaFinStop || null,
            tiempoServicioMin: tidyNum(s.tiempoServicioMin),
            contactoRecepcion: s.contactoRecepcion || null,
            telefonoRecepcion: s.telefonoRecepcion || null,
            fragil: !!s.fragil, apilable: !!s.apilable,
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
            chainId: s.chainId || null,
            chainRole: s.chainRole || null,
          })),
          createdAt: serverTimestamp(),
          createdByUid: actorId || null, createdByNombre: actorNombre || null,
          createdByRol: rol || null, createdByEmail: actorEmail || null,
          publishedAt: status === "published" ? serverTimestamp() : null,
        };

        const ref = await addDoc(collection(db, "programasEntrega"), body);

        if (status === "published") {
          // Asignar órdenes unitarias reales (cuando exista orderId en /ordenes)
          for (let i=0; i<stops.length; i++) {
            const s = stops[i];
            // No persiste cambios en 'recarga' ni stops sintéticos pk/dr si no existen en /ordenes
            const esSintetico = s.orderId && (s.orderId.startsWith("pk_") || s.orderId.startsWith("dr_") || s.orderId.startsWith("recarga_"));
            if (!s.orderId || esSintetico) continue;

            const patch = {
              programacionId: ref.id, programaEntregaId: ref.id,
              ordenIndex: Number(s.ordenIndex || 0),
              esProgramada: true, tipoEntrega: "programada",
              programacionTitulo: body.titulo || `${nombreRuta || ref.id} · ${fechaPub}`,
              programacionFecha: fechaPub, programacionStatus: "published",
              programacionOrden: i+1, programacionTotal: stops.length,
              programacionPrioridad: Number(s.prioridad || 3),
              ventanaInicioStop: s.ventanaInicioStop || null,
              ventanaFinStop: s.ventanaFinStop || null,
              asignadoUid: conductorUid || null,
              asignadoNombre: conductorNombre || null,
              asignadoAt: serverTimestamp(),
              programadaResumen: {
                etiqueta: "Entrega programada",
                titulo: nombreRuta || ref.id,
                fecha: fechaPub,
                orden: i+1,
                total: stops.length,
                prioridad: Number(s.prioridad || 3),
                ventana: { inicio: s.ventanaInicioStop || null, fin: s.ventanaFinStop || null },
              },
              asignadoPorUid: actorId || null,
              asignadoPorNombre: actorNombre || null,
              asignadoPorRol: rol || null,
              asignadoPorEmail: actorEmail || null,
              // NUEVO: guardamos chain info si aplica (puede servir a POD)
              chainId: s.chainId || null,
              chainRole: s.chainRole || null,
            };
            await updateDoc(doc(db, "ordenes", s.orderId), patch);
            await logCambioOrden({
              orderId: s.orderId, empresaId,
              antes: null, despues: patch,
              actor: { id: actorId || null, nombre: actorNombre || "desconocido", rol, empresaId },
              motivo: "Asignada por Programación (planificado)",
            });
          }

          if (conductorUid) {
            await setDoc(doc(db, "ubicacionesMensajeros", conductorUid), {
              empresaId, nombre: conductorNombre || conductorUid,
              estado: "listo_para_ruta",
              estadoUpdatedAt: serverTimestamp(),
              lastPingAt: serverTimestamp(),
            }, { merge: true });
          }
        }
      }

      alert(status === "published"
        ? "Programación(es) publicada(s) y órdenes asignadas ✅"
        : "Borrador guardado ✅"
      );
    } catch (e) {
      console.error("guardarProgramacion:", e);
      alert(e?.message || "No pude guardar la programación.");
    }
  }

  // ===== Export/Compartir
  function exportCSV(filename, rows) {
    if (!rows?.length) return;
    const cols = Object.keys(rows[0]);
    const csv = [ cols.join(","), ...rows.map((r)=> cols.map((c)=> `"${String(r[c] ?? "").replace(/"/g,'""')}"`).join(",")) ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
  function exportarHojaRutaCSV() {
    const rows = stops.map((s,i)=>({
      ordenIndex: i, orderId: s.orderId, cliente: s.cliente || "",
      direccion: s.direccionTexto || "", lat: tidyNum(s.lat), lng: tidyNum(s.lng),
      tipo: s.tipo, prioridad: s.prioridad,
      pesoKg: tidyNum(s.pesoKg) || "", volumenM3: tidyNum(s.volumenM3) || "", unidades: tidyNum(s.unidades) || "",
      deltaKg: tidyNum(s.deltaKg) || "", deltaM3: tidyNum(s.deltaM3) || "", deltaUnidades: tidyNum(s.deltaUnidades) || "",
      ventanaInicioStop: s.ventanaInicioStop || "", ventanaFinStop: s.ventanaFinStop || "",
      tiempoServicioMin: tidyNum(s.tiempoServicioMin) || "",
      contacto: s.contactoRecepcion || "", telefono: s.telefonoRecepcion || "",
      fragil: s.fragil ? "sí" : "no", apilable: s.apilable ? "sí" : "no",
      notas: s.notas || "", waze: wazeUrl(tidyNum(s.lat), tidyNum(s.lng)) || "", gmaps: gmapsUrl(tidyNum(s.lat), tidyNum(s.lng)) || "",
      chainId: s.chainId || "", chainRole: s.chainRole || "", esRecarga: s.esRecarga ? "sí" : "no"
    }));
    exportCSV(`hoja_ruta_${(nombreRuta || "ruta").replace(/\s+/g,"_")}_${fecha}.csv`, rows);
  }
  function compartirWhatsApp() {
    const header = `Ruta: ${nombreRuta || "-"} | Fecha: ${fecha}
Conductor: ${conductorNombre || "-"} | Camión: ${camionNombre || "-"}
Paradas: ${stops.length} | Utilización (totales): KG ${pct(calculos.pctKg)}, m³ ${pct(calculos.pctM3)}, UN ${pct(calculos.pctUn)} | Paradas/h: ${calculos.paradasHora ? calculos.paradasHora.toFixed(1) : "—"}
-----------------------------`;
    const body = stops.map((s,i)=> {
      const lat = tidyNum(s.lat), lng = tidyNum(s.lng);
      const deltas = [
        Number.isFinite(tidyNum(s.deltaKg)) ? `ΔKg ${s.deltaKg}` : null,
        Number.isFinite(tidyNum(s.deltaM3)) ? `Δm³ ${s.deltaM3}` : null,
        Number.isFinite(tidyNum(s.deltaUnidades)) ? `ΔUn ${s.deltaUnidades}` : null,
      ].filter(Boolean).join(" · ");
      return `${i+1}. ${s.cliente || "Cliente"} (${s.direccionTexto || "-"})
- Tipo: ${s.esRecarga ? "RECARGA" : s.tipo}  Ventana: ${s.ventanaInicioStop || "—"}–${s.ventanaFinStop || "—"}
- Carga: ${fmtC(s)}  ${deltas ? `| ${deltas}` : ""}  Servicio: ${s.tiempoServicioMin || 0} min
- Waze: ${wazeUrl(lat, lng) || "-"}  | Maps: ${gmapsUrl(lat, lng) || "-"}`;
    }).join("\n\n");
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
  function pct(n) { return n == null ? "—" : `${n.toFixed(0)}%`; }

  /** ───────── Render ───────── */
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>🗺️ Programar Entregas</h2>
        {isGerente && <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-deeper)" }}>(modo lectura para publicar)</span>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={() => guardarProgramacion("draft")}>💾 Guardar borrador</button>
          <button
            disabled={isGerente}
            title={isGerente ? "Gerente: solo lectura. No puede publicar." : "Publicar y asignar a mensajero"}
            onClick={() => guardarProgramacion("published")}
          >
            🚀 Publicar y asignar
          </button>
          <button onClick={exportarHojaRutaCSV}>⬇️ Exportar hoja CSV</button>
          <button onClick={compartirWhatsApp}>📲 Compartir por WhatsApp</button>
        </div>
      </div>

      {!!error && <div style={{ marginTop: 8, color: "var(--danger)" }}>{error}</div>}

      {/* Datos de la programación */}
      <section style={card}>
        <h3 style={{ marginTop: 0 }}>1) Datos de la programación</h3>
        <div className="grid3">
          <div>
            <label>Nombre de la ruta</label>
            <input value={nombreRuta} onChange={(e) => setNombreRuta(e.target.value)} placeholder="RUTA-LUNES-A" />
          </div>
          <div>
            <label>Fecha principal</label>
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

        {/* NUEVO: fechas extra */}
        <div style={{ marginTop: 10 }}>
          <label>Fechas extra (una por línea, ej: 2025-10-12)</label>
          <textarea
            rows={2}
            placeholder="2025-10-12&#10;2025-10-13"
            value={fechasExtraTxt}
            onChange={(e)=>setFechasExtraTxt(e.target.value)}
          />
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
            Al publicar, se crearán programaciones clonadas para cada fecha listada (ideal para “el domingo” u otros días).
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
              <button type="button" title="Refrescar lista"
                onClick={() => setMensajeros((prev) => [...prev].sort((a,b)=>a.nombre.localeCompare(b.nombre)))}>
                🔄
              </button>
            </div>
            {!!errorMensajeros && <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 4 }}>{errorMensajeros}</div>}
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              * Debe ser alguien registrado. Evita escribir nombres manualmente que no existan.
            </div>
          </div>
          <div>
            <label>Total mensajeros</label>
            <input value={mensajeros.length} readOnly />
          </div>
        </div>

        {/* Campos originales conservados*/}
        <div className="grid3" style={{ marginTop: 8 }}>
          <div>
            <label>Conductor UID</label>
            <input
              value={conductorUid}
              onChange={(e) => {
                const v = e.target.value; setConductorUid(v);
                const m = mensajeros.find((mm) => mm.uid === v);
                if (m) { setConductorNombre(m.nombre); setErrorMensajeros(""); }
                else { setErrorMensajeros("UID no corresponde a un mensajero registrado."); }
              }}
              placeholder="uid-123"
            />
          </div>
          <div>
            <label>Conductor Nombre</label>
            <input value={conductorNombre} onChange={(e) => setConductorNombre(e.target.value)} placeholder="Juan Pérez" />
          </div>
          <div>
            <label>Max Stops</label>
            <input type="number" value={maxStops} onChange={(e) => setMaxStops(Number(e.target.value || 60))} />
          </div>
        </div>

        {/* Estado en vivo del conductor */}
        <div style={{ marginTop: 8, fontSize: 13 }}>
          <b>Estado del mensajero:</b>{" "}
          <span style={{ color: ["disponible","listo_para_ruta"].includes(conductorEstado) ? "var(--ok)" : "var(--danger)" }}>
            {conductorEstado}
          </span>
        </div>

        {/* KPIs */}
        <div style={{ marginTop: 10, display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Kpi label="Kg (totales ordenados)" value={`${(calculos.kg || 0).toFixed(1)} / ${capacidadKg ?? "—"}`} extra={`Util: ${pct(calculos.pctKg)}`} />
          <Kpi label="m³ (totales ordenados)" value={`${(calculos.m3 || 0).toFixed(2)} / ${capacidadM3 ?? "—"}`} extra={`Util: ${pct(calculos.pctM3)}`} />
          <Kpi label="Unidades (totales)" value={`${(calculos.unid || 0)} / ${capacidadUnidades ?? "—"}`} extra={`Util: ${pct(calculos.pctUn)}`} />
          <Kpi label="Distancia aprox." value={`${calculos.kmTotal.toFixed(1)} km`} />
          <Kpi label="Tiempo tránsito" value={`${calculos.minTransito.toFixed(0)} min`} />
          <Kpi label="Tiempo servicio" value={`${calculos.minServicio.toFixed(0)} min`} />
          <Kpi label="Tiempo total" value={`${calculos.minTotales.toFixed(0)} min`} />
          <Kpi label="Paradas / hora" value={calculos.paradasHora ? calculos.paradasHora.toFixed(1) : "—"} />
        </div>

        {/* NUEVO: Resumen de carga en el tiempo */}
        <div style={{ marginTop: 10 }}>
          <details>
            <summary style={{ cursor: "pointer" }}>📈 Ver timeline de carga (acumulado por tramo)</summary>
            <div style={{ marginTop: 8, overflowX: "auto" }}>
              {calculos.timeline.length ? (
                <table className="tbl" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <Th>#</Th>
                      <Th>Evento</Th>
                      <Th>Kg acum.</Th>
                      <Th>m³ acum.</Th>
                      <Th>Un acum.</Th>
                      <Th>Nota</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculos.timeline.map((t, i)=>(
                      <tr key={i}>
                        <Td>{t.idx}</Td>
                        <Td>{t.etiqueta}</Td>
                        <Td>{t.currKg ?? 0}</Td>
                        <Td>{t.currM3 ?? 0}</Td>
                        <Td>{t.currUn ?? 0}</Td>
                        <Td>{t.reset ? "Recarga: acumulados reseteados" : ""}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (<div>—</div>)}
            </div>
          </details>
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
          ) : (<div>No hay programaciones.</div>)}
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

          {/* Filtros de programadas */}
          <label>
            <input type="checkbox" checked={soloProgramadas} onChange={(e) => setSoloProgramadas(e.target.checked)} /> Solo programadas
          </label>
          <select value={programacionIdFiltro} onChange={(e) => setProgramacionIdFiltro(e.target.value)} style={{ minWidth: 220 }}>
            <option value="">(Todas las programaciones)</option>
            {programaciones.map(p => (
              <option key={p.id} value={p.id}>
                {p.nombreRuta || p.id} · {p.fecha} · {p.status}
              </option>
            ))}
          </select>
          <button onClick={() => { setSoloProgramadas(false); setProgramacionIdFiltro(""); }}>Limpiar filtros</button>

          <button onClick={() => setShowCrearOrden((v) => !v)}>➕ Crear orden rápida</button>
        </div>

        {showCrearOrden && (
          <div style={{ marginTop: 10, padding: 10, border: "1px dashed var(--border)", borderRadius: 8 }}>
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
          ) : (<div>No hay coincidencias.</div>)}
        </div>
      </section>

      {/* Gestión de paradas */}
      <section style={card}>
        <h3 style={{ marginTop: 0 }}>4) Paradas (stops) & 6) Secuenciación</h3>

        {/* NUEVO: Acciones rápidas para logística compuesta */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <details>
            <summary style={{ cursor:"pointer" }}>➕ Par pickup→entrega</summary>
            <PickupEntregaForm onCreate={addPickupEntregaPair} />
          </details>
          <details>
            <summary style={{ cursor:"pointer" }}>➕ Parada de recarga</summary>
            <RecargaForm onCreate={addRecargaStop} />
          </details>
        </div>

        {stops.length === 0 ? (
          <div>Agrega órdenes desde la bandeja o usa “Par pickup→entrega”.</div>
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
                  <Th>ΔKg</Th>
                  <Th>Δm³</Th>
                  <Th>ΔUn</Th>
                  <Th>Prior.</Th>
                  <Th>Ventana</Th>
                  <Th>Serv (min)</Th>
                  <Th>Contacto/Tel</Th>
                  <Th>Flags</Th>
                  <Th>Valor/Seguro</Th>
                  <Th>Docs</Th>
                  <Th>Lat,Lon</Th>
                  <Th>ETA*</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {stops.map((s, idx) => {
                  const lat = tidyNum(s.lat), lng = tidyNum(s.lng);
                  const eta = calculos.etaPorStop?.[idx];
                  const tipoOpts = [
                    { v:"solo_entrega", t:"solo_entrega" },
                    { v:"pickup", t:"pickup" },
                    { v:"drop", t:"drop" },
                    { v:"recarga", t:"recarga" },
                  ];
                  return (
                    <tr key={s.orderId}>
                      <Td style={{ whiteSpace: "nowrap" }}>{idx + 1}</Td>
                      <Td style={{ minWidth: 220 }}>
                        <div style={{ fontWeight: 600 }}>{s.cliente || s.orderId}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.direccionTexto || "—"}</div>
                        {s.chainId ? (
                          <div style={{ fontSize: 11, color: "var(--text-deeper)" }}>Cadena: {s.chainId} · Rol: {s.chainRole}</div>
                        ) : null}
                        {s.esRecarga ? (
                          <div className="badge badge-seq" title="Resetea acumulados">RECARGA</div>
                        ) : null}
                      </Td>

                      <Td>
                        <select value={s.tipo} onChange={(e) => updateStop(idx, { tipo: e.target.value, esRecarga: e.target.value === "recarga" })}>
                          {tipoOpts.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
                        </select>
                      </Td>

                      <Td><input type="number" value={s.pesoKg ?? ""} onChange={(e) => updateStop(idx, { pesoKg: tidyNum(e.target.value) })} style={mini} /></Td>
                      <Td><input type="number" value={s.volumenM3 ?? ""} onChange={(e) => updateStop(idx, { volumenM3: tidyNum(e.target.value) })} style={mini} /></Td>
                      <Td><input type="number" value={s.unidades ?? ""} onChange={(e) => updateStop(idx, { unidades: tidyNum(e.target.value) })} style={mini} /></Td>

                      <Td><input type="number" value={s.deltaKg ?? ""} onChange={(e) => updateStop(idx, { deltaKg: tidyNum(e.target.value) })} style={mini} /></Td>
                      <Td><input type="number" value={s.deltaM3 ?? ""} onChange={(e) => updateStop(idx, { deltaM3: tidyNum(e.target.value) })} style={mini} /></Td>
                      <Td><input type="number" value={s.deltaUnidades ?? ""} onChange={(e) => updateStop(idx, { deltaUnidades: tidyNum(e.target.value) })} style={mini} /></Td>

                      <Td><input type="number" min={1} max={5} value={s.prioridad ?? 3} onChange={(e) => updateStop(idx, { prioridad: Number(e.target.value||3) })} style={mini} /></Td>

                      <Td style={{ whiteSpace: "nowrap" }}>
                        <input type="time" value={s.ventanaInicioStop || ""} onChange={(e) => updateStop(idx, { ventanaInicioStop: e.target.value })} style={miniWide} />
                        <span>–</span>
                        <input type="time" value={s.ventanaFinStop || ""} onChange={(e) => updateStop(idx, { ventanaFinStop: e.target.value })} style={miniWide} />
                      </Td>

                      <Td><input type="number" value={s.tiempoServicioMin ?? 10} onChange={(e) => updateStop(idx, { tiempoServicioMin: tidyNum(e.target.value) })} style={mini} /></Td>

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

                      <Td><input placeholder="Docs ref" value={s.documentosRef || ""} onChange={(e) => updateStop(idx, { documentosRef: e.target.value })} style={miniWide} /></Td>

                      <Td style={{ minWidth: 220 }}>
                        <div style={{ marginBottom: 4 }}>
                          <input placeholder="Lat" value={lat ?? ""} onChange={(e) => updateStop(idx, { lat: tidyNum(e.target.value) })} style={{ ...mini, width: 90, marginRight: 6 }} />
                          <input placeholder="Lng" value={lng ?? ""} onChange={(e) => updateStop(idx, { lng: tidyNum(e.target.value) })} style={{ ...mini, width: 90 }} />
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
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
              * ETA y distancia son estimaciones locales (velocidad media 30 km/h).
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/** ───────── Formularios auxiliares ───────── */
function PickupEntregaForm({ onCreate }) {
  const [pk, setPk] = useState({ address:null, cliente:"Pickup muelle", pesoKg:null, volumenM3:null, unidades:null, ventanaInicioStop:"", ventanaFinStop:"" });
  const [dr, setDr] = useState({ address:null, cliente:"Entrega destino", ventanaInicioStop:"", ventanaFinStop:"" });

  return (
    <div style={{ marginTop: 8, padding: 10, border: "1px dashed var(--border)", borderRadius: 8 }}>
      <b>Crear par Pickup → Entrega</b>
      <div className="grid3" style={{ marginTop: 6 }}>
        <div className="col-span-2">
          <label>📦 Pickup (origen)</label>
          <AddressInput value={pk.address} onChange={(v)=>setPk(o=>({...o, address:v}))} />
        </div>
        <div>
          <label>Cliente Pickup</label>
          <input value={pk.cliente} onChange={(e)=>setPk(o=>({...o, cliente:e.target.value}))} />
        </div>
        <div><label>Peso (kg)</label><input type="number" value={pk.pesoKg ?? ""} onChange={(e)=>setPk(o=>({...o, pesoKg: tidyNum(e.target.value)}))} /></div>
        <div><label>Volumen (m³)</label><input type="number" value={pk.volumenM3 ?? ""} onChange={(e)=>setPk(o=>({...o, volumenM3: tidyNum(e.target.value)}))} /></div>
        <div><label>Unidades</label><input type="number" value={pk.unidades ?? ""} onChange={(e)=>setPk(o=>({...o, unidades: tidyNum(e.target.value)}))} /></div>
        <div><label>Ventana pickup (ini)</label><input type="time" value={pk.ventanaInicioStop} onChange={(e)=>setPk(o=>({...o, ventanaInicioStop:e.target.value}))} /></div>
        <div><label>Ventana pickup (fin)</label><input type="time" value={pk.ventanaFinStop} onChange={(e)=>setPk(o=>({...o, ventanaFinStop:e.target.value}))} /></div>
      </div>

      <div className="grid3" style={{ marginTop: 6 }}>
        <div className="col-span-2">
          <label>🎯 Entrega (destino)</label>
          <AddressInput value={dr.address} onChange={(v)=>setDr(o=>({...o, address:v}))} />
        </div>
        <div>
          <label>Cliente Entrega</label>
          <input value={dr.cliente} onChange={(e)=>setDr(o=>({...o, cliente:e.target.value}))} />
        </div>
        <div><label>Ventana entrega (ini)</label><input type="time" value={dr.ventanaInicioStop} onChange={(e)=>setDr(o=>({...o, ventanaInicioStop:e.target.value}))} /></div>
        <div><label>Ventana entrega (fin)</label><input type="time" value={dr.ventanaFinStop} onChange={(e)=>setDr(o=>({...o, ventanaFinStop:e.target.value}))} /></div>
      </div>

      <div style={{ marginTop: 8 }}>
        <button onClick={()=> onCreate({ pickup: pk, entrega: dr })}>Agregar par ➕</button>
      </div>
    </div>
  );
}

function RecargaForm({ onCreate }) {
  const [hub, setHub] = useState(null);
  return (
    <div style={{ marginTop: 8, padding: 10, border: "1px dashed var(--border)", borderRadius: 8 }}>
      <b>Agregar parada de recarga (hub/CD)</b>
      <div style={{ marginTop: 6 }}>
        <label>Dirección</label>
        <AddressInput value={hub} onChange={setHub} />
      </div>
      <div style={{ marginTop: 8 }}>
        <button onClick={()=> onCreate(hub)}>Agregar recarga ➕</button>
      </div>
    </div>
  );
}

/** ───────── UI helpers ───────── */
const card = {
  marginTop: 12,
  padding: 12,
  border: "1px solid var(--border)",
  borderRadius: 12,
  background: "var(--bg)",
  boxShadow: "0 1px 2px rgba(16, 24, 40, 0.04)",
};
const Th = ({ children }) => (
  <th
    style={{
      textAlign: "left",
      borderBottom: "1px solid var(--border)",
      padding: "10px 12px",
      background: "var(--bg-sticky)",
      color: "var(--text-deeper)",
      fontWeight: 600,
      position: "sticky", top: 0, zIndex: 1,
    }}
  >
    {children}
  </th>
);
const Td = ({ children, style }) => (
  <td style={{ borderBottom: "1px solid var(--border-soft)", padding: "9px 12px", ...style }}>
    {children}
  </td>
);
const mini = { width: 80, padding: "4px 6px" };
const miniWide = { width: 120, padding: "4px 6px" };

function Kpi({ label, value, extra }) {
  return (
    <div style={{ padding: 10, border: "1px dashed var(--border-soft)", borderRadius: 12, background: "var(--bg-soft)", minWidth: 160 }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>{value}</div>
      {extra && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{extra}</div>}
    </div>
  );
}

/** Estilos globales con paleta simplificada */
const css = document.createElement("style");
css.innerHTML = `
  :root{
    --bg:#ffffff;
    --bg-soft:#f9fafb;
    --bg-sticky:#f8fafc;
    --text:#111827;
    --text-deeper:#334155;
    --text-muted:#667085;
    --border:#e5e7eb;
    --border-soft:#eef2f7;
    --primary:#6366f1;
    --primary-soft:#eef2ff;
    --ok:#0a0;
    --danger:#b00;
    --badge-seq-bg:#f1f5f9;
    --badge-seq-border:#b7c7dd;
    --success:#065f46;
    --success-soft:#ecfdf5;
  }

  .grid3 {
    display: grid; gap: 10px;
    grid-template-columns: repeat(3, minmax(220px, 1fr));
  }
  .col-span-2 { grid-column: span 2; }
  input, select, textarea {
    padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; width: 100%; background: #fff;
  }
  input:focus, select:focus, textarea:focus {
    outline: none; border-color: #c7d2fe; box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
  }
  label { display: block; font-size: 12px; color: #475569; margin-bottom: 6px; }

  .tbl { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: #fff; }
  .tbl tbody tr:nth-child(odd) td { background: #fbfdff; }
  .tbl tbody tr:hover td { background: var(--primary-soft); }

  .badge {
    display: inline-block; line-height: 1; padding: 4px 8px; border-radius: 999px;
    font-size: 11px; font-weight: 600; border: 1px solid transparent; margin-right: 6px;
  }
  .badge-prog { color: #372c8b; background: var(--primary-soft); border-color: #616a8d; }
  .badge-uni { color: var(--success); background: var(--success-soft); border-color: #bbf7d0; }
  .badge-seq { color: var(--text-deeper); background: var(--badge-seq-bg); border-color: var(--badge-seq-border); margin-left: 6px; }

  button {
    background: var(--primary); color: #000; border: 1px solid var(--primary);
    border-radius: 10px; padding: 8px 12px; cursor: pointer;
  }
  button:hover { filter: brightness(0.95); }
  button:disabled { background: #99a7dd; border-color: #8b8ead; cursor: not-allowed; }

  table { font-size: 14px; }
`;
document.head.appendChild(css);
