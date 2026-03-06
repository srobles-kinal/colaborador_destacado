// ====================================================================
// api-client.js — Cliente para la API REST de Apps Script
// ====================================================================
// Uso:
//   import { api } from './api-client.js';
//   const data = await api.getAllData();
// ====================================================================

const API_CONFIG = {
  // ⚠️ REEMPLAZAR con tu URL de deploy de Apps Script:
  BASE_URL: 'https://script.google.com/macros/s/TU_DEPLOY_ID/exec',

  // Si usas autenticación con token, ponerlo aquí:
  // (dejar vacío si la API es abierta)
  TOKEN: '',

  // Email del usuario (se envía como parámetro para identificar al votante)
  // En producción, obtener de tu sistema de auth (Google Sign-In, etc.)
  USER_EMAIL: ''
};

// ============= HTTP HELPERS =============

async function apiGet(action, extraParams = {}) {
  const params = new URLSearchParams({
    action,
    origin: window.location.origin,
    ...extraParams
  });

  if (API_CONFIG.TOKEN) {
    params.set('token', API_CONFIG.TOKEN);
  }

  if (API_CONFIG.USER_EMAIL) {
    params.set('userEmail', API_CONFIG.USER_EMAIL);
  }

  const url = `${API_CONFIG.BASE_URL}?${params.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
  }

  const json = await response.json();

  if (json.status === 'error') {
    throw new Error(json.error || 'Error desconocido en la API');
  }

  return json.data;
}

async function apiPost(action, body = {}) {
  const params = new URLSearchParams({
    action,
    origin: window.location.origin
  });

  if (API_CONFIG.TOKEN) {
    body.token = API_CONFIG.TOKEN;
  }

  const url = `${API_CONFIG.BASE_URL}?${params.toString()}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
    // Nota: No se envía mode:'cors' explícitamente porque
    // Apps Script maneja CORS en la respuesta.
    // Si tenés problemas de CORS, cambiá el deploy a "Anyone" en Apps Script.
  });

  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
  }

  const json = await response.json();

  if (json.status === 'error') {
    throw new Error(json.error || 'Error desconocido en la API');
  }

  return json.data;
}

// ============= API PÚBLICA =============

export const api = {

  // --- Configuración ---
  setBaseUrl(url) {
    API_CONFIG.BASE_URL = url;
  },

  setToken(token) {
    API_CONFIG.TOKEN = token;
  },

  setUserEmail(email) {
    API_CONFIG.USER_EMAIL = email;
  },

  getConfig() {
    return { ...API_CONFIG };
  },

  // --- GET endpoints ---

  async getAllData() {
    return apiGet('getAllData');
  },

  async getDashboardData() {
    return apiGet('getDashboardData');
  },

  async getAnalytics() {
    return apiGet('getAnalytics');
  },

  async getAdminStats() {
    return apiGet('getAdminStats');
  },

  // --- POST endpoints ---

  async guardarVotos({ votanteEmail, votanteId, evaluadoId, evaluadoNombre, calificaciones, sede, nombreVotante, comentario }) {
    return apiPost('guardarVotos', {
      votanteEmail, votanteId, evaluadoId, evaluadoNombre,
      calificaciones, sede, nombreVotante, comentario
    });
  },

  async saveParametros(valores) {
    return apiPost('saveParametros', { valores });
  },

  async saveParametrosSupervisores(valores) {
    return apiPost('saveParametrosSupervisores', { valores });
  },

  async saveAreas(valores) {
    return apiPost('saveAreas', { valores });
  },

  async saveSedes(valores) {
    return apiPost('saveSedes', { valores });
  },

  async actualizarConfiguracion(config) {
    return apiPost('actualizarConfiguracion', config);
  },

  async asignarRol(email, rol) {
    return apiPost('asignarRol', { email, rol });
  },

  async generar2FA(usuario) {
    return apiPost('generar2FA', { usuario });
  },

  async validar2FA(usuario, codigo) {
    return apiPost('validar2FA', { usuario, codigo });
  }
};

// ============= EXPORT DEFAULT =============
export default api;
