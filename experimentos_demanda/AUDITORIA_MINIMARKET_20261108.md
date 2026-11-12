# Auditoría de datos para predicción: `minimarket_tesis`

**Fecha de revisión:** 8 de noviembre de 2026  
**Rama:** `feature/adaptacion-minimarket`  
**Modo:** consultas MySQL de solo lectura; sin exportación de datos personales, escrituras, entrenamiento ni backtesting.

Esta auditoría complementa el [informe de experimentos históricos](./INFORME_METODOLOGICO_DEMANDA.md). Los datos del experimento anterior no se mezclan con la base actual ni se usan para entrenar modelos de `minimarket_tesis`.

## Resumen ejecutivo

Se puede reconstruir el saldo registrado de inventario por producto y antes de cada movimiento, usando los 100 ajustes iniciales y el libro de movimientos. Las comprobaciones actuales muestran stock positivo antes de cada venta registrada y las cantidades de venta/reversión/recepción cuadran con sus detalles.

Esto **no demuestra** que la captura de ventas fuera completa en cada día ni que un producto sin detalle de venta no tuviera demanda. Por tanto, los días producto sin venta permanecen desconocidos y no se convierten en ceros. No se preparó un panel de entrenamiento, no se ajustaron modelos y no se calcularon métricas A/B/C ni holdout.

## Hechos comprobados

| Área | Resultado de lectura | Interpretación |
|---|---|---|
| Ventas | 500 realizadas entre 2025-10-01 y 2026-11-06; una anulada el 2026-11-07. Fechas comerciales y marcas de evento no son nulas. | Solo realizadas cuentan como ventas observadas. La anulada y su reversión no son demanda vendida. |
| Detalles realizados | 2.326 líneas, 100 productos, 7.122 unidades registradas y 2.326 producto-días con detalle. No hubo cantidades no positivas, referencias huérfanas ni diferencias entre importe y cantidad × precio. | Se conoce una cantidad positiva en los producto-días con detalle; no se conoce el total de demanda de los días sin detalle. |
| Fechas calendario | Hubo ventas realizadas en cada una de las 402 fechas entre 2025-10-01 y 2026-11-06. | Esto no acredita cobertura de captura, horario de operación ni disponibilidad de todos los productos. |
| Catálogo | 100 productos; sin faltantes de categoría, presentación, precio actual o `dias_seguridad`; cuatro marcas vacías. Todos comparten fecha `creado_en` 2026-10-31. | `creado_en` no es evidencia fiable de la fecha de lanzamiento/alta comercial, pues las ventas preceden esa fecha. El precio actual no es el precio histórico. |
| Movimientos | 2.327 ventas, una reversión, 575 recepciones y 100 ajustes. Cada producto tiene un ajuste positivo inicial; total registrado 1.357 unidades. | La reconstrucción parte de ese saldo inicial registrado; no verifica el conteo físico ni integridad anterior al primer evento. |
| Conciliación | Cero referencias/cantidades discordantes entre ventas y movimientos; 0 discrepancias para reversión y recepción. Las ventas enlazadas comparten timestamp con `ventas.realizada_en`. | Buena consistencia interna, no prueba ausencia de movimientos omitidos. |
| Stock antes de venta | En 2.327 eventos de venta, stock reconstruido previo fue positivo; mínimo 4, máximo 95 unidades. | No se observan ventas registradas con saldo no positivo. Esto demuestra disponibilidad en los instantes de venta según el libro, no exposición continua entre ventas. |
| Empates intradía | Dos empates venta/recepción, para productos 34 y 71. El saldo antes de ambos eventos era 20 y 10; cada venta fue de 4. | La ambigüedad de orden del timestamp no cambia que hubiera saldo suficiente para esas ventas. El orden no se debe generalizar a otros sistemas/datos. |
| Compras/recepciones | 362 compras recibidas, 5 pendientes; 362 recepciones enlazadas a compras. Las compras pendientes registradas son del 4 al 6 de noviembre, con entregas previstas del 7 al 9. | Útiles para reconstruir eventos conocidos en cada fecha; no demuestran disponibilidad ni demanda perdida. |
| 7 y 8 de noviembre | El 7 hay una venta anulada y movimientos de salida/reversión por 5 unidades; no hay venta realizada. El 8 no aparecen ventas, movimientos ni pedidos en la consulta de fechas. | Ambas fechas quedan fuera de entrenamiento/evaluación hasta verificar captura. El registro anulado no se considera venta. |

Las fechas se obtuvieron con `DATE(fecha_comercial)` en la zona horaria del servidor MySQL (`America/Bogota`); el controlador de auditoría también informa configuración de zona horaria. No se deben comparar marcas UTC renderizadas con fecha comercial sin convertir zona.

## Reconstrucción de disponibilidad y validez de observaciones

El libro permite calcular para cada movimiento:

`stock antes del evento = saldo inicial registrado + suma de variaciones de movimientos anteriores`

Se ordenó por `ocurrido_en` y clave `id`; se inspeccionaron los únicos dos grupos con venta y recepción en el mismo timestamp. Eso permite examinar **saldo en el instante de las transacciones registradas**. No prueba:

- que no falten ventas o movimientos en el libro;
- que el producto estuvo disponible durante todas las horas del día;
- que un día sin venta fuera un día abierto y completamente capturado;
- que la cantidad registrada sea demanda no censurada;
- ni que la fecha `creado_en` identifique la primera fecha comercial del producto.

Por ahora, un registro utilizable y verificable es un **evento de venta realizada con su cantidad registrada**. No se define el producto-día sin venta como observación cero. Un panel diario completo para modelar totales, backtesting y holdout se mantiene bloqueado hasta contar con cobertura diaria confiable y una regla acordada para producto-días observables. No debe calcularse WAPE sobre etiquetas parciales como si fueran demanda total.

## Variables: decisión de auditoría (no evaluación predictiva)

| Variable | Disponibilidad histórica | Decisión |
|---|---|---|
| Cantidad y fecha comercial de venta | En detalles y venta realizada. | Fuente correcta del objetivo observado; los huecos no se imputan. |
| Historia, rezagos, frecuencia, tendencia | Requieren etiquetas diarias válidas anteriores al origen. | No construir features todavía; dependen de la resolución de cobertura. |
| Día de semana/calendario | Conocido en el origen. | Candidata razonable después de definir períodos observables; aún no evaluada. |
| Categoría, marca, presentación | Catálogo actual; marca falta en cuatro productos. | Candidatas para compartir información, pero debe validarse vigencia histórica de atributos. |
| Precio | Existe precio actual y precio en el detalle histórico. | No usar el precio actual como precio histórico/futuro; evaluar solo si se define qué precio se conoce antes del origen. |
| Compras, recepciones y plazos | Hay fechas y relaciones de compra/recepción. | Posibles variables de disponibilidad; deben reconstruirse “as of” el origen, nunca usar recepciones futuras. |
| Saldo/movimientos | Saldo actual deriva del libro; puede reconstruirse entre movimientos. | Puede identificar stock registrado antes de eventos, pero no disponibilidad continua ni demanda latente. No usarlo como covariable hasta validar faltantes y semántica. |
| `dias_seguridad` | Presente para todo catálogo. | No hay regla de reposición aprobada documentada; no fijar riesgo o reposición a partir de él sin confirmar negocio. |

## Modelos y evaluación

**Ningún modelo de la BD actual fue entrenado o evaluado.** No se seleccionó modelo recomendado para ningún horizonte. Los candidatos históricos (naive, móviles, Croston-SBA, TSB, ADIDA, Ridge) permanecen como referencias, no como ganadores trasladables.

El escenario A histórico se documenta en el informe metodológico existente y usa otra extracción/catálogo. No es equivalente a B/C y no se empleó para inferir resultados actuales. B (modelos sobre `minimarket_tesis`) y C (features adicionales) quedan pendientes; comparar sus métricas con A sería descriptivo, no una comparación de producto emparejado ni una prueba equivalente.

La priorización futura, una vez que haya etiquetas observables, debe ser: baselines y métodos intermitentes; después Ridge/otras variables mediante ablación; orígenes cronológicos comunes para horizontes de 7/14/30; ajuste solo dentro del tramo de desarrollo; y holdout final reservado. Los resultados deben incluir MAE, RMSE, WAPE, número de etiquetas observables y cobertura por producto/segmento. Las ventanas solapadas se reportarán como dependientes.

## Artefacto reproducible

[auditar_minimarket.js](./auditar_minimarket.js) ejecuta las consultas anteriores y comprobaciones de conciliación dentro de una transacción `REPEATABLE READ`, `WITH CONSISTENT SNAPSHOT, READ ONLY`, verifica que la base sea `minimarket_tesis` y hace rollback. No escribe tablas ni exporta datos; imprime un resumen JSON sin credenciales.

Desde la raíz del repositorio:

```powershell
node .\experimentos_demanda\auditar_minimarket.js
```

Requiere la configuración local ya usada por backend en `backend/.env`, dependencias existentes de `mysql2` y `dotenv`; no instala paquetes. Verifica los conteos de la fecha de ejecución antes de citarlos, pues la base puede cambiar.

No se generó dataset porque un dataset de demanda diaria con ausencias convertidas en cero sería inválido. Tampoco se generaron métricas o gráficos de modelos, ni se alteraron CSV, modelos o resultados históricos.

## Etapas

| Etapa | Estado |
|---|---|
| Inspección de fuentes experimentales existentes | Completada; se reutilizan el informe y los artefactos históricos sin cambios. |
| Auditoría de estructura e integridad relacional | Completada para las consultas y relaciones descritas arriba. |
| Reconstrucción del saldo en timestamps de eventos | Parcialmente completada; consistencia interna verificada, completitud del libro y exposición intradía no demostradas. |
| Definición de producto-días negativos observables | Bloqueada por falta de prueba de captura completa y disponibilidad continua. |
| Dataset de entrenamiento/validación | Bloqueado; no se generan ceros artificiales ni etiquetas parciales. |
| Entrenamiento, backtesting, tuning y holdout | Bloqueados hasta resolver validez de etiquetas. |
| Recomendación final por horizonte | Pendiente; no hay métricas actuales que la respalden. |
