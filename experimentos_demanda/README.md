# Extracto reproducible para experimentos de demanda

La extracción y preparación exportan y validan datos sin modificar MySQL. El motor experimental y la política operativa ya están implementados y se ejecutaron sobre el extracto identificado en el informe metodológico; sus resultados y límites son exploratorios. El [informe metodológico consolidado](./INFORME_METODOLOGICO_DEMANDA.md) reúne protocolo, resultados y trazabilidad.

## Requisitos

- Node.js disponible en el proyecto.
- Dependencias ya instaladas en `backend/node_modules`: `mysql2` y `dotenv`.
- Configuración local existente en `backend/.env` (`DB_HOST`, `DB_PORT` opcional, `DB_USER`, `DB_PASSWORD`, `DB_NAME`).

No se muestran ni se copian variables de conexión a los extractos. La fuente oficial permanece en MySQL.

## Crear un extracto

Desde la raíz del repositorio:

```powershell
node experimentos_demanda/extraer.js
```

El script escribe una carpeta nueva bajo `%LOCALAPPDATA%\Tesis\experimentos_demanda\extractos` (o el directorio temporal del sistema si `LOCALAPPDATA` no está disponible). Puede indicarse una raíz de salida como primer argumento, siempre que esté fuera del repositorio Git.

La lectura usa una transacción `REPEATABLE READ` con `WITH CONSISTENT SNAPSHOT, READ ONLY`, y después hace rollback. Se exportan:

- `ventas.csv`: ID, fecha de venta y estado pagado.
- `detalles.csv`: ID de detalle, venta, producto y cantidad, limitado a ventas pagadas.
- `productos.csv`: catálogo completo con ID, categoría, SKU, nombre y estado.
- `metadata.json`: fecha UTC, identificador, versión y SQL de las consultas, hashes SHA-256 y cantidades por archivo. No contiene credenciales, usuarios ni información personal.

Cada ejecución usa una carpeta única, no sobrescribe extractos anteriores.

## Validar

Usar la ruta que informó el extractor:

```powershell
node experimentos_demanda/validar.js "C:\Users\<usuario>\AppData\Local\Tesis\experimentos_demanda\extractos\<run_id>"
```

El validador vuelve a calcular hashes, estructura y cantidades CSV; revisa claves únicas, referencias entre ventas/detalles/productos, cantidades positivas, estados, fechas y el intervalo ISO W15–W38. Contrasta los conteos con la auditoría previa; las diferencias de baseline son avisos porque la fuente puede haber cambiado. Los errores de integridad hacen que el proceso termine con código distinto de cero.

Que no aparezcan ventas en una fecha o semana no demuestra que la captura diaria esté completa; el reporte siempre lo advierte. Confirme la cobertura antes de usar ceros como demanda observada o de admitir ventanas de evaluación.

## Preparar series semanales

Después de validar el extracto, ejecutar desde la raíz indicando la misma carpeta de ejecución:

```powershell
node experimentos_demanda/preparar_series.js "C:\Users\<usuario>\AppData\Local\Tesis\experimentos_demanda\extractos\<run_id>"
```

El preparador verifica los hashes de `ventas.csv`, `detalles.csv` y `productos.csv` contra `metadata.json`, y guarda en esa carpeta:

- `series_semanales.csv`: una fila por producto (`producto_id`) y semana ISO completa, W15–W38 de 2026; semanas sin ventas se conservan con cero.
- `validacion_series_semanales.json`: metodología, hashes de los tres archivos fuente, hash y conteo del CSV generado, y resultados de las validaciones.

La cantidad semanal suma unidades de detalles asociados a ventas pagadas, usando `ventas.fecha_venta`. El intervalo es del lunes 2026-04-06 al domingo 2026-09-20. Los archivos de salida no sobrescriben otros resultados: use una ejecución nueva si ya existen. Las semanas con cero ventas no prueban que todos los días hayan sido capturados.

## Pruebas automatizadas

Desde la raíz del repositorio:

```powershell
node --test experimentos_demanda/series.test.js
```

## Etapa 3: validación Python y plan temporal

Python 3.13 o compatible, sin dependencias de terceros para validar los datos y planificar ventanas:

```powershell
python experimentos_demanda/validar_series_python.py "C:\Users\<usuario>\AppData\Local\Tesis\experimentos_demanda\extractos\<run_id>"
python experimentos_demanda/planificar_evaluacion.py "C:\Users\<usuario>\AppData\Local\Tesis\experimentos_demanda\extractos\<run_id>"
python -m unittest discover -s experimentos_demanda -p test_etapa3.py
```

La validación Python comprueba hashes de la serie y los CSV fuente, columnas/tipos, las 1.320 parejas de 55 productos por W15–W38, cantidades y totales semanales tanto contra los CSV fuente como contra el informe de preparación JS. Los informes `validacion_python.json` y `plan_evaluacion_temporal.json` se guardan en `%LOCALAPPDATA%\Tesis\experimentos_demanda\etapa3_python\<run_id>`; no se sobrescriben.

El plan temporal usa las 12 semanas completas W15–W26 como entrenamiento inicial (2026-04-06 a 2026-06-28). Cada origen queda al cierre de un domingo y su objetivo empieza el lunes siguiente; las ventanas semiabiertas `[inicio, fin)` deben quedar dentro de la cobertura disponible W15–W38 (hasta 2026-09-20 inclusive). El calendario verificado contiene 12 orígenes de 7 días (2026-06-28 a 2026-09-13), 11 de 14 días (2026-06-28 a 2026-09-06), y 8 de 30 días (2026-06-28 a 2026-08-16). Para cada origen se usa solo el historial completo anterior a ese cierre. Las cantidades son conteos de calendario planificados, no observaciones independientes ni resultados predictivos. La regla fija de 12 semanas no sustituye el criterio por producto de Croston-SBA: su elegibilidad requiere ocho semanas con demanda positiva únicamente en el entrenamiento de cada origen.

Las ventanas de 7 y 14 días coinciden con semanas completas. Una ventana de 30 días comprende cuatro semanas y dos días: su demanda observada exacta requiere agregar las ventas transaccionales por fecha, no se obtiene de la serie semanal sola. Convertir el pronóstico semanal a 30 días mediante cuatro semanas más `2/7` de la quinta supone demanda uniforme en esa semana y debe declararse como aproximación. No se agregan ceros después de W38: las ventanas que no caben enteras dentro de la cobertura observada se excluyen. Los días/semanas sin ventas registradas no prueban que la captura esté completa.

El motor implementado ajusta Ridge y calcula pronósticos por separado en cada origen, usando semanas anteriores al objetivo. La comparación inicial calcula MAE en pares producto-origen comunes; la evaluación de la política SBA + fallback móvil-4 se hace por separado sobre todos los productos y pares previstos. La elegibilidad SBA (ocho semanas positivas en entrenamiento) se determina por producto y origen. Los orígenes avanzan semanalmente, así que las ventanas de 14 y 30 días se solapan y sus errores no son observaciones independientes. Los detalles y resultados registrados se presentan en el informe metodológico.

## Etapa 4: entorno Python aislado

La configuración fija Python 3.13 compatible con ruedas de Windows AMD64:

- `numpy==2.3.3`
- `scipy==1.16.2`
- `scikit-learn==1.7.2`
- `joblib==1.5.2`
- `threadpoolctl==3.6.0`
- `matplotlib==3.10.7`

Ridge y MAE están disponibles en `scikit-learn`; `joblib` y `threadpoolctl` son dependencias de ejecución de scikit-learn. `matplotlib` se usa para los gráficos de los experimentos. La etapa no requiere pandas. El entorno virtual es local a esta carpeta y queda excluido por su `.gitignore`; no afecta paquetes globales ni dependencias de Node.js.

Desde la raíz del repositorio, en Windows PowerShell:

```powershell
py -3.13 -m venv .\experimentos_demanda\.venv
& .\experimentos_demanda\.venv\Scripts\Activate.ps1
python -m pip install -r .\experimentos_demanda\requirements.txt
python -c "import numpy, scipy, sklearn; from sklearn.linear_model import Ridge; from sklearn.metrics import mean_absolute_error; print('numpy', numpy.__version__, 'scipy', scipy.__version__, 'scikit-learn', sklearn.__version__)"
```

Para salir del entorno:

```powershell
deactivate
```

Si la política de PowerShell impide activar scripts, se puede invocar el Python aislado explícitamente:

```powershell
.\experimentos_demanda\.venv\Scripts\python.exe -m pip install -r .\experimentos_demanda\requirements.txt
.\experimentos_demanda\.venv\Scripts\python.exe -c "import numpy, scipy, sklearn; from sklearn.linear_model import Ridge; from sklearn.metrics import mean_absolute_error; print('numpy', numpy.__version__, 'scipy', scipy.__version__, 'scikit-learn', sklearn.__version__)"
```

Validación sin entrenamiento:

```powershell
python -m unittest discover -s experimentos_demanda -p test_etapa3.py
node --test experimentos_demanda/series.test.js
```

## Etapa 5: motor experimental (implementado y ejecutado)

El motor se separa en `modelos_referencia.py` (cero, última semana, media móvil de 4 semanas y Croston-SBA), `modelo_ridge.py` (Ridge agrupado con lags y predicción recursiva), `evaluacion_temporal.py` y el punto de entrada `ejecutar_experimento.py`. Antes de modelar, verifica hashes de la serie y CSV fuente, estructura, pares producto-semana y que el calendario JSON coincida con las ventanas aprobadas que recalcula `planificar_evaluacion.py`. Comprueba también que los totales de la serie por producto-semana coincidan con detalles pagados. El hash SHA-256 del calendario leído se registra junto con los demás hashes si se ejecuta la evaluación.

Para cada origen, los ejemplos de entrenamiento de Ridge terminan antes del objetivo. Las variables son lags 1/2/4, promedio de las cuatro observaciones anteriores e índice semanal; durante el horizonte, los lags se actualizan con predicciones propias, nunca con valores reales futuros. Las predicciones semanales negativas se recortan a cero. Croston-SBA usa alpha 0.1 y solo se considera disponible desde ocho semanas con demanda positiva en ese entrenamiento; los pares donde no esté disponible quedan marcados y se excluyen de la comparación común de todos los métodos.

### Política operativa Croston-SBA + fallback móvil-4

La política se evalúa por separado de la cohorte común de los cinco métodos y nunca usa `incluido_comparacion` para filtrar sus observaciones. En cada origen utiliza exclusivamente el historial truncado a las semanas de entrenamiento: si contiene al menos ocho semanas positivas, selecciona Croston-SBA con `alpha=0.1`; si no, selecciona el promedio móvil de las últimas cuatro semanas. Los productos sin ventas permanecen incluidos y reciben el fallback, que pronostica cero cuando el historial es cero. Umbral, hiperparámetro, ventana, horizontes y calendario se mantienen fijos.

Tras comparar la política y móvil-4 en el mismo backtest operativo de 2026-10-16, la regla candidata de producción usa móvil-4 para 7 y 14 días, y conserva Croston-SBA con fallback móvil-4 para 30 días. `evaluacion_produccion.py` mantiene separadas las predicciones de la política anterior, la referencia móvil-4 y la candidata por horizonte para que el cambio sea reproducible. La comparación es retrospectiva, con pocos orígenes solapados, y no constituye validación independiente.

En la ejecución de política existente, `politica_operativa.csv` registra producto, origen, horizonte, método seleccionado, semanas positivas de entrenamiento, unidades pronosticadas, unidades reales y error absoluto. `resumen_evaluacion.json` incluye la comparación de la política con móvil-4 sobre todos los pares producto-origen previstos; la escritura valida que ambos cubran las mismas claves y tengan idénticas unidades reales. Esta comparación no cambia las predicciones ni los MAE de los métodos preexistentes y no elimina pares cuando SBA no es elegible. Las rutas y los hashes de esa ejecución están en el informe metodológico.

La política SBA con fallback móvil-4 se definió post hoc y sus resultados son exploratorios. Repetir la evaluación con los mismos datos y orígenes no convierte esos resultados en confirmación independiente; para confirmar se requieren observaciones futuras no usadas en esta exploración, aplicando sin cambios las reglas congeladas.

Los horizontes 7 y 14 suman respectivamente 1 y 2 pronósticos semanales. El de 30 días suma cuatro semanas y `2/7` de la quinta (suposición de demanda uniforme intra-semana; no es un pronóstico diario). Para calcular unidades reales exactas de los 30 días, el evaluador suma por fecha los detalles de ventas pagadas en CSV. Las unidades reales de 7/14 proceden de la serie semanal validada. Todos los métodos se comparan sobre el mismo conjunto producto-origen por horizonte. El informe distingue MAE agrupado por pares producto-origen (cada par pondera igual) del MAE macro por producto (promedio de MAE por SKU, cada SKU pondera igual). Los registros individuales conservan método, horizonte, producto, origen, unidades reales/pronosticadas y error absoluto. Ceros son ventas registradas ausentes, no evidencia de cobertura diaria completa.

`test_motor_experimental.py` usa únicamente fixtures sintéticos. Ejecutarlo:

```powershell
.\experimentos_demanda\.venv\Scripts\python.exe -m unittest discover -s experimentos_demanda -p "test_*.py"
```

La validación de insumos puede ejecutarse sin entrenamiento ni métricas:

```powershell
.\experimentos_demanda\.venv\Scripts\python.exe .\experimentos_demanda\ejecutar_experimento.py "C:\Users\<usuario>\AppData\Local\Tesis\experimentos_demanda\extractos\<run_id>" "C:\Users\<usuario>\AppData\Local\Tesis\experimentos_demanda\etapa3_python\<run_id>\plan_evaluacion_temporal.json" --validate-only
```

Las evaluaciones iniciales y de política ya se ejecutaron; sus resultados se conservaron en carpetas distintas fuera del repositorio. Para una nueva ejecución autorizada, usar un `--output-root` nuevo y exclusivo, fuera del repositorio y distinto de cualquier carpeta histórica. El valor predeterminado apunta a `%LOCALAPPDATA%\Tesis\experimentos_demanda\resultados\<run_id>` y puede coincidir con la ejecución inicial; no se debe reutilizar ni sobrescribir esa carpeta. Ejemplo con una carpeta separada:

```powershell
.\experimentos_demanda\.venv\Scripts\python.exe .\experimentos_demanda\ejecutar_experimento.py "C:\Users\<usuario>\AppData\Local\Tesis\experimentos_demanda\extractos\<run_id>" "C:\Users\<usuario>\AppData\Local\Tesis\experimentos_demanda\etapa3_python\<run_id>\plan_evaluacion_temporal.json" --output-root "C:\Users\<usuario>\AppData\Local\Tesis\experimentos_demanda\resultados_nueva_ejecucion_<identificador_unico>"
```

La carpeta resultante será `<output-root>\<run_id>` y debe ser nueva, para que la protección contra sobrescritura no encuentre salidas anteriores. Los resultados se guardan fuera del repositorio y nunca sobre los CSV fuente.

## Evaluación retrospectiva con ventanas de producción

`evaluacion_produccion.py` reutiliza las validaciones del motor temporal y compara la
política Croston-SBA + fallback móvil-4 de producción con móvil-4 como referencia.
Para cada origen histórico aplica el lookback actual (2, 3 o 6 meses para 7, 14 o
30 días), usa solo semanas completas anteriores al objetivo y calcula las ventas
reales mediante la serie validada o los CSV transaccionales según el horizonte.
No consulta MySQL ni modifica resultados previos.

Requiere las dependencias de `requirements.txt`, incluida Matplotlib. Desde la raíz:

```powershell
.\experimentos_demanda\.venv\Scripts\python.exe .\experimentos_demanda\evaluacion_produccion.py "C:\Users\<usuario>\AppData\Local\Tesis\experimentos_demanda\extractos\<run_id>" "C:\Users\<usuario>\AppData\Local\Tesis\experimentos_demanda\etapa3_python\<run_id>\plan_evaluacion_temporal.json"
```

Cada ejecución crea un directorio único bajo
`%LOCALAPPDATA%\Tesis\experimentos_demanda\evaluacion_produccion_<UTC>_<run_id>`,
con configuración, hashes, predicciones por producto-origen, MAE/RMSE y gráficos.
La carpeta de salida existente no se reutiliza.

## Baseline de auditoría

Referencia comprobada al crear esta etapa: 70 ventas pagadas, 384 detalles, 55 productos, 1.389 unidades y fechas del 2026-04-04 al 2026-09-26. En W15–W38 (2026-04-06 a 2026-09-20) se habían observado 67 ventas y actividad en 24 de 24 semanas. Estos valores son referencias para detectar cambios, no valores fijados en la BD ni una garantía de que futuros extractos sean idénticos.
