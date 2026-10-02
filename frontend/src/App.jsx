import { Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Productos from "./pages/Productos";
import Categorias from "./pages/Categorias";
import Inventario from "./pages/Inventario";
import Movimientos from "./pages/Movimientos";
import Ventas from "./pages/Ventas";
import Compras from "./pages/Compras";
import Proveedores from "./pages/Proveedores";
import Usuarios from "./pages/Usuarios";
import Roles from "./pages/Roles";
import Reportes from "./pages/Reportes";
import Predicciones from "./pages/Predicciones";

import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" />} />

      <Route path="/login" element={<Login />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />

        <Route path="/productos" element={<Productos />} />
        <Route path="/categorias" element={<Categorias />} />
        <Route path="/inventario" element={<Inventario />} />
        <Route path="/movimientos" element={<Movimientos />} />

        <Route path="/ventas" element={<Ventas />} />
        <Route path="/compras" element={<Compras />} />
        <Route path="/proveedores" element={<Proveedores />} />

        <Route path="/usuarios" element={<Usuarios />} />
        <Route path="/roles" element={<Roles />} />

        <Route path="/reportes" element={<Reportes />} />
        <Route path="/predicciones" element={<Predicciones />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  );
}

export default App;