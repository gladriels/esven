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
  const [{ count: followerCount }, { count: followingCount }] = await Promise.all([
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", profile.id),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", profile.id)
  ]);
  let viewerFollowsProfile = false;
  if (viewer && viewer.id !== profile.id) {
    const { data } = await supabase.from("follows").select("follower_id").eq("follower_id", viewer.id).eq("following_id", profile.id).maybeSingle();
    viewerFollowsProfile = Boolean(data);
  }
  let viewerIsAdmin = false;
  if (viewer) {
    const { data: viewerProfile } = await supabase.from("profiles").select("is_admin").eq("id", viewer.id).maybeSingle();
    viewerIsAdmin = viewerProfile?.is_admin === true;
  }

  const songEmbed = profileSpotifyEmbedUrl(profile.profile_spotify_url);
  const joined = new Date(profile.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const postCount = (requests?.length ?? 0) + (recs?.length ?? 0);
  const isOwnProfile = viewer && viewer.id === profile.id;

  heroContainer.innerHTML = `
    <div class="ig-header">
      ${profile.avatar_url
        ? `<img src="${profile.avatar_url}" class="profile-avatar-big">`
        : `<span class="profile-avatar-big profile-avatar-big-empty"></span>`}
      <div class="ig-info-col">
        <div class="ig-username-row">
          <h1 class="profile-name">@${escapeHtml(profile.username)}</h1>
          <div class="ig-actions">
            ${viewer && !isOwnProfile ? `<button class="btn profile-follow-btn" id="follow-profile-btn">${viewerFollowsProfile ? "Following" : "Follow"}</button>` : ""}
            ${viewer && !isOwnProfile ? `<button class="btn btn-ghost" id="message-profile-btn">Message</button>` : ""}
            ${viewerIsAdmin && !isOwnProfile ? `<button class="btn btn-danger" id="admin-remove-user">Remove account</button>` : ""}
          </div>
        </div>
        <div class="ig-stats-row">
          <div class="ig-stat"><strong>${postCount}</strong><span>Posts</span></div>
          <div class="ig-stat"><strong id="stat-followers">${followerCount ?? 0}</strong><span>Followers</span></div>
          <div class="ig-stat"><strong>${followingCount ?? 0}</strong><span>Following</span></div>
        </div>
        ${profile.bio ? `<p class="profile-bio">${escapeHtml(profile.bio)}</p>` : ""}
        <p class="profile-bio">Joined ${joined}</p>
        ${songEmbed ? `<iframe class="spotify-embed" src="${songEmbed}" width="100%" height="80" frameborder="0" allow="encrypted-media"></iframe>` : ""}
      </div>
    </div>
  `;

  const followButton = document.getElementById("follow-profile-btn");
  if (followButton) followButton.addEventListener("click", async () => {
    followButton.disabled = true;
    const query = viewerFollowsProfile
      ? supabase.from("follows").delete().eq("follower_id", viewer.id).eq("following_id", profile.id)
      : supabase.from("follows").insert({ follower_id: viewer.id, following_id: profile.id });
    const { error } = await query;
    if (error) { alert("Couldn't update follow: " + error.message); followButton.disabled = false; return; }
    viewerFollowsProfile = !viewerFollowsProfile;
    followButton.textContent = viewerFollowsProfile ? "Following" : "Follow";
    followButton.classList.toggle("is-following", viewerFollowsProfile);
    followButton.disabled = false;
    const followerStat = document.getElementById("stat-followers");
    if (followerStat) followerStat.textContent = String(Number(followerStat.textContent) + (viewerFollowsProfile ? 1 : -1));
  });

  const messageButton = document.getElementById("message-profile-btn");
  if (messageButton) messageButton.addEventListener("click", async () => {
    messageButton.disabled = true;
    const { data: conversationId, error } = await supabase.rpc("get_or_create_conversation", { other_user_id: profile.id });
    if (error) { alert("Couldn't start conversation: " + error.message); messageButton.disabled = false; return; }
    window.location.href = `messages.html#${conversationId}`;
  });

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
    reqContainer.innerHTML = requests.map(r => `
      <a href="request.html#${r.id}" class="ig-grid-item${r.image_url ? " has-image" : ""}">
        ${r.image_url ? `<img src="${r.image_url}" alt="${escapeHtml(r.title)}" onerror="this.remove(); this.parentElement.classList.remove('has-image')">` : ""}
        <span class="ig-grid-item-fallback">${escapeHtml(r.title)}</span>
        <span class="ig-grid-item-overlay">
          ${r.category ? `<span class="ig-grid-item-tag">${escapeHtml(r.category)}</span>` : ""}
          <span class="ig-grid-item-name">${escapeHtml(r.title)}</span>
        </span>
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

function wireProfileTabs() {
  document.querySelectorAll("#profile-tabs .ig-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#profile-tabs .ig-tab").forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll("[data-panel]").forEach((panel) => { panel.hidden = panel.dataset.panel !== tab.dataset.tab; });
    });
  });
}

document.addEventListener("DOMContentLoaded", () => { wireProfileTabs(); loadProfile(); });
