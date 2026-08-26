// All backend calls live here, so the rest of the app never builds a URL.
//
// These paths are relative on purpose. The browser requests
// http://localhost:5173/api/styles, and Vite's dev proxy (see vite.config.js)
// forwards anything under /api to the Express server on :4000. That keeps the
// frontend same-origin in development, so there are no CORS preflights and no
// API host baked into the bundle.

export async function fetchStyles(signal) {
  const res = await fetch('/api/styles', { signal });
  if (!res.ok) {
    throw new Error(`Could not load styles (HTTP ${res.status})`);
  }
  const data = await res.json();
  return data.styles;
}
