// ── INTRO DISABLED ───────────────────────────────────────────────────────────
// Cinematic intro sequence removed for better UX (instant page load).
// This file is kept as a no-op so existing <script> tags don't 404.
(function() {
  // Immediately ensure site content is visible and body scroll is unlocked
  var siteContent = document.getElementById('site-content');
  if (siteContent) siteContent.classList.add('site-visible');
  document.body.style.overflow = '';
})();