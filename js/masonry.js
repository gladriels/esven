// Real masonry layout using CSS Grid + JS-calculated row spans, instead of
// CSS multi-column (`columns:`) — Safari has a long-standing bug where
// multi-column layouts silently break when images load asynchronously and
// change an item's height after layout, leaving cards invisible while their
// absolutely-positioned children (like the delete button) still show. Grid
// doesn't have this bug.
//
// Performance note: measuring an element (getBoundingClientRect) forces the
// browser to flush pending style/layout work. Interleaving a measure and a
// write per card makes the browser re-layout the whole board once per card —
// with 20+ posts that's 20+ full layouts, which is what made the feed stutter
// and jump while images were arriving. So every pass here reads all the
// heights first, then writes all the spans, and every relayout request is
// coalesced into a single animation frame.

let masonryFramePending = false;

function layoutMasonryBoard(board) {
  const styles = getComputedStyle(board);
  const rowHeight = parseInt(styles.getPropertyValue("grid-auto-rows")) || 8;
  const rowGap = parseInt(styles.getPropertyValue("row-gap")) || parseInt(styles.getPropertyValue("gap")) || 18;

  const items = board.querySelectorAll(".ticket-wrap");

  // Read phase — no style writes in here, so this costs one layout, not one per card.
  const spans = [];
  items.forEach(item => {
    const contentHeight = item.getBoundingClientRect().height;
    spans.push(contentHeight ? Math.ceil((contentHeight + rowGap) / (rowHeight + rowGap)) : null);
  });

  // Write phase — only touch the ones that actually changed, so unchanged
  // cards don't get invalidated.
  items.forEach((item, i) => {
    const span = spans[i];
    if (span === null) return;
    const next = `span ${span}`;
    if (item.style.gridRowEnd !== next) item.style.gridRowEnd = next;
  });
}

function layoutAllMasonryBoards() {
  document.querySelectorAll(".board").forEach(layoutMasonryBoard);
}

// Every trigger (an image finishing, a batch of images finishing, fonts
// swapping in) funnels through here, so a feed of 20 images that all land
// within the same frame produces one layout pass instead of 20.
function scheduleMasonryLayout() {
  if (masonryFramePending) return;
  masonryFramePending = true;
  requestAnimationFrame(() => {
    masonryFramePending = false;
    layoutAllMasonryBoards();
  });
}

function watchImagesForMasonry(board) {
  board.querySelectorAll("img").forEach(img => {
    if (img.complete || img.dataset.masonryWatched) return;
    img.dataset.masonryWatched = "1";
    img.addEventListener("load", scheduleMasonryLayout, { once: true });
    img.addEventListener("error", scheduleMasonryLayout, { once: true });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const boards = document.querySelectorAll(".board");
  if (!boards.length) return;

  layoutAllMasonryBoards();
  boards.forEach(watchImagesForMasonry);

  // The feed re-renders its innerHTML whenever it loads or a filter changes,
  // so watch for that and re-measure each time. innerHTML on a board fires a
  // burst of mutation records; run the pass once on the next frame rather than
  // once per record (and without the old 60ms delay, which showed as a visible
  // flash of overlapping cards right after new posts rendered).
  boards.forEach(board => {
    const observer = new MutationObserver(() => {
      watchImagesForMasonry(board);
      scheduleMasonryLayout();
    });
    observer.observe(board, { childList: true });
  });

  // Only width changes affect the layout — mobile browsers fire resize on
  // every address-bar collapse, and relaying out for that is wasted work.
  let lastWidth = window.innerWidth;
  window.addEventListener("resize", () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    clearTimeout(window.__masonryResizeTimer);
    window.__masonryResizeTimer = setTimeout(layoutAllMasonryBoards, 150);
  });

  // Browsers freeze requestAnimationFrame in a backgrounded tab, so a feed
  // that finishes loading while the user is on another tab would come back to
  // unmeasured, overlapping cards. Catch up the moment the page is shown.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) layoutAllMasonryBoards();
  });

  // Custom @font-face fonts (Inter, IBM Plex Mono, Cormorant Garamond) can
  // finish downloading after the initial layout pass, especially on slow
  // mobile connections. That swap reflows card text without firing any of
  // the events above, leaving row spans stale and cards overlapping —
  // re-measure once web fonts are actually ready.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(scheduleMasonryLayout);
  }
});
