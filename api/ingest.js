let cachedToken = null;
let tokenExpiry  = 0;

async function getSalesforceToken() {
  // Return cached token if still valid
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  const params = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     process.env.SF_CLIENT_ID,
    client_secret: process.env.SF_CLIENT_SECRET
  });

  const response = await fetch(
    'https://login.salesforce.com/services/oauth2/token',
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params.toString()
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error('Token fetch failed: ' + error);
  }

  const data     = await response.json();
  cachedToken    = data.access_token;
  // Cache for expiry minus 5 minutes buffer
  tokenExpiry    = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken;
}

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token   = await getSalesforceToken();
    const payload = req.body;

    // POST to Salesforce Data Cloud Ingestion API
    const sfResponse = await fetch(
      process.env.SF_INGEST_URL,
      {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer ' + token
        },
        // Data Cloud expects the array wrapped in a "data" key
        body: JSON.stringify({ data: [payload] })
      }
    );

    if (!sfResponse.ok) {
      const errText = await sfResponse.text();
      console.error('Data Cloud error:', errText);
      return res.status(sfResponse.status).json({ error: errText });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Proxy error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}