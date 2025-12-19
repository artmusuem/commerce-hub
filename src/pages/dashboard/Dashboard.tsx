import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Product } from '../../types/database'

export function Dashboard() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('products').select('*')
      setProducts(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const stats = [
    { label: 'Total Products', value: products.length, icon: '📦' },
    { label: 'Active', value: products.filter(p => p.status === 'active').length, icon: '✅' },
    { label: 'Draft', value: products.filter(p => p.status === 'draft').length, icon: '📝' },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Welcome to Commerce Hub</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {stats.map(stat => (
          <div key={stat.label} className="bg-white p-6 rounded-xl shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{stat.icon}</span>
              <div>
                <p className="text-2xl font-bold text-gray-900">{loading ? '...' : stat.value}</p>
                <p className="text-sm text-gray-500">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="flex gap-4">
          <Link to="/products/new" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            + Add Product
          </Link>
          <Link to="/products" className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
            View All Products
          </Link>
        </div>
      </div>
    </div>
  )
}
