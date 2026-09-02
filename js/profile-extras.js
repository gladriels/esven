// The edit-profile modal is created dynamically by auth.js. This watches
// for it to appear and adds a bio field + song search into it, saving
// alongside the existing username/avatar save button.

function injectProfileExtras(user) {
  const modal = document.getElementById("profile-modal");
  if (!modal || modal.dataset.extrasInjected) return;
  modal.dataset.extrasInjected = "1";

  const saveBtn = document.getElementById("profile-save-btn");
  if (!saveBtn) return;

  const bioRow = document.createElement("div");
  bioRow.className = "field-row";
  bioRow.innerHTML = `<textarea id="profile-bio" placeholder="Bio (optional)"></textarea>`;

  const songRow = document.createElement("div");
  songRow.className = "field-row";
  songRow.innerHTML = `
    <input type="text" id="profile-song-search" placeholder="Search for a profile song..." />
    <input type="hidden" id="profile-song-url" />
  `;

  saveBtn.insertAdjacentElement("beforebegin", bioRow);
  saveBtn.insertAdjacentElement("beforebegin", songRow);

  if (typeof attachSongSearch === "function") {
    attachSongSearch("profile-song-search", "profile-song-url", "profile-song-results");
  }

  supabase
    .from("profiles")
    .select("bio, profile_spotify_url")
    .eq("id", user.id)
    .single()
    .then(({ data }) => {
      if (!data) return;
      if (data.bio) document.getElementById("profile-bio").value = data.bio;
      if (data.profile_spotify_url) {
        document.getElementById("profile-song-url").value = data.profile_spotify_url;
        document.getElementById("profile-song-search").placeholder = "Song already set — search to change";
      }
    });

  saveBtn.addEventListener("click", async () => {
    const bio = document.getElementById("profile-bio").value.trim();
    const profile_spotify_url = document.getElementById("profile-song-url").value.trim();
    const updates = {};
    if (bio) updates.bio = bio;
    if (profile_spotify_url) updates.profile_spotify_url = profile_spotify_url;
    if (Object.keys(updates).length) {
      await supabase.from("profiles").update(updates).eq("id", user.id);
    }
  });
}

async function checkForProfileModal() {
  const modal = document.getElementById("profile-modal");
  if (modal && !modal.dataset.extrasInjected) {
    const user = await getCurrentUser();
    if (user) injectProfileExtras(user);
  }
}

const profileExtrasObserver = new MutationObserver(checkForProfileModal);
profileExtrasObserver.observe(document.body, { childList: true, subtree: true });
