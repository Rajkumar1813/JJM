import axios from 'axios';

export const PRODUCTION_BACKEND_URL =
  (import.meta as any).env?.VITE_API_URL || 'https://jjm-advertising.onrender.com';

export const getActiveBackendUrl = (): string => {
  return PRODUCTION_BACKEND_URL;
};

// ─── Token Management ────────────────────────────────────────────────────────
export const getAdminToken = (): string | null => {
  try {
    return localStorage.getItem('jjm_auth_token');
  } catch {
    return null;
  }
};

export const setAdminToken = (token: string) => {
  try {
    localStorage.setItem('jjm_auth_token', token);
  } catch {}
};

export const clearAdminToken = () => {
  try {
    localStorage.removeItem('jjm_auth_token');
    localStorage.removeItem('jjm_auth_user');
  } catch {}
};

// ─── Axios Instance ──────────────────────────────────────────────────────────
export const api = axios.create({
  baseURL: `${getActiveBackendUrl()}/api`,
  timeout: 15000,
  withCredentials: true,
});

// Attach auth token to every request
api.interceptors.request.use((config) => {
  config.baseURL = `${getActiveBackendUrl()}/api`;
  const token = getAdminToken();
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally — clear session and redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearAdminToken();
      // Let the app re-render the Login screen
      window.dispatchEvent(new Event('jjm:auth:expired'));
    }
    return Promise.reject(error);
  }
);

export const getBackendBaseUrl = () => getActiveBackendUrl();
