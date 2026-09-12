/*
 * Applies the stored theme before first paint so the page never flashes the
 * wrong palette.
 *
 * This lives outside index.html on purpose: the production CSP forbids inline
 * scripts, so an inline <script> here would simply not run.
 */
try {
  var stored = localStorage.getItem('ft.theme') || 'dark'
  if (stored === 'auto') {
    stored = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  }
  document.documentElement.dataset.theme = stored
} catch (error) {
  document.documentElement.dataset.theme = 'dark'
}
