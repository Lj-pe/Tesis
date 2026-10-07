import { Navigate, useLocation } from "react-router-dom";
import apiClient from "../api/client";
import { useEffect, useState } from "react";

const modulosPorRuta = {
  "/dashboard": "Dashboard",
  "/productos": "Productos",
  "/categorias": "Categorías",
  "/inventario": "Inventario",
  "/movimientos": "Movimientos",
  "/ventas": "Ventas",
  "/compras": "Compras",
  "/proveedores": "Proveedores",
  "/usuarios": "Usuarios",
  "/roles": "Roles",
  "/reportes": "Reportes",
  "/predicciones": "Predicción",
};

function ProtectedRoute({ children }) {
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [permisos, setPermisos] = useState([]);

  useEffect(() => {
    let isMounted = true;

    const validarSesion = async () => {
      const token = localStorage.getItem("alanis_token");
      const user = localStorage.getItem("alanis_user");

      if (!token || !user) {
        if (isMounted) setIsLoading(false);
        return;
      }

      try {
        const perfil = await apiClient.get("/auth/me");
        if (isMounted) {
          setPermisos(Array.isArray(perfil.permisos) ? perfil.permisos : []);
          setIsAuthenticated(true);
        }
      } catch {
        localStorage.removeItem("alanis_token");
        localStorage.removeItem("alanis_user");
        if (isMounted) setIsAuthenticated(false);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    Promise.resolve().then(validarSesion);
    return () => {
      isMounted = false;
    };
  }, []);

  if (isLoading) {
    return <div className="page-content">Cargando sesión...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const moduloSolicitado = Object.entries(modulosPorRuta).find(([ruta]) => (
    location.pathname === ruta || location.pathname.startsWith(`${ruta}/`)
  ))?.[1];
  const tienePermiso = permisos.some((permiso) => (
    permiso.modulo === moduloSolicitado && permiso.acceso === true
  ));

  if (!moduloSolicitado || !tienePermiso) {
    return <Navigate to={moduloSolicitado === "Dashboard" ? "/login" : "/dashboard"} replace />;
  }

  return children;
}

export default ProtectedRoute;