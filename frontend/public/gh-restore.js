/*
 * GitHub Pages ne sait pas servir une SPA (une route profonde renvoie 404.html).
 * 404.html redirige vers `/?/route/reelle` ; ce script restaure ensuite l'URL
 * dans l'historique du navigateur, sans rechargement.
 * Sur un hébergement Node (Render, Railway, VPS) ce script ne fait rien.
 */
(function (location) {
  var search = location.search || '';
  if (search.charAt(1) !== '/') return;

  var decoded = search
    .slice(1)
    .split('&')
    .map(function (segment) {
      return segment.replace(/~and~/g, '&');
    })
    .join('?');

  window.history.replaceState(null, null, location.pathname.slice(0, -1) + decoded + location.hash);
})(window.location);
