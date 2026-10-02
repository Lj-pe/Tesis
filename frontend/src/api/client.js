const API_BASE_URL = 'http://localhost:3000/api';

async function request(path, options = {}) {
  const { skipAuth = false, headers = {}, ...rest } = options;
  const token = localStorage.getItem('alanis_token');

  const finalHeaders = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (!skipAuth && token) {
    finalHeaders.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && data.message) ||
      'Error en la solicitud';

    throw new Error(message);
  }

  return data;
}

const apiClient = {
  get: (path, options = {}) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options = {}) =>
    request(path, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),
  put: (path, body, options = {}) =>
    request(path, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body ?? {}),
    }),
  delete: (path, options = {}) => request(path, { ...options, method: 'DELETE' }),
};

export default apiClient;
