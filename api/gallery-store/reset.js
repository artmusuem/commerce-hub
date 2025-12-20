// Valid Gallery Store collections (artist slugs)
const VALID_COLLECTIONS = [
  'winslow-homer',
  'mary-cassatt',
  'thomas-cole',
  'frederic-remington',
  'georgia-okeeffe',
  'edward-hopper'
]

// Map common artist name variations to slugs
const ARTIST_TO_SLUG = {
  'winslow homer': 'winslow-homer',
  'homer, winslow': 'winslow-homer',
  'mary cassatt': 'mary-cassatt',
  'cassatt, mary': 'mary-cassatt',
  'thomas cole': 'thomas-cole',
  'cole, thomas': 'thomas-cole',
  'frederic remington': 'frederic-remington',
  'remington, frederic': 'frederic-remington',
  'georgia okeeffe': 'georgia-okeeffe',
  'georgia o\'keeffe': 'georgia-okeeffe',
  'okeeffe, georgia': 'georgia-okeeffe',
  'o\'keeffe, georgia': 'georgia-okeeffe',
  'edward hopper': 'edward-hopper',
  'hopper, edward': 'edward-hopper'
}

function normalizeToSlug(artistName) {
  if (!artistName) return null
  
  const normalized = artistName.toLowerCase().trim()
  
  // Try direct mapping first
  if (ARTIST_TO_SLUG[normalized]) {
    return ARTIST_TO_SLUG[normalized]
  }
  
  // Try converting to slug format
  const slug = normalized.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  
  if (VALID_COLLECTIONS.includes(slug)) {
    return slug
  }
  
  return null
}

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

  const { artistId, githubToken } = req.body

  if (!artistId || !githubToken) {
    return res.status(400).json({ error: 'Missing artistId or githubToken' })
  }

  // Validate artistId is a known collection
  const validSlug = VALID_COLLECTIONS.includes(artistId) ? artistId : normalizeToSlug(artistId)
  
  if (!validSlug) {
    return res.status(400).json({ 
      error: `Invalid collection: "${artistId}"`,
      message: `Gallery Store only supports these collections: ${VALID_COLLECTIONS.join(', ')}`,
      hint: 'The artist name must match one of the original Smithsonian collections.'
    })
  }

  try {
    const repo = 'artmusuem/ecommerce-react'
    const defaultPath = `public/data/${validSlug}.default.json`
    const targetPath = `public/data/${validSlug}.json`
    
    // Get default file content
    const defaultResponse = await fetch(
      `https://api.github.com/repos/${repo}/contents/${defaultPath}`,
      {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    )

    if (!defaultResponse.ok) {
      return res.status(404).json({ 
        error: `Default file not found: ${validSlug}.default.json` 
      })
    }

    const defaultFile = await defaultResponse.json()
    
    // Get current target file SHA
    const targetResponse = await fetch(
      `https://api.github.com/repos/${repo}/contents/${targetPath}`,
      {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    )

    let targetSha = null
    if (targetResponse.ok) {
      const targetFile = await targetResponse.json()
      targetSha = targetFile.sha
    }

    // Copy default content to target file
    const pushResponse = await fetch(
      `https://api.github.com/repos/${repo}/contents/${targetPath}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Reset ${validSlug} to default (demo) data`,
          content: defaultFile.content.replace(/\n/g, ''),
          sha: targetSha
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
      message: `Reset ${validSlug} to original Smithsonian data`,
      commit: result.commit?.sha
    })
  } catch (error) {
    console.error('Gallery Store reset error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    })
  }
}
