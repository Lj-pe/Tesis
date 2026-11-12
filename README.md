# Sistema de gestión del minimarket

Aplicación web para operaciones de inventario y ventas, con una integración
experimental de predicción de demanda en modo sombra.

## Componentes

- `backend/`: API Express, autenticación JWT y acceso a MySQL.
- `frontend/`: interfaz React/Vite.
- `experimentos_demanda/`: extracción de solo lectura, experimentos versionados
  y validaciones reproducibles.
- `base_de_datos/`: esquema SQL histórico de Boutique; no es un dump ni una
  migración para la base activa `minimarket_tesis`.

La primera integración de predicción no escribe resultados ni requiere cambios
de esquema. No habilita decisiones de reposición ni compras automáticas. Los
experimentos y resultados históricos se conservan; los resultados locales se
guardan fuera del repositorio bajo `%LOCALAPPDATA%\Tesis\experimentos_demanda`.

## Requisitos

- Node.js y npm (Node 24 recomendado).
- MySQL accesible con una base `minimarket_tesis`.
- Python 3.13 solo para reproducir los experimentos Python.

## Configuración e inicio

En PowerShell, configura primero las variables locales del backend:

```powershell
Copy-Item backend\.env.example backend\.env
# Completa DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME y JWT_SECRET.
```

Instala las dependencias desde cada aplicación y ejecuta los servidores en
terminales separadas:

```powershell
Set-Location backend
npm ci
npm run dev
```

```powershell
Set-Location frontend
npm ci
npm run dev
```

El frontend usa `http://localhost:3000/api` de forma predeterminada. Se puede
definir `VITE_API_URL` en `frontend/.env` para otro origen. Inicia sesión con
una cuenta existente; las rutas de negocio, incluido el catálogo y pronóstico,
requieren token.

## Validación

```powershell
npm --prefix backend test
npm --prefix frontend run lint
npm --prefix frontend run build
node --test frontend/src/utils/forecastChart.test.js frontend/src/utils/forecastResponse.test.js
node --test experimentos_demanda/series.test.js
Push-Location experimentos_demanda
python -m unittest discover -v
Pop-Location
```

La suite `backend/tests/api.crud.test.js` realiza escrituras y limpieza en MySQL
y depende de un esquema heredado. No la ejecutes contra `minimarket_tesis`; su
validación requiere una base de pruebas aislada con el esquema correspondiente.

## Predicción de demanda

Las rutas activas son:

- `GET /api/predicciones/demanda/catalogo`
- `GET /api/predicciones/demanda/productos/:productId?horizonte_dias=7|14|30`

El modelo usa el corte validado del **6 de noviembre de 2026** y lo mantiene fijo
hasta una fase posterior. La respuesta identifica método, segmento,
observabilidad y rango objetivo. Riesgo de quiebre y reposición sugerida
permanecen no disponibles. No existe persistencia de predicciones en MySQL.

Consulta [backend/README.md](./backend/README.md) y
[experimentos_demanda/README.md](./experimentos_demanda/README.md) para los
detalles de configuración y reproducción.
