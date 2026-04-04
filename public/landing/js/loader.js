// ── LOADER: no-op shell — aktivacija je inline odmah nakon #loader diva ──────
// Ovaj fajl postoji samo da ne bude 404. Sva logika je u inline <script>
// tagu koji dolazi odmah nakon <div id="loader"> u svakom HTML fajlu.
(function() {
  // Osiguraj da je site-content vidljiv (legacy podrška)
  var sc = document.getElementById('site-content');
  if (sc) sc.classList.add('site-visible');
  document.body.style.overflow = '';
})();