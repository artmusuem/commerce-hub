import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { AdminLayout } from './components/layout/AdminLayout'
import { Login } from './pages/auth/Login'
import { Register } from './pages/auth/Register'
import { Dashboard } from './pages/dashboard/Dashboard'
import { ProductsIndex } from './pages/products/ProductsIndex'
import { ProductNew } from './pages/products/ProductNew'
import { ProductEdit } from './pages/products/ProductEdit'
import { StoresIndex } from './pages/stores/StoresIndex'
import { EtsyCallback } from './pages/stores/EtsyCallback'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/stores/etsy/callback" element={<ProtectedRoute><EtsyCallback /></ProtectedRoute>} />
          <Route path="/" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="products" element={<ProductsIndex />} />
            <Route path="products/new" element={<ProductNew />} />
            <Route path="products/:id" element={<ProductEdit />} />
            <Route path="stores" element={<StoresIndex />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
