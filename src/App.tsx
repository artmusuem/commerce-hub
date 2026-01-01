import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { AdminLayout } from './components/layout/AdminLayout'
import { Login } from './pages/auth/Login'
import { Register } from './pages/auth/Register'
import { Privacy } from './pages/legal/Privacy'
import { Terms } from './pages/legal/Terms'
import { Dashboard } from './pages/dashboard/Dashboard'
import { ProductsIndex } from './pages/products/ProductsIndex'
import { ProductNew } from './pages/products/ProductNew'
import { ProductEdit } from './pages/products/ProductEdit'
import { ImportJSON } from './pages/products/ImportJSON'
import { StoresIndex } from './pages/stores/StoresIndex'
import { ImportStore } from './pages/stores/ImportStore'
import { WooCommerceConnect } from './pages/stores/WooCommerceConnect'
import { EtsyCallback } from './pages/stores/EtsyCallback'
import ShopifyConnect from './pages/stores/ShopifyConnect'
import ShopifyCallback from './pages/stores/ShopifyCallback'
import ShopifyImport from './pages/stores/ShopifyImport'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/stores/etsy/callback" element={<ProtectedRoute><EtsyCallback /></ProtectedRoute>} />
          <Route path="/auth/shopify/callback" element={<ProtectedRoute><ShopifyCallback /></ProtectedRoute>} />
          <Route path="/" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="products" element={<ProductsIndex />} />
            <Route path="products/new" element={<ProductNew />} />
            <Route path="products/import" element={<ImportJSON />} />
            <Route path="products/:id" element={<ProductEdit />} />
            <Route path="stores" element={<StoresIndex />} />
            <Route path="stores/import" element={<ImportStore />} />
            <Route path="stores/woocommerce" element={<WooCommerceConnect />} />
            <Route path="stores/shopify" element={<ShopifyConnect />} />
            <Route path="stores/shopify/import" element={<ShopifyImport />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}