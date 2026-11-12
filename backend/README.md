# Backend

API Node.js/Express con MySQL (`mysql2/promise`) y autenticación JWT.

## Requisitos y configuración

Se recomienda Node.js 24 y npm. Copia el ejemplo y completa los valores locales:

```powershell
Copy-Item .env.example .env
```

Variables requeridas:

- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `DB_PORT` (opcional; predeterminado `3306`)
- `JWT_SECRET` (secreto aleatorio requerido)
- `JWT_EXPIRES_IN` (opcional; el valor predeterminado está definido por la app)

Para el entorno actual, `DB_NAME` debe ser `minimarket_tesis`. No publiques el
archivo `.env`.

## Ejecutar

Desde esta carpeta:

```powershell
npm ci
npm run dev
```

La API escucha en el puerto `3000` por defecto; `PORT` permite cambiarlo.
`GET /api/health` comprueba conectividad.

## Pruebas

```powershell
npm test
```

La suite `tests/api.crud.test.js` es una prueba de integración heredada que
inserta y elimina datos, y depende de tablas/columnas que no corresponden al
esquema minimarket activo. No la ejecutes contra una base real. Hace falta un
entorno de pruebas aislado para validar esas operaciones CRUD.

## Predicción

`src/routes/prediccion.routes.js` expone únicamente el catálogo y el pronóstico
de demanda. Las rutas están detrás del `authMiddleware` global de `src/app.js`.
La implementación está en modo sombra, consulta ventas y movimientos con
`SELECT` y no persiste resultados ni modifica el esquema. El corte permanece
fijo al 2026-11-06; los horizontes permitidos son 7, 14 y 30 días. No se
producen sugerencias de reposición ni compras automáticas.
