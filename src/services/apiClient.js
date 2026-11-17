const TOKEN_KEY = 'taskly_token';

export class ApiError extends Error {
  constructor(message, { status = 500, code = 'API_ERROR', field = null, retryable = false, data = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.field = field;
    this.retryable = retryable;
    this.data = data;
  }
}

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore storage restriction
  }
}

export async function apiRequest(path, { method = 'GET', body, token, raw = false } = {}) {
  const activeToken = token !== undefined ? token : getStoredToken();
  const headers = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (activeToken) {
    headers.Authorization = `Bearer ${activeToken}`;
  }

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError('Tidak dapat terhubung ke server TASKLY. Periksa koneksi atau status server.', {
      status: 0,
      code: 'NETWORK_ERROR',
      retryable: true,
    });
  }

  if (raw) {
    if (!res.ok) {
      throw new ApiError('Gagal mengunduh berkas dari server.', { status: res.status, retryable: true });
    }
    return res.text();
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const errObj = data?.error || {};
    throw new ApiError(errObj.message || `Permintaan gagal (${res.status}).`, {
      status: res.status,
      code: errObj.code || 'REQUEST_FAILED',
      field: errObj.field || null,
      retryable: Boolean(errObj.retryable ?? res.status >= 500),
      data: errObj,
    });
  }

  return data;
}
