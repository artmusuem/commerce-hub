import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Product } from '../../types/database'

function getThumbnail(url: string, size: number = 100): string {
  if (!url) return ''
  if (url.includes('ids.si.edu')) {
    return url + (url.includes('?') ? '&' : '?') + `max=${size}`
  }
  return url
}

export function ProductsIndex() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProducts()
  }, [])

  async function loadProducts() {
    const { data } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false })
    setProducts(data || [])
    setLoading(false)
  }

  async function deleteProduct(id: string, title: string) {
    if (!confirm(`Delete "${title}"?`)) return
    await supabase.from('products').delete().eq('id', id)
    setProducts(products.filter(p => p.id !== id))
  }

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    draft: 'bg-yellow-100 text-yellow-700',
    archived: 'bg-gray-100 text-gray-700',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-600">{products.length} products</p>
        </div>
        <div className="flex gap-2">
          <Link to="/products/import" className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
            📥 Import JSON
          </Link>
          <Link to="/products/new" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            + Add Product
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <p className="text-gray-500 mb-4">No products yet</p>
          <Link to="/products/new" className="text-blue-600 hover:underline">Create your first product</Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {products.map(product => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {product.image_url ? (
                        <img src={getThumbnail(product.image_url)} alt="" className="w-12 h-12 rounded-lg object-cover bg-gray-100" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">📷</div>
                      )}
                      <div>
                        <p className="font-medium text-gray-900">{product.title}</p>
                        {product.artist && <p className="text-sm text-gray-500">{product.artist}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium">${product.price.toFixed(2)}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[product.status]}`}>
                      {product.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <Link to={`/products/${product.id}`} className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded">Edit</Link>
                    <button onClick={() => deleteProduct(product.id, product.title)} className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded ml-2">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
