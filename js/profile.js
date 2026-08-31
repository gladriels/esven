const profileUsername = decodeURIComponent(window.location.hash.slice(1));

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
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
    .select("id, username, avatar_url, created_at")
    .eq("username", profileUsername)
    .single();

  if (profileError || !profile) {
    heroContainer.innerHTML = `<p class="empty-state">Couldn't find @${escapeHtml(profileUsername)}.</p>`;
    reqContainer.innerHTML = "";
    recContainer.innerHTML = "";
    return;
  }

  const [{ data: requests }, { data: recs }] = await Promise.all([
    supabase
      .from("requests")
      .select("id, title, description, budget, category, image_url, spotify_url, created_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("recommendations")
      .select("id, note, created_at, request_id, requests(id, title)")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
  ]);

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
  `;

  if (!requests || !requests.length) {
    reqContainer.innerHTML = `<p class="empty-state">No requests yet.</p>`;
  } else {
    reqContainer.innerHTML = requests.map(r => `
      <a href="request.html#${r.id}" class="ticket">
        ${r.image_url ? `<div class="ticket-image"><img src="${r.image_url}" alt=""></div>` : ""}
        ${r.category ? `<span class="ticket-cat">${r.category}</span>` : ""}
        <h3 class="ticket-title">${escapeHtml(r.title)}</h3>
        <p class="ticket-desc">${escapeHtml(r.description ?? "")}</p>
        ${r.spotify_url ? `<div class="ticket-song">&#9834; song attached</div>` : ""}
        <div class="ticket-footer">
          <span>${new Date(r.created_at).toLocaleDateString()}</span>
          ${r.budget ? `<span class="ticket-budget">${escapeHtml(r.budget)}</span>` : "<span></span>"}
        </div>
      </a>
    `).join("");
  }

  if (!recs || !recs.length) {
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
