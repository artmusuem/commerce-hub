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

  const { artistId, artworks, githubToken } = req.body

  if (!artistId || !artworks || !githubToken) {
    return res.status(400).json({ error: 'Missing artistId, artworks, or githubToken' })
  }

  try {
    const repo = 'artmusuem/ecommerce-react'
    const filePath = `public/data/${artistId}.json`
    
    // Build JSON structure matching Gallery Store format
    const jsonData = {
      collection_info: {
        source: "Smithsonian American Art Museum",
        search_query: artworks[0]?.artist || artistId,
        search_term: artworks[0]?.artist || artistId,
        total_items: artworks.length,
        generated_date: new Date().toISOString(),
        api_source: "https://api.si.edu/openaccess/api/v1.0/",
        museum: "Smithsonian American Art Museum",
        location: "Washington, DC",
        note: "Updated via Commerce Hub"
      },
      artworks: artworks.map(a => ({
        title: a.title,
        artist: a.artist_original || a.artist, // Keep "Last, First" format
        year_created: a.year_created || "Date unknown",
        medium: a.medium || "Mixed media",
        image: a.image_url,
        museum: a.museum || "Smithsonian American Art Museum",
        location: a.location || "Washington, DC",
        description: a.description,
        accession_number: a.accession_number || "",
        api_url: a.api_url || "",
        smithsonian_id: a.smithsonian_id || a.external_id || "",
        object_type: a.object_type || "Artwork",
        dimensions: a.dimensions || "",
        credit_line: a.credit_line || "",
        created_date: a.created_date || new Date().toISOString()
      }))
    }

    // Get current file SHA (needed for update)
    const getResponse = await fetch(
      `https://api.github.com/repos/${repo}/contents/${filePath}`,
      {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    )

    let sha = null
    if (getResponse.ok) {
      const existing = await getResponse.json()
      sha = existing.sha
    }

    // Push to GitHub
    const content = Buffer.from(JSON.stringify(jsonData, null, 2)).toString('base64')
    
    const pushResponse = await fetch(
      `https://api.github.com/repos/${repo}/contents/${filePath}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Update ${artistId} products from Commerce Hub`,
          content,
          sha // Include SHA if updating existing file
        })
      }
    )

    if (!pushResponse.ok) {
      const errorText = await pushResponse.text()
      console.error('GitHub push failed:', pushResponse.status, errorText)
      return res.status(pushResponse.status).json({ 
        error: 'GitHub push failed',
        details: errorText
      })
    }

    const result = await pushResponse.json()
    
    return res.status(200).json({
      success: true,
      message: `Updated ${artistId}.json with ${artworks.length} artworks`,
      commit: result.commit?.sha
    })
  } catch (error) {
    console.error('Gallery Store push error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    })
  }
}
