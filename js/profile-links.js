// Finds "@username" text already on the page (in feed cards, recommendation
// cards, the solved grid, etc.) and turns it into a link to that person's
// profile page — without needing to touch app.js / request.js / landing.js
// directly. Runs repeatedly as content loads in, since most of it renders
// asynchronously after a database fetch.

function usernameFromText(text) {
  const match = text.match(/@([a-zA-Z0-9_.]+)/);
  return match ? match[1] : null;
}

function linkifyUsernamesIn(root) {
  const selectors = [".ticket-author", ".solved-sub", ".rec-footer span:first-child"];
  selectors.forEach(sel => {
    root.querySelectorAll(sel).forEach(el => {
      if (el.dataset.linkified) return;
      const username = usernameFromText(el.textContent || "");
      if (!username) return;

      el.dataset.linkified = "1";
      const link = document.createElement("a");
      link.href = `profile.html#${encodeURIComponent(username)}`;
      link.style.color = "inherit";
      link.style.textDecoration = "none";
      link.style.cursor = "pointer";
      while (el.firstChild) link.appendChild(el.firstChild);
      el.appendChild(link);
    });
  });
}

const usernameLinkObserver = new MutationObserver(() => linkifyUsernamesIn(document));
usernameLinkObserver.observe(document.body, { childList: true, subtree: true });
document.addEventListener("DOMContentLoaded", () => linkifyUsernamesIn(document));
