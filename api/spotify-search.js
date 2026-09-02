// Lets people search for a song by name instead of pasting a Spotify URL.
// Uses Spotify's "Client Credentials" auth — app-level access, no user
// login needed, just your app's own Client ID/Secret (see README setup).

let cachedToken = null;
let tokenExpiry = 0;

async function getSpotifyToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Spotify credentials not configured (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET missing).");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify auth failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

module.exports = async (req, res) => {
  const q = req.query.q;
  if (!q) {
    res.status(400).json({ error: "q is required" });
    return;
  }

  try {
    const token = await getSpotifyToken();
    const searchRes = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=8`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!searchRes.ok) {
      const text = await searchRes.text();
      throw new Error(`Spotify search failed: ${searchRes.status} ${text}`);
    }

    const data = await searchRes.json();
    const results = (data.tracks?.items || []).map(track => ({
      name: track.name,
      artist: track.artists.map(a => a.name).join(", "),
      image: track.album?.images?.[2]?.url || track.album?.images?.[0]?.url || "",
      url: track.external_urls.spotify
    }));

    res.status(200).json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
