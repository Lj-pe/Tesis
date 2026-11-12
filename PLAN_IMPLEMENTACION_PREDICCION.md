# Predicción de demanda: arquitectura implementada y límites

**Rama de trabajo:** `feature/adaptacion-minimarket`  
**Estado:** integración implementada en modo sombra. Este documento describe el
comportamiento actual; no autoriza cambios al corte, al esquema de MySQL ni a
la política predictiva.

## 1. Resumen

La predicción está integrada en el sistema existente. El frontend React consume
la API Express autenticada; el backend lee los datos de `minimarket_tesis`,
reconstruye observabilidad y calcula el pronóstico en memoria con la política
Node.js validada contra los experimentos Python v6. No hay un worker Python,
tabla de predicciones, migración ni escritura de resultados.

El uso es **sombra**: las respuestas muestran estimaciones, método,
configuración, segmento y observabilidad; no emiten riesgos ni cantidades de
reposición y no generan compras. La categoría se usa para filtrar el catálogo
en la interfaz, no para agregar series ni agrupar productos en el modelo.

## 2. Componentes y contratos

| Componente | Responsabilidad actual |
|---|---|
| `frontend/src/pages/Predicciones.jsx` | Pantalla de catálogo y detalle, selección de categoría/producto y horizontes 7, 14 y 30 días; muestra respuesta real de la API. |
| `frontend/src/api/client.js` | Cliente HTTP compartido; adjunta el token de sesión. |
| `backend/src/app.js` | Monta `authMiddleware` antes de las rutas de negocio. La autenticación es la existente; no se consultan roles ni permisos por módulo. |
| `backend/src/routes/prediccion.routes.js` | Expone el catálogo y el pronóstico por producto. El CRUD heredado `/api/predicciones` fue retirado; esa ruta base devuelve 404. |
| `backend/src/controllers/demandaPrediccion.controller.js` | Valida producto/horizonte, compone la respuesta y convierte fallos internos en mensajes genéricos. |
| `backend/src/models/demanda.model.js` | Lee el catálogo y los datos históricos requeridos usando el esquema real. No contiene CRUD de predicciones. |
| `backend/src/services/demandaPolicy.service.js` | Reconstrucción diaria, clasificación de segmento, ajuste Ridge e inferencia ADIDA/media móvil. |
| `backend/tests/demandaPolicy.test.js` | Pruebas vigentes de política, observabilidad y equivalencia numérica. El servicio legacy `demandaForecast.service.js` y su prueba fueron retirados al quedar sin consumidores. |

Rutas activas:

- `GET /api/predicciones/demanda/catalogo`
- `GET /api/predicciones/demanda/productos/:productId?horizonte_dias=7|14|30`

La API rechaza producto u horizonte inválidos; exige autenticación y no confía
en controles de acceso del cliente. El CRUD heredado de predicciones se retiró
porque su modelo apuntaba a una tabla no existente en la BD activa.

## 3. Datos, corte y observabilidad

- El modelo mantiene como corte fijo `2026-11-06` (`LAST_VALIDATED_DATE`).
  Las fechas de extracción, etiquetas y ventanas no se desplazan con el reloj.
  Los días posteriores al corte no forman parte del pronóstico actual.
- El panel diario comienza el `2025-10-02`; la reconstrucción parte de los
  movimientos del `2025-10-01`.
- Para cada producto se acumulan movimientos ordenados por fecha/hora e ID. Un
  día se etiqueta como observado y admite cero solo cuando el saldo de apertura,
  el mínimo intradía y el saldo de cierre son todos positivos.
- Si no hay disponibilidad verificable, el valor de demanda se conserva como
  desconocido (`null`); una venta registrada durante censura se etiqueta por
  separado y no se toma como día completamente observado.
- La confirmación disponible de cobertura comercial y la conciliación interna
  respaldan el protocolo experimental, pero no equivalen a un conteo físico
  independiente de inventario. La observabilidad no debe interpretarse como
  certificación de inventario real.
- No se aplica pooling por categoría: cada producto tiene panel y pronóstico
  propios. La categoría solo facilita el filtrado visual.

## 4. Política predictiva vigente

La segmentación usa únicamente los 56 días calendario anteriores al origen. Si
algún día de esa ventana no es observable, el segmento es `unknown`. Un producto
es `frequent` si tiene al menos 8 días positivos, intervalo medio entre ventas
de hasta 7 días y la venta más reciente ocurrió dentro de los últimos 14 días.
Para los demás, un total de hasta 8 unidades implica `low`; el resto es
`intermittent`.

| Horizonte | Segmento frecuente | Segmento intermitente | Segmento bajo |
|---|---|---|---|
| 7 días | Ridge, ventana 90 días, `alpha=100` | ADIDA ponderado, vida media 90 días, `alpha=0.3` | Media móvil rolling de 45 días |
| 14 días | Ridge, ventana 60 días, `alpha=100` | ADIDA ponderado, vida media 150 días, `alpha=0.3` | Media móvil rolling de 56 días |
| 30 días | Ridge, ventana 90 días, `alpha=100` | ADIDA ponderado, vida media 210 días, `alpha=0.3` | Media móvil ponderada de historial completo, ventana de ponderación 90 días |

Ridge es específico por horizonte. Usa orígenes semanales de desarrollo
2025-12-01 a 2026-07-27 y de holdout 2026-09-07 a 2026-10-05, sujetos a
disponibilidad de historial/objetivo completo anterior al corte. El ajuste y las
variables se implementan en Node.js; los valores `alpha`, ventanas y resultados
de referencia no deben cambiarse sin una nueva evaluación experimental.

La comparación de referencia reportada para 1.500 predicciones registró 1.464
coincidencias exactas; las 36 restantes fueron Ridge, con diferencia absoluta
máxima de `0.0000556`, dentro de la tolerancia `1e-4`. Esto demuestra la
tolerancia reportada para esos casos, no identidad bit a bit ni equivalencia
para datos futuros.

## 5. Datos nuevos, entrenamiento y persistencia

No existe modelo serializado ni proceso de entrenamiento en segundo plano.
Cada solicitud vuelve a cargar los datos por consulta y ajusta Ridge en memoria
con las observaciones históricas que pasan las reglas de ventana y
observabilidad; ADIDA y media móvil se calculan igualmente al solicitar el
pronóstico. No se guarda el pronóstico ni se hace aprendizaje incremental.

Aunque lleguen ventas nuevas a MySQL, el servicio actual mantiene el corte
validado en 2026-11-06. Incorporar periodos recientes requiere revisar
completitud/censura, actualizar de forma aprobada el corte y volver a validar
los resultados. No se adelanta esa fase en este documento.

La primera integración no necesita cambios en `minimarket_tesis`: las lecturas
se hacen en memoria y la BD no recibe tablas, columnas, vistas, migraciones ni
escrituras de predicción. El legado CRUD que asumía una tabla `predicciones`
se eliminó; no se debe restaurar ni simular esa tabla.

## 6. Respuesta y límites de producto

La respuesta del pronóstico incluye producto, horizonte, demanda, método,
segmento, versión/configuración, observabilidad, inventario disponible,
ventana histórica y fechas del objetivo. Para mantener el modo sombra:

- `risk` y `suggested_replenishment` permanecen `null`.
- No se producen cantidades de compra, órdenes ni recomendaciones automáticas.
- El stock actual no se usa como sustituto de disponibilidad histórica.
- La interfaz no debe presentar valores de demostración como respuesta de
  modelo; debe mostrar carga, error y ausencia de pronóstico por separado.

## 7. Seguridad, pruebas y límites conocidos

- Las rutas activas están protegidas por `authMiddleware`; no existen roles
  diferenciados en esta integración. `usuario.model.js` se conserva porque
  forma parte del inicio de sesión.
- Las páginas y CRUD de usuarios/roles desconectados de la navegación/API y los
  modelos/permisos asociados al esquema heredado se retiraron. Middleware de
  autorización compartido por otros módulos se conserva.
- Las pruebas de modelo y autenticación cubren horizonte permitido, observabilidad,
  selección de política y acceso autenticado/no autenticado. La prueba antigua
  `backend/tests/api.crud.test.js` realiza DML, limpieza transaccional y depende
  del esquema heredado; no debe ejecutarse contra `minimarket_tesis`. Su
  validación queda pendiente hasta disponer de una BD de pruebas aislada con el
  esquema que esa suite requiere.
- Los scripts SQL de `base_de_datos/` corresponden al sistema Boutique y son
  documentación histórica, no esquema de despliegue de `minimarket_tesis`.
- La evaluación v6 es exploratoria: los orígenes de holdout se solapan y no
  sustituyen una validación prospectiva. No es base para automatizar compras.

## 8. Siguientes etapas fuera de esta integración

1. Acordar cómo certificar el corte comercial y la cobertura completa de datos
   nuevos sin alterar las ventanas históricas actuales.
2. Revalidar observabilidad, métricas y estabilidad con nuevos periodos antes
   de cambiar el corte o recalibrar la política.
3. Considerar persistencia únicamente si se aprueban requisitos de auditoría,
   retención y versionado; cualquier cambio de esquema requiere aprobación
   separada.
4. Mantener la interfaz y la API en modo sombra hasta que exista aprobación
   explícita para decisiones operativas.
