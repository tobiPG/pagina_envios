// src/shared/lib/parseAddress.js
/**
 * Función para parsear texto de dirección en componentes estructurados
 * Esto es una implementación básica que puede ser expandida según necesidades
 */
export function parseAddressFromText(text) {
  if (!text || typeof text !== 'string') {
    return {
      calle: '',
      numero: '',
      colonia: '',
      ciudad: '',
      estado: '',
      codigoPostal: '',
      pais: 'México'
    };
  }

  // Limpieza básica del texto
  const cleanText = text.trim();
  
  // Implementación básica - puede ser mejorada con regex más sofisticados
  const parts = cleanText.split(',').map(part => part.trim());
  
  return {
    calle: parts[0] || '',
    numero: extractNumber(parts[0]) || '',
    colonia: parts[1] || '',
    ciudad: parts[2] || '',
    estado: parts[3] || '',
    codigoPostal: extractPostalCode(cleanText) || '',
    pais: 'México'
  };
}

/**
 * Extrae números de la dirección (para número de casa/edificio)
 */
function extractNumber(text) {
  if (!text) return '';
  const match = text.match(/\d+/);
  return match ? match[0] : '';
}

/**
 * Extrae código postal de 5 dígitos
 */
function extractPostalCode(text) {
  if (!text) return '';
  const match = text.match(/\b\d{5}\b/);
  return match ? match[0] : '';
}

/**
 * Convierte una dirección estructurada de vuelta a texto
 */
export function addressToText(address) {
  if (!address) return '';
  
  const parts = [];
  
  if (address.calle) {
    let streetPart = address.calle;
    if (address.numero) {
      streetPart += ' ' + address.numero;
    }
    parts.push(streetPart);
  }
  
  if (address.colonia) parts.push(address.colonia);
  if (address.ciudad) parts.push(address.ciudad);
  if (address.estado) parts.push(address.estado);
  if (address.codigoPostal) parts.push(address.codigoPostal);
  
  return parts.join(', ');
}