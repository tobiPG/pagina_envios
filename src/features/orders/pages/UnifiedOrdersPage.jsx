// src/features/orders/pages/UnifiedOrdersPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { db, functions } from "../../../shared/services/firebase.js";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  doc,
  updateDoc,
  getDocs
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import AddressInput from "../../../shared/components/AddressInput.jsx";

// Inject CSS once
function injectCssOnce() {
  if (document.getElementById("unifiedOrdersCss")) return;
  const css = document.createElement("style");
  css.id = "unifiedOrdersCss";
  css.innerHTML = `
    .unified-orders-container { padding: 20px; max-width: 1200px; margin: 0 auto; }
    .order-type-tabs { display: flex; gap: 8px; margin-bottom: 20px; }
    .tab { padding: 12px 20px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; cursor: pointer; transition: all 0.2s; }
    .tab.active { background: #6366f1; color: white; border-color: #6366f1; }
    .tab:hover:not(.active) { background: #f8fafc; }
    
    .form-section { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
    .section-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #111827; }
    
    .form-grid { display: grid; gap: 16px; }
    .form-grid.cols-2 { grid-template-columns: repeat(2, 1fr); }
    .form-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
    
    .form-group { display: flex; flex-direction: column; gap: 4px; }
    .form-label { font-size: 12px; font-weight: 600; color: #475569; }
    .form-input { padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 14px; }
    .form-input:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1); }
    
    .stops-container { border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
    .stop-item { padding: 16px; border-bottom: 1px solid #e5e7eb; background: #f8fafc; }
    .stop-item:last-child { border-bottom: none; }
    .stop-header { display: flex; justify-content: between; align-items: center; margin-bottom: 12px; }
    .stop-number { background: #6366f1; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; }
    
    .add-stop-btn { background: #10b981; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; }
    .add-stop-btn:hover { background: #059669; }
    .remove-stop-btn { background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; }
    .remove-stop-btn:hover { background: #dc2626; }
    
    .btn { padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s; }
    .btn-primary { background: #6366f1; color: white; border: 1px solid #6366f1; }
    .btn-primary:hover { background: #5856eb; }
    .btn-secondary { background: #fff; color: #374151; border: 1px solid #e5e7eb; }
    .btn-secondary:hover { background: #f8fafc; }
    
    .orders-list { margin-top: 30px; }
    .order-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
    .order-header { display: flex; justify-content: between; align-items: center; margin-bottom: 8px; }
    .order-id { font-weight: 600; color: #111827; }
    .order-status { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
    .status-pending { background: #fef3c7; color: #92400e; }
    .status-assigned { background: #dbeafe; color: #1e40af; }
    .status-in-progress { background: #fde68a; color: #b45309; }
    .status-completed { background: #d1fae5; color: #065f46; }
    
    .stops-summary { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .stop-badge { background: #f3f4f6; color: #374151; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
    
    .error { color: #ef4444; font-size: 14px; margin-top: 8px; }
    .success { color: #10b981; font-size: 14px; margin-top: 8px; }
  `;
  document.head.appendChild(css);
}

export default function UnifiedOrdersPage() {
  injectCssOnce();
  
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // State - TODOS los hooks deben ir ANTES de cualquier return condicional
  const [usuario, setUsuario] = useState(null);
  const [userLoading, setUserLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("basic"); // "basic" | "advanced"
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  // Estados para asignación de mensajeros
  const [mensajeros, setMensajeros] = useState([]);
  const [loadingMensajeros, setLoadingMensajeros] = useState(false);
  const [assigningOrder, setAssigningOrder] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedMensajero, setSelectedMensajero] = useState("");

  // Basic form state
  const [basicForm, setBasicForm] = useState({
    cliente: "",
    telefono: "",
    direccionTexto: "",
    addressLat: "",
    addressLng: "",
    monto: "",
    numeroFactura: "",
    fecha: "",
    hora: "",
    notas: ""
  });

  // Advanced form state with multiple stops
  const [advancedForm, setAdvancedForm] = useState({
    cliente: "",
    telefono: "",
    numeroFactura: "",
    monto: "",
    fecha: "",
    hora: "",
    prioridad: 3,
    notas: "",
    stops: [
      {
        id: 1,
        tipo: "pickup", // "pickup" | "delivery"
        direccionTexto: "",
        addressLat: "",
        addressLng: "",
        contacto: "",
        telefonoContacto: "",
        ventanaInicio: "",
        ventanaFin: "",
        instrucciones: "",
        requiereConfirmacion: false
      }
    ]
  });

  // Cloud function
  const createOrderFn = useMemo(() => httpsCallable(functions, "createOrder"), []);

  // Check user on component mount
  useEffect(() => {
    try {
      const usuarioLS = JSON.parse(localStorage.getItem("usuarioActivo") || "null");
      if (!usuarioLS || !usuarioLS.uid || !usuarioLS.empresaId) {
        navigate("/login");
        return;
      }
      setUsuario(usuarioLS);
    } catch (error) {
      console.error("Error parsing user data:", error);
      navigate("/login");
      return;
    } finally {
      setUserLoading(false);
    }
  }, [navigate]);

  // Load orders
  useEffect(() => {
    if (!usuario || !usuario.empresaId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    
    // Temporalmente quitamos orderBy para evitar el error de índice
    // Más tarde se puede agregar el índice en Firebase para usar ordenamiento
    const q = query(
      collection(db, "ordenes"),
      where("empresaId", "==", usuario.empresaId)
      // orderBy("fechaCreacion", "desc") // Comentado temporalmente
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Ordenamos en el cliente como solución temporal
      ordersData.sort((a, b) => {
        const dateA = a.fechaCreacion?.toDate ? a.fechaCreacion.toDate() : new Date(a.fechaCreacion || 0);
        const dateB = b.fechaCreacion?.toDate ? b.fechaCreacion.toDate() : new Date(b.fechaCreacion || 0);
        return dateB - dateA; // desc
      });
      
      setOrders(ordersData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [usuario]);

  // DEBUG: Verificar mensajeros manualmente
  const debugMensajeros = async () => {
    if (!usuario?.empresaId) return;
    
    try {
      console.log("🔍 DEBUG MANUAL - Verificando mensajeros...");
      
      // Query 1: Todos los usuarios
      const allUsersQuery = query(collection(db, "usuarios"));
      const allUsersSnap = await getDocs(allUsersQuery);
      console.log("👥 Todos los usuarios:", allUsersSnap.docs.map(d => ({
        id: d.id, 
        empresaId: d.data().empresaId,
        rol: d.data().rol,
        nombre: d.data().nombre
      })));
      
      // Query 2: Solo de esta empresa
      const empresaUsersQuery = query(
        collection(db, "usuarios"),
        where("empresaId", "==", usuario.empresaId)
      );
      const empresaUsersSnap = await getDocs(empresaUsersQuery);
      console.log("🏢 Usuarios de empresa-test-001:", empresaUsersSnap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })));
      
      // Query 3: Solo mensajeros de esta empresa
      const mensajerosQuery = query(
        collection(db, "usuarios"),
        where("empresaId", "==", usuario.empresaId),
        where("rol", "==", "mensajero")
      );
      const mensajerosSnap = await getDocs(mensajerosQuery);
      console.log("📧 Mensajeros de empresa-test-001:", mensajerosSnap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })));
      
    } catch (error) {
      console.error("❌ Error en debug:", error);
    }
  };

  // Load mensajeros
  useEffect(() => {
    console.log("🔍 Cargando mensajeros para empresa:", usuario?.empresaId);
    if (!usuario || !usuario.empresaId) {
      return;
    }
    
    // Ejecutar debug
    debugMensajeros();

    setLoadingMensajeros(true);
    const q = query(
      collection(db, "usuarios"),
      where("empresaId", "==", usuario.empresaId),
      where("rol", "==", "mensajero")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const mensajerosData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log("✅ Mensajeros encontrados:", mensajerosData);
      console.log("📊 Total documentos en query:", snapshot.docs.length);
      console.log("📋 Docs raw:", snapshot.docs.map(d => ({id: d.id, data: d.data()})));
      setMensajeros(mensajerosData);
      setLoadingMensajeros(false);
    });

    return () => unsubscribe();
  }, [usuario]);

  // Add stop to advanced form
  const addStop = () => {
    setAdvancedForm(prev => ({
      ...prev,
      stops: [
        ...prev.stops,
        {
          id: Date.now(),
          tipo: "delivery",
          direccionTexto: "",
          addressLat: "",
          addressLng: "",
          contacto: "",
          telefonoContacto: "",
          ventanaInicio: "",
          ventanaFin: "",
          instrucciones: "",
          requiereConfirmacion: false
        }
      ]
    }));
  };

  // Remove stop from advanced form
  const removeStop = (stopId) => {
    setAdvancedForm(prev => ({
      ...prev,
      stops: prev.stops.filter(stop => stop.id !== stopId)
    }));
  };

  // Update stop in advanced form
  const updateStop = (stopId, field, value) => {
    setAdvancedForm(prev => ({
      ...prev,
      stops: prev.stops.map(stop => 
        stop.id === stopId ? { ...stop, [field]: value } : stop
      )
    }));
  };

  // Submit basic order
  const submitBasicOrder = async () => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      // User validation
      if (!usuario || !usuario.empresaId || !usuario.uid) {
        throw new Error("Usuario no válido. Por favor, inicia sesión nuevamente.");
      }

      // Validation
      if (!basicForm.cliente.trim()) {
        throw new Error("El nombre del cliente es requerido");
      }
      // Validar que tenga dirección (texto) O coordenadas (del mapa)
      if (!basicForm.direccionTexto.trim() && (!basicForm.addressLat || !basicForm.addressLng)) {
        throw new Error("La dirección es requerida (puedes escribirla o seleccionarla en el mapa)");
      }

      const orderData = {
        ...basicForm,
        empresaId: usuario.empresaId,
        creadoPor: usuario.uid,
        tipo: "basica",
        estado: "pendiente",
        fechaCreacion: serverTimestamp(),
        // ✅ Agregar coordenadas en el formato correcto
        destinoLat: basicForm.addressLat ? parseFloat(basicForm.addressLat) : null,
        destinoLng: basicForm.addressLng ? parseFloat(basicForm.addressLng) : null,
        direccionTexto: basicForm.direccionTexto,
        address: {
          lat: basicForm.addressLat ? parseFloat(basicForm.addressLat) : null,
          lng: basicForm.addressLng ? parseFloat(basicForm.addressLng) : null,
          formatted: basicForm.direccionTexto
        },
        stops: [
          {
            id: 1,
            tipo: "delivery",
            direccionTexto: basicForm.direccionTexto,
            addressLat: basicForm.addressLat,
            addressLng: basicForm.addressLng,
            contacto: basicForm.cliente,
            telefonoContacto: basicForm.telefono,
            instrucciones: basicForm.notas || "",
            requiereConfirmacion: false
          }
        ]
      };

      await addDoc(collection(db, "ordenes"), orderData);
      
      setSuccess("Orden básica creada exitosamente");
      setBasicForm({
        cliente: "",
        telefono: "",
        direccionTexto: "",
        addressLat: "",
        addressLng: "",
        monto: "",
        numeroFactura: "",
        fecha: "",
        hora: "",
        notas: ""
      });

    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Submit advanced order
  const submitAdvancedOrder = async () => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      // User validation
      if (!usuario || !usuario.empresaId || !usuario.uid) {
        throw new Error("Usuario no válido. Por favor, inicia sesión nuevamente.");
      }

      // Validation
      if (!advancedForm.cliente.trim()) {
        throw new Error("El nombre del cliente es requerido");
      }
      if (advancedForm.stops.length === 0) {
        throw new Error("Debe agregar al menos una parada");
      }
      
      // Validar que todas las paradas tengan dirección (texto) O coordenadas (del mapa)
      const hasEmptyStops = advancedForm.stops.some(stop => 
        !stop.direccionTexto.trim() && (!stop.addressLat || !stop.addressLng)
      );
      if (hasEmptyStops) {
        throw new Error("Todas las paradas deben tener una dirección (puedes escribirla o seleccionarla en el mapa)");
      }

      // ✅ Usar las coordenadas de la primera parada como destino principal
      const firstStop = advancedForm.stops[0];
      
      const orderData = {
        ...advancedForm,
        empresaId: usuario.empresaId,
        creadoPor: usuario.uid,
        tipo: "avanzada",
        estado: "pendiente",
        fechaCreacion: serverTimestamp(),
        // ✅ Agregar coordenadas de la primera parada como destino principal
        destinoLat: firstStop?.addressLat ? parseFloat(firstStop.addressLat) : null,
        destinoLng: firstStop?.addressLng ? parseFloat(firstStop.addressLng) : null,
        direccionTexto: firstStop?.direccionTexto || "",
        address: {
          lat: firstStop?.addressLat ? parseFloat(firstStop.addressLat) : null,
          lng: firstStop?.addressLng ? parseFloat(firstStop.addressLng) : null,
          formatted: firstStop?.direccionTexto || ""
        }
      };

      await addDoc(collection(db, "ordenes"), orderData);
      
      setSuccess("Orden avanzada creada exitosamente");
      setAdvancedForm({
        cliente: "",
        telefono: "",
        numeroFactura: "",
        monto: "",
        fecha: "",
        hora: "",
        prioridad: 3,
        notas: "",
        stops: [
          {
            id: 1,
            tipo: "pickup",
            direccionTexto: "",
            addressLat: "",
            addressLng: "",
            contacto: "",
            telefonoContacto: "",
            ventanaInicio: "",
            ventanaFin: "",
            instrucciones: "",
            requiereConfirmacion: false
          }
        ]
      });

    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Assign messenger to order
  const assignMensajero = async (orderId, mensajeroId, mensajeroNombre) => {
    try {
      setError("");
      setSuccess("");

      console.log("Asignando mensajero:", { orderId, mensajeroId, mensajeroNombre });
      console.log("Usuario actual:", usuario);
      console.log("Rol del usuario:", usuario?.rol);
      console.log("Empresa del usuario:", usuario?.empresaId);
      
      // Check the order data to see if it's a multi-stop order
      const orderToAssign = orders.find(order => order.id === orderId);
      console.log("Orden a asignar:", orderToAssign);
      console.log("Tipo de orden:", orderToAssign?.tipo);
      console.log("Tiene stops:", orderToAssign?.stops?.length);

      // Validaciones previas
      if (!orderId || !mensajeroId || !mensajeroNombre) {
        setError("Datos incompletos para la asignación");
        return;
      }

      if (!usuario || !usuario.empresaId) {
        setError("Usuario no autenticado correctamente");
        return;
      }

      const updateData = {
        mensajeroId: mensajeroId,
        mensajeroNombre: mensajeroNombre,
        estado: "asignada",
        fechaAsignacion: serverTimestamp()
      };

      console.log("Datos de actualización:", updateData);
      console.log("Intentando actualizar documento con ID:", orderId);

      // Try to read the document first to see if it exists and has the right permissions
      try {
        const docRef = doc(db, "ordenes", orderId);
        console.log("Referencia del documento:", docRef);
        await updateDoc(docRef, updateData);
      } catch (updateError) {
        console.error("Error específico en updateDoc:", updateError);
        throw updateError;
      }

      const accion = assigningOrder.mensajeroId ? 'cambiada' : 'asignada';
      setSuccess(`Orden ${accion} exitosamente a ${mensajeroNombre}`);
      setShowAssignModal(false);
      setAssigningOrder(null);

    } catch (err) {
      console.error("Error completo:", err);
      console.error("Código de error:", err.code);
      console.error("Mensaje de error:", err.message);
      setError(`Error al asignar mensajero: ${err.message}`);
    }
  };

  // Open assign modal
  const openAssignModal = (order) => {
    setAssigningOrder(order);
    // Si la orden ya tiene un mensajero asignado, preseleccionarlo
    setSelectedMensajero(order.mensajeroId || "");
    setShowAssignModal(true);
  };

  // Close assign modal
  const closeAssignModal = () => {
    setShowAssignModal(false);
    setAssigningOrder(null);
    setSelectedMensajero("");
  };

  // DESPUÉS de declarar todos los hooks, hacer las validaciones condicionales
  if (userLoading) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <p>Verificando usuario...</p>
      </div>
    );
  }

  if (!usuario) {
    navigate("/login");
    return null;
  }

  return (
    <div className="unified-orders-container">
      <h1 style={{ fontSize: "24px", fontWeight: "600", marginBottom: "20px" }}>
        📦 Gestión de Órdenes y Entregas
      </h1>

      {/* Tab Navigation */}
      <div className="order-type-tabs">
        <button
          className={`tab ${activeTab === "basic" ? "active" : ""}`}
          onClick={() => setActiveTab("basic")}
        >
          🚚 Orden Básica
        </button>
        <button
          className={`tab ${activeTab === "advanced" ? "active" : ""}`}
          onClick={() => setActiveTab("advanced")}
        >
          🗺️ Orden Avanzada (Multi-Stop)
        </button>
        <button
          className={`tab ${activeTab === "list" ? "active" : ""}`}
          onClick={() => setActiveTab("list")}
        >
          📋 Lista de Órdenes
        </button>
      </div>

      {/* Error/Success Messages */}
      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      {/* Basic Order Form */}
      {activeTab === "basic" && (
        <div className="form-section">
          <h2 className="section-title">Crear Orden Básica</h2>
          <p style={{ color: "#64748b", marginBottom: "20px" }}>
            Formulario simple para órdenes con un solo destino
          </p>

          <div className="form-grid cols-2">
            <div className="form-group">
              <label className="form-label">Cliente *</label>
              <input
                type="text"
                className="form-input"
                value={basicForm.cliente}
                onChange={(e) => setBasicForm(prev => ({ ...prev, cliente: e.target.value }))}
                placeholder="Nombre del cliente"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Teléfono</label>
              <input
                type="tel"
                className="form-input"
                value={basicForm.telefono}
                onChange={(e) => setBasicForm(prev => ({ ...prev, telefono: e.target.value }))}
                placeholder="Número de teléfono"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Número de Factura</label>
              <input
                type="text"
                className="form-input"
                value={basicForm.numeroFactura}
                onChange={(e) => setBasicForm(prev => ({ ...prev, numeroFactura: e.target.value }))}
                placeholder="Número de factura"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Monto</label>
              <input
                type="number"
                className="form-input"
                value={basicForm.monto}
                onChange={(e) => setBasicForm(prev => ({ ...prev, monto: e.target.value }))}
                placeholder="0.00"
                step="0.01"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Fecha</label>
              <input
                type="date"
                className="form-input"
                value={basicForm.fecha}
                onChange={(e) => setBasicForm(prev => ({ ...prev, fecha: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Hora</label>
              <input
                type="time"
                className="form-input"
                value={basicForm.hora}
                onChange={(e) => setBasicForm(prev => ({ ...prev, hora: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginTop: "16px" }}>
            <label className="form-label">Dirección de Entrega *</label>
            <AddressInput
              value={{
                texto: basicForm.direccionTexto,
                lat: basicForm.addressLat,
                lng: basicForm.addressLng
              }}
              onChange={(address) => {
                console.log("🔧 DEBUG - Address received:", address);
                setBasicForm(prev => ({
                  ...prev,
                  direccionTexto: address.texto || address.formatted || "",
                  addressLat: address.lat || "",
                  addressLng: address.lng || ""
                }));
              }}
            />
          </div>

          <div className="form-group" style={{ marginTop: "16px" }}>
            <label className="form-label">Notas</label>
            <textarea
              className="form-input"
              value={basicForm.notas}
              onChange={(e) => setBasicForm(prev => ({ ...prev, notas: e.target.value }))}
              placeholder="Instrucciones especiales..."
              rows="3"
            />
          </div>

          <div style={{ marginTop: "20px" }}>
            <button
              className="btn btn-primary"
              onClick={submitBasicOrder}
              disabled={saving}
            >
              {saving ? "Creando..." : "Crear Orden Básica"}
            </button>
          </div>
        </div>
      )}

      {/* Advanced Order Form */}
      {activeTab === "advanced" && (
        <div className="form-section">
          <h2 className="section-title">Crear Orden Avanzada (Multi-Stop)</h2>
          <p style={{ color: "#64748b", marginBottom: "20px" }}>
            Formulario completo para órdenes con múltiples paradas y opciones avanzadas
          </p>

          {/* Basic Info */}
          <div className="form-grid cols-3">
            <div className="form-group">
              <label className="form-label">Cliente *</label>
              <input
                type="text"
                className="form-input"
                value={advancedForm.cliente}
                onChange={(e) => setAdvancedForm(prev => ({ ...prev, cliente: e.target.value }))}
                placeholder="Nombre del cliente"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Teléfono</label>
              <input
                type="tel"
                className="form-input"
                value={advancedForm.telefono}
                onChange={(e) => setAdvancedForm(prev => ({ ...prev, telefono: e.target.value }))}
                placeholder="Número de teléfono"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Número de Factura</label>
              <input
                type="text"
                className="form-input"
                value={advancedForm.numeroFactura}
                onChange={(e) => setAdvancedForm(prev => ({ ...prev, numeroFactura: e.target.value }))}
                placeholder="Número de factura"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Monto</label>
              <input
                type="number"
                className="form-input"
                value={advancedForm.monto}
                onChange={(e) => setAdvancedForm(prev => ({ ...prev, monto: e.target.value }))}
                placeholder="0.00"
                step="0.01"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Fecha</label>
              <input
                type="date"
                className="form-input"
                value={advancedForm.fecha}
                onChange={(e) => setAdvancedForm(prev => ({ ...prev, fecha: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Hora</label>
              <input
                type="time"
                className="form-input"
                value={advancedForm.hora}
                onChange={(e) => setAdvancedForm(prev => ({ ...prev, hora: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Prioridad</label>
              <select
                className="form-input"
                value={advancedForm.prioridad}
                onChange={(e) => setAdvancedForm(prev => ({ ...prev, prioridad: parseInt(e.target.value) }))}
              >
                <option value={1}>🔴 Muy Alta</option>
                <option value={2}>🟡 Alta</option>
                <option value={3}>🟢 Normal</option>
                <option value={4}>🔵 Baja</option>
                <option value={5}>⚪ Muy Baja</option>
              </select>
            </div>
          </div>

          {/* Stops Section */}
          <div style={{ marginTop: "24px" }}>
            <div style={{ display: "flex", justifyContent: "between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: "600" }}>Paradas de la Entrega</h3>
              <button className="add-stop-btn" onClick={addStop}>
                + Agregar Parada
              </button>
            </div>

            <div className="stops-container">
              {advancedForm.stops.map((stop, index) => (
                <div key={stop.id} className="stop-item">
                  <div className="stop-header">
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div className="stop-number">{index + 1}</div>
                      <select
                        className="form-input"
                        style={{ width: "auto", minWidth: "120px" }}
                        value={stop.tipo}
                        onChange={(e) => updateStop(stop.id, "tipo", e.target.value)}
                      >
                        <option value="pickup">📦 Recogida</option>
                        <option value="delivery">🚚 Entrega</option>
                      </select>
                    </div>
                    {advancedForm.stops.length > 1 && (
                      <button
                        className="remove-stop-btn"
                        onClick={() => removeStop(stop.id)}
                      >
                        Eliminar
                      </button>
                    )}
                  </div>

                  <div className="form-grid cols-2" style={{ marginBottom: "12px" }}>
                    <div className="form-group">
                      <label className="form-label">Contacto</label>
                      <input
                        type="text"
                        className="form-input"
                        value={stop.contacto}
                        onChange={(e) => updateStop(stop.id, "contacto", e.target.value)}
                        placeholder="Nombre del contacto"
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Teléfono</label>
                      <input
                        type="tel"
                        className="form-input"
                        value={stop.telefonoContacto}
                        onChange={(e) => updateStop(stop.id, "telefonoContacto", e.target.value)}
                        placeholder="Teléfono del contacto"
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Ventana Inicio</label>
                      <input
                        type="datetime-local"
                        className="form-input"
                        value={stop.ventanaInicio}
                        onChange={(e) => updateStop(stop.id, "ventanaInicio", e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Ventana Fin</label>
                      <input
                        type="datetime-local"
                        className="form-input"
                        value={stop.ventanaFin}
                        onChange={(e) => updateStop(stop.id, "ventanaFin", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: "12px" }}>
                    <label className="form-label">Dirección *</label>
                    <AddressInput
                      value={{
                        texto: stop.direccionTexto,
                        lat: stop.addressLat,
                        lng: stop.addressLng
                      }}
                      onChange={(address) => {
                        updateStop(stop.id, "direccionTexto", address.texto || "");
                        updateStop(stop.id, "addressLat", address.lat || "");
                        updateStop(stop.id, "addressLng", address.lng || "");
                      }}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: "12px" }}>
                    <label className="form-label">Instrucciones Especiales</label>
                    <textarea
                      className="form-input"
                      value={stop.instrucciones}
                      onChange={(e) => updateStop(stop.id, "instrucciones", e.target.value)}
                      placeholder="Instrucciones para esta parada..."
                      rows="2"
                    />
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input
                      type="checkbox"
                      checked={stop.requiereConfirmacion}
                      onChange={(e) => updateStop(stop.id, "requiereConfirmacion", e.target.checked)}
                    />
                    <label style={{ fontSize: "14px", color: "#374151" }}>
                      Requiere confirmación del destinatario
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="form-group" style={{ marginTop: "16px" }}>
            <label className="form-label">Notas Generales</label>
            <textarea
              className="form-input"
              value={advancedForm.notas}
              onChange={(e) => setAdvancedForm(prev => ({ ...prev, notas: e.target.value }))}
              placeholder="Notas generales para toda la orden..."
              rows="3"
            />
          </div>

          <div style={{ marginTop: "20px" }}>
            <button
              className="btn btn-primary"
              onClick={submitAdvancedOrder}
              disabled={saving}
            >
              {saving ? "Creando..." : "Crear Orden Avanzada"}
            </button>
          </div>
        </div>
      )}

      {/* Orders List */}
      {activeTab === "list" && (
        <div className="orders-list">
          <h2 className="section-title">Lista de Órdenes</h2>
          {loading ? (
            <p>Cargando órdenes...</p>
          ) : orders.length === 0 ? (
            <p style={{ color: "#64748b" }}>No hay órdenes creadas aún.</p>
          ) : (
            <div>
              {orders.map(order => (
                <div key={order.id} className="order-card">
                  <div className="order-header">
                    <div className="order-id">#{order.id}</div>
                    <div className={`order-status status-${order.estado || "pending"}`}>
                      {order.estado || "Pendiente"}
                    </div>
                    {order.estado !== "entregada" && (
                      <>
                        {!order.mensajeroId ? (
                          <button 
                            onClick={() => openAssignModal(order)}
                            style={{
                              background: "#3B82F6",
                              color: "white",
                              border: "none",
                              padding: "4px 8px",
                              borderRadius: "4px",
                              fontSize: "12px",
                              cursor: "pointer"
                            }}
                          >
                            Asignar
                          </button>
                        ) : (
                          <button 
                            onClick={() => openAssignModal(order)}
                            style={{
                              background: "#F59E0B",
                              color: "white",
                              border: "none",
                              padding: "4px 8px",
                              borderRadius: "4px",
                              fontSize: "12px",
                              cursor: "pointer"
                            }}
                          >
                            Cambiar
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  
                  <div style={{ fontSize: "14px", color: "#374151", marginBottom: "8px" }}>
                    <strong>Cliente:</strong> {order.cliente} • 
                    <strong> Tipo:</strong> {order.tipo || "básica"} • 
                    <strong> Fecha:</strong> {order.fecha}
                  </div>

                  {order.mensajeroNombre && (
                    <div style={{ 
                      fontSize: "12px", 
                      color: "#059669", 
                      background: "#D1FAE5", 
                      padding: "4px 8px", 
                      borderRadius: "4px", 
                      marginBottom: "8px",
                      display: "inline-block"
                    }}>
                      👤 Asignado a: {order.mensajeroNombre}
                    </div>
                  )}

                  {order.stops && order.stops.length > 0 && (
                    <div className="stops-summary">
                      {order.stops.map((stop, index) => (
                        <div key={index} className="stop-badge">
                          {index + 1}. {stop.tipo === "pickup" ? "📦" : "🚚"} {stop.direccionTexto?.substring(0, 30)}...
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messenger Assignment Modal */}
      {showAssignModal && assigningOrder && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: "white",
            padding: "24px",
            borderRadius: "8px",
            minWidth: "400px",
            maxWidth: "500px"
          }}>
            <h3 style={{ marginTop: 0 }}>
              {assigningOrder.mensajeroId ? 'Cambiar Mensajero' : 'Asignar Mensajero'}
            </h3>
            <p>Orden: #{assigningOrder.id} - {assigningOrder.cliente}</p>
            {assigningOrder.mensajeroNombre && (
              <p style={{ color: '#059669', fontSize: '14px' }}>
                <strong>Mensajero actual:</strong> {assigningOrder.mensajeroNombre}
              </p>
            )}
            
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "8px" }}>
                Seleccionar Mensajero:
              </label>
              <select 
                value={selectedMensajero}
                onChange={(e) => setSelectedMensajero(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #ccc",
                  borderRadius: "4px"
                }}
              >
                <option value="">Seleccionar mensajero...</option>
                {mensajeros.map(mensajero => (
                  <option key={mensajero.id} value={mensajero.id}>
                    {mensajero.nombre} - {mensajero.email}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                onClick={closeAssignModal}
                style={{
                  padding: "8px 16px",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                  background: "white",
                  cursor: "pointer"
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const selectedMensajeroData = mensajeros.find(m => m.id === selectedMensajero);
                  if (selectedMensajeroData) {
                    assignMensajero(assigningOrder.id, selectedMensajero, selectedMensajeroData.nombre);
                  }
                }}
                disabled={!selectedMensajero}
                style={{
                  padding: "8px 16px",
                  border: "none",
                  borderRadius: "4px",
                  background: selectedMensajero ? "#3B82F6" : "#ccc",
                  color: "white",
                  cursor: selectedMensajero ? "pointer" : "not-allowed"
                }}
              >
                {assigningOrder.mensajeroId ? 'Cambiar' : 'Asignar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}