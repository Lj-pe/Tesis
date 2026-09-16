import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from '../components/layout/AppShell'
import AdminRoute from '../components/routing/AdminRoute'
import ProtectedRoute from '../components/routing/ProtectedRoute'
import PagePlaceholder from '../components/common/PagePlaceholder'
import LoginPage from '../features/auth/LoginPage'
import DashboardPage from '../features/dashboard/DashboardPage'
import ProductsPage from '../features/products/ProductsPage'
import InventoryPage from '../features/inventory/InventoryPage'
import PurchasesPage from '../features/purchases/PurchasesPage'
import SalesPage from '../features/sales/SalesPage'
import SuppliersPage from '../features/suppliers/SuppliersPage'
import PredictionsPage from '../features/predictions/PredictionsPage'
import AdministrationPage from '../features/administration/AdministrationPage'

const pages = [
  ['dashboard', 'Dashboard', 'Resumen operativo de productos, inventario, compras, ventas y análisis.'],
  ['productos', 'Productos', 'Catálogo de productos y categorías.'],
  ['inventario', 'Inventario', 'Stock actual y movimientos de inventario.'],
  ['compras', 'Compras', 'Registro de compras y abastecimiento.'],
  ['ventas', 'Ventas', 'Registro de ventas y disponibilidad de stock.'],
  ['proveedores', 'Proveedores', 'Información de proveedores del negocio.'],
  ['predicciones', 'Predicciones / IA', 'Apoyo analítico para inventario y decisiones de abastecimiento.'],
]

function PlaceholderRoute({ title, description }) {
  return <PagePlaceholder title={title} description={description} />
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          {pages.map(([path, title, description]) => (
            <Route key={path} path={`/${path}`} element={path === 'dashboard' ? <DashboardPage /> : path === 'productos' ? <ProductsPage /> : path === 'inventario' ? <InventoryPage /> : path === 'compras' ? <PurchasesPage /> : path === 'ventas' ? <SalesPage /> : path === 'proveedores' ? <SuppliersPage /> : path === 'predicciones' ? <PredictionsPage /> : <PlaceholderRoute title={title} description={description} />} />
          ))}
          <Route element={<AdminRoute />}>
            <Route path="/administracion" element={<AdministrationPage />} />
            <Route path="/administracion/usuarios" element={<PagePlaceholder title="Usuarios" description="Gestión de usuarios del sistema." />} />
            <Route path="/administracion/roles" element={<PagePlaceholder title="Roles" description="Gestión de roles del sistema." />} />
          </Route>
        </Route>
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
