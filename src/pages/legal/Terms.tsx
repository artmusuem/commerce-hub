import { Link } from 'react-router-dom'

export function Terms() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <Link to="/login" className="text-blue-600 hover:underline text-sm">← Back to Login</Link>
        
        <h1 className="text-3xl font-bold text-gray-900 mt-4 mb-6">Terms of Service</h1>
        
        <div className="bg-white p-8 rounded-xl shadow-sm space-y-6 text-gray-700">
          <p className="text-sm text-gray-500">Last updated: December 2024</p>
          
          <section>
            <h2 className="text-xl font-semibold mb-3">Acceptance of Terms</h2>
            <p>By accessing or using Commerce Hub, you agree to be bound by these Terms of Service.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Description of Service</h2>
            <p>Commerce Hub is a personal inventory management tool that allows you to manage product listings across multiple e-commerce platforms including Etsy, Shopify, and WooCommerce.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">User Responsibilities</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>You are responsible for maintaining the security of your account</li>
              <li>You must have authorization to connect and manage the stores you add</li>
              <li>You agree to comply with the terms of service of connected platforms (Etsy, Shopify, WooCommerce)</li>
              <li>You are responsible for the accuracy of product information you manage</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">API Usage</h2>
            <p>This application uses official APIs from third-party platforms. Your use of these integrations is subject to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><a href="https://www.etsy.com/legal/api" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">Etsy API Terms of Use</a></li>
              <li><a href="https://www.shopify.com/legal/api-terms" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">Shopify API Terms</a></li>
              <li><a href="https://woocommerce.com/terms-conditions/" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">WooCommerce Terms</a></li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Disclaimer</h2>
            <p>Commerce Hub is provided "as is" without warranties of any kind. We are not responsible for any data loss, synchronization errors, or issues with third-party platforms.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Limitation of Liability</h2>
            <p>Commerce Hub shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of the service.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Trademark Notice</h2>
            <p>The term "Etsy" is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.</p>
            <p className="mt-2">"Shopify" is a trademark of Shopify Inc. "WooCommerce" is a trademark of Automattic Inc.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Contact</h2>
            <p>For questions about these terms, contact: <a href="mailto:bromermuseum@gmail.com" className="text-blue-600 hover:underline">bromermuseum@gmail.com</a></p>
          </section>
        </div>

        <footer className="mt-8 text-center text-xs text-gray-500">
          <p>The term "Etsy" is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.</p>
        </footer>
      </div>
    </div>
  )
}
