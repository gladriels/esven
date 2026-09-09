// Offers to enable Web Push notifications once a user is signed in, and keeps
// their push subscription saved. Include after supabase-client.js, auth.js,
// and push-config.js.

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && window.ESVEN_VAPID_PUBLIC_KEY;
}

async function saveSubscription(user, subscription) {
  const json = subscription.toJSON();
  await supabase.from("push_subscriptions").upsert({
    user_id: user.id,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth_key: json.keys.auth
  }, { onConflict: "endpoint" });
}

async function enablePushNotifications(user) {
  const registration = await navigator.serviceWorker.register("/sw.js");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(window.ESVEN_VAPID_PUBLIC_KEY)
    });
  }
  await saveSubscription(user, subscription);
  return true;
}

function renderPushPrompt(user) {
  if (localStorage.getItem("esven-push-prompt-dismissed")) return;
  if (document.getElementById("push-prompt")) return;

  const prompt = document.createElement("aside");
  prompt.id = "push-prompt";
  prompt.className = "push-prompt";
  prompt.innerHTML = `<span>Get notified the moment someone messages you.</span><div class="push-prompt-actions"><button type="button" class="btn" id="push-enable-btn">Enable notifications</button><button type="button" class="btn btn-ghost" id="push-dismiss-btn">Not now</button></div>`;
  document.body.appendChild(prompt);

  document.getElementById("push-dismiss-btn").onclick = () => {
    localStorage.setItem("esven-push-prompt-dismissed", "1");
    prompt.remove();
  };
  document.getElementById("push-enable-btn").onclick = async () => {
    prompt.remove();
    localStorage.setItem("esven-push-prompt-dismissed", "1");
    try { await enablePushNotifications(user); } catch (err) { console.error("Couldn't enable notifications", err); }
  };
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!pushSupported()) return;
  const user = await getCurrentUser();
  if (!user) return;
  if (Notification.permission === "granted") {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();
      if (existing) await saveSubscription(user, existing);
    } catch (err) { console.error("Couldn't refresh push subscription", err); }
    return;
  }
  if (Notification.permission === "default") renderPushPrompt(user);
});
