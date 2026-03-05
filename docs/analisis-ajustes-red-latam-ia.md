# Análisis técnico de ajustes requeridos

## Contexto de actualización

La plataforma se redefine como una **red educativa colaborativa latinoamericana** con soporte de **inteligencia artificial**, enfoque **STEM** y metodologías de **investigación escolar**. El propósito es que estudiantes y docentes recolecten y analicen datos territoriales comparables entre países, generen hallazgos y comuniquen resultados.

## Diagnóstico: estado actual vs actualización

### Capacidades ya cubiertas en la app

- Autenticación por roles y gestión básica de usuarios.
- Carga de registros JSON/CSV y normalización de datos.
- Visualización georreferenciada en mapa de América Latina (Leaflet).
- Dashboard con métricas por categoría y niveles de Maslow.
- Comparador básico por ciudades (gráficas radar y barras).
- Exportación de datos en JSON, CSV y GeoJSON.

### Brechas principales detectadas

1. **IA y chatbot educativo**
   - No hay endpoints, servicios ni interfaz para chatbot o análisis asistido por IA.
   - No existe flujo de generación de narrativas automáticas o interpretación guiada.

2. **Modelo de datos para comparación regional robusta**
   - El esquema actual no exige campos clave de comparabilidad (`country`, `region`, `city`, `community`, `schoolId`, `indicatorCode`, `measurementDate`, `evidenceLevel`).
   - La comparación actual se basa en inferencia de ciudad por texto y coordenadas, lo que limita consistencia analítica.

3. **Flujo STEM / investigación escolar explícito**
   - No hay etapas pedagógicas estructuradas (pregunta, hipótesis, método, levantamiento, análisis, conclusiones).
   - Falta trazabilidad del trabajo estudiantil (`grade`, `team`, `teacherId`, `researchCycle`).

4. **Analítica de desigualdades por indicadores clave**
   - Las vistas actuales no priorizan indicadores de agua, residuos, conectividad e infraestructura en panel comparativo dedicado.
   - No hay índices o semáforos de brecha por país/región.

5. **Reportería asistida y difusión de hallazgos**
   - No existe módulo para generar informes automáticos por periodo/territorio.
   - No hay exportación narrativa (solo datos crudos).

6. **Gobernanza y calidad de datos**
   - Validaciones de ingesta limitadas para catálogos/rangos.
   - Falta política operativa visible de anonimización y control de publicación.

## Ajustes requeridos (priorizados)

## Fase 1 — Alta prioridad (base funcional)

Ciudades foco para esta fase:

- Ginebra, Valle del Cauca (Colombia)
- Ciudad de Guatemala (Guatemala)
- Posadas, Misiones (Argentina)

1. **Estandarizar esquema de registro**
   - Incorporar campos obligatorios:
     - `country`, `region`, `city`, `community`, `schoolName`
     - `indicatorCode` (`WATER`, `WASTE`, `CONNECTIVITY`, `INFRASTRUCTURE`)
     - `measurementDate`, `evidenceLevel`, `sourceInstrument`
     - `grade`, `teamName`, `teacherName`
   - Actualizar `normalizeRecord`, exportadores y datasets de ejemplo.

2. **Validaciones de calidad de datos**
   - Validar coordenadas, listas permitidas y formatos de fecha.
   - Rechazar ingestas con errores estructurales y devolver reporte de filas inválidas.

3. **Comparador territorial por indicador**
   - Filtros por país, región, ciudad, indicador y periodo.
   - Tarjetas de brecha comparativa por indicador (mínimo, promedio, máximo).

## Fase 2 — Prioridad media (analítica educativa)

4. **Módulo de investigación escolar (STEM)**
   - Flujo guiado por etapas: problema, hipótesis, método, evidencia, análisis, conclusiones.
   - Registro de ciclo de investigación y responsables por equipo.

5. **Generación de informes semiautomáticos**
   - Plantilla de reporte por territorio con tablas y gráficos.
   - Exportación en formato Markdown/HTML/PDF (según stack definido).

## Fase 3 — Prioridad estratégica (IA colaborativa)

6. **Chatbot educativo con IA**
   - Asistente para:
     - resumir hallazgos por país/indicador,
     - detectar patrones y anomalías,
     - sugerir preguntas de investigación,
     - redactar borradores de informe.
   - Recomendado iniciar con endpoint backend dedicado (`/api/ai/chat`) y control por rol.

7. **Gobernanza, ética y privacidad**
   - Reglas de anonimización por defecto para datos sensibles.
   - Versionado de datasets y bitácora de revisión docente antes de publicación.

## Impacto esperado de los ajustes

- Mayor comparabilidad entre países y regiones.
- Mejor calidad y trazabilidad de datos escolares.
- Integración real del enfoque STEM en el proceso de aprendizaje.
- Escalabilidad de la red colaborativa latinoamericana.
- Producción de informes útiles para comunidades educativas y toma de decisiones.

## Resultados educativos esperados (actualización)

- Fortalecimiento de competencias científicas, digitales y críticas en estudiantes.
- Desarrollo de alfabetización en datos y pensamiento basado en evidencia.
- Comunicación de hallazgos a través de visualizaciones, informes y narrativas digitales.
- Identificación de similitudes, desigualdades y patrones comunes a escala regional.
- Apoyo docente para diseñar y ejecutar proyectos de investigación escolar contextualizados.

## Recomendación de implementación

- Mantener el MVP actual operativo y abrir una rama de evolución por fases.
- Ejecutar primero Fase 1 para estabilizar estructura de datos y comparabilidad.
- Incorporar IA en Fase 3, una vez exista base de datos estandarizada y flujos pedagógicos definidos.
