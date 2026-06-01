// Resolve API base URL.
// - Dev: empty string → relative /api/* hits Vite's proxy to localhost:5174
// - All-in-one prod: empty string → relative /api/* hits the same Express server that serves dist/
// - Split prod (frontend on Vercel, backend on HF Space): set VITE_API_BASE=https://<space>.hf.space at build time
const RAW = import.meta.env.VITE_API_BASE || '';
export const API_BASE = RAW.replace(/\/+$/, '');

export function api(path) {
  return API_BASE + path;
}
