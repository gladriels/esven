// Shared inline-SVG icon set for compact/icon-only UI (mobile header, like button, song badge).
const ICONS = {
  inbox: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h4l2 3h4l2-3h4"/><path d="M5.5 6h13a1 1 0 0 1 .97.757l1.53 6.12A1 1 0 0 1 20 14V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4a1 1 0 0 1 0-.12l1.53-6.13A1 1 0 0 1 5.5 6Z"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.6-10-9.4C.6 7.9 2.4 4.5 6 4c2.1-.3 4 .8 6 3.2C14 4.8 15.9 3.7 18 4c3.6.5 5.4 3.9 4 7.1-2.5 4.8-10 9.4-10 9.4Z"/></svg>`,
  music: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  pencil: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.8l-6.1 3.3 1.4-6.8-5.1-4.7 6.9-.8Z"/></svg>`,
};

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
document.addEventListener("DOMContentLoaded", syncHeaderHeightVar);
