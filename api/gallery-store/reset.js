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

  try {
    const repo = 'artmusuem/ecommerce-react'
    const defaultPath = `public/data/${artistId}.default.json`
    const targetPath = `public/data/${artistId}.json`
    
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
        error: `Default file not found: ${artistId}.default.json` 
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
          message: `Reset ${artistId} to default (demo) data`,
          content: defaultFile.content.replace(/\n/g, ''), // GitHub returns base64 with newlines
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
      message: `Reset ${artistId} to original Smithsonian data`,
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
