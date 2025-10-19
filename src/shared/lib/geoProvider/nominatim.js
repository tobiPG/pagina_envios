// src/shared/lib/geoProvider/nominatim.js
/**
 * Proveedor de geocodificación usando Nominatim (OpenStreetMap)
 * API gratuita para convertir direcciones a coordenadas y viceversa
 */

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

/**
 * Convierte texto de dirección a coordenadas lat/lng
 * @param {string} address - Texto de la dirección
 * @param {string} countryCode - Código de país (ej: 'mx' para México)
 * @returns {Promise<{lat: number, lng: number, display_name: string}>}
 */
export async function geocodeText(address, countryCode = 'mx') {
  if (!address || !address.trim()) {
    throw new Error('Dirección vacía');
  }

  try {
    const params = new URLSearchParams({
      q: address,
      format: 'json',
      limit: '1',
      countrycodes: countryCode,
      addressdetails: '1'
    });

    const response = await fetch(`${NOMINATIM_BASE_URL}/search?${params}`);
    
    if (!response.ok) {
      throw new Error(`Error en geocodificación: ${response.status}`);
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      throw new Error('No se encontraron resultados para esta dirección');
    }

    const result = data[0];
    return {
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      display_name: result.display_name,
      address: result.address || {}
    };

  } catch (error) {
    console.error('Error en geocodeText:', error);
    throw error;
  }
}

/**
 * Convierte coordenadas lat/lng a dirección de texto
 * @param {number} lat - Latitud
 * @param {number} lng - Longitud
 * @returns {Promise<{display_name: string, address: object}>}
 */
export async function reverseGeocode(lat, lng) {
  if (!lat || !lng) {
    throw new Error('Coordenadas inválidas');
  }

  try {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lon: lng.toString(),
      format: 'json',
      addressdetails: '1'
    });

    const response = await fetch(`${NOMINATIM_BASE_URL}/reverse?${params}`);
    
    if (!response.ok) {
      throw new Error(`Error en geocodificación inversa: ${response.status}`);
    }

    const data = await response.json();

    if (!data || data.error) {
      throw new Error('No se pudo obtener la dirección para estas coordenadas');
    }

    return {
      display_name: data.display_name,
      address: data.address || {}
    };

  } catch (error) {
    console.error('Error en reverseGeocode:', error);
    throw error;
  }
}

/**
 * Busca múltiples direcciones para un texto dado
 * @param {string} query - Texto de búsqueda
 * @param {string} countryCode - Código de país
 * @param {number} limit - Número máximo de resultados
 * @returns {Promise<Array>}
 */
export async function searchAddresses(query, countryCode = 'mx', limit = 5) {
  if (!query || !query.trim()) {
    return [];
  }

  try {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      limit: limit.toString(),
      countrycodes: countryCode,
      addressdetails: '1'
    });

    const response = await fetch(`${NOMINATIM_BASE_URL}/search?${params}`);
    
    if (!response.ok) {
      throw new Error(`Error en búsqueda: ${response.status}`);
    }

    const data = await response.json();

    return data.map(item => ({
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      display_name: item.display_name,
      address: item.address || {}
    }));

  } catch (error) {
    console.error('Error en searchAddresses:', error);
    return [];
  }
}