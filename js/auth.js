// Shared auth bar logic. Include after supabase-client.js on every page.

async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + "/index.html" }
  });
  return error;
}

async function signOut() {
  await supabase.auth.signOut();
  window.location.href = "index.html";
}

async function renderAuthBar() {
  const bar = document.getElementById("auth-bar");
  if (!bar) return;

  const user = await getCurrentUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single();

    bar.innerHTML = `
      <span class="auth-user">@${profile?.username ?? "you"}</span>
      <button id="signout-btn" class="btn btn-ghost">Sign out</button>
    `;
    document.getElementById("signout-btn").addEventListener("click", signOut);
  } else {
    bar.innerHTML = `
      <form id="login-form" class="login-form">
        <input type="email" id="login-email" placeholder="your@email.com" required />
        <button type="submit" class="btn">Send login link</button>
      </form>
      <span id="login-status" class="login-status"></span>
    `;
    document.getElementById("login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("login-email").value;
      const status = document.getElementById("login-status");
      status.textContent = "Sending...";
      const error = await sendMagicLink(email);
      status.textContent = error ? "Error: " + error.message : "Check your email for the link.";
    });
  }
}

document.addEventListener("DOMContentLoaded", renderAuthBar);
