// Shared inline-SVG icon set for compact/icon-only UI (mobile header, like
// button, song badge). Thin, rounded line-art — consistent weight across
// the set for a more refined feel.
const ICON_STROKE = 1.6;
const ICONS = {
  inbox: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5h3.6l1.7 2.6h4.4l1.7-2.6h3.6"/><path d="M6.2 6.2h11.6a1 1 0 0 1 .96.73l1.68 6a1 1 0 0 1 .04.27V17a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2v-3.8a1 1 0 0 1 .04-.27l1.68-6a1 1 0 0 1 .96-.73Z"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7.2-4.4-9.6-9C.8 7.6 2.5 4.4 6 3.9c2-.3 3.9.7 6 3.1 2.1-2.4 4-3.4 6-3.1 3.5.5 5.2 3.7 3.6 7.1-2.4 4.6-9.6 9-9.6 9Z"/></svg>`,
  music: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18.2V5.6L21 3.5v12.7"/><circle cx="6.2" cy="18.2" r="2.8"/><circle cx="18.2" cy="16.2" r="2.8"/></svg>`,
  pencil: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 20.5H4.5v-7l10.7-10.7a1.4 1.4 0 0 1 2 0l2.3 2.3a1.4 1.4 0 0 1 0 2Z"/><path d="M13.5 5.5l3.5 3.5"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 20.5H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h3.5"/><path d="M15.5 16.5l4.5-4.5-4.5-4.5"/><path d="M20 12H9.5"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.7 5.9 6.3.7-4.7 4.4 1.3 6.3L12 17.2l-5.6 3.1 1.3-6.3-4.7-4.4 6.3-.7Z"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/></svg>`,
  eyeOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 3.5l17 17"/><path d="M10.6 5.7c.45-.1.9-.15 1.4-.15 6 0 9.5 6.5 9.5 6.5a15.4 15.4 0 0 1-3.3 4.1M6.5 6.9A15.6 15.6 0 0 0 2.5 12s3.5 6.5 9.5 6.5c1.3 0 2.5-.3 3.6-.85"/><path d="M9.9 10.1a2.8 2.8 0 0 0 3.9 3.9"/></svg>`,
};

// A compact monogram + wordmark, used wherever the plain text logo used to
// sit — same markup on every page so it always renders identically.
const LOGO_MARK_SVG = `<svg class="logo-mark" viewBox="0 0 32 32" width="24" height="24" fill="none"><circle cx="16" cy="16" r="14" stroke="currentColor" stroke-width="1.1"/><path d="M10.5 11h11M10.5 16h7.5M10.5 21h11" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
const LOGO_INNER_HTML = `${LOGO_MARK_SVG}<span class="logo-word">Esven</span>`;

// Keeps a `--header-h` custom property on <html> in sync with the real,
// rendered height of the page's fixed/sticky header so content never
// starts underneath it (heights change a lot between logged-in/out and
// mobile/desktop layouts).
function syncHeaderHeightVar() {
  const header = document.querySelector("header.site-header, .landing-header");
  if (!header) return;
  const setVar = () => {
    document.documentElement.style.setProperty("--header-h", `${Math.ceil(header.getBoundingClientRect().height) + 18}px`);
  };
  setVar();
  if (window.ResizeObserver) {
    new ResizeObserver(setVar).observe(header);
  } else {
    window.addEventListener("resize", setVar);
  }
}

function renderLogoMarks() {
  document.querySelectorAll(".logo, .landing-logo").forEach(el => {
    if (el.dataset.logoRendered) return;
    el.dataset.logoRendered = "1";
    el.innerHTML = LOGO_INNER_HTML;
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderLogoMarks();
  syncHeaderHeightVar();
});
