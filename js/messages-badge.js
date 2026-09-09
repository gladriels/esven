// Global "Messages" entry point + unread badge, injected into the auth bar
// on every page. Include after auth.js. auth.js rebuilds #auth-bar's
// innerHTML on load (and after profile edits), so this watches for the
// avatar button to (re)appear rather than running once.

async function computeUnreadCount(userId) {
  const { data: myConversations } = await supabase
    .from("conversations")
    .select("id")
    .or(`user_min.eq.${userId},user_max.eq.${userId}`);
  const conversationIds = (myConversations || []).map((c) => c.id);
  if (!conversationIds.length) return 0;

  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .in("conversation_id", conversationIds)
    .is("read_at", null)
    .neq("sender_id", userId);

  return count || 0;
}

let badgeRealtimeStarted = false;

async function injectMessagesBadge(bar, user) {
  if (document.getElementById("messages-badge-btn")) return;
  const badge = document.createElement("button");
  badge.type = "button";
  badge.id = "messages-badge-btn";
  badge.className = "btn btn-ghost messages-badge-btn";
  badge.innerHTML = `Messages <span class="messages-badge-count" id="messages-badge-count" hidden></span>`;
  badge.onclick = () => { window.location.href = "messages.html"; };
  bar.insertBefore(badge, bar.firstChild);

  const refresh = async () => {
    const count = await computeUnreadCount(user.id);
    const countEl = document.getElementById("messages-badge-count");
    if (!countEl) return;
    countEl.textContent = count > 9 ? "9+" : String(count);
    countEl.hidden = count === 0;
  };

  await refresh();

  if (!badgeRealtimeStarted) {
    badgeRealtimeStarted = true;
    supabase
      .channel(`unread-badge-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => refresh())
      .subscribe();
  }
}

async function checkForAuthBar() {
  const bar = document.getElementById("auth-bar");
  if (!bar || !bar.querySelector("#avatar-btn") || document.getElementById("messages-badge-btn")) return;
  const user = await getCurrentUser();
  if (user) injectMessagesBadge(bar, user);
}

const messagesBadgeObserver = new MutationObserver(checkForAuthBar);
messagesBadgeObserver.observe(document.body, { childList: true, subtree: true });
document.addEventListener("DOMContentLoaded", checkForAuthBar);
