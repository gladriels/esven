// Tracks which requests this visitor has opened, for the feed's "Recent"
// tab — their own recently-viewed posts, not global recency. Per-device,
// stored in localStorage; never synced to the server or other devices.
const RECENTLY_VIEWED_KEY = "esven-recently-viewed";
const RECENTLY_VIEWED_MAX = 60;

function getRecentlyViewedIds() {
  try {
    const raw = localStorage.getItem(RECENTLY_VIEWED_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

function recordRecentlyViewed(requestId) {
  if (!requestId) return;
  try {
    const list = getRecentlyViewedIds().filter(id => id !== requestId);
    list.unshift(requestId);
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(list.slice(0, RECENTLY_VIEWED_MAX)));
  } catch (_) {}
}
