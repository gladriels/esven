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

async function signInWithPassword(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error;
}

async function signUpWithPassword(email, password, username) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/index.html`,
      data: { username }
    }
  });
  return { data, error };
}

function authErrorMessage(error, action) {
  if (!error) return action === "signup" ? "Check your email to confirm your account." : "Done.";
  const message = (error.message || "").toLowerCase();
  if (message.includes("rate limit") || message.includes("too many")) return "Too many attempts. Please wait a little and try again.";
  if (message.includes("password") && (message.includes("weak") || message.includes("at least"))) return "Use a stronger password with at least 8 characters.";
  if (action === "signup" && (message.includes("already registered") || message.includes("already exists"))) return "This email may already have an account. Try signing in instead.";
  if (action === "signin" && (message.includes("invalid") || message.includes("credentials"))) return "Invalid email or password.";
  return "Something went wrong. Please try again.";
}

function openSignupModal() {
  let modal = document.getElementById("signup-modal");
  if (modal) return;
  modal = document.createElement("div");
  modal.id = "signup-modal";
  modal.className = "new-request-panel open";
  modal.innerHTML = `
    <section class="new-request auth-panel">
      <button class="panel-close" id="signup-close-btn" aria-label="Close sign up">&times;</button>
      <h2>Create your account</h2>
      <p class="auth-help">Join Esven and start asking the community.</p>
      <form id="signup-form">
        <div class="field-row"><input type="text" id="signup-username" placeholder="Username" minlength="2" maxlength="30" required autocomplete="username" /></div>
        <div class="field-row"><input type="email" id="signup-email" placeholder="your@email.com" required autocomplete="email" /></div>
        <div class="field-row"><input type="password" id="signup-password" placeholder="Password (8+ characters)" minlength="8" required autocomplete="new-password" /></div>
        <button type="submit" class="btn" id="signup-submit">Create account</button>
        <p id="signup-status" class="login-status" role="status"></p>
      </form>
    </section>
  `;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
  document.getElementById("signup-close-btn").addEventListener("click", close);
  document.getElementById("signup-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = document.getElementById("signup-submit");
    const status = document.getElementById("signup-status");
    const username = document.getElementById("signup-username").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;
    submit.disabled = true;
    status.textContent = "Creating account...";
    const result = await signUpWithPassword(email, password, username);
    status.textContent = authErrorMessage(result.error, "signup");
    submit.disabled = false;
    if (!result.error) document.getElementById("signup-form").reset();
  });
}

async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + "/index.html"
  });
  return error;
}

async function signOut() {
  await supabase.auth.signOut();
  window.location.href = "index.html";
}

async function uploadAvatar(user, file) {
  const path = `avatars/${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
  const { error } = await supabase.storage.from("request-images").upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from("request-images").getPublicUrl(path);
  return data.publicUrl;
}

function openProfileModal(user, currentUsername, currentAvatar) {
  let modal = document.getElementById("profile-modal");
  if (modal) modal.remove();

  modal = document.createElement("div");
  modal.id = "profile-modal";
  modal.className = "new-request-panel open";
  modal.innerHTML = `
    <section class="new-request">
      <button class="panel-close" id="profile-close-btn">&times;</button>
      <h2>Edit profile</h2>
      <div class="field-row">
        <img id="avatar-preview" src="${currentAvatar || ''}" class="avatar-preview ${currentAvatar ? '' : 'avatar-preview-empty'}" />
      </div>
      <div class="field-row">
        <label class="upload-label" for="avatar-file">
          <span id="avatar-upload-text">Change photo</span>
        </label>
        <input type="file" id="avatar-file" accept="image/*" style="display:none;" />
      </div>
      <div class="field-row">
        <input type="text" id="profile-username" value="${currentUsername || ''}" placeholder="username" />
      </div>
      <button id="profile-save-btn" class="btn">Save</button>
    </section>
  `;
  document.body.appendChild(modal);

  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
  document.getElementById("profile-close-btn").addEventListener("click", () => modal.remove());

  let pendingFile = null;
  document.getElementById("avatar-file").addEventListener("change", (e) => {
    pendingFile = e.target.files[0];
    if (pendingFile) {
      const preview = document.getElementById("avatar-preview");
      preview.src = URL.createObjectURL(pendingFile);
      preview.classList.remove("avatar-preview-empty");
    }
  });

  document.getElementById("profile-save-btn").addEventListener("click", async () => {
    const newUsername = document.getElementById("profile-username").value.trim();
    const updates = {};
    if (newUsername) updates.username = newUsername;

    try {
      if (pendingFile) {
        updates.avatar_url = await uploadAvatar(user, pendingFile);
      }
      if (Object.keys(updates).length) {
        const { error } = await supabase.from("profiles").update(updates).eq("id", user.id);
        if (error) throw error;
      }
      modal.remove();
      renderAuthBar();
    } catch (err) {
      alert("Couldn't save: " + err.message);
    }
  });
}

function renderLoginShell(bar) {
  bar.innerHTML = `
    <form id="login-form" class="login-form">
      <input type="email" id="login-email" placeholder="your@email.com" required />
      <input type="password" id="login-password" placeholder="Password" minlength="6" autocomplete="current-password" />
      <button type="submit" class="btn" id="login-submit">Sign in</button>
    </form>
    <div class="login-options"><button type="button" class="link-btn" id="magic-link-btn">Email me a login link</button><button type="button" class="link-btn" id="reset-password-btn">Set or reset password</button></div>
    <div class="login-options"><button type="button" class="link-btn" id="signup-btn">Create an account</button></div>
    <span id="login-status" class="login-status" role="status"></span>
  `;
  const emailInput = document.getElementById("login-email");
  const passwordInput = document.getElementById("login-password");
  const status = document.getElementById("login-status");

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    status.textContent = "Signing in...";
    const error = await signInWithPassword(emailInput.value.trim(), passwordInput.value);
    status.textContent = error ? "Invalid email or password." : "Signed in.";
    if (!error) window.location.reload();
  });

  document.getElementById("signup-btn").addEventListener("click", openSignupModal);

  document.getElementById("magic-link-btn").addEventListener("click", async () => {
    status.textContent = "Sending...";
    const error = await sendMagicLink(emailInput.value.trim());
    status.textContent = error ? "Couldn’t send the link." : "Check your email for the link.";
  });

  document.getElementById("reset-password-btn").addEventListener("click", async () => {
    status.textContent = "Sending password setup email...";
    const error = await sendPasswordReset(emailInput.value.trim());
    status.textContent = error ? "Couldn’t send the password email." : "Check your email to create a password.";
  });
}

async function renderAuthBar() {
  const bar = document.getElementById("auth-bar");
  if (!bar) return;

  renderLoginShell(bar);
  const user = await getCurrentUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, avatar_url")
      .eq("id", user.id)
      .single();

    bar.innerHTML = `
      <button id="avatar-btn" class="avatar-btn">
        ${profile?.avatar_url
          ? `<img src="${profile.avatar_url}" class="avatar-thumb" />`
          : `<span class="avatar-thumb avatar-thumb-empty"></span>`}
        <span class="auth-user">@${profile?.username ?? "you"}</span>
      </button>
      <button id="signout-btn" class="btn btn-ghost">Sign out</button>
    `;
    document.getElementById("signout-btn").addEventListener("click", signOut);
    document.getElementById("avatar-btn").addEventListener("click", () => {
      openProfileModal(user, profile?.username, profile?.avatar_url);
    });
  }
}

document.addEventListener("DOMContentLoaded", renderAuthBar);
