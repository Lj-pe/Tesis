# Frontend — Minimarket

Aplicación web React para el sistema de gestión del minimarket.

## Tecnologías

- React y React DOM
- React Router para navegación
- Vite para desarrollo y compilación
- JavaScript, JSX y CSS

## Requisitos

- Node.js y npm
- El backend del proyecto disponible para usar las funciones que requieren la API

## Instalación y comandos

Ejecuta los comandos desde la carpeta `frontend/`:

```bash
npm install
npm run dev
npm run lint
npm run build
```

- `npm run dev`: inicia el servidor de desarrollo de Vite.
- `npm run lint`: ejecuta ESLint.
- `npm run build`: genera la compilación de producción.

## Inicio de sesión

El formulario permite ingresar con el nombre de usuario o el correo electrónico
registrado, junto con la contraseña.

## Módulos

- Dashboard
- Productos y Categorías
- Inventario y Movimientos
- Ventas y Compras
- Proveedores
- Reportes
- Predicciones

La predicción consume la API autenticada del backend y permanece en modo sombra.
