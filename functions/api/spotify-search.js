// Lets people search for a song by name instead of pasting a Spotify URL.
// Uses Spotify's "Client Credentials" auth — app-level access, no user
// login needed, just the app's own Client ID/Secret.
import { json, basicCredentials } from "../../lib/http.js";

// Kept for the life of the Worker isolate, same as the module-level cache on
// Vercel, so most searches skip the token round trip.
let cachedToken = null;
let tokenExpiry = 0;

async function getSpotifyToken(env) {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const clientId = env.SPOTIFY_CLIENT_ID;
  const clientSecret = env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Spotify credentials not configured (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET missing).");
  }

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicCredentials(clientId, clientSecret)}`,
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

export async function onRequest({ request, env }) {
  const q = new URL(request.url).searchParams.get("q");
  if (!q) return json(400, { error: "q is required" });

  try {
    const token = await getSpotifyToken(env);
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

    return json(200, { results });
  } catch (err) {
    return json(500, { error: err.message });
  }
}
