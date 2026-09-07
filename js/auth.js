// Shared auth bar logic. Include after supabase-client.js on every page.


function isInstagramBrowser() {
  return /Instagram/i.test(navigator.userAgent);
}

async function completePasswordRecovery(password) {
  const { error } = await supabase.auth.updateUser({ password });
  return error;
}

function openPasswordRecoveryModal() {
  if (document.getElementById("password-recovery-modal")) return;
  const modal = document.createElement("div");
  modal.id = "password-recovery-modal";
  modal.className = "new-request-panel open";
  modal.innerHTML = `
    <section class="new-request">
      <button class="panel-close" type="button" data-close>&times;</button>
      <h2>Create your password</h2>
      <p class="field-hint">Choose a password with at least 6 characters. You will stay signed in after saving it.</p>
      <form id="password-recovery-form">
        <div class="field-row"><input id="new-password" type="password" minlength="6" autocomplete="new-password" placeholder="New password" required></div>
        <div class="field-row"><input id="confirm-password" type="password" minlength="6" autocomplete="new-password" placeholder="Confirm password" required></div>
        <button class="btn" type="submit">Save password</button>
        <span id="password-recovery-status" class="login-status"></span>
      </form>
    </section>`;
  document.body.appendChild(modal);
  modal.querySelector("[data-close]").onclick = () => modal.remove();
  modal.addEventListener("click", (event) => { if (event.target === modal) modal.remove(); });
  modal.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = modal.querySelector("#new-password").value;
    const confirmation = modal.querySelector("#confirm-password").value;
    const status = modal.querySelector("#password-recovery-status");
    if (password !== confirmation) { status.textContent = "Passwords do not match."; return; }
    status.textContent = "Saving...";
    const error = await completePasswordRecovery(password);
    if (error) { status.textContent = error.message; return; }
    status.textContent = "Password saved. You are signed in.";
    window.setTimeout(() => { modal.remove(); window.history.replaceState({}, document.title, window.location.pathname); window.location.reload(); }, 700);
  });
}

function renderInstagramBrowserPrompt() {
  if (!isInstagramBrowser() || document.getElementById("instagram-browser-prompt")) return;
  const prompt = document.createElement("aside");
  prompt.id = "instagram-browser-prompt";
  prompt.className = "instagram-browser-prompt";
  prompt.innerHTML = `<strong>For a longer sign-in</strong><span>Instagram may clear this browser's session. Tap ⋯ then <em>Open in browser</em>.</span><button type="button">Copy link</button>`;
  prompt.querySelector("button").onclick = async () => {
    try { await navigator.clipboard.writeText(window.location.href); prompt.querySelector("button").textContent = "Link copied"; }
    catch (_) { prompt.querySelector("button").textContent = "Copy this page's link"; }
  };
  document.body.appendChild(prompt);
}

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

async function signUpWithPassword(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin + "/index.html" }
  });
  return { data, error };
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

function openAvatarCropper(file, onCrop) {
  const source = URL.createObjectURL(file);
  const modal = document.createElement("div");
  modal.className = "image-crop-modal";
  modal.innerHTML = `<div class="image-crop-dialog avatar-crop-dialog"><button type="button" class="panel-close" data-cancel>&times;</button><h2>Position your photo</h2><p class="field-hint">Drag to move. Use the slider to zoom.</p><div class="avatar-crop-frame"><img alt="Avatar crop preview"></div><input class="avatar-crop-zoom" type="range" min="1" max="3" value="1" step="0.01" aria-label="Zoom photo"><div class="image-crop-actions"><button type="button" class="btn btn-ghost" data-cancel>Cancel</button><button type="button" class="btn" data-save>Use photo</button></div></div>`;
  document.body.appendChild(modal);
  const image = modal.querySelector("img"), frame = modal.querySelector(".avatar-crop-frame"), zoom = modal.querySelector("input");
  let scale = 1, x = 0, y = 0, startX = 0, startY = 0, dragging = false;
  const draw = () => { image.style.transform = `translate(${x}px, ${y}px) scale(${scale})`; };
  const bounds = () => { const size = frame.clientWidth; const naturalRatio = image.naturalWidth / image.naturalHeight; const base = naturalRatio >= 1 ? size / image.naturalHeight : size / image.naturalWidth; const width = image.naturalWidth * base * scale, height = image.naturalHeight * base * scale; x = Math.min(Math.max(x, (size - width) / 2), (width - size) / 2); y = Math.min(Math.max(y, (size - height) / 2), (height - size) / 2); };
  image.onload = () => { bounds(); draw(); };
  image.src = source;
  zoom.oninput = () => { scale = Number(zoom.value); bounds(); draw(); };
  frame.onpointerdown = (event) => { dragging = true; startX = event.clientX - x; startY = event.clientY - y; frame.setPointerCapture(event.pointerId); };
  frame.onpointermove = (event) => { if (!dragging) return; x = event.clientX - startX; y = event.clientY - startY; bounds(); draw(); };
  frame.onpointerup = () => { dragging = false; };
  modal.querySelectorAll("[data-cancel]").forEach(button => button.onclick = () => { URL.revokeObjectURL(source); modal.remove(); });
  modal.querySelector("[data-save]").onclick = () => { const size = 512, canvas = document.createElement("canvas"); canvas.width = canvas.height = size; const frameSize = frame.clientWidth, naturalRatio = image.naturalWidth / image.naturalHeight; const base = naturalRatio >= 1 ? frameSize / image.naturalHeight : frameSize / image.naturalWidth; const rendered = base * scale; canvas.getContext("2d").drawImage(image, ((frameSize - image.naturalWidth * rendered) / 2 + x) * size / frameSize, ((frameSize - image.naturalHeight * rendered) / 2 + y) * size / frameSize, image.naturalWidth * rendered * size / frameSize, image.naturalHeight * rendered * size / frameSize); canvas.toBlob(blob => { onCrop(new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" })); URL.revokeObjectURL(source); modal.remove(); }, "image/jpeg", .9); };
}

function openProfileModal(user, currentUsername, currentAvatar) {
  let modal = document.getElementById("profile-modal"); if (modal) modal.remove();
  modal = document.createElement("div"); modal.id = "profile-modal"; modal.className = "new-request-panel open";
  modal.innerHTML = `<section class="new-request"><button class="panel-close" id="profile-close-btn">&times;</button><h2>Edit profile</h2><div class="field-row"><img id="avatar-preview" src="${currentAvatar || ''}" class="avatar-preview ${currentAvatar ? '' : 'avatar-preview-empty'}" /></div><div class="field-row"><label class="upload-label" for="avatar-file"><span>Change photo</span></label><input type="file" id="avatar-file" accept="image/*" style="display:none;" /></div><div class="field-row"><input type="text" id="profile-username" value="${currentUsername || ''}" placeholder="username" /></div><button id="profile-save-btn" class="btn">Save</button></section>`;
  document.body.appendChild(modal); modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); }); document.getElementById("profile-close-btn").onclick = () => modal.remove();
  let pendingFile = null;
  document.getElementById("avatar-file").onchange = e => { const file = e.target.files[0]; if (!file) return; openAvatarCropper(file, cropped => { pendingFile = cropped; const preview = document.getElementById("avatar-preview"); preview.src = URL.createObjectURL(cropped); preview.classList.remove("avatar-preview-empty"); }); };
  document.getElementById("profile-save-btn").onclick = async () => { const username = document.getElementById("profile-username").value.trim(), updates = {}; if (username) updates.username = username; try { if (pendingFile) updates.avatar_url = await uploadAvatar(user, pendingFile); if (Object.keys(updates).length) { const { error } = await supabase.from("profiles").update(updates).eq("id", user.id); if (error) throw error; } modal.remove(); renderAuthBar(); } catch (err) { alert("Couldn't save: " + err.message); } };
}
function renderLoginShell(bar) {
  bar.innerHTML = `
    <div class="auth-entry-actions">
      <button type="button" class="btn btn-ghost" id="show-signin-btn">Sign in</button>
      <button type="button" class="btn" id="show-signup-btn">Sign up</button>
    </div>
  `;

  const openPanel = (mode) => {
    const isSignUp = mode === "signup";
    const panel = document.createElement("div");
    panel.className = "new-request-panel open";
    panel.id = "auth-panel";
    panel.innerHTML = `
      <section class="new-request auth-panel-card">
        <button class="panel-close" type="button" data-close>&times;</button>
        <p class="auth-panel-eyebrow">Esven</p>
        <h2>${isSignUp ? "Create your account" : "Welcome back"}</h2>
        <p class="field-hint">${isSignUp ? "Join to post requests and share recommendations." : "Sign in with your email and password."}</p>
        <form id="auth-panel-form">
          <div class="field-row"><input type="email" id="auth-email" placeholder="Email address" autocomplete="email" required></div>
          <div class="field-row"><input type="password" id="auth-password" placeholder="Password" minlength="6" autocomplete="${isSignUp ? "new-password" : "current-password"}" required></div>
          <button type="submit" class="btn auth-submit">${isSignUp ? "Create account" : "Sign in"}</button>
          <span id="auth-panel-status" class="login-status"></span>
        </form>
        ${isSignUp ? `<p class="auth-panel-switch">Already a member? <button type="button" class="link-btn" data-switch>Sign in</button></p>` : `<p class="auth-panel-switch"><button type="button" class="link-btn" data-forgot-password>Forgot password?</button><br>New to Esven? <button type="button" class="link-btn" data-switch>Create an account</button></p>`}
      </section>`;
    document.body.appendChild(panel);
    panel.querySelector("[data-close]").onclick = () => panel.remove();
    panel.addEventListener("click", (event) => { if (event.target === panel) panel.remove(); });
    panel.querySelector("[data-switch]").onclick = () => { panel.remove(); openPanel(isSignUp ? "signin" : "signup"); };
    const forgotPassword = panel.querySelector("[data-forgot-password]");
    if (forgotPassword) forgotPassword.onclick = async () => {
      const email = panel.querySelector("#auth-email").value.trim();
      const status = panel.querySelector("#auth-panel-status");
      if (!email) { status.textContent = "Enter your email first."; return; }
      status.textContent = "Sending password recovery email...";
      const error = await sendPasswordReset(email);
      status.textContent = error ? error.message : "Check your email to create a new password.";
    };
    panel.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = panel.querySelector("#auth-email").value.trim();
      const password = panel.querySelector("#auth-password").value;
      const status = panel.querySelector("#auth-panel-status");
      status.textContent = isSignUp ? "Creating account..." : "Signing in...";
      if (isSignUp) {
        const { data, error } = await signUpWithPassword(email, password);
        if (error) { status.textContent = error.message; return; }
        status.textContent = data.session ? "Account created. You are signed in." : "We sent a confirmation link. Check Inbox and Spam, then return here to sign in.";
        if (data.session) window.location.reload();
        return;
      }
      const error = await signInWithPassword(email, password);
      if (error) { status.textContent = "Invalid email or password."; return; }
      window.location.reload();
    });
  };

  document.getElementById("show-signin-btn").onclick = () => openPanel("signin");
  document.getElementById("show-signup-btn").onclick = () => openPanel("signup");
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
        ${profile?.avatar_url ? `<img src="${profile.avatar_url}" class="avatar-thumb" />` : `<span class="avatar-thumb avatar-thumb-empty"></span>`}
        <span class="auth-user">@${profile?.username ?? "you"}</span>
      </button>
      <button id="edit-profile-btn" class="btn btn-ghost">Edit</button>
      <button id="signout-btn" class="btn btn-ghost">Sign out</button>
    `;
    document.getElementById("signout-btn").addEventListener("click", signOut);
    document.getElementById("avatar-btn").onclick = () => { window.location.href = `profile.html#${encodeURIComponent(profile?.username ?? "")}`; };
    document.getElementById("edit-profile-btn").onclick = () => openProfileModal(user, profile?.username, profile?.avatar_url);
  }
}

supabase.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") openPasswordRecoveryModal();
});

document.addEventListener("DOMContentLoaded", async () => {
  renderInstagramBrowserPrompt();
  await renderAuthBar();
  const { data: { session } } = await supabase.auth.getSession();
  if (session && window.location.hash.includes("type=recovery")) openPasswordRecoveryModal();
});
