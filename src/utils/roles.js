// src/utils/roles.js

// Definimos los roles disponibles en la plataforma
export const ROLES = {
  OWNER: "OWNER",        // Dueño de la empresa
  ADMIN: "ADMIN",        // Administrador
  OPERADOR: "OPERADOR",  // Operador que registra y gestiona órdenes
  MENSAJERO: "MENSAJERO",// Mensajero que entrega pedidos
  AUDITOR: "AUDITOR",    // Solo lectura, reportes
};

// Función para saber si un rol puede ver TODAS las órdenes
export function canSeeAllOrders(role) {
  return [ROLES.OWNER, ROLES.ADMIN, ROLES.OPERADOR, ROLES.AUDITOR].includes(role);
}
