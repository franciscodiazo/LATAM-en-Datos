# LATAM en Datos

Plataforma Node.js para georreferenciar y consumir datos clasificados por pirámide de Maslow, ODS y guías Smithsonian, con autenticación por roles y mapa en tiempo real.

## Funcionalidades incluidas

- Login con credenciales y control de roles.
- Carga de datos en JSON o CSV solo por agente autorizado/admin.
- API protegida para consumo de grupo focal (investigadores y docentes embajadores NESST).
- Dashboard con métricas por categoría y Maslow.
- Mapa en tiempo real con OpenStreetMap + Leaflet + Socket.IO.
- Vista de pirámide de Maslow.
- Espacios dedicados para:
  - Embajadores docentes NESST y Smithsonian.
  - Estudiantes, docentes e investigadores.
  - Últimos proyectos realizados usando APIs o datos.
- Exportación de datos en JSON, CSV y GeoJSON.

## Requisitos

- Node.js 18+
- MySQL 8+ (para producción)

## Instalación

```bash
npm install
npm start
```

Aplicación disponible en:

- http://localhost:3000

## Usuarios demo

Todos usan la misma contraseña inicial:

- `Latam2026*`

Usuarios:

- `admin` (ADMIN)
- `agente` (AGENTE_AUTORIZADO)
- `nesst` (DOCENTE_EMBAJADOR_NESST)
- `investigador` (INVESTIGADOR)
- `docente` (DOCENTE)
- `estudiante` (ESTUDIANTE)

## Endpoints API principales

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/dashboard`
- `GET /api/data` (solo roles de consumo autorizado)
- `POST /api/data/upload` (solo ADMIN y AGENTE_AUTORIZADO)
- `GET /api/map/points`
- `GET /api/projects/recent`
- `GET /api/export/json|csv|geojson`

## JSON inicial Ginebra (Valle del Cauca)

Se agregó un dataset base en:

- `data/ginebra_valle_maslow.json`

Incluye puntos georreferenciados en Ginebra para:

- Instituciones Educativas
- Colegios
- Universidades
- Acueductos
- Parques
- Iglesias
- Centros de salud
- Hospitales
- IPS
- Zonas de entretenimiento/deportivas

Cada registro incluye:

- `siteType`
- `zipCode` (ejemplo: `763510`)
- `maslowLevel`
- Coordenadas `lat` y `lng`

Estos campos se visualizan en los popups del mapa.

### Administración de usuarios (dashboard / API)

Solo `ADMIN`:

- `GET /api/admin/users`
- `POST /api/admin/users`
- `PUT /api/admin/users/:id`
- `PUT /api/admin/users/:id/password`
- `DELETE /api/admin/users/:id`

## Producción con MySQL

Configura variables de entorno:

- `USE_MYSQL=true`
- `NODE_ENV=production`
- `DB_HOST=localhost`
- `DB_PORT=3306`
- `DB_USER=root`
- `DB_PASSWORD=tu_password`
- `DB_NAME=latam_en_datos`
- `JWT_SECRET=una-clave-segura-y-larga`

Ejemplo PowerShell:

```powershell
$env:USE_MYSQL='true'
$env:NODE_ENV='production'
$env:DB_HOST='localhost'
$env:DB_PORT='3306'
$env:DB_USER='root'
$env:DB_PASSWORD='tu_password'
$env:DB_NAME='latam_en_datos'
$env:JWT_SECRET='cambia-esto-en-produccion'
npm start
```

## Nota de seguridad

Este MVP usa almacenamiento JSON local por defecto para desarrollo. En producción activa MySQL con `USE_MYSQL=true`, define `JWT_SECRET` robusto y usa HTTPS.