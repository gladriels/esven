// Real masonry layout using CSS Grid + JS-calculated row spans, instead of
// CSS multi-column (`columns:`) — Safari has a long-standing bug where
// multi-column layouts silently break when images load asynchronously and
// change an item's height after layout, leaving cards invisible while their
// absolutely-positioned children (like the delete button) still show. Grid
// doesn't have this bug.

function layoutMasonryBoard(board) {
  const styles = getComputedStyle(board);
  const rowHeight = parseInt(styles.getPropertyValue("grid-auto-rows")) || 8;
  const rowGap = parseInt(styles.getPropertyValue("row-gap")) || parseInt(styles.getPropertyValue("gap")) || 18;

  board.querySelectorAll(".ticket-wrap").forEach(item => {
    const contentHeight = item.getBoundingClientRect().height;
    if (!contentHeight) return;
    const span = Math.ceil((contentHeight + rowGap) / (rowHeight + rowGap));
    item.style.gridRowEnd = `span ${span}`;
  });
}

function layoutAllMasonryBoards() {
  document.querySelectorAll(".board").forEach(layoutMasonryBoard);
}

function watchImagesForMasonry(board) {
  board.querySelectorAll("img").forEach(img => {
    if (img.complete) return;
    img.addEventListener("load", layoutAllMasonryBoards, { once: true });
    img.addEventListener("error", layoutAllMasonryBoards, { once: true });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const boards = document.querySelectorAll(".board");
  if (!boards.length) return;

  layoutAllMasonryBoards();
  boards.forEach(watchImagesForMasonry);

  // The feed re-renders its innerHTML whenever it loads or a filter changes,
  // so watch for that and re-measure each time.
  boards.forEach(board => {
    const observer = new MutationObserver(() => {
      clearTimeout(window.__masonryDebounce);
      window.__masonryDebounce = setTimeout(() => {
        layoutAllMasonryBoards();
        watchImagesForMasonry(board);
      }, 60);
    });
    observer.observe(board, { childList: true });
  });

  window.addEventListener("resize", () => {
    clearTimeout(window.__masonryResizeTimer);
    window.__masonryResizeTimer = setTimeout(layoutAllMasonryBoards, 150);
  });
});
