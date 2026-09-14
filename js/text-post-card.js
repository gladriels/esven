// Markup for a text-only post card, shared by the feed (app.js) and the
// share poster (share-card.js). The poster for a text post is a picture of
// this exact card, so both have to be built from the same elements — keeping
// one copy here means a change to the card in the feed shows up in the
// poster too, instead of the two slowly drifting apart.

function textPostEscape(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// Text-only cards size the title inversely to its length — short posts
// read as a bold statement, long ones stay bold but shrink to fit.
function titleFontSizeFor(text) {
  const mobile = window.innerWidth <= 600;
  const len = text.length;
  if (len <= 15) return mobile ? 22 : 32;
  if (len <= 30) return mobile ? 19 : 26;
  if (len <= 60) return mobile ? 16 : 21;
  if (len <= 100) return mobile ? 14 : 17;
  return mobile ? 12 : 14;
}

function textPostBodyHtml(r, likeButtonHtml = "") {
  return `
        <div class="ticket-text">
          ${r.spotify_url ? `<span class="ticket-song-badge" title="Song attached" aria-label="Song attached">${ICONS.music}</span>` : ""}
          ${likeButtonHtml}
          ${r.category ? `<span class="ticket-cat">${textPostEscape(r.category)}</span>` : ""}
          ${r.title ? `<h3 class="ticket-text-title" style="font-size: ${titleFontSizeFor(r.title)}px">${textPostEscape(r.title)}</h3>` : ""}
          ${r.description ? `<p class="ticket-text-desc">${textPostEscape(r.description)}</p>` : ""}
        </div>`;
}

function ticketFooterHtml(r) {
  return `
        <div class="ticket-footer">
          <span class="ticket-author">${r.profiles?.avatar_url ? `<img src="${r.profiles.avatar_url}" class="mini-avatar" width="36" height="36" loading="lazy" decoding="async">` : `<span class="mini-avatar mini-avatar-empty"></span>`}${r.profiles?.username ?? "someone"}</span>
          ${r.budget ? `<span class="ticket-budget">${textPostEscape(r.budget)}</span>` : "<span></span>"}
        </div>`;
}
