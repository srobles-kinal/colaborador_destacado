// ====================================================================
// API REST - SISTEMA DE VOTACIÓN PREMIUM V3
// ====================================================================
// Despliega como Web App en Google Apps Script
// URL base: https://script.google.com/macros/s/{DEPLOY_ID}/exec
//
// AUTENTICACIÓN (2 modos):
//   1) Abierta con CORS  → Solo configurar ALLOWED_ORIGINS
//   2) Con Token          → Configurar API_TOKEN + ALLOWED_ORIGINS
//
// ENDPOINTS (vía query param "action"):
//   GET  ?action=getAllData
//   GET  ?action=getDashboardData
//   GET  ?action=getAnalytics
//   GET  ?action=getAdminStats
//   POST ?action=guardarVotos        (body JSON)
//   POST ?action=saveParametros      (body JSON)
//   POST ?action=saveAreas           (body JSON)
//   POST ?action=saveSedes           (body JSON)
//   POST ?action=saveParametrosSupervisores (body JSON)
//   POST ?action=actualizarConfiguracion    (body JSON)
//   POST ?action=asignarRol          (body JSON)
//   POST ?action=generar2FA          (body JSON)
//   POST ?action=validar2FA          (body JSON)
// ====================================================================

// ============= CONFIGURACIÓN =============

const CONFIG = {
  APP_NAME: 'Sistema de Votación Premium',
  VERSION: '3.0.0',
  IDIOMA_DEFAULT: 'es',
  ZONA_HORARIA: 'America/Guatemala',

  // --- Seguridad ---
  // Modo 1: Dejar API_TOKEN vacío → API abierta (solo CORS)
  // Modo 2: Poner un token → Se requiere header "Authorization: Bearer <token>"
  API_TOKEN: '',  // Ejemplo: 'mi-token-secreto-2026'

  ALLOWED_ORIGINS: [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5500',
    // Agregar tu dominio de Netlify/Vercel:
    // 'https://mi-app.netlify.app',
    // 'https://mi-app.vercel.app',
  ],

  WEBHOOK_URL: '',
  SLACK_WEBHOOK: '',
  ENCRYPTING_KEY: 'votacion-2fa-key-2026',
  MAX_INTENTOS_LOGIN: 5,
  DURACION_2FA_MINUTOS: 10
};

// ============= CORS & AUTH MIDDLEWARE =============

/**
 * Genera headers CORS según el origin de la petición.
 */
function getCorsHeaders_(requestOrigin) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };

  if (CONFIG.ALLOWED_ORIGINS.length === 0 || CONFIG.ALLOWED_ORIGINS.includes(requestOrigin)) {
    headers['Access-Control-Allow-Origin'] = requestOrigin || '*';
  }

  return headers;
}

/**
 * Crea respuesta JSON con CORS.
 */
function jsonResponse_(data, statusCode, origin) {
  const headers = getCorsHeaders_(origin);
  const output = ContentService
    .createTextOutput(JSON.stringify({ status: statusCode >= 400 ? 'error' : 'ok', ...data }))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

/**
 * Valida token de autenticación si está configurado.
 * Retorna null si es válido, o un objeto de error si no.
 */
function validateAuth_(e) {
  if (!CONFIG.API_TOKEN) return null; // Modo abierto

  const authHeader = e.parameter?.token || '';
  // En Apps Script no hay headers reales en doGet/doPost,
  // así que el token se pasa como query param: ?token=MI_TOKEN
  // o en el body JSON como campo "token"

  let token = authHeader;

  if (!token && e.postData) {
    try {
      const body = JSON.parse(e.postData.contents);
      token = body.token || '';
    } catch (_) {}
  }

  if (token !== CONFIG.API_TOKEN) {
    return { error: 'No autorizado. Token inválido o ausente.', code: 401 };
  }

  return null;
}

// ============= ENTRY POINTS =============

function doGet(e) {
  const origin = e.parameter?.origin || '*';

  // Preflight
  if (!e.parameter?.action) {
    return jsonResponse_({ message: CONFIG.APP_NAME + ' API v' + CONFIG.VERSION, endpoints: [
      'getAllData', 'getDashboardData', 'getAnalytics', 'getAdminStats'
    ]}, 200, origin);
  }

  // Auth check
  const authError = validateAuth_(e);
  if (authError) return jsonResponse_(authError, 401, origin);

  const action = e.parameter.action;

  try {
    switch (action) {
      case 'getAllData':
        return jsonResponse_({ data: api_getAllData(e) }, 200, origin);

      case 'getDashboardData':
        return jsonResponse_({ data: api_getDashboardData() }, 200, origin);

      case 'getAnalytics':
        return jsonResponse_({ data: api_getAnalytics() }, 200, origin);

      case 'getAdminStats':
        return jsonResponse_({ data: api_getAdminStats() }, 200, origin);

      default:
        return jsonResponse_({ error: 'Acción GET no reconocida: ' + action }, 400, origin);
    }
  } catch (err) {
    return jsonResponse_({ error: err.toString() }, 500, origin);
  }
}

function doPost(e) {
  const origin = e.parameter?.origin || '*';

  // Auth check
  const authError = validateAuth_(e);
  if (authError) return jsonResponse_(authError, 401, origin);

  const action = e.parameter?.action || '';
  let body = {};

  try {
    body = JSON.parse(e.postData.contents);
  } catch (_) {
    return jsonResponse_({ error: 'Body JSON inválido' }, 400, origin);
  }

  try {
    switch (action) {
      case 'guardarVotos':
        return jsonResponse_({ data: api_guardarVotos(body) }, 200, origin);

      case 'saveParametros':
        return jsonResponse_({ data: api_saveParametros(body.valores) }, 200, origin);

      case 'saveParametrosSupervisores':
        return jsonResponse_({ data: api_saveParametrosSupervisores(body.valores) }, 200, origin);

      case 'saveAreas':
        return jsonResponse_({ data: api_saveAreas(body.valores) }, 200, origin);

      case 'saveSedes':
        return jsonResponse_({ data: api_saveSedes(body.valores) }, 200, origin);

      case 'actualizarConfiguracion':
        return jsonResponse_({ data: api_actualizarConfiguracion(body) }, 200, origin);

      case 'asignarRol':
        return jsonResponse_({ data: api_asignarRol(body.email, body.rol) }, 200, origin);

      case 'generar2FA':
        return jsonResponse_({ data: api_generar2FA(body.usuario) }, 200, origin);

      case 'validar2FA':
        return jsonResponse_({ data: api_validar2FA(body.usuario, body.codigo) }, 200, origin);

      default:
        return jsonResponse_({ error: 'Acción POST no reconocida: ' + action }, 400, origin);
    }
  } catch (err) {
    return jsonResponse_({ error: err.toString() }, 500, origin);
  }
}

// ============= API HANDLERS =============

function api_getAllData(e) {
  inicializarSedes_();
  inicializarParametrosSupervisores_();
  crearSistemaRoles_();

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // Si el usuario se pasa como param (frontend externo), usamos ese.
  // Si no, intentamos Session (solo funciona si el usuario abre la app directamente).
  const userEmail = e.parameter?.userEmail || Session.getActiveUser().getEmail() || 'anonimo@sistema';

  registrarAcceso_(userEmail);

  const colaboradoresSheet = ss.getSheetByName('Colaboradores');
  const parametrosSheet = ss.getSheetByName('Parametros');
  const parametrosSupervisoresSheet = ss.getSheetByName('Parametros Supervisores');
  const areasSheet = ss.getSheetByName('Areas');
  const sedesSheet = ss.getSheetByName('Sedes');
  const votosSheet = ss.getSheetByName('Votos');

  // --- Colaboradores ---
  const colData = colaboradoresSheet && colaboradoresSheet.getLastRow() > 1
    ? colaboradoresSheet.getRange(2, 1, colaboradoresSheet.getLastRow() - 1, 6).getValues()
    : [];

  const colaboradores = colData
    .filter(row => row[0])
    .map(row => ({
      id: row[0],
      nombre: row[1],
      area: row[2],
      fotoUrl: procesarUrlDrive_(row[3]) || '',
      email: row[4],
      sede: row[5] || ''
    }));

  // --- Parámetros ---
  const paramData = parametrosSheet && parametrosSheet.getLastRow() > 1
    ? parametrosSheet.getRange(2, 1, parametrosSheet.getLastRow() - 1, 1).getValues()
    : [];
  const parametros = paramData.map(r => r[0]).filter(p => p);

  const paramSupData = parametrosSupervisoresSheet && parametrosSupervisoresSheet.getLastRow() > 1
    ? parametrosSupervisoresSheet.getRange(2, 1, parametrosSupervisoresSheet.getLastRow() - 1, 1).getValues()
    : [];
  const parametrosSupervisores = paramSupData.map(r => r[0]).filter(p => p);

  // --- Áreas y Sedes ---
  const areaData = areasSheet && areasSheet.getLastRow() > 1
    ? areasSheet.getRange(2, 1, areasSheet.getLastRow() - 1, 1).getValues()
    : [];
  const areas = areaData.map(r => r[0]).filter(a => a);

  const sedeData = sedesSheet && sedesSheet.getLastRow() > 1
    ? sedesSheet.getRange(2, 1, sedesSheet.getLastRow() - 1, 1).getValues()
    : [];
  const sedes = sedeData.map(r => r[0]).filter(s => s);

  // --- Votos ---
  const votosData = votosSheet && votosSheet.getLastRow() > 1
    ? votosSheet.getRange(2, 1, votosSheet.getLastRow() - 1, 10).getValues()
    : [];

  const evaluacionesUnicas = {};
  const promedios = {};

  votosData.forEach(row => {
    const votante = row[1];
    const evaluadoId = String(row[4]);
    const puntuacion = parseFloat(row[7]);
    const claveUnica = votante + '|' + evaluadoId;

    if (!evaluacionesUnicas[claveUnica]) {
      evaluacionesUnicas[claveUnica] = true;
    }

    if (evaluadoId && !isNaN(puntuacion) && puntuacion > 0) {
      if (!promedios[evaluadoId]) {
        promedios[evaluadoId] = { suma: 0, cantidad: 0 };
      }
      promedios[evaluadoId].suma += puntuacion;
      promedios[evaluadoId].cantidad += 1;
    }
  });

  const promediosFinales = {};
  Object.entries(promedios).forEach(([id, data]) => {
    promediosFinales[id] = data.cantidad > 0 ? data.suma / data.cantidad : 0;
  });

  const rolUsuario = obtenerRolUsuario_(userEmail);
  const permisos = obtenerPermisosUsuario_(userEmail);

  return {
    userEmail: userEmail,
    colaboradores: colaboradores,
    parametros: parametros.length > 0 ? parametros : ['Calidad de Trabajo'],
    parametrosSupervisores: parametrosSupervisores.length > 0 ? parametrosSupervisores : ['Liderazgo'],
    areas: areas,
    sedes: sedes,
    evaluacionesUnicas: evaluacionesUnicas,
    promedios: promediosFinales,
    cantidadParametros: parametros.length,
    cantidadParametrosSupervisores: parametrosSupervisores.length,
    rol: rolUsuario,
    permisos: permisos,
    analytics: getAnalyticsData_(),
    idioma: CONFIG.IDIOMA_DEFAULT
  };
}

function api_getDashboardData() {
  return {
    analytics: getAnalyticsData_(),
    tendencias: getTendenciasTemporales_(),
    timestamp: new Date()
  };
}

function api_getAnalytics() {
  return getAnalyticsData_();
}

function api_getAdminStats() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const colaboradoresSheet = ss.getSheetByName('Colaboradores');
  const areasSheet = ss.getSheetByName('Areas');
  const parametrosSheet = ss.getSheetByName('Parametros');
  const parametrosSupervisoresSheet = ss.getSheetByName('Parametros Supervisores');
  const sedesSheet = ss.getSheetByName('Sedes');

  const paramData = parametrosSheet && parametrosSheet.getLastRow() > 1
    ? parametrosSheet.getRange(2, 1, parametrosSheet.getLastRow() - 1, 1).getValues().map(r => r[0]).filter(p => p)
    : [];

  const paramSupData = parametrosSupervisoresSheet && parametrosSupervisoresSheet.getLastRow() > 1
    ? parametrosSupervisoresSheet.getRange(2, 1, parametrosSupervisoresSheet.getLastRow() - 1, 1).getValues().map(r => r[0]).filter(p => p)
    : [];

  const areaData = areasSheet && areasSheet.getLastRow() > 1
    ? areasSheet.getRange(2, 1, areasSheet.getLastRow() - 1, 1).getValues().map(r => r[0]).filter(a => a)
    : [];

  const sedeData = sedesSheet && sedesSheet.getLastRow() > 1
    ? sedesSheet.getRange(2, 1, sedesSheet.getLastRow() - 1, 1).getValues().map(r => r[0]).filter(s => s)
    : [];

  return {
    totalColaboradores: colaboradoresSheet ? Math.max(0, colaboradoresSheet.getLastRow() - 1) : 0,
    totalAreas: areaData.length,
    parametros: paramData,
    parametrosSupervisores: paramSupData,
    areas: areaData,
    sedes: sedeData,
    colaboradoresEvaluados: getAnalyticsData_().evaluadosUnicos || 0
  };
}

function api_guardarVotos(body) {
  const {
    votanteEmail, votanteId, evaluadoId, evaluadoNombre,
    calificaciones, sede, nombreVotante, comentario
  } = body;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const votosSheet = ss.getSheetByName('Votos');

  // Verificar duplicado
  const votosData = votosSheet && votosSheet.getLastRow() > 1
    ? votosSheet.getRange(2, 1, votosSheet.getLastRow() - 1, 10).getValues()
    : [];

  const yaVoto = votosData.some(row => {
    return row[1] === votanteEmail && String(row[4]) === String(evaluadoId);
  });

  if (yaVoto) {
    registrarAuditoria_('VOTO_DUPLICADO', votanteEmail, { evaluadoId });
    return { success: false, message: 'Ya evaluaste a este colaborador', evaluadoId: String(evaluadoId) };
  }

  const timestamp = new Date();
  const rows = calificaciones.map(cal => [
    timestamp,
    votanteEmail,
    votanteId || 0,
    nombreVotante || votanteEmail,
    evaluadoId,
    evaluadoNombre,
    cal.parametro,
    cal.puntuacion,
    sede || '',
    comentario || ''
  ]);

  try {
    votosSheet.getRange(votosSheet.getLastRow() + 1, 1, rows.length, 10).setValues(rows);

    registrarAuditoria_('EVALUACION_GUARDADA', votanteEmail, {
      evaluadoId,
      puntuaciones: calificaciones.map(c => c.puntuacion)
    });

    dispararWebhook_('EVALUACION_COMPLETADA', { votante: votanteEmail, evaluado: evaluadoId, timestamp });

    const nuevoPromedio = calcularPromedioColaborador_(evaluadoId);

    return {
      success: true,
      message: '✓ Evaluación guardada para ' + evaluadoNombre,
      evaluadoId: String(evaluadoId),
      nuevoPromedio
    };
  } catch (err) {
    registrarAuditoria_('ERROR_EVALUACION', votanteEmail, { error: err.toString() });
    return { success: false, message: 'Error: ' + err.toString() };
  }
}

function api_saveParametros(valores) {
  return guardarListaEnHoja_('Parametros', 'Parametro', valores);
}

function api_saveParametrosSupervisores(valores) {
  return guardarListaEnHoja_('Parametros Supervisores', 'Parametro', valores);
}

function api_saveAreas(valores) {
  return guardarListaEnHoja_('Areas', 'Area', valores);
}

function api_saveSedes(valores) {
  return guardarListaEnHoja_('Sedes', 'Sede', valores);
}

function api_actualizarConfiguracion(body) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let configSheet = ss.getSheetByName('Configuracion');

  if (!configSheet) {
    configSheet = ss.insertSheet('Configuracion');
    configSheet.appendRow(['Clave', 'Valor']);
  }

  Object.entries(body).forEach(([clave, valor]) => {
    if (clave === 'token') return; // No guardar token como config
    configSheet.appendRow([clave, valor]);
  });

  return { success: true };
}

function api_asignarRol(email, rol) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let usersSheet = ss.getSheetByName('Usuarios');

  if (!usersSheet) crearSistemaRoles_();
  usersSheet = ss.getSheetByName('Usuarios');

  const data = usersSheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === email) {
      usersSheet.getRange(i + 1, 3).setValue(rol);
      registrarAuditoria_('ROL_ASIGNADO', email, { rol });
      return { success: true };
    }
  }

  return { success: false, mensaje: 'Usuario no encontrado' };
}

function api_generar2FA(usuario) {
  const codigo = generarCodigo2FA_(usuario);
  // En producción, enviar por email:
  // enviarEmailNotificacion_(usuario, 'Código 2FA', 'Tu código: ' + codigo);
  return { success: true, message: 'Código generado' };
}

function api_validar2FA(usuario, codigo) {
  return validar2FA_(usuario, codigo);
}

// ============= FUNCIONES INTERNAS (HELPERS) =============

function guardarListaEnHoja_(nombreHoja, headerNombre, valores) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(nombreHoja);

  if (!sheet) {
    sheet = ss.insertSheet(nombreHoja);
    sheet.getRange(1, 1).setValue(headerNombre).setFontWeight('bold');
  }

  // Limpiar datos existentes (excepto header)
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).clearContent();
  }

  // Escribir nuevos valores
  if (valores && valores.length > 0) {
    const data = valores.map(v => [v]);
    sheet.getRange(2, 1, data.length, 1).setValues(data);
  }

  return { success: true, total: valores ? valores.length : 0 };
}

function procesarUrlDrive_(url) {
  if (!url) return '';
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return 'https://lh3.googleusercontent.com/d/' + match[1];
  }
  return url;
}

// ============= SEGURIDAD Y AUDITORÍA =============

function registrarAuditoria_(accion, usuario, detalles) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Auditoria');

  if (!sheet) {
    sheet = ss.insertSheet('Auditoria');
    sheet.appendRow(['Timestamp', 'Usuario', 'Email', 'Accion', 'IP', 'Detalles', 'Estado']);
  }

  sheet.appendRow([
    new Date(),
    usuario,
    Session.getActiveUser().getEmail() || usuario,
    accion,
    'web-api',
    JSON.stringify(detalles || {}),
    'COMPLETADO'
  ]);
}

function generarCodigo2FA_(usuario) {
  const codigo = Math.random().toString().substring(2, 8);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('2FA');

  if (!sheet) {
    sheet = ss.insertSheet('2FA');
    sheet.appendRow(['Usuario', 'Email', 'Codigo', 'Timestamp', 'Verificado', 'Intentos']);
  }

  sheet.appendRow([usuario, Session.getActiveUser().getEmail() || usuario, codigo, new Date(), 'PENDIENTE', 0]);
  registrarAuditoria_('2FA_GENERADO', usuario, { codigo: '***' });
  return codigo;
}

function validar2FA_(usuario, codigo) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('2FA');

  if (!sheet) return { valido: false, razon: 'No se encontró registro 2FA' };

  const data = sheet.getDataRange().getValues();
  const ahora = new Date();

  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    if (row[0] === usuario || row[1] === usuario) {
      const timestamp = new Date(row[3]);
      const minutos = (ahora - timestamp) / (1000 * 60);

      if (minutos > CONFIG.DURACION_2FA_MINUTOS) {
        return { valido: false, razon: 'Código expirado' };
      }

      if (String(row[2]) === String(codigo)) {
        sheet.getRange(i + 1, 5).setValue('VERIFICADO');
        registrarAuditoria_('2FA_VALIDADO', usuario, {});
        return { valido: true };
      } else {
        const intentos = (row[5] || 0) + 1;
        sheet.getRange(i + 1, 6).setValue(intentos);

        if (intentos >= CONFIG.MAX_INTENTOS_LOGIN) {
          registrarAuditoria_('2FA_BLOQUEADO', usuario, { intentos });
          return { valido: false, razon: 'Demasiados intentos. Cuenta bloqueada.' };
        }

        return { valido: false, razon: 'Código incorrecto' };
      }
    }
  }

  return { valido: false, razon: 'No se encontró registro 2FA' };
}

// ============= ROLES Y USUARIOS =============

function crearSistemaRoles_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss.getSheetByName('Usuarios')) {
    const usersSheet = ss.insertSheet('Usuarios');
    usersSheet.appendRow(['Email', 'Nombre', 'Rol', 'Equipo', 'Activo', 'Fecha_Creacion', 'Ultimo_Acceso']);
  }

  if (!ss.getSheetByName('Roles')) {
    const rolesSheet = ss.insertSheet('Roles');
    rolesSheet.appendRow(['Rol', 'Permisos', 'Descripcion']);
    rolesSheet.appendRow(['admin', 'crear,editar,eliminar,leer,reportes,usuarios', 'Administrador del sistema']);
    rolesSheet.appendRow(['votante', 'leer,votar', 'Usuario que puede evaluar']);
    rolesSheet.appendRow(['evaluado', 'leer', 'Usuario que puede ser evaluado']);
    rolesSheet.appendRow(['supervisor', 'leer,votar,reportes', 'Supervisor con reportes']);
  }
}

function obtenerRolUsuario_(email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Usuarios');

  if (!sheet) return 'votante';

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === email) return data[i][2] || 'votante';
  }
  return 'votante';
}

function obtenerPermisosUsuario_(email) {
  const rol = obtenerRolUsuario_(email);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Roles');

  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === rol) return data[i][1].split(',');
  }
  return [];
}

function registrarAcceso_(usuario) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Usuarios');

  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === usuario) {
      sheet.getRange(i + 1, 7).setValue(new Date());
      break;
    }
  }
}

// ============= ANALYTICS =============

function getAnalyticsData_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const votosSheet = ss.getSheetByName('Votos');
  const colaboradoresSheet = ss.getSheetByName('Colaboradores');

  if (!votosSheet) return { totalVotos: 0, totalColaboradores: 0, votantesUnicos: 0, evaluadosUnicos: 0, tasaParticipacion: '0', promedios: {} };

  const votosData = votosSheet.getLastRow() > 1
    ? votosSheet.getRange(2, 1, votosSheet.getLastRow() - 1, 10).getValues()
    : [];

  const totalColaboradores = colaboradoresSheet ? Math.max(0, colaboradoresSheet.getLastRow() - 1) : 0;

  const votantesUnicos = new Set();
  const evaluadosUnicos = new Set();
  const promediosMap = {};

  votosData.forEach(row => {
    votantesUnicos.add(row[1]);
    evaluadosUnicos.add(String(row[4]));

    const evaluadoId = String(row[4]);
    const puntuacion = parseFloat(row[7]);

    if (evaluadoId && !isNaN(puntuacion) && puntuacion > 0) {
      if (!promediosMap[evaluadoId]) promediosMap[evaluadoId] = { suma: 0, cantidad: 0 };
      promediosMap[evaluadoId].suma += puntuacion;
      promediosMap[evaluadoId].cantidad += 1;
    }
  });

  const promediosFinales = {};
  Object.entries(promediosMap).forEach(([id, d]) => {
    promediosFinales[id] = d.cantidad > 0 ? (d.suma / d.cantidad).toFixed(2) : 0;
  });

  return {
    totalVotos: votosData.length,
    totalColaboradores,
    votantesUnicos: votantesUnicos.size,
    evaluadosUnicos: evaluadosUnicos.size,
    tasaParticipacion: totalColaboradores > 0
      ? ((votantesUnicos.size / totalColaboradores) * 100).toFixed(2)
      : '0',
    promedios: promediosFinales
  };
}

function getTendenciasTemporales_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const votosSheet = ss.getSheetByName('Votos');

  if (!votosSheet || votosSheet.getLastRow() <= 1) return [];

  const votosData = votosSheet.getRange(2, 1, votosSheet.getLastRow() - 1, 10).getValues();
  const tendencias = {};

  votosData.forEach(row => {
    const fecha = new Date(row[0]).toLocaleDateString('es-GT');
    const puntuacion = parseFloat(row[7]);

    if (!isNaN(puntuacion)) {
      if (!tendencias[fecha]) tendencias[fecha] = { suma: 0, cantidad: 0 };
      tendencias[fecha].suma += puntuacion;
      tendencias[fecha].cantidad += 1;
    }
  });

  return Object.entries(tendencias).map(([fecha, d]) => ({
    fecha,
    promedio: (d.suma / d.cantidad).toFixed(2),
    votos: d.cantidad
  }));
}

function calcularPromedioColaborador_(evaluadoId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const votosSheet = ss.getSheetByName('Votos');

  if (!votosSheet || votosSheet.getLastRow() <= 1) return 0;

  const votosData = votosSheet.getRange(2, 1, votosSheet.getLastRow() - 1, 10).getValues();
  let suma = 0, cantidad = 0;

  votosData.forEach(row => {
    if (String(row[4]) === String(evaluadoId) && row[7]) {
      const p = parseFloat(row[7]);
      if (!isNaN(p) && p > 0) { suma += p; cantidad++; }
    }
  });

  return cantidad > 0 ? suma / cantidad : 0;
}

// ============= INICIALIZACIÓN =============

function inicializarSedes_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName('Sedes')) return;

  const sheet = ss.insertSheet('Sedes');
  sheet.getRange(1, 1).setValue('Sede').setFontWeight('bold');

  const defaults = [
    'Álamos', 'MiniTec Zona 3', 'MiniTec Zona 21',
    'Plaza España', 'Mini Muni Zona 10', 'Mini Muni Zona 12', 'Mini Muni Zona 14'
  ];
  defaults.forEach((s, i) => sheet.getRange(i + 2, 1).setValue(s));
}

function inicializarParametrosSupervisores_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName('Parametros Supervisores')) return;

  const sheet = ss.insertSheet('Parametros Supervisores');
  sheet.getRange(1, 1).setValue('Parametro').setFontWeight('bold');

  ['Liderazgo', 'Comunicación', 'Gestión de Equipo', 'Toma de Decisiones']
    .forEach((p, i) => sheet.getRange(i + 2, 1).setValue(p));
}

// ============= WEBHOOKS Y NOTIFICACIONES =============

function dispararWebhook_(evento, datos) {
  if (!CONFIG.WEBHOOK_URL) return;

  try {
    UrlFetchApp.fetch(CONFIG.WEBHOOK_URL, {
      method: 'post',
      payload: JSON.stringify({ evento, timestamp: new Date(), datos }),
      contentType: 'application/json'
    });
  } catch (_) {}
}

function enviarEmailNotificacion_(destinatario, asunto, cuerpo) {
  try {
    GmailApp.sendEmail(destinatario, asunto, cuerpo, { htmlBody: cuerpo });
    registrarAuditoria_('EMAIL_ENVIADO', destinatario, { asunto });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}
