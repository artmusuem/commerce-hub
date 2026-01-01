// Shopify Smart Collection API
// Ensures a Smart Collection exists for a given product type
// Creates one with auto-populate rules if it doesn't exist

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { shop, accessToken, productType } = req.body

  if (!shop || !accessToken) {
    return res.status(400).json({ error: 'Missing shop or accessToken' })
  }

  if (!productType) {
    return res.status(400).json({ error: 'Missing productType' })
  }

  const cleanDomain = shop.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const baseUrl = `https://${cleanDomain}/admin/api/2024-10`

  try {
    // Step 1: Check if Smart Collection with this title already exists
    const searchResponse = await fetch(
      `${baseUrl}/smart_collections.json?title=${encodeURIComponent(productType)}`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text()
      console.error('Shopify search error:', searchResponse.status, errorText)
      return res.status(searchResponse.status).json({
        error: `Shopify API error: ${searchResponse.status}`,
        details: errorText
      })
    }

    const searchData = await searchResponse.json()
    
    // Check if exact match exists (case-insensitive)
    const existingCollection = searchData.smart_collections?.find(
      c => c.title.toLowerCase() === productType.toLowerCase()
    )

    if (existingCollection) {
      console.log(`Smart Collection "${productType}" already exists (ID: ${existingCollection.id})`)
      return res.status(200).json({
        id: existingCollection.id,
        title: existingCollection.title,
        handle: existingCollection.handle,
        rules: existingCollection.rules,
        existed: true
      })
    }

    // Step 2: Create new Smart Collection with product_type rule
    console.log(`Creating Smart Collection: ${productType}`)
    
    const createResponse = await fetch(`${baseUrl}/smart_collections.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        smart_collection: {
          title: productType,
          rules: [
            {
              column: 'type',
              relation: 'equals',
              condition: productType
            }
          ],
          published: true
        }
      })
    })

    if (!createResponse.ok) {
      const errorText = await createResponse.text()
      console.error('Shopify create error:', createResponse.status, errorText)
      return res.status(createResponse.status).json({
        error: `Failed to create collection: ${createResponse.status}`,
        details: errorText
      })
    }

    const createData = await createResponse.json()
    const newCollection = createData.smart_collection

    console.log(`Created Smart Collection "${newCollection.title}" (ID: ${newCollection.id})`)

    return res.status(200).json({
      id: newCollection.id,
      title: newCollection.title,
      handle: newCollection.handle,
      rules: newCollection.rules,
      created: true
    })

  } catch (error) {
    console.error('Smart Collection error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    })
  }
}
