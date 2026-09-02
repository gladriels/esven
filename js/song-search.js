(function injectSongSearchStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .song-search-results {
      background: #fff;
      border: 1px solid #E9E7E2;
      border-radius: 8px;
      margin-top: 4px;
      max-height: 220px;
      overflow-y: auto;
    }
    .song-result-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      cursor: pointer;
    }
    .song-result-item:hover { background: #F0EFEA; }
    .song-result-thumb { width: 36px; height: 36px; border-radius: 4px; object-fit: cover; flex-shrink: 0; }
    .song-result-name { font-size: 13px; font-weight: 600; }
    .song-result-artist { font-size: 11px; color: #6B6B68; }
    .song-result-loading { padding: 10px; font-size: 12px; color: #6B6B68; }
    .song-selected-tag {
      font-size: 12px;
      color: #E8952E;
      margin-top: 4px;
    }
  `;
  document.head.appendChild(style);
})();

// Attaches a "search by song name" box to a text input. When someone picks
// a result, the chosen track's link is written into targetUrlInputId.
function attachSongSearch(searchInputId, targetUrlInputId, resultsContainerId) {
  const searchInput = document.getElementById(searchInputId);
  const targetInput = document.getElementById(targetUrlInputId);
  if (!searchInput || !targetInput) return;

  let resultsBox = document.getElementById(resultsContainerId);
  if (!resultsBox) {
    resultsBox = document.createElement("div");
    resultsBox.id = resultsContainerId;
    resultsBox.className = "song-search-results";
    searchInput.insertAdjacentElement("afterend", resultsBox);
  }

  let debounceTimer;
  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const q = searchInput.value.trim();
    if (!q) { resultsBox.innerHTML = ""; return; }
    debounceTimer = setTimeout(() => runSearch(q), 400);
  });

  async function runSearch(q) {
    resultsBox.innerHTML = `<div class="song-result-loading">Searching...</div>`;
    try {
      const res = await fetch(`/api/spotify-search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) {
        resultsBox.innerHTML = `<div class="song-result-loading">${data.error || "Search failed"}</div>`;
        return;
      }
      if (!data.results.length) {
        resultsBox.innerHTML = `<div class="song-result-loading">No songs found.</div>`;
        return;
      }
      resultsBox.innerHTML = data.results.map((track, i) => `
        <div class="song-result-item" data-index="${i}">
          ${track.image ? `<img src="${track.image}" class="song-result-thumb">` : ""}
          <div>
            <div class="song-result-name">${track.name}</div>
            <div class="song-result-artist">${track.artist}</div>
          </div>
        </div>
      `).join("");

      resultsBox.querySelectorAll(".song-result-item").forEach(el => {
        el.addEventListener("click", () => {
          const track = data.results[Number(el.dataset.index)];
          targetInput.value = track.url;
          searchInput.value = `${track.name} — ${track.artist}`;
          resultsBox.innerHTML = `<div class="song-selected-tag" style="padding:6px 10px;">Selected: ${track.name} — ${track.artist}</div>`;
        });
      });
    } catch (err) {
      resultsBox.innerHTML = `<div class="song-result-loading">Search failed.</div>`;
    }
  }
}

// Auto-attach to the request-posting form's song field, if it's on this page.
// Turns the old paste-a-URL field into the hidden storage field, and puts
// a real search box in front of it.
document.addEventListener("DOMContentLoaded", () => {
  const urlInput = document.getElementById("req-spotify");
  if (urlInput && !document.getElementById("req-spotify-search")) {
    urlInput.type = "hidden";

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.id = "req-spotify-search";
    searchInput.placeholder = "Search for a song...";
    urlInput.insertAdjacentElement("beforebegin", searchInput);

    attachSongSearch("req-spotify-search", "req-spotify", "req-spotify-results");
  }
});
