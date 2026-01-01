import { Link } from 'react-router-dom'

export function Privacy() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <Link to="/login" className="text-blue-600 hover:underline text-sm">← Back to Login</Link>
        
        <h1 className="text-3xl font-bold text-gray-900 mt-4 mb-6">Privacy Policy</h1>
        
        <div className="bg-white p-8 rounded-xl shadow-sm space-y-6 text-gray-700">
          <p className="text-sm text-gray-500">Last updated: December 2024</p>
          
          <section>
            <h2 className="text-xl font-semibold mb-3">Overview</h2>
            <p>Commerce Hub is a personal inventory management tool. This privacy policy explains how we handle data.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Data We Collect</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Account Information:</strong> Email address and password for authentication</li>
              <li><strong>Store Connections:</strong> OAuth tokens for connected platforms (Etsy, Shopify, WooCommerce)</li>
              <li><strong>Product Data:</strong> Listings imported from your connected stores</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">How We Use Your Data</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>To authenticate you and provide access to the application</li>
              <li>To sync products between your connected e-commerce platforms</li>
              <li>To display and manage your inventory</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Data Storage & Security</h2>
            <p>All data is stored securely in Supabase (PostgreSQL) with encryption at rest. OAuth tokens are stored securely and only used to access your own store data.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Third-Party Services</h2>
            <p>We connect to the following platforms via their official APIs:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Etsy (via Etsy Open API v3)</li>
              <li>Shopify (via Shopify Admin API)</li>
              <li>WooCommerce (via WooCommerce REST API)</li>
            </ul>
            <p className="mt-2">We only access data you explicitly authorize through OAuth.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Data Retention</h2>
            <p>Your data is retained as long as your account is active. You may request deletion of your data at any time by contacting us.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Contact</h2>
            <p>For privacy questions, contact: <a href="mailto:bromermuseum@gmail.com" className="text-blue-600 hover:underline">bromermuseum@gmail.com</a></p>
          </section>
        </div>

        <footer className="mt-8 text-center text-xs text-gray-500">
          <p>The term "Etsy" is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.</p>
        </footer>
      </div>
    </div>
  )
}
