# Informe metodológico de evaluación experimental de demanda

## 1. Objetivo, alcance y estado experimental

Este informe consolida la metodología y los resultados exploratorios de la evaluación semanal de demanda por producto realizada con datos históricos de ventas pagadas. Comprende un experimento inicial con referencias y Ridge, una evaluación posterior de la política Croston-SBA con fallback a promedio móvil de cuatro semanas, y un análisis descriptivo de robustez.

La fuente oficial es MySQL; los CSV son extractos reproducibles de lectura y no reemplazan la base de datos. El alcance de este informe termina en la evaluación experimental: no documenta una integración de pronósticos en el frontend ni una evaluación de impacto operativo.

La política operativa se definió después de observar los resultados del primer experimento. Por ello, tanto su evaluación como el análisis de robustez son exploratorios y no constituyen confirmación independiente.

## 2. Fuente de datos y trazabilidad

La extracción identificada como `20261009T143333Z-ed74e6bb` se realizó el **2026-10-09T14:33:33.195Z**, según sus metadatos. El código (`extraer.js`) consulta una instantánea transaccional MySQL en modo `REPEATABLE READ`, `WITH CONSISTENT SNAPSHOT, READ ONLY`, filtra ventas pagadas y sus detalles vinculados, y extrae el catálogo completo. La transacción se cierra con rollback. Los extractos no incluyen credenciales ni datos personales.

Los metadatos registran 70 ventas pagadas, 384 detalles, 55 productos y 1.389 unidades en el extracto completo. Las fechas pagadas extremas registradas son 2026-04-04 y 2026-09-26. Estos son conteos del extracto, no una afirmación de completitud diaria.

La versión de consulta declarada es `paid-sales-catalog-v1`. `metadata.json` conserva el SQL y el SHA-256 de cada consulta y CSV. La validación revisa hashes, esquema CSV, claves, referencias, estados, fechas y cantidades; compara los conteos de auditoría como referencias y advierte sobre posibles cambios de la fuente.

## 3. Definición de la demanda observada y preparación de los datos

La variable objetivo es la suma de `detalle_ventas.cantidad` por `producto_id` y semana ISO, exclusivamente para ventas con estado `pagada`, usando `ventas.fecha_venta`. No se modelan las ventas no pagadas ni la demanda latente o censurada.

La serie preparada cubre 24 semanas ISO completas, de **2026-W15 a 2026-W38**, lunes 2026-04-06 a domingo 2026-09-20. Contiene una fila para cada una de las 55 × 24 combinaciones producto-semana: 1.320 filas. Las semanas sin detalles pagados se representan con cero. Ese cero significa ausencia de ventas registradas en los extractos; por sí solo no prueba que la captura de ventas de todos los días esté completa.

La validación registrada en `validacion_series_semanales.json` declara pasados los controles de cantidad de productos y filas, unicidad y completitud de pares, intervalo ISO, cantidades no negativas y coincidencia de totales semanales con las fuentes. `validacion_python.json` conserva una segunda validación de la serie y sus fuentes. El validador de extracción registra ventas en las 24 semanas; tampoco esto demuestra cobertura diaria completa.

## 4. Protocolo de evaluación temporal

- **Granularidad:** semanal.
- **Entrenamiento inicial:** las 12 semanas completas W15-W26, del 2026-04-06 al 2026-06-28.
- **Expansión temporal:** en cada origen se usan únicamente semanas completas disponibles hasta el cierre del domingo; el objetivo comienza el lunes siguiente.
- **Horizontes:** 7, 14 y 30 días calendario.
- **Orígenes que caben enteros en el intervalo observado:** 12 para 7 días, 11 para 14 días y 8 para 30 días. El calendario registrado conserva las fechas y límites semiabiertos de cada ventana.
- **Cobertura observada:** termina el 2026-09-20 inclusive. No se añaden semanas ni días futuros con demanda cero para aumentar los orígenes.

Los objetivos de 7 y 14 días corresponden a una y dos semanas completas. Un objetivo de 30 días abarca cuatro semanas y dos días. El valor real de 30 días se suma desde los CSV transaccionales por fecha; la predicción semanal se aproxima sumando cuatro semanas y 2/7 de la quinta, lo que supone demanda uniforme dentro de esa quinta semana. No es un pronóstico diario.

Los orígenes avanzan semanalmente. Por tanto, las ventanas de 14 y 30 días se solapan y sus errores no son observaciones independientes.

## 5. Métodos evaluados y parámetros documentados

El primer experimento incluyó las referencias **cero**, **última semana**, **promedio móvil de cuatro semanas** y **Croston-SBA**, además de **Ridge**.

La implementación de Ridge utiliza las variables `lag_1`, `lag_2`, `lag_4`, media de las cuatro semanas previas e índice semanal; ajusta `StandardScaler` y Ridge con `alpha=1.0` dentro de cada origen. El pronóstico recursivo alimenta sus siguientes pasos con sus propias predicciones y recorta valores negativos a cero.

Croston-SBA está configurado con `alpha=0.1` y requiere ocho o más semanas de entrenamiento con demanda positiva para producir un pronóstico. Las semanas cero entre eventos se conservan al calcular los intervalos. La media móvil usa hasta las últimas cuatro semanas disponibles en el historial; si no hay historia, su pronóstico es cero.

El archivo `requirements.txt` declara `numpy==2.3.3`, `scipy==1.16.2`, `scikit-learn==1.7.2`, `joblib==1.5.2` y `threadpoolctl==3.6.0`. Estos son los pines de dependencias inspeccionados. Los resúmenes de ejecución no registran las versiones instaladas del intérprete o de los paquetes, por lo que este informe no las atribuye como versiones efectivamente ejecutadas.

## 6. Política SBA + fallback móvil-4 y reglas de elegibilidad

La política selecciona, para cada producto y origen, usando solo su historial de entrenamiento:

1. Croston-SBA con `alpha=0.1` si hay al menos ocho semanas positivas.
2. Promedio móvil de las últimas cuatro semanas disponibles en caso contrario.

Se incluyen todos los productos y pares producto-origen previstos, incluso productos cuyo historial completo sea cero. La elección se hace antes de consultar el valor real del período objetivo. La política se evalúa por separado y no usa el indicador de comparabilidad de la cohorte común inicial para excluir pares.

La regla se propuso después de inspeccionar el experimento inicial. Por tanto, los resultados de la política sobre los mismos datos describen su comportamiento retrospectivo, pero no sirven como evaluación confirmatoria independiente.

## 7. Métricas, cohortes, cobertura y denominadores

El error absoluto de cada observación es `|unidades_reales − unidades_pronosticadas|`.

- **MAE por par producto-origen:** promedio del error absoluto sobre todos los pares incluidos; cada par pesa igual.
- **MAE macro por producto:** primero se promedia el error de cada producto sobre sus orígenes y después se promedian los productos con igual peso.

En la cohorte común inicial el número de pares elegibles puede variar por producto; por eso el MAE macro no tiene por qué coincidir con el MAE por par. En la comparación operativa cada producto tiene el mismo número de orígenes por horizonte, y allí ambos promedios coinciden numéricamente.

La **cohorte común inicial** exige disponibilidad de los cinco métodos en el mismo par producto-origen. SBA no está disponible cuando el historial del producto en ese origen no alcanza ocho semanas positivas. Por eso esa cohorte no representa a todo el catálogo. En cambio, la **comparación operativa** contrasta política y móvil-4 sobre los 55 productos y todos los orígenes planeados; los pares sin SBA se cubren con el fallback y no se excluyen.

| Horizonte | Pares posibles, 55 productos | Orígenes | Cohorte común inicial: pares / productos | SBA insuficiente en pares / productos afectados | Comparación de política: pares / productos |
|---|---:|---:|---:|---:|---:|
| 7 días | 660 | 12 | 116 / 14 | 544 / 49 | 660 / 55 |
| 14 días | 605 | 11 | 102 / 13 | 503 / 49 | 605 / 55 |
| 30 días | 440 | 8 | 67 / 10 | 373 / 49 | 440 / 55 |

Los productos excluidos totalmente de la cohorte común son respectivamente 41, 42 y 45. “Productos afectados por SBA insuficiente” cuenta los que no son elegibles en al menos un origen; no significa que todos esos productos estén excluidos completamente.

## 8. Resultados del experimento inicial

Los MAE siguientes proceden del `resumen_evaluacion.json` del experimento inicial. Cada celda muestra **MAE por par / MAE macro por producto**. Todos los métodos de cada fila de horizonte se comparan con los mismos pares de la cohorte común indicada arriba, no con los 55 productos completos.

| Horizonte | Cohorte: pares / productos | Cero | Última semana | Promedio móvil-4 | Croston-SBA | Ridge |
|---|---:|---:|---:|---:|---:|---:|
| 7 días | 116 / 14 | 3.965517 / 3.548882 | 3.560345 / 3.512193 | 2.788793 / 2.628265 | 2.886989 / 2.760904 | 2.914665 / 2.691491 |
| 14 días | 102 / 13 | 7.862745 / 7.397708 | 5.882353 / 5.359868 | 3.725490 / 3.594066 | 3.989286 / 3.986818 | 4.155391 / 3.933766 |
| 30 días | 67 / 10 | 16.208955 / 15.125000 | 11.756930 / 12.423673 | 6.279318 / 5.590731 | 5.758422 / 5.372151 | 8.172808 / 7.360020 |

Los valores son errores en unidades de demanda agregada al horizonte. Esta tabla es la cohorte condicionada a disponibilidad de SBA y no debe mezclarse con la comparación operativa de cobertura completa.

## 9. Resultados de la política operativa sobre los 55 productos

El resumen de la ejecución de política registra cobertura de todos los pares previstos. La columna “SBA / fallback” indica cuántos pares usaron cada componente; las filas de fallback usan móvil-4. Cada celda de MAE muestra **por par / macro por producto**.

| Horizonte | Productos / pares | SBA / fallback móvil-4 | MAE móvil-4 | MAE política SBA + fallback |
|---|---:|---:|---:|---:|
| 7 días | 55 / 660 | 116 / 544 | 0.993182 / 0.993182 | 1.010441 / 1.010441 |
| 14 días | 55 / 605 | 102 / 503 | 1.470248 / 1.470248 | 1.514723 / 1.514723 |
| 30 días | 55 / 440 | 67 / 373 | 2.631006 / 2.631006 | 2.551688 / 2.551688 |

Estos resultados comparan dos reglas sobre exactamente los mismos pares y valores reales. Son exploratorios y no establecen superioridad general, utilidad operativa ni confirmación independiente.

## 10. Análisis de robustez descriptivo

El informe de robustez se calculó desde las predicciones guardadas, sin volver a ejecutar el motor. La diferencia se define como **MAE(policy) − MAE(móvil-4)**: negativa indica menor MAE observado de la política y positiva, menor MAE de móvil-4.

### Diferencias por producto

| Horizonte | Productos con menor MAE: política / móvil-4 / empate | Delta por producto: mínimo / Q1 / mediana / Q3 / máximo |
|---|---:|---:|
| 7 días | 9 / 5 / 41 | −0.221083 / 0 / 0 / 0 / 0.721063 |
| 14 días | 7 / 6 / 42 | −0.595269 / 0 / 0 / 0 / 1.936351 |
| 30 días | 7 / 3 / 45 | −3.501139 / 0 / 0 / 0 / 3.162984 |

Muchos empates por producto son compatibles con que el fallback de política produzca exactamente las mismas predicciones que móvil-4 en todos los orígenes de ese producto.

### Leave-one-origin-out

Se excluyeron todos los productos de un origen cada vez y se recalculó el delta del MAE por pares sobre los pares restantes.

| Horizonte | Rango del delta al excluir un origen | Exclusiones con delta negativo / positivo / empate |
|---|---:|---:|
| 7 días | −0.006564 a 0.024244 | 1 / 11 / 0 |
| 14 días | 0.023139 a 0.055254 | 0 / 11 / 0 |
| 30 días | −0.102016 a −0.064681 | 8 / 0 / 0 |

Los signos describen únicamente el sentido de la diferencia al retirar un origen. Dado el número reducido y el solapamiento de orígenes, esto no es una prueba estadística confirmatoria.

### Alto volumen y leave-one-product-out

El “volumen observado” de abajo suma unidades reales de los objetivos evaluados para el producto. En horizontes con ventanas solapadas, una misma venta puede aparecer en varios objetivos; estos totales no son ventas únicas.

| Horizonte | Producto | Unidades sumadas en ventanas | Participación del error absoluto: política / móvil-4 |
|---|---:|---:|---:|
| 7 días | 42 | 115 | 9.2% / 8.1% |
| 7 días | 44 | 76 | 7.4% / 7.6% |
| 7 días | 50 | 62 | 5.5% / 5.8% |
| 7 días | 51 | 45 | 4.6% / 4.0% |
| 7 días | 48 | 34 | 5.3% / 4.8% |
| 14 días | 42 | 206 | 10.8% / 8.7% |
| 14 días | 44 | 137 | 7.9% / 7.4% |
| 14 días | 50 | 110 | 4.3% / 4.8% |
| 14 días | 51 | 81 | 3.4% / 2.1% |
| 14 días | 1 | 58 | 3.0% / 3.3% |
| 30 días | 42 | 293 | 10.5% / 8.0% |
| 30 días | 44 | 185 | 5.9% / 7.1% |
| 30 días | 50 | 163 | 2.9% / 2.9% |
| 30 días | 51 | 122 | 4.3% / 3.3% |
| 30 días | 1 | 95 | 1.7% / 2.5% |

Al excluir cada producto por turno, el delta del MAE por pares quedó entre **0.004225 y 0.021672** para 7 días, **0.009440 y 0.056322** para 14 días, y **−0.139361 y −0.015951** para 30 días. En este análisis descriptivo, retirar un solo producto no cambió el signo agregado observado por horizonte. No constituye evidencia de estabilidad fuera de los productos y períodos evaluados.

## 11. Limitaciones e interpretación

- El historial modelado comprende seis meses semanales y 55 productos; la elegibilidad SBA se alcanza solo en una fracción de pares producto-origen.
- Los ceros indican ausencia de ventas registradas. No se ha demostrado que la captura diaria esté completa ni que las ventas registradas equivalgan a demanda no censurada.
- Hay solo 12, 11 y 8 orígenes por horizonte. Las ventanas de 14 y 30 días se solapan; sus errores no son independientes.
- La predicción a 30 días supone distribución uniforme para convertir los dos días parciales de la quinta semana; los valores reales, en cambio, se agregan de las fechas transaccionales.
- Las sumas de unidades por ventanas/orígenes solapados repiten ventas y no deben presentarse como volumen único.
- La política se formuló post hoc tras observar el experimento inicial. Su evaluación en los mismos datos y una reejecución idéntica no eliminan esa selección retrospectiva.
- Los artefactos no documentan una evaluación sobre un período futuro independiente, intervalos de incertidumbre, significancia estadística ni beneficio operativo.

## 12. Reproducibilidad, rutas de artefactos y hashes disponibles

### Rutas de las fuentes y resultados

Las siguientes rutas corresponden a la ejecución indicada y se encuentran fuera del repositorio:

- Extracto y metadatos: `%LOCALAPPDATA%\Tesis\experimentos_demanda\extractos\20261009T143333Z-ed74e6bb\`
- Serie y validación semanal: misma carpeta, `series_semanales.csv` y `validacion_series_semanales.json`
- Validación Python y calendario: `%LOCALAPPDATA%\Tesis\experimentos_demanda\etapa3_python\20261009T143333Z-ed74e6bb\`
- Resultados del experimento inicial: `%LOCALAPPDATA%\Tesis\experimentos_demanda\resultados\20261009T143333Z-ed74e6bb\`
- Resultados de política: `%LOCALAPPDATA%\Tesis\experimentos_demanda\resultados_politica_20261009T104017689\20261009T143333Z-ed74e6bb\`
- Análisis de robustez: `%LOCALAPPDATA%\Tesis\experimentos_demanda\analisis_robustez\20261009T154535661243Z-20261009T143333Z-ed74e6bb\`

El informe de robustez registra 1.705 filas de política, 1.705 filas móvil-4, cero claves duplicadas/faltantes/adicionales y cero diferencias de valores reales. También registra que los errores absolutos se contrastaron con `|real − pronóstico|`.

### SHA-256 registrados

| Artefacto | SHA-256 |
|---|---|
| `ventas.csv` | `6b7f1772d18fe661543617c1dd35a204e96d5e9c94e5c49e16cbaa9213c0ea9d` |
| `detalles.csv` | `b3c2c71d063af1c8d660af0e882a2313cb02277c3e618b8eb92072fd64811c6d` |
| `productos.csv` | `978a97145f9445c9575c80a3937b1a5666bf6a7aeef428b749751c50269ff99a` |
| `series_semanales.csv` | `614c2906be8c953871204a9565a4ee9b9aaeb44a7a9d9c3abed020226541edf7` |
| `plan_evaluacion_temporal.json` | `f48b1835158603366a30610648527b5d630e2131bf2f3848b972edaf44b3c4ab` |
| Política: `politica_operativa.csv` | `213415c28f0b095ca3649dac4129374e0320721af8f913a0c96213dd062d2dc2` |
| Predicciones de política: `predicciones_individuales.csv` | `4cc8b3a61e5cee04948a06e6e78ce19f0baf78a5a0caae6cdea5da13035a65f0` |
| Resumen de política: `resumen_evaluacion.json` | `441469c29ba08eecb9985b125de5d128036e3404e20e53c94bc802c241e95b90` |

El resumen inicial registra también 8.525 filas y el mismo hash de `predicciones_individuales.csv`; el resumen de política conserva sus propios hashes de entrada. Los hashes de los informes de robustez no se consignan aquí porque no forman parte del resumen de la ejecución ni son necesarios para identificar los datos fuente.

Los metadatos del experimento inicial indican `created_at_utc=2026-10-09T15:11:32.349569+00:00`; el calendario disponible indica `created_at_utc=2026-10-09T15:40:30.656118+00:00`, aunque el resumen inicial registra el hash del calendario disponible. Esa secuencia es cronológicamente inconsistente. Los artefactos permiten verificar que el hash coincide, pero no establecer con certeza esas marcas como una secuencia de creación fiable.

`requirements.txt` permite identificar los pines declarados, pero los resúmenes no guardan una captura de `python --version`, versiones instaladas, sistema operativo ni un manifiesto de entorno de la ejecución. Tampoco se verificó un commit que contenga el código experimental: la carpeta aparece como no rastreada en el estado de Git consultado. No se atribuye, por tanto, un hash de commit al motor evaluado.

## 13. Conclusiones metodológicas y trabajo pendiente

Los artefactos disponibles permiten describir y reproducir el procesamiento y los cálculos de esta ejecución concreta, siempre que se mantengan separadas la cohorte común inicial y la política sobre los 55 productos. La cobertura temporal, el uso de datos pagados, la elegibilidad por origen, los parámetros y los resúmenes están documentados en el código y en los manifiestos de salida.

Los resultados no respaldan una conclusión confirmatoria o generalizable: la política fue definida post hoc, la historia es limitada, hay pocos orígenes solapados, la captura diaria no está demostrada y la conversión a 30 días es aproximada. Una confirmación requeriría observaciones futuras no usadas en este análisis, conservando las reglas fijadas y documentando el entorno y el versionado del código. No se ha medido el efecto de integrar estos métodos en la operación ni en el frontend.

Para reproducir localmente, seguir los comandos de extracción, validación, preparación, calendario y ejecución del [README.md](./README.md). El README conserva instrucciones operativas; este documento consolida el protocolo, resultados y limitaciones para evitar duplicar allí el informe completo.
