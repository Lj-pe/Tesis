# Investigación técnica para reducir el error de predicción

**Fecha:** 10 de noviembre de 2026
**Rama revisada:** `feature/adaptacion-minimarket`
**Alcance:** auditoría MySQL de solo lectura y análisis de los extractos y resultados existentes. No se entrenaron modelos, no se modificaron los experimentos v3-v5 ni se alteró la base de datos.

## Conclusión ejecutiva

El principal límite no parece ser simplemente una ventana mal escogida. La demanda por producto es muy dispersa: en el panel etiquetado de v3, **37.781 de 40.100 producto-días (94,2%) tienen cero ventas**, aunque los días se incluyen como cero solo cuando el libro de movimientos permite clasificar el producto disponible durante el día. El producto mediano registra ventas en 25 de 401 días. Por ello, un pronóstico puntual por producto tiene que acertar tanto si habrá venta como cuántas unidades se venderán; una tasa promedio tiende a errar la mayoría de los días y los eventos esporádicos dominan el WAPE.

v5 aporta evidencia útil pero no concluyente:

- ADIDA ponderado es estable entre ventanas cercanas para demanda intermitente; extender la ventana de media vida produce mejoras muy pequeñas en desarrollo.
- La selección de **pronóstico cero** para el segmento bajo en 7 y 14 días tiene MAE competitivo, pero deja un WAPE de 1,00 y subestima toda la demanda positiva de ese grupo.
- El híbrido reduce WAPE frente a v4 en 7 y 14 días, pero empeora RMSE; a 30 días v4 es mejor en las tres métricas.
- En el holdout de v5, los segmentos intermitente y bajo explican la mayor parte del error absoluto. La segmentación actual por volumen de 56 días no resuelve por sí sola el problema de ocurrencia esporádica.
- La búsqueda de ventanas de v4/v5 **no probó** 14 ni 28 días. Además, varios orígenes iniciales de desarrollo no tenían historial suficiente para materializar las ventanas más largas. La aparente ventaja de una ventana configurada no equivale siempre a observar toda esa cantidad de días.

La prioridad recomendada es verificar la evaluación y el sesgo por producto, probar modelos probabilísticos de ocurrencia × tamaño y pooling por categoría/producto, y ampliar la comparación de ventanas con cohortes de orígenes que realmente dispongan del historial completo. No recomendaría reemplazar v4/v5 ni elegir un algoritmo ganador hasta obtener validación temporal más independiente.

## 1. Fuentes y diagnóstico de la base

La auditoría se ejecutó el 10 de noviembre a las 17:15 UTC con la configuración local ya existente. La conexión verificó que la base era `minimarket_tesis` y ejecutó consultas dentro de una transacción `REPEATABLE READ`, `WITH CONSISTENT SNAPSHOT, READ ONLY`, seguida de `ROLLBACK`. No se exportaron filas ni credenciales. La consulta ejecutable está en [`auditar_minimarket.js`](../auditar_minimarket.js).

| Fuente | Datos comprobados | Utilidad y límites |
|---|---|---|
| Ventas y detalle | 500 ventas realizadas, 2.326 líneas/producto-días, 7.122 unidades, entre 2025-10-01 y 2026-11-06. Las cantidades son positivas; no se detectaron importes discordantes ni referencias huérfanas. | Es la fuente del objetivo. Usar solo ventas realizadas; excluir anulaciones y sus reversas. |
| Cobertura calendario | Se encontró al menos una venta realizada en cada una de las 402 fechas del 2025-10-01 al 2026-11-06. | Confirma actividad registrada por fecha, no por sí sola que cada producto tuviera venta o demanda cero. |
| Catálogo | 100 productos activos en 10 categorías (8–12 productos por categoría); categoría, presentación, precio actual y días de seguridad presentes; 4 marcas vacías. Todos los productos tienen `creado_en = 2026-10-31`, pese a tener ventas anteriores. | Categoría/marca/presentación son candidatos de pooling, sujetos a estabilidad histórica. `creado_en` no sirve para inferir fecha de lanzamiento. Precio actual no representa el precio futuro. |
| Movimientos | 2.327 eventos tipo venta, 1 anulación, 575 recepciones y 100 ajustes iniciales positivos; ajustes suman 1.357 unidades y recepciones 8.602. | Permiten reconstruir el stock registrado y distinguir ventas de suministro; no son ventas adicionales. |
| Conciliación de inventario | Cero discrepancias entre movimientos de venta, anulación y recepción y sus detalles. En 2.326 ventas realizadas el stock registrado previo fue positivo (mínimo 4); los cierres diarios reconstruidos del período fueron positivos (mínimo 1). Hay dos empates venta/recepción en el mismo timestamp. | No se observan quiebres registrados; el libro no prueba conteos físicos ni ausencia de movimientos omitidos. Los empates deben resolverse con el orden/claves del libro y no extrapolarse a otros datos. |
| Compras y recepciones | 362 órdenes recibidas y 5 pendientes al corte; las pendientes corresponden a órdenes del 4–6 de noviembre con fechas previstas 7–9 de noviembre. | Útiles para suministro e inventario “as of” una fecha. Una orden es endógena a decisiones previas y no equivale a demanda futura. |
| Fechas excluidas | El 2026-11-07 aparece una venta anulada y su reversa, no una venta realizada; el 2026-11-08 no tenía registros en la auditoría anterior. Ambas se excluyen conforme a la regla acordada. | No usar la anulación como etiqueta positiva ni concluir cierre a partir de una fecha sin registros. |

### Validez de los ceros y cobertura histórica

El extracto usado por v3-v5 identifica `minimarket_tesis`, cubre las ventas hasta el 6 de noviembre y excluye el primer día de etiqueta (1 de octubre) porque no dispone de saldo de apertura anterior. El panel tiene 401 días etiquetables, del 2 de octubre de 2025 al 6 de noviembre de 2026, para 100 productos. La reconstrucción del libro clasificó sus 40.100 producto-días como observables disponibles y dejó 37.781 con cero unidades. La regla de construcción requiere stock positivo al abrir, durante los movimientos intradía y al cerrar; los días no observables no deben convertirse en ceros.

Esta conclusión depende de que el libro de movimientos sea completo y de la confirmación de negocio de que todas las ventas quedan registradas con su fecha comercial real. Los controles SQL comprueban consistencia interna, no demanda perdida ni conteos físicos. Si cambia esa garantía, los ceros deben volver a censurarse.

## 2. Comportamiento real y causas probables del error

### Dispersión y estacionalidad observada

- La participación de ceros es **94,2%** de los producto-días observables. Los cuartiles de días con venta por producto son aproximadamente 15, 25 y 32 de 401; no hay productos sin ventas en el período. La mediana del intervalo medio entre ventas por producto es 15,9 días (la mediana de ADI es 16,0), con amplia variabilidad entre artículos.
- Los 10 productos de mayor volumen reúnen el 18,2% de las unidades: el volumen no está extremadamente concentrado en unos pocos artículos.
- Las medias del portafolio por día de semana en el extracto oscilan entre 17,25 y 18,60 unidades/día (rango cercano al 8%). Es señal suficiente para probar un baseline semanal, pero no evidencia de que todos los productos sigan ese patrón.
- Las medias mensuales observadas varían aproximadamente de 16,5 a 19,4 unidades/día. Solo hay una repetición anual y noviembre de 2026 está incompleto; no se puede separar estacionalidad anual, tendencia y ruido ni validar una regla de temporada.
- Hay 10 categorías con volúmenes distintos; las categorías 3, 1 y 2 aportan aproximadamente 18,4%, 13,8% y 13,8% de las unidades del extracto. Es una base razonable para pooling parcial, no suficiente para entrenar modelos independientes por categoría y producto sin regularización.

### Errores de v5 en su holdout

El holdout común tiene cinco orígenes y 500 producto-orígenes por horizonte. La tabla descompone los pronósticos seleccionados de v5; `sesgo` es pronóstico menos real. WAPE de 1,00 equivale a 100%.

| Horizonte | Segmento | n producto-orígenes | Real | Pronóstico | Sesgo | WAPE | Parte del error absoluto |
|---:|---|---:|---:|---:|---:|---:|---:|
| 7 | Frecuente | 12 | 15 | 17,19 | +2,19 | 1,212 | 2,7% |
| 7 | Intermitente | 235 | 344 | 317,97 | -26,03 | 1,235 | 62,0% |
| 7 | Bajo | 253 | 242 | 0 | -242 | 1,000 | 35,3% |
| 14 | Frecuente | 12 | 29 | 36,30 | +7,30 | 0,711 | 1,8% |
| 14 | Intermitente | 235 | 676 | 629,26 | -46,74 | 0,905 | 54,3% |
| 14 | Bajo | 253 | 495 | 0 | -495 | 1,000 | 43,9% |
| 30 | Frecuente | 12 | 95 | 81,12 | -13,88 | 0,419 | 2,3% |
| 30 | Intermitente | 235 | 1.490 | 1.344,58 | -145,42 | 0,599 | 52,1% |
| 30 | Bajo | 253 | 1.069 | 879,01 | -189,99 | 0,730 | 45,6% |

En total, v5 pronostica 335 de 601 unidades a 7 días y 666 de 1.200 a 14 días: subestima ambos horizontes aproximadamente 44%. La causa inmediata en el segmento bajo es el baseline de cero seleccionado por desarrollo: su WAPE es exactamente 1,00 y omite toda venta positiva. En el segmento intermitente domina el error absoluto pese a que su WAPE mejora a horizontes largos; ADIDA ponderado subestima aproximadamente 7–10% en el holdout. A 30 días el pronóstico bajo sigue por debajo del real.

Ejemplos repetidos entre horizontes son **producto 28 (Fideos codito)**, que contribuye al mayor error a 7 y 14 días y aparece entre los mayores a 30; **producto 45 (Agua sin gas)** y **producto 41 (Néctar de durazno)** tienen errores absolutos altos a 30 días. El **producto 12 (Maíz para popcorn)** muestra el caso contrario en algunos horizontes: pronóstico positivo con poco o ningún real. Hay tanto subestimación como sobreestimación; la subestimación agregada, especialmente en bajo/intermitente, pesa más.

### Comparación v3/v4/v5

| Horizonte | v3 MAE / RMSE / WAPE | v4 | v5 | Cambio v5 vs v4 en WAPE |
|---:|---:|---:|---:|---:|
| 7 | 1,575 / 2,136 / 1,311 | 1,496 / 2,022 / 1,245 | 1,370 / 2,151 / 1,140 | -8,4% relativo |
| 14 | 2,431 / 2,983 / 1,013 | 2,344 / 2,955 / 0,977 | 2,255 / 3,307 / 0,940 | -3,8% relativo |
| 30 | 3,579 / 4,460 / 0,674 | 3,389 / 4,370 / 0,638 | 3,427 / 4,405 / 0,646 | +1,1% relativo |

La mejora de WAPE a 7/14 días no es una mejora uniforme: aumenta RMSE 6,4% y 11,9%, respectivamente, frente a v4. A 30 días v5 empeora las tres métricas. El WAPE global disminuye al alargar el horizonte porque el denominador de unidades reales crece; no significa que las predicciones diarias o por producto sean necesariamente mejores. Los WAPE por producto con real cero son indefinidos y no deben promediarse como si fueran comparables.

El holdout tiene cinco orígenes semanales. Para 14 días, los períodos objetivo se solapan parcialmente; para 30 días, ampliamente. Por eso los 500 producto-orígenes no son 500 observaciones temporales independientes. La incertidumbre real es mayor que la que sugiere un tamaño de muestra nominal de 500.

### Ventanas: evidencia disponible y limitaciones

v4/v5 solo compararon estas ventanas: H7 = 30/45/60/90; H14 = 60/90/120/150; H30 = 90/120/150/180/210. “Historial completo ponderado” significa ponderación exponencial sobre lo disponible, con la ventana indicada como semivida; no es una ventana que descarte todo dato anterior a X días.

| Segmento y horizonte | Mejor resultado de desarrollo entre candidatos cercanos | Lectura |
|---|---|---|
| Intermitente, 7 | ADIDA ponderado: 90d MAE 1,832; 60d 1,834; 45d 1,836; 30d 1,843. | Diferencias pequeñas (menos de 1% en MAE); no hay evidencia sólida de que 90d sea óptimo. |
| Intermitente, 14 | ADIDA ponderado: 150d MAE 2,600; 120d 2,601; 90d 2,602. | Meseta; el beneficio de añadir historia es marginal. |
| Intermitente, 30 | ADIDA ponderado: 210d MAE 4,052; 180d 4,055; 150d 4,059. | Meseta; la aparente mejora es menor que la incertidumbre temporal actual. |
| Frecuente, 7/14/30 | Ridge con historial y ventana móvil seleccionó 90/60/90d; solo 12 producto-orígenes frecuentes en cada holdout. | Señal insuficiente para fijar ventanas por horizonte; no extrapolar a la mayoría de productos. |
| Bajo, 7/14/30 | Baseline cero ganó H7/H14; media móvil con historial ponderado cercano a 90–150d ganó H30. | La decisión depende del criterio de error; cero reduce MAE en corto plazo pero causa subestimación sistemática. |

El desarrollo empieza el 2025-12-01, con solo 61 días etiquetables desde el 2025-10-02. De los 35 orígenes de desarrollo, las ventanas máximas no están completas en:

- H7, 90 días: **5/35** orígenes.
- H14, 150 días: **13/35** orígenes.
- H30, 210 días: **22/35** orígenes.

Los helpers acortan una ventana móvil cuando todavía no hay X días; el historial completo ponderado también dispone de menos historia al inicio. La comparación conserva cohortes, pero durante esos orígenes una configuración “210d” no ve 210 días. Se debe informar la antigüedad real por fold y presentar por separado (a) todos los orígenes con ventana truncada y (b) cohortes comunes con historia completa.

**Recomendación temporal provisional, no ganadores definitivos:**

| Horizonte | Ventana/estrategia que merece priorizarse | Alternativa que debe compararse |
|---:|---|---|
| 7 | Intermitentes: historia ponderada con semivida 45–90 días, por la meseta de v5. Frecuentes: ventana móvil 60–90d solo como hipótesis de baja confianza. | Incluir 14/28/30d y un baseline semanal. Probar también mezcla de señal reciente (14–28d) con nivel estable de 56–90d. |
| 14 | Intermitentes: ponderada 90–150d; v5 no distingue bien estas semividas. Frecuentes: comparar 60–120d. | Incluir 14/28/30/45/56d, y diferenciar 14 días como dos bloques semanales frente a un promedio diario. |
| 30 | Intermitentes: ponderada 150–210d solo si se compara con historia completa en orígenes elegibles. Frecuentes: 90–120d, aún incierta. | Incluir 56/90/120/150d y agregación semanal; separar los 28 días completos de los dos días parciales. |

No hay fundamento para preferir siempre más o menos historia. Los resultados actuales sugieren que ADIDA tolera una semivida más larga en horizontes largos, pero las diferencias son planas y la disponibilidad de 210 días fue desigual en desarrollo.

## 3. Variables: utilidad y cautelas

| Variable | Recomendación | Razón / prevención de fuga |
|---|---|---|
| Rezagos, tasas, días desde venta, frecuencia y tamaño positivo | Mantener; construir solo con etiquetas observables y disponibles hasta el origen. | Informativas para el nivel y la intermitencia; no llenar ausencias desconocidas con cero. |
| Día de semana | Probar perfil global y por categoría/producto con regularización. | El calendario futuro es conocido y el portafolio tiene unas 57 observaciones por weekday. La variación agregada es moderada; verificar beneficio emparejado. |
| Mes/temporada y festivos | Prioridad baja/media; evaluar como ablación, no asumir efecto. | Hay una sola temporada anual. Fechas de feriados/eventos deben provenir de un calendario disponible antes del origen; no inferirlas de ventas futuras. |
| Categoría, marca, presentación | Candidatas para pooling jerárquico/global; falta marca en 4 productos. | 10 categorías tienen varios productos, útil para compartir fuerza estadística. Validar que el atributo sea históricamente estable. |
| Precio histórico de detalle | Ablación posterior, usando precio observado solo hasta el origen. | El precio actual no es precio futuro; no hay calendario de promociones/precios futuros. La v5 no muestra una mejora clara de Ridge al añadir precio: en H7 frecuente, history-only y price quedan prácticamente empatados (MAE 1,976). |
| Stock disponible y censura | Usar primero para marcar etiquetas válidas; evaluar después solo si se identifica un mecanismo claro. | El stock no es demanda. El saldo actual reconstruido y los movimientos posteriores al origen son fuga. |
| Compras, recepciones, proveedor, plazo | No usar como predictor primario de demanda. Usar como información “as of” para riesgo de reposición y disponibilidad futura conocida. | Las órdenes responden a decisiones motivadas por demanda; una recepción futura no puede entrar como feature histórica antes de recibirse. |
| `creado_en`, `activo`, precio actual | Excluir hasta disponer de historia de vigencia. | Todos los productos comparten fecha de creación 2026-10-31 y la actividad actual no demuestra el estado histórico. |
| Ventas anuladas, devoluciones/reversiones y ajustes | Excluir de demanda vendida; auditar como registros de calidad. | Reversiones y ajustes no son compras de clientes ni demanda positiva. |

Las variables deben evaluarse mediante ablaciones emparejadas en los mismos orígenes y productos: historial solamente → calendario → categoría/producto global → precio → suministro. Si añadir un grupo no mejora de forma estable MAE/WAPE ni calibración, se descarta.

## 4. Modelos y segmentación recomendados para la siguiente fase

1. **Baselines de referencia:** cero, media móvil, naive del último período, tasa media y perfil semanal repetido. Deben utilizar exactamente la misma cohorte y definición del horizonte.
2. **Intermitencia:** Croston-SBA, TSB y ADIDA continúan como referencias. ADIDA ponderado es el mejor fundamento actual para segmentos intermitentes en desarrollo, pero su pequeña ventaja entre ventanas no prueba ganancia fuera de muestra.
3. **Separar ocurrencia y tamaño:** evaluar un modelo hurdle en dos etapas: probabilidad de venta por día/semana y unidades condicionadas a venta; pronóstico esperado = probabilidad × tamaño condicional, agregado al horizonte. Esta hipótesis ataca directamente 94,2% de ceros y los falsos positivos del producto 12; comparar contra Croston/TSB sin optimizar sobre holdout.
4. **Pooling entre productos:** probar regresión regularizada Poisson/Tweedie o equivalente gratuito con efectos de producto y categoría, más calendario e historial; alternativamente modelos globales sencillos. Con 100 productos y solo 401 días, redes profundas/transformers no están justificados.
5. **Agregación semanal:** evaluar demanda semanal para reducir ceros y ruido; H7 corresponde a una semana, H14 a dos, H30 a cuatro semanas más dos días. Si se desagrega a días, estimar perfiles solo con datos pasados y medir nuevamente el total del horizonte.
6. **No tratar inventario como demanda:** mantener los ceros solo en producto-días válidos. Si aparecen días censurados, excluirlos del objetivo o tratarlos explícitamente como censura; no aprender que un quiebre equivale a baja demanda.

La segmentación actual (frecuente/intermitente/bajo por umbrales de 56 días y unidades) debe mantenerse como benchmark, no como verdad del negocio. La dimensión “bajo volumen” no equivale a la dimensión “intermitencia”. En la siguiente fase conviene clasificar dinámicamente por ocurrencia/intervalo y variabilidad (ADI/CV² u otra regla predefinida en desarrollo) y mantener volumen/ABC como eje independiente. Productos nuevos deben tener estado “historial insuficiente” porque `creado_en` no permite identificarlos; usar priors de categoría con incertidumbre, no ceros forzados.

## 5. Plan experimental priorizado

### Prioridad 0 — Congelar definición y comparabilidad

- Mantener la regla confirmada de fecha comercial, ventas realizadas y exclusión del 7–8 de noviembre.
- Registrar para cada origen qué producto-días son observables, stock reconstruido, exclusiones y la edad efectiva del historial.
- Usar el mismo extracto para comparar con v3/v4/v5; archivar su hash y no alterar las salidas existentes.
- Mantener objetivo como unidades acumuladas del producto para los siguientes 7, 14 o 30 días, con ventana inclusiva/exclusiva especificada una sola vez.

### Prioridad 1 — Diagnóstico de evaluación y baselines (máximo impacto)

- Recalcular, sin entrenar, WAPE como `sum(abs(real-pronóstico)) / sum(real)` y mostrar numerador, denominador, sesgo firmado `sum(pronóstico-real)`, share de ceros y cobertura.
- Comparar por producto, categoría y segmento; destacar contribución absoluta al error, no ordenar solo por WAPE cuando real=0.
- Revisar los predictores cero de H7/H14 para segmento bajo y cuantificar la pérdida operativa de subestimar; no seleccionar por promedio de rangos de métricas sin una prioridad de negocio explícita.
- Añadir perfil semanal como baseline y comparar los mismos cinco orígenes holdout ya publicados, sin volver a usarlos para seleccionar parámetros.

### Prioridad 2 — Ventanas y decaimiento con cohortes correctas

- Evaluar 14, 28, 30, 45, 56, 60, 90, 120, 150, 180 y 210 días, solo donde sean aplicables; mantener los rangos específicos por horizonte como hipótesis de eficiencia, no restricciones.
- Comparar ventana móvil, historia completa ponderada (semividas explícitas) y una mezcla reciente/estable.
- Reportar siempre `días disponibles`, `días usados` y `semivida`. Para comparar ventanas X en igualdad, exigir al origen al menos X días y usar los mismos orígenes para todas las X; adicionalmente reportar una evaluación warm-start truncada separada.
- Ajustar ventanas/semividas solo en folds de desarrollo. Usar pocas configuraciones justificadas y selección anidada o por bloques temporales para limitar el sesgo de búsqueda.

### Prioridad 3 — Ocurrencia, pooling y variables

- Comparar Croston-SBA/TSB/ADIDA, hurdle y regresión global regularizada por producto/categoría; incluir baselines y no sumar complejidad sin mejora repetible.
- Hacer ablaciones de calendario semanal, categoría, marca/presentación y precio histórico. Compras/recepciones se reservan inicialmente para disponibilidad/reposición.
- Medir por horizonte, grupo y producto tanto error de unidades como sesgo y frecuencia de sobreestimación. Conservar modelos especializados solo cuando sus beneficios persistan en varios bloques y no empeoren sustancialmente otros segmentos.

### Prioridad 4 — Validación temporal independiente

- Mantener v3/v4/v5 como comparación retrospectiva común. En desarrollo usar rolling-origin semanal, separando las etiquetas objetivo de cada origen y asegurando que todo entrenamiento termina antes del origen pronosticado.
- Los horizontes 14/30 tienen targets solapados; informar métricas por origen y una comprobación con orígenes no solapados (cada 14/30 días), además de intervalos de incertidumbre agrupados por origen/producto.
- Reservar un holdout final que no intervenga en la selección. Los cinco orígenes actuales sirven para continuidad comparativa, pero son insuficientes para una afirmación fuerte de estabilidad. Ampliar cuando existan más fechas comerciales verificadas o, mientras tanto, usar múltiples bloques temporales de desarrollo y describir el holdout como exploratorio.
- Reportar MAE, RMSE, WAPE, sesgo neto, unidades reales/predichas, número de etiquetas y proporción de productos cubiertos para 7/14/30 días.

## 6. Objetivos y criterios de aceptación

Como objetivo de investigación, no como promesa, plantearía buscar **5–10% de reducción relativa de WAPE frente al mejor benchmark emparejado** en varios bloques temporales, sin empeorar RMSE de forma material ni aumentar el sesgo de subestimación. El resultado solo se acepta si:

- se mantiene con cohortes/orígenes iguales y el holdout reservado confirma la dirección de la mejora;
- no depende de unos pocos productos, una única fecha o una categoría;
- se publican las métricas por producto/segmento, ceros, cobertura y sesgo;
- las ventanas ganadoras tienen efecto mayor que la variabilidad entre orígenes.

Un WAPE menor que 1 en todos los horizontes no se debe exigir como condición artificial. Con demanda intermitente y ventas positivas impredecibles, el pronóstico cero puede tener WAPE exactamente 1 y aun así menor MAE; la elección depende del costo comercial de faltantes frente a excedentes. La decisión final necesita una función de pérdida de negocio para quiebre, sobrante y capital inmovilizado, no solo una métrica estadística.

## Riesgos y decisiones pendientes

- La base tiene solo ~13 meses: no permite validar una temporada anual ni aprender con solvencia ciclos largos.
- Los 100 productos comparten una fecha de catálogo no fiable como lanzamiento; no se puede medir correctamente desempeño de productos nuevos.
- La reconstrucción de stock es de libro transaccional, no conteo físico. Un registro consistente puede seguir omitiendo ventas o quiebres no anotados.
- v5 tiene 12 producto-orígenes frecuentes por horizonte y cinco fechas holdout; esas celdas no sostienen conclusiones generales.
- La elección de métrica y costo de faltantes/exceso requiere aprobación del negocio. WAPE, MAE y RMSE ordenan de manera distinta (el caso bajo lo demuestra).
- Antes de una nueva fase conviene confirmar si el objetivo es minimizar error de unidades o optimizar reposición (costos asimétricos); son problemas relacionados, pero no idénticos.

## Artefactos revisados

- Auditoría MySQL actual: [`auditar_minimarket.js`](../auditar_minimarket.js); reporte previo de calidad: [`AUDITORIA_MINIMARKET_20261108.md`](../AUDITORIA_MINIMARKET_20261108.md).
- Panel y evaluación base: [`experimento_minimarket.py`](../experimento_minimarket.py).
- Ventanas y features v4: [`experimento_fase2.py`](../experimento_fase2.py).
- Segmentación y análisis v5: [`experimento_fase3.py`](../experimento_fase3.py).
- Resultados utilizados (fuera del repositorio, preservados): `%LOCALAPPDATA%\\Tesis\\experimentos_demanda\\resultados\\20261109T042923Z-b7dc785e-v3`, `20261110-phase2-v4` y `20261110-phase3-v5-final`.
- Extracto utilizado por v3-v5: `%LOCALAPPDATA%\\Tesis\\experimentos_demanda\\minimarket_experimentos\\20261109T042923Z-b7dc785e`.

**Estado:** diagnóstico y plan completos. No se inicia otra implementación, entrenamiento ni backtesting hasta aprobación.
