function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

let currentUser = null;
let activeConversationId = null;
let activeChannel = null;
let conversations = [];

function otherParticipant(conversation) {
  return conversation.user_min === currentUser.id ? conversation.user_max : conversation.user_min;
}

async function loadConversations() {
  const listEl = document.getElementById("messages-list");
  const { data, error } = await supabase
    .from("conversations")
    .select("id, user_min, user_max, last_message_at, last_message_preview")
    .order("last_message_at", { ascending: false });

  if (error) { listEl.innerHTML = `<p class="empty-state">Couldn't load conversations: ${escapeHtml(error.message)}</p>`; return; }
  if (!data.length) { listEl.innerHTML = `<p class="messages-empty">No conversations yet. Visit someone's profile and hit Message to start one.</p>`; return; }

  conversations = data;
  const otherIds = data.map(otherParticipant);
  const convoIds = data.map((c) => c.id);

  const [{ data: profiles }, { data: unread }] = await Promise.all([
    supabase.from("profiles").select("id, username, avatar_url").in("id", otherIds),
    supabase.from("messages").select("conversation_id").in("conversation_id", convoIds).is("read_at", null).neq("sender_id", currentUser.id)
  ]);

  const profileById = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
  const unreadCounts = {};
  (unread || []).forEach((row) => { unreadCounts[row.conversation_id] = (unreadCounts[row.conversation_id] || 0) + 1; });

  listEl.innerHTML = data.map((c) => {
    const profile = profileById[otherParticipant(c)];
    const unreadCount = unreadCounts[c.id] || 0;
    return `
      <a href="#${c.id}" class="messages-list-item${c.id === activeConversationId ? " active" : ""}" data-conversation="${c.id}">
        ${profile?.avatar_url ? `<img src="${profile.avatar_url}" class="messages-list-avatar">` : `<span class="messages-list-avatar messages-list-avatar-empty"></span>`}
        <div class="messages-list-meta">
          <div class="messages-list-name"><span>@${escapeHtml(profile?.username ?? "unknown")}</span>${unreadCount ? `<span class="messages-unread-dot"></span>` : ""}</div>
          <div class="messages-list-preview">${escapeHtml(c.last_message_preview ?? "Say hello")}</div>
        </div>
      </a>`;
  }).join("");

  listEl.querySelectorAll("[data-conversation]").forEach((el) => {
    el.addEventListener("click", (event) => { event.preventDefault(); openConversation(el.dataset.conversation); });
  });
}

function renderMessage(message) {
  const mine = message.sender_id === currentUser.id;
  return `<div class="message-bubble ${mine ? "mine" : "theirs"}">${escapeHtml(message.body)}</div>`;
}

async function openConversation(conversationId) {
  activeConversationId = conversationId;
  document.getElementById("messages-shell").classList.add("showing-thread");
  document.getElementById("messages-shell").classList.remove("showing-list");
  window.location.hash = conversationId;

  document.querySelectorAll("[data-conversation]").forEach((el) => el.classList.toggle("active", el.dataset.conversation === conversationId));

  const conversation = conversations.find((c) => c.id === conversationId);
  const threadEl = document.getElementById("messages-thread");

  let otherProfile = null;
  if (conversation) {
    const { data } = await supabase.from("profiles").select("username, avatar_url").eq("id", otherParticipant(conversation)).single();
    otherProfile = data;
  }

  threadEl.innerHTML = `
    <div class="messages-thread-header"><a href="#" class="back-to-list" id="back-to-list">&larr;</a> @${escapeHtml(otherProfile?.username ?? "conversation")}</div>
    <div class="messages-thread-body" id="messages-thread-body"><p class="empty-state">Loading...</p></div>
    <form class="messages-thread-compose" id="messages-compose-form">
      <input type="text" id="messages-compose-input" placeholder="Message @${escapeHtml(otherProfile?.username ?? "")}" autocomplete="off" required>
      <button type="submit" class="btn">Send</button>
    </form>`;

  document.getElementById("back-to-list").addEventListener("click", (event) => {
    event.preventDefault();
    document.getElementById("messages-shell").classList.add("showing-list");
    document.getElementById("messages-shell").classList.remove("showing-thread");
  });

  const { data: messages, error } = await supabase
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  const bodyEl = document.getElementById("messages-thread-body");
  if (error) { bodyEl.innerHTML = `<p class="empty-state">Couldn't load messages: ${escapeHtml(error.message)}</p>`; return; }
  bodyEl.innerHTML = messages.map(renderMessage).join("");
  bodyEl.scrollTop = bodyEl.scrollHeight;

  await supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
  loadConversations();

  document.getElementById("messages-compose-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("messages-compose-input");
    const body = input.value.trim();
    if (!body) return;
    input.value = "";
    const { error: sendError } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: currentUser.id, body });
    if (sendError) alert("Couldn't send: " + sendError.message);
  });

  if (activeChannel) supabase.removeChannel(activeChannel);
  activeChannel = supabase
    .channel(`conversation-${conversationId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
      const message = payload.new;
      bodyEl.insertAdjacentHTML("beforeend", renderMessage(message));
      bodyEl.scrollTop = bodyEl.scrollHeight;
      if (message.sender_id !== currentUser.id) supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
      loadConversations();
    })
    .subscribe();
}

document.addEventListener("DOMContentLoaded", async () => {
  currentUser = await getCurrentUser();
  if (!currentUser) {
    document.getElementById("messages-list").innerHTML = `<p class="empty-state">Sign in to view your messages.</p>`;
    return;
  }
  await loadConversations();
  const hashConversation = window.location.hash.slice(1);
  if (hashConversation) openConversation(hashConversation);
});
