# Sistema de Votación Premium v3 — Arquitectura Separada

## Estructura del Proyecto

```
votacion-premium/
├── backend/
│   └── API.gs              ← API REST para Google Apps Script
├── frontend/
│   ├── index.html           ← Aplicación principal (votación + dashboard)
│   ├── admin.html           ← Panel de administración
│   └── api-client.js        ← Módulo JS del cliente API (opcional, ya inline en index.html)
└── README.md
```

---

## 1. Desplegar el Backend (Google Apps Script)

### Paso a paso:

1. Abrí tu Google Spreadsheet existente (o creá uno nuevo)
2. Ve a **Extensiones → Apps Script**
3. Borrá todo el contenido de `Code.gs`
4. Copiá y pegá el contenido de `backend/API.gs`
5. Guardá el proyecto (Ctrl+S)

### Configurar la API:

En el archivo `API.gs`, editá la sección `CONFIG`:

```javascript
const CONFIG = {
  // Para API ABIERTA (solo CORS): dejar TOKEN vacío
  API_TOKEN: '',

  // Para API con TOKEN: poner un token secreto
  // API_TOKEN: 'mi-token-super-secreto-2026',

  ALLOWED_ORIGINS: [
    'http://localhost:3000',
    'https://TU-APP.netlify.app',   // ← Tu dominio de Netlify
    // 'https://TU-APP.vercel.app', // ← O tu dominio de Vercel
  ],
};
```

### Publicar como Web App:

1. En Apps Script, click en **Implementar → Nueva implementación**
2. Tipo: **Aplicación web**
3. Ejecutar como: **Yo** (tu cuenta)
4. Quién tiene acceso: **Cualquier persona**
5. Click **Implementar**
6. Copiá la URL generada → esta es tu `BASE_URL`

> **IMPORTANTE:** Cada vez que modifiques el código, creá una **nueva implementación**
> o actualizá la existente para que los cambios se reflejen.

---

## 2. Desplegar el Frontend

### Opción A: Netlify

1. Creá una carpeta con los archivos de `frontend/`
2. Entrá a [app.netlify.com](https://app.netlify.com)
3. Arrastrá la carpeta a la zona de drop
4. Netlify te da una URL automática (ej: `https://tu-app.netlify.app`)
5. Agregá esa URL a `ALLOWED_ORIGINS` en el backend

### Opción B: Vercel

1. Instalá Vercel CLI: `npm i -g vercel`
2. En la carpeta `frontend/`, ejecutá: `vercel`
3. Seguí las instrucciones
4. Agregá la URL generada a `ALLOWED_ORIGINS`

### Opción C: GitHub Pages

1. Subí los archivos de `frontend/` a un repositorio
2. En Settings → Pages → Source: `main` branch
3. Agregá la URL a `ALLOWED_ORIGINS`

---

## 3. Conectar Frontend con Backend

Al abrir la app por primera vez, se mostrará el modal de **Configuración**:

| Campo | Valor |
|-------|-------|
| **URL de la API** | La URL de deploy de Apps Script |
| **Token** | El token configurado en `API_TOKEN` (dejar vacío si es abierta) |
| **Email** | Tu email para identificación |

Esta configuración se guarda en `localStorage` del navegador.

---

## 4. Modos de Autenticación

### Modo 1: API Abierta (CORS)
- `API_TOKEN` vacío en el backend
- No se requiere token en el frontend
- Protección solo por CORS (dominios permitidos)
- **Recomendado para:** pruebas, uso interno en red confiable

### Modo 2: Con Token
- Definir `API_TOKEN` en el backend
- Pasar el token en cada request (query param o body)
- **Recomendado para:** producción

### Importante sobre CORS en Apps Script:
Google Apps Script no soporta CORS headers nativamente en su redirect.
La solución ya está implementada: el frontend envía `origin` como parámetro
y la API valida contra `ALLOWED_ORIGINS`.

> **Nota:** Si tenés problemas de CORS, asegurate de que el deploy esté
> configurado como **"Cualquier persona"** en los permisos de acceso.

---

## 5. Endpoints de la API

### GET (query param `action`)

| Endpoint | Descripción |
|----------|-------------|
| `getAllData` | Datos completos: colaboradores, parámetros, votos, analytics |
| `getDashboardData` | Analytics + tendencias temporales |
| `getAnalytics` | Solo métricas de analytics |
| `getAdminStats` | Estadísticas para el panel admin |

### POST (query param `action`, body JSON)

| Endpoint | Body | Descripción |
|----------|------|-------------|
| `guardarVotos` | `{votanteEmail, evaluadoId, calificaciones, ...}` | Registrar evaluación |
| `saveParametros` | `{valores: [...]}` | Guardar parámetros generales |
| `saveParametrosSupervisores` | `{valores: [...]}` | Guardar parámetros supervisores |
| `saveAreas` | `{valores: [...]}` | Guardar áreas |
| `saveSedes` | `{valores: [...]}` | Guardar sedes |
| `actualizarConfiguracion` | `{clave: valor, ...}` | Actualizar config |
| `asignarRol` | `{email, rol}` | Asignar rol a usuario |
| `generar2FA` | `{usuario}` | Generar código 2FA |
| `validar2FA` | `{usuario, codigo}` | Validar código 2FA |

### Ejemplo de uso con fetch:

```javascript
// GET
const response = await fetch(
  'https://script.google.com/.../exec?action=getAllData&userEmail=user@mail.com'
);
const data = await response.json();

// POST
const response = await fetch(
  'https://script.google.com/.../exec?action=guardarVotos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      votanteEmail: 'user@mail.com',
      evaluadoId: '1',
      evaluadoNombre: 'Juan Pérez',
      calificaciones: [
        { parametro: 'Calidad', puntuacion: 8 }
      ]
    })
  }
);
```

---

## 6. Hojas de cálculo requeridas

El sistema crea automáticamente las hojas que no existan:

| Hoja | Uso |
|------|-----|
| `Colaboradores` | Lista de personas a evaluar |
| `Parametros` | Criterios de evaluación |
| `Parametros Supervisores` | Criterios para supervisores |
| `Areas` | Áreas/departamentos |
| `Sedes` | Ubicaciones |
| `Votos` | Registro de evaluaciones |
| `Usuarios` | Gestión de usuarios y roles |
| `Roles` | Definición de permisos |
| `Auditoria` | Log de acciones |
| `2FA` | Códigos de verificación |
| `Configuracion` | Parámetros de sistema |

### Estructura de "Colaboradores" (crear manualmente):

| ID | Nombre | Area | FotoURL | Email | Sede |
|----|--------|------|---------|-------|------|
| 1 | Juan Pérez | TI | https://... | juan@mail.com | Álamos |

### Estructura de "Votos" (se crea automáticamente):

| Timestamp | EmailVotante | IdVotante | NombreVotante | IdEvaluado | NombreEvaluado | Parametro | Puntuacion | Sede | Comentario |
|-----------|-------------|-----------|---------------|------------|----------------|-----------|------------|------|------------|
