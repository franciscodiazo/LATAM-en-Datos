# Propuesta de migración de JSON a MySQL

## Estado actual validado
- Motor activo: **MySQL** (vía `USE_MYSQL=true`).
- Base creada: `latam_en_datos`.
- Usuario app creado: `latam_app@localhost`.
- Tablas actuales: `users`, `records`, `projects`.
- Conteos iniciales: users=6, records=25, projects=2.

## Qué datos adicionales conviene migrar

### 1) Open Data oficial (alta prioridad)
**Origen:** `data/open-data/official-open-latam.json`

Hoy se guarda como JSON en archivo y se consulta desde backend. Conviene llevarlo a MySQL para:
- búsquedas filtradas por indicador/año/territorio,
- escalabilidad,
- trazabilidad por fuente.

**Tablas sugeridas:**
- `open_datasets` (datasetId, title, summary, generatedAt)
- `open_source_notes` (datasetId FK, name, url, note)
- `open_records` (campos actuales + officialValue, officialUnit, officialYear, sourceUrl)

### 2) Datos CORE por proyecto temático (alta prioridad)
**Origen:**
- `public/data-core/core-food.json`
- `public/data-core/core-capacidad-comunitaria.json`
- `public/data-core/core-resiliencia-ecosistemica.json`

Tienen estructura consistente: `projectId`, `records`, `mapPoints`.

**Tablas sugeridas:**
- `core_projects` (projectId, title, summary)
- `core_focus_ods` (projectId FK, ods)
- `core_records` (projectId FK, indicator, meta, ods, tipoDato, instrumento, valorEjemplo, unidad, territorio)
- `core_map_points` (projectId FK, title, description, lat, lng, category, audience JSON, etc.)

### 3) Catálogo de actores (media prioridad)
**Origen:**
- `public/data-actores/actor-docentes.json`
- `public/data-actores/actor-estudiantes.json`
- `public/data-actores/actor-investigadores.json`

**Tablas sugeridas:**
- `actor_profiles` (actor, title)
- `actor_items` (actor FK, tema, accion, indicador, ods, instrumento)

### 4) Matriz de justificación e indicadores (media prioridad)
**Origen:** `public/data-core/propuesta-justificacion-ejemplo.json`

Útil para reportes y gobierno de datos (alineación ODS/metas).

**Tablas sugeridas:**
- `framework_justificacion` (project, enfoque)
- `framework_ods` (project FK, ods)
- `framework_metas` (project FK, meta)
- `framework_indicadores` (project FK, bloque, indicador, ods, meta, tipoDato, instrumento)

### 5) Datasets históricos de pruebas (baja prioridad)
**Origen:**
- `data/ginebra_valle_maslow.json`
- `data/sample_records_maslow_smithsonian.json`

Si se van a usar en producción, pueden normalizarse en una tabla staging (`ingestion_samples`) o fusionarse en `records` con bandera `source_format='LEGACY_JSON'`.

## Orden recomendado de implementación
1. Migrar `open-data` a MySQL.
2. Migrar `data-core` a MySQL.
3. Migrar `data-actores`.
4. Migrar matriz de justificación.
5. Deprecar lectura directa de JSON en backend.

## Reglas técnicas sugeridas
- Mantener `audience` como `JSON` (ya usado en `records`).
- Índices mínimos:
  - `records(indicator_code, measurement_date, country, city)`
  - `open_records(indicator_code, official_year, country, city)`
  - `core_map_points(project_id, city_name)`
- Agregar columnas de auditoría: `created_at`, `updated_at`, `created_by`.
- Definir catálogos para `indicator_code`, `evidence_level`, `ods_goal` para evitar inconsistencias.

## Nota cPanel
En hosting compartido, mantener `DB_AUTO_CREATE=false` y crear DB/usuario desde cPanel para evitar errores de privilegios globales.
