import axios from 'axios';

const root = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');
export const apiBase = `${root}/api`;

const KEY = 'eventqr_token';
export const getToken = () => {
  try { return localStorage.getItem(KEY); } catch { return null; }
};
export const setToken = (t) => {
  try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* storage blocked */ }
};

export const api = axios.create({ baseURL: apiBase, timeout: 30000 });

api.interceptors.request.use((cfg) => {
  const token = getToken();
  // Public pages (registration form, tickets) never send credentials.
  if (token && !String(cfg.url).startsWith('/public')) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const url = String(err.config?.url || '');
    if (err.response?.status === 401 && getToken() && !url.startsWith('/auth/login') && !url.startsWith('/public')) {
      setToken(null);
      window.dispatchEvent(new Event('eventqr:unauthorized'));
    }
    return Promise.reject(err);
  },
);

export const errMsg = (e) =>
  e?.response?.data?.error?.message ||
  (e?.code === 'ECONNABORTED' ? 'The server took too long to respond.' : null) ||
  (e?.request && !e?.response ? 'Cannot reach the server. Check your connection.' : null) ||
  e?.message ||
  'Something went wrong.';
export const errCode = (e) => e?.response?.data?.error?.code;
export const errDetails = (e) => e?.response?.data?.error?.details;

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Authenticated file download (CSV / XLSX / ZIP / PNG). */
export async function download(path, params, fallbackName) {
  try {
    const res = await api.get(path, { params, responseType: 'blob' });
    const m = /filename="?([^";]+)"?/.exec(res.headers['content-disposition'] || '');
    saveBlob(res.data, m?.[1] || fallbackName);
  } catch (err) {
    // With responseType blob, JSON error bodies arrive as a Blob. Unwrap so errMsg works.
    if (err.response?.data instanceof Blob) {
      try { err.response.data = JSON.parse(await err.response.data.text()); } catch { /* not json */ }
    }
    throw err;
  }
}
