import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import apiClient from "../api/client";

function ProtectedRoute({ children }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let active = true;
    const validateSession = async () => {
      if (!localStorage.getItem("alanis_token")) {
        if (active) setIsLoading(false);
        return;
      }
      try {
        const profile = await apiClient.get("/auth/me");
        if (active) {
          localStorage.setItem("alanis_user", JSON.stringify(profile));
          setIsAuthenticated(true);
        }
      } catch {
        localStorage.removeItem("alanis_token");
        localStorage.removeItem("alanis_user");
      } finally {
        if (active) setIsLoading(false);
      }
    };
    validateSession();
    return () => { active = false; };
  }, []);

  if (isLoading) return <div className="page-content">Cargando sesión...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

export default ProtectedRoute;
