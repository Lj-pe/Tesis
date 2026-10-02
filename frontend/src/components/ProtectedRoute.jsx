import { Navigate } from "react-router-dom";
import apiClient from "../api/client";
import { useEffect, useState } from "react";

function ProtectedRoute({ children }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("alanis_token");
    const user = localStorage.getItem("alanis_user");

    if (!token || !user) {
      setIsAuthenticated(false);
      setIsLoading(false);
      return;
    }

    apiClient
      .get("/auth/me")
      .then(() => {
        setIsAuthenticated(true);
      })
      .catch(() => {
        localStorage.removeItem("alanis_token");
        localStorage.removeItem("alanis_user");
        setIsAuthenticated(false);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  if (isLoading) {
    return <div className="page-content">Cargando sesión...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default ProtectedRoute;