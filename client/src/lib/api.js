const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'ERROR', details = [] } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = Array.isArray(details) ? details : [];
  }

  /** Message for a specific form field, if the server flagged one. */
  fieldError(field) {
    return this.details.find((detail) => detail.field === field)?.message ?? null;
  }

  get isNetwork() {
    return this.status === 0;
  }

  get isAuth() {
    return this.status === 401;
  }
}

async function request(path, { method = 'GET', body, formData, signal } = {}) {
  const options = {
    method,
    credentials: 'same-origin',
    signal,
    headers: {},
  };

  if (formData) {
    options.body = formData;
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${BASE}${path}`, options);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(
      'We could not reach ChargeNeighbor. Check your connection and try again.',
      { code: 'NETWORK' },
    );
  }

  const raw = await response.text();
  let payload = {};
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new ApiError('The server returned an unexpected response. Please try again.', {
        status: response.status,
        code: 'BAD_RESPONSE',
      });
    }
  }

  if (!response.ok) {
    const info = payload?.error ?? {};
    throw new ApiError(info.message || `Request failed (${response.status}).`, {
      status: response.status,
      code: info.code || 'ERROR',
      details: info.details,
    });
  }

  return payload;
}

export const api = {
  get: (path, options) => request(path, options),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  del: (path, body, options) => request(path, { ...options, method: 'DELETE', body }),
  upload: (path, formData) => request(path, { method: 'POST', formData }),
};

export const errorMessage = (error) =>
  error instanceof ApiError ? error.message : 'Something unexpected went wrong.';
