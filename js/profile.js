const profileUsername = decodeURIComponent(window.location.hash.slice(1));

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function profileSpotifyEmbedUrl(url) {
  if (!url) return null;
  const match = url.match(/track\/([a-zA-Z0-9]+)/);
  if (!match) return null;
  return `https://open.spotify.com/embed/track/${match[1]}?utm_source=generator&theme=0`;
}

async function loadProfile() {
  const heroContainer = document.getElementById("profile-hero-container");
  const reqContainer = document.getElementById("profile-requests");
  const recContainer = document.getElementById("profile-recs");

  if (!profileUsername) {
    heroContainer.innerHTML = `<p class="empty-state">No profile specified.</p>`;
    reqContainer.innerHTML = "";
    recContainer.innerHTML = "";
    return;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, created_at, bio, profile_spotify_url")
    .eq("username", profileUsername)
    .single();

  if (profileError || !profile) {
    heroContainer.innerHTML = `<p class="empty-state">Couldn't find @${escapeHtml(profileUsername)}${profileError ? `: ${escapeHtml(profileError.message)}` : ""}</p>`;
    reqContainer.innerHTML = "";
    recContainer.innerHTML = "";
    return;
  }

  const reqResult = await supabase
    .from("requests")
    .select("id, title, description, budget, category, image_url, spotify_url, created_at")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });

  const recResult = await supabase
    .from("recommendations")
    .select("id, note, created_at, request_id, requests(id, title)")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });

  const requests = reqResult.data;
  const recs = recResult.data;

  const { data: { user: viewer } } = await supabase.auth.getUser();
  let viewerIsAdmin = false;
  if (viewer) {
    const { data: viewerProfile } = await supabase.from("profiles").select("is_admin").eq("id", viewer.id).maybeSingle();
    viewerIsAdmin = viewerProfile?.is_admin === true;
  }

  const songEmbed = profileSpotifyEmbedUrl(profile.profile_spotify_url);
  const joined = new Date(profile.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  heroContainer.innerHTML = `
    <div class="profile-hero">
      ${profile.avatar_url
        ? `<img src="${profile.avatar_url}" class="profile-avatar-big">`
        : `<span class="profile-avatar-big profile-avatar-big-empty"></span>`}
      <div>
        <h1 class="profile-name">@${escapeHtml(profile.username)}</h1>
        <div class="profile-stats-row">
          <span><strong>${requests?.length ?? 0}</strong> requests</span>
          <span><strong>${recs?.length ?? 0}</strong> recommendations</span>
          <span>Joined ${joined}</span>
        </div>
      </div>
    </div>
    ${profile.bio ? `<p class="profile-bio">${escapeHtml(profile.bio)}</p>` : ""}
    ${viewerIsAdmin && viewer.id !== profile.id ? `<button class="btn btn-danger" id="admin-remove-user">Remove account</button>` : ""}
    ${songEmbed ? `<iframe class="spotify-embed" src="${songEmbed}" width="100%" height="80" frameborder="0" allow="encrypted-media"></iframe>` : ""}
  `;

  const removeButton = document.getElementById("admin-remove-user");
  if (removeButton) removeButton.addEventListener("click", async () => {
    if (!confirm(`Remove @${profile.username} and their content? This cannot be undone.`)) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { alert("Your session expired. Sign in again."); return; }
    const response = await fetch("/api/admin-delete-user", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ userId: profile.id })
    });
    const data = await response.json();
    if (!response.ok) { alert(data.error || "Couldn't remove this account."); return; }
    window.location.href = "index.html";
  });

  if (reqResult.error) {
    reqContainer.innerHTML = `<p class="empty-state">Couldn't load requests: ${escapeHtml(reqResult.error.message)}</p>`;
  } else if (!requests || !requests.length) {
    reqContainer.innerHTML = `<p class="empty-state">No requests yet.</p>`;
  } else {
    reqContainer.classList.add("profile-post-grid");
    reqContainer.innerHTML = requests.map(r => `
      <a href="request.html#${r.id}" class="profile-post${r.image_url ? " has-image" : ""}">
        ${r.image_url ? `<img src="${r.image_url}" alt="${escapeHtml(r.title)}" onerror="this.remove(); this.parentElement.classList.remove('has-image')">` : ""}
        <span class="profile-post-fallback">${escapeHtml(r.title)}</span>
        <span class="profile-post-overlay"><strong>${escapeHtml(r.title)}</strong><small>${r.category || "Request"}</small></span>
      </a>`).join("");
  }

  if (recResult.error) {
    recContainer.innerHTML = `<p class="empty-state">Couldn't load recommendations: ${escapeHtml(recResult.error.message)}</p>`;
  } else if (!recs || !recs.length) {
    recContainer.innerHTML = `<p class="empty-state">No recommendations yet.</p>`;
  } else {
    recContainer.innerHTML = recs.map(rec => `
      <a href="request.html#${rec.request_id}" class="profile-rec-item">
        <p class="profile-rec-note">${escapeHtml(rec.note)}</p>
        <span class="profile-rec-for">on: ${escapeHtml(rec.requests?.title ?? "a request")}</span>
      </a>
    `).join("");
  }
}

document.addEventListener("DOMContentLoaded", loadProfile);
