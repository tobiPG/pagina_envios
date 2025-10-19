// src/shared/hooks/useRole.js
import { useMemo } from "react";
import { ROLES } from "../utils/roles";

export function useRole() {
  // Cambia este valor manualmente para probar diferentes permisos
  const role = ROLES.ADMIN; 
  // Ejemplos: ROLES.OWNER, ROLES.OPERADOR, ROLES.MENSAJERO, ROLES.AUDITOR

  return useMemo(() => ({ role }), [role]);
}
