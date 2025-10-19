# 🔥 Configuración de Índices Firebase

## Índices Requeridos para el Sistema de Órdenes

Para que las consultas funcionen correctamente, necesitas crear los siguientes índices compuestos en Firebase Firestore:

### 1. Índice para Órdenes (ordenes collection)

**Campos:**
- `empresaId` (Ascending)
- `fechaCreacion` (Descending)
- `__name__` (Ascending) - automático

**Cómo crear:**

1. **Opción Automática (Recomendada):**
   - Abre este enlace en tu navegador:
   ```
   https://console.firebase.google.com/v1/r/project/envios-realtime/firestore/indexes?create_composite=Ck9wcm9qZWN0cy9lbnZpb3MtcmVhbHRpbWUvZGF0YWJhc2VzLyhkZWZhdWx0KS9jb2xsZWN0aW9uR3JvdXBzL29yZGVuZXMvaW5kZXhlcy9fEAEaDQoJZW1wcmVzYUlkEAEaEQoNZmVjaGFDcmVhY2lvbhACGgwKCF9fbmFtZV9fEAI
   ```
   - Haz clic en "Create Index"
   - Espera a que se complete (puede tomar unos minutos)

2. **Opción Manual:**
   - Ve a [Firebase Console](https://console.firebase.google.com/)
   - Selecciona tu proyecto `envios-realtime`
   - Ve a Firestore Database → Indexes
   - Haz clic en "Create Index"
   - Configura:
     - Collection ID: `ordenes`
     - Fields:
       - `empresaId`: Ascending
       - `fechaCreacion`: Descending

### 2. Actualizar Código Después de Crear el Índice

Una vez que el índice esté listo, puedes descomentar la línea de `orderBy` en:

**Archivo:** `src/features/orders/pages/UnifiedOrdersPage.jsx`

```javascript
// Cambia esto:
const q = query(
  collection(db, "ordenes"),
  where("empresaId", "==", usuario.empresaId)
  // orderBy("fechaCreacion", "desc") // Comentado temporalmente
);

// Por esto:
const q = query(
  collection(db, "ordenes"),
  where("empresaId", "==", usuario.empresaId),
  orderBy("fechaCreacion", "desc") // ✅ Descomentar cuando el índice esté listo
);
```

Y puedes remover el ordenamiento manual en el cliente:

```javascript
// Remover estas líneas una vez que el índice esté activo:
ordersData.sort((a, b) => {
  const dateA = a.fechaCreacion?.toDate ? a.fechaCreacion.toDate() : new Date(a.fechaCreacion || 0);
  const dateB = b.fechaCreacion?.toDate ? b.fechaCreacion.toDate() : new Date(b.fechaCreacion || 0);
  return dateB - dateA; // desc
});
```

## Estado Actual

✅ **Solución Temporal Implementada:** Las órdenes se ordenan en el cliente
⏳ **Pendiente:** Crear índice en Firebase para mejor rendimiento
🎯 **Objetivo:** Ordenamiento optimizado del lado del servidor

## Beneficios del Índice

- ⚡ **Mejor rendimiento:** Consultas más rápidas
- 🔄 **Escalabilidad:** Funciona con miles de órdenes
- 📊 **Ordering nativo:** Firebase maneja el ordenamiento
- 🚀 **Menos procesamiento:** El cliente no necesita ordenar

---

> **Nota:** La aplicación funciona correctamente con la solución temporal. El índice es una optimización para mejor rendimiento.