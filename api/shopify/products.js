// Shopify Products API Proxy
// Handles CORS and keeps access token secure

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { shop, accessToken, action } = req.body

  if (!shop || !accessToken) {
    return res.status(400).json({ error: 'Missing shop or accessToken' })
  }

  const cleanDomain = shop.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const baseUrl = `https://${cleanDomain}/admin/api/2024-10`

  try {
    if (action === 'fetch') {
      // Fetch products
      const response = await fetch(`${baseUrl}/products.json?limit=250`, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Shopify API error:', response.status, errorText)
        return res.status(response.status).json({ 
          error: `Shopify API error: ${response.status}`,
          details: errorText
        })
      }

      const data = await response.json()
      return res.status(200).json(data)
    }

    if (action === 'create') {
      // Create product
      const { product } = req.body
      
      const response = await fetch(`${baseUrl}/products.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ product })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Shopify create error:', response.status, errorText)
        return res.status(response.status).json({ 
          error: `Shopify API error: ${response.status}`,
          details: errorText
        })
      }

      const data = await response.json()
      const createdProduct = data.product

      // After creation, fetch product to get Shopify's suggested category
      // Then accept the suggestion by updating the product
      try {
        const fetchResponse = await fetch(
          `${baseUrl}/products/${createdProduct.id}.json`,
          {
            headers: {
              'X-Shopify-Access-Token': accessToken,
              'Content-Type': 'application/json'
            }
          }
        )

        if (fetchResponse.ok) {
          const fetchData = await fetchResponse.json()
          const fetchedProduct = fetchData.product
          
          // Check if Shopify suggested a category (via product_category)
          // Shopify 2024-01+ uses category field
          if (fetchedProduct.category?.id || fetchedProduct.product_category?.product_taxonomy_node_id) {
            const categoryId = fetchedProduct.category?.id || 
                               fetchedProduct.product_category?.product_taxonomy_node_id

            // Accept the suggested category by setting it explicitly
            const updateResponse = await fetch(
              `${baseUrl}/products/${createdProduct.id}.json`,
              {
                method: 'PUT',
                headers: {
                  'X-Shopify-Access-Token': accessToken,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  product: {
                    id: createdProduct.id,
                    category: categoryId
                  }
                })
              }
            )

            if (updateResponse.ok) {
              const updateData = await updateResponse.json()
              console.log(`Accepted Shopify category suggestion for product ${createdProduct.id}`)
              return res.status(200).json({ 
                product: updateData.product,
                categoryAccepted: true
              })
            }
          }
        }
      } catch (categoryError) {
        // Log but don't fail - product was created successfully
        console.warn('Could not accept category suggestion:', categoryError.message)
      }

      return res.status(200).json(data)
    }

    if (action === 'update') {
      // Update product
      const { productId, product } = req.body
      
      const response = await fetch(`${baseUrl}/products/${productId}.json`, {
        method: 'PUT',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ product })
      })

      // If product was deleted on Shopify, fall back to CREATE
      if (response.status === 404) {
        console.log(`Product ${productId} not found on Shopify, falling back to CREATE`)
        
        const createResponse = await fetch(`${baseUrl}/products.json`, {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ product })
        })

        if (!createResponse.ok) {
          const errorText = await createResponse.text()
          console.error('Shopify create fallback error:', createResponse.status, errorText)
          return res.status(createResponse.status).json({ 
            error: `Shopify API error: ${createResponse.status}`,
            details: errorText
          })
        }

        const data = await createResponse.json()
        // Flag that we recreated so frontend can update platformIds
        return res.status(200).json({ 
          ...data, 
          recreated: true,
          oldProductId: productId 
        })
      }

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Shopify update error:', response.status, errorText)
        return res.status(response.status).json({ 
          error: `Shopify API error: ${response.status}`,
          details: errorText
        })
      }

      const data = await response.json()
      return res.status(200).json(data)
    }

    return res.status(400).json({ error: 'Invalid action' })

  } catch (error) {
    console.error('Shopify proxy error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    })
  }
}
