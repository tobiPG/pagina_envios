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
  serverTimestamp 
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ensureUsuarioActivo } from "../../../shared/utils/ensureUsuario";
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
  
  // Get user info
  const usuario = ensureUsuarioActivo();
  if (!usuario) {
    navigate("/login");
    return null;
  }

  // State
  const [activeTab, setActiveTab] = useState("basic"); // "basic" | "advanced"
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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

  // Load orders
  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, "ordenes"),
      where("empresaId", "==", usuario.empresaId),
      orderBy("fechaCreacion", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setOrders(ordersData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [usuario.empresaId]);

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

      // Validation
      if (!basicForm.cliente.trim()) {
        throw new Error("El nombre del cliente es requerido");
      }
      if (!basicForm.direccionTexto.trim()) {
        throw new Error("La dirección es requerida");
      }

      const orderData = {
        ...basicForm,
        empresaId: usuario.empresaId,
        creadoPor: usuario.uid,
        tipo: "basica",
        estado: "pendiente",
        fechaCreacion: serverTimestamp(),
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

      // Validation
      if (!advancedForm.cliente.trim()) {
        throw new Error("El nombre del cliente es requerido");
      }
      if (advancedForm.stops.length === 0) {
        throw new Error("Debe agregar al menos una parada");
      }
      
      const hasEmptyStops = advancedForm.stops.some(stop => !stop.direccionTexto.trim());
      if (hasEmptyStops) {
        throw new Error("Todas las paradas deben tener una dirección");
      }

      const orderData = {
        ...advancedForm,
        empresaId: usuario.empresaId,
        creadoPor: usuario.uid,
        tipo: "avanzada",
        estado: "pendiente",
        fechaCreacion: serverTimestamp()
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
                setBasicForm(prev => ({
                  ...prev,
                  direccionTexto: address.texto || "",
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
                  </div>
                  
                  <div style={{ fontSize: "14px", color: "#374151", marginBottom: "8px" }}>
                    <strong>Cliente:</strong> {order.cliente} • 
                    <strong> Tipo:</strong> {order.tipo || "básica"} • 
                    <strong> Fecha:</strong> {order.fecha}
                  </div>

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
    </div>
  );
}