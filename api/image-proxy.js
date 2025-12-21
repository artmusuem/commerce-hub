// Image proxy for WooCommerce
// Fetches images from sources that don't have proper extensions (like Smithsonian)
// Usage: /api/image-proxy?url=https://ids.si.edu/ids/deliveryService?id=SAAM-2019.6.7_1

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { url } = req.query

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' })
  }

  try {
    // Fetch the image from the source
    const response = await fetch(url)
    
    if (!response.ok) {
      return res.status(response.status).json({ 
        error: `Failed to fetch image: ${response.status}` 
      })
    }

    // Get the image data as buffer
    const buffer = await response.arrayBuffer()
    
    // Detect content type from response or default to jpeg
    let contentType = response.headers.get('content-type') || 'image/jpeg'
    
    // If content type is not an image, try to detect from the data
    if (!contentType.startsWith('image/')) {
      // Check magic bytes for common image formats
      const bytes = new Uint8Array(buffer.slice(0, 4))
      if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
        contentType = 'image/jpeg'
      } else if (bytes[0] === 0x89 && bytes[1] === 0x50) {
        contentType = 'image/png'
      } else if (bytes[0] === 0x47 && bytes[1] === 0x49) {
        contentType = 'image/gif'
      } else {
        contentType = 'image/jpeg' // Default fallback
      }
    }

    // Set proper headers for WooCommerce to recognize as image
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Length', buffer.byteLength)
    res.setHeader('Cache-Control', 'public, max-age=86400') // Cache for 24 hours
    
    // Send the image
    return res.status(200).send(Buffer.from(buffer))
    
  } catch (error) {
    console.error('Image proxy error:', error)
    return res.status(500).json({ 
      error: 'Failed to proxy image',
      message: error.message
    })
  }
}
