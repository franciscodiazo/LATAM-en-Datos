# LATAM en Datos

Plataforma Node.js para georreferenciar y consumir datos clasificados por pirámide de Maslow, ODS y guías Smithsonian, con autenticación por roles y mapa en tiempo real.

## Propósito pedagógico y territorial

LATAM en Datos es una plataforma educativa colaborativa de alcance latinoamericano que integra analítica territorial, enfoque STEM y metodologías de investigación escolar para que estudiantes de distintos países analicen problemáticas reales de sus comunidades a partir de datos concretos.

La plataforma facilita la recolección, organización, análisis y visualización de indicadores como acceso al agua potable, gestión de residuos, conectividad digital e infraestructura escolar. Así, el territorio se convierte en un laboratorio vivo de aprendizaje que permite comparar países y regiones, identificar patrones comunes y reconocer desigualdades sociales, ambientales y tecnológicas.

En su visión de evolución, incorpora herramientas de inteligencia artificial como apoyo para interpretar datos, construir visualizaciones explicativas y asistir la elaboración de informes mediante un chatbot educativo.

## Resultados esperados

Se espera la consolidación de una plataforma educativa colaborativa de alcance latinoamericano que fortalezca competencias científicas, digitales y críticas, promoviendo alfabetización en datos, pensamiento basado en evidencia y comunicación de resultados mediante visualizaciones, informes y narrativas digitales.

La comparación de indicadores entre países y comunidades permitirá identificar similitudes, desigualdades y patrones comunes en América Latina, favoreciendo una mirada regional compartida.

Como resultado adicional, la plataforma funcionará como herramienta de apoyo para docentes en el diseño y desarrollo de proyectos de investigación escolar, promoviendo prácticas pedagógicas innovadoras, colaborativas y contextualizadas, y fortaleciendo el rol de la escuela como espacio de producción de conocimiento con impacto social.

## Fase 1: ciudades foco de investigación

Para la primera fase operativa, la plataforma prioriza tres nodos territoriales de comparación regional:

- Ginebra, Valle del Cauca, Colombia
- Ciudad de Guatemala, Guatemala
- Posadas, Misiones, Argentina

Estas ciudades se usan como referencia principal en visualización, análisis comparativo e iteración metodológica inicial.

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
- `POST /api/ai/chat`
- `GET /api/export/json|csv|geojson`

### Endpoint de asistente educativo (IA base)

`POST /api/ai/chat` (requiere autenticación)

Body sugerido:

```json
{
  "message": "Analiza brechas de conectividad en Guatemala",
  "context": {
    "country": "Guatemala",
    "city": "Cdad de Guatemala",
    "indicatorCode": "CONNECTIVITY",
    "fromDate": "2026-01-01",
    "toDate": "2026-12-31"
  }
}
```

Respuesta: síntesis analítica, hallazgos, recomendaciones y snapshot estadístico para informes escolares.

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

## Plantilla JSON para investigadores

Se agregó una plantilla lista para pruebas y carga en la API:

- `public/ejemplo-registros-investigadores.json`

Incluye:

- Guía de estructura de campos (`estructuraCampos`)
- Roles válidos para `audience`
- `records` de ejemplo alineados con ODS 6, 12, 13 y 15

## Datasets JSON Core y actores educativos

Se agregaron datasets locales para visualización en la UI:

- Proyectos Core (seleccionables en sección **Vitrina Core**):
  - `public/data-core/core-food.json`
  - `public/data-core/core-resiliencia-ecosistemica.json`
  - `public/data-core/core-capacidad-comunitaria.json`
- Referencia completa de propuesta y matriz:
  - `public/data-core/propuesta-justificacion-ejemplo.json`
- Actores educativos (sección **Eje Social & Académico**):
  - `public/data-actores/actor-estudiantes.json`
  - `public/data-actores/actor-docentes.json`
  - `public/data-actores/actor-investigadores.json`

En la sección **Radar Global** puedes seleccionar la fuente de datos del mapa entre:

- Plataforma (API)
- Core FOOD
- Core ECO
- Core ADAPT

En **Motor de Ingesta** también quedan disponibles para carga rápida:

- `public/datos-prueba.json`
- `public/ejemplo-registros-investigadores.json`
- `public/ejemplo-datos-almacenados.json` (ejemplo de cómo quedan almacenados los registros)

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

## Documentación del proyecto

- Propuesta y matriz central de indicadores: `docs/propuesta-justificacion-matriz.md`
- Diagnóstico técnico de ajustes para la actualización de alcance: `docs/analisis-ajustes-red-latam-ia.md`

## Mejoras recomendadas (siguiente iteración)

Estas mejoras están alineadas con el propósito del proyecto y pueden implementarse por fases:

1. **Comparabilidad entre países**
  - Estandarizar campos de país, ciudad, barrio/comunidad e institución en todos los registros.
  - Agregar una vista de comparación por indicador (ej. agua, residuos, conectividad, infraestructura).

2. **Calidad de datos en captura**
  - Validar rangos y catálogos en el formulario de ingesta para evitar registros incompletos.
  - Incluir nivel de evidencia (`observación`, `encuesta`, `fuente oficial`) y fecha de levantamiento.

3. **Trazabilidad educativa**
  - Añadir campo `curso/grado` y `rol recolector` para analizar participación estudiantil y docente.
  - Incorporar bitácora breve de contexto territorial por registro.

4. **Lectura rápida de desigualdades**
  - Crear tarjetas resumen por país/ciudad con semáforos de brecha por indicador clave.
  - Permitir filtrar y exportar por país y periodo de tiempo.

5. **Gobernanza y seguridad de datos**
  - Definir política de anonimización para datos sensibles de comunidades educativas.
  - Establecer protocolo de revisión y validación antes de publicar datos.